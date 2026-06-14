import type {
  BookingRecord,
  ComplianceGateRecord,
  InvoiceLineRecord,
  ManualFareOverrideRecord,
  MoneyAmount,
  OwnedOrderStatus,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { OWNED_ORDER_STATUSES } from "@drts/contracts";
import { type Locale, t } from "./translations";

const TERMINAL_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "completed",
  "cancelled",
]);

const ON_TRIP_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "on_trip",
]);

export type BookingTimelinePoint = {
  key: string;
  label: string;
  at: string | null;
  detail: string;
};

export function buildBookingTimeline(
  booking: BookingRecord,
  locale: Locale = "zh",
): BookingTimelinePoint[] {
  return [
    {
      key: "created",
      label: t("bookingDomain.timeline.created.label", locale),
      at: booking.createdAt,
      detail: t("bookingDomain.timeline.created.detail", locale),
    },
    {
      key: "window-start",
      label: t("bookingDomain.timeline.windowStart.label", locale),
      at: booking.reservationWindowStart,
      detail: t("bookingDomain.timeline.windowStart.detail", locale),
    },
    {
      key: "window-end",
      label: t("bookingDomain.timeline.windowEnd.label", locale),
      at: booking.reservationWindowEnd,
      detail: t("bookingDomain.timeline.windowEnd.detail", locale),
    },
    {
      key: "modify-cutoff",
      label: t("bookingDomain.timeline.modifyCutoff.label", locale),
      at: booking.modifiableUntil,
      detail: booking.modifiableUntil
        ? t("bookingDomain.timeline.modifyCutoff.detail", locale)
        : t("bookingDomain.timeline.modifyCutoff.detailNone", locale),
    },
    {
      key: "cancel-cutoff",
      label: t("bookingDomain.timeline.cancelCutoff.label", locale),
      at: booking.cancelableUntil,
      detail: booking.cancelableUntil
        ? t("bookingDomain.timeline.cancelCutoff.detail", locale)
        : t("bookingDomain.timeline.cancelCutoff.detailNone", locale),
    },
    {
      key: "current",
      label: t("bookingDomain.timeline.current.label", locale),
      at: booking.updatedAt,
      detail: t("bookingDomain.timeline.current.detail", locale, {
        status: formatBookingStatusLabel(booking.orderStatus, locale),
      }),
    },
  ];
}

export type BookingActionCapabilities = {
  canUpdate: boolean;
  canCancel: boolean;
  updateReason: string | null;
  cancelReason: string | null;
};

function isCutoffOpen(cutoff: string | null): boolean {
  if (cutoff == null) return true;
  const target = Date.parse(cutoff);
  if (Number.isNaN(target)) return true;
  return target > Date.now();
}

export function getBookingActionCapabilities(
  booking: BookingRecord,
  locale: Locale = "zh",
): BookingActionCapabilities {
  const isTerminal = TERMINAL_ORDER_STATUSES.has(booking.orderStatus);
  const isOnTripLane = ON_TRIP_ORDER_STATUSES.has(booking.orderStatus);
  const updateWindowOpen = isCutoffOpen(booking.modifiableUntil);
  const cancelWindowOpen = isCutoffOpen(booking.cancelableUntil);

  return {
    canUpdate: !isTerminal && !isOnTripLane && updateWindowOpen,
    canCancel: !isTerminal && cancelWindowOpen,
    updateReason: isTerminal
      ? t("bookingDomain.action.update.terminal", locale)
      : isOnTripLane
        ? t("bookingDomain.action.update.onTrip", locale)
        : updateWindowOpen
          ? null
          : t("bookingDomain.action.update.windowClosed", locale),
    cancelReason: isTerminal
      ? t("bookingDomain.action.cancel.terminal", locale)
      : cancelWindowOpen
        ? null
        : t("bookingDomain.action.cancel.windowClosed", locale),
  };
}

export function findInvoicesForOrder(
  invoices: TenantInvoiceRecord[],
  orderId: string,
): TenantInvoiceRecord[] {
  return invoices.filter((invoice) =>
    invoice.lines.some((line: InvoiceLineRecord) => line.orderId === orderId),
  );
}

export function describeManualFareOverride(
  override: ManualFareOverrideRecord | null,
  locale: Locale = "zh",
): string {
  if (!override) return t("bookingDomain.override.none", locale);
  return `${override.actorType} · ${override.reason}`;
}

