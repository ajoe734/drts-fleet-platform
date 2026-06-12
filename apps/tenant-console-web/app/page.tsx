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
        `${label}: ${result.reason instanceof Error ? result.reason.message : "未知錯誤"}`,
      );
    }
  };

  collectError("身分", identityResult);
  collectError("功能旗標", flagsResult);
  collectError("訂單", bookingsResult);
  collectError("發票", invoicesResult);
  collectError("對帳單", statementsResult);
  collectError("通知", notificationsResult);
  collectError("整合就緒度", governanceResult);

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
              ? `有 ${formatCount(attentionBookings.length)} 筆訂單需要在 dispatch 或 proof 狀態追蹤處理。`
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
              ? `租戶帳務授權可見 ${formatCount(data.invoices.length)} 份發票檔案。`
              : "此租戶情境目前沒有可用的發票檔案。"}
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
              ? `首頁顯示了 ${formatCount(recentNotifications.length)} 則近期提醒。`
              : "目前快照沒有回傳任何租戶通知。"}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">{t("dashboard.kpi.mtdUsage")}</span>
          <strong>{formatCount(data.bookings.length)}</strong>
          <p>
            {data.governance?.onboardingChecklist.length
              ? `有 ${formatCount(data.governance.onboardingChecklist.length)} 項待辦的整合檢查清單。`
              : "沒有待辦的導入檢查清單項目。"}
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
              API 金鑰與 Webhook 導入目前沒有任何待辦的檢查清單項目。
            </p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/integration-governance">
              {t("dashboard.link.openGovernance")}
            </Link>
            <Link className="text-link" href="/api-keys">
              查看 API 金鑰
            </Link>
            <Link className="text-link" href="/webhooks">
              查看 Webhook
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="身分"
          title="租戶授權上下文"
          description="儀表板直接從後端讀取租戶身分，因此 actor 與 realm 都以授權來源為準。"
        >
          <dl className="definition-grid">
            <div>
              <dt>租戶</dt>
              <dd>{data.identity?.tenantId ?? "無資料"}</dd>
            </div>
            <div>
              <dt>Realm</dt>
              <dd>{data.identity?.realm ?? "無資料"}</dd>
            </div>
            <div>
              <dt>Actor</dt>
              <dd>{data.identity?.actorType ?? "無資料"}</dd>
            </div>
            <div>
              <dt>授權模式</dt>
              <dd>{data.identity?.authMode ?? "無資料"}</dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="通知"
          title="近期提醒"
          description="平台與租戶通知都會留在工作面首頁，無需離開即可查看。"
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
            <p className="muted-copy">目前沒有可顯示的租戶通知。</p>
          )}
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="已啟用模組快照"
        description={
          enabledFlags.length > 0
            ? `${enabledFlags.length} feature flag(s) currently resolve enabled for this tenant context.`
            : "功能旗標明細目前無法取得，或沒有任何租戶專屬模組旗標啟用。"
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
        title="合作夥伴模式在受限介面中運作"
        description="合作夥伴訂單位於 `/partner/*`，擁有獨立的 bootstrap session、僅限合作夥伴的導覽，且不暴露租戶管理治理。當 entry 未設定為 `eligibility_mode = none` 時，建立訂單需要 entry 範圍的資格驗證。"
        tone="warning"
      >
        <div className="link-row">
          <Link className="text-link" href="/partner/login">
            開啟合作夥伴登入
          </Link>
        </div>
      </CalloutPanel>

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="部分資料警告"
          description="部分儀表板區塊已回退，因為目前的授權來源未回應所有讀取。"
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
