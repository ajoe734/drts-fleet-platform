import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./actions";
import type { PreferenceRow } from "./actions";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";

export default async function NotificationsPage() {
  const { preferences, error: fetchError } = await getNotificationPreferences();
  const roleSnapshot = await getTenantRoleSnapshot();

  return (
    <main className="app-grid">
      <AppShellCard
        title="Notification Preferences"
        description={
          roleSnapshot.capabilities.canWriteNotifications
            ? "Configure which events are sent to which channels."
            : `Viewing as ${describeRoleSnapshot(roleSnapshot)}. This role can review notification posture but cannot change it.`
        }
      >
        {fetchError && (
          <div className="error-banner">
            <strong>Error loading preferences:</strong> {fetchError}
          </div>
        )}

        <form action={updateNotificationPreferences}>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Email</th>
                  <th>Webhook</th>
                  <th>Ops Console</th>
                </tr>
              </thead>
              <tbody>
                {preferences.length > 0 ? (
                  buildRows(preferences)
                ) : (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      No notification preferences available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: "1rem" }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={!roleSnapshot.capabilities.canWriteNotifications}
            >
              {roleSnapshot.capabilities.canWriteNotifications
                ? "Save Preferences"
                : "Read-only"}
            </button>
          </div>
        </form>

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}

function buildRows(preferences: PreferenceRow[]) {
  const eventTypes = Array.from(new Set(preferences.map((p) => p.eventType)));
  const channels = ["email", "webhook", "ops_console"] as const;

  return eventTypes.map((eventType) => {
    const row: Record<string, boolean> = {};
    for (const channel of channels) {
      const pref = preferences.find(
        (p) => p.eventType === eventType && p.channel === channel,
      );
      row[channel] = pref ? pref.enabled : false;
    }

    return (
      <tr key={eventType}>
        <td>
          <code>{eventType}</code>
        </td>
        {channels.map((ch) => (
          <td key={ch}>
            <input
              type="checkbox"
              name={`sub_${eventType}_${ch}`}
              defaultChecked={row[ch]}
            />
          </td>
        ))}
      </tr>
    );
  });
}
