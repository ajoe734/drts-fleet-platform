import type {
  BookingRecord,
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web";
import { isFutureIso } from "./formatters";

// ─────────────────────────────────────────────────────────────────────────────
// Refresh tier (Q-X02). Booking detail is the tenant T5 "slow" 30s cadence.
// ─────────────────────────────────────────────────────────────────────────────

export const BOOKING_DETAIL_REFRESH_TIER = "slow" as const;

// ─────────────────────────────────────────────────────────────────────────────
// EmptyReason (Q-X15). Tenant-console surfaces 6 of the 7 EmptyReason values —
// `driver_not_eligible` is driver-app only. Each renders with a distinct tone,
// icon, and copy so the operator can tell "nothing yet" from "we could not
// load" from "you may not see this".
// ─────────────────────────────────────────────────────────────────────────────

export const BOOKING_EMPTY_REASONS = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const satisfies readonly EmptyReason[];

// Subset of CanvasIconName we actually use here. Assignable to the wider
// CanvasIconName the Canvas primitives expect (CanvasIconName is not re-exported
// from the package root, so we pin the literals we need).
export type BookingEmptyIcon =
  | "warn"
  | "x"
  | "clock"
  | "ok"
  | "filter"
  | "search";

export type BookingEmptyPresentation = {
  tone: CanvasTone;
  icon: BookingEmptyIcon;
  title: string;
  body: string;
};

export function parseBookingEmptyReason(
  value: string | undefined,
): EmptyReason | null {
  if (!value) {
    return null;
  }

  return (BOOKING_EMPTY_REASONS as readonly string[]).includes(value)
    ? (value as EmptyReason)
    : null;
}

export function getBookingEmptyPresentation(
  reason: EmptyReason,
): BookingEmptyPresentation {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info",
        icon: "clock",
        title: "此租戶的訂單模組尚未開通",
        body: "租戶設定流程尚未完成，目前沒有可顯示的訂單上下文。請先完成租戶開通，而不是顯示假資料。",
      };
    case "fetch_failed":
      return {
        tone: "warn",
        icon: "warn",
        title: "訂單內容載入失敗",
        body: "路由仍可連線，但此訂單的讀取模型暫時無法取得。等後端依賴恢復後重試。",
      };
    case "permission_denied":
      return {
        tone: "danger",
        icon: "x",
        title: "目前帳號無權檢視此訂單",
        body: "路由可見，但目前操作者沒有讀取此 tenant-owned 訂單的權限。請改由具權限的 tenant admin 檢視。",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        icon: "warn",
        title: "外部履約服務暫時無法連線",
        body: "此訂單由外部平台或夥伴履約，對接服務目前停機或回傳過期資料，部分欄位可能延遲。",
      };
    case "filtered_empty":
      return {
        tone: "neutral",
        icon: "filter",
        title: "目前篩選條件下沒有可顯示的關聯資料",
        body: "此訂單存在，但目前的篩選條件讓關聯列表（對帳單 / 活動）為空。清除篩選或調整條件。",
      };
    case "no_data":
    default:
      return {
        tone: "accent",
        icon: "search",
        title: "此訂單尚無可顯示的延伸資料",
        body: "訂單已建立，但尚未產生駕駛指派、對帳單或活動紀錄。狀態會在下一次輪詢時更新。",
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Q-TEN05 editability — editableUntil + readOnlyReasonCode + availableActions.
//
// The packet (§3.5) puts these three on the booking read model. Until
// UI-BE-007-BKG populates them on BookingRecord, we project them here at the
// page layer from the canonical booking fields, so the visual layer consumes a
// single Q-TEN05-shaped action set and NEVER recomputes editability from status
// or role inline (Q-X13).
// ─────────────────────────────────────────────────────────────────────────────

export type BookingReadOnlyReasonCode =
  | "terminal_completed"
  | "terminal_cancelled"
  | "on_trip_locked"
  | "approval_blocked"
  | "past_editable_until"
  | null;

const TERMINAL_ORDER_STATUSES = new Set(["completed", "cancelled"]);
const TRIP_LOCKED_ORDER_STATUSES = new Set(["on_trip", "proof_pending"]);

export function getEditableUntil(booking: BookingRecord): string | null {
  return booking.modifiableUntil;
}

export function getReadOnlyReasonCode(
  booking: BookingRecord,
): BookingReadOnlyReasonCode {
  if (booking.orderStatus === "completed") {
    return "terminal_completed";
  }

  if (booking.orderStatus === "cancelled") {
    return "terminal_cancelled";
  }

  if (TRIP_LOCKED_ORDER_STATUSES.has(booking.orderStatus)) {
    return "on_trip_locked";
  }

  if (
    booking.approvalState === "blocked" ||
    booking.approvalState === "rejected"
  ) {
    return "approval_blocked";
  }

  const editableUntil = getEditableUntil(booking);
  if (editableUntil !== null && !isFutureIso(editableUntil)) {
    return "past_editable_until";
  }

  return null;
}

export function describeReadOnlyReason(
  code: BookingReadOnlyReasonCode,
): { title: string; body: string } | null {
  switch (code) {
    case "terminal_completed":
      return {
        title: "此訂單已完成，僅供檢視",
        body: "已完成的訂單不再開放租戶端更新或取消，後續調整需透過帳務或客服流程處理。",
      };
    case "terminal_cancelled":
      return {
        title: "此訂單已取消，僅供檢視",
        body: "已取消的訂單為唯讀狀態，如需重新安排請建立新的預約。",
      };
    case "on_trip_locked":
      return {
        title: "行程進行中，租戶端已鎖定編輯",
        body: "司機已在執行此趟行程，租戶端無法再更新行程內容；如需介入請改走 ops 流程。",
      };
    case "approval_blocked":
      return {
        title: "審批未通過，編輯受限",
        body: "此訂單的審批處於 blocked / rejected 狀態，需先重新送出審批或調整內容後才能繼續。",
      };
    case "past_editable_until":
      return {
        title: "已超過可編輯時間 (editableUntil)",
        body: "租戶可自助修改的時間窗已關閉，後續變更需轉交其他權責面處理。",
      };
    case null:
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions (Q-X13) — single source of truth for CTAs. The visual layer
// renders strictly from these descriptors; it never maps role → action.
// ─────────────────────────────────────────────────────────────────────────────

export function buildBookingActions(
  booking: BookingRecord,
): ResourceActionDescriptor[] {
  const readOnlyCode = getReadOnlyReasonCode(booking);
  const updateEnabled = readOnlyCode === null;

  const isTerminal = TERMINAL_ORDER_STATUSES.has(booking.orderStatus);
  const cancelCutoff = booking.cancelableUntil;
  const cancelEnabled =
    !isTerminal && (cancelCutoff === null || isFutureIso(cancelCutoff));
  const cancelDisabledCode = isTerminal
    ? booking.orderStatus === "completed"
      ? "terminal_completed"
      : "terminal_cancelled"
    : "past_cancelable_until";

  const actions: ResourceActionDescriptor[] = [
    {
      action: "update",
      enabled: updateEnabled,
      riskLevel: "medium",
      ...(updateEnabled
        ? {}
        : { disabledReasonCode: readOnlyCode ?? "past_editable_until" }),
    },
    {
      action: "cancel",
      enabled: cancelEnabled,
      requiresReason: true,
      riskLevel: "high",
      ...(cancelEnabled ? {} : { disabledReasonCode: cancelDisabledCode }),
    },
  ];

  if (
    booking.approvalState === "rejected" ||
    booking.approvalState === "blocked"
  ) {
    actions.push({
      action: "resubmit_approval",
      enabled: !isTerminal,
      riskLevel: "medium",
      ...(isTerminal ? { disabledReasonCode: "terminal_state" } : {}),
    });
  }

  return actions;
}

export function findBookingAction(
  actions: readonly ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return actions.find((item) => item.action === action) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-app deep links (Q-X03 / §3.10). Ops/platform actions on a tenant
// booking deep-link back to the owning app, read-scoped, in a new tab.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OPS_CONSOLE_BASE = "/_apps/ops-console";

function resolveOpsConsoleBase(): string {
  const envValue =
    process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ??
    process.env.DRTS_OPS_CONSOLE_URL ??
    "";
  const trimmed = envValue.trim().replace(/\/$/, "");
  return trimmed || DEFAULT_OPS_CONSOLE_BASE;
}

export function crossAppHref(link: CrossAppResourceLink): string {
  const path = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${resolveOpsConsoleBase()}${path}`;
}

export function opsDispatchLink(orderId: string): CrossAppResourceLink {
  return {
    targetApp: "ops-console",
    route: `/dispatch?orderId=${encodeURIComponent(orderId)}`,
    resourceType: "owned_order",
    resourceId: orderId,
    openMode: "new_tab",
    label: "在 Ops Console 追蹤派遣",
  };
}

// Packet §4.2 / §3.10 (Q-X03): the tenant complaint reference deep-links to the
// ops-console complaint view, read-scoped, new tab. The spec sketches the target
// as `/complaints/[caseNo]`, but the tenant `BookingRecord` carries no complaint
// caseNo (no complaint linkage in @drts/contracts), so the faithful read-scoped
// realization is the order-filtered complaints view rather than a fabricated path.
export function opsComplaintsLink(orderId: string): CrossAppResourceLink {
  return {
    targetApp: "ops-console",
    route: `/complaints?orderId=${encodeURIComponent(orderId)}`,
    resourceType: "complaint_case",
    resourceId: orderId,
    openMode: "new_tab",
    label: "在 Ops Console 檢視客訴",
  };
}
