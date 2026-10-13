"use server";

import type { FleetPartnerStatementRecord } from "@drts/contracts";
import { revalidatePath } from "next/cache";
import { getServerFleetPartnerClient } from "../../lib/api-client.server";

export type StatementDecisionResult =
  | { ok: true; statement: FleetPartnerStatementRecord }
  | { ok: false; error: string };

export async function submitStatementDecision(
  statementId: string,
  decision: "confirmed" | "disputed",
  text: string,
): Promise<StatementDecisionResult> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const trimmed = text.trim();
    if (decision === "disputed" && !trimmed) {
      return { ok: false, error: "STATEMENT_DISPUTE_REASON_REQUIRED" };
    }
    const statement =
      decision === "confirmed"
        ? await client.confirmFleetPartnerStatement(
            statementId,
            trimmed ? { note: trimmed } : {},
          )
        : await client.disputeFleetPartnerStatement(statementId, {
            reason: trimmed,
          });
    revalidatePath("/statements");
    revalidatePath(`/statements/${encodeURIComponent(statementId)}`);
    revalidatePath("/revenue");
    if (statement.disputeCaseId) {
      revalidatePath("/cases");
      revalidatePath(`/cases/${encodeURIComponent(statement.disputeCaseId)}`);
    }
    return { ok: true, statement };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? "apiMessage" in error && typeof error.apiMessage === "string"
            ? error.apiMessage
            : error.message
          : "STATEMENT_DECISION_FAILED",
    };
  }
}
