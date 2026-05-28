import type {
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  ResourceActionDescriptor,
  RefreshTier,
  UiRefreshMetadata,
} from "@drts/contracts";

import { isFutureIso } from "./formatters";

/**
 * Tenant `/bookings` runs at the T5 Tenant-slow refresh tier per
 * `docs/05-ui/tenant-console-design-handoff-packet-20260525.md` §3.2.
 */
export const BOOKING_LIST_REFRESH_TIER: RefreshTier = "slow";

/**
 * Cadence string the chrome shows next to the tier label. Mirrors the
 * Q-X02 fixed-cadence table — UI must not synthesise its own cadence.
 */
export const REFRESH_TIER_CADENCE_LABEL: Record<RefreshTier, string> = {
  urgent: "push + 5s fallback",
  fast: "3s",
  dispatch: "5s",
  medium: "15s",
  medium_slow: "30s",
  slow: "30s",
  manual: "manual",
};

export const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "driver_not_eligible",
  "filtered_empty",
] as const;

const EMPTY_REASON_SET = new Set<EmptyReason>(EMPTY_REASONS);

export function parseEmptyReasonOverride(value: unknown): EmptyReason | null {
  if (typeof value !== "string") {
    return null;
  }
  return EMPTY_REASON_SET.has(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

export type EmptyStateView = {
  envelope: EmptyStateEnvelope;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
};

/**
 * Map each Q-X15 `EmptyReason` to user-facing copy + an optional CTA
 * descriptor. Backend is expected to ship `EmptyStateEnvelope` alongside
 * the list response; until that wire format exists we synthesise the
 * same shape locally so the UI exhibits all six states distinctly.
 */
export function getEmptyStateView(reason: EmptyReason): EmptyStateView {
  switch (reason) {
    case "no_data":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.no_data",
          nextAction: {
            action: "create_booking",
            enabled: true,
            riskLevel: "medium",
          },
        },
        title: "尚無訂單 · No bookings yet",
        description:
          "本租戶目前沒有任何訂單。第一張預約建立後就會出現在這個列表。",
        ctaLabel: "建立第一張預約",
        ctaHref: "/bookings/new",
      };
    case "not_provisioned":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.not_provisioned",
          nextAction: {
            action: "open_integration_governance",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: "租戶尚未開通 · Tenant not provisioned",
        description:
          "派遣模組尚未為此租戶完成設定。請先到整合就緒度頁面查看缺漏的子系統 (API 金鑰 / Webhook / 通知)。",
        ctaLabel: "查看整合就緒度",
        ctaHref: "/integration-governance",
      };
    case "fetch_failed":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.fetch_failed",
          nextAction: {
            action: "retry",
            enabled: true,
            riskLevel: "low",
          },
        },
        title: "暫時無法載入 · Unable to load bookings",
        description:
          "後端訂單服務沒有回應。這通常是暫時的；請稍候再試。若持續失敗請至整合健康頁面查詢。",
        ctaLabel: "重新整理",
        ctaHref: "/bookings",
      };
    case "permission_denied":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.permission_denied",
        },
        title: "權限不足 · Permission denied",
        description:
          "您目前的角色 (tc_viewer / 訪客) 沒有閱覽此列表的權限。請聯絡 tenant admin 調整角色設定。",
        ctaLabel: "回到工作面",
        ctaHref: "/",
      };
    case "external_unavailable":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.external_unavailable",
        },
        title: "外部派遣引擎暫不可用 · External dispatch unavailable",
        description:
          "上游派遣 / 平台服務暫時不可用。已既有的訂單仍可查看,但新預約可能延遲或進入 accepted+pending 狀態 (Q-TEN04)。",
        ctaLabel: "查看平台狀態",
        ctaHref: "/integration-governance",
      };
    case "filtered_empty":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.filtered_empty",
        },
        title: "沒有符合的訂單 · No matching bookings",
        description:
          "目前的搜尋條件 / 狀態 chip / 日期區間沒有命中任何訂單。試著清除狀態 chip 或放寬時間區間。",
        ctaLabel: "清除篩選",
        ctaHref: "/bookings",
      };
    case "driver_not_eligible":
      return {
        envelope: {
          reason,
          messageCode: "tenant.bookings.empty.driver_not_eligible",
        },
        title: "駕駛資格未達 · Driver not eligible",
        description:
          "此 reason 屬於 driver-app 專用 (Q-DRV01)。tenant /bookings 不會自然進入此狀態；保留以滿足 EmptyReason 枚舉完備性與視覺驗證。",
      };
    default: {
      const exhaustive: never = reason;
      throw new Error(`Unhandled EmptyReason: ${String(exhaustive)}`);
    }
  }
}

