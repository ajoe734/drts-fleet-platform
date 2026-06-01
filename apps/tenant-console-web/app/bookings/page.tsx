import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  BookingRecord,
  BusinessDispatchSubtype,
  CrossAppResourceLink,
  EmptyReason,
  OwnedOrderStatus,
  RefreshTier,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  OWNED_ORDER_STATUSES,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
} from "@drts/ui-web";
import type { CanvasTableColumn, CanvasTone } from "@drts/ui-web";
import {
  BOOKING_TABS,
  type BookingListQuery,
  type BookingTab,
  applyBookingListQuery,
  buildBookingListQueryString,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { getTenantClient } from "@/lib/api-client";
import { formatDateTime } from "@/lib/formatters";
import { getBookingSourceVisibility } from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

// ── Refresh model (packet §3.2) ──────────────────────────────────────────────
// `/bookings` is the T5 Tenant slow tier (30s cadence). The UI never writes a
// magic number — the cadence label is derived from the shared RefreshTier.
const BOOKINGS_REFRESH_TIER: RefreshTier = "slow";
const REFRESH_TIER_CADENCE: Record<RefreshTier, string> = {
  urgent: "即時推播 · 5s",
  fast: "3s",
  dispatch: "5s",
  medium: "15s",
  medium_slow: "30s",
  slow: "30s",
  manual: "手動",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const refreshBarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  fontSize: 11.5,
  color: th.textMuted,
};

const refreshNoteStyle: CSSProperties = {
  flexBasis: "100%",
  fontSize: 11,
  lineHeight: 1.5,
  color: th.textDim,
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 12,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: 11.5,
  color: th.textMuted,
};

const controlStyle: CSSProperties = {
  height: 32,
  boxSizing: "border-box",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "0 10px",
  color: th.text,
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const statusChipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 4,
};

const chipBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 9px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.textMuted,
  fontSize: 11,
  fontFamily: th.monoFamily,
  textDecoration: "none",
};

const chipActiveStyle: CSSProperties = {
  ...chipBaseStyle,
  border: `1px solid ${th.accentBorder}`,
  background: th.accentBg,
  color: th.text,
};

const chipCountStyle: CSSProperties = {
  fontSize: 10,
  opacity: 0.75,
};

const cardStyle: CSSProperties = { overflow: "hidden" };

const linkStyle: CSSProperties = { textDecoration: "none" };

const tabLinkStyle: CSSProperties = {
  ...linkStyle,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  color: "inherit",
};

const tabBadgeStyle: CSSProperties = {
  fontSize: 10,
  fontFamily: th.monoFamily,
  padding: "1px 6px",
  borderRadius: 999,
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  color: th.textMuted,
};

const primaryCellStyle: CSSProperties = { color: th.accent, fontWeight: 600 };

const secondaryTextStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: th.textDim,
  fontSize: 10.5,
};

const routeStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  fontSize: 12,
  whiteSpace: "normal",
};

const subBadgeRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  marginTop: 4,
};

const actionCellStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  justifyContent: "flex-end",
};

// A disabled action keeps its affordance visible (packet §3.5 / ui-runtime.ts
// ResourceActionDescriptor: `enabled:false` + `disabledReasonCode` ⇒ show
// disabled, do not hide) and renders the reason as read-only copy — not only a
// hover tooltip — so the "why can't I act" answer is visible without a pointer.
const disabledActionStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: 2,
};

const disabledReasonStyle: CSSProperties = {
  fontSize: 10,
  lineHeight: 1.3,
  color: th.textDim,
  maxWidth: 120,
  textAlign: "right",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "40px 24px",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: th.text,
};

const emptyBodyStyle: CSSProperties = {
  maxWidth: 460,
  fontSize: 12.5,
  lineHeight: 1.55,
  color: th.textMuted,
};

const paginationRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 16px",
  borderTop: `1px solid ${th.border}`,
  fontSize: 11.5,
  color: th.textMuted,
};

