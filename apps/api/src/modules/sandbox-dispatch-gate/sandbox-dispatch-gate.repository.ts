import { Injectable, Logger, Optional } from "@nestjs/common";
import type { QueryResult, QueryResultRow } from "pg";

import type {
  PassengerAcknowledgementRecord,
  PassengerDisclosureMessageCatalogEntry,
  PassengerDisclosurePolicy,
  SandboxDispatchDecision,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import type {
  SandboxDispatchEvaluationRecord,
  SandboxDispatchStoredEvaluationRecord,
} from "./sandbox-dispatch-gate.types";

type JsonRecordRow = {
  decision_id: string;
  order_id: string;
  dispatch_job_id: string | null;
  vehicle_id: string;
  sandbox_program_id: string;
  decision: SandboxDispatchDecision["decision"];
  odd_in_bounds: boolean;
  hard_reason_codes: string[];
  soft_reason_codes: string[];
  required_safety_operator_id: string | null;
  policy_version: string;
  evaluated_at: string;
  evaluation_snapshot: unknown;
  release_audit: unknown;
};

type JsonPayloadRow = {
  payload: unknown;
};

export type SandboxDispatchGateQueryExecutor = {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
};

@Injectable()
export class SandboxDispatchGateRepository {
  private readonly logger = new Logger(SandboxDispatchGateRepository.name);

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async persistEvaluation(record: SandboxDispatchEvaluationRecord) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO av_sandbox.sandbox_dispatch_decisions (
          decision_id,
          order_id,
          dispatch_job_id,
          vehicle_id,
          sandbox_program_id,
          decision,
          odd_in_bounds,
          hard_reason_codes,
          soft_reason_codes,
          required_safety_operator_id,
          policy_version,
          evaluated_at,
          evaluation_snapshot,
          release_audit
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13::jsonb, $14::jsonb
        )
        ON CONFLICT (decision_id) DO UPDATE SET
          evaluation_snapshot = EXCLUDED.evaluation_snapshot,
          release_audit = CASE
            WHEN EXCLUDED.release_audit = '{}'::jsonb
              THEN av_sandbox.sandbox_dispatch_decisions.release_audit
            ELSE EXCLUDED.release_audit
          END
      `,
      [
        record.decision.decisionId,
        record.decision.orderId,
        record.decision.dispatchJobId,
        record.decision.vehicleId,
        record.decision.sandboxProgramId,
        record.decision.decision,
        record.decision.oddInBounds,
        JSON.stringify(record.decision.hardReasonCodes),
        JSON.stringify(record.decision.softReasonCodes),
        record.decision.requiredSafetyOperatorId,
        record.decision.policyVersion,
        record.decision.evaluatedAt,
        JSON.stringify(record.evaluationSnapshot),
        JSON.stringify(record.releaseAudit ?? {}),
      ],
    );
  }

  async updateReleaseAudit(
    decisionId: string,
    releaseAudit: Record<string, unknown>,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        UPDATE av_sandbox.sandbox_dispatch_decisions
        SET release_audit = $2::jsonb
        WHERE decision_id = $1
      `,
      [decisionId, JSON.stringify(releaseAudit)],
    );
  }

  async loadLatestDecision(orderId: string) {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT *
        FROM av_sandbox.sandbox_dispatch_decisions
        WHERE order_id = $1
        ORDER BY evaluated_at DESC
        LIMIT 1
      `,
      [orderId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.mapStoredEvaluation(row);
  }

  async loadDecisionById(decisionId: string) {
    if (!this.isEnabled()) {
      return null;
    }

    const result = await this.databaseService!.query<JsonRecordRow>(
      `
        SELECT *
        FROM av_sandbox.sandbox_dispatch_decisions
        WHERE decision_id = $1
        LIMIT 1
      `,
      [decisionId],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.mapStoredEvaluation(row);
  }

  async listPassengerDisclosurePolicies() {
    if (!this.isEnabled()) {
      return [] as PassengerDisclosurePolicy[];
    }

    const result = await this.databaseService!.query<JsonPayloadRow>(
      `
        SELECT policy_snapshot AS payload
        FROM av_sandbox.passenger_disclosure_policies
        ORDER BY updated_at DESC, created_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseJsonPayload<PassengerDisclosurePolicy>(
        row.payload,
        "av_sandbox.passenger_disclosure_policies",
      ),
    );
  }

  async upsertPassengerDisclosurePolicy(policy: PassengerDisclosurePolicy) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO av_sandbox.passenger_disclosure_policies (
          policy_id,
          tenant_id,
          business_dispatch_subtype,
          partner_entry_slug,
          policy_version,
          active,
          policy_snapshot,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9
        )
        ON CONFLICT (policy_id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          business_dispatch_subtype = EXCLUDED.business_dispatch_subtype,
          partner_entry_slug = EXCLUDED.partner_entry_slug,
          policy_version = EXCLUDED.policy_version,
          active = EXCLUDED.active,
          policy_snapshot = EXCLUDED.policy_snapshot,
          updated_at = EXCLUDED.updated_at
      `,
      [
        policy.policyId,
        policy.tenantId,
        policy.businessDispatchSubtype,
        policy.partnerEntrySlug,
        policy.policyVersion,
        policy.active,
        JSON.stringify(policy),
        policy.createdAt,
        policy.updatedAt,
      ],
    );
  }

  async listPassengerDisclosureMessageCatalogEntries() {
    if (!this.isEnabled()) {
      return [] as PassengerDisclosureMessageCatalogEntry[];
    }

    const result = await this.databaseService!.query<JsonPayloadRow>(
      `
        SELECT entry_snapshot AS payload
        FROM av_sandbox.passenger_disclosure_message_catalog
        ORDER BY updated_at DESC, created_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseJsonPayload<PassengerDisclosureMessageCatalogEntry>(
        row.payload,
        "av_sandbox.passenger_disclosure_message_catalog",
      ),
    );
  }

  async upsertPassengerDisclosureMessageCatalogEntry(
    entry: PassengerDisclosureMessageCatalogEntry,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await this.databaseService!.query(
      `
        INSERT INTO av_sandbox.passenger_disclosure_message_catalog (
          entry_id,
          catalog_version,
          message_code,
          locale,
          legal_approved,
          body_text,
          entry_snapshot,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9
        )
        ON CONFLICT (message_code, locale) DO UPDATE SET
          entry_id = EXCLUDED.entry_id,
          catalog_version = EXCLUDED.catalog_version,
          message_code = EXCLUDED.message_code,
          locale = EXCLUDED.locale,
          legal_approved = EXCLUDED.legal_approved,
          body_text = EXCLUDED.body_text,
          entry_snapshot = EXCLUDED.entry_snapshot,
          updated_at = EXCLUDED.updated_at
      `,
      [
        entry.entryId,
        entry.catalogVersion,
        entry.messageCode,
        entry.locale,
        entry.legalApproved,
        entry.bodyText,
        JSON.stringify(entry),
        entry.createdAt,
        entry.updatedAt,
      ],
    );
  }

  async listPassengerAcknowledgements() {
    if (!this.isEnabled()) {
      return [] as PassengerAcknowledgementRecord[];
    }

    const result = await this.databaseService!.query<JsonPayloadRow>(
      `
        SELECT acknowledgement_snapshot AS payload
        FROM av_sandbox.passenger_acknowledgement_records
        ORDER BY created_at DESC
      `,
    );

    return result.rows.map((row) =>
      this.parseJsonPayload<PassengerAcknowledgementRecord>(
        row.payload,
        "av_sandbox.passenger_acknowledgement_records",
      ),
    );
  }

  async insertPassengerAcknowledgement(
    record: PassengerAcknowledgementRecord,
    executor?: SandboxDispatchGateQueryExecutor | null,
  ) {
    if (!this.isEnabled()) {
      return;
    }

    await (executor ?? this.databaseService!).query(
      `
        INSERT INTO av_sandbox.passenger_acknowledgement_records (
          acknowledgement_id,
          booking_id,
          order_id,
          policy_id,
          message_code,
          channel,
          acknowledgement_mode,
          actor_type,
          actor_ref,
          acknowledged_at,
          evidence_ref,
          acknowledgement_snapshot,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13
        )
      `,
      [
        record.acknowledgementId,
        record.bookingId,
        record.orderId,
        record.policyId,
        record.messageCode,
        record.channel,
        record.acknowledgementMode,
        record.actorType,
        record.actorRef,
        record.acknowledgedAt,
        record.evidenceRef,
        JSON.stringify(record),
        record.createdAt,
      ],
    );
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Sandbox dispatch persistence skipped during ${context}: ${detail}`,
    );
  }

  private mapStoredEvaluation(
    row: JsonRecordRow,
  ): SandboxDispatchStoredEvaluationRecord {
    return {
      decision: {
        decisionId: row.decision_id,
        orderId: row.order_id,
        dispatchJobId: row.dispatch_job_id,
        vehicleId: row.vehicle_id,
        sandboxProgramId: row.sandbox_program_id,
        decision: row.decision,
        fallbackRequired: row.decision === "block",
        oddInBounds: row.odd_in_bounds,
        hardReasonCodes: [
          ...row.hard_reason_codes,
        ] as SandboxDispatchStoredEvaluationRecord["decision"]["hardReasonCodes"],
        softReasonCodes: [
          ...row.soft_reason_codes,
        ] as SandboxDispatchStoredEvaluationRecord["decision"]["softReasonCodes"],
        requiredSafetyOperatorId: row.required_safety_operator_id,
        policyVersion: row.policy_version,
        evaluatedAt: row.evaluated_at,
      },
      evaluationSnapshot:
        (row.evaluation_snapshot as SandboxDispatchStoredEvaluationRecord["evaluationSnapshot"]) ??
        {},
      releaseAudit:
        row.release_audit && typeof row.release_audit === "object"
          ? (row.release_audit as Record<string, unknown>)
          : null,
    };
  }

  private parseJsonPayload<T>(payload: unknown, tableName: string): T {
    if (!payload || typeof payload !== "object") {
      throw new Error(`Invalid JSON payload loaded from ${tableName}`);
    }
    return payload as T;
  }
}
