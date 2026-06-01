import type {
  NotificationRecord,
  TenantNotificationPreferences,
  TenantNotificationSubscription,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type NotificationsPageData = {
  preferences: TenantNotificationPreferences | null;
  feed: NotificationRecord[];
  errors: string[];
};

async function loadNotificationsPageData(): Promise<NotificationsPageData> {
  const client = getTenantClient();
  const [preferencesResult, feedResult] = await Promise.allSettled([
    client.getNotificationPreferences() as Promise<TenantNotificationPreferences>,
    client.listTenantNotificationFeed() as Promise<NotificationRecord[]>,
  ]);

  const errors: string[] = [];

  if (preferencesResult.status === "rejected") {
    errors.push(
      preferencesResult.reason instanceof Error
        ? preferencesResult.reason.message
        : "Unable to load notification subscriptions.",
    );
  }

  if (feedResult.status === "rejected") {
    errors.push(
      feedResult.reason instanceof Error
        ? feedResult.reason.message
        : "Unable to load tenant notification feed.",
    );
  }

  return {
    preferences:
      preferencesResult.status === "fulfilled" ? preferencesResult.value : null,
    feed: feedResult.status === "fulfilled" ? feedResult.value : [],
    errors,
  };
}

function buildPreferenceRows(subscriptions: TenantNotificationSubscription[]) {
  const eventTypes = Array.from(
    new Set(subscriptions.map((subscription) => subscription.eventType)),
  ).sort((left, right) => left.localeCompare(right, "en"));
  const channels = ["email", "webhook", "ops_console"] as const;

  return eventTypes.map((eventType) => ({
    eventType,
    channelState: Object.fromEntries(
      channels.map((channel) => [
        channel,
        subscriptions.find(
          (subscription) =>
            subscription.eventType === eventType &&
            subscription.channel === channel,
        )?.enabled ?? false,
      ]),
    ) as Record<(typeof channels)[number], boolean>,
  }));
}

export default async function NotificationsPage() {
  const data = await loadNotificationsPageData();
  const subscriptions = data.preferences?.subscriptions ?? [];
  const preferenceRows = buildPreferenceRows(subscriptions);
  const enabledSubscriptions = subscriptions.filter(
    (subscription) => subscription.enabled,
  ).length;
  const unreadFeed = data.feed.filter(
    (item) => item.status === "unread",
  ).length;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Notifications"
        title="Tenant notification posture now lives on a dedicated route instead of staying buried in settings."
        description="This surface separates delivery subscriptions from the actual notification feed so admins can compare intent, channel coverage, and recent unread operational signals."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Subscriptions</span>
          <strong>{formatCount(subscriptions.length)}</strong>
          <p>
            {formatCount(enabledSubscriptions)} channel rule(s) currently
            enabled.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Feed items</span>
          <strong>{formatCount(data.feed.length)}</strong>
          <p>{formatCount(unreadFeed)} unread item(s) still need review.</p>
        </article>
      </section>

      <SurfaceCard
        kicker="Preferences"
        title="Event-to-channel matrix"
        description="The matrix keeps the canonical `eventType × channel` subscription contract visible even when a channel is currently turned off."
      >
        {preferenceRows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-grid">
              <thead>
                <tr>
                  <th>Event type</th>
                  <th>Email</th>
                  <th>Webhook</th>
                  <th>Ops console</th>
                </tr>
              </thead>
              <tbody>
                {preferenceRows.map((row) => (
                  <tr key={row.eventType}>
                    <td>
                      <div className="table-primary">
                        <span>{row.eventType}</span>
                      </div>
                    </td>
                    <td>{row.channelState.email ? "Enabled" : "Off"}</td>
                    <td>{row.channelState.webhook ? "Enabled" : "Off"}</td>
                    <td>{row.channelState.ops_console ? "Enabled" : "Off"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-panel">
            Notification preferences were not returned for this tenant context.
          </div>
        )}
      </SurfaceCard>

      <SurfaceCard
        kicker="Feed"
        title={`Recent feed items (${formatCount(data.feed.length)})`}
        description="Recent tenant messages remain visible here so admins can trace unread SLA, approval, or ops notices back to the subscription posture above."
      >
        {data.feed.length > 0 ? (
          <ul className="timeline-list">
            {data.feed.slice(0, 8).map((item) => (
              <li className="timeline-item" key={item.notificationId}>
                <strong>{item.title}</strong>
                <p>
                  {item.channel} · {item.status} ·{" "}
                  {formatDateTime(item.createdAt)}
                </p>
                <p>{item.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-panel">
            No tenant notification feed items were returned.
          </div>
        )}
      </SurfaceCard>

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Partial data warning"
          description="One or more notification reads failed; the route keeps rendering the slices that did resolve."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}
    </div>
  );
}
