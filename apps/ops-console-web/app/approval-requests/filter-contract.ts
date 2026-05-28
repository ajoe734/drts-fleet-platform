import type { TenantBookingApprovalRequestRecord } from "@drts/contracts";

export type ApprovalQueueStatusFilter =
  | "outstanding"
  | Extract<
      TenantBookingApprovalRequestRecord["status"],
      "pending" | "timeout_escalated"
    >;

export function normalizeApprovalQueueStatusFilter(
  value: string | undefined,
): ApprovalQueueStatusFilter {
  switch (value) {
    case "pending":
    case "timeout_escalated":
    case "outstanding":
      return value;
    default:
      return "outstanding";
  }
}
