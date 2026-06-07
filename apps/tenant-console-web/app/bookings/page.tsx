import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  ApiErrorEnvelope,
  ApiListData,
  ApiSuccessEnvelope,
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import { OWNED_ORDER_STATUSES, PHASE1_SERVICE_BUCKETS } from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  ServerCanvasTable,
  type ServerCanvasTableColumn,
} from "@/components/server-canvas-table";
import { RefreshTierControl } from "@/app/bookings/refresh-tier-control";
import {
  applyBookingListQuery,
  buildBookingListQueryString,
  hasActiveBookingFilters,
  parseBookingListQuery,
  toggleStatus,
} from "@/lib/booking-list";
import { API_URL, DEMO_ACTOR_ID, DEMO_TENANT_ID } from "@/lib/api-client";
import { formatTenantUiError } from "@/lib/error-copy";
import { formatDateTime } from "@/lib/formatters";
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import {
  getBookingSourceVisibility,
  getSourceToneClassName,
} from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const BOOKING_REFRESH_TIER: RefreshTier = "slow";
const BOOKING_STALE_AFTER_MS = 30_000;
const OPS_CONSOLE_ORIGIN =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN ?? "http://localhost:3103";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 11.5,
  fontWeight: 700,
  color: theme.textMuted,
  letterSpacing: 0.24,
  textTransform: "uppercase",
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "0 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const compactActionRowStyle: CSSProperties = {
  ...actionRowStyle,
  marginTop: 6,
};

const actionLinkStyle = (variant: "primary" | "secondary" = "secondary") =>
  ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    padding: "0 10px",
    borderRadius: 8,
    border: `1px solid ${variant === "primary" ? theme.accent : theme.border}`,
    background: variant === "primary" ? theme.accent : theme.surface,
    color: variant === "primary" ? "#ffffff" : theme.text,
    fontSize: 12,
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
  }) satisfies CSSProperties;

const disabledActionStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 28,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px dashed ${theme.border}`,
  color: theme.textMuted,
  fontSize: 12,
  whiteSpace: "nowrap",
};

const headerChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  textDecoration: "none",
  color: theme.text,
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const inlineMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

type SearchParamValue = string | string[] | undefined;
type BookingEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type BookingSlaStatus = {
  label: string;
  tone: CanvasTone;
  detail: string;
};

type BookingListRecord = BookingRecord & {
  availableActions: ResourceActionDescriptor[];
  editableUntil: string | null;
  crossAppLinks: CrossAppResourceLink[];
  slaStatus: BookingSlaStatus | null;
};

type BookingRow = Record<string, unknown> & {
  bookingCell: ReactNode;
  typeCell: ReactNode;
  routeCell: ReactNode;
  windowCell: ReactNode;
  passengerCell: ReactNode;
  stateCell: ReactNode;
  _selected?: boolean;
};

type BookingListPageData = {
  bookings: BookingListRecord[];
  pageInfo: ApiListData<BookingRecord>["pageInfo"];
  refresh: UiRefreshMetadata;
  emptyReason: BookingEmptyReason | null;
  errorMessage: string | null;
};

function first(value: SearchParamValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseEmptyReason(value: string): BookingEmptyReason | null {
  switch (value) {
    case "no_data":
    case "not_provisioned":
    case "fetch_failed":
    case "permission_denied":
    case "external_unavailable":
    case "filtered_empty":
      return value;
    default:
      return null;
  }
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMinutes(minutes: number) {
  return `${new Intl.NumberFormat("zh-Hant").format(minutes)} 分鐘`;
}

function formatRelativeDuration(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) {
    return "未知";
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${formatMinutes(diffMinutes)}前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} 小時前`;
  }

  return `${Math.floor(diffHours / 24)} 天前`;
}

function formatRemainingWindow(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) {
    return null;
  }

  const diffMs = parsed.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (diffMinutes <= 0) {
    return "已關閉";
  }

  if (diffMinutes < 60) {
    return `剩餘 ${formatMinutes(diffMinutes)}`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  const remainderMinutes = diffMinutes % 60;
  return `剩餘 ${diffHours} 小時 ${remainderMinutes} 分鐘`;
}