export type RefreshFreshnessView = {
  state: UiRefreshMetadata["dataFreshness"];
  label: string;
  detail: string;
};

export function getRefreshFreshnessView(
  meta: UiRefreshMetadata,
): RefreshFreshnessView {
  switch (meta.dataFreshness) {
    case "fresh":
      return {
        state: meta.dataFreshness,
        label: "已最新",
        detail: `T5 Tenant slow · ${REFRESH_TIER_CADENCE_LABEL[BOOKING_LIST_REFRESH_TIER]} · ${meta.source}`,
      };
    case "stale":
      return {
        state: meta.dataFreshness,
        label: "資料偏舊",
        detail: `超過 ${Math.round(meta.staleAfterMs / 1000)}s 未刷新 — 派遣動作可能尚未反映`,
      };
    case "degraded":
      return {
        state: meta.dataFreshness,
        label: "服務降級",
        detail: "上游派遣或平台健康降級 · 顯示快取資料",
      };
    case "unknown":
    default:
      return {
        state: "unknown",
        label: "資料新鮮度未知",
        detail: "後端尚未提供 freshness envelope",
      };
  }
}

/**
 * Synthesise a `UiRefreshMetadata` envelope for the page. Real backend
 * support will replace this with the response envelope (per Q-X01).
 */
export function buildRefreshMetadata(
  generatedAt: Date = new Date(),
  source: UiRefreshMetadata["source"] = "live",
  dataFreshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt: generatedAt.toISOString(),
    staleAfterMs: 30_000,
    dataFreshness,
    source,
  };
}

/**
 * Q-TEN05 booking editability is driven by `availableActions` +
 * `editableUntil`, not by status alone. Until backend ships those fields
 * we approximate from `modifiableUntil` / `cancelableUntil` so the
 * visual treats the locally-derived state as if it came from the
 * descriptor envelope.
 */
export type BookingEditabilityView = {
  editableUntil: string | null;
  isEditable: boolean;
  readOnlyReasonCode: string | null;
  urgencyMinutes: number | null;
};

export function getBookingEditability(
  booking: BookingRecord,
): BookingEditabilityView {
  const editableUntil = booking.modifiableUntil;
  const isEditable = Boolean(
    editableUntil && isFutureIso(editableUntil) && booking.status === "active",
  );

  let readOnlyReasonCode: string | null = null;
  if (!isEditable) {
    if (booking.status === "completed") {
      readOnlyReasonCode = "booking_completed";
    } else if (booking.status === "cancelled") {
      readOnlyReasonCode = "booking_cancelled";
    } else if (booking.issuerAuthorizationRef) {
      readOnlyReasonCode = "forwarded_authority";
    } else {
      readOnlyReasonCode = "past_editable_until";
    }
  }

  let urgencyMinutes: number | null = null;
  if (isEditable && editableUntil) {
    urgencyMinutes = Math.max(
      0,
      Math.round((new Date(editableUntil).getTime() - Date.now()) / 60_000),
    );
  }

  return {
    editableUntil,
    isEditable,
    readOnlyReasonCode,
    urgencyMinutes,
  };
}

/**
 * Per-row `availableActions[]`. Backend should attach this to each
 * `BookingRecord`; until that field lands we derive it from the same
 * editability signals so the UI surface matches the eventual envelope
 * shape (Q-X13).
 */
