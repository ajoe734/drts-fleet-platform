"use server";

import { revalidatePath } from "next/cache";
import type { TenantNotificationSubscription } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { NOTIFICATION_CHANNELS } from "./constants";

function collectSubscriptions(formData: FormData) {
  const subscriptions: TenantNotificationSubscription[] = [];
  const eventTypes = [...new Set(formData.getAll("notification_event_type"))]
    .filter((value): value is string => typeof value === "string")
    .sort((left, right) => left.localeCompare(right, "en"));

  for (const eventType of eventTypes) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const fieldName = `pref__${eventType}__${channel}`;
      subscriptions.push({
        eventType,
        channel,
        enabled: formData.get(fieldName) === "on",
      });
    }
  }

  return subscriptions;
}

export async function updateNotificationPreferencesAction(formData: FormData) {
  const client = getTenantClient();
  await client.updateNotifications({
    subscriptions: collectSubscriptions(formData),
  });
  revalidatePath("/notifications");
}
