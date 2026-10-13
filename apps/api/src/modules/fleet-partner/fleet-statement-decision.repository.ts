import { Injectable, Optional } from "@nestjs/common";
import type { FleetPartnerStatementRecord } from "@drts/contracts";
import { DatabaseService } from "../../common/db";
import { ApiRequestError } from "../../common/api-envelope";
import { ComplaintRepository } from "../complaint/complaint.repository";
import { buildSettlementDisputeCase } from "../complaint/settlement-dispute";

type Decision = "confirmed" | "disputed";
type DecisionRow = {
  decision_status: Decision;
  decision_note: string;
  decided_by: string;
  decided_at: Date | string;
  dispute_case_id: string | null;
  statement_snapshot: FleetPartnerStatementRecord;
  current_payout_status?: FleetPartnerStatementRecord["payoutStatus"];
};

export function statementDecisionLockKey(statementId: string): string {
  return `fleet-statement-decision:${statementId}`;
}

export function normalizeStatementDecisionNote(
  decision: Decision,
  value: unknown,
): string {
  if (value !== undefined && typeof value !== "string") {
    throw new ApiRequestError(
      400,
      "STATEMENT_NOTE_INVALID",
      "Note must be text.",
    );
  }
  const note = typeof value === "string" ? value.trim() : "";
  if (decision === "disputed" && !note) {
    throw new ApiRequestError(
      400,
      "STATEMENT_DISPUTE_REASON_REQUIRED",
      "A dispute reason is required.",
    );
  }
  return note;
}

function decisionView(row: DecisionRow): FleetPartnerStatementRecord {
  const at = new Date(row.decided_at).toISOString();
  return {
    ...row.statement_snapshot,
    payoutStatus:
      row.current_payout_status ?? row.statement_snapshot.payoutStatus,
    decisionStatus: row.decision_status,
    confirmedAt: row.decision_status === "confirmed" ? at : null,
    confirmedBy: row.decision_status === "confirmed" ? row.decided_by : null,
    confirmNote: row.decision_status === "confirmed" ? row.decision_note : null,
    disputedAt: row.decision_status === "disputed" ? at : null,
    disputedBy: row.decision_status === "disputed" ? row.decided_by : null,
    disputeReason:
      row.decision_status === "disputed" ? row.decision_note : null,
    disputeCaseId: row.dispute_case_id,
  };
}

@Injectable()
export class FleetStatementDecisionRepository {
  constructor(
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly complaints?: ComplaintRepository,
  ) {}

  isEnabled(): boolean {
    return this.database?.isEnabled() ?? false;
  }

  async listDecisions(
    fleetPartnerId: string,
    periodMonth?: string,
  ): Promise<FleetPartnerStatementRecord[]> {
    if (!this.isEnabled()) return [];
    const result = await this.database!.query<DecisionRow>(
      `SELECT d.decision_status, d.decision_note, d.decided_by, d.decided_at,
              d.dispute_case_id, d.statement_snapshot, s.payout_status AS current_payout_status
       FROM billing.phase1_fleet_statement_decisions d
       LEFT JOIN billing.phase1_fleet_partner_statements s
         ON s.statement_id = d.statement_id AND s.fleet_partner_id = d.fleet_partner_id
       WHERE d.fleet_partner_id = $1 AND ($2::text IS NULL OR d.period_month = $2)
       ORDER BY d.period_month DESC`,
      [fleetPartnerId, periodMonth ?? null],
    );
    return result.rows.map(decisionView);
  }

  async decide(
    fleetPartnerId: string,
    statementId: string,
    actorId: string,
    decision: Decision,
    value: unknown,
  ): Promise<FleetPartnerStatementRecord> {
    const note = normalizeStatementDecisionNote(decision, value);
    if (!this.isEnabled() || (decision === "disputed" && !this.complaints)) {
      throw new ApiRequestError(
        503,
        "STATEMENT_DECISION_UNAVAILABLE",
        "Statement persistence is unavailable.",
      );
    }
    const client = await this.database!.connect();
    try {
      await client.query("BEGIN");
      // The monthly generator takes this same lock before replacing rows.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [statementDecisionLockKey(statementId)],
      );
      const previous = await client.query<DecisionRow>(
        `SELECT d.decision_status, d.decision_note, d.decided_by, d.decided_at,
                d.dispute_case_id, d.statement_snapshot, s.payout_status AS current_payout_status
         FROM billing.phase1_fleet_statement_decisions d
         LEFT JOIN billing.phase1_fleet_partner_statements s
           ON s.statement_id = d.statement_id AND s.fleet_partner_id = d.fleet_partner_id
         WHERE d.statement_id = $1 AND d.fleet_partner_id = $2`,
        [statementId, fleetPartnerId],
      );
      const existing = previous.rows[0];
      if (existing) {
        if (
          existing.decision_status !== decision ||
          existing.decision_note !== note
        ) {
          throw new ApiRequestError(
            409,
            "STATEMENT_DECISION_CONFLICT",
            "This statement already has a different decision.",
          );
        }
        await client.query("COMMIT");
        return decisionView(existing);
      }
      const statementResult = await client.query<{
        record: FleetPartnerStatementRecord;
        payout_status: string;
      }>(
        `SELECT record, payout_status FROM billing.phase1_fleet_partner_statements
         WHERE statement_id = $1 AND fleet_partner_id = $2 FOR UPDATE`,
        [statementId, fleetPartnerId],
      );
      const current = statementResult.rows[0];
      if (!current) {
        throw new ApiRequestError(
          404,
          "STATEMENT_NOT_FOUND",
          "Statement not found for this fleet partner.",
        );
      }
      if (current.payout_status === "paid") {
        throw new ApiRequestError(
          409,
          "STATEMENT_ALREADY_PAID",
          "Paid statements cannot receive a new decision.",
        );
      }
      const at = new Date().toISOString();
      const dispute =
        decision === "disputed"
          ? buildSettlementDisputeCase({
              fleetPartnerId,
              statementId,
              reason: note,
              actorId,
              at,
            })
          : null;
      if (dispute) {
        await this.complaints!.persistChanges(dispute, client);
      }
      const row: DecisionRow = {
        decision_status: decision,
        decision_note: note,
        decided_by: actorId,
        decided_at: at,
        dispute_case_id: dispute?.complaintCases[0]!.caseNo ?? null,
        statement_snapshot: current.record,
      };
      await client.query(
        `INSERT INTO billing.phase1_fleet_statement_decisions
          (statement_id, fleet_partner_id, period_month, decision_status, decision_note,
           decided_by, decided_at, dispute_case_id, statement_snapshot)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          statementId,
          fleetPartnerId,
          current.record.periodMonth,
          decision,
          note,
          actorId,
          at,
          row.dispute_case_id,
          JSON.stringify(current.record),
        ],
      );
      await client.query("COMMIT");
      return decisionView(row);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
