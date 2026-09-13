// Pure decision logic for the revenue-page statement banner, extracted so
// SR-FLEET-SETTLE-001 / R13 (revenue page simultaneously claiming "statement
// generated, please confirm" AND "no actionable statement") has a
// unit-testable single source of truth instead of being buried in JSX
// conditionals.
import type { FleetStatement } from "../../lib/fleet-portal-data.server";

export type StatementBannerState = "no_statement" | "paid" | "pending";

export function resolveStatementBannerState(
  currentStatement: Pick<FleetStatement, "status"> | null,
): StatementBannerState {
  if (!currentStatement) {
    return "no_statement";
  }
  return currentStatement.status === "paid" ? "paid" : "pending";
}