function getStatusTone(status: BookingRecord["orderStatus"]): CanvasTone {
  switch (status) {
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    case "dispatch_failed":
    case "dispatch_timeout":
    case "exception_hold":
    case "no_supply":
    case "redispatch_required":
      return "warn";
    default:
      return "info";
  }
}

function getApprovalTone(
  approvalState: BookingRecord["approvalState"],
): CanvasTone {
  switch (approvalState) {
    case "approved":
      return "success";
    case "pending":
      return "warn";
    case "blocked":
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}

function isActionableStatus(status: BookingRecord["orderStatus"]) {
  return status !== "completed" && status !== "cancelled";
}

function getActionDisabledReason(reasonCode?: string) {
  switch (reasonCode) {
    case "editable_window_passed":
      return "可編輯時窗已關閉";
    case "cancel_window_passed":
      return "可取消時窗已關閉";
    case "workflow_locked":
      return "流程已鎖定，不再接受租戶變更";
    default:
      return "目前不可用";
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case "open_detail":
      return "開啟明細";
    case "update_booking":
      return "編輯";
    case "cancel_booking":
      return "取消";
    case "create_booking":
      return "新增";
    case "open_ops_approval":
      return "營運審批";
    case "open_ops_dispatch":
      return "營運派遣";
    case "open_integration_governance":
      return "整合治理";
    case "reset_filters":
      return "清除篩選";
    default:
      return formatTenantCodeLabel(action, action);
  }
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  const origin = link.targetApp === "ops-console" ? OPS_CONSOLE_ORIGIN : "";
  return origin ? `${origin}${link.route}` : link.route;
}

function buildBookingCrossAppLinks(
  booking: BookingRecord,
): CrossAppResourceLink[] {
  const links: CrossAppResourceLink[] = [];

  if (
    booking.approvalState === "pending" ||
    booking.approvalState === "blocked"
  ) {
    links.push({
      targetApp: "ops-console",
      route: `/approval-requests?tenantId=${encodeURIComponent(
        booking.tenantId,
      )}&status=pending`,
      resourceType: "tenant_booking_approval_request",
      resourceId: booking.bookingId,
      openMode: "new_tab",
      label: "開啟營運審批佇列",
    });
  }

  if (
    booking.orderStatus === "dispatch_failed" ||
    booking.orderStatus === "dispatch_timeout" ||
    booking.orderStatus === "exception_hold" ||
    booking.orderStatus === "redispatch_required"
  ) {
    links.push({
      targetApp: "ops-console",
      route: `/dispatch?bookingId=${encodeURIComponent(booking.bookingId)}`,
      resourceType: "dispatch_queue_item",
      resourceId: booking.bookingId,
      openMode: "new_tab",
      label: "開啟營運派遣佇列",
    });
  }

  return links;
}

function buildBookingActions(
  booking: BookingRecord,
): ResourceActionDescriptor[] {
  const modifiableUntil = parseDate(booking.modifiableUntil);
  const cancelableUntil = parseDate(booking.cancelableUntil);
  const canEdit =
    isActionableStatus(booking.orderStatus) &&
    modifiableUntil !== null &&
    modifiableUntil.getTime() > Date.now();
  const canCancel =
    isActionableStatus(booking.orderStatus) &&
    cancelableUntil !== null &&
    cancelableUntil.getTime() > Date.now();

  const actions: ResourceActionDescriptor[] = [
    {
      action: "open_detail",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "update_booking",
      enabled: canEdit,
      ...(canEdit
        ? {}
        : {
            disabledReasonCode: booking.modifiableUntil
              ? "editable_window_passed"
              : "workflow_locked",
          }),
      riskLevel: "medium",
    },
    {
      action: "cancel_booking",
      enabled: canCancel,
      ...(canCancel
        ? {}
        : {
            disabledReasonCode: booking.cancelableUntil
              ? "cancel_window_passed"
              : "workflow_locked",
          }),
      requiresReason: true,
      riskLevel: "high",
    },
  ];

  if (
    booking.approvalState === "pending" ||
    booking.approvalState === "blocked"
  ) {
    actions.push({
      action: "open_ops_approval",
      enabled: true,
      riskLevel: "low",
    });
  }

  if (
    buildBookingCrossAppLinks(booking).some(
      (link) => link.resourceType === "dispatch_queue_item",
    )
  ) {
    actions.push({
      action: "open_ops_dispatch",
      enabled: true,
      riskLevel: "low",
    });
  }

  return actions;
}

function deriveSlaStatus(booking: BookingRecord): BookingSlaStatus | null {
  if (
    booking.orderStatus === "dispatch_failed" ||
    booking.orderStatus === "dispatch_timeout" ||
    booking.orderStatus === "no_supply" ||
    booking.orderStatus === "exception_hold"
  ) {
    return {
      label: "服務時限風險",
      tone: "warn",
      detail: "需要先恢復派遣，才能保護這筆預約的服務時窗。",
    };
  }

  const reservationStart = parseDate(booking.reservationWindowStart);
  if (!reservationStart) {
    return null;
  }

  const minutesUntilStart = Math.round(
    (reservationStart.getTime() - Date.now()) / 60000,
  );
  if (
    minutesUntilStart > 0 &&
    minutesUntilStart <= 45 &&
    isActionableStatus(booking.orderStatus)
  ) {
    return {
      label: "服務時限觀察",
      tone: "info",
      detail: `距離上車時窗開啟還有 ${formatMinutes(minutesUntilStart)}。`,
    };
  }

  return null;
}

function toBookingListRecord(booking: BookingRecord): BookingListRecord {
  return {
    ...booking,
    availableActions: buildBookingActions(booking),
    editableUntil: booking.modifiableUntil,
    crossAppLinks: buildBookingCrossAppLinks(booking),
    slaStatus: deriveSlaStatus(booking),
  };
}

function getActionHref(action: string, booking: BookingListRecord) {
  switch (action) {
    case "open_detail":
    case "update_booking":
    case "cancel_booking":
      return `/bookings/${booking.bookingId}`;
    case "open_ops_approval":
      return booking.crossAppLinks.find(
        (link) => link.resourceType === "tenant_booking_approval_request",
      );
    case "open_ops_dispatch":
      return booking.crossAppLinks.find(
        (link) => link.resourceType === "dispatch_queue_item",
      );
    default:
      return null;
  }
}

function getSubtypeLabel(subtype: BookingRecord["businessDispatchSubtype"]) {
  switch (subtype) {
    case "credit_card_airport_transfer":
      return "信用卡機場接送";
    case "enterprise_dispatch":
      return "企業派遣";
    default:
      return formatTenantCodeLabel(subtype, subtype);
  }
}

function getServiceBucketLabel(bucket: string) {
  switch (bucket) {
    case "business_dispatch":
      return "商務派遣";
    default:
      return formatTenantCodeLabel(bucket, bucket);
  }
}

function mapErrorToEmptyReason(
  status: number,
  errorCode?: string,
): BookingEmptyReason {
  if (status === 401 || status === 403) {
    return "permission_denied";
  }

  if (
    errorCode === "TENANT_NOT_FOUND" ||
    errorCode?.includes("NOT_CONFIGURED") ||
    errorCode?.includes("NOT_PROVISIONED")
  ) {
    return "not_provisioned";
  }

  if (status === 502 || status === 503 || status === 504) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

function getEmptyStateContent(
  reason: BookingEmptyReason,
  queryString: string,
): {
  title: string;
  description: string;
  tone: "info" | "warn";
  nextAction?: {
    descriptor: ResourceActionDescriptor;
    href: string;
  };
} {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "租戶設定尚未完成開通",
        description:
          "在租戶治理與下游整合完成這個工作區的設定前，訂單功能仍會保持不可用。",
        tone: "info",
        nextAction: {
          descriptor: {
            action: "open_integration_governance",
            enabled: true,
            riskLevel: "medium",
          },
          href: "/integration-governance",
        },
      };
    case "permission_denied":
      return {
        title: "目前沒有查看訂單的權限",
        description:
          "目前的租戶身分可以進入外框，但這個角色情境並未被授予訂單台帳可見權限。",
        tone: "warn",
      };
    case "external_unavailable":
      return {
        title: "訂單資料暫時不可用",
        description:
          "上游依賴沒有在時限內回應。請先重新載入此頁，若過舊狀態持續再交由營運處理。",
        tone: "warn",
      };
    case "fetch_failed":
      return {
        title: "訂單清單載入失敗",
        description:
          "頁面未能取得可信的租戶訂單快照。請重試此頁，若持續失敗再檢查服務健康狀態。",
        tone: "warn",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有符合的訂單",
        description: "請放寬預約日期範圍、清除狀態條件，或切回全部服務類別。",
        tone: "info",
        nextAction: {
          descriptor: {
            action: "reset_filters",
            enabled: true,
            riskLevel: "low",
          },
          href: queryString ? "/bookings" : "/bookings",
        },
      };
    case "no_data":
    default:
      return {
        title: "這個租戶目前還沒有訂單",
        description:
          "這看起來像是全新的租戶工作區。請建立第一筆訂單，或等待上游訂單流入填滿這份台帳。",
        tone: "info",
        nextAction: {
          descriptor: {
            action: "create_booking",
            enabled: true,
            riskLevel: "medium",
          },
          href: "/bookings/new",
        },
      };
  }
}