export function summarizeComplianceGates(
  gates: ComplianceGateRecord[] | undefined,
  locale: Locale = "zh",
): string {
  if (!gates || gates.length === 0) {
    return t("bookingDomain.compliance.none", locale);
  }
  const blocked = gates.filter((gate) => gate.blocking).length;
  if (blocked > 0) {
    return t("bookingDomain.compliance.blocking", locale, {
      count: blocked,
      total: gates.length,
    });
  }
  return t("bookingDomain.compliance.noneBlocking", locale, {
    count: gates.length,
  });
}

export function formatMoney(
  amount: MoneyAmount | null | undefined,
  locale: Locale = "zh",
): string {
  if (!amount) return t("bookingDomain.notPublished", locale);
  const minor = Number(amount.amountMinor);
  if (!Number.isFinite(minor)) return t("bookingDomain.notPublished", locale);
  const major = (minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${major} ${amount.currency}`;
}

export function formatDateTime(
  iso: string | null | undefined,
  locale: Locale = "zh",
): string {
  if (!iso) return t("bookingDomain.notPublished", locale);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("bookingDomain.notPublished", locale);
  }
  return date.toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

export function formatBookingStatusLabel(
  status: OwnedOrderStatus,
  locale: Locale = "zh",
): string {
  const key = `bookingStatus.${status}`;
  const label = t(key, locale);
  return label === key ? status.replace(/_/g, " ") : label;
}

// ── Shared list query model (XS-UI-004 SharedListQueryV1) ──────────────────

export type BookingDateField = "reservationStart" | "createdAt";

export type BookingListQuery = {
  q: string;
  statuses: OwnedOrderStatus[];
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

  return {
    q: first(searchParams.q).trim(),
    statuses,
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
): string {
  return field === "createdAt"
    ? booking.createdAt
    : booking.reservationWindowStart;
}

function matchesTextQuery(booking: BookingRecord, query: string): boolean {
  if (!query) return true;
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

export type BookingListResult = {
  items: BookingRecord[];
  total: number;
  totalPages: number;
  page: number;
  statusCounts: Partial<Record<OwnedOrderStatus, number>>;
};

export function applyBookingListQuery(
  bookings: BookingRecord[],
  query: BookingListQuery,
): BookingListResult {
  const filtered = bookings
    .filter((booking) => matchesTextQuery(booking, query.q))
    .filter((booking) =>
      query.statuses.length === 0
        ? true
        : query.statuses.includes(booking.orderStatus),
    )
    .filter((booking) => {
      const value = getBookingDateValue(booking, query.dateField);
      if (!value) return false;
      const timestamp = new Date(value).getTime();
      if (Number.isNaN(timestamp)) return false;
      if (query.dateFrom) {
        const from = new Date(`${query.dateFrom}T00:00:00Z`).getTime();
        if (timestamp < from) return false;
      }
      if (query.dateTo) {
        const to = new Date(`${query.dateTo}T23:59:59Z`).getTime();
        if (timestamp > to) return false;
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
): string {
  const next: BookingListQuery = {
    ...query,
    ...overrides,
  };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.statuses.length > 0) params.set("status", next.statuses.join(","));
  if (next.dateField !== "reservationStart")
    params.set("dateField", next.dateField);
  if (next.dateFrom) params.set("dateFrom", next.dateFrom);
  if (next.dateTo) params.set("dateTo", next.dateTo);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== DEFAULT_PAGE_SIZE)
    params.set("pageSize", String(next.pageSize));
  return params.toString();
}

export function toggleStatus(
  statuses: OwnedOrderStatus[],
  target: OwnedOrderStatus,
): OwnedOrderStatus[] {
  const next = new Set(statuses);
  if (next.has(target)) {
    next.delete(target);
  } else {
    next.add(target);
  }
  return OWNED_ORDER_STATUSES.filter((status) => next.has(status));
}

export function getStatusCounts(
  bookings: BookingRecord[],
): Partial<Record<OwnedOrderStatus, number>> {
  return bookings.reduce(
    (summary, booking) => {
      summary[booking.orderStatus] = (summary[booking.orderStatus] ?? 0) + 1;
      return summary;
    },
    {} as Partial<Record<OwnedOrderStatus, number>>,
  );
}
