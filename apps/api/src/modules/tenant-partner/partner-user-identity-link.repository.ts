import { randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";

import type {
  PartnerUserIdentityConsentScope,
  PartnerUserIdentityLinkRecord,
  PartnerUserIdentityLinkStatus,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

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