async function loadBookingsPageData(): Promise<BookingListPageData> {
  const refresh: UiRefreshMetadata = {
    generatedAt: new Date().toISOString(),
    staleAfterMs: BOOKING_STALE_AFTER_MS,
    dataFreshness: "unknown",
    source: "live",
  };

  try {
    const response = await fetch(`${API_URL}/api/tenant/bookings`, {
      cache: "no-store",
      headers: {
        "x-actor-type": "tenant_admin",
        "x-actor-id": DEMO_ACTOR_ID,
        "x-realm": "tenant",
        "x-tenant-id": DEMO_TENANT_ID,
      },
    });

    if (!response.ok) {
      const errorEnvelope = (await response
        .json()
        .catch(() => null)) as ApiErrorEnvelope | null;

      return {
        bookings: [],
        pageInfo: {
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
        },
        refresh: {
          ...refresh,
          dataFreshness: "degraded",
        },
        emptyReason: mapErrorToEmptyReason(
          response.status,
          errorEnvelope?.error.code,
        ),
        errorMessage: errorEnvelope?.error.message ?? "未知的訂單錯誤。",
      };
    }

    const envelope = (await response.json()) as ApiSuccessEnvelope<
      ApiListData<BookingRecord>
    >;

    return {
      bookings: envelope.data.items.map(toBookingListRecord),
      pageInfo: envelope.data.pageInfo,
      refresh: {
        generatedAt: envelope.meta.timestamp,
        staleAfterMs: BOOKING_STALE_AFTER_MS,
        dataFreshness: "fresh",
        source: "live",
      },
      emptyReason: null,
      errorMessage: null,
    };
  } catch (error) {
    return {
      bookings: [],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      },
      refresh: {
        ...refresh,
        dataFreshness: "degraded",
      },
      emptyReason: "fetch_failed",
      errorMessage: formatTenantUiError(
        error instanceof Error ? error.message : "未知的訂單錯誤。",
        "訂單清單讀取失敗",
      ),
    };
  }
}

