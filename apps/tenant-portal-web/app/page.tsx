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
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import type { Locale } from "@/lib/translations";

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

async function loadDashboardData(locale: Locale): Promise<DashboardData> {
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
        `${label}: ${result.reason instanceof Error ? result.reason.message : t("home.error.unknown", locale)}`,
      );
    }
  };

  collectError(t("home.error.label.identity", locale), identityResult);
  collectError(t("home.error.label.featureFlags", locale), flagsResult);
  collectError(t("home.error.label.bookings", locale), bookingsResult);
  collectError(t("home.error.label.invoices", locale), invoicesResult);
  collectError(t("home.error.label.notifications", locale), notificationsResult);
  collectError(
    t("home.error.label.integrationGovernance", locale),
    governanceResult,
  );

  return {
    identity:
      identityResult.status === "fulfilled" ? identityResult.value : null,
    featureFlags: flagsResult.status === "fulfilled" ? flagsResult.value : null,
    flagsAvailable: flagsResult.status === "fulfilled",
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

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) {
    return t("home.value.notAvailable", locale);
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
  const locale = await getServerLocale();
  const data = await loadDashboardData(locale);
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
        eyebrow={t("home.hero.eyebrow", locale)}
        title={t("home.hero.title", locale)}
        description={t("home.hero.description", locale)}
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">
            {t("home.metric.activeBookings.label", locale)}
          </span>
          <strong>{formatCount(activeBookings.length)}</strong>
          <p>
            {attentionBookings.length > 0
              ? t("home.metric.activeBookings.attention", locale, {
                  count: formatCount(attentionBookings.length),
                })
              : t("home.metric.activeBookings.clear", locale)}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("home.metric.openInvoices.label", locale)}
          </span>
          <strong>{formatCount(openInvoices.length)}</strong>
          <p>
            {data.invoices.length > 0
              ? t("home.metric.openInvoices.visible", locale, {
                  count: formatCount(data.invoices.length),
                })
              : t("home.metric.openInvoices.empty", locale)}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("home.metric.notifications.label", locale)}
          </span>
          <strong>{formatCount(recentNotifications.length)}</strong>
          <p>
            {recentNotifications.length > 0
              ? t("home.metric.notifications.present", locale)
              : t("home.metric.notifications.empty", locale)}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">
            {t("home.metric.integrationPosture.label", locale)}
          </span>
          <strong>
            {onboardingChecklist.length > 0
              ? formatCount(onboardingChecklist.length)
              : t("home.metric.integrationPosture.ready", locale)}
          </strong>
          <p>
            {onboardingChecklist.length > 0
              ? t("home.metric.integrationPosture.pending", locale)
              : t("home.metric.integrationPosture.empty", locale)}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker={t("home.identity.kicker", locale)}
          title={t("home.identity.title", locale)}
          description={t("home.identity.description", locale)}
        >
          <dl className="definition-grid">
            <div>
              <dt>{t("home.identity.tenant", locale)}</dt>
              <dd>
                {data.identity?.tenantId ??
                  t("home.value.unavailable", locale)}
              </dd>
            </div>
            <div>
              <dt>{t("home.identity.realm", locale)}</dt>
              <dd>
                {data.identity?.realm ?? t("home.value.unavailable", locale)}
              </dd>
            </div>
            <div>
              <dt>{t("home.identity.actor", locale)}</dt>
              <dd>
                {data.identity?.actorType ??
                  t("home.value.unavailable", locale)}
              </dd>
            </div>
            <div>
              <dt>{t("home.identity.authMode", locale)}</dt>
              <dd>
                {data.identity?.authMode ??
                  t("home.value.unavailable", locale)}
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("home.bookings.kicker", locale)}
          title={t("home.bookings.title", locale)}
          description={t("home.bookings.description", locale)}
        >
          <div className="panel-stack">
            <p>
              {t("home.bookings.nextReservation", locale)}{" "}
              <strong>
                {activeBookings[0]
                  ? formatDateTime(
                      activeBookings[0].reservationWindowStart,
                      locale,
                    )
                  : t("home.bookings.noReservation", locale)}
              </strong>
            </p>
            <div className="link-row">
              {moduleStatus.booking ? (
                <>
                  <Link className="text-link" href="/booking-list">
                    {t("home.bookings.openOversight", locale)}
                  </Link>
                  <Link className="text-link" href="/bookings/new">
                    {t("home.bookings.startIntake", locale)}
                  </Link>
                </>
              ) : (
                <span className="muted-copy">
                  {t("home.bookings.disabled", locale)}
                </span>
              )}
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("home.billing.kicker", locale)}
          title={t("home.billing.title", locale)}
          description={t("home.billing.description", locale)}
        >
          {recentNotifications.length > 0 ? (
            <ul className="panel-list">
              {recentNotifications.map((notification) => (
                <li key={notification.notificationId}>
                  <strong>{notification.title}</strong>
                  <span className="list-note">
                    {notification.channel} ·{" "}
                    {formatDateTime(notification.createdAt, locale)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              {t("home.billing.notificationsEmpty", locale)}
            </p>
          )}
          <div className="link-row">
            {moduleStatus.billing ? (
              <Link className="text-link" href="/billing">
                {t("home.billing.reviewPosture", locale)}
              </Link>
            ) : null}
            <Link className="text-link" href="/notifications">
              {t("home.billing.notificationPreferences", locale)}
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker={t("home.integration.kicker", locale)}
          title={t("home.integration.title", locale)}
          description={t("home.integration.description", locale)}
        >
          {onboardingChecklist.length > 0 ? (
            <ul className="panel-list">
              {onboardingChecklist.slice(0, 4).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              {t("home.integration.checklistEmpty", locale)}
            </p>
          )}
          <div className="link-row">
            {moduleStatus.directory ? (
              <Link className="text-link" href="/api-keys">
                {t("home.integration.reviewApiKeys", locale)}
              </Link>
            ) : null}
            {moduleStatus.webhooks ? (
              <Link className="text-link" href="/webhooks">
                {t("home.integration.reviewWebhooks", locale)}
              </Link>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title={t("home.quickActions.title", locale)}
        description={t("home.quickActions.description", locale)}
      >
        <div className="link-row">
          {moduleStatus.booking ? (
            <Link className="text-link" href="/bookings/new">
              {t("home.quickActions.newBooking", locale)}
            </Link>
          ) : null}
          {moduleStatus.billing ? (
            <Link className="text-link" href="/billing">
              {t("home.quickActions.billing", locale)}
            </Link>
          ) : null}
          {moduleStatus.reports ? (
            <Link className="text-link" href="/reports">
              {t("home.quickActions.reports", locale)}
            </Link>
          ) : null}
          {moduleStatus.directory ? (
            <Link className="text-link" href="/passengers">
              {t("home.quickActions.passengerDirectory", locale)}
            </Link>
          ) : null}
          {moduleStatus.directory ? (
            <Link className="text-link" href="/addresses">
              {t("home.quickActions.addressBook", locale)}
            </Link>
          ) : null}
          {moduleStatus.admin ? (
            <Link className="text-link" href="/users">
              {t("home.quickActions.userManagement", locale)}
            </Link>
          ) : null}
          {moduleStatus.admin ? (
            <Link className="text-link" href="/audit">
              {t("home.quickActions.auditTrail", locale)}
            </Link>
          ) : null}
          <Link className="text-link" href="/settings">
            {t("home.quickActions.settings", locale)}
          </Link>
          <Link className="text-link" href="/sla">
            {t("home.quickActions.slaProfile", locale)}
          </Link>
          <Link className="text-link" href="/feature-flags">
            {t("home.quickActions.featureFlags", locale)}
          </Link>
        </div>
      </CalloutPanel>

      <CalloutPanel
        title={t("home.moduleSnapshot.title", locale)}
        description={
          enabledFlags.length > 0
            ? t("home.moduleSnapshot.enabled", locale, {
                count: enabledFlags.length,
              })
            : data.flagsAvailable
              ? t("home.moduleSnapshot.none", locale)
              : t("home.moduleSnapshot.unavailable", locale)
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
          title={t("home.partialData.title", locale)}
          description={t("home.partialData.description", locale)}
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
