import { Injectable, Logger, Optional } from "@nestjs/common";

import type { SandboxDispatchDecision } from "@drts/contracts";

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
        oddInBounds: row.odd_in_bounds,
        hardReasonCodes: [...row.hard_reason_codes] as SandboxDispatchStoredEvaluationRecord["decision"]["hardReasonCodes"],
        softReasonCodes: [...row.soft_reason_codes] as SandboxDispatchStoredEvaluationRecord["decision"]["softReasonCodes"],
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
}
