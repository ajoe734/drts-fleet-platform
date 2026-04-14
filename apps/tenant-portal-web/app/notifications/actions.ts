"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import type { TenantNotificationSubscription } from "@drts/contracts";

const EVENT_TYPES = [
  "booking_confirmed",
  "booking_cancelled",
  "booking_updated",
  "sla_breach",
  "sla_warning",
  "driver_assigned",
  "trip_completed",
  "invoice_generated",
  "payment_received",
];

const CHANNELS: Array<"email" | "webhook" | "ops_console"> = [
  "email",
  "webhook",
  "ops_console",
];

export interface PreferenceRow {
  eventType: string;
  channel: string;
  enabled: boolean;
}

export async function getNotificationPreferences(): Promise<{
  preferences: PreferenceRow[];
  error: string | null;
}> {
  const client = getTenantClient();
  try {
    // listNotifications returns NotificationRecord[]; we build a preference
    // matrix from the full event-type x channel cross product. The API may
    // return empty or partial data, so we default everything to disabled.
    await client.listNotifications();

    // Build default preference matrix
    const preferences: PreferenceRow[] = [];
    for (const eventType of EVENT_TYPES) {
      for (const channel of CHANNELS) {
        preferences.push({
          eventType,
          channel,
          enabled: false,
        });
      }
    }

    return { preferences, error: null };
  } catch (e) {
    return {
      preferences: [],
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function updateNotificationPreferences(
  formData: FormData,
): Promise<void> {
  const client = getTenantClient();
  const subscriptions: TenantNotificationSubscription[] = [];

  for (const eventType of EVENT_TYPES) {
    for (const channel of CHANNELS) {
      const key = `sub_${eventType}_${channel}`;
      const enabled = formData.get(key) === "on";
      subscriptions.push({ eventType, channel, enabled });
    }
  }

  await client.updateNotifications({ subscriptions });
  revalidatePath("/notifications");
}
