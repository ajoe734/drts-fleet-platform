import Link from "next/link";
import type {
  BookingRecord,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { formatCount, formatDateTime } from "@/lib/formatters";

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

export const dynamic = "force-dynamic";

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
};

async function loadDashboardData(): Promise<DashboardData> {
  const client = getTenantClient();
  const [
    identityResult,
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    governanceResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({ tenantId: "tenant-demo-001" }),
    client.listTenantBookings(),
    client.listInvoices(),
    client.listTenantNotificationFeed(),
    client.getTenantIntegrationGovernancePackage(),
  ]);

  const errors: string[] = [];
  const collectError = (
    label: string,
    result: PromiseSettledResult<unknown>,
  ) => {
    if (result.status === "rejected") {
      errors.push(
        `${label}: ${result.reason instanceof Error ? result.reason.message : "Unknown error"}`,
      );
    }
  };

  collectError("Identity", identityResult);
  collectError("Feature flags", flagsResult);
  collectError("Bookings", bookingsResult);
  collectError("Invoices", invoicesResult);
  collectError("Notifications", notificationsResult);
  collectError("Integration governance", governanceResult);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : [],
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    notifications:
      notificationsResult.status === "fulfilled"
        ? notificationsResult.value
        : [],
    governance:
      governanceResult.status === "fulfilled" ? governanceResult.value : null,
    errors,
  };
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const activeBookings = data.bookings.filter(
    (booking) =>
      booking.orderStatus !== "completed" &&
      booking.orderStatus !== "cancelled",
  );
  const attentionBookings = activeBookings.filter((booking) =>
    ATTENTION_STATUSES.has(booking.orderStatus),
  );
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled) ?? [];
  const recentNotifications = data.notifications.slice(0, 3);

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Home"
        title="Tenant operators now land in a real admin workspace, not a launcher page."
        description="This dashboard anchors the tenant identity context, active-booking summary, billing reminders, integration posture, and quick-entry actions on top of the new `apps/tenant-console-web` shell."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Active bookings</span>
          <strong>{formatCount(activeBookings.length)}</strong>
          <p>
            {attentionBookings.length > 0
              ? `${formatCount(attentionBookings.length)} booking(s) need follow-up across dispatch or proof states.`
              : "No active bookings currently need tenant-side follow-up."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Open invoices</span>
          <strong>{formatCount(openInvoices.length)}</strong>
          <p>
            {data.invoices.length > 0
              ? `${formatCount(data.invoices.length)} invoice artifact(s) are visible from tenant billing authority.`
              : "Invoice artifacts are not currently available for this tenant context."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Notifications</span>
          <strong>{formatCount(recentNotifications.length)}</strong>
          <p>
            {recentNotifications.length > 0
              ? "Recent platform and tenant reminders are surfaced here before a user drills into settings."
              : "No tenant notification feed items were returned in the current snapshot."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Integration posture</span>
          <strong>
            {data.governance?.onboardingChecklist.length
              ? formatCount(data.governance.onboardingChecklist.length)
              : "Ready"}
          </strong>
          <p>
            {data.governance?.onboardingChecklist.length
              ? "Checklist items still frame the integration work that API keys and webhooks must cover."
              : "No outstanding onboarding checklist items were returned."}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Identity"
          title="Tenant authority context"
          description="The dashboard reads the backend identity context directly so role, realm, and tenant ownership stay authority-driven."
        >
          <dl className="definition-grid">
            <div>
              <dt>Tenant</dt>
              <dd>{data.identity?.tenantId ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Realm</dt>
              <dd>{data.identity?.realm ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>{data.identity?.actorType ?? "Unavailable"}</dd>
            </div>
            <div>
              <dt>Auth mode</dt>
              <dd>{data.identity?.authMode ?? "Unavailable"}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Bookings"
          title="Tenant operations quick lane"
          description="Bookings remain the primary operating surface, with the route list and detail model now anchored to `/bookings`."
        >
          <div className="panel-stack">
            <p>
              Next reservation window:{" "}
              <strong>
                {activeBookings[0]
                  ? formatDateTime(activeBookings[0].reservationWindowStart)
                  : "No active reservation queued"}
              </strong>
            </p>
            <div className="link-row">
              <Link className="text-link" href="/bookings">
                Open booking oversight
              </Link>
              <Link className="text-link" href="/bookings/new">
                Start new booking intake
              </Link>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Billing and notices"
          title="Operational reminders stay visible"
          description="Billing posture and notification reminders sit on the home lane so tenant admins do not need to discover them through secondary navigation."
        >
          {recentNotifications.length > 0 ? (
            <ul className="panel-list">
              {recentNotifications.map((notification) => (
                <li key={notification.notificationId}>
                  <strong>{notification.title}</strong>
                  <span className="list-note">
                    {notification.channel} ·{" "}
                    {formatDateTime(notification.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              No tenant notification feed items are currently available.
            </p>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="Integration"
          title="Integration readiness and governance"
          description="Integration reminders summarize the backend-owned checklist instead of inventing client-local readiness truth."
        >
          {data.governance?.onboardingChecklist.length ? (
            <ul className="panel-list">
              {data.governance.onboardingChecklist.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              API key and webhook onboarding is not currently reporting any open
              checklist item.
            </p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/api-keys">
              Review API keys
            </Link>
            <Link className="text-link" href="/webhooks">
              Review webhooks
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="Enabled module snapshot"
        description={
          enabledFlags.length > 0
            ? `${enabledFlags.length} feature flag(s) currently resolve enabled for this tenant context.`
            : "Feature flag detail is currently unavailable or no tenant-specific module flag resolved enabled."
        }
      >
        {enabledFlags.length > 0 ? (
          <div className="chip-row">
            {enabledFlags.slice(0, 6).map((flag) => (
              <span className="status-chip" key={flag.key}>
                {flag.key}
              </span>
            ))}
          </div>
        ) : null}
      </CalloutPanel>

      <CalloutPanel
        title="Partner mode runs in a constrained shell"
        description="Partner booking lives at `/partner/*` with its own bootstrap session, partner-only navigation, and no tenant-admin governance exposure. Booking creation requires entry-scoped eligibility verification when the entry is not configured with `eligibility_mode = none`."
        tone="warning"
      >
        <div className="link-row">
          <Link className="text-link" href="/partner/login">
            Open partner sign-in
          </Link>
        </div>
      </CalloutPanel>

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Partial data warning"
          description="Some dashboard slices fell back because the current authority surface did not answer every read."
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
