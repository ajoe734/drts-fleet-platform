import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import type {
  PartnerUserIdentityConsentScope,
  PartnerUserIdentityLinkRecord,
  PartnerUserIdentityLinkStatus,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

/** The minimal surface `createForInvitedPrincipal` needs from a caller's own
 * transaction client, so the insert composes atomically with FLEET-ONB-004's
 * invitation-accept transaction (SA/SD §3 step 4) instead of only ever
 * running against the pool directly. Declared as a single non-overloaded
 * call signature (matching `DatabaseService.query`) rather than
 * `Pick<PoolClient, "query">`, because `PoolClient["query"]` is a union of
 * incompatible overloads that TS cannot call through a
 * `DatabaseService | PoolClient` union parameter (TS2349). A real
 * `PoolClient` still satisfies this narrower shape structurally. */
interface PartnerUserIdentityLinkQueryExecutor {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

type JsonRecordRow = {
  record: unknown;
};

export type ResolveOrCreatePartnerUserIdentityLinkCommand = {
  entrySlug: string;
  partnerUserRef: string;
  consentScope?: PartnerUserIdentityConsentScope;
  now?: string;
};

@Injectable()
export class PartnerUserIdentityLinkRepository {
  private readonly fallbackLinks = new Map<
    string,
    PartnerUserIdentityLinkRecord
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async resolveOrCreate(
    command: ResolveOrCreatePartnerUserIdentityLinkCommand,
  ): Promise<PartnerUserIdentityLinkRecord> {
    const entrySlug = this.requireNonBlank(command.entrySlug, "entrySlug");
    const partnerUserRef = this.requireNonBlank(
      command.partnerUserRef,
      "partnerUserRef",
    );
    const now = command.now ?? new Date().toISOString();
    const key = this.buildKey(entrySlug, partnerUserRef);

    if (!this.isEnabled()) {
      const existing = this.fallbackLinks.get(key);
      if (existing) {
        return this.clone(existing);
      }

      const created: PartnerUserIdentityLinkRecord = {
        entrySlug,
        partnerUserRef,
        drtsPassengerId: `passenger_${randomUUID()}`,
        status: "active",
        consentScope: command.consentScope ?? "passenger_identity_link",
        linkedAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      };
      this.fallbackLinks.set(key, created);
      return this.clone(created);
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        WITH inserted AS (
          INSERT INTO admin.phase1_partner_user_identity_links (
            entry_slug,
            partner_user_ref,
            drts_passenger_id,
            status,
            consent_scope,
            linked_at,
            last_seen_at,
            created_at,
            updated_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
          )
          ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING
          RETURNING record
        )
        SELECT record
        FROM inserted
        UNION ALL
        SELECT record
        FROM admin.phase1_partner_user_identity_links
        WHERE entry_slug = $1
          AND partner_user_ref = $2
        LIMIT 1
      `,
      (() => {
        const record: PartnerUserIdentityLinkRecord = {
          entrySlug,
          partnerUserRef,
          drtsPassengerId: `passenger_${randomUUID()}`,
          status: "active",
          consentScope: command.consentScope ?? "passenger_identity_link",
          linkedAt: now,
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        };
        return [
          record.entrySlug,
          record.partnerUserRef,
          record.drtsPassengerId,
          record.status,
          record.consentScope,
          record.linkedAt,
          record.lastSeenAt,
          record.createdAt,
          record.updatedAt,
          JSON.stringify(record),
        ];
      })(),
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(
        "Partner user identity link persistence returned no record.",
      );
    }

    return this.parseRecord(row.record);
  }

  /**
   * FLEET-ONB-002 SA/SD §2 (docs/02-architecture/fleet-staff-onboarding-20261114/01_system_sa_sd.md),
   * updated per 2026-11-22 product decision (FLEET-REINVITE-SAME-GOOGLE-ACCOUNT-20261122):
   * accepting a Fleet staff invitation's Google-bound identity link. Unlike
   * `resolveOrCreate`, `drtsPassengerId` is the caller's already-created
   * invited principal, not a fresh random passenger id, and this never
   * overwrites a conflicting existing row.
   *
   * When the exact same canonical Fleet member (`drtsPassengerId`) in the
   * same `entrySlug` re-verifies their original Google account
   * (`partnerUserRef`) via a fresh invitation, their existing active
   * `fleet_staff_invitation` link is reused without duplicating rows or
   * overwriting original timestamps. Any conflicting link — whether owned by
   * another principal, created for another `consent_scope` (e.g. a prior
   * referral handoff), not `active`, bound as `fleet_staff_invitation` in
   * another Fleet entry, or presenting a different `partnerUserRef` when
   * `drtsPassengerId` already holds an original Google link in `entrySlug` —
   * returns `null` so the caller rolls back the whole accept transaction.
   *
   * An optional `executor` (the caller's own `PoolClient`) lets this insert
   * run inside FLEET-ONB-004's invitation-accept transaction, so a conflict
   * here rolls back that whole transaction rather than only this statement
   * (SA/SD §3 step 4). Without one, it runs directly against the pool.
   */
  async createForInvitedPrincipal(
    entrySlugInput: string,
    partnerUserRefInput: string,
    drtsPassengerIdInput: string,
    now: string = new Date().toISOString(),
    executor?: PartnerUserIdentityLinkQueryExecutor,
  ): Promise<PartnerUserIdentityLinkRecord | null> {
    const entrySlug = this.requireNonBlank(entrySlugInput, "entrySlug");
    const partnerUserRef = this.requireNonBlank(
      partnerUserRefInput,
      "partnerUserRef",
    );
    const drtsPassengerId = this.requireNonBlank(
      drtsPassengerIdInput,
      "drtsPassengerId",
    );
    const record: PartnerUserIdentityLinkRecord = {
      entrySlug,
      partnerUserRef,
      drtsPassengerId,
      status: "active",
      consentScope: "fleet_staff_invitation",
      linkedAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (!executor && !this.isEnabled()) {
      const key = this.buildKey(entrySlug, partnerUserRef);
      for (const existing of this.fallbackLinks.values()) {
        if (
          existing.entrySlug === entrySlug &&
          existing.drtsPassengerId === drtsPassengerId &&
          existing.partnerUserRef !== partnerUserRef
        ) {
          return null;
        }
        if (
          existing.partnerUserRef === partnerUserRef &&
          existing.consentScope === "fleet_staff_invitation" &&
          (existing.entrySlug !== entrySlug ||
            existing.drtsPassengerId !== drtsPassengerId)
        ) {
          return null;
        }
      }
      const existingForKey = this.fallbackLinks.get(key);
      if (existingForKey) {
        if (
          existingForKey.entrySlug === entrySlug &&
          existingForKey.partnerUserRef === partnerUserRef &&
          existingForKey.drtsPassengerId === drtsPassengerId &&
          existingForKey.status === "active" &&
          existingForKey.consentScope === "fleet_staff_invitation"
        ) {
          return this.clone(existingForKey);
        }
        return null;
      }
      this.fallbackLinks.set(key, record);
      return this.clone(record);
    }

    const exec = executor ?? this.databaseService!;
    const result = await exec.query<JsonRecordRow>(
      `
        WITH inserted AS (
          INSERT INTO admin.phase1_partner_user_identity_links (
            entry_slug, partner_user_ref, drts_passenger_id, status, consent_scope,
            linked_at, last_seen_at, created_at, updated_at, record
          )
          SELECT $1, $2, $3, 'active', 'fleet_staff_invitation', $4, $4, $4, $4, $5::jsonb
          WHERE NOT EXISTS (
            SELECT 1
            FROM admin.phase1_partner_user_identity_links existing_any
            WHERE (
              existing_any.entry_slug = $1
              AND existing_any.drts_passenger_id = $3
            ) OR (
              existing_any.partner_user_ref = $2
              AND existing_any.consent_scope = 'fleet_staff_invitation'
              AND (
                existing_any.entry_slug <> $1
                OR existing_any.drts_passenger_id <> $3
              )
            )
          )
          ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING
          RETURNING record
        )
        SELECT record
        FROM inserted
        UNION ALL
        SELECT existing.record
        FROM admin.phase1_partner_user_identity_links existing
        WHERE existing.entry_slug = $1
          AND existing.partner_user_ref = $2
          AND existing.drts_passenger_id = $3
          AND existing.status = 'active'
          AND existing.consent_scope = 'fleet_staff_invitation'
          AND COALESCE(existing.record->>'entrySlug', existing.entry_slug) = $1
          AND COALESCE(existing.record->>'partnerUserRef', existing.partner_user_ref) = $2
          AND COALESCE(existing.record->>'drtsPassengerId', existing.drts_passenger_id) = $3
          AND COALESCE(existing.record->>'status', existing.status) = 'active'
          AND COALESCE(existing.record->>'consentScope', existing.consent_scope) = 'fleet_staff_invitation'
          AND NOT EXISTS (
            SELECT 1
            FROM admin.phase1_partner_user_identity_links other_link
            WHERE (
              other_link.entry_slug = $1
              AND other_link.drts_passenger_id = $3
              AND other_link.partner_user_ref <> $2
            ) OR (
              other_link.partner_user_ref = $2
              AND other_link.consent_scope = 'fleet_staff_invitation'
              AND (
                other_link.entry_slug <> $1
                OR other_link.drts_passenger_id <> $3
              )
            )
          )
        LIMIT 1
      `,
      [entrySlug, partnerUserRef, drtsPassengerId, now, JSON.stringify(record)],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const parsed = this.parseRecord(row.record);
    if (
      (parsed.entrySlug !== undefined && parsed.entrySlug !== entrySlug) ||
      (parsed.partnerUserRef !== undefined &&
        parsed.partnerUserRef !== partnerUserRef) ||
      parsed.drtsPassengerId !== drtsPassengerId ||
      (parsed.status !== undefined && parsed.status !== "active") ||
      (parsed.consentScope !== undefined &&
        parsed.consentScope !== "fleet_staff_invitation")
    ) {
      return null;
    }
    return {
      ...record,
      ...parsed,
      entrySlug,
      partnerUserRef,
      drtsPassengerId,
      status: "active",
      consentScope: "fleet_staff_invitation",
    };
  }

  async touchLastSeen(
    entrySlugInput: string,
    partnerUserRefInput: string,
    observedAt = new Date().toISOString(),
  ): Promise<PartnerUserIdentityLinkRecord | null> {
    const entrySlug = this.requireNonBlank(entrySlugInput, "entrySlug");
    const partnerUserRef = this.requireNonBlank(
      partnerUserRefInput,
      "partnerUserRef",
    );
    const key = this.buildKey(entrySlug, partnerUserRef);

    if (!this.isEnabled()) {
      const existing = this.fallbackLinks.get(key);
      if (!existing) {
        return null;
      }

      const updated = {
        ...existing,
        lastSeenAt: observedAt,
        updatedAt: observedAt,
      };
      this.fallbackLinks.set(key, updated);
      return this.clone(updated);
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        UPDATE admin.phase1_partner_user_identity_links
        SET last_seen_at = $3::timestamptz,
            updated_at = $3::timestamptz,
            record = jsonb_set(
              jsonb_set(record, '{lastSeenAt}', to_jsonb($3::text), true),
              '{updatedAt}',
              to_jsonb($3::text),
              true
            )
        WHERE entry_slug = $1
          AND partner_user_ref = $2
        RETURNING record
      `,
      [entrySlug, partnerUserRef, observedAt],
    );

    return result.rows[0] ? this.parseRecord(result.rows[0].record) : null;
  }

  async status(
    entrySlugInput: string,
    partnerUserRefInput: string,
  ): Promise<PartnerUserIdentityLinkStatus | null> {
    const record = await this.find(entrySlugInput, partnerUserRefInput);
    return record?.status ?? null;
  }

  /**
   * Reverse lookup by the trusted `drtsPassengerId` on the caller's
   * authenticated session (`BootstrapRequestIdentity.drtsPassengerId`) rather
   * than a caller-asserted `partnerUserRef` — used by
   * SR-PARTNER-NOTIFY-ROUTE-20260917 order-route creation, which must never
   * trust a query/body-supplied identity (design §4).
   */
  async findByDrtsPassengerId(
    entrySlugInput: string,
    drtsPassengerIdInput: string,
  ): Promise<PartnerUserIdentityLinkRecord | null> {
    const entrySlug = this.requireNonBlank(entrySlugInput, "entrySlug");
    const drtsPassengerId = this.requireNonBlank(
      drtsPassengerIdInput,
      "drtsPassengerId",
    );

    if (!this.isEnabled()) {
      for (const existing of this.fallbackLinks.values()) {
        if (
          existing.entrySlug === entrySlug &&
          existing.drtsPassengerId === drtsPassengerId
        ) {
          return this.clone(existing);
        }
      }
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM admin.phase1_partner_user_identity_links
        WHERE entry_slug = $1
          AND drts_passenger_id = $2
        LIMIT 1
      `,
      [entrySlug, drtsPassengerId],
    );

    return result.rows[0] ? this.parseRecord(result.rows[0].record) : null;
  }

  async find(
    entrySlugInput: string,
    partnerUserRefInput: string,
  ): Promise<PartnerUserIdentityLinkRecord | null> {
    const entrySlug = this.requireNonBlank(entrySlugInput, "entrySlug");
    const partnerUserRef = this.requireNonBlank(
      partnerUserRefInput,
      "partnerUserRef",
    );
    const key = this.buildKey(entrySlug, partnerUserRef);

    if (!this.isEnabled()) {
      const existing = this.fallbackLinks.get(key);
      return existing ? this.clone(existing) : null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT record
        FROM admin.phase1_partner_user_identity_links
        WHERE entry_slug = $1
          AND partner_user_ref = $2
        LIMIT 1
      `,
      [entrySlug, partnerUserRef],
    );

    return result.rows[0] ? this.parseRecord(result.rows[0].record) : null;
  }

  private parseRecord(record: unknown): PartnerUserIdentityLinkRecord {
    if (!record || typeof record !== "object") {
      throw new Error("Partner user identity link record must be an object.");
    }
    return this.clone(record as PartnerUserIdentityLinkRecord);
  }

  private clone(
    record: PartnerUserIdentityLinkRecord,
  ): PartnerUserIdentityLinkRecord {
    return { ...record };
  }

  private buildKey(entrySlug: string, partnerUserRef: string) {
    return `${entrySlug}::${partnerUserRef}`;
  }

  private requireNonBlank(value: string, fieldName: string) {
    const normalized = value?.trim();
    if (!normalized) {
      throw new Error(`${fieldName} is required.`);
    }
    return normalized;
  }
}
