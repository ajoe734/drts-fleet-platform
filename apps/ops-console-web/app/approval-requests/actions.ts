"use server";

import { revalidatePath } from "next/cache";
import { getServerOpsClient } from "@/lib/api-client.server";

export type ApprovalActionResult =
  | { ok: true }
  | { ok: false; message: string };

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

export async function approveApprovalRequestAction(
  approvalRequestId: string,
  reasonNote: string,
): Promise<ApprovalActionResult> {
  if (!approvalRequestId.trim() || !reasonNote.trim()) {
    return { ok: false, message: "MISSING_REQUEST_OR_REASON" };
  }
  try {
    const client = await getServerOpsClient();
    await client.approveOpsApprovalRequest(approvalRequestId, {
      reasonNote: reasonNote.trim(),
    });
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
  revalidatePath("/approval-requests");
  return { ok: true };
}

export async function rejectApprovalRequestAction(
  approvalRequestId: string,
  reasonNote: string,
): Promise<ApprovalActionResult> {
  if (!approvalRequestId.trim() || !reasonNote.trim()) {
    return { ok: false, message: "MISSING_REQUEST_OR_REASON" };
  }
  try {
    const client = await getServerOpsClient();
    await client.rejectOpsApprovalRequest(approvalRequestId, {
      reasonCode: "ops_triage_rejected",
      reasonNote: reasonNote.trim(),
    });
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
  revalidatePath("/approval-requests");
  return { ok: true };
}

export async function escalateApprovalRequestAction(
  approvalRequestId: string,
  reasonNote: string,
): Promise<ApprovalActionResult> {
  if (!approvalRequestId.trim() || !reasonNote.trim()) {
    return { ok: false, message: "MISSING_REQUEST_OR_REASON" };
  }
  try {
    const client = await getServerOpsClient();
    await client.escalateOpsApprovalRequest(approvalRequestId, {
      reasonNote: reasonNote.trim(),
    });
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
  revalidatePath("/approval-requests");
  return { ok: true };
}
