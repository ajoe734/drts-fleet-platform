"use server";

import { revalidatePath } from "next/cache";
import type { ActionReceipt, AuditLogRecord } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  getNotificationFieldName,
} from "./notification-preferences-model";

export type SaveNotificationState = {
  ok: boolean;
  message: string | null;
  receipt: ActionReceipt | null;
};

export async function saveNotificationPreferences(
  _previousState: SaveNotificationState,
  formData: FormData,
): Promise<SaveNotificationState> {
  const client = getTenantClient();

  const subscriptions = NOTIFICATION_EVENTS.flatMap((event) =>
    NOTIFICATION_CHANNELS.map((channel) => ({
      eventType: event.eventType,
      channel,
      enabled:
        formData.get(getNotificationFieldName(event.eventType, channel)) ===
        "1",
    })),
  );

  try {
    await client.updateNotifications({ subscriptions });
    const audits = await client.listAuditLogs();
    const receipt = buildReceipt(audits);

    revalidatePath("/notifications");
    revalidatePath("/settings");

    return {
      ok: true,
      message: receipt
        ? "通知偏好已更新，receipt 與 audit 追蹤已建立。"
        : "通知偏好已更新，但目前無法讀到對應 audit receipt。",
      receipt,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown error",
      receipt: null,
    };
  }
}

function buildReceipt(audits: AuditLogRecord[]): ActionReceipt | null {
  const latestAudit = [...audits]
    .filter(
      (audit) =>
        audit.resourceType === "tenant_notifications" &&
        audit.actionName === "update_notification_subscription",
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  if (!latestAudit?.resourceId) {
    return null;
  }

  return {
    actionId: latestAudit.requestId,
    auditId: latestAudit.auditId,
    resourceType: latestAudit.resourceType,
    resourceId: latestAudit.resourceId,
    status: "completed",
    message: "Notification preference update recorded.",
  };
}
