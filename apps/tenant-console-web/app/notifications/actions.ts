"use server";

import { revalidatePath } from "next/cache";
import type {
  ActionReceipt,
  AuditLogRecord,
  TenantNotificationSubscription,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

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
  const subscriptions = Array.from(formData.entries())
    .filter(([key]) => key.startsWith("sub__"))
    .flatMap(([key, value]) => {
      const [, eventType, channel] = key.split("__");
      if (!eventType || !isNotificationChannel(channel)) {
        return [];
      }

      return {
        eventType,
        channel,
        enabled: value === "1",
      };
    });

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
        (audit.actionName === "update_notification_preferences" ||
          audit.actionName === "update_notification_subscription"),
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

function isNotificationChannel(
  value: string,
): value is TenantNotificationSubscription["channel"] {
  return value === "email" || value === "webhook" || value === "ops_console";
}
