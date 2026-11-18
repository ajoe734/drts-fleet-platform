import type {
  BookingRecord,
  BusinessDispatchSubtype,
  OwnedOrderStatus,
  Phase1ServiceBucket,
} from "@drts/contracts";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  OWNED_ORDER_STATUSES,
  PHASE1_SERVICE_BUCKETS,
} from "@drts/contracts";

export type BookingDateField = "reservationStart" | "createdAt";

/** Header tabs of the booking list; each one is a real, linkable filter. */
export const BOOKING_LIST_TABS = [
  "all",
  "live",
  "reserve",
  "approval",
  "done",
  "cancel",
] as const;
export type BookingListTab = (typeof BOOKING_LIST_TABS)[number];
const BOOKING_LIST_TAB_SET = new Set<string>(BOOKING_LIST_TABS);

export type BookingListQuery = {
  tab: BookingListTab;
  q: string;
  statuses: OwnedOrderStatus[];
  serviceBucket: Phase1ServiceBucket | "all";
  subtype: BusinessDispatchSubtype | "all";
  dateField: BookingDateField;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

type SearchParamValue = string | string[] | undefined;

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = new Set([10, 25, 50]);
const ORDER_STATUS_SET = new Set<OwnedOrderStatus>(OWNED_ORDER_STATUSES);
const SERVICE_BUCKET_SET = new Set<Phase1ServiceBucket>(PHASE1_SERVICE_BUCKETS);
const BOOKING_SUBTYPE_SET = new Set<BusinessDispatchSubtype>(
  BUSINESS_DISPATCH_SUBTYPES,
);

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

  const rawTab = first(searchParams.tab);

  return {
    tab: BOOKING_LIST_TAB_SET.has(rawTab) ? (rawTab as BookingListTab) : "all",
    q: first(searchParams.q).trim(),
    statuses,
    serviceBucket: SERVICE_BUCKET_SET.has(
      first(searchParams.serviceBucket) as Phase1ServiceBucket,
    )
      ? (first(searchParams.serviceBucket) as Phase1ServiceBucket)
      : "all",
    subtype: BOOKING_SUBTYPE_SET.has(
      first(searchParams.subtype) as BusinessDispatchSubtype,
    )
      ? (first(searchParams.subtype) as BusinessDispatchSubtype)
      : "all",
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

/**
 * Membership of one booking in a header tab. The tab counts and the tab
 * filter both use this, so a tab never lists rows its badge did not count.
 */
function isOpenBooking(booking: BookingRecord) {
  return (
    booking.orderStatus !== "completed" && booking.orderStatus !== "cancelled"
  );
}

export function matchesBookingTab(
  booking: BookingRecord,
  tab: BookingListTab,
  now: number = Date.now(),
) {
  switch (tab) {
    case "all":
      return true;
    case "live":
      return isOpenBooking(booking);
    case "reserve": {
      // A cancelled or completed booking is no longer a reservation, even
      // when its pickup window is still in the future.
      const start = new Date(booking.reservationWindowStart).getTime();
      return isOpenBooking(booking) && !Number.isNaN(start) && start > now;
    }
    case "approval":
      return booking.approvalState === "pending";
    case "done":
      return booking.orderStatus === "completed";
    case "cancel":
      return booking.orderStatus === "cancelled";
  }
}

export function countBookingTabs(
  bookings: BookingRecord[],
  now: number = Date.now(),
): Record<BookingListTab, number> {
  return Object.fromEntries(
    BOOKING_LIST_TABS.map((tab) => [
      tab,
      bookings.filter((booking) => matchesBookingTab(booking, tab, now)).length,
    ]),
  ) as Record<BookingListTab, number>;
}

export function applyBookingListQuery<TBooking extends BookingRecord>(
  bookings: TBooking[],
  query: BookingListQuery,
  now: number = Date.now(),
) {
  const filtered = bookings
    .filter((booking) => matchesBookingTab(booking, query.tab, now))
    .filter((booking) => matchesTextQuery(booking, query.q))
    .filter((booking) =>
      query.statuses.length === 0
        ? true
        : query.statuses.includes(booking.orderStatus),
    )
    .filter((booking) =>
      query.serviceBucket === "all"
        ? true
        : booking.serviceBucket === query.serviceBucket,
    )
    .filter((booking) =>
      query.subtype === "all"
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

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, totalPages);
  const startIndex = (page - 1) * query.pageSize;

  return {
    items: filtered.slice(startIndex, startIndex + query.pageSize),
    total,
    totalPages,
    page,
    statusCounts: getStatusCounts(filtered),
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

  if (next.tab !== "all") {
    params.set("tab", next.tab);
  }
  if (next.q) {
    params.set("q", next.q);
  }
  if (next.statuses.length > 0) {
    params.set("status", next.statuses.join(","));
  }
  if (next.serviceBucket !== "all") {
    params.set("serviceBucket", next.serviceBucket);
  }
  if (next.subtype !== "all") {
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

export function getStatusCounts(bookings: BookingRecord[]) {
  return bookings.reduce(
    (summary, booking) => {
      summary[booking.orderStatus] = (summary[booking.orderStatus] ?? 0) + 1;
      return summary;
    },
    {} as Partial<Record<OwnedOrderStatus, number>>,
  );
}

export function hasActiveBookingFilters(query: BookingListQuery) {
  return Boolean(
    query.tab !== "all" ||
    query.q ||
    query.statuses.length > 0 ||
    query.serviceBucket !== "all" ||
    query.subtype !== "all" ||
    query.dateFrom ||
    query.dateTo,
  );
}
