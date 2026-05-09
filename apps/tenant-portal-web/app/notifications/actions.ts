"use server";

import { revalidatePath } from "next/cache";
import { getTenantClient } from "@/lib/api-client";
import { getTenantRoleSnapshot, requireCapability } from "@/lib/rbac";
import type {
  TenantNotificationPreferences,
  TenantNotificationSubscription,
} from "@drts/contracts";

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

function buildDefaultPreferences(): PreferenceRow[] {
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
  return preferences;
}

function preferencesFromApi(
  apiPrefs: TenantNotificationPreferences,
): PreferenceRow[] {
  return apiPrefs.subscriptions.map((sub) => ({
    eventType: sub.eventType,
    channel: sub.channel,
    enabled: sub.enabled,
  }));
}

export async function getNotificationPreferences(): Promise<{
  preferences: PreferenceRow[];
  error: string | null;
}> {
  const client = await getTenantClient();
  try {
    const prefs = (await client.getNotificationPreferences()) as
      | TenantNotificationPreferences
      | undefined;
    if (prefs && prefs.subscriptions) {
      return { preferences: preferencesFromApi(prefs), error: null };
    }
    // Fallback to defaults if API returns empty/unexpected
    return { preferences: buildDefaultPreferences(), error: null };
  } catch (e) {
    return {
      preferences: buildDefaultPreferences(),
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function updateNotificationPreferences(
  formData: FormData,
): Promise<void> {
  const snapshot = await getTenantRoleSnapshot();
  requireCapability(
    snapshot.capabilities.canWriteNotifications,
    "Tenant write authority required to update notification preferences.",
  );
  const client = await getTenantClient();
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
