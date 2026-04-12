import Link from "next/link";
import type {
  NotificationRecord,
  TenantWebhookEndpoint,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export default async function WebhooksPage() {
  const client = getTenantClient();

  let webhooks: TenantWebhookEndpoint[] = [];
  let notifications: NotificationRecord[] = [];
  let error: string | null = null;

  try {
    const [webhookData, notifData] = await Promise.all([
      client.listWebhooks(),
      client.listNotifications(),
    ]);
    webhooks = webhookData;
    notifications = notifData;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  return (
    <main className="app-grid">
      <AppShellCard
        title="Webhooks & Notifications"
        description={`Fetched from /api/tenant/webhooks and /api/notifications. ${webhooks.length} webhook(s), ${notifications.length} notification(s).`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="webhooks-section">
          <h3>Webhook Endpoints</h3>
          {webhooks.length > 0 ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Webhook ID</th>
                    <th>URL</th>
                    <th>Status</th>
                    <th>Secret</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((webhook) => (
                    <tr key={webhook.webhookId}>
                      <td>{webhook.webhookId}</td>
                      <td>
                        <code>{webhook.url}</code>
                      </td>
                      <td>{webhook.status}</td>
                      <td>{webhook.secretPreview}</td>
                      <td>{new Date(webhook.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No webhook endpoints configured.</p>
          )}
        </div>

        <div className="notifications-section">
          <h3>Recent Notifications</h3>
          {notifications.length > 0 ? (
            <div className="data-table">
              <table>
                <thead>
                  <tr>
                    <th>Notification ID</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((notification) => (
                    <tr key={notification.notificationId}>
                      <td>{notification.notificationId}</td>
                      <td>{notification.title}</td>
                      <td>{notification.status}</td>
                      <td>
                        {new Date(notification.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No notifications.</p>
          )}
        </div>

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
