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

export type BookingServiceBucketFilter = "all" | BookingRecord["serviceBucket"];
export type BookingSubtypeFilter = "all" | BusinessDispatchSubtype;

export type BookingListQuery = {
  q: string;
  statuses: OwnedOrderStatus[];
  serviceBucket: BookingServiceBucketFilter;
  subtype: BookingSubtypeFilter;
  approval: BookingRecord["approvalState"] | "all";
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
const SERVICE_BUCKET_FILTER_SET = new Set<BookingServiceBucketFilter>([
  "all",
  "business_dispatch",
]);
const SUBTYPE_FILTER_SET = new Set<BookingSubtypeFilter>([
  "all",
  ...BUSINESS_DISPATCH_SUBTYPES,
]);

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
  const legacyService = first(searchParams.service) as
    | BookingServiceBucketFilter
    | BookingSubtypeFilter;
  const serviceBucketValue = first(searchParams.serviceBucket);
  const subtypeValue = first(searchParams.subtype);

  const statuses = rawStatuses.filter((entry): entry is OwnedOrderStatus =>
    ORDER_STATUS_SET.has(entry as OwnedOrderStatus),
  );
  const rawPageSize = parsePositiveInt(
    first(searchParams.pageSize),
    DEFAULT_PAGE_SIZE,
  );

  return {
    q: first(searchParams.q).trim(),
    statuses,
    serviceBucket: SERVICE_BUCKET_FILTER_SET.has(
      serviceBucketValue as BookingServiceBucketFilter,
    )
      ? (serviceBucketValue as BookingServiceBucketFilter)
      : SERVICE_BUCKET_FILTER_SET.has(
            legacyService as BookingServiceBucketFilter,
          )
        ? (legacyService as BookingServiceBucketFilter)
        : "all",
    subtype: SUBTYPE_FILTER_SET.has(subtypeValue as BookingSubtypeFilter)
      ? (subtypeValue as BookingSubtypeFilter)
      : SUBTYPE_FILTER_SET.has(legacyService as BookingSubtypeFilter)
        ? (legacyService as BookingSubtypeFilter)
        : "all",
    approval:
      first(searchParams.approval) === "pending" ||
      first(searchParams.approval) === "approved" ||
      first(searchParams.approval) === "rejected" ||
      first(searchParams.approval) === "blocked"
        ? (first(searchParams.approval) as BookingRecord["approvalState"])
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
    booking.serviceBucket,
    booking.businessDispatchSubtype,
    booking.costCenter ?? "",
    booking.notes ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function applyBookingListQuery<T extends BookingRecord>(
  bookings: T[],
  query: BookingListQuery,
) {
  const filtered = bookings
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
    .filter((booking) =>
      query.approval === "all"
        ? true
        : booking.approvalState === query.approval,
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
  if (next.approval !== "all") {
    params.set("approval", next.approval);
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

export function getStatusCounts<T extends BookingRecord>(bookings: T[]) {
  return bookings.reduce(
    (summary, booking) => {
      summary[booking.orderStatus] = (summary[booking.orderStatus] ?? 0) + 1;
      return summary;
    },
    {} as Partial<Record<OwnedOrderStatus, number>>,
  );
}
