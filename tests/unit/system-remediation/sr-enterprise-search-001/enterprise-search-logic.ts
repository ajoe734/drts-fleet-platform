import type { BookingRecord } from "@drts/contracts";
import { ApiClientError } from "../../../../packages/api-client/src";

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
  if (!(error instanceof ApiClientError)) return "/degraded";
  const code = (error.code ?? "").toLowerCase();
  if (code.includes("quota") || code.includes("policy")) return "/quota-blocked";
  if (code.includes("supply") || code.includes("vehicle_unavailable"))
    return "/no-supply";
  return error.statusCode >= 500 ? "/degraded" : null;
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
    const fromTime = new Date(`${dateFrom}T00:00:00Z`).getTime();
    if (timestamp < fromTime) return false;
  }
  if (dateTo) {
    const toTime = new Date(`${dateTo}T23:59:59.999Z`).getTime();
    if (timestamp > toTime) return false;
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
  currentUser: string = "林宜君",
): BookingRecord[] {
  return bookings
    .filter((record) => {
      // 1. Scope filter
      if (criteria.scope === "mine") {
        if (record.passenger.name !== currentUser) return false;
      } else if (criteria.scope === "byme") {
        const isByMe = Boolean(
          record.bookedBy &&
            record.bookedBy.name === currentUser &&
            record.passenger.name !== currentUser,
        );
        if (!isByMe) return false;
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
