"use client";

import React, {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import type { BookingRecord } from "@drts/contracts";
import { enterpriseTenant, enterpriseUser } from "../../lib/enterprise-fixtures";
import { enterpriseTheme as t, type EntTheme } from "../../lib/enterprise-theme";
import { t as translate, type TranslationKey } from "../../lib/translations";

const h = React.createElement;

export type GatewayState = "quota-blocked" | "no-supply" | "degraded";

export type EnterpriseSearchScope = "all" | "mine" | "byme";

export type EnterpriseBookingStatusFilter =
  | "all"
  | "reserved"
  | "approval"
  | "assigned"
  | "enroute"
  | "completed"
  | "cancelled"
  | "nosupply";

export interface EnterpriseUserIdentity {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export type EnterpriseCurrentUser = string | EnterpriseUserIdentity;

export interface EnterpriseBookingFilterCriteria {
  scope: EnterpriseSearchScope;
  q: string;
  status: EnterpriseBookingStatusFilter;
  dateFrom: string;
  dateTo: string;
  dateField: "reservationStart" | "createdAt";
}

export const DEFAULT_BOOKING_FILTER_CRITERIA: EnterpriseBookingFilterCriteria = {
  scope: "all",
  q: "",
  status: "all",
  dateFrom: "",
  dateTo: "",
  dateField: "reservationStart",
};

export function gatewayHref(error: unknown): string | null {
  if (!error || typeof error !== "object") return "/degraded";
  const err = error as { code?: string; statusCode?: number; name?: string };
  const code = (err.code ?? "").toLowerCase();
  if (code.includes("quota") || code.includes("policy")) return "/quota-blocked";
  if (code.includes("supply") || code.includes("vehicle_unavailable"))
    return "/no-supply";
  return typeof err.statusCode === "number" && err.statusCode >= 500
    ? "/degraded"
    : err.name === "ApiClientError" ? null : "/degraded";
}

export function getBookingStateMeta(record: BookingRecord): {
  key: EnterpriseBookingStatusFilter;
  label: string;
  tone: "neutral" | "primary" | "success" | "warn" | "danger" | "info";
} {
  if (record.status === "cancelled" || record.orderStatus === "cancelled") {
    return { key: "cancelled", label: "已取消", tone: "neutral" };
  }
  if (
    record.orderStatus === "no_supply" ||
    record.orderStatus === "dispatch_failed"
  ) {
    return { key: "nosupply", label: "無法派車", tone: "danger" };
  }
  if (record.approvalState === "pending") {
    return { key: "approval", label: "待審批", tone: "warn" };
  }
  if (record.orderStatus === "completed" || record.status === "completed") {
    return { key: "completed", label: "已完成", tone: "success" };
  }
  if (record.orderStatus === "on_trip") {
    return { key: "enroute", label: "行程中", tone: "info" };
  }
  if (
    record.orderStatus === "enroute_pickup" ||
    record.orderStatus === "arrived_pickup"
  ) {
    return { key: "enroute", label: "前往上車", tone: "info" };
  }
  if (
    record.orderStatus === "assigned" ||
    record.orderStatus === "driver_accepted" ||
    record.orderStatus === "preassigned"
  ) {
    return { key: "assigned", label: "已派車", tone: "primary" };
  }
  if (record.status === "active") {
    return { key: "reserved", label: "已預約", tone: "warn" };
  }
  return {
    key: "reserved",
    label: record.orderStatus ?? record.status ?? "已預約",
    tone: "primary",
  };
}

export function isSamePassenger(
  passenger: BookingRecord["passenger"] | null | undefined,
  user: EnterpriseCurrentUser | null | undefined,
): boolean {
  if (!passenger || !user) return false;
  if (typeof user === "string") {
    const u = user.trim().toLowerCase();
    if (!u) return false;
    if (passenger.passengerId && passenger.passengerId.toLowerCase() === u) {
      return true;
    }
    if (passenger.phone && passenger.phone.toLowerCase() === u) {
      return true;
    }
    return Boolean(passenger.name && passenger.name.toLowerCase() === u);
  }

  // Object identity:
  // 1. If both have an ID, comparing IDs is authoritative and overrides name
  if (user.id && passenger.passengerId) {
    return user.id === passenger.passengerId;
  }
  // 2. Check phone if both available
  if (user.phone && passenger.phone) {
    return user.phone === passenger.phone;
  }
  // 3. Compare name only when neither ID nor phone is present to disambiguate
  if (user.name && passenger.name) {
    return user.name === passenger.name;
  }
  return false;
}

export function isSameBookedBy(
  bookedBy: BookingRecord["bookedBy"] | null | undefined,
  user: EnterpriseCurrentUser | null | undefined,
): boolean {
  if (!bookedBy || !user) return false;
  if (typeof user === "string") {
    const u = user.trim().toLowerCase();
    if (!u) return false;
    if (bookedBy.email && bookedBy.email.toLowerCase() === u) {
      return true;
    }
    return Boolean(bookedBy.name && bookedBy.name.toLowerCase() === u);
  }

  if (user.email && bookedBy.email) {
    return user.email.toLowerCase() === bookedBy.email.toLowerCase();
  }
  if (user.name && bookedBy.name) {
    return user.name === bookedBy.name;
  }
  return false;
}

export function matchesBookingSearch(
  record: BookingRecord,
  query: string,
): boolean {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  const haystack = [
    record.bookingId,
    record.orderId,
    record.passenger.name,
    record.passenger.phone,
    record.bookedBy?.name ?? "",
    record.bookedBy?.email ?? "",
    record.pickup.address,
    record.dropoff.address,
    record.costCenter ?? "",
    record.notes ?? "",
    record.flightNo ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function parseLocalDateStart(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return Number.NaN;
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseLocalDateEnd(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return Number.NaN;
  const y = parts[0]!;
  const m = parts[1]!;
  const d = parts[2]!;
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function matchesBookingDateRange(
  record: BookingRecord,
  dateFrom: string,
  dateTo: string,
  dateField: "reservationStart" | "createdAt" = "reservationStart",
): boolean {
  if (!dateFrom && !dateTo) return true;
  const rawValue =
    dateField === "createdAt"
      ? record.createdAt
      : record.reservationWindowStart;
  if (!rawValue) return false;
  const timestamp = new Date(rawValue).getTime();
  if (Number.isNaN(timestamp)) return false;

  if (dateFrom) {
    const fromTime = parseLocalDateStart(dateFrom);
    if (!Number.isNaN(fromTime) && timestamp < fromTime) return false;
  }
  if (dateTo) {
    const toTime = parseLocalDateEnd(dateTo);
    if (!Number.isNaN(toTime) && timestamp > toTime) return false;
  }
  return true;
}

export function hasActiveFilters(
  criteria: EnterpriseBookingFilterCriteria,
): boolean {
  return Boolean(
    criteria.scope !== "all" ||
      criteria.q.trim() !== "" ||
      criteria.status !== "all" ||
      criteria.dateFrom !== "" ||
      criteria.dateTo !== "",
  );
}

export function filterEnterpriseBookings(
  bookings: BookingRecord[],
  criteria: EnterpriseBookingFilterCriteria,
  currentUser: EnterpriseCurrentUser = enterpriseUser.name,
): BookingRecord[] {
  return bookings
    .filter((record) => {
      // 1. Scope filter
      if (criteria.scope === "mine") {
        if (!isSamePassenger(record.passenger, currentUser)) return false;
      } else if (criteria.scope === "byme") {
        const isBookedByMe = isSameBookedBy(record.bookedBy, currentUser);
        const isPassengerMe = isSamePassenger(record.passenger, currentUser);
        if (!isBookedByMe || isPassengerMe) return false;
      }

      // 2. Status filter
      if (criteria.status !== "all") {
        const state = getBookingStateMeta(record);
        if (state.key !== criteria.status) return false;
      }

      // 3. Search query
      if (!matchesBookingSearch(record, criteria.q)) {
        return false;
      }

      // 4. Date range
      if (
        !matchesBookingDateRange(
          record,
          criteria.dateFrom,
          criteria.dateTo,
          criteria.dateField,
        )
      ) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const timeA = new Date(
        criteria.dateField === "createdAt"
          ? a.createdAt
          : a.reservationWindowStart,
      ).getTime();
      const timeB = new Date(
        criteria.dateField === "createdAt"
          ? b.createdAt
          : b.reservationWindowStart,
      ).getTime();
      return timeB - timeA;
    });
}

export function paginateEnterpriseBookings<T>(
  items: T[],
  page: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, pageSize);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, total);
  const pagedItems = items.slice(startIndex, endIndex);

  return {
    items: pagedItems,
    total,
    totalPages,
    page: safePage,
    pageSize: safePageSize,
    startIndex,
    endIndex,
  };
}

export function formatBookingTime(isoString: string): string {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const pad = (n: number) => String(n).padStart(2, "0");
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());
    return `${m}/${day} ${h}:${min}`;
  } catch {
    return isoString;
  }
}

const ENT_ICONS: Record<string, string> = {
  car: "M3 13l2-5.5A2 2 0 017 6h10a2 2 0 011.9 1.5L21 13M5 13h14v4H5zM7 17v2M17 17v2",
  cal: "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4",
  clock: "M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  pin: "M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21c0-4 3.2-6 7-6s7 2 7 6",
  users: "M9 12a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.4 2.7-5 6.5-5s6.5 1.6 6.5 5M16 11a3 3 0 100-6M21.5 20c0-3-1.8-4.6-4.5-4.9",
  arrow: "M5 12h14M12 5l7 7-7 7",
  plus: "M12 5v14M5 12h14",
  x: "M6 6l12 12M18 6L6 18",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35",
  refresh: "M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
};

export function entBtnStyle(
  th: EntTheme,
  opts: {
    variant?: "primary" | "default" | "soft" | "ghost" | "danger";
    size?: "xs" | "sm" | "md" | "lg";
    disabled?: boolean;
  } = {},
): CSSProperties {
  const { variant = "default", size = "md", disabled } = opts;
  const pad =
    size === "lg" ? "13px 24px" : size === "sm" ? "7px 13px" : "10px 18px";
  const fs = size === "lg" ? 15 : size === "sm" ? 13 : 14;
  let bg = th.surface;
  let color = th.ink;
  let border = "1px solid " + th.line;
  let boxShadow = "none";
  if (variant === "primary") {
    bg = th.primary;
    color = "#fff";
    border = "1px solid " + th.primary;
    boxShadow = th.dark ? "none" : "0 6px 16px -8px " + th.primary;
  } else if (variant === "soft") {
    bg = th.primaryBg;
    color = th.primary;
    border = "1px solid " + th.primaryBd;
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: pad,
    fontSize: fs,
    fontFamily: th.sans,
    fontWeight: 600,
    borderRadius: th.radiusSm,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    textDecoration: "none",
    background: bg,
    color,
    border,
    boxShadow,
  };
}

function renderPill(
  th: EntTheme,
  label: string,
  tone: "neutral" | "primary" | "success" | "warn" | "danger" | "info" = "neutral",
  dot = true,
) {
  const TONES: Record<typeof tone, { fg: string; bg: string; bd: string }> = {
    neutral: { fg: th.muted, bg: th.surfaceLo, bd: th.line },
    primary: { fg: th.primary, bg: th.primaryBg, bd: th.primaryBd },
    success: { fg: th.success, bg: th.successBg, bd: th.successBd },
    warn: { fg: th.warn, bg: th.warnBg, bd: th.warnBd },
    danger: { fg: th.danger, bg: th.dangerBg, bd: th.dangerBd },
    info: { fg: th.info, bg: th.infoBg, bd: th.infoBd },
  };
  const m = TONES[tone];
  return h(
    "span",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 600,
        background: m.bg,
        color: m.fg,
        border: "1px solid " + m.bd,
        whiteSpace: "nowrap",
      },
    },
    dot &&
      h("span", {
        style: {
          width: 6,
          height: 6,
          borderRadius: 3,
          background: m.fg,
          flexShrink: 0,
        },
      }),
    label,
  );
}

