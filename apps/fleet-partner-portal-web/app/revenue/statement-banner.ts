// Pure decision logic for the revenue-page statement banner, extracted so
// SR-FLEET-SETTLE-001 / R13 (revenue page simultaneously claiming "statement
// generated, please confirm" AND "no actionable statement") has a
// unit-testable single source of truth instead of being buried in JSX
// conditionals.
import type { FleetStatement } from "../../lib/fleet-portal-data.server";

export type StatementBannerState =
  | "no_statement"
  | "paid"
  | "pending"
  | "confirmed"
  | "disputed";

export function resolveStatementBannerState(
  currentStatement: Pick<FleetStatement, "status" | "decisionStatus"> | null,
): StatementBannerState {
  if (!currentStatement) {
    return "no_statement";
  }
  if (currentStatement.status === "paid") return "paid";
  if (
    currentStatement.decisionStatus === "confirmed" ||
    currentStatement.decisionStatus === "disputed"
  ) {
    return currentStatement.decisionStatus;
  }
  return "pending";
}