export function getBookingRowActions(
  booking: BookingRecord,
): ResourceActionDescriptor[] {
  const { isEditable, readOnlyReasonCode } = getBookingEditability(booking);
  const disabledReason =
    !isEditable && readOnlyReasonCode ? readOnlyReasonCode : null;
  return [
    { action: "view_detail", enabled: true, riskLevel: "low" },
    {
      action: "update",
      enabled: isEditable,
      ...(disabledReason ? { disabledReasonCode: disabledReason } : {}),
      riskLevel: "medium",
    },
    {
      action: "cancel",
      enabled: isEditable,
      ...(disabledReason ? { disabledReasonCode: disabledReason } : {}),
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

/**
 * List-level CTAs per packet §5.2 "must-support actions". Driven by
 * descriptor envelope, not by role lookup (Q-X13).
 */
export const BOOKING_LIST_PAGE_ACTIONS: ResourceActionDescriptor[] = [
  { action: "create_booking", enabled: true, riskLevel: "medium" },
  { action: "filter", enabled: true, riskLevel: "low" },
  { action: "export", enabled: true, riskLevel: "low" },
];

export const BOOKING_LIST_ACTION_LABELS: Record<string, string> = {
  create_booking: "新增訂單",
  filter: "篩選",
  export: "匯出",
  view_detail: "查看詳情",
  update: "更新",
  cancel: "取消",
  retry: "重新整理",
  open_integration_governance: "查看整合就緒度",
};

export const BOOKING_LIST_ACTION_HREFS: Record<string, string> = {
  create_booking: "/bookings/new",
  filter: "#filters",
  export: "/bookings?export=csv",
  open_integration_governance: "/integration-governance",
};

/**
 * Group bookings into the canvas tabs (全部 / 進行中 / 預約 / 待審批 /
 * 已完成 / 取消). Approval bucket is approvalState-driven; the others
 * are derived from canonical OwnedOrderStatus + reservationWindowStart.
 */
export type BookingTabId =
  | "all"
  | "live"
  | "reserve"
  | "approval"
  | "done"
  | "cancel";

export type BookingTabDescriptor = {
  id: BookingTabId;
  labelZh: string;
  labelEn: string;
  tone?: "info" | "warn" | "default";
};

export const BOOKING_TABS: readonly BookingTabDescriptor[] = [
  { id: "all", labelZh: "全部", labelEn: "All", tone: "default" },
  { id: "live", labelZh: "進行中", labelEn: "Live", tone: "info" },
  { id: "reserve", labelZh: "預約", labelEn: "Reserved", tone: "default" },
  { id: "approval", labelZh: "待審批", labelEn: "Approval", tone: "warn" },
  { id: "done", labelZh: "已完成", labelEn: "Done", tone: "default" },
  { id: "cancel", labelZh: "取消", labelEn: "Cancelled", tone: "default" },
] as const;

const TAB_ID_SET = new Set<BookingTabId>(BOOKING_TABS.map((tab) => tab.id));

export function parseBookingTab(value: unknown): BookingTabId {
  if (typeof value !== "string") {
    return "all";
  }
  return TAB_ID_SET.has(value as BookingTabId)
    ? (value as BookingTabId)
    : "all";
}

const LIVE_ORDER_STATUSES = new Set<BookingRecord["orderStatus"]>([
  "ready_for_dispatch",
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const RESERVE_ORDER_STATUSES = new Set<BookingRecord["orderStatus"]>([
  "created",
  "recording_pending",
  "delayed_queue",
  "exception_hold",
]);

export function filterBookingsByTab(
  bookings: BookingRecord[],
  tab: BookingTabId,
): BookingRecord[] {
  switch (tab) {
    case "all":
      return bookings;
    case "live":
      return bookings.filter((booking) =>
        LIVE_ORDER_STATUSES.has(booking.orderStatus),
      );
    case "reserve":
      return bookings.filter(
        (booking) =>
          RESERVE_ORDER_STATUSES.has(booking.orderStatus) &&
          booking.status === "active",
      );
    case "approval":
      return bookings.filter((booking) => booking.approvalState === "pending");
    case "done":
      return bookings.filter((booking) => booking.status === "completed");
    case "cancel":
      return bookings.filter((booking) => booking.status === "cancelled");
    default: {
      const exhaustive: never = tab;
      throw new Error(`Unhandled BookingTabId: ${String(exhaustive)}`);
    }
  }
}

export function countBookingsByTab(
  bookings: BookingRecord[],
): Record<BookingTabId, number> {
  const counts: Record<BookingTabId, number> = {
    all: bookings.length,
    live: 0,
    reserve: 0,
    approval: 0,
    done: 0,
    cancel: 0,
  };
  for (const booking of bookings) {
    if (LIVE_ORDER_STATUSES.has(booking.orderStatus)) {
      counts.live += 1;
    }
    if (
      RESERVE_ORDER_STATUSES.has(booking.orderStatus) &&
      booking.status === "active"
    ) {
      counts.reserve += 1;
    }
    if (booking.approvalState === "pending") {
      counts.approval += 1;
    }
    if (booking.status === "completed") {
      counts.done += 1;
    }
    if (booking.status === "cancelled") {
      counts.cancel += 1;
    }
  }
  return counts;
}

/**
 * Cross-app deep link (Q-X03). Forwarded-authority bookings keep their
 * dispatch / driver state in ops-console; the tenant list surfaces a
 * read-scoped deep link so tenant admins can follow the trail without
 * inventing a tenant-local mirror of those states.
 */
export function getBookingCrossAppLink(
  booking: BookingRecord,
): CrossAppResourceLink | null {
  if (!booking.issuerAuthorizationRef) {
    return null;
  }
  return {
    targetApp: "ops-console",
    route: `/orders/${encodeURIComponent(booking.orderId)}`,
    resourceType: "owned_order",
    resourceId: booking.orderId,
    openMode: "new_tab",
    label: "在 ops-console 開啟訂單",
  };
}

/**
 * Approval-state visual treatment per packet §5.2 — approval-required
 * rows should be visually highlighted.
 */
export function isApprovalRequired(booking: BookingRecord): boolean {
  return booking.approvalState === "pending";
}