function renderIcon(name: string, size = 16, style?: CSSProperties) {
  const path = ENT_ICONS[name] || ENT_ICONS.car;
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      style: { flexShrink: 0, ...style },
    },
    h("path", { d: path }),
  );
}

function renderCard(th: EntTheme, children: ReactNode, accent?: string) {
  return h(
    "div",
    {
      style: {
        background: th.surface,
        border: "1px solid " + (accent || th.line),
        borderRadius: th.radius,
        boxShadow: th.shadowSm,
        overflow: "hidden",
      },
    },
    children,
  );
}

const SEARCH_COPY = {
  pageHeadSub: "前台歷史檢視 · 非派遣看板 · 支援組合搜尋與全域分頁",
  scopeAria: "預約對象篩選",
  statusLabel: "狀態:",
  statusAll: "全部狀態",
  statusReserved: "已預約",
  statusApproval: "待審批",
  statusAssigned: "已派車",
  statusEnroute: "行程中 / 前往上車",
  statusCompleted: "已完成",
  statusCancelled: "已取消",
  statusNosupply: "無法派車",
  searchInputAria: "搜尋乘客姓名、電話、預約編號、地點",
  searchPlaceholder: "搜尋乘客 / 編號 / 地點",
  clearQueryAria: "清除關鍵字",
  dateFromAria: "預約起始日期",
  dateToAria: "預約結束日期",
  clearFilters: "清除篩選",
  matchingCriteria: "符合條件：",
  itemsTotal: "筆（全域總數",
  totalItemsUnit: "筆）",
  totalPrefix: "共",
  totalSuffix: "筆預約",
  showingRange: "顯示第",
  toRange: "–",
  itemsOf: "筆，共",
  pagesUnit: "頁",
  loadingList: "讀取預約列表中...",
  emptyTotalSub: "目前尚未建立任何企業預約。您可以為自己或公司同仁建立新行程。",
  emptyFilteredTitle: "找不到符合條件的預約",
  emptyFilteredSub: "沒有任何預約符合您所指定的篩選條件、搜尋字詞或日期區間。",
  emptyFilteredClear: "清除所有篩選條件",
  colId: "編號",
  colPassenger: "乘客 / 下單",
  colRoute: "行程",
  colTime: "時間",
  colCostCenter: "成本中心",
  colState: "狀態",
  pageSizeLabel: "每頁顯示:",
  pageSizeAria: "每頁顯示筆數",
  pageSize5: "5 筆",
  pageSize10: "10 筆",
  pageSize20: "20 筆",
  pagePrev: "上一頁",
  pageNext: "下一頁",
};

