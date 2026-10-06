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

      await client.query("COMMIT");
      return this.mapDeviceRow(resultRow);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * D4 — a passenger may have at most
   * `FIRST_PARTY_PUSH_MAX_ACTIVE_DEVICES_PER_PASSENGER` active devices;
   * past that, the least-recently-seen active device is revoked
   * (nulls — never touched — sort as oldest). Must run inside the same
   * transaction as the insert that could have pushed the count over.
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
        ORDER BY last_seen_at ASC NULLS FIRST, registered_at ASC
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
  }

  /** D4 logout — idempotent: revoking an already-revoked/invalid device is a no-op success. */
  async revokeDevice(
    deviceId: string,
    reason = "logout",
  ): Promise<PassengerPushDeviceRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
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
  }

  /** D4 provider-reported failure — idempotent: already-`invalid` is a no-op success. */
  async invalidateDevice(
    deviceId: string,
    reason: string,
  ): Promise<PassengerPushDeviceRecord | null> {
    if (!this.isEnabled()) {
      return null;
    }
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
      throw error;
    } finally {
      client.release();
    }
  }
}