function renderActionLink({
  href,
  label,
  external = false,
  variant = "secondary",
}: {
  href: string;
  label: string;
  external?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      href={href}
      style={actionLinkStyle(variant)}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {label}
    </Link>
  );
}

function renderBookingActionLinks(booking: BookingListRecord) {
  return (
    <div style={compactActionRowStyle}>
      {booking.availableActions.map((action) => {
        const label = getActionLabel(action.action);

        if (!action.enabled) {
          return (
            <span
              key={action.action}
              style={disabledActionStyle}
              title={getActionDisabledReason(action.disabledReasonCode)}
            >
              {label}
            </span>
          );
        }

        const target = getActionHref(action.action, booking);
        if (!target) {
          return null;
        }

        if (typeof target === "string") {
          return (
            <Link
              key={action.action}
              href={target}
              style={actionLinkStyle(
                action.action === "open_detail" ? "primary" : "secondary",
              )}
            >
              {label}
            </Link>
          );
        }

        return renderActionLink({
          href: buildCrossAppHref(target),
          label,
          external: target.openMode === "new_tab",
        });
      })}
    </div>
  );
}

function buildBookingRows(bookings: BookingListRecord[]): BookingRow[] {
  return bookings.map((booking) => {
    const editWindow = formatRemainingWindow(booking.editableUntil);
    const source = getBookingSourceVisibility(booking);
    const sourceToneClassName = getSourceToneClassName(source.tone);

    return {
      bookingCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <Link href={`/bookings/${booking.bookingId}`} style={headerChipStyle}>
            <span style={primaryTextStyle}>{booking.bookingId}</span>
          </Link>
          <span style={secondaryTextStyle}>{booking.orderId}</span>
          {renderBookingActionLinks(booking)}
        </div>
      ),
      typeCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryTextStyle}>
            {getSubtypeLabel(booking.businessDispatchSubtype)}
          </span>
          <span style={secondaryTextStyle}>
            {getServiceBucketLabel(booking.serviceBucket)}
          </span>
          <span className={sourceToneClassName}>{source.badge}</span>
        </div>
      ),
      routeCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryTextStyle}>{booking.pickup.address}</span>
          <span style={secondaryTextStyle}>↓ {booking.dropoff.address}</span>
        </div>
      ),
      windowCell: (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={primaryTextStyle}>
            {formatDateTime(booking.reservationWindowStart)}
          </span>
          <span style={secondaryTextStyle}>
            至 {formatDateTime(booking.reservationWindowEnd)}
          </span>
          <div style={inlineMetaStyle}>
            <CanvasPill theme={theme} tone="neutral">
              建立於 {formatRelativeDuration(booking.createdAt)}
            </CanvasPill>
            <CanvasPill theme={theme} tone="info">
              更新於 {formatRelativeDuration(booking.updatedAt)}
            </CanvasPill>
            {editWindow ? (
              <CanvasPill
                theme={theme}
                tone={editWindow === "已關閉" ? "neutral" : "warn"}
              >
                可編輯 {editWindow}
              </CanvasPill>
            ) : null}
          </div>
        </div>
      ),
      passengerCell: (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={primaryTextStyle}>{booking.passenger.name}</span>
          <span style={secondaryTextStyle}>{booking.passenger.phone}</span>
          <span style={secondaryTextStyle}>
            {booking.costCenter ?? "未指定成本中心"}
          </span>
        </div>
      ),
      stateCell: (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={inlineMetaStyle}>
            <CanvasPill
              theme={theme}
              tone={getStatusTone(booking.orderStatus)}
              dot
            >
              {formatTenantCodeLabel(booking.orderStatus, booking.orderStatus)}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={getApprovalTone(booking.approvalState)}
            >
              審批{" "}
              {formatTenantCodeLabel(
                booking.approvalState,
                booking.approvalState,
              )}
            </CanvasPill>
            {booking.slaStatus ? (
              <CanvasPill theme={theme} tone={booking.slaStatus.tone}>
                {booking.slaStatus.label}
              </CanvasPill>
            ) : null}
          </div>
          <span style={secondaryTextStyle}>
            {formatTenantCodeLabel(booking.status, booking.status)}
          </span>
          {booking.slaStatus ? (
            <span style={secondaryTextStyle}>{booking.slaStatus.detail}</span>
          ) : (
            <span style={secondaryTextStyle}>目前沒有發布服務時限警示。</span>
          )}
        </div>
      ),
      _selected:
        booking.approvalState === "pending" ||
        booking.approvalState === "blocked" ||
        booking.orderStatus === "dispatch_failed" ||
        booking.orderStatus === "dispatch_timeout" ||
        booking.orderStatus === "exception_hold" ||
        booking.orderStatus === "redispatch_required",
    };
  });
}

