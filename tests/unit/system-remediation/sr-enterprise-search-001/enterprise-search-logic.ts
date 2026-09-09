import type { CSSProperties } from "react";
import type { BookingRecord } from "@drts/contracts";
import type { EntTheme } from "../../../../apps/enterprise-dispatch-web/lib/enterprise-theme";

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

  if (user.id && passenger.passengerId) {
    return user.id === passenger.passengerId;
  }
  if (user.phone && passenger.phone) {
    return user.phone === passenger.phone;
  }
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
  currentUser: EnterpriseCurrentUser = "林宜君",
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

  return "林宜君";
}
