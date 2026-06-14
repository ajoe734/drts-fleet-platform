import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./actions";
import type { PreferenceRow } from "./actions";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function NotificationsPage() {
  const locale = await getServerLocale();
  const { preferences, error: fetchError } = await getNotificationPreferences();
  const roleSnapshot = await getTenantRoleSnapshot();

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("notifications.title", locale)}
        description={
          roleSnapshot.capabilities.canWriteNotifications
            ? t("notifications.description.canWrite", locale)
            : t("notifications.description.readOnly", locale, {
                role: describeRoleSnapshot(roleSnapshot, locale),
              })
        }
      >
        {fetchError && (
          <div className="error-banner">
            <strong>{t("notifications.error.loadLabel", locale)}</strong>{" "}
            {fetchError}
          </div>
        )}

        <form action={updateNotificationPreferences}>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>{t("notifications.table.eventType", locale)}</th>
                  <th>{t("notifications.table.email", locale)}</th>
                  <th>{t("notifications.table.webhook", locale)}</th>
                  <th>{t("notifications.table.opsConsole", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {preferences.length > 0 ? (
                  buildRows(preferences)
                ) : (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      {t("notifications.empty", locale)}
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
                ? t("notifications.button.save", locale)
                : t("notifications.button.readOnly", locale)}
            </button>
          </div>
        </form>

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>{t("notifications.backLink.title", locale)}</strong>
          {t("notifications.backLink.description", locale)}
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
