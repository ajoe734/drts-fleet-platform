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

export async function nudgeApprovalRequestAction(
  approvalRequestId: string,
  reasonNote?: string,
): Promise<ApprovalActionResult> {
  if (!approvalRequestId.trim()) {
    return { ok: false, message: "MISSING_REQUEST" };
  }
  try {
    const client = await getServerOpsClient();
    await client.nudgeOpsApprovalRequest(approvalRequestId, {
      reasonNote: reasonNote?.trim() ? reasonNote.trim() : null,
    });
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
  revalidatePath("/approval-requests");
  return { ok: true };
}

export async function acknowledgeBreachAction(
  approvalRequestId: string,
  reasonNote?: string,
): Promise<ApprovalActionResult> {
  if (!approvalRequestId.trim()) {
    return { ok: false, message: "MISSING_REQUEST" };
  }
  try {
    const client = await getServerOpsClient();
    await client.acknowledgeOpsBreach(approvalRequestId, {
      reasonNote: reasonNote?.trim() ? reasonNote.trim() : null,
    });
  } catch (error) {
    return { ok: false, message: toMessage(error) };
  }
  revalidatePath("/approval-requests");
  return { ok: true };
}