// ── Cross-app deep links (packet §3.10 / Q-X03) ──────────────────────────────
// Cross-app links are NOT fabricated here. The booking read model emits a
// `CrossAppResourceLink[]` per booking (e.g. a read-scoped ops reconciliation
// link for forwarded / partner-fulfilled bookings whose lifecycle authority
// lives on the ops lane). The tenant console only binds a relative `route` to
// the target app's deployment origin — it never invents the descriptor itself.
const CROSS_APP_ORIGIN_ENV: Record<
  CrossAppResourceLink["targetApp"],
  { vars: (string | undefined)[]; fallback: string }
> = {
  "ops-console": {
    vars: [
      process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
      process.env.OPS_CONSOLE_ORIGIN,
    ],
    fallback: "http://localhost:3003",
  },
  "platform-admin": {
    vars: [
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
      process.env.PLATFORM_ADMIN_ORIGIN,
    ],
    fallback: "http://localhost:3002",
  },
  "tenant-console": {
    vars: [
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
      process.env.TENANT_CONSOLE_ORIGIN,
    ],
    fallback: "http://localhost:3000",
  },
};

function resolveCrossAppOrigin(
  targetApp: CrossAppResourceLink["targetApp"],
): string {
  const { vars, fallback } = CROSS_APP_ORIGIN_ENV[targetApp];
  const resolved = vars.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );
  return (resolved ?? fallback).replace(/\/$/, "");
}

function crossAppHref(link: CrossAppResourceLink): string {
  if (/^https?:\/\//.test(link.route)) {
    return link.route;
  }
  const origin = resolveCrossAppOrigin(link.targetApp);
  return `${origin}${link.route.startsWith("/") ? link.route : `/${link.route}`}`;
}

// ── Empty state (packet §3.6 — all 6 tenant EmptyReason values) ──────────────
type EmptyStateContent = {
  icon: Parameters<typeof CanvasBanner>[0]["icon"];
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  cta?: { href: string; label: string; newTab?: boolean };
};

function describeEmptyState(
  reason: EmptyReason,
  context: { clearHref: string; refreshHref: string },
): EmptyStateContent {
  switch (reason) {
    case "filtered_empty":
      return {
        icon: "filter",
        tone: "info",
        title: "沒有符合目前篩選的叫車",
        body: "目前的搜尋字串、狀態、服務類型或日期區間沒有對應的叫車。請放寬條件或清除篩選後再試一次。",
        cta: { href: context.clearHref, label: "清除篩選" },
      };
    case "not_provisioned":
      return {
        icon: "warn",
        tone: "warn",
        title: "租戶叫車模組尚未開通",
        body: "此租戶尚未完成叫車模組佈建。請先到整合就緒度頁面完成必要的設定，叫車清單才會開始投影資料。",
        cta: { href: "/integration-governance", label: "前往整合就緒度" },
      };
    case "permission_denied":
      return {
        icon: "warn",
        tone: "warn",
        title: "沒有檢視叫車的權限",
        body: "你目前的角色無法檢視此租戶的叫車清單。若需要存取權，請聯絡租戶管理員調整人員與角色設定。",
        cta: { href: "/users", label: "人員與角色" },
      };
    case "external_unavailable":
      return {
        icon: "warn",
        tone: "warn",
        title: "上游服務暫時無法連線",
        body: "叫車資料依賴的上游服務目前回應異常，這通常是暫時性的。稍候再重新整理即可；若持續發生請透過 ops 控制台確認服務狀態。",
        cta: { href: context.refreshHref, label: "重新整理" },
      };
    case "fetch_failed":
      return {
        icon: "warn",
        tone: "danger",
        title: "叫車清單載入失敗",
        body: "向後端讀取叫車清單時發生錯誤。這不是「沒有資料」，而是這次請求沒有成功。請重新整理；若反覆失敗請回報給平台維運。",
        cta: { href: context.refreshHref, label: "重新整理" },
      };
    case "driver_not_eligible":
      // Driver-app-specific reason (Q-DRV01); not applicable to tenant console.
      // Rendered defensively so an unexpected upstream value still shows copy.
      return {
        icon: "warn",
        tone: "info",
        title: "此狀態不適用於租戶叫車清單",
        body: "後端回傳了 driver 專用的空狀態原因；租戶端不會發生此情境。請回報以便修正讀取模型。",
      };
    case "no_data":
    default:
      return {
        icon: "bookings",
        tone: "info",
        title: "尚未有任何叫車",
        body: "這個租戶還沒有建立過叫車。建立第一筆叫車後，狀態、行程與審批進度都會即時投影到這個清單。",
        cta: { href: "/bookings/new", label: "建立第一筆叫車" },
      };
  }
}

