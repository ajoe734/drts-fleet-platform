"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  TENANT_BOOKING_APPROVAL_REQUEST_STATUSES,
  type TenantBookingApprovalRequestStatus,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";

const APPROVAL_REQUESTS_PATH = "/approval-requests";
const STATUS_VALUES = new Set<string>([
  "all",
  ...TENANT_BOOKING_APPROVAL_REQUEST_STATUSES,
]);

type ApprovalQueueSearchState = {
  approvalRequestId: string;
  tenantId: string;
  status: TenantBookingApprovalRequestStatus | "all";
  expiresWithinHours: string;
};

type ApprovalQueueFlash = {
  action: "nudge" | "acknowledge";
  result: "success" | "error";
  message?: string;
};

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseStatus(
  value: string,
): TenantBookingApprovalRequestStatus | "all" {
  if (STATUS_VALUES.has(value)) {
    return value as TenantBookingApprovalRequestStatus | "all";
  }
  return "pending";
}

function readSearchState(formData: FormData): ApprovalQueueSearchState {
  return {
    approvalRequestId: readText(formData, "approvalRequestId"),
    tenantId: readText(formData, "tenantId"),
    status: parseStatus(readText(formData, "status")),
    expiresWithinHours: readText(formData, "expiresWithinHours"),
  };
}

function buildApprovalQueueHref(
  state: ApprovalQueueSearchState,
  flash: ApprovalQueueFlash,
) {
  const searchParams = new URLSearchParams();

  if (state.tenantId) {
    searchParams.set("tenantId", state.tenantId);
  }
  if (state.status) {
    searchParams.set("status", state.status);
  }
  if (state.expiresWithinHours) {
    searchParams.set("expiresWithinHours", state.expiresWithinHours);
  }
  if (state.approvalRequestId) {
    searchParams.set("approvalRequestId", state.approvalRequestId);
  }

  searchParams.set("flashAction", flash.action);
  searchParams.set("flashResult", flash.result);
  if (flash.message) {
    searchParams.set("flashMessage", flash.message);
  }

  const query = searchParams.toString();
  return query ? `${APPROVAL_REQUESTS_PATH}?${query}` : APPROVAL_REQUESTS_PATH;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown action error";
}

export async function nudgeApprovalRequest(formData: FormData) {
  const state = readSearchState(formData);
  const reasonNote = readText(formData, "reasonNote");

  let flash: ApprovalQueueFlash;

  if (!state.approvalRequestId) {
    flash = {
      action: "nudge",
      result: "error",
      message: "Missing approvalRequestId.",
    };
  } else {
    try {
      const client = await getServerOpsClient();
      await client.nudgeOpsApprovalRequest(state.approvalRequestId, {
        reasonNote: reasonNote || null,
      });
      flash = {
        action: "nudge",
        result: "success",
      };
    } catch (error) {
      flash = {
        action: "nudge",
        result: "error",
        message: toErrorMessage(error),
      };
    }
  }

  revalidatePath(APPROVAL_REQUESTS_PATH);
  redirect(buildApprovalQueueHref(state, flash));
}

export async function acknowledgeApprovalRequestBreach(formData: FormData) {
  const state = readSearchState(formData);
  const reasonNote = readText(formData, "reasonNote");

  let flash: ApprovalQueueFlash;

  if (!state.approvalRequestId) {
    flash = {
      action: "acknowledge",
      result: "error",
      message: "Missing approvalRequestId.",
    };
  } else {
    try {
      const client = await getServerOpsClient();
      await client.acknowledgeOpsBreach(state.approvalRequestId, {
        reasonNote: reasonNote || null,
      });
      flash = {
        action: "acknowledge",
        result: "success",
      };
    } catch (error) {
      flash = {
        action: "acknowledge",
        result: "error",
        message: toErrorMessage(error),
      };
    }
  }

  revalidatePath(APPROVAL_REQUESTS_PATH);
  redirect(buildApprovalQueueHref(state, flash));
}