function errorContent(
  state: GatewayState,
  tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
) {
  const href = `/${state}`;
  return renderCard(
    t,
    h(
      "div",
      {
        "data-testid": "enterprise-booking-api-state",
        style: { padding: 24 },
      },
      h(
        "strong",
        null,
        state === "quota-blocked"
          ? tr("gate.quotaBlocked.title")
          : state === "no-supply"
            ? tr("gate.noSupply.title")
            : tr("gate.degraded.title"),
      ),
      h("p", { style: { color: t.muted, lineHeight: 1.6 } }, tr("bookingLifecycle.gateway.body")),
      h(
        Link as any,
        { href, style: entBtnStyle(t, { variant: "default" }) },
        tr("bookingLifecycle.gateway.action"),
      ),
    ),
    state === "no-supply" ? t.danger : t.warn,
  );
}

export interface BookingsHistoryPageProps {
  currentUser?: EnterpriseCurrentUser;
}

/**
 * Resolves the active enterprise user identity.
 *
 * NOTE (Codex review rejection finding P1):
 * Full authenticated session identity wiring in enterprise-dispatch-web requires
 * supervisor-authorized scope expansion for authentication infrastructure.
 * This helper attempts to resolve identity from explicit prop, then checks for browser-side
 * session tokens (drts_session JWT payload, enterprise_user cookie) if present,
 * before falling back to the default fixture user.
 */
