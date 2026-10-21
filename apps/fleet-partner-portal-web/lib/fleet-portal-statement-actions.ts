import type { FleetPartnerStatementRecord } from "@drts/contracts";
import type {
  FleetStatement,
  FleetStatementDecision,
} from "./fleet-portal-fixtures";

// Only server records supply decision state; legacy browser storage is ignored.
export function mapStatementDecision(
  record: FleetPartnerStatementRecord,
): FleetStatementDecision {
  return {
    decisionStatus: record.decisionStatus ?? "unreviewed",
    confirmedAt: record.confirmedAt ?? null,
    confirmedBy: record.confirmedBy ?? null,
    confirmNote: record.confirmNote ?? null,
    disputedAt: record.disputedAt ?? null,
    disputedBy: record.disputedBy ?? null,
    disputeReason: record.disputeReason ?? null,
    disputeCaseId: record.disputeCaseId ?? null,
  };
}

export function statementDisplayStatus(
  statement: Pick<FleetStatement, "status" | "decisionStatus">,
): "paid" | "pending_confirm" | "confirmed" | "disputed" {
  if (statement.status === "paid") return "paid";
  if (
    statement.decisionStatus === "confirmed" ||
    statement.decisionStatus === "disputed"
  ) {
    return statement.decisionStatus;
  }
  return "pending_confirm";
}
