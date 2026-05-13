export type ApprovalNotificationTemplateKey =
  | "new_request"
  | "approaching_timeout"
  | "escalated"
  | "approved"
  | "rejected";

export type ApprovalNotificationLocale = "zh" | "en";

export type ApprovalNotificationTemplateContext = {
  recipientDisplayName: string | null;
  bookingId: string;
  orderId: string;
  approvalRequestId: string;
  timeoutAt: string;
  escalatedAt?: string | null;
  decidedAt?: string | null;
  actorUserId?: string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
};

export type RenderedApprovalNotificationTemplate = {
  subject: string;
  title: string;
  message: string;
  body: string;
};

function buildSummaryLines(context: ApprovalNotificationTemplateContext) {
  return [
    `Booking ID: ${context.bookingId}`,
    `Order ID: ${context.orderId}`,
    `Approval Request ID: ${context.approvalRequestId}`,
    `Timeout At: ${context.timeoutAt}`,
    context.escalatedAt ? `Escalated At: ${context.escalatedAt}` : null,
    context.decidedAt ? `Decided At: ${context.decidedAt}` : null,
    context.actorUserId ? `Actor User ID: ${context.actorUserId}` : null,
    context.reasonCode ? `Reason Code: ${context.reasonCode}` : null,
    context.reasonNote ? `Reason Note: ${context.reasonNote}` : null,
  ].filter((value): value is string => value !== null);
}

function buildGreeting(
  locale: ApprovalNotificationLocale,
  displayName: string | null,
) {
  if (locale === "zh") {
    return displayName ? `${displayName} 您好：` : "您好：";
  }
  return displayName ? `Hello ${displayName},` : "Hello,";
}

export function renderApprovalNotificationTemplate(
  templateKey: ApprovalNotificationTemplateKey,
  locale: ApprovalNotificationLocale,
  context: ApprovalNotificationTemplateContext,
): RenderedApprovalNotificationTemplate {
  const greeting = buildGreeting(locale, context.recipientDisplayName);
  const summary = buildSummaryLines(context).join("\n");

  switch (templateKey) {
    case "new_request":
      return locale === "zh"
        ? {
            subject: `待審批用車申請 ${context.bookingId}`,
            title: "新的審批申請待處理",
            message: `Booking ${context.bookingId} 已建立審批申請，請在 ${context.timeoutAt} 前處理。`,
            body: [
              greeting,
              "您有一筆新的用車審批申請待處理。",
              summary,
            ].join("\n\n"),
          }
        : {
            subject: `Approval required for booking ${context.bookingId}`,
            title: "New approval request",
            message: `Booking ${context.bookingId} is waiting for your decision before ${context.timeoutAt}.`,
            body: [
              greeting,
              "A new booking approval request is waiting for your decision.",
              summary,
            ].join("\n\n"),
          };
    case "approaching_timeout":
      return locale === "zh"
        ? {
            subject: `審批即將逾時 ${context.bookingId}`,
            title: "審批即將逾時",
            message: `Booking ${context.bookingId} 的審批將於 ${context.timeoutAt} 逾時。`,
            body: [
              greeting,
              "這筆審批申請距離逾時剩下 12 小時內，請儘速處理。",
              summary,
            ].join("\n\n"),
          }
        : {
            subject: `Approval timeout approaching for booking ${context.bookingId}`,
            title: "Approval request nearing timeout",
            message: `Booking ${context.bookingId} will time out at ${context.timeoutAt}.`,
            body: [
              greeting,
              "This approval request is within the 12-hour timeout window and needs action soon.",
              summary,
            ].join("\n\n"),
          };
    case "escalated":
      return locale === "zh"
        ? {
            subject: `審批已升級 ${context.bookingId}`,
            title: "審批逾時已升級",
            message: `Booking ${context.bookingId} 因逾時已升級處理。`,
            body: [
              greeting,
              "原始審批已逾時，系統已將此申請升級到新的處理對象。",
              summary,
            ].join("\n\n"),
          }
        : {
            subject: `Approval escalated for booking ${context.bookingId}`,
            title: "Approval request escalated",
            message: `Booking ${context.bookingId} was escalated after timing out.`,
            body: [
              greeting,
              "The original approval request timed out and was escalated to a new approver.",
              summary,
            ].join("\n\n"),
          };
    case "approved":
      return locale === "zh"
        ? {
            subject: `審批已通過 ${context.bookingId}`,
            title: "審批已通過",
            message: `Booking ${context.bookingId} 的審批申請已通過。`,
            body: [
              greeting,
              "這筆用車審批申請已通過。",
              summary,
            ].join("\n\n"),
          }
        : {
            subject: `Approval completed for booking ${context.bookingId}`,
            title: "Approval request approved",
            message: `Booking ${context.bookingId} has been approved.`,
            body: [
              greeting,
              "This booking approval request has been approved.",
              summary,
            ].join("\n\n"),
          };
    case "rejected":
      return locale === "zh"
        ? {
            subject: `審批已拒絕 ${context.bookingId}`,
            title: "審批已拒絕",
            message: `Booking ${context.bookingId} 的審批申請已被拒絕。`,
            body: [
              greeting,
              "這筆用車審批申請已被拒絕。",
              summary,
            ].join("\n\n"),
          }
        : {
            subject: `Approval rejected for booking ${context.bookingId}`,
            title: "Approval request rejected",
            message: `Booking ${context.bookingId} has been rejected.`,
            body: [
              greeting,
              "This booking approval request has been rejected.",
              summary,
            ].join("\n\n"),
          };
  }
}
