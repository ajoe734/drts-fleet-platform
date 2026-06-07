import Link from "next/link";
import { AppShellCard } from "@drts/ui-web";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./actions";
import type { PreferenceRow } from "./actions";
import { describeRoleSnapshot, getTenantRoleSnapshot } from "@/lib/rbac";
import { formatPortalUiError } from "@/lib/error-copy";
import { formatPortalCodeLabel } from "@/lib/localized-labels";

export default async function NotificationsPage() {
  const { preferences, error: fetchError } = await getNotificationPreferences();
  const roleSnapshot = await getTenantRoleSnapshot();

  return (
    <main className="app-grid">
      <AppShellCard
        title="通知偏好"
        description={
          roleSnapshot.capabilities.canWriteNotifications
            ? "設定哪些事件要送往哪些通知通道。"
            : `目前以 ${describeRoleSnapshot(roleSnapshot)} 身分檢視。這個角色可查看通知設定，但無法修改。`
        }
      >
        {fetchError && (
          <div className="error-banner">
            <strong>載入通知偏好失敗：</strong>{" "}
            {formatPortalUiError(fetchError, "無法載入通知偏好")}
          </div>
        )}

        <form action={updateNotificationPreferences}>
          <div className="data-table">
            <table>
              <thead>
                <tr>
                  <th>事件類型</th>
                  <th>電子郵件</th>
                  <th>回呼</th>
                  <th>營運控制台</th>
                </tr>
              </thead>
              <tbody>
                {preferences.length > 0 ? (
                  buildRows(preferences)
                ) : (
                  <tr>
                    <td colSpan={4} className="empty-state">
                      目前沒有通知偏好資料。
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
                ? "儲存偏好"
                : "唯讀"}
            </button>
          </div>
        </form>

        <Link className="route-link" href="/" style={{ marginTop: "1rem" }}>
          <strong>返回首頁</strong>
          回到租戶入口總覽。
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
          <code>{formatPortalCodeLabel(eventType, eventType)}</code>
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
