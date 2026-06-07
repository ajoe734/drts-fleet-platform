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
import { formatPortalSectionError } from "@/lib/error-copy";
import {
  formatPortalChecklistItem,
  formatPortalCodeLabel,
} from "@/lib/localized-labels";

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
      errors.push(formatPortalSectionError(label, result.reason));
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

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "目前無法取得";
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
        eyebrow="租戶首頁"
        title="租戶營運人員會直接進入正式工作台，而不是啟動頁。"
        description="這個首頁會集中顯示租戶身分脈絡、進行中訂單、計費與公告提醒、整合狀態，以及租戶入口的常用快捷操作。"
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
            {onboardingChecklist.length > 0
              ? formatCount(onboardingChecklist.length)
              : "已就緒"}
          </strong>
          <p>
            {onboardingChecklist.length > 0
              ? "清單項目仍定義著整合金鑰與回呼需要完成的整合作業。"
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
              <dd>
                {formatPortalCodeLabel(data.identity?.realm, "目前無法取得")}
              </dd>
            </div>
            <div>
              <dt>身分</dt>
              <dd>
                {formatPortalCodeLabel(
                  data.identity?.actorType,
                  "目前無法取得",
                )}
              </dd>
            </div>
            <div>
              <dt>驗證模式</dt>
              <dd>
                {formatPortalCodeLabel(data.identity?.authMode, "目前無法取得")}
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="訂單"
          title="租戶作業快捷入口"
          description="訂單仍是主要作業頁面；列表與明細模型都會以租戶訂單入口為核心。"
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
              {moduleStatus.booking ? (
                <>
                  <Link className="text-link" href="/booking-list">
                    前往訂單總覽
                  </Link>
                  <Link className="text-link" href="/bookings/new">
                    建立新訂單
                  </Link>
                </>
              ) : (
                <span className="muted-copy">這個租戶尚未啟用訂單模組。</span>
              )}
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
                    {formatPortalCodeLabel(notification.channel)} ·{" "}
                    {formatDateTime(notification.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">目前沒有可用的租戶通知動態。</p>
          )}
          <div className="link-row">
            {moduleStatus.billing ? (
              <Link className="text-link" href="/billing">
                查看計費狀態
              </Link>
            ) : null}
            <Link className="text-link" href="/notifications">
              通知偏好
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="整合"
          title="整合就緒度與治理"
          description="整合提醒會直接摘要後端維護的清單，而不是由前端自行發明一套就緒度真相。"
        >
          {onboardingChecklist.length > 0 ? (
            <ul className="panel-list">
              {onboardingChecklist.slice(0, 4).map((item, index) => (
                <li key={`${item}-${index}`}>
                  {formatPortalChecklistItem(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-copy">
              整合金鑰與回呼啟用目前沒有回報任何未完成的清單項目。
            </p>
          )}
          <div className="link-row">
            {moduleStatus.directory ? (
              <Link className="text-link" href="/api-keys">
                查看整合金鑰
              </Link>
            ) : null}
            {moduleStatus.webhooks ? (
              <Link className="text-link" href="/webhooks">
                查看回呼
              </Link>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      <CalloutPanel
        title="快捷操作"
        description="常用的租戶入口會保留在首頁，一次點擊即可進入。"
      >
        <div className="link-row">
          {moduleStatus.booking ? (
            <Link className="text-link" href="/bookings/new">
              新增訂單
            </Link>
          ) : null}
          {moduleStatus.billing ? (
            <Link className="text-link" href="/billing">
              計費
            </Link>
          ) : null}
          {moduleStatus.reports ? (
            <Link className="text-link" href="/reports">
              報表
            </Link>
          ) : null}
          {moduleStatus.directory ? (
            <Link className="text-link" href="/passengers">
              乘客名冊
            </Link>
          ) : null}
          {moduleStatus.directory ? (
            <Link className="text-link" href="/addresses">
              地址簿
            </Link>
          ) : null}
          {moduleStatus.admin ? (
            <Link className="text-link" href="/users">
              使用者管理
            </Link>
          ) : null}
          {moduleStatus.admin ? (
            <Link className="text-link" href="/audit">
              稽核軌跡
            </Link>
          ) : null}
          <Link className="text-link" href="/settings">
            設定
          </Link>
          <Link className="text-link" href="/sla">
            服務時限設定
          </Link>
          <Link className="text-link" href="/feature-flags">
            功能旗標
          </Link>
        </div>
      </CalloutPanel>

      <CalloutPanel
        title="已啟用模組快照"
        description={
          enabledFlags.length > 0
            ? `目前有 ${enabledFlags.length} 個功能旗標在這個租戶脈絡下解析為啟用。`
            : data.flagsAvailable
              ? "沒有任何租戶專屬模組旗標解析為啟用。"
              : "功能旗標明細目前不可用；模組會以後備啟用模式顯示。"
        }
      >
        {enabledFlags.length > 0 ? (
          <div className="chip-row">
            {enabledFlags.slice(0, 6).map((flag) => (
              <span className="status-chip" key={flag.key}>
                {formatPortalCodeLabel(flag.key, flag.key)}
              </span>
            ))}
          </div>
        ) : null}
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
    </main>
  );
}