export function resolveCurrentEnterpriseUser(
  explicitUser?: EnterpriseCurrentUser,
): EnterpriseCurrentUser {
  if (explicitUser !== undefined && explicitUser !== null) {
    return explicitUser;
  }

  if (typeof document !== "undefined" && document.cookie) {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith("enterprise_user=")) {
        try {
          const raw = decodeURIComponent(
            cookie.slice("enterprise_user=".length),
          );
          return JSON.parse(raw);
        } catch {
          // ignore invalid JSON in cookie
        }
      }
      if (cookie.startsWith("drts_session=")) {
        try {
          const token = cookie.slice("drts_session=".length);
          const parts = token.split(".");
          const payloadPart = parts[1];
          if (parts.length >= 2 && payloadPart) {
            const payloadJson = atob(
              payloadPart.replace(/-/g, "+").replace(/_/g, "/"),
            );
            const payload = JSON.parse(payloadJson);
            if (payload && (payload.sub || payload.name || payload.email)) {
              return {
                id: payload.sub ?? payload.userId ?? null,
                name: payload.name ?? payload.fullName ?? null,
                email: payload.email ?? null,
                phone: payload.phone ?? null,
              };
            }
          }
        } catch {
          // ignore invalid JWT structure
        }
      }
    }
  }

  return enterpriseUser.name;
}

