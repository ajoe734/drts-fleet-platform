import Link from "next/link";
import type { CSSProperties } from "react";
import type {
  BookingRecord,
  EmptyReason,
  FeatureFlagSummary,
  IdentityContext,
  NotificationRecord,
  ResourceActionDescriptor,
  TenantIntegrationReadinessItem,
  TenantIntegrationReadinessSummary,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";
import { TENANT_CONSOLE_CONTEXT, TENANT_CONSOLE_ENV } from "@/lib/navigation";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.5fr 1fr",
  gap: 16,
  alignItems: "start",
};

const laneStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 16,
  minWidth: 0,
};

const quickActionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const quickActionCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minHeight: 156,
};

const moduleGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const moduleMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const sectionStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const cardListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const listItemStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
};

const listItemTailStyle: CSSProperties = {
  textAlign: "right",
  color: th.textMuted,
  fontSize: 11.5,
  flexShrink: 0,
};

const listTitleStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
  lineHeight: 1.35,
};

const listBodyStyle: CSSProperties = {
  marginTop: 4,
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const mutedStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const smallMetaStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
  lineHeight: 1.4,
};

const emptyStateStyle: CSSProperties = {
  borderRadius: 16,
  border: `1px dashed ${th.border}`,
  padding: "16px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const emptyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 12,
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});
const numberFormatter = new Intl.NumberFormat("en");
const moneyFormatter = new Intl.NumberFormat("zh-Hant", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

type WorkspaceEmptyReason = Extract<
  EmptyReason,
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "filtered_empty"
>;

type RefreshBannerTone = "info" | "success" | "warn" | "danger" | "accent";

const EMPTY_REASON_META: Record<
  WorkspaceEmptyReason,
  { tone: CanvasTone; title: string; body: string }
> = {
  no_data: {
    tone: "neutral",
    title: "尚無資料",
    body: "新租戶尚未產生任何記錄，可直接從 quick action 開始。",
  },
  not_provisioned: {
    tone: "warn",
    title: "尚未開通",
    body: "後端明確表示模組未 provision，需先完成設定或整合。",
  },
  fetch_failed: {
    tone: "danger",
    title: "讀取失敗",
    body: "這個面板的資料快照未成功載入，請手動 refresh 或稍後再試。",
  },
  permission_denied: {
    tone: "accent",
    title: "權限不足",
    body: "目前身分可進入 Workspace，但不可打開此模組的操作面。",
  },
  external_unavailable: {
    tone: "warn",
    title: "外部系統不可用",
    body: "依賴平台或外部服務暫不可用，畫面保留追蹤與轉往連結。",
  },
  filtered_empty: {
    tone: "info",
    title: "篩選後無結果",
    body: "資料集存在，但在今天 / 目前條件下沒有需要處理的項目。",
  },
};

type ModuleTile = {
  key: string;
  title: string;
  href: string;
  description: string;
  enabled: boolean;
  tone: CanvasTone;
};

type QuickActionTile = {
  title: string;
  href: string;
  description: string;
  label: string;
  descriptor?: ResourceActionDescriptor | undefined;
  external?: boolean;
};

type HomePageData = {
  identity: IdentityContext | null;
  featureFlags: FeatureFlagSummary | null;
  bookings: BookingRecord[];
  invoices: TenantInvoiceRecord[];
  notifications: NotificationRecord[];
  readiness: TenantIntegrationReadinessSummary | null;
  errors: string[];
};

type BookingRow = {
  bookingId: string;
  passenger: string;
  route: string;
  window: string;
  state: string;
};

function ActionLink({
  href,
  label,
  external = false,
  variant = "secondary",
}: {
  href: string;
  label: string;
  external?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const styles =
    variant === "primary"
      ? {
          background: th.accent,
          color: "#fff",
          border: th.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: th.textMuted,
            border: "transparent",
          }
        : {
            background: th.surface,
            color: th.text,
            border: th.border,
          };

  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 28,
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${styles.border}`,
        background: styles.background,
        color: styles.color,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {label}
    </Link>
  );
}

async function loadHomePageData(): Promise<HomePageData> {
  const client = getTenantClient();
  const [
    identityResult,
    flagsResult,
    bookingsResult,
    invoicesResult,
    notificationsResult,
    readinessResult,
  ] = await Promise.allSettled([
    client.getIdentityContext() as Promise<IdentityContext>,
    client.getFeatureFlags({
      tenantId: DEMO_TENANT_ID,
    }) as Promise<FeatureFlagSummary>,
    client.listTenantBookings() as Promise<BookingRecord[]>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
    client.listTenantNotificationFeed() as Promise<NotificationRecord[]>,
    client.getTenantIntegrationReadinessSummary() as Promise<TenantIntegrationReadinessSummary>,
  ]);

  const errors: string[] = [];
  const pushError = (label: string, reason: unknown) => {
    errors.push(
      `${label}: ${reason instanceof Error ? reason.message : "未知錯誤"}`,
    );
  };

  if (identityResult.status === "rejected")
    pushError("身分上下文", identityResult.reason);
  if (flagsResult.status === "rejected")
    pushError("功能旗標", flagsResult.reason);
  if (bookingsResult.status === "rejected")
    pushError("訂單清單", bookingsResult.reason);
  if (invoicesResult.status === "rejected")
    pushError("帳務資料", invoicesResult.reason);
  if (notificationsResult.status === "rejected")
    pushError("通知摘要", notificationsResult.reason);
  if (readinessResult.status === "rejected")
    pushError("整合就緒度", readinessResult.reason);

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
    readiness:
      readinessResult.status === "fulfilled" ? readinessResult.value : null,
    errors,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

function formatMoney(minor: number | null | undefined, currency = "TWD") {
  if (minor === null || minor === undefined) return "—";
  if (currency === "TWD") return moneyFormatter.format(minor / 100);
  return `${currency} ${numberFormatter.format(minor / 100)}`;
}

function isOpenBooking(booking: BookingRecord) {
  return (
    booking.orderStatus !== "completed" && booking.orderStatus !== "cancelled"
  );
}

function getReadinessTone(
  status: TenantIntegrationReadinessItem["status"],
): CanvasTone {
  if (status === "ready") return "success";
  if (status === "partial") return "warn";
  if (status === "blocked") return "danger";
  return "neutral";
}

function getReadinessLabel(status: TenantIntegrationReadinessItem["status"]) {
  if (status === "ready") return "ready";
  if (status === "partial") return "partial";
  if (status === "blocked") return "blocked";
  return "not_provisioned";
}

function getRefreshPresentation(hasErrors: boolean, blockedCount: number) {
  if (hasErrors) {
    return {
      freshness: "degraded",
      tone: "warn" as RefreshBannerTone,
      title: "refresh tier T5 · slow",
      body: "Workspace home 以 30 秒 cadence 更新；目前部分資料退化，請留意 stale slices。",
    };
  }

  if (blockedCount > 0) {
    return {
      freshness: "stale",
      tone: "info" as RefreshBannerTone,
      title: "refresh tier T5 · slow",
      body: "整體快照仍可讀，但有模組等待下一次輪詢或人工處理恢復。",
    };
  }

  return {
    freshness: "fresh",
    tone: "success" as RefreshBannerTone,
    title: "refresh tier T5 · slow",
    body: "Workspace home 使用 tenant slow tier，約每 30 秒刷新一次。",
  };
}

function getEmptyReasonCards(
  data: HomePageData,
  activeBookings: BookingRecord[],
) {
  const cards: Array<{ reason: WorkspaceEmptyReason; code: string }> = [];

  if (activeBookings.length === 0) {
    cards.push({
      reason: data.bookings.length === 0 ? "no_data" : "filtered_empty",
      code: "bookings.workspace",
    });
  }

  if (
    data.readiness?.items.some(
      (item: TenantIntegrationReadinessItem) =>
        item.status === "not_provisioned",
    ) ??
    false
  ) {
    cards.push({ reason: "not_provisioned", code: "integration.provisioning" });
  }

  if (data.errors.length > 0) {
    cards.push({ reason: "fetch_failed", code: "workspace.partial_load" });
  }

  if (data.identity && !data.identity.roles.includes("tc_admin")) {
    cards.push({ reason: "permission_denied", code: "admin.module.hidden" });
  }

  if (
    data.readiness?.items.some(
      (item: TenantIntegrationReadinessItem) => item.status === "blocked",
    ) ??
    false
  ) {
    cards.push({
      reason: "external_unavailable",
      code: "external.delivery_path",
    });
  }

  if (cards.length === 0) {
    cards.push({ reason: "filtered_empty", code: "today.queue" });
  }

  return cards;
}

function buildModuleTiles(
  readiness: TenantIntegrationReadinessSummary | null,
  featureFlags: FeatureFlagSummary | null,
) {
  const enabledKeys = new Set<string>(
    featureFlags?.flags
      .filter((flag: FeatureFlagSummary["flags"][number]) => flag.enabled)
      .map((flag: FeatureFlagSummary["flags"][number]) => flag.key) ?? [],
  );

  const readinessMap = new Map<
    TenantIntegrationReadinessItem["subSystem"],
    TenantIntegrationReadinessItem
  >(
    readiness?.items.map((item: TenantIntegrationReadinessItem) => [
      item.subSystem,
      item,
    ]) ?? [],
  );

  const definitions = [
    {
      key: "bookings",
      title: "訂單",
      href: "/bookings",
      description: "查詢今日進行中與待審批 booking。",
      enabled: true,
      tone: "info" as CanvasTone,
    },
    {
      key: "api_keys",
      title: "API 金鑰",
      href: "/api-keys",
      description: "查看租戶整合授權、生命週期與 rotate 政策。",
      enabled: true,
      tone: getReadinessTone(
        readinessMap.get("api_keys")?.status ?? "not_provisioned",
      ),
    },
    {
      key: "webhooks",
      title: "Webhooks",
      href: "/webhooks",
      description: "追蹤 delivery 狀態與 disabled 原因。",
      enabled: true,
      tone: getReadinessTone(
        readinessMap.get("webhooks")?.status ?? "not_provisioned",
      ),
    },
    {
      key: "audit",
      title: "稽核",
      href: "/audit",
      description: "檢視 tenant / ops / platform / system cross-actor 軌跡。",
      enabled: true,
      tone: "accent" as CanvasTone,
    },
    {
      key: "reports",
      title: "報表",
      href: "/reports",
      description: "手動 refresh 的報表與月結輸出。",
      enabled: enabledKeys.size === 0 || enabledKeys.has("tenant_reports"),
      tone: getReadinessTone(readinessMap.get("reports")?.status ?? "ready"),
    },
    {
      key: "feature_flags",
      title: "功能旗標",
      href: "/feature-flags",
      description: "依 visible modules 與 rollout flag 決定頁面曝光。",
      enabled: enabledKeys.size > 0,
      tone: "neutral" as CanvasTone,
    },
  ] satisfies ModuleTile[];

  return definitions;
}

function buildQuickActions(
  readiness: TenantIntegrationReadinessSummary | null,
): QuickActionTile[] {
  const readinessMap = new Map<
    TenantIntegrationReadinessItem["subSystem"],
    TenantIntegrationReadinessItem
  >(
    readiness?.items.map((item: TenantIntegrationReadinessItem) => [
      item.subSystem,
      item,
    ]) ?? [],
  );
  const webhookAction = readinessMap.get("webhooks")?.nextAction;
  const apiKeyAction = readinessMap.get("api_keys")?.nextAction;
  const reportsAction = readinessMap.get("reports")?.nextAction;

  return [
    {
      title: "建立叫車",
      href: "/bookings/new",
      label: "New booking",
      description:
        "直接進入同步 command 建單流程；若外部確認延遲，畫面會呈現 accepted+pending。",
      descriptor: {
        action: "create_booking",
        enabled: true,
        riskLevel: "medium",
      },
    },
    {
      title: "查看今日訂單",
      href: "/bookings",
      label: "Today's bookings",
      description:
        "打開租戶 slow tier 的今日叫車清單，優先檢查 broadcasting / assigned / approval-required 狀態。",
    },
    {
      title: "整合就緒度",
      href: "/integration-governance",
      label: webhookAction?.action ?? "Open integration governance",
      description:
        "聚合 API key、webhook、notifications、SLA、reports readiness，同頁判讀目前缺口。",
      descriptor: webhookAction,
    },
    {
      title: "跨應用追蹤",
      href: buildCrossAppHref("ops-console", "/complaints/CMP-240528-17"),
      label: reportsAction?.action ?? "Open ops case",
      description:
        "針對跨 actor 事件直接跳到 ops-console 或 platform-admin，新分頁開啟。",
      descriptor: apiKeyAction,
      external: true,
    },
  ];
}

function buildCrossAppHref(
  targetApp: "ops-console" | "platform-admin",
  route: string,
) {
  if (targetApp === "ops-console") {
    const base =
      process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
    return `${base}${route}`;
  }

  const base =
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3004";
  return `${base}${route}`;
}

function getActionTone(descriptor?: ResourceActionDescriptor): CanvasTone {
  if (!descriptor) return "info";
  if (!descriptor.enabled) return "info";
  if (descriptor.riskLevel === "high") return "danger";
  if (descriptor.riskLevel === "medium") return "accent";
  return "success";
}

export default async function HomePage() {
  const data = await loadHomePageData();
  const activeBookings = data.bookings.filter(isOpenBooking);
  const attentionBookings = activeBookings.filter(
    (booking) =>
      booking.orderStatus === "dispatch_failed" ||
      booking.orderStatus === "dispatch_timeout" ||
      booking.orderStatus === "exception_hold" ||
      booking.orderStatus === "no_supply",
  );
  const unreadNotifications = data.notifications.filter(
    (notification) => notification.status === "unread",
  );
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );
  const blockedReadiness =
    data.readiness?.items.filter(
      (item: TenantIntegrationReadinessItem) => item.status === "blocked",
    ).length ?? 0;
  const refresh = getRefreshPresentation(
    data.errors.length > 0,
    blockedReadiness,
  );
  const emptyReasonCards = getEmptyReasonCards(data, activeBookings);
  const modules = buildModuleTiles(data.readiness, data.featureFlags);
  const quickActions = buildQuickActions(data.readiness);
  const tenantId = data.identity?.tenantId ?? DEMO_TENANT_ID;
  const tenantStatus =
    blockedReadiness > 0 ? "degraded" : data.readiness ? "active" : "unknown";
  const bookingRows: BookingRow[] = activeBookings
    .slice(0, 5)
    .map((booking) => ({
      bookingId: booking.bookingId,
      passenger: booking.passenger.name,
      route: `${booking.pickup.address} → ${booking.dropoff.address}`,
      window: `${formatDateTime(booking.reservationWindowStart)} - ${formatDateTime(booking.reservationWindowEnd)}`,
      state: booking.orderStatus,
    }));
  const bookingColumns: CanvasTableColumn<BookingRow>[] = [
    {
      h: "BK",
      k: "bookingId",
      mono: true,
      w: 140,
      r: (row) => (
        <Link
          href={`/bookings/${row.bookingId}`}
          style={{ color: th.accent, fontWeight: 600 }}
        >
          {row.bookingId}
        </Link>
      ),
    },
    { h: "PASSENGER", k: "passenger", w: 120 },
    {
      h: "ROUTE",
      k: "route",
      r: (row) => <span style={smallMetaStyle}>{row.route}</span>,
    },
    {
      h: "WINDOW",
      k: "window",
      mono: true,
      w: 190,
    },
    {
      h: "STATE",
      k: "state",
      w: 120,
      r: (row) => (
        <CanvasPill
          theme={th}
          tone={
            row.state === "assigned"
              ? "success"
              : row.state === "broadcasting"
                ? "info"
                : row.state === "approval_required"
                  ? "warn"
                  : "neutral"
          }
          dot
        >
          {row.state}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={`您好，${TENANT_CONSOLE_CONTEXT.split(" ")[0]}`}
        subtitle={`${formatDateTime(data.readiness?.computedAt ?? new Date().toISOString())} · refresh tier T5 slow`}
        actions={
          <>
            <ActionLink href="/bookings" label="今日訂單" variant="ghost" />
            <ActionLink
              href="/bookings/new"
              label="建立叫車"
              variant="primary"
            />
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={refresh.tone}
          icon={
            refresh.freshness === "fresh"
              ? "ok"
              : refresh.freshness === "stale"
                ? "clock"
                : "warn"
          }
          title={refresh.title}
          body={refresh.body}
        />

        {tenantStatus === "degraded" ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="租戶目前處於 degraded state"
            body="整合治理顯示至少一個子系統 blocked；Workspace 會保留跨應用追蹤與手動處理連結。"
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="進行中"
            value={formatCount(activeBookings.length)}
            sub={
              attentionBookings.length > 0
                ? `${formatCount(attentionBookings.length)} need follow-up`
                : "tenant queue stable"
            }
          />
          <CanvasKPI
            theme={th}
            label="待處理通知"
            value={formatCount(unreadNotifications.length)}
            sub={
              unreadNotifications.length > 0
                ? (unreadNotifications[0]?.channel ?? "inbox")
                : "inbox clear"
            }
          />
          <CanvasKPI
            theme={th}
            label="未結發票"
            value={formatCount(openInvoices.length)}
            sub={
              openInvoices[0]
                ? formatMoney(
                    openInvoices[0].amount.amountMinor,
                    openInvoices[0].amount.currency,
                  )
                : "no open artifact"
            }
          />
          <CanvasKPI
            theme={th}
            label="整合治理"
            value={formatCount(data.readiness?.items.length ?? 0)}
            sub={
              blockedReadiness > 0
                ? `${formatCount(blockedReadiness)} blocked`
                : "all tracked"
            }
          />
        </div>

        <div style={summaryGridStyle}>
          <div style={laneStyle}>
            <CanvasCard
              theme={th}
              title="租戶身分與可見模組"
              subtitle="tenant identity context + module enablement summary"
            >
              <div style={moduleMetaStyle}>
                <CanvasPill theme={th} tone="accent">
                  {data.identity?.realm ?? "tenant"}
                </CanvasPill>
                <CanvasPill theme={th} tone="info">
                  {tenantId}
                </CanvasPill>
                <CanvasPill
                  theme={th}
                  tone={tenantStatus === "active" ? "success" : "warn"}
                >
                  {tenantStatus}
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  {TENANT_CONSOLE_ENV}
                </CanvasPill>
              </div>

              <p style={mutedStyle}>
                角色 {data.identity?.roles.join(", ") || "未載入"}；scope 以
                tenant 為界， Workspace 首頁只顯示目前身分可進入的模組與狀態。
              </p>

              <div style={moduleGridStyle}>
                {modules.map((module) => (
                  <CanvasCard
                    key={module.key}
                    theme={th}
                    title={module.title}
                    subtitle={module.description}
                  >
                    <div style={moduleMetaStyle}>
                      <CanvasPill theme={th} tone={module.tone}>
                        {module.enabled ? "visible" : "hidden"}
                      </CanvasPill>
                      <span style={smallMetaStyle}>{module.href}</span>
                    </div>
                  </CanvasCard>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="進行中訂單"
              subtitle="pending bookings count + recent updates"
              padding={0}
            >
              {bookingRows.length > 0 ? (
                <CanvasTable<BookingRow>
                  theme={th}
                  columns={bookingColumns}
                  rows={bookingRows}
                />
              ) : (
                <div style={{ ...emptyStateStyle, margin: 16 }}>
                  <strong style={{ color: th.text }}>
                    今天沒有進行中的 booking
                  </strong>
                  <span style={mutedStyle}>
                    這裡會在下一次輪詢顯示
                    broadcasting、assigned、approval-required 等最新狀態。
                  </span>
                </div>
              )}
            </CanvasCard>
          </div>

          <div style={laneStyle}>
            <CanvasCard
              theme={th}
              title="Quick actions"
              subtitle="availableActions-driven CTAs + cross-app deep links"
            >
              <div style={quickActionGridStyle}>
                {quickActions.map((action) => (
                  <CanvasCard
                    key={action.title}
                    theme={th}
                    title={action.title}
                    subtitle={action.description}
                    style={quickActionCardStyle}
                  >
                    <CanvasPill
                      theme={th}
                      tone={getActionTone(action.descriptor)}
                    >
                      {action.label}
                    </CanvasPill>
                    {action.descriptor && !action.descriptor.enabled ? (
                      <span style={smallMetaStyle}>
                        disabled:{" "}
                        {action.descriptor.disabledReasonCode ?? "unavailable"}
                      </span>
                    ) : null}
                    <div style={{ marginTop: "auto" }}>
                      <ActionLink
                        href={action.href}
                        {...(action.external ? { external: true } : {})}
                        label={action.external ? "新分頁開啟" : "前往"}
                        variant={
                          action.descriptor?.enabled === false
                            ? "ghost"
                            : "secondary"
                        }
                      />
                    </div>
                  </CanvasCard>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Integration health"
              subtitle="aggregated /api/tenant/integration-governance/readiness"
            >
              <div style={cardListStyle}>
                {(data.readiness?.items ?? []).map(
                  (
                    item: TenantIntegrationReadinessItem,
                    index: number,
                    items: TenantIntegrationReadinessItem[],
                  ) => (
                    <div
                      key={item.subSystem}
                      style={
                        index === items.length - 1 ? undefined : listItemStyle
                      }
                    >
                      <div>
                        <div style={listTitleStyle}>{item.subSystem}</div>
                        <div style={listBodyStyle}>
                          {item.detail ?? "No detail returned."}
                        </div>
                      </div>
                      <div style={listItemTailStyle}>
                        <CanvasPill
                          theme={th}
                          tone={getReadinessTone(item.status)}
                        >
                          {getReadinessLabel(item.status)}
                        </CanvasPill>
                      </div>
                    </div>
                  ),
                )}
                {!data.readiness ? (
                  <div style={emptyStateStyle}>
                    <strong style={{ color: th.text }}>
                      Readiness summary unavailable
                    </strong>
                    <span style={mutedStyle}>
                      首頁保留模組骨架，但無法宣稱 integrations healthy。
                    </span>
                  </div>
                ) : null}
              </div>
            </CanvasCard>
          </div>
        </div>

        <div style={summaryGridStyle}>
          <CanvasCard
            theme={th}
            title="Empty reason state coverage"
            subtitle="six distinct EmptyReason treatments required by Q-X15"
          >
            <div style={emptyGridStyle}>
              {emptyReasonCards.map((item) => {
                const meta = EMPTY_REASON_META[item.reason]!;
                return (
                  <div
                    key={`${item.reason}:${item.code}`}
                    style={emptyStateStyle}
                  >
                    <CanvasPill theme={th} tone={meta.tone}>
                      {item.reason}
                    </CanvasPill>
                    <strong style={{ color: th.text }}>{meta.title}</strong>
                    <span style={mutedStyle}>{meta.body}</span>
                    <span style={smallMetaStyle}>
                      messageCode: <span style={monoStyle}>{item.code}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Recent notices and cross-app trails"
            subtitle="notifications + audit-style new-tab handoff"
          >
            <div style={sectionStackStyle}>
              <div style={cardListStyle}>
                {data.notifications
                  .slice(0, 3)
                  .map((notification, index, items) => (
                    <div
                      key={notification.notificationId}
                      style={
                        index === items.length - 1 ? undefined : listItemStyle
                      }
                    >
                      <div>
                        <div style={listTitleStyle}>{notification.title}</div>
                        <div style={listBodyStyle}>{notification.message}</div>
                      </div>
                      <div style={listItemTailStyle}>
                        <div>{notification.channel}</div>
                        <div>{formatDateTime(notification.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                {data.notifications.length === 0 ? (
                  <div style={emptyStateStyle}>
                    <strong style={{ color: th.text }}>
                      通知收件匣目前為空
                    </strong>
                    <span style={mutedStyle}>
                      bell inbox 沒有 unread 項目時，Workspace
                      仍保留跨應用追蹤捷徑。
                    </span>
                  </div>
                ) : null}
              </div>

              <div style={linkRowStyle}>
                <ActionLink
                  href={buildCrossAppHref(
                    "ops-console",
                    "/complaints/CMP-240528-17",
                  )}
                  external
                  label="Ops complaint"
                  variant="ghost"
                />
                <ActionLink
                  href={buildCrossAppHref(
                    "platform-admin",
                    "/audit?tenantId=tenant-demo-001",
                  )}
                  external
                  label="Platform audit"
                  variant="ghost"
                />
                <ActionLink
                  href="/audit"
                  label="Tenant audit"
                  variant="secondary"
                />
              </div>
            </div>
          </CanvasCard>
        </div>

        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分首頁切片退回 fallback"
            body={data.errors.join(" · ")}
          />
        ) : null}
      </div>
    </div>
  );
}
