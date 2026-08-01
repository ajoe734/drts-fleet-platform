import { createHash, randomUUID } from "node:crypto";

import { Injectable, Optional } from "@nestjs/common";
import type { PoolClient } from "pg";

import type {
  ReferralEmbedConsentBundle,
  ReferralEmbedRequiredConsentScope,
  ReferralEmbedSession,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type ReferralEmbedHandoffRecord = {
  handoffId: string;
  artifactHash: string;
  entrySlug: string;
  entryHost: string;
  partnerUserRef: string;
  drtsPassengerId: string;
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  consentRequired: boolean;
  consentBundleVersion: string | null;
  consentGrantedAt: string | null;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

type ReferralEmbedConsentLedgerRecord = {
  consentId: string;
  handoffId: string;
  entrySlug: string;
  entryHost: string;
  drtsPassengerId: string;
  bundleVersion: string;
  grantedScopes: ReferralEmbedRequiredConsentScope[];
  grantedAt: string;
  actorIp: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type PersistReferralEmbedHandoffCommand = Omit<
  ReferralEmbedHandoffRecord,
  "handoffId" | "artifactHash" | "consumedAt"
> & {
  artifact: string;
};

export type ConsumeReferralEmbedHandoffResult =
  | { outcome: "consumed"; session: ReferralEmbedSession }
  | { outcome: "replayed" | "expired" | "wrong_host" | "missing" };

export type RecordReferralEmbedConsentResult =
  | { outcome: "recorded" | "replayed"; session: ReferralEmbedSession }
  | { outcome: "wrong_host" | "missing" };

const REQUIRED_SCOPES: ReferralEmbedRequiredConsentScope[] = [
  "trip.manage",
  "pii.trip",
  "identity.bind",
];

@Injectable()
export class ReferralEmbedHandoffRepository {
  private readonly fallbackHandoffs = new Map<string, ReferralEmbedHandoffRecord>();
  private readonly fallbackConsents = new Map<string, ReferralEmbedConsentLedgerRecord>();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async issue(
    command: PersistReferralEmbedHandoffCommand,
  ): Promise<ReferralEmbedHandoffRecord> {
    const now = command.issuedAt;
    const record: ReferralEmbedHandoffRecord = {
      handoffId: `ref_handoff_${randomUUID()}`,
      artifactHash: this.hashArtifact(command.artifact),
      entrySlug: command.entrySlug.trim(),
      entryHost: command.entryHost.trim().toLowerCase(),
      partnerUserRef: command.partnerUserRef.trim(),
      drtsPassengerId: command.drtsPassengerId.trim(),
      tenantId: command.tenantId ?? null,
      partnerId: command.partnerId ?? null,
      partnerProgramId: command.partnerProgramId ?? null,
      consentRequired: command.consentRequired,
      consentBundleVersion: command.consentBundleVersion ?? null,
      consentGrantedAt: command.consentGrantedAt ?? null,
      issuedAt: now,
      expiresAt: command.expiresAt,
      consumedAt: null,
    };

    if (!this.isEnabled()) {
      this.fallbackHandoffs.set(record.handoffId, record);
      return { ...record };
    }

    await this.databaseService!.query(
      `
        INSERT INTO admin.phase1_referral_embed_handoffs (
          handoff_id,
          artifact_hash,
          entry_slug,
          entry_host,
          partner_user_ref,
          drts_passenger_id,
          tenant_id,
          partner_id,
          partner_program_id,
          consent_required,
          consent_bundle_version,
          consent_granted_at,
          issued_at,
          expires_at,
          consumed_at,
          record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NULL, $15::jsonb
        )
      `,
      [
        record.handoffId,
        record.artifactHash,
        record.entrySlug,
        record.entryHost,
        record.partnerUserRef,
        record.drtsPassengerId,
        record.tenantId,
        record.partnerId,
        record.partnerProgramId,
        record.consentRequired,
        record.consentBundleVersion,
        record.consentGrantedAt,
        record.issuedAt,
        record.expiresAt,
        JSON.stringify(record),
      ],
    );

    return { ...record };
  }

  async consume(input: {
    artifact: string;
    entrySlug: string;
    entryHost: string;
  }): Promise<ConsumeReferralEmbedHandoffResult> {
    if (!this.isEnabled()) {
      return this.consumeFallback(input);
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<JsonRecordRow>(
        `
          UPDATE admin.phase1_referral_embed_handoffs
          SET consumed_at = COALESCE(consumed_at, NOW()),
              record = jsonb_set(
                record,
                '{consumedAt}',
                to_jsonb(COALESCE(consumed_at, NOW())::text),
                true
              )
          WHERE artifact_hash = $1
            AND entry_slug = $2
            AND entry_host = $3
            AND consumed_at IS NULL
            AND expires_at > NOW()
          RETURNING record
        `,
        [
          this.hashArtifact(input.artifact),
          input.entrySlug.trim(),
          input.entryHost.trim().toLowerCase(),
        ],
      );

      if (result.rows[0]) {
        const record = this.parseHandoffRecord(result.rows[0].record);
        await client.query("COMMIT");
        return { outcome: "consumed", session: this.toSession(record) };
      }

      const replay = await this.findByArtifactHash(client, input.artifact);
      await client.query("COMMIT");
      if (!replay) return { outcome: "missing" };
      if (
        replay.entrySlug !== input.entrySlug.trim() ||
        replay.entryHost !== input.entryHost.trim().toLowerCase()
      ) {
        return { outcome: "wrong_host" };
      }
      if (replay.expiresAt <= new Date().toISOString()) {
        return { outcome: "expired" };
      }
      return { outcome: "replayed" };
    } finally {
      client.release();
    }
  }

  async recordConsent(input: {
    handoffId: string;
    entrySlug: string;
    entryHost: string;
    consentBundle: ReferralEmbedConsentBundle;
  }): Promise<RecordReferralEmbedConsentResult> {
    if (!this.isEnabled()) {
      return this.recordConsentFallback(input);
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const handoff = await this.findByHandoffId(client, input.handoffId);
      if (!handoff) {
        await client.query("COMMIT");
        return { outcome: "missing" };
      }
      if (
        handoff.entrySlug !== input.entrySlug.trim() ||
        handoff.entryHost !== input.entryHost.trim().toLowerCase()
      ) {
        await client.query("COMMIT");
        return { outcome: "wrong_host" };
      }

      const existing = await client.query<JsonRecordRow>(
        `
          SELECT record
          FROM admin.phase1_referral_embed_consent_ledger
          WHERE handoff_id = $1
            AND bundle_version = $2
          LIMIT 1
        `,
        [handoff.handoffId, input.consentBundle.bundleVersion],
      );
      if (!existing.rows[0]) {
        const consent = this.buildConsentRecord(handoff, input.consentBundle);
        await client.query(
          `
            INSERT INTO admin.phase1_referral_embed_consent_ledger (
              consent_id,
              handoff_id,
              entry_slug,
              entry_host,
              drts_passenger_id,
              bundle_version,
              granted_scopes,
              granted_at,
              actor_ip,
              user_agent,
              created_at,
              record
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12::jsonb
            )
          `,
          [
            consent.consentId,
            consent.handoffId,
            consent.entrySlug,
            consent.entryHost,
            consent.drtsPassengerId,
            consent.bundleVersion,
            JSON.stringify(consent.grantedScopes),
            consent.grantedAt,
            consent.actorIp,
            consent.userAgent,
            consent.createdAt,
            JSON.stringify(consent),
          ],
        );
      }

      const updated = this.withConsent(handoff, input.consentBundle);
      await client.query(
        `
          UPDATE admin.phase1_referral_embed_handoffs
          SET consent_required = false,
              consent_bundle_version = $2,
              consent_granted_at = $3,
              record = $4::jsonb
          WHERE handoff_id = $1
        `,
        [
          updated.handoffId,
          updated.consentBundleVersion,
          updated.consentGrantedAt,
          JSON.stringify(updated),
        ],
      );
      await client.query("COMMIT");
      return {
        outcome: existing.rows[0] ? "replayed" : "recorded",
        session: this.toSession(updated),
      };
    } finally {
      client.release();
    }
  }

  private consumeFallback(input: {
    artifact: string;
    entrySlug: string;
    entryHost: string;
  }): ConsumeReferralEmbedHandoffResult {
    const record = Array.from(this.fallbackHandoffs.values()).find(
      (value) => value.artifactHash === this.hashArtifact(input.artifact),
    );
    if (!record) return { outcome: "missing" };
    if (
      record.entrySlug !== input.entrySlug.trim() ||
      record.entryHost !== input.entryHost.trim().toLowerCase()
    ) {
      return { outcome: "wrong_host" };
    }
    if (record.expiresAt <= new Date().toISOString()) {
      return { outcome: "expired" };
    }
    if (record.consumedAt) {
      return { outcome: "replayed" };
    }
    const updated = { ...record, consumedAt: new Date().toISOString() };
    this.fallbackHandoffs.set(updated.handoffId, updated);
    return { outcome: "consumed", session: this.toSession(updated) };
  }

  private recordConsentFallback(input: {
    handoffId: string;
    entrySlug: string;
    entryHost: string;
    consentBundle: ReferralEmbedConsentBundle;
  }): RecordReferralEmbedConsentResult {
    const handoff = this.fallbackHandoffs.get(input.handoffId);
    if (!handoff) return { outcome: "missing" };
    if (
      handoff.entrySlug !== input.entrySlug.trim() ||
      handoff.entryHost !== input.entryHost.trim().toLowerCase()
    ) {
      return { outcome: "wrong_host" };
    }

    const key = `${handoff.handoffId}\0${input.consentBundle.bundleVersion}`;
    const exists = this.fallbackConsents.has(key);
    if (!exists) {
      this.fallbackConsents.set(
        key,
        this.buildConsentRecord(handoff, input.consentBundle),
      );
    }
    const updated = this.withConsent(handoff, input.consentBundle);
    this.fallbackHandoffs.set(updated.handoffId, updated);
    return {
      outcome: exists ? "replayed" : "recorded",
      session: this.toSession(updated),
    };
  }

  private buildConsentRecord(
    handoff: ReferralEmbedHandoffRecord,
    consentBundle: ReferralEmbedConsentBundle,
  ): ReferralEmbedConsentLedgerRecord {
    return {
      consentId: `ref_consent_${randomUUID()}`,
      handoffId: handoff.handoffId,
      entrySlug: handoff.entrySlug,
      entryHost: handoff.entryHost,
      drtsPassengerId: handoff.drtsPassengerId,
      bundleVersion: consentBundle.bundleVersion,
      grantedScopes: [...consentBundle.grantedScopes],
      grantedAt: consentBundle.grantedAt,
      actorIp: consentBundle.actorIp ?? null,
      userAgent: consentBundle.userAgent ?? null,
      createdAt: consentBundle.grantedAt,
    };
  }

  private withConsent(
    handoff: ReferralEmbedHandoffRecord,
    consentBundle: ReferralEmbedConsentBundle,
  ): ReferralEmbedHandoffRecord {
    return {
      ...handoff,
      consentRequired: false,
      consentBundleVersion: consentBundle.bundleVersion,
      consentGrantedAt: consentBundle.grantedAt,
    };
  }

  private toSession(record: ReferralEmbedHandoffRecord): ReferralEmbedSession {
    return {
      handoffId: record.handoffId,
      partnerEntrySlug: record.entrySlug,
      entryHost: record.entryHost,
      drtsPassengerId: record.drtsPassengerId,
      identityActive: !record.consentRequired,
      consent: {
        requiredScopes: [...REQUIRED_SCOPES],
        bundleVersion: record.consentBundleVersion,
        grantedAt: record.consentGrantedAt,
      },
      identity: {
        actorType: "referral_passenger",
        actorId: record.drtsPassengerId,
        realm: "partner",
        authMode: "jwt_bearer",
        roleFamilies: ["partner"],
        roles: ["referral_passenger"],
        scopes: [
          "partner:handoff",
          "partner:eligibility:read",
          "partner:eligibility:write",
          "partner:book",
        ],
        tenantId: record.tenantId,
        partnerId: record.partnerId,
        partnerProgramId: record.partnerProgramId,
        partnerEntrySlug: record.entrySlug,
        drtsPassengerId: record.drtsPassengerId,
      },
    };
  }

  private async findByArtifactHash(client: PoolClient, artifact: string) {
    const result = await client.query<JsonRecordRow>(
      `
        SELECT record
        FROM admin.phase1_referral_embed_handoffs
        WHERE artifact_hash = $1
        LIMIT 1
      `,
      [this.hashArtifact(artifact)],
    );
    return result.rows[0] ? this.parseHandoffRecord(result.rows[0].record) : null;
  }

  private async findByHandoffId(client: PoolClient, handoffId: string) {
    const result = await client.query<JsonRecordRow>(
      `
        SELECT record
        FROM admin.phase1_referral_embed_handoffs
        WHERE handoff_id = $1
        LIMIT 1
      `,
      [handoffId],
    );
    return result.rows[0] ? this.parseHandoffRecord(result.rows[0].record) : null;
  }

  private parseHandoffRecord(value: unknown): ReferralEmbedHandoffRecord {
    return value as ReferralEmbedHandoffRecord;
  }

  private hashArtifact(artifact: string) {
    return createHash("sha256").update(artifact).digest("hex");
  }
}