// Map a thrown API error to the closest EmptyReason. The shared ApiClient
// throws `Error("API error <status>: …")`, so the HTTP status is recoverable
// from the message for honest, distinct empty-state rendering.
function emptyReasonFromError(error: unknown): EmptyReason {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/API error (\d{3})/);
  const status = statusMatch ? Number.parseInt(statusMatch[1] ?? "", 10) : null;

  if (status === 401 || status === 403) {
    return "permission_denied";
  }
  if (status === 404 || status === 409) {
    return "not_provisioned";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

// ── availableActions → CTAs (packet §3.5 / Q-TEN05) ──────────────────────────
// Row CTAs are driven strictly by `availableActions` returned per booking —
// never hard-coded by role, and editability is never inferred from status.
const ACTION_PRESENTATION: Record<
  string,
  {
    label: string;
    icon: Parameters<typeof CanvasBtn>[0]["icon"];
    danger?: boolean;
  }
> = {
  update: { label: "更新", icon: "check" },
  cancel: { label: "取消", icon: "x", danger: true },
  view: { label: "詳情", icon: "arrow" },
};

const READ_ONLY_REASON_LABELS: Record<string, string> = {
  past_editable_until: "已過可編輯時間",
  forwarded_authority: "外部平台權責",
  approval_locked: "審批進行中",
  completed: "已完成",
  cancelled: "已取消",
};

function readableReason(code: string | null | undefined): string {
  if (!code) return "目前無法操作";
  return READ_ONLY_REASON_LABELS[code] ?? code;
}

// ── Status & SLA presentation ────────────────────────────────────────────────
function orderStatusTone(status: OwnedOrderStatus): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    case "on_trip":
    case "proof_pending":
      return "accent";
    case "assigned":
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
      return "info";
    case "dispatch_failed":
    case "dispatch_timeout":
    case "no_supply":
    case "redispatch_required":
    case "exception_hold":
    case "delayed_queue":
      return "warn";
    default:
      return "neutral";
  }
}

function slaTone(
  state: NonNullable<BookingRecord["slaStatus"]>["state"],
): CanvasTone {
  switch (state) {
    case "breached":
      return "danger";
    case "at_risk":
      return "warn";
    case "on_track":
      return "success";
    default:
      return "neutral";
  }
}

const SUBTYPE_LABELS: Record<BusinessDispatchSubtype, string> = {
  credit_card_airport_transfer: "信用卡機場接送",
  enterprise_dispatch: "企業派遣",
};

const EDITABLE_SOON_MS = 60 * 60 * 1000; // urgency window: within 1h of cutoff

function describeEditability(
  booking: BookingRecord,
  now: number,
): { label: string; tone: CanvasTone } | null {
  if (!booking.editableUntil) {
    return null;
  }
  const deadline = new Date(booking.editableUntil).getTime();
  if (Number.isNaN(deadline)) {
    return null;
  }
  if (deadline <= now) {
    return { label: "已過可編輯", tone: "neutral" };
  }
  if (deadline - now <= EDITABLE_SOON_MS) {
    return { label: "可編輯即將截止", tone: "warn" };
  }
  return null;
}

