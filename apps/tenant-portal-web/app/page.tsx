import Link from "next/link";
import type { ReactNode } from "react";
import type {
  BookingRecord,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  TenantIntegrationGovernancePackage,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { getTenantClient } from "@/lib/api-client";

const ATTENTION_STATUSES = new Set([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

const TENANT_FLAG_KEYS = {
  booking: "tenant-portal.booking",
  billing: "tenant-portal.billing",
  reports: "tenant-portal.reports",
  webhooks: "tenant-portal.webhooks",
  directory: "phase1.read-models",
  admin: "tenant-portal.admin",
} as const;

type ModuleKey = keyof typeof TENANT_FLAG_KEYS;

type ModuleStatus = Record<ModuleKey, boolean>;

const DEFAULT_ENABLED: ModuleStatus = {
  booking: true,
  billing: true,
  reports: true,
  webhooks: true,
  directory: true,
  admin: true,
};

export const dynamic = "force-dynamic";

type DashboardData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  governance: TenantIntegrationGovernancePackage | null;
  errors: string[];
  flagsAvailable: boolean;
};

async function loadDashboardData(): Promise<DashboardData> {
  const client = await getTenantClient();
  const [
    identityResult,
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    governanceResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags(),
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
    flagsAvailable: flagsResult.status === "fulfilled",
    bookings:
      bookingsResult.status === "fulfilled" ? bookingsResult.value.items : [],
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

function deriveModuleStatus(data: DashboardData): ModuleStatus {
  if (!data.flagsAvailable || !data.featureFlags) {
    return DEFAULT_ENABLED;
  }

  const lookup = new Map(
    data.featureFlags.flags.map((flag) => [flag.key, flag.enabled] as const),
  );

  return Object.fromEntries(
    (Object.keys(TENANT_FLAG_KEYS) as ModuleKey[]).map((key) => [
      key,
      lookup.get(TENANT_FLAG_KEYS[key]) ?? false,
    ]),
  ) as ModuleStatus;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

function PageHero({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <section className="page-hero">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}

function SurfaceCard({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <article className="surface-card">
      <span className="surface-kicker">{kicker}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </article>
  );
}

function CalloutPanel({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description: string;
  tone?: "default" | "warning";
  children?: ReactNode;
}) {
  return (
    <section
      className={`callout-panel${tone === "warning" ? " is-warning" : ""}`}
    >
      <strong>{title}</strong>
      <p>{description}</p>
      {children}
    </section>
  );
}

export default async function HomePage() {
  const data = await loadDashboardData();
  const moduleStatus = deriveModuleStatus(data);

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
  const onboardingChecklist = data.governance?.onboardingChecklist ?? [];

  return (
    <main className="page-shell">
      <PageHero
        eyebrow="Tenant home"
        title="Tenant operators land in a real workspace, not a launcher."
        description="This dashboard anchors the tenant identity context, active-booking status, billing and notice reminders, integration posture, and quick-entry actions for the tenant portal surface."
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
              ? "Recent platform and tenant reminders surface here before users drill into settings."
              : "No tenant notification feed items were returned in the current snapshot."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Integration posture</span>
          <strong>
            {onboardingChecklist.length > 0
              ? formatCount(onboardingChecklist.length)
              : "Ready"}
          </strong>
          <p>
            {onboardingChecklist.length > 0
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
          description="Bookings remain the primary operating surface; the route list and detail model stay anchored to the tenant booking entry."
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
              {moduleStatus.booking ? (
                <>
                  <Link className="text-link" href="/booking-list">
                    Open booking oversight
                  </Link>
                  <Link className="text-link" href="/bookings/new">
                    Start new booking intake
                  </Link>
                </>
              ) : (
                <span className="muted-copy">
                  Booking module is not enabled for this tenant.
                </span>
              )}
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
          <div className="link-row">
            {moduleStatus.billing ? (
              <Link className="text-link" href="/billing">
                Review billing posture
              </Link>
            ) : null}
            <Link className="text-link" href="/notifications">
              Notification preferences
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Integration"
          title="Integration readiness and governance"
          description="Integration reminders summarize the backend-owned checklist instead of inventing client-local readiness truth."
        >
          {onboardingChecklist.length > 0 ? (
            <ul className="panel-list">
              {onboardingChecklist.slice(0, 4).map((item) => (
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
            {moduleStatus.directory ? (
              <Link className="text-link" href="/api-keys">
                Review API keys
              </Link>
            ) : null}
            {moduleStatus.webhooks ? (
              <Link className="text-link" href="/webhooks">
                Review webhooks
              </Link>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="Quick actions"
        description="Common tenant entry points stay one click away from the home lane."
      >
        <div className="link-row">
          {moduleStatus.booking ? (
            <Link className="text-link" href="/bookings/new">
              New booking
            </Link>
          ) : null}
          {moduleStatus.billing ? (
            <Link className="text-link" href="/billing">
              Billing
            </Link>
          ) : null}
          {moduleStatus.reports ? (
            <Link className="text-link" href="/reports">
              Reports
            </Link>
          ) : null}
          {moduleStatus.directory ? (
            <Link className="text-link" href="/passengers">
              Passenger directory
            </Link>
          ) : null}
          {moduleStatus.directory ? (
            <Link className="text-link" href="/addresses">
              Address book
            </Link>
          ) : null}
          {moduleStatus.admin ? (
            <Link className="text-link" href="/users">
              User management
            </Link>
          ) : null}
          {moduleStatus.admin ? (
            <Link className="text-link" href="/audit">
              Audit trail
            </Link>
          ) : null}
          <Link className="text-link" href="/settings">
            Settings
          </Link>
          <Link className="text-link" href="/sla">
            SLA profile
          </Link>
          <Link className="text-link" href="/feature-flags">
            Feature flags
          </Link>
        </div>
      </CalloutPanel>

      <CalloutPanel
        title="Enabled module snapshot"
        description={
          enabledFlags.length > 0
            ? `${enabledFlags.length} feature flag(s) currently resolve enabled for this tenant context.`
            : data.flagsAvailable
              ? "No tenant-specific module flag resolved enabled."
              : "Feature flag detail is currently unavailable; modules display in fallback-enabled mode."
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
    </main>
  );
}
