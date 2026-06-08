import Link from "next/link";
import type {
  BookingRecord,
  DriverStatementRecord,
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
import { t } from "@/lib/translations";

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
  statements: DriverStatementRecord[];
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
    statementsResult,
    notificationsResult,
    governanceResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({ tenantId: "tenant-demo-001" }),
    client.listTenantBookings(),
    client.listInvoices(),
    client.listTenantStatements(),
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
  collectError("Statements", statementsResult);
  collectError("Notifications", notificationsResult);
  collectError("Integration governance", governanceResult);

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    bookings: bookingsResult.status === "fulfilled" ? bookingsResult.value : [],
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    statements:
      statementsResult.status === "fulfilled" ? statementsResult.value : [],
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
  const recentStatements = data.statements.slice(0, 4);
  const enabledFlags =
    data.featureFlags?.flags.filter((flag) => flag.enabled) ?? [];
  const recentNotifications = data.notifications.slice(0, 3);

  return (
    <div className="page-shell">
      <PageHero
        eyebrow={t("dashboard.hero.eyebrow")}
        title={t("dashboard.hero.title")}
        description={t("dashboard.hero.description")}
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">{t("dashboard.kpi.inProgress")}</span>
          <strong>{formatCount(activeBookings.length)}</strong>
          <p>
            {attentionBookings.length > 0
              ? `${formatCount(attentionBookings.length)} booking(s) need follow-up across dispatch or proof states.`
              : t("dashboard.empty.activeBookings")}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("dashboard.kpi.currentInvoice")}
          </span>
          <strong>{formatCount(openInvoices.length)}</strong>
          <p>
            {data.invoices.length > 0
              ? `${formatCount(data.invoices.length)} invoice artifact(s) are visible from tenant billing authority.`
              : "Invoice artifacts are not currently available for this tenant context."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("dashboard.kpi.todayCompleted")}
          </span>
          <strong>
            {formatCount(
              data.bookings.filter(
                (booking) => booking.orderStatus === "completed",
              ).length,
            )}
          </strong>
          <p>
            {recentNotifications.length > 0
              ? `${formatCount(recentNotifications.length)} recent reminder(s) surfaced on the home lane.`
              : "No tenant notification feed items were returned in the current snapshot."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t("dashboard.kpi.mtdUsage")}</span>
          <strong>{formatCount(data.bookings.length)}</strong>
          <p>
            {data.governance?.onboardingChecklist.length
              ? `${formatCount(data.governance.onboardingChecklist.length)} open integration checklist item(s).`
              : "No outstanding onboarding checklist items were returned."}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("dashboard.section.activeBookings")}
          title={t("dashboard.section.activeBookings")}
          description={t("dashboard.section.activeBookingsSub")}
        >
          {activeBookings.length > 0 ? (
            <ul className="panel-list">
              {activeBookings.slice(0, 5).map((booking) => (
                <li key={booking.bookingId}>
                  <strong>{booking.bookingId}</strong>
                  <span className="list-note">
                    {booking.passenger.name} ·{" "}
                    {formatDateTime(booking.reservationWindowStart)} ·{" "}
                    {booking.orderStatus}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">{t("dashboard.empty.activeBookings")}</p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/bookings">
              {t("dashboard.link.openBookings")}
            </Link>
            <Link className="text-link" href="/bookings/new">
              {t("dashboard.link.newBooking")}
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("dashboard.section.finance")}
          title={t("dashboard.section.finance")}
          description={t("dashboard.section.financeSub")}
        >
          {recentStatements.length > 0 ? (
            <ul className="panel-list">
              {recentStatements.map((statement) => (
                <li key={statement.statementId}>
                  <strong>{statement.statementId}</strong>
                  <span className="list-note">
                    {statement.driverId} · {statement.periodMonth} ·{" "}
                    {statement.netAmount.currency}{" "}
                    {(statement.netAmount.amountMinor / 100).toLocaleString(
                      "en-US",
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">{t("dashboard.empty.statements")}</p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/billing">
              {t("dashboard.link.openBilling")}
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("dashboard.section.integration")}
          title={t("dashboard.section.integration")}
          description={t("dashboard.section.integrationSub")}
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
            <Link className="text-link" href="/integration-governance">
              {t("dashboard.link.openGovernance")}
            </Link>
            <Link className="text-link" href="/api-keys">
              Review API keys
            </Link>
            <Link className="text-link" href="/webhooks">
              Review webhooks
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Identity"
          title="Tenant authority context"
          description="The dashboard reads tenant identity directly from the backend so actor and realm remain authority-driven."
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
          kicker="Notifications"
          title="Recent reminders"
          description="Platform and tenant notices remain visible without leaving the workspace home."
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
