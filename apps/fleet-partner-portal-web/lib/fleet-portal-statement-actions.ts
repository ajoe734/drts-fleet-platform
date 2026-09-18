import type { FleetStatement } from "./fleet-portal-fixtures";

export type StatementDecisionType = "confirmed" | "disputed";

export interface StatementDecision {
  decision: StatementDecisionType;
  requestedAt: string;
  reason?: string;
}

export type StatementDecisionMap = Record<string, StatementDecision>;

export function buildStatementStorageKey(fleetPartnerId: string): string {
  return `drts:fleet-partner-portal:statements:${fleetPartnerId}`;
}

export function parseStatementDecisionMap(
  raw: string | null | undefined,
): StatementDecisionMap {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => {
        if (!value || typeof value !== "object") {
          return false;
        }
        const record = value as Partial<StatementDecision>;
        return (
          (record.decision === "confirmed" || record.decision === "disputed") &&
          typeof record.requestedAt === "string"
        );
      }),
    );
  } catch {
    return {};
  }
}

export function buildStatementArtifactContent(args: {
  fleetPartnerId: string;
  statement: FleetStatement;
  downloadedAt: string;
}): string {
  const { fleetPartnerId, statement, downloadedAt } = args;
  return [
    "DRTS Fleet Statement Artifact Request",
    `fleet_partner_id=${fleetPartnerId}`,
    `statement_id=${statement.id}`,
    `period=${statement.period}`,
    `status=${statement.status}`,
    `payable=${statement.payable}`,
    `downloaded_at=${downloadedAt}`,
  ].join("\n");
}

export function buildStatementDecisionRequestContent(args: {
  fleetPartnerId: string;
  statement: FleetStatement;
  decision: StatementDecision;
}): string {
  const { fleetPartnerId, statement, decision } = args;
  return [
    "DRTS Fleet Statement Action Request",
    `fleet_partner_id=${fleetPartnerId}`,
    `statement_id=${statement.id}`,
    `period=${statement.period}`,
    `action=${decision.decision}`,
    `requested_at=${decision.requestedAt}`,
    `reason=${decision.reason?.trim() || "—"}`,
  ].join("\n");
}
