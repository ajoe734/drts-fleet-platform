import type {
  BookingRecord,
  BusinessDispatchSubtype,
  OwnedOrderStatus,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  OWNED_ORDER_STATUSES,
} from "@drts/contracts";

export type BookingDateField = "reservationStart" | "createdAt";

/**
 * Status-group tab vocabulary mirrored from the canvas Bookings list
 * (`Tenant Console.html` · TN_Bookings): 全部 / 進行中 / 預約 / 待審批 /
 * 已完成 / 取消. The grouping is derived from `orderStatus` + `approvalState`
 * so the tabs stay aligned to the canonical workflow vocabulary instead of a
 * tenant-local alias set.
 */
export type BookingTab =
  | "all"
  | "live"
  | "reserve"
  | "approval"
  | "done"
  | "cancel";

export const BOOKING_TABS: BookingTab[] = [
  "all",
  "live",
  "reserve",
  "approval",
  "done",
  "cancel",
];

/** Order statuses where a driver is actively fulfilling the trip (進行中). */
const LIVE_ORDER_STATUSES = new Set<OwnedOrderStatus>([
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const SUBTYPE_SET = new Set<BusinessDispatchSubtype>(BUSINESS_DISPATCH_SUBTYPES);

export type BookingListQuery = {
  q: string;
  statuses: OwnedOrderStatus[];
  tab: BookingTab;
  subtype: "" | BusinessDispatchSubtype;
  dateField: BookingDateField;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

/**
 * Classify a booking into its canvas tab. `approval` takes precedence so a
 * booking awaiting approval surfaces in 待審批 regardless of its dispatch
 * status; otherwise terminal states (done/cancel) win, then live, then the
 * remaining pre-dispatch / queued bookings fall into 預約.
 */
export function getBookingTab(booking: BookingRecord): BookingTab {
  if (booking.approvalState === "pending") {
    return "approval";
  }
  if (booking.orderStatus === "completed" || booking.status === "completed") {
    return "done";
  }
  if (booking.orderStatus === "cancelled" || booking.status === "cancelled") {
    return "cancel";
  }
  if (LIVE_ORDER_STATUSES.has(booking.orderStatus)) {
    return "live";
  }
  return "reserve";
}

function isBookingTab(value: string): value is BookingTab {
  return (BOOKING_TABS as string[]).includes(value);
}

type SearchParamValue = string | string[] | undefined;

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = new Set([10, 25, 50]);
const ORDER_STATUS_SET = new Set<OwnedOrderStatus>(OWNED_ORDER_STATUSES);

function first(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parsePositiveInt(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseBookingListQuery(
  searchParams: Record<string, SearchParamValue>,
): BookingListQuery {
  const rawStatuses = first(searchParams.status)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const statuses = rawStatuses.filter((entry): entry is OwnedOrderStatus =>
    ORDER_STATUS_SET.has(entry as OwnedOrderStatus),
  );
  const rawPageSize = parsePositiveInt(
    first(searchParams.pageSize),
    DEFAULT_PAGE_SIZE,
  );

  const rawTab = first(searchParams.tab).trim();
  const rawSubtype = first(searchParams.subtype).trim();

  return {
    q: first(searchParams.q).trim(),
    statuses,
    tab: isBookingTab(rawTab) ? rawTab : "all",
    subtype: SUBTYPE_SET.has(rawSubtype as BusinessDispatchSubtype)
      ? (rawSubtype as BusinessDispatchSubtype)
      : "",
    dateField:
      first(searchParams.dateField) === "createdAt"
        ? "createdAt"
        : "reservationStart",
    dateFrom: first(searchParams.dateFrom),
    dateTo: first(searchParams.dateTo),
    page: parsePositiveInt(first(searchParams.page), 1),
    pageSize: PAGE_SIZE_OPTIONS.has(rawPageSize)
      ? rawPageSize
      : DEFAULT_PAGE_SIZE,
  };
}

export function getBookingDateValue(
  booking: BookingRecord,
  field: BookingDateField,
) {
  return field === "createdAt"
    ? booking.createdAt
    : booking.reservationWindowStart;
}

function matchesTextQuery(booking: BookingRecord, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    booking.bookingId,
    booking.orderId,
    booking.passenger.name,
    booking.passenger.phone,
    booking.pickup.address,
    booking.dropoff.address,
    booking.costCenter ?? "",
    booking.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function applyBookingListQuery(
  bookings: BookingRecord[],
  query: BookingListQuery,
) {
  // Everything except the tab grouping: search + status chips + service
  // bucket + date window. Tab badge counts are computed over this set so the
  // badges reflect "how many of the currently-filtered bookings live in each
  // tab" rather than the unfiltered totals.
  const base = bookings
    .filter((booking) => matchesTextQuery(booking, query.q))
    .filter((booking) =>
      query.statuses.length === 0
        ? true
        : query.statuses.includes(booking.orderStatus),
    )
    .filter((booking) =>
      query.subtype === ""
        ? true
        : booking.businessDispatchSubtype === query.subtype,
    )
    .filter((booking) => {
      const value = getBookingDateValue(booking, query.dateField);
      if (!value) {
        return false;
      }
      const timestamp = new Date(value).getTime();
      if (Number.isNaN(timestamp)) {
        return false;
      }
      if (query.dateFrom) {
        const from = new Date(`${query.dateFrom}T00:00:00Z`).getTime();
        if (timestamp < from) {
          return false;
        }
      }
      if (query.dateTo) {
        const to = new Date(`${query.dateTo}T23:59:59Z`).getTime();
        if (timestamp > to) {
          return false;
        }
      }
      return true;
    })
    .sort((left, right) => {
      return (
        new Date(getBookingDateValue(right, query.dateField)).getTime() -
        new Date(getBookingDateValue(left, query.dateField)).getTime()
      );
    });

  const tabCounts = getTabCounts(base);
  const filtered =
    query.tab === "all"
      ? base
      : base.filter((booking) => getBookingTab(booking) === query.tab);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const startIndex = (page - 1) * query.pageSize;

  return {
    items: filtered.slice(startIndex, startIndex + query.pageSize),
    total,
    baseTotal: base.length,
    totalPages,
    page,
    statusCounts: getStatusCounts(filtered),
    tabCounts,
  };
}

export function buildBookingListQueryString(
  query: BookingListQuery,
  overrides: Partial<BookingListQuery> = {},
) {
  const next: BookingListQuery = {
    ...query,
    ...overrides,
  };
  const params = new URLSearchParams();

  if (next.q) {
    params.set("q", next.q);
  }
  if (next.statuses.length > 0) {
    params.set("status", next.statuses.join(","));
  }
  if (next.tab !== "all") {
    params.set("tab", next.tab);
  }
  if (next.subtype) {
    params.set("subtype", next.subtype);
  }
  if (next.dateField !== "reservationStart") {
    params.set("dateField", next.dateField);
  }
  if (next.dateFrom) {
    params.set("dateFrom", next.dateFrom);
  }
  if (next.dateTo) {
    params.set("dateTo", next.dateTo);
  }
  if (next.page > 1) {
    params.set("page", String(next.page));
  }
  if (next.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(next.pageSize));
  }

  return params.toString();
}

export function toggleStatus(
  statuses: OwnedOrderStatus[],
  target: OwnedOrderStatus,
) {
  const next = new Set(statuses);
  if (next.has(target)) {
    next.delete(target);
  } else {
    next.add(target);
  }

  return OWNED_ORDER_STATUSES.filter((status) => next.has(status));
}

export function getTabCounts(
  bookings: BookingRecord[],
): Record<BookingTab, number> {
  const counts: Record<BookingTab, number> = {
    all: bookings.length,
    live: 0,
    reserve: 0,
    approval: 0,
    done: 0,
    cancel: 0,
  };

  for (const booking of bookings) {
    counts[getBookingTab(booking)] += 1;
  }

  return counts;
}

export function getStatusCounts(bookings: BookingRecord[]) {
  return bookings.reduce(
    (summary, booking) => {
      summary[booking.orderStatus] = (summary[booking.orderStatus] ?? 0) + 1;
      return summary;
    },
    {} as Partial<Record<OwnedOrderStatus, number>>,
  );
}