function bookingAge(createdAt: string, now: number): string {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) {
    return "—";
  }
  const diffMinutes = Math.max(0, Math.round((now - created) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

// ── Filter form (packet §5.2 — search / service bucket / date range) ─────────
function FilterForm({ query }: { query: BookingListQuery }) {
  return (
    <form action="/bookings" method="get" style={filterFormStyle}>
      {/* Preserve the active tab across a filter submit. */}
      {query.tab !== "all" ? (
        <input type="hidden" name="tab" value={query.tab} />
      ) : null}
      <label style={fieldStackStyle}>
        <span>搜尋</span>
        <input
          name="q"
          defaultValue={query.q}
          placeholder="叫車編號、訂單、乘客、路線"
          style={controlStyle}
        />
      </label>
      <label style={fieldStackStyle}>
        <span>服務類型</span>
        <select
          name="subtype"
          defaultValue={query.subtype}
          style={controlStyle}
        >
          <option value="">全部類型</option>
          {BUSINESS_DISPATCH_SUBTYPES.map((subtype) => (
            <option key={subtype} value={subtype}>
              {SUBTYPE_LABELS[subtype]}
            </option>
          ))}
        </select>
      </label>
      <label style={fieldStackStyle}>
        <span>日期欄位</span>
        <select
          name="dateField"
          defaultValue={query.dateField}
          style={controlStyle}
        >
          <option value="reservationStart">預約起始</option>
          <option value="createdAt">建立時間</option>
        </select>
      </label>
      <label style={fieldStackStyle}>
        <span>起</span>
        <input
          name="dateFrom"
          type="date"
          defaultValue={query.dateFrom}
          style={controlStyle}
        />
      </label>
      <label style={fieldStackStyle}>
        <span>迄</span>
        <input
          name="dateTo"
          type="date"
          defaultValue={query.dateTo}
          style={controlStyle}
        />
      </label>
      <label style={fieldStackStyle}>
        <span>每頁</span>
        <select
          name="pageSize"
          defaultValue={String(query.pageSize)}
          style={controlStyle}
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <CanvasBtn theme={th} variant="primary" icon="filter" size="sm">
          套用篩選
        </CanvasBtn>
        <Link href="/bookings" style={linkStyle}>
          <CanvasBtn theme={th} icon="x" size="sm">
            清除
          </CanvasBtn>
        </Link>
      </div>
    </form>
  );
}

type BookingRow = BookingRecord & Record<string, unknown>;

const TAB_LABELS: Record<BookingTab, string> = {
  all: "全部",
  live: "進行中",
  reserve: "預約",
  approval: "待審批",
  done: "已完成",
  cancel: "取消",
};

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseBookingListQuery(await searchParams);
  const client = getTenantClient();

  const [bookingsResult] = await Promise.allSettled([
    client.listTenantBookings(),
  ]);

  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  const fetchFailed = bookingsResult.status === "rejected";
  const bookings = fetchFailed ? [] : bookingsResult.value;
  const result = applyBookingListQuery(bookings, query);

  const hasActiveFilters =
    query.q !== "" ||
    query.statuses.length > 0 ||
    query.subtype !== "" ||
    query.dateFrom !== "" ||
    query.dateTo !== "" ||
    query.tab !== "all";

  // Resolve the empty-state reason honestly: a rejected fetch is NOT "no data".
  const emptyReason: EmptyReason = fetchFailed
    ? emptyReasonFromError(bookingsResult.reason)
    : hasActiveFilters
      ? "filtered_empty"
      : "no_data";

  const currentQueryString = buildBookingListQueryString(query);
  const currentHref = currentQueryString
    ? `/bookings?${currentQueryString}`
    : "/bookings";

  const tabs: ReactNode[] = BOOKING_TABS.map((tab) => {
    const href = `/bookings?${buildBookingListQueryString(query, {
      tab,
      page: 1,
    })}`;
    return (
      <Link key={tab} href={href} style={tabLinkStyle}>
        {TAB_LABELS[tab]}
        <span style={tabBadgeStyle}>{result.tabCounts[tab]}</span>
      </Link>
    );
  });
  const activeTabIndex = BOOKING_TABS.indexOf(query.tab);

  const columns: CanvasTableColumn<BookingRow>[] = [
    {
      h: "BK",
      w: 100,
      mono: true,
      r: (row) => (
        <Link href={`/bookings/${row.bookingId}`} style={linkStyle}>
          <span style={primaryCellStyle}>{row.bookingId}</span>
        </Link>
      ),
    },
    {
      h: "ORDER",
      w: 110,
      mono: true,
      r: (row) => row.orderId || "—",
    },
    {
      h: "TYPE",
      w: 150,
      r: (row) => (
        <span>
          {SUBTYPE_LABELS[row.businessDispatchSubtype]}
          <span style={secondaryTextStyle}>{row.businessDispatchSubtype}</span>
        </span>
      ),
    },
    {
      h: "PICKUP → DROP",
      w: 320,
      r: (row) => (
        <div style={routeStackStyle}>
          <span>{row.pickup.address}</span>
          <span style={{ color: th.textDim, fontSize: 11 }}>
            ↓ {row.dropoff.address}
          </span>
        </div>
      ),
    },
    {
      h: "WINDOW",
      w: 170,
      mono: true,
      r: (row) => (
        <span>
          {formatDateTime(row.reservationWindowStart)}
          <span style={secondaryTextStyle}>
            建立 {bookingAge(row.createdAt, now)} · 更新{" "}
            {bookingAge(row.updatedAt, now)}前
          </span>
        </span>
      ),
    },
    {
      h: "PASS",
      w: 96,
      r: (row) => row.passenger.name,
    },
    {
      h: "STATE",
      w: 170,
      r: (row) => {
        const source = getBookingSourceVisibility(row);
        const editability = describeEditability(row, now);
        return (
          <div>
            <CanvasPill theme={th} tone={orderStatusTone(row.orderStatus)} dot>
              {row.orderStatus}
            </CanvasPill>
            <div style={subBadgeRowStyle}>
              {row.approvalState === "pending" ? (
                <CanvasPill theme={th} tone="warn">
                  待審批
                </CanvasPill>
              ) : null}
              {row.slaStatus ? (
                <CanvasPill theme={th} tone={slaTone(row.slaStatus.state)}>
                  SLA {row.slaStatus.label ?? row.slaStatus.state}
                </CanvasPill>
              ) : null}
              {editability ? (
                <CanvasPill theme={th} tone={editability.tone}>
                  {editability.label}
                </CanvasPill>
              ) : null}
              {source.domain !== "owned" ? (
                <CanvasPill theme={th} tone="info">
                  {source.badge}
                </CanvasPill>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      h: "ACTIONS",
      w: 220,
      align: "right",
      r: (row) => {
        const actions = row.availableActions ?? [];
        const mutateActions = actions.filter(
          (action) => action.action === "update" || action.action === "cancel",
        );
        return (
          <div style={actionCellStyle}>
            {mutateActions.map((action) => {
              const presentation = ACTION_PRESENTATION[action.action] ?? {
                label: action.action,
                icon: undefined,
              };
              if (!action.enabled) {
                // Disabled affordance: render the backend per-action
                // disabledReasonCode (falling back to the row read-only
                // reason) as visible copy, not only a hover tooltip.
                const reason = readableReason(
                  action.disabledReasonCode ?? row.readOnlyReasonCode,
                );
                return (
                  <span
                    key={action.action}
                    style={disabledActionStyle}
                    title={reason}
                  >
                    <CanvasBtn
                      theme={th}
                      size="xs"
                      icon={presentation.icon}
                      disabled
                    >
                      {presentation.label}
                    </CanvasBtn>
                    <span style={disabledReasonStyle}>{reason}</span>
                  </span>
                );
              }
              // Enabled mutate actions route to the detail command surface,
              // where the confirmation pattern + reason capture live.
              return (
                <Link
                  key={action.action}
                  href={`/bookings/${row.bookingId}`}
                  style={linkStyle}
                  title={`risk: ${action.riskLevel}`}
                >
                  <CanvasBtn
                    theme={th}
                    size="xs"
                    icon={presentation.icon}
                    danger={presentation.danger ?? false}
                  >
                    {presentation.label}
                  </CanvasBtn>
                </Link>
              );
            })}
            {mutateActions.length === 0 ? (
              <span
                style={{ fontSize: 10.5, color: th.textDim }}
                title={readableReason(row.readOnlyReasonCode)}
              >
                {readableReason(row.readOnlyReasonCode)}
              </span>
            ) : null}
            {(row.crossAppLinks ?? []).map((link) => (
              <a
                key={`${link.targetApp}:${link.resourceType}:${link.resourceId}:${link.route}`}
                href={crossAppHref(link)}
                target={link.openMode === "new_tab" ? "_blank" : undefined}
                rel={
                  link.openMode === "new_tab"
                    ? "noopener noreferrer"
                    : undefined
                }
                style={linkStyle}
              >
                <CanvasBtn theme={th} size="xs" icon="ext">
                  {link.label}
                </CanvasBtn>
              </a>
            ))}
            <Link href={`/bookings/${row.bookingId}`} style={linkStyle}>
              <CanvasBtn theme={th} size="xs" variant="primary" icon="arrow">
                詳情
              </CanvasBtn>
            </Link>
          </div>
        );
      },
    },
  ];

  const rows: BookingRow[] = result.items as BookingRow[];
  const emptyState = describeEmptyState(emptyReason, {
    clearHref: "/bookings",
    refreshHref: currentHref,
  });

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="叫車"
        subtitle="本租戶所有預約 · 含進行中、預約、待審批與已完成"
        tabs={tabs}
        activeTab={tabs[activeTabIndex] ?? tabs[0]}
        actions={
          <>
            <Link href="/bookings/new" style={linkStyle}>
              <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
                新增
              </CanvasBtn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {/* Refresh tier (packet §3.2) — T5 slow, with a manual re-poll. */}
        <div style={refreshBarStyle}>
          <CanvasPill theme={th} tone="info" dot>
            T5 · {REFRESH_TIER_CADENCE[BOOKINGS_REFRESH_TIER]}
          </CanvasPill>
          <span>資料更新於 {formatDateTime(generatedAt)}</span>
          <Link href={currentHref} style={linkStyle}>
            <CanvasBtn theme={th} icon="clock" size="xs">
              重新整理
            </CanvasBtn>
          </Link>
          <span style={refreshNoteStyle}>
            叫車狀態由 ops /
            派遣端在上游觸發，會於下一次輪詢時投影到此處。看到「已完成」或「已指派」可能比實際操作晚數十秒，屬正常延遲。
          </span>
        </div>

        <CanvasCard
          theme={th}
          title="篩選"
          subtitle="搜尋 · 服務類型 · 日期區間 · 每頁筆數"
        >
          <FilterForm query={query} />
          <div style={statusChipRowStyle}>
            {OWNED_ORDER_STATUSES.map((status) => {
              const active = query.statuses.includes(status);
              const href = `/bookings?${buildBookingListQueryString(query, {
                statuses: toggleStatus(query.statuses, status),
                page: 1,
              })}`;
              return (
                <Link
                  key={status}
                  href={href}
                  style={active ? chipActiveStyle : chipBaseStyle}
                >
                  {status}
                  <span style={chipCountStyle}>
                    {result.statusCounts[status] ?? 0}
                  </span>
                </Link>
              );
            })}
          </div>
        </CanvasCard>

        <CanvasCard theme={th} padding={0} style={cardStyle}>
          {rows.length > 0 ? (
            <>
              <CanvasTable<BookingRow>
                theme={th}
                columns={columns}
                rows={rows}
              />
              <div style={paginationRowStyle}>
                <span>
                  顯示 {rows.length} / {result.total} 筆（第 {result.page} /{" "}
                  {result.totalPages} 頁）
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {result.page > 1 ? (
                    <Link
                      href={`/bookings?${buildBookingListQueryString(query, {
                        page: result.page - 1,
                      })}`}
                      style={linkStyle}
                    >
                      <CanvasBtn theme={th} size="xs" icon="chevR">
                        上一頁
                      </CanvasBtn>
                    </Link>
                  ) : null}
                  {result.page < result.totalPages ? (
                    <Link
                      href={`/bookings?${buildBookingListQueryString(query, {
                        page: result.page + 1,
                      })}`}
                      style={linkStyle}
                    >
                      <CanvasBtn theme={th} size="xs" icon="chevR">
                        下一頁
                      </CanvasBtn>
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div style={emptyStateStyle}>
              <CanvasBanner
                theme={th}
                tone={emptyState.tone}
                icon={emptyState.icon}
                title={emptyState.title}
                body={emptyState.body}
              />
              <div style={emptyTitleStyle}>{emptyState.title}</div>
              <p style={emptyBodyStyle}>{emptyState.body}</p>
              {emptyState.cta ? (
                emptyState.cta.newTab ? (
                  <a
                    href={emptyState.cta.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={linkStyle}
                  >
                    <CanvasBtn theme={th} variant="primary" size="sm">
                      {emptyState.cta.label}
                    </CanvasBtn>
                  </a>
                ) : (
                  <Link href={emptyState.cta.href} style={linkStyle}>
                    <CanvasBtn theme={th} variant="primary" size="sm">
                      {emptyState.cta.label}
                    </CanvasBtn>
                  </Link>
                )
              ) : null}
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
