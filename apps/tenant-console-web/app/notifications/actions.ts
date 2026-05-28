"use server";

import { revalidatePath } from "next/cache";
import type { TenantNotificationSubscription } from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";
import { NOTIFICATION_CHANNELS, NOTIFICATION_EVENT_CATALOG } from "./constants";

function collectSubscriptions(formData: FormData) {
  const subscriptions: TenantNotificationSubscription[] = [];

  for (const event of NOTIFICATION_EVENT_CATALOG) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const fieldName = `pref__${event.eventType}__${channel}`;
      subscriptions.push({
        eventType: event.eventType,
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