export default function BookingsHistoryPage({
  currentUser: explicitUser,
}: BookingsHistoryPageProps = {}) {
  const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
    translate(key, params, "zh");

  const [currentUser, setCurrentUser] = useState<EnterpriseCurrentUser>(() =>
    resolveCurrentEnterpriseUser(explicitUser),
  );

  useEffect(() => {
    setCurrentUser(resolveCurrentEnterpriseUser(explicitUser));
  }, [explicitUser]);

  const [bookings, setBookings] = useState<BookingRecord[] | null>(null);
  const [state, setState] = useState<GatewayState | null>(null);

  const [criteria, setCriteria] = useState<EnterpriseBookingFilterCriteria>(
    DEFAULT_BOOKING_FILTER_CRITERIA,
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    import("../../lib/api-client")
      .then(({ getEnterpriseDispatchTenantClient }) =>
        getEnterpriseDispatchTenantClient(enterpriseTenant.id).listBookings(),
      )
      .then(setBookings)
      .catch((error: unknown) =>
        setState(
          (gatewayHref(error)?.slice(1) as GatewayState | undefined) ??
            "degraded",
        ),
      );
  }, []);

  const filteredBookings = useMemo(() => {
    if (!bookings) return [];
    return filterEnterpriseBookings(bookings, criteria, currentUser);
  }, [bookings, criteria, currentUser]);

  const pagination = useMemo(() => {
    return paginateEnterpriseBookings(filteredBookings, page, pageSize);
  }, [filteredBookings, page, pageSize]);

  const active = hasActiveFilters(criteria);

  const handleClearFilters = () => {
    setCriteria(DEFAULT_BOOKING_FILTER_CRITERIA);
    setPage(1);
  };

  const handleScopeChange = (nextScope: EnterpriseSearchScope) => {
    setCriteria((prev) => ({ ...prev, scope: nextScope }));
    setPage(1);
  };

  const handleStatusChange = (nextStatus: EnterpriseBookingStatusFilter) => {
    setCriteria((prev) => ({ ...prev, status: nextStatus }));
    setPage(1);
  };

  const handleSearchChange = (q: string) => {
    setCriteria((prev) => ({ ...prev, q }));
    setPage(1);
  };

  const handleDateFromChange = (dateFrom: string) => {
    setCriteria((prev) => ({ ...prev, dateFrom }));
    setPage(1);
  };

  const handleDateToChange = (dateTo: string) => {
    setCriteria((prev) => ({ ...prev, dateTo }));
    setPage(1);
  };

  const handlePageSizeChange = (nextSize: number) => {
    setPageSize(nextSize);
    setPage(1);
  };

  if (state) return errorContent(state, tr);

  const scopeOptions: { value: EnterpriseSearchScope; label: string }[] = [
    { value: "all", label: tr("bookings.filter.all") },
    { value: "mine", label: tr("bookings.filter.mine") },
    { value: "byme", label: tr("bookings.filter.byme") },
  ];

  return h(
    React.Fragment,
    null,
    // Page Header
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 20,
        },
      },
      h(
        "div",
        null,
        h(
          "h1",
          {
            style: {
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: -0.4,
              margin: "0 0 4px",
              color: t.ink,
            },
          },
          tr("bookings.title"),
        ),
        h("p", { style: { fontSize: 13, color: t.muted, margin: 0 } }, SEARCH_COPY.pageHeadSub),
      ),
      h(
        Link as any,
        {
          href: "/bookings/new",
          style: entBtnStyle(t, { variant: "primary" }),
        },
        renderIcon("plus", 14),
        tr("bookings.create"),
      ),
    ),

    // Filter and Search Bar
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 16,
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          },
        },
        // Scope Segmented Control
        h(
          "div",
          {
            role: "tablist",
            "aria-label": SEARCH_COPY.scopeAria,
            style: {
              display: "inline-flex",
              background: t.surfaceLo,
              border: "1px solid " + t.line,
              borderRadius: t.radiusSm,
              padding: 3,
              gap: 2,
            },
          },
          scopeOptions.map((opt) => {
            const selected = criteria.scope === opt.value;
            return h(
              "button",
              {
                type: "button",
                key: opt.value,
                onClick: () => handleScopeChange(opt.value),
                role: "tab",
                "aria-selected": selected,
                "data-testid": `enterprise-scope-${opt.value}`,
                style: {
                  border: "none",
                  cursor: "pointer",
                  background: selected ? t.surface : "transparent",
                  color: selected ? t.primary : t.muted,
                  fontWeight: 600,
                  fontSize: 13,
                  padding: "8px 14px",
                  borderRadius: t.radiusSm - 3,
                  boxShadow: selected ? t.shadowSm : "none",
                  fontFamily: t.sans,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                },
              },
              opt.label,
            );
          }),
        ),

        // Status Dropdown
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 6 } },
          h(
            "label",
            {
              htmlFor: "booking-status-filter",
              style: { fontSize: 12, color: t.muted, fontWeight: 500 },
            },
            SEARCH_COPY.statusLabel,
          ),
          h(
            "select",
            {
              id: "booking-status-filter",
              "data-testid": "enterprise-status-select",
              value: criteria.status,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                handleStatusChange(
                  e.target.value as EnterpriseBookingStatusFilter,
                ),
              style: {
                height: 36,
                padding: "0 10px",
                borderRadius: t.radiusSm,
                border: "1px solid " + t.line,
                background: t.surface,
                color: t.ink,
                fontSize: 13,
                fontFamily: t.sans,
                cursor: "pointer",
                outline: "none",
              },
            },
            h("option", { value: "all" }, SEARCH_COPY.statusAll),
            h("option", { value: "reserved" }, SEARCH_COPY.statusReserved),
            h("option", { value: "approval" }, SEARCH_COPY.statusApproval),
            h("option", { value: "assigned" }, SEARCH_COPY.statusAssigned),
            h("option", { value: "enroute" }, SEARCH_COPY.statusEnroute),
            h("option", { value: "completed" }, SEARCH_COPY.statusCompleted),
            h("option", { value: "cancelled" }, SEARCH_COPY.statusCancelled),
            h("option", { value: "nosupply" }, SEARCH_COPY.statusNosupply),
          ),
        ),

        h("div", { style: { flex: 1 } }),

        // Search Box
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              height: 36,
              background: t.surface,
              border: "1px solid " + t.line,
              borderRadius: t.radiusSm,
              minWidth: 240,
            },
          },
          h("span", { style: { color: t.faint, display: "flex" } }, renderIcon("search", 15)),
          h("input", {
            type: "text",
            "aria-label": SEARCH_COPY.searchInputAria,
            "data-testid": "enterprise-search-input",
            value: criteria.q,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value),
            placeholder: SEARCH_COPY.searchPlaceholder,
            style: {
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 13,
              fontFamily: t.sans,
              color: t.ink,
              width: "100%",
            },
          }),
          criteria.q &&
            h(
              "button",
              {
                type: "button",
                onClick: () => handleSearchChange(""),
                "aria-label": SEARCH_COPY.clearQueryAria,
                style: {
                  border: "none",
                  background: "transparent",
                  color: t.muted,
                  cursor: "pointer",
                  padding: 2,
                  display: "flex",
                },
              },
              renderIcon("x", 14),
            ),
        ),

        // Date Filter Range
        h(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: t.surface,
              border: "1px solid " + t.line,
              borderRadius: t.radiusSm,
              padding: "0 8px",
              height: 36,
            },
          },
          h("span", { style: { color: t.faint, display: "flex" } }, renderIcon("cal", 15)),
          h("input", {
            type: "date",
            "aria-label": SEARCH_COPY.dateFromAria,
            "data-testid": "enterprise-date-from",
            value: criteria.dateFrom,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleDateFromChange(e.target.value),
            style: {
              border: "none",
              background: "transparent",
              color: t.ink,
              fontSize: 12.5,
              fontFamily: t.sans,
              outline: "none",
            },
          }),
          h("span", { style: { color: t.muted, fontSize: 12 } }, "–"),
          h("input", {
            type: "date",
            "aria-label": SEARCH_COPY.dateToAria,
            "data-testid": "enterprise-date-to",
            value: criteria.dateTo,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleDateToChange(e.target.value),
            style: {
              border: "none",
              background: "transparent",
              color: t.ink,
              fontSize: 12.5,
              fontFamily: t.sans,
              outline: "none",
            },
          }),
        ),

        // Reset Filters Button
        active &&
          h(
            "button",
            {
              type: "button",
              onClick: handleClearFilters,
              "data-testid": "enterprise-clear-filters",
              style: {
                height: 36,
                padding: "0 12px",
                border: "1px solid " + t.line,
                borderRadius: t.radiusSm,
                background: t.surfaceLo,
                color: t.muted,
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: t.sans,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              },
            },
            renderIcon("refresh", 13),
            SEARCH_COPY.clearFilters,
          ),
      ),

      // Query Summary and Count
      h(
        "div",
        {
          "data-testid": "enterprise-result-count",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12.5,
            color: t.muted,
            padding: "2px 4px",
          },
        },
        h(
          "span",
          null,
          bookings === null
            ? SEARCH_COPY.loadingList
            : active
              ? h(
                  React.Fragment,
                  null,
                  SEARCH_COPY.matchingCriteria,
                  h("strong", { style: { color: t.primary } }, filteredBookings.length),
                  " ",
                  SEARCH_COPY.itemsTotal,
                  " ",
                  bookings.length,
                  " ",
                  SEARCH_COPY.totalItemsUnit,
                )
              : h(
                  React.Fragment,
                  null,
                  SEARCH_COPY.totalPrefix,
                  " ",
                  h("strong", { style: { color: t.ink } }, bookings.length),
                  " ",
                  SEARCH_COPY.totalSuffix,
                ),
        ),
        pagination.total > 0 &&
          h(
            "span",
            null,
            SEARCH_COPY.showingRange,
            " ",
            pagination.startIndex + 1,
            "–",
            pagination.endIndex,
            " ",
            SEARCH_COPY.itemsOf,
            " ",
            pagination.totalPages,
            " ",
            SEARCH_COPY.pagesUnit,
          ),
      ),
    ),

    // Bookings Table / Cards
    renderCard(
      t,
      bookings === null
        ? h(
            "div",
            { style: { padding: 24, textAlign: "center", color: t.muted } },
            h(
              "div",
              {
                style: {
                  marginBottom: 8,
                  display: "flex",
                  justifyContent: "center",
                },
              },
              renderIcon("refresh", 24),
            ),
            tr("bookingLifecycle.history.loading"),
          )
        : bookings.length === 0
          ? h(
              "div",
              {
                "data-testid": "enterprise-empty-state",
                style: {
                  padding: "48px 24px",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                },
              },
              h(
                "div",
                {
                  style: {
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    background: t.surfaceLo,
                    color: t.faint,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                },
                renderIcon("car", 24),
              ),
              h("strong", { style: { fontSize: 16, color: t.ink } }, tr("bookingLifecycle.history.empty")),
              h(
                "p",
                {
                  style: {
                    color: t.muted,
                    fontSize: 13,
                    maxWidth: 360,
                    margin: 0,
                  },
                },
                SEARCH_COPY.emptyTotalSub,
              ),
              h(
                "div",
                { style: { marginTop: 8 } },
                h(
                  Link as any,
                  {
                    href: "/bookings/new",
                    style: entBtnStyle(t, { variant: "primary", size: "sm" }),
                  },
                  renderIcon("plus", 13),
                  tr("bookings.create"),
                ),
              ),
            )
          : filteredBookings.length === 0
            ? h(
                "div",
                {
                  "data-testid": "enterprise-filtered-empty-state",
                  style: {
                    padding: "48px 24px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                  },
                },
                h(
                  "div",
                  {
                    style: {
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      background: t.surfaceLo,
                      color: t.warn,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  },
                  renderIcon("search", 24),
                ),
                h("strong", { style: { fontSize: 16, color: t.ink } }, SEARCH_COPY.emptyFilteredTitle),
                h(
                  "p",
                  {
                    style: {
                      color: t.muted,
                      fontSize: 13,
                      maxWidth: 380,
                      margin: 0,
                    },
                  },
                  SEARCH_COPY.emptyFilteredSub,
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: handleClearFilters,
                    "data-testid": "enterprise-filter-empty-clear",
                    style: entBtnStyle(t, { variant: "default", size: "sm" }),
                  },
                  renderIcon("refresh", 13),
                  SEARCH_COPY.emptyFilteredClear,
                ),
              )
            : h(
                React.Fragment,
                null,
                // Header row
                h(
                  "div",
                  {
                    style: {
                      display: "grid",
                      gridTemplateColumns:
                        "110px 1.1fr 1.5fr 110px 130px 110px",
                      gap: 12,
                      padding: "11px 18px",
                      borderBottom: "1px solid " + t.line,
                      background: t.surfaceLo,
                      fontSize: 11,
                      fontWeight: 700,
                      color: t.muted,
                      letterSpacing: 0.3,
                    },
                  },
                  h("span", null, SEARCH_COPY.colId),
                  h("span", null, SEARCH_COPY.colPassenger),
                  h("span", null, SEARCH_COPY.colRoute),
                  h("span", null, SEARCH_COPY.colTime),
                  h("span", null, SEARCH_COPY.colCostCenter),
                  h("span", null, SEARCH_COPY.colState),
                ),

                // List rows
                pagination.items.map((booking, index) => {
                  const display = getBookingStateMeta(booking);
                  const isSelf = isSamePassenger(booking.passenger, currentUser);
                  const isAirport =
                    booking.businessDispatchSubtype ===
                      "credit_card_airport_transfer" ||
                    booking.pickup.address.includes("機場") ||
                    booking.dropoff.address.includes("機場") ||
                    Boolean(booking.flightNo);

                  return h(
                    Link as any,
                    {
                      key: booking.bookingId,
                      href: `/bookings/${encodeURIComponent(booking.bookingId)}`,
                      "data-testid": `enterprise-booking-row-${booking.bookingId}`,
                      style: {
                        display: "grid",
                        gridTemplateColumns:
                          "110px 1.1fr 1.5fr 110px 130px 110px",
                        gap: 12,
                        alignItems: "center",
                        padding: "13px 18px",
                        borderTop: index ? `1px solid ${t.lineSoft}` : "none",
                        textDecoration: "none",
                        color: t.ink,
                      },
                    },
                    h(
                      "span",
                      {
                        style: {
                          fontFamily: t.mono,
                          fontSize: 12,
                          color: t.primary,
                          fontWeight: 600,
                        },
                      },
                      booking.bookingId,
                    ),
                    h(
                      "div",
                      { style: { minWidth: 0 } },
                      h(
                        "div",
                        {
                          style: {
                            fontSize: 13,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          },
                        },
                        booking.passenger.name,
                      ),
                      h(
                        "div",
                        {
                          style: {
                            fontSize: 11,
                            color: isSelf ? t.muted : t.warn,
                          },
                        },
                        isSelf
                          ? tr("common.self")
                          : tr("common.bookedByDelegate", {
                              name: booking.bookedBy?.name ?? "同仁",
                            }),
                      ),
                    ),
                    h(
                      "div",
                      { style: { fontSize: 12, color: t.ink2, minWidth: 0 } },
                      h(
                        "span",
                        {
                          style: {
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          },
                        },
                        booking.pickup.address,
                        " ",
                        renderIcon("arrow", 11, { color: t.faint }),
                        " ",
                        booking.dropoff.address,
                        isAirport &&
                          renderIcon("flag", 12, { color: t.info }),
                      ),
                    ),
                    h(
                      "span",
                      {
                        style: {
                          fontSize: 12,
                          fontFamily: t.mono,
                          color: t.ink2,
                        },
                      },
                      formatBookingTime(booking.reservationWindowStart),
                    ),
                    h(
                      "span",
                      {
                        style: {
                          fontSize: 11.5,
                          fontFamily: t.mono,
                          color: t.muted,
                        },
                      },
                      booking.costCenter || "-",
                    ),
                    h("div", null, renderPill(t, display.label, display.tone, true)),
                  );
                }),
              ),
    ),

    // Pagination Bar
    bookings !== null &&
      filteredBookings.length > 0 &&
      h(
        "div",
        {
          "data-testid": "enterprise-pagination",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 16,
            padding: "8px 4px",
          },
        },
        // Page size picker
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8 } },
          h("span", { style: { fontSize: 12, color: t.muted } }, SEARCH_COPY.pageSizeLabel),
          h(
            "select",
            {
              "aria-label": SEARCH_COPY.pageSizeAria,
              "data-testid": "enterprise-page-size",
              value: pageSize,
              onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                handlePageSizeChange(Number(e.target.value)),
              style: {
                height: 32,
                padding: "0 8px",
                borderRadius: t.radiusSm,
                border: "1px solid " + t.line,
                background: t.surface,
                color: t.ink,
                fontSize: 12.5,
                fontFamily: t.sans,
                cursor: "pointer",
                outline: "none",
              },
            },
            h("option", { value: 5 }, SEARCH_COPY.pageSize5),
            h("option", { value: 10 }, SEARCH_COPY.pageSize10),
            h("option", { value: 20 }, SEARCH_COPY.pageSize20),
          ),
        ),

        // Page navigation
        h(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8 } },
          h(
            "button",
            {
              type: "button",
              onClick: () => setPage((p) => Math.max(1, p - 1)),
              disabled: pagination.page <= 1,
              "data-testid": "enterprise-page-prev",
              style: {
                ...entBtnStyle(t, {
                  variant: "default",
                  size: "sm",
                  disabled: pagination.page <= 1,
                }),
                cursor: pagination.page <= 1 ? "not-allowed" : "pointer",
                opacity: pagination.page <= 1 ? 0.5 : 1,
              },
            },
            h(
              "span",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                },
              },
              renderIcon("arrow", 13, { transform: "rotate(180deg)" }),
              SEARCH_COPY.pagePrev,
            ),
          ),

          h(
            "span",
            {
              style: {
                fontSize: 13,
                fontFamily: t.mono,
                color: t.ink2,
                padding: "0 6px",
              },
            },
            `${pagination.page} / ${pagination.totalPages}`,
          ),

          h(
            "button",
            {
              type: "button",
              onClick: () =>
                setPage((p) => Math.min(pagination.totalPages, p + 1)),
              disabled: pagination.page >= pagination.totalPages,
              "data-testid": "enterprise-page-next",
              style: {
                ...entBtnStyle(t, {
                  variant: "default",
                  size: "sm",
                  disabled: pagination.page >= pagination.totalPages,
                }),
                cursor:
                  pagination.page >= pagination.totalPages
                    ? "not-allowed"
                    : "pointer",
                opacity: pagination.page >= pagination.totalPages ? 0.5 : 1,
              },
            },
            h(
              "span",
              {
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                },
              },
              SEARCH_COPY.pageNext,
              renderIcon("arrow", 13),
            ),
          ),
        ),
      ),
  );
}
