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
   * FLEET-ONB-002 SA/SD §2 (docs/02-architecture/fleet-staff-onboarding-20261114/01_system_sa_sd.md):
   * accepting a Fleet staff invitation's Google-bound identity link. Unlike
   * `resolveOrCreate`, `drtsPassengerId` is the caller's already-created
   * invited principal, not a fresh random passenger id, and this never
   * overwrites a conflicting existing row — it returns `null` so the caller
   * rolls back the whole accept transaction instead of silently reusing (and
   * rebinding) someone else's link, e.g. one created by a prior referral
   * handoff for the same `(entrySlug, partnerUserRef)`.
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
      if (this.fallbackLinks.has(key)) {
        return null;
      }
      this.fallbackLinks.set(key, record);
      return this.clone(record);
    }

    const exec = executor ?? this.databaseService!;
    const result = await exec.query<JsonRecordRow>(
      `
        INSERT INTO admin.phase1_partner_user_identity_links (
          entry_slug, partner_user_ref, drts_passenger_id, status, consent_scope,
          linked_at, last_seen_at, created_at, updated_at, record
        ) VALUES ($1, $2, $3, 'active', 'fleet_staff_invitation', $4, $4, $4, $4, $5::jsonb)
        ON CONFLICT (entry_slug, partner_user_ref) DO NOTHING
        RETURNING record
      `,
      [entrySlug, partnerUserRef, drtsPassengerId, now, JSON.stringify(record)],
    );

    const row = result.rows[0];
    return row ? this.parseRecord(row.record) : null;
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
