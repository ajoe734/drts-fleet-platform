"use server";

import { revalidatePath } from "next/cache";
import type {
  TenantNotificationSubscription,
  UpdateTenantNotificationsCommand,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

const CHANNELS = ["email", "webhook", "ops_console"] as const;
type NotificationChannel = (typeof CHANNELS)[number];

const SUBSCRIPTION_FIELD_PREFIX = "subscription:";

export type UpdateSubscriptionsFlash = {
  tone: "default" | "warning";
  title: string;
  description: string;
  updatedAt?: string;
};

function isNotificationChannel(value: string): value is NotificationChannel {
  return (CHANNELS as readonly string[]).includes(value);
}

function readEventTypes(formData: FormData): string[] {
  const raw = formData.get("eventTypes");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
    );
  } catch {
    return [];
  }
}

function buildSubscriptionsFromFormData(
  formData: FormData,
): TenantNotificationSubscription[] {
  const eventTypes = readEventTypes(formData);
  if (eventTypes.length === 0) {
    throw new Error("Subscription matrix is missing required event metadata.");
  }

  const subscriptions: TenantNotificationSubscription[] = [];
  for (const eventType of eventTypes) {
    for (const channel of CHANNELS) {
      const fieldName = `${SUBSCRIPTION_FIELD_PREFIX}${eventType}:${channel}`;
      const stateRaw = formData.get(`${fieldName}:state`);
      if (typeof stateRaw !== "string") {
        continue;
      }
      if (stateRaw === "not_provisioned") {
        continue;
      }

      const enabledRaw = formData.get(fieldName);
      const enabled = enabledRaw === "on" || enabledRaw === "true";
      subscriptions.push({ eventType, channel, enabled });
    }
  }

  if (subscriptions.length === 0) {
    throw new Error("No editable subscription cells were submitted.");
  }

  return subscriptions;
}

export async function updateNotificationSubscriptionsAction(
  formData: FormData,
): Promise<UpdateSubscriptionsFlash> {
  try {
    const subscriptions = buildSubscriptionsFromFormData(formData);
    const command: UpdateTenantNotificationsCommand = { subscriptions };

    const saved = await getTenantClient().updateNotifications(command);

    const enabledCount = subscriptions.filter((entry) => entry.enabled).length;
    revalidatePath("/notifications");

    const updatedAt =
      typeof (saved as { updatedAt?: unknown })?.updatedAt === "string"
        ? ((saved as { updatedAt: string }).updatedAt as string)
        : undefined;

    return {
      tone: "default",
      title: "通知訂閱已儲存",
      description: `已套用 ${subscriptions.length} 條訂閱規則，其中 ${enabledCount} 條為啟用。`,
      ...(updatedAt ? { updatedAt } : {}),
    };
  } catch (error) {
    return {
      tone: "warning",
      title: "儲存失敗",
      description:
        error instanceof Error ? error.message : "更新通知訂閱時發生未知錯誤。",
    };
  }
}

export { CHANNELS as NOTIFICATION_CHANNELS, isNotificationChannel };
