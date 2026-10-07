import { createHash } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";

import {
  FIRST_PARTY_NOTIFICATION_ROUTE_POLICY_VERSION,
  FIRST_PARTY_PUSH_DEVICE_STALE_AFTER_DAYS,
  FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER,
  type OrderFirstPartyNotificationRoute,
  type PassengerPushDevicePlatform,
  type PassengerPushDeviceProvider,
  type PassengerPushDeviceRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db/database.service";

export interface RegisterPassengerPushDeviceCommand {
  drtsPassengerId: string;
  platform: PassengerPushDevicePlatform;
  provider: PassengerPushDeviceProvider;
  appId: string;
  appVersion: string;
  token: string;
  notificationConsentVersion: string;
  /**
   * Set only when a device is renewing its own previously issued device_id
   * with a freshly rotated token (D4 "token 輪替"). The caller is the only
   * party that knows this — the server never infers rotation from the new
   * token's hash alone, since a different token hashes to a different
   * value and cannot be correlated to a prior row by content. The previous
   * row is revoked in the same transaction that inserts the new one;
   * content identity (token/token_sha256) is never overwritten in place.
   */
  previousDeviceId?: string;
}

export type WriteFirstPartyRouteCommand = Omit<
  OrderFirstPartyNotificationRoute,
  "notificationPolicyVersion" | "createdAt"
>;

export type WriteFirstPartyRouteResult =
  | { outcome: "created"; route: OrderFirstPartyNotificationRoute }
  | { outcome: "idempotent_replay"; route: OrderFirstPartyNotificationRoute }
  | { outcome: "rejected_partner_route_exists" }
  | { outcome: "rejected_content_mismatch" };

type DeviceRow = QueryResultRow & {
  device_id: string;
  drts_passenger_id: string;
  platform: PassengerPushDeviceRecord["platform"];
  provider: PassengerPushDeviceRecord["provider"];
  app_id: string;
  app_version: string;
  token_sha256: string;
  status: PassengerPushDeviceRecord["status"];
  status_reason: string | null;
  notification_consent_version: string;
  registered_at: Date | string;
  last_seen_at: Date | string | null;
  invalidated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type FirstPartyRouteRow = QueryResultRow & {
  order_id: string;
  tenant_id: string;
  drts_passenger_id: string;
  passenger_subject_ref: string;
  app_id: string;
  notification_policy_version: string;
  consent_version: string;
  ride_ref: string;
  created_at: Date | string;
};

/**
 * F3 rework (PUSH-FIRST-PARTY-REGISTRY-20261006, reviewer Codex reopen
 * 2026-10-06): a raw pg error's `detail`/`message` can embed the failing
 * row's content (token, token_sha256) — e.g. a CHECK-constraint violation's
 * `detail` is "Failing row contains (...)". `throw error` surfaced that
 * whole object (including `.detail`) to the caller. Every device/route
 * mutation now throws this instead: it keeps the pg error `code` (useful,
 * never sensitive) but drops `message`/`detail`/`hint`/`cause` entirely.
 */
export class PassengerPushDeviceOperationError extends Error {
  readonly code: string | undefined;

  constructor(code?: string) {
    super("passenger_push_device_operation_failed");
    this.name = "PassengerPushDeviceOperationError";
    this.code = code;
  }
}

function toSafeOperationError(error: unknown): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  return new PassengerPushDeviceOperationError(code);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}

const DEVICE_COLUMNS = `
  device_id, drts_passenger_id, platform, provider, app_id, app_version,
  token_sha256, status, status_reason, notification_consent_version,
  registered_at, last_seen_at, invalidated_at, created_at, updated_at
`;

/**
 * D4 — first-party passenger push device registry and the D5 first-party
 * order route snapshot. No HTTP surface calls into this repository this
 * wave (SD-DP-20260422-001); it exists so the schema and lifecycle rules
 * are in place before any first-party caller does.
 *
 * Privacy boundary: `token` is write-only here. Every read path (mapping,
 * logging, thrown errors) only ever surfaces `deviceId` or
 * `tokenSha256` — never the raw token, and never the full `tokenSha256`
 * in a log line (only its first 8 characters, per D4).
 */
@Injectable()
export class PassengerPushDevicesRepository {
  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  private mapDeviceRow(row: DeviceRow): PassengerPushDeviceRecord {
    return {
      deviceId: row.device_id,
      drtsPassengerId: row.drts_passenger_id,
      platform: row.platform,
      provider: row.provider,
      appId: row.app_id,
      appVersion: row.app_version,
      tokenSha256: row.token_sha256,
      status: row.status,
      statusReason: row.status_reason,
      notificationConsentVersion: row.notification_consent_version,
      registeredAt: toIso(row.registered_at),
      lastSeenAt: toIsoOrNull(row.last_seen_at),
      invalidatedAt: toIsoOrNull(row.invalidated_at),
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }

  private mapRouteRow(row: FirstPartyRouteRow): OrderFirstPartyNotificationRoute {
    return {
      orderId: row.order_id,
      tenantId: row.tenant_id,
      drtsPassengerId: row.drts_passenger_id,
      passengerSubjectRef: row.passenger_subject_ref,
      appId: row.app_id,
      notificationPolicyVersion:
        row.notification_policy_version as typeof FIRST_PARTY_NOTIFICATION_ROUTE_POLICY_VERSION,
      consentVersion: row.consent_version,
      rideRef: row.ride_ref,
      createdAt: toIso(row.created_at),
    };
  }

  /**
   * Upserts a device by `token_sha256`. Three outcomes, keyed by whatever
   * the (provider, token_sha256) active row currently says, per D4:
   *   - no active row for this hash, no `previousDeviceId` given: brand new
   *     device, inserted active with `last_seen_at = NULL` (unseen until
   *     the first `touchDevice`).
   *   - active row exists for the *same* passenger: idempotent
   *     re-registration — metadata refreshed in place, no new row.
   *   - active row exists for a *different* passenger: rebind — the prior
   *     row is revoked (never deleted or content-overwritten) and a new
   *     row is inserted for the new passenger.
   * `previousDeviceId`, when given, additionally revokes that specific
   * prior row (token rotation) regardless of the above, since it is keyed
   * by device_id rather than by the new token's hash.
   */
  async registerDevice(
    command: RegisterPassengerPushDeviceCommand,
  ): Promise<PassengerPushDeviceRecord> {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const tokenSha256 = createHash("sha256").update(command.token).digest("hex");
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      // F5 rework (Codex reopen 2026-10-07): per-passenger and per-token
      // advisory locks (the earlier F2 fix) only serialize calls that share
      // a passenger or a token. `enforceActiveDeviceCap` below reads and can
      // revoke *any* currently-active row for `command.drtsPassengerId` —
      // including a row that a concurrent registerDevice call for a
      // *different* passenger is in the middle of rebinding away (that row
      // still carries the old passenger_id until the other transaction
      // commits). Two such calls — each rebinding the other's oldest device
      // — each lock their own rebind row first and then block on the cap
      // UPDATE trying to touch the row the other transaction is rebinding,
      // forming a wait cycle `FOR UPDATE`/`UPDATE` locks alone can't avoid:
      // the set of rows a call might need to touch for its cap check is only
      // known once that call is already running, so no fixed set of
      // per-passenger/per-token locks taken up front can cover it.
      //
      // The only way to rule the cycle out structurally, without weakening
      // the cap policy, deleting history, or retrying a half-applied
      // mutation, is to forbid any two registerDevice transactions from
      // being in flight at the same time. One fixed-key advisory lock,
      // acquired before any row read or write and held for the whole
      // transaction, does that: it fully serializes registerDevice across
      // every passenger and token, so the cap SELECT inside it only ever
      // observes fully-committed state from prior calls and never a row a
      // sibling transaction is still holding. This also subsumes the F2 fix
      // (same-token races across passengers), so the two narrower locks are
      // gone.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["passenger-push-device-register"],
      );

      if (command.previousDeviceId) {
        await client.query(
          `
            UPDATE iam.phase1_passenger_push_devices
            SET status = 'revoked',
                status_reason = 'token_rotated',
                updated_at = now()
            WHERE device_id = $1 AND status = 'active'
          `,
          [command.previousDeviceId],
        );
      }

      const existing = await client.query<DeviceRow>(
        `
          SELECT ${DEVICE_COLUMNS}
          FROM iam.phase1_passenger_push_devices
          WHERE provider = $1 AND token_sha256 = $2 AND status = 'active'
          FOR UPDATE
        `,
        [command.provider, tokenSha256],
      );
      const existingRow = existing.rows[0];

      let resultRow: DeviceRow;

      if (existingRow && existingRow.drts_passenger_id === command.drtsPassengerId) {
        const updated = await client.query<DeviceRow>(
          `
            UPDATE iam.phase1_passenger_push_devices
            SET app_version = $2,
                notification_consent_version = $3,
                updated_at = now()
            WHERE device_id = $1
            RETURNING ${DEVICE_COLUMNS}
          `,
          [existingRow.device_id, command.appVersion, command.notificationConsentVersion],
        );
        resultRow = updated.rows[0]!;
      } else {
        if (existingRow) {
          await client.query(
            `
              UPDATE iam.phase1_passenger_push_devices
              SET status = 'revoked',
                  status_reason = 'rebound_to_new_passenger',
                  updated_at = now()
              WHERE device_id = $1
            `,
            [existingRow.device_id],
          );
        }

        const inserted = await client.query<DeviceRow>(
          `
            INSERT INTO iam.phase1_passenger_push_devices (
              drts_passenger_id, platform, provider, app_id, app_version,
              token, token_sha256, status, notification_consent_version,
              last_seen_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NULL)
            RETURNING ${DEVICE_COLUMNS}
          `,
          [
            command.drtsPassengerId,
            command.platform,
            command.provider,
            command.appId,
            command.appVersion,
            command.token,
            tokenSha256,
            command.notificationConsentVersion,
          ],
        );
        resultRow = inserted.rows[0]!;
      }

      await this.enforceActiveDeviceCap(client, command.drtsPassengerId);

      // F1 rework: enforceActiveDeviceCap may have just revoked `resultRow`
      // itself (it is the active row currently holding the oldest
      // last_seen_at/registered_at among the passenger's active devices).
      // Re-read it by device_id so the returned record always reflects the
      // state actually persisted, instead of the pre-cap row fetched by
      // the UPDATE/INSERT above.
      const final = await client.query<DeviceRow>(
        `SELECT ${DEVICE_COLUMNS} FROM iam.phase1_passenger_push_devices WHERE device_id = $1`,
        [resultRow.device_id],
      );
      resultRow = final.rows[0] ?? resultRow;

      await client.query("COMMIT");
      return this.mapDeviceRow(resultRow);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw toSafeOperationError(error);
    } finally {
      client.release();
    }
  }

  /**
   * D4 — a passenger may have at most
   * `FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER` active devices;
   * past that, the least-recently-seen active device is revoked (nulls —
   * never touched — sort as oldest, i.e. first to be revoked). Must run
   * inside the same transaction as the insert that could have pushed the
   * count over.
   *
   * F1 rework: this used to `ORDER BY last_seen_at ASC NULLS FIRST,
   * registered_at ASC OFFSET N` and revoke the *offset* rows — that kept
   * the N oldest/never-seen devices and revoked the N+1th-and-later most
   * *recently* seen ones, the exact opposite of the intended policy, and
   * could immediately revoke the device just inserted by this same call
   * (any brand-new device sorts last among NULL last_seen_at rows by
   * registered_at ASC). The fix orders newest/most-recently-seen first
   * (NULLS LAST, so untouched devices rank behind every touched one, per
   * the "nulls sort as oldest" rule) and takes the OFFSET tail as the
   * overflow to revoke — the N most-recently-used devices are always kept.
   */
  private async enforceActiveDeviceCap(
    client: Pick<DatabaseService, "query">,
    drtsPassengerId: string,
  ): Promise<void> {
    const overflow = await client.query<{ device_id: string }>(
      `
        SELECT device_id
        FROM iam.phase1_passenger_push_devices
        WHERE drts_passenger_id = $1 AND status = 'active'
        ORDER BY last_seen_at DESC NULLS LAST, registered_at DESC
        OFFSET $2
      `,
      [drtsPassengerId, FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER],
    );

    if (overflow.rows.length === 0) {
      return;
    }

    await client.query(
      `
        UPDATE iam.phase1_passenger_push_devices
        SET status = 'revoked',
            status_reason = 'active_device_cap_exceeded',
            updated_at = now()
        WHERE device_id = ANY($1::uuid[])
      `,
      [overflow.rows.map((row: { device_id: string }) => row.device_id)],
    );
  }

  async touchDevice(deviceId: string): Promise<PassengerPushDeviceRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    try {
      const result = await this.databaseService!.query<DeviceRow>(
        `
          UPDATE iam.phase1_passenger_push_devices
          SET last_seen_at = now(), updated_at = now()
          WHERE device_id = $1 AND status = 'active'
          RETURNING ${DEVICE_COLUMNS}
        `,
        [deviceId],
      );
      const row = result.rows[0];
      return row ? this.mapDeviceRow(row) : null;
    } catch (error) {
      throw toSafeOperationError(error);
    }
  }

  /** D4 logout — idempotent: revoking an already-revoked/invalid device is a no-op success. */
  async revokeDevice(
    deviceId: string,
    reason = "logout",
  ): Promise<PassengerPushDeviceRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    try {
      const updated = await this.databaseService!.query<DeviceRow>(
        `
          UPDATE iam.phase1_passenger_push_devices
          SET status = 'revoked', status_reason = $2, updated_at = now()
          WHERE device_id = $1 AND status = 'active'
          RETURNING ${DEVICE_COLUMNS}
        `,
        [deviceId, reason],
      );
      if (updated.rows[0]) {
        return this.mapDeviceRow(updated.rows[0]);
      }

      const existing = await this.databaseService!.query<DeviceRow>(
        `SELECT ${DEVICE_COLUMNS} FROM iam.phase1_passenger_push_devices WHERE device_id = $1`,
        [deviceId],
      );
      const row = existing.rows[0];
      return row ? this.mapDeviceRow(row) : null;
    } catch (error) {
      throw toSafeOperationError(error);
    }
  }

  /** D4 provider-reported failure — idempotent: already-`invalid` is a no-op success. */
  async invalidateDevice(
    deviceId: string,
    reason: string,
  ): Promise<PassengerPushDeviceRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
    try {
      const updated = await this.databaseService!.query<DeviceRow>(
        `
          UPDATE iam.phase1_passenger_push_devices
          SET status = 'invalid',
              status_reason = $2,
              invalidated_at = now(),
              updated_at = now()
          WHERE device_id = $1 AND status <> 'invalid'
          RETURNING ${DEVICE_COLUMNS}
        `,
        [deviceId, reason],
      );
      if (updated.rows[0]) {
        return this.mapDeviceRow(updated.rows[0]);
      }

      const existing = await this.databaseService!.query<DeviceRow>(
        `SELECT ${DEVICE_COLUMNS} FROM iam.phase1_passenger_push_devices WHERE device_id = $1`,
        [deviceId],
      );
      const row = existing.rows[0];
      return row ? this.mapDeviceRow(row) : null;
    } catch (error) {
      throw toSafeOperationError(error);
    }
  }

  /**
   * D4 resolver — every `active` device for a passenger with a
   * `last_seen_at` inside the stale-after window. A device that was never
   * touched (`last_seen_at IS NULL`) is unusable for selection, same as one
   * that is simply too old; neither is ever deleted here.
   */
  async resolveActiveDevices(
    drtsPassengerId: string,
  ): Promise<PassengerPushDeviceRecord[]> {
    if (!this.isEnabled()) {
      return [];
    }
    try {
      const result = await this.databaseService!.query<DeviceRow>(
        `
          SELECT ${DEVICE_COLUMNS}
          FROM iam.phase1_passenger_push_devices
          WHERE drts_passenger_id = $1
            AND status = 'active'
            AND last_seen_at IS NOT NULL
            AND last_seen_at >= now() - make_interval(days => $2)
          ORDER BY last_seen_at DESC
        `,
        [drtsPassengerId, FIRST_PARTY_PUSH_DEVICE_STALE_AFTER_DAYS],
      );
      return result.rows.map((row: DeviceRow) => this.mapDeviceRow(row));
    } catch (error) {
      throw toSafeOperationError(error);
    }
  }

  /**
   * PUSH-FIRST-PARTY-FCM-20261006 — same selection as `resolveActiveDevices`
   * (D6: "之後重試只用 context 裡的裝置", so the transport always re-checks
   * current active/token-sha status here and intersects it against an
   * already-frozen context's `targetDevices` by `deviceId`; this method
   * never re-derives the recipient list itself). Returns the raw `token`
   * only because the FCM transport has no other way to call FCM — this is
   * an in-process call, never an HTTP response, and the caller must never
   * log or persist the returned `token` (only `deviceId`/`tokenSha256`).
   */
  async resolveActiveDeviceSendTargets(
    drtsPassengerId: string,
  ): Promise<Array<{ deviceId: string; token: string; tokenSha256: string }>> {
    if (!this.isEnabled()) {
      return [];
    }
    try {
      const result = await this.databaseService!.query<
        QueryResultRow & { device_id: string; token: string; token_sha256: string }
      >(
        `
          SELECT device_id, token, token_sha256
          FROM iam.phase1_passenger_push_devices
          WHERE drts_passenger_id = $1
            AND status = 'active'
            AND last_seen_at IS NOT NULL
            AND last_seen_at >= now() - make_interval(days => $2)
          ORDER BY last_seen_at DESC
        `,
        [drtsPassengerId, FIRST_PARTY_PUSH_DEVICE_STALE_AFTER_DAYS],
      );
      return result.rows.map((row) => ({
        deviceId: row.device_id,
        token: row.token,
        tokenSha256: row.token_sha256,
      }));
    } catch (error) {
      throw toSafeOperationError(error);
    }
  }

  /**
   * D2/D5 — writes the frozen first-party route snapshot, refusing when a
   * partner route already claims the same order (mutual exclusion checked
   * in the same transaction) and treating an identical re-write as an
   * idempotent replay rather than an error.
   */
  async writeFirstPartyRoute(
    command: WriteFirstPartyRouteCommand,
  ): Promise<WriteFirstPartyRouteResult> {
    if (!this.isEnabled()) {
      throw new Error("DATABASE_URL is not configured");
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      // F4 rework: serialize concurrent writes for this order_id behind
      // one transaction-scoped advisory lock, acquired before the
      // `FOR UPDATE` row lock below (which locks nothing when no row
      // exists yet — two concurrent first writes for the same order both
      // used to pass the partner check and the empty `FOR UPDATE`, then
      // race a plain INSERT: one succeeds, the other hits the order_id
      // primary-key violation instead of being compared and treated as an
      // idempotent replay). With the lock, the second call blocks until
      // the first commits, then actually sees the just-inserted row.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`passenger-push-first-party-route:${command.orderId}`],
      );

      const partnerRoute = await client.query(
        `SELECT order_id FROM mobility.phase1_order_partner_notification_routes WHERE order_id = $1`,
        [command.orderId],
      );
      if (partnerRoute.rows[0]) {
        await client.query("ROLLBACK");
        return { outcome: "rejected_partner_route_exists" };
      }

      const existing = await client.query<FirstPartyRouteRow>(
        `
          SELECT order_id, tenant_id, drts_passenger_id, passenger_subject_ref,
            app_id, notification_policy_version, consent_version, ride_ref,
            created_at
          FROM mobility.phase1_order_first_party_notification_routes
          WHERE order_id = $1
          FOR UPDATE
        `,
        [command.orderId],
      );
      const existingRow = existing.rows[0];

      if (existingRow) {
        const matches =
          existingRow.tenant_id === command.tenantId &&
          existingRow.drts_passenger_id === command.drtsPassengerId &&
          existingRow.passenger_subject_ref === command.passengerSubjectRef &&
          existingRow.app_id === command.appId &&
          existingRow.consent_version === command.consentVersion &&
          existingRow.ride_ref === command.rideRef;

        await client.query(matches ? "COMMIT" : "ROLLBACK");
        return matches
          ? { outcome: "idempotent_replay", route: this.mapRouteRow(existingRow) }
          : { outcome: "rejected_content_mismatch" };
      }

      const inserted = await client.query<FirstPartyRouteRow>(
        `
          INSERT INTO mobility.phase1_order_first_party_notification_routes (
            order_id, tenant_id, drts_passenger_id, passenger_subject_ref,
            app_id, consent_version, ride_ref
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING order_id, tenant_id, drts_passenger_id, passenger_subject_ref,
            app_id, notification_policy_version, consent_version, ride_ref,
            created_at
        `,
        [
          command.orderId,
          command.tenantId,
          command.drtsPassengerId,
          command.passengerSubjectRef,
          command.appId,
          command.consentVersion,
          command.rideRef,
        ],
      );

      await client.query("COMMIT");
      return { outcome: "created", route: this.mapRouteRow(inserted.rows[0]!) };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw toSafeOperationError(error);
    } finally {
      client.release();
    }
  }
}
