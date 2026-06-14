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
import { t, type Locale } from "@/lib/translations";
import { getServerLocale } from "@/lib/server-locale";

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

async function loadDashboardData(locale: Locale): Promise<DashboardData> {
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
      const reason =
        result.reason instanceof Error
          ? result.reason.message
          : t("dashboard.error.unknown", locale);
      errors.push(`${label}: ${reason}`);
    }
  };

  collectError(t("dashboard.errorLabel.identity", locale), identityResult);
  collectError(t("dashboard.errorLabel.flags", locale), flagsResult);
  collectError(t("dashboard.errorLabel.bookings", locale), bookingsResult);
  collectError(t("dashboard.errorLabel.invoices", locale), invoicesResult);
  collectError(t("dashboard.errorLabel.statements", locale), statementsResult);
  collectError(
    t("dashboard.errorLabel.notifications", locale),
    notificationsResult,
  );
  collectError(t("dashboard.errorLabel.governance", locale), governanceResult);

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
  const locale = await getServerLocale();
  const data = await loadDashboardData(locale);
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
        eyebrow={t("dashboard.hero.eyebrow", locale)}
        title={t("dashboard.hero.title", locale)}
        description={t("dashboard.hero.description", locale)}
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">
            {t("dashboard.kpi.inProgress", locale)}
          </span>
          <strong>{formatCount(activeBookings.length)}</strong>
          <p>
            {attentionBookings.length > 0
              ? t("dashboard.kpi.attentionBookingsActive", locale, {
                  count: formatCount(attentionBookings.length),
                })
              : t("dashboard.empty.activeBookings", locale)}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("dashboard.kpi.currentInvoice", locale)}
          </span>
          <strong>{formatCount(openInvoices.length)}</strong>
          <p>
            {data.invoices.length > 0
              ? t("dashboard.kpi.invoiceFilesVisible", locale, {
                  count: formatCount(data.invoices.length),
                })
              : t("dashboard.empty.invoices", locale)}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("dashboard.kpi.todayCompleted", locale)}
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
              ? t("dashboard.kpi.recentReminders", locale, {
                  count: formatCount(recentNotifications.length),
                })
              : t("dashboard.empty.notificationsSnapshot", locale)}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("dashboard.kpi.mtdUsage", locale)}
          </span>
          <strong>{formatCount(data.bookings.length)}</strong>
          <p>
            {data.governance?.onboardingChecklist.length
              ? t("dashboard.kpi.pendingChecklist", locale, {
                  count: formatCount(
                    data.governance.onboardingChecklist.length,
                  ),
                })
              : t("dashboard.empty.checklist", locale)}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("dashboard.section.activeBookings", locale)}
          title={t("dashboard.section.activeBookings", locale)}
          description={t("dashboard.section.activeBookingsSub", locale)}
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
            <p className="muted-copy">
              {t("dashboard.empty.activeBookings", locale)}
            </p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/bookings">
              {t("dashboard.link.openBookings", locale)}
            </Link>
            <Link className="text-link" href="/bookings/new">
              {t("dashboard.link.newBooking", locale)}
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("dashboard.section.finance", locale)}
          title={t("dashboard.section.finance", locale)}
          description={t("dashboard.section.financeSub", locale)}
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
            <p className="muted-copy">
              {t("dashboard.empty.statements", locale)}
            </p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/billing">
              {t("dashboard.link.openBilling", locale)}
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("dashboard.section.integration", locale)}
          title={t("dashboard.section.integration", locale)}
          description={t("dashboard.section.integrationSub", locale)}
        >
          {data.governance?.onboardingChecklist.length ? (
            <ul className="panel-list">
              {data.governance.onboardingChecklist.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              {t("dashboard.empty.integrationChecklist", locale)}
            </p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/integration-governance">
              {t("dashboard.link.openGovernance", locale)}
            </Link>
            <Link className="text-link" href="/api-keys">
              {t("dashboard.link.viewApiKeys", locale)}
            </Link>
            <Link className="text-link" href="/webhooks">
              {t("dashboard.link.viewWebhooks", locale)}
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("dashboard.section.identity", locale)}
          title={t("dashboard.section.identityTitle", locale)}
          description={t("dashboard.section.identitySub", locale)}
        >
          <dl className="definition-grid">
            <div>
              <dt>{t("dashboard.identity.tenant", locale)}</dt>
              <dd>
                {data.identity?.tenantId ?? t("dashboard.value.noData", locale)}
              </dd>
            </div>
            <div>
              <dt>Realm</dt>
              <dd>
                {data.identity?.realm ?? t("dashboard.value.noData", locale)}
              </dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>
                {data.identity?.actorType ??
                  t("dashboard.value.noData", locale)}
              </dd>
            </div>
            <div>
              <dt>{t("dashboard.identity.authMode", locale)}</dt>
              <dd>
                {data.identity?.authMode ?? t("dashboard.value.noData", locale)}
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("dashboard.section.notifications", locale)}
          title={t("dashboard.section.notificationsTitle", locale)}
          description={t("dashboard.section.notificationsSub", locale)}
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
              {t("dashboard.empty.notifications", locale)}
            </p>
          )}
        </SurfaceCard>
      </section>

      <CalloutPanel
        title={t("dashboard.callout.enabledModules", locale)}
        description={
          enabledFlags.length > 0
            ? t("dashboard.callout.flagsEnabled", locale, {
                count: formatCount(enabledFlags.length),
              })
            : t("dashboard.callout.flagsUnavailable", locale)
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
          title={t("dashboard.callout.partialData", locale)}
          description={t("dashboard.callout.partialDataSub", locale)}
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
