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
import {
  formatTenantErrorSummary,
  toTenantErrorMessage,
} from "@/lib/error-copy";
import { formatCount, formatDateTime } from "@/lib/formatters";
import { formatTenantCodeLabel } from "@/lib/localized-labels";

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
        formatTenantErrorSummary(label, toTenantErrorMessage(result.reason)),
      );
    }
  };

  collectError("身分", identityResult);
  collectError("功能旗標", flagsResult);
  collectError("訂單", bookingsResult);
  collectError("發票", invoicesResult);
  collectError("通知", notificationsResult);
  collectError("整合治理", governanceResult);

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
        eyebrow="首頁"
        title="租戶營運人員現在會直接進入正式工作台，不再停留在啟動頁。"
        description="這個首頁會集中顯示租戶身分脈絡、進行中訂單摘要、計費提醒、整合狀態與常用快捷入口。"
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">進行中訂單</span>
          <strong>{formatCount(activeBookings.length)}</strong>
          <p>
            {attentionBookings.length > 0
              ? `${formatCount(attentionBookings.length)} 筆訂單在派遣或憑證狀態上需要跟進。`
              : "目前沒有需要租戶端跟進的進行中訂單。"}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">未結發票</span>
          <strong>{formatCount(openInvoices.length)}</strong>
          <p>
            {data.invoices.length > 0
              ? `${formatCount(data.invoices.length)} 份發票成品目前可由租戶計費權限查看。`
              : "這個租戶脈絡目前沒有可用的發票成品。"}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">通知</span>
          <strong>{formatCount(recentNotifications.length)}</strong>
          <p>
            {recentNotifications.length > 0
              ? "最近的平台與租戶提醒會先顯示在這裡，使用者不必先深入設定頁。"
              : "目前快照沒有回傳租戶通知動態。"}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">整合狀態</span>
          <strong>
            {data.governance?.onboardingChecklist.length
              ? formatCount(data.governance.onboardingChecklist.length)
              : "已就緒"}
          </strong>
          <p>
            {data.governance?.onboardingChecklist.length
              ? "清單項目仍定義著 API 金鑰與回呼需要完成的整合作業。"
              : "目前沒有未完成的啟用清單項目。"}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="身分"
          title="租戶權限脈絡"
          description="首頁會直接讀取後端身分脈絡，讓角色、領域與租戶歸屬維持由權限來源決定。"
        >
          <dl className="definition-grid">
            <div>
              <dt>租戶</dt>
              <dd>{data.identity?.tenantId ?? "目前無法取得"}</dd>
            </div>
            <div>
              <dt>領域</dt>
              <dd>{data.identity?.realm ?? "目前無法取得"}</dd>
            </div>
            <div>
              <dt>身分</dt>
              <dd>
                {formatTenantCodeLabel(
                  data.identity?.actorType,
                  "目前無法取得",
                )}
              </dd>
            </div>
            <div>
              <dt>驗證模式</dt>
              <dd>
                {formatTenantCodeLabel(data.identity?.authMode, "目前無法取得")}
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="訂單"
          title="租戶作業快捷入口"
          description="訂單仍是主要作業頁面，列表與明細模型都會以租戶訂單路徑為核心。"
        >
          <div className="panel-stack">
            <p>
              下一個預約時段：
              <strong>
                {activeBookings[0]
                  ? formatDateTime(activeBookings[0].reservationWindowStart)
                  : "目前沒有待處理的預約"}
              </strong>
            </p>
            <div className="link-row">
              <Link className="text-link" href="/bookings">
                前往訂單總覽
              </Link>
              <Link className="text-link" href="/bookings/new">
                建立新訂單
              </Link>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="計費與公告"
          title="營運提醒保持可見"
          description="計費狀態與通知提醒會直接留在首頁，讓租戶管理員不必再從次級導覽裡尋找。"
        >
          {recentNotifications.length > 0 ? (
            <ul className="panel-list">
              {recentNotifications.map((notification) => (
                <li key={notification.notificationId}>
                  <strong>{notification.title}</strong>
                  <span className="list-note">
                    {formatTenantCodeLabel(notification.channel)} ·{" "}
                    {formatDateTime(notification.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">目前沒有可用的租戶通知動態。</p>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="整合"
          title="整合就緒度與治理"
          description="整合提醒會直接摘要後端維護的清單，而不是由前端自行發明一套就緒度真相。"
        >
          {data.governance?.onboardingChecklist.length ? (
            <ul className="panel-list">
              {data.governance.onboardingChecklist
                .slice(0, 4)
                .map((item, index) => (
                  <li key={`${item}-${index}`}>
                    {formatTenantCodeLabel(item, item)}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="muted-copy">
              API 金鑰與回呼啟用目前沒有回報任何未完成的清單項目。
            </p>
          )}
          <div className="link-row">
            <Link className="text-link" href="/integration-governance">
              前往整合治理
            </Link>
            <Link className="text-link" href="/api-keys">
              查看 API 金鑰
            </Link>
            <Link className="text-link" href="/webhooks">
              查看回呼
            </Link>
          </div>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="已啟用模組快照"
        description={
          enabledFlags.length > 0
            ? `目前有 ${enabledFlags.length} 個功能旗標在這個租戶脈絡下解析為啟用。`
            : "功能旗標明細目前不可用，或是沒有任何租戶專屬模組旗標解析為啟用。"
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
        title="合作夥伴模式會在受限工作殼層中執行"
        description="合作夥伴訂單入口會使用獨立的啟動工作階段與專屬導覽，不會暴露租戶管理治理能力；若入口沒有設定免驗證，建立訂單前仍需完成該入口範圍的資格驗證。"
        tone="warning"
      >
        <div className="link-row">
          <Link className="text-link" href="/partner/login">
            前往合作夥伴登入
          </Link>
        </div>
      </CalloutPanel>

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="部分資料警示"
          description="有些首頁區塊已退回後備資料，因為目前的權限介面沒有完整回應所有讀取請求。"
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}
    </div>
  );
}