function getPageDeepLinks(bookings: BookingListRecord[]) {
  const links = new Map<string, CrossAppResourceLink>();

  for (const booking of bookings) {
    for (const link of booking.crossAppLinks) {
      links.set(`${link.resourceType}:${link.resourceId}`, link);
    }
  }

  return [...links.values()];
}

function getHeaderTabs(bookings: BookingListRecord[]) {
  const liveCount = bookings.filter((booking) =>
    isActionableStatus(booking.orderStatus),
  ).length;
  const reserveCount = bookings.filter((booking) => {
    const reservationStart = parseDate(booking.reservationWindowStart);
    return Boolean(reservationStart && reservationStart.getTime() > Date.now());
  }).length;
  const approvalCount = bookings.filter(
    (booking) => booking.approvalState === "pending",
  ).length;
  const completedCount = bookings.filter(
    (booking) => booking.orderStatus === "completed",
  ).length;
  const cancelledCount = bookings.filter(
    (booking) => booking.orderStatus === "cancelled",
  ).length;

  const tabs = [
    { id: "all", label: "全部", badge: String(bookings.length) },
    { id: "live", label: "進行中", badge: String(liveCount) },
    { id: "reserve", label: "預約", badge: String(reserveCount) },
    { id: "approval", label: "待審批", badge: String(approvalCount) },
    { id: "done", label: "已完成", badge: String(completedCount) },
    { id: "cancel", label: "取消", badge: String(cancelledCount) },
  ];

  return tabs.map((tab) => (
    <span key={tab.id}>
      {tab.label}
      {tab.badge ? ` ${tab.badge}` : ""}
    </span>
  ));
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const resolvedSearchParams = await searchParams;
  const query = parseBookingListQuery(resolvedSearchParams);
  const forcedEmptyReason = parseEmptyReason(
    first(resolvedSearchParams.emptyReason),
  );
  const data = await loadBookingsPageData();
  const result = applyBookingListQuery(data.bookings, query);
  const computedEmptyReason: BookingEmptyReason | null =
    forcedEmptyReason ??
    data.emptyReason ??
    (result.items.length > 0
      ? null
      : hasActiveBookingFilters(query)
        ? "filtered_empty"
        : "no_data");

  const queryString = buildBookingListQueryString(query);
  const rows =
    computedEmptyReason === null ? buildBookingRows(result.items) : [];
  const emptyState =
    computedEmptyReason !== null
      ? getEmptyStateContent(computedEmptyReason, queryString)
      : null;
  const pageDeepLinks =
    computedEmptyReason === null ? getPageDeepLinks(result.items) : [];
  const headerTabs = getHeaderTabs(data.bookings);
  const activeHeaderTab = headerTabs[0];

  const columns: ServerCanvasTableColumn<BookingRow>[] = [
    { h: "訂單", k: "bookingCell", w: 180 },
    { h: "類型", k: "typeCell", w: 150 },
    { h: "上車 → 下車", k: "routeCell", w: 300 },
    { h: "時窗", k: "windowCell", w: 240 },
    { h: "乘客", k: "passengerCell", w: 140 },
    { h: "狀態", k: "stateCell", w: 220 },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={theme}
        title="訂單"
        subtitle="本月所有預約 · 含進行中與已完成"
        tabs={headerTabs}
        activeTab={activeHeaderTab}
        actions={
          <div style={actionRowStyle}>
            <Link href="#booking-filters" style={actionLinkStyle("secondary")}>
              篩選
            </Link>
            <span style={disabledActionStyle} title="匯出功能尚未開通">
              匯出
            </span>
            {renderActionLink({
              href: "/bookings/new",
              label: "新增",
              variant: "primary",
            })}
            <RefreshTierControl
              metadata={data.refresh}
              tier={BOOKING_REFRESH_TIER}
            />
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {data.errorMessage ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            icon="warn"
            title="租戶訂單快照目前降級"
            body={data.errorMessage}
          />
        ) : null}

        <CanvasCard
          theme={theme}
          title="篩選"
          subtitle="可依訂單編號、叫車單、乘客搜尋，再用狀態、服務類別與預約日期範圍收斂結果。"
        >
          <form action="/bookings" id="booking-filters" style={filterFormStyle}>
            <input name="dateField" type="hidden" value={query.dateField} />

            <div style={filterGridStyle}>
              <label style={fieldLabelStyle}>
                搜尋
                <input
                  defaultValue={query.q}
                  name="q"
                  placeholder="訂單、叫車單、乘客"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                服務類別
                <select
                  defaultValue={query.serviceBucket}
                  name="serviceBucket"
                  style={inputStyle}
                >
                  <option value="all">全部類別</option>
                  {PHASE1_SERVICE_BUCKETS.map((bucket) => (
                    <option key={bucket} value={bucket}>
                      {getServiceBucketLabel(bucket)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldLabelStyle}>
                起始日
                <input
                  defaultValue={query.dateFrom}
                  name="dateFrom"
                  type="date"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                結束日
                <input
                  defaultValue={query.dateTo}
                  name="dateTo"
                  type="date"
                  style={inputStyle}
                />
              </label>
              <label style={fieldLabelStyle}>
                每頁筆數
                <select
                  defaultValue={String(query.pageSize)}
                  name="pageSize"
                  style={inputStyle}
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <div style={inlineMetaStyle}>
                {OWNED_ORDER_STATUSES.map((status) => {
                  const nextStatuses = toggleStatus(query.statuses, status);
                  const href = `/bookings?${buildBookingListQueryString(query, {
                    statuses: nextStatuses,
                    page: 1,
                  })}`;
                  const isActive = query.statuses.includes(status);

                  return (
                    <Link
                      href={href}
                      key={status}
                      style={{ textDecoration: "none" }}
                    >
                      <CanvasPill
                        theme={theme}
                        tone={isActive ? "accent" : "neutral"}
                      >
                        {formatTenantCodeLabel(status, status)}
                      </CanvasPill>
                    </Link>
                  );
                })}
              </div>

              {pageDeepLinks.length > 0 ? (
                <div style={inlineMetaStyle}>
                  {pageDeepLinks.map((link) =>
                    renderActionLink({
                      href: buildCrossAppHref(link),
                      label: link.label,
                      external: link.openMode === "new_tab",
                    }),
                  )}
                </div>
              ) : null}
            </div>

            <div style={actionRowStyle}>
              <button type="submit" style={actionLinkStyle("primary")}>
                套用篩選
              </button>
              <Link href="/bookings" style={actionLinkStyle("secondary")}>
                清除
              </Link>
            </div>
          </form>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title={`訂單清單 · 顯示 ${result.items.length} 筆 / 符合 ${result.total} 筆`}
          subtitle={`第 ${result.page} 頁，共 ${result.totalPages} 頁 · 快照 ${formatDateTime(
            data.refresh.generatedAt,
          )}`}
          padding={0}
        >
          {computedEmptyReason === null ? (
            <div style={{ display: "grid" }}>
              <ServerCanvasTable<BookingRow>
                theme={theme}
                columns={columns}
                rows={rows}
              />
              <div
                style={{
                  padding: "12px 14px",
                  borderTop: `1px solid ${theme.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={secondaryTextStyle}>
                  API 第 {data.pageInfo.page} 頁 · 快照筆數{" "}
                  {data.pageInfo.pageSize} · 總筆數 {data.pageInfo.totalItems}
                </span>
                <div style={actionRowStyle}>
                  {result.page > 1
                    ? renderActionLink({
                        href: `/bookings?${buildBookingListQueryString(query, {
                          page: result.page - 1,
                        })}`,
                        label: "上一頁",
                      })
                    : null}
                  {result.page < result.totalPages
                    ? renderActionLink({
                        href: `/bookings?${buildBookingListQueryString(query, {
                          page: result.page + 1,
                        })}`,
                        label: "下一頁",
                      })
                    : null}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: 18, display: "grid", gap: 14 }}>
              <CanvasBanner
                theme={theme}
                tone={emptyState?.tone ?? "info"}
                icon="warn"
                title={emptyState?.title}
                body={emptyState?.description}
              />
              {emptyState?.nextAction
                ? renderActionLink({
                    href: emptyState.nextAction.href,
                    label: getActionLabel(
                      emptyState.nextAction.descriptor.action,
                    ),
                    variant:
                      emptyState.nextAction.descriptor.action ===
                      "create_booking"
                        ? "primary"
                        : "secondary",
                  })
                : null}
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
