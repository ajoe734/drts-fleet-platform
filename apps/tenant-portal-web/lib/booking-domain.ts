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
import { formatPortalCodeLabel } from "./localized-labels";

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
): BookingTimelinePoint[] {
  return [
    {
      key: "created",
      label: "訂單已建立",
      at: booking.createdAt,
      detail: "租戶建立請求已寫入訂單台帳。",
    },
    {
      key: "window-start",
      label: "預約時段開始",
      at: booking.reservationWindowStart,
      detail: "主要服務承諾時段開始。",
    },
    {
      key: "window-end",
      label: "預約時段結束",
      at: booking.reservationWindowEnd,
      detail: "要求的上車或下車承諾時段結束。",
    },
    {
      key: "modify-cutoff",
      label: "租戶可修改截止時間",
      at: booking.modifiableUntil,
      detail: booking.modifiableUntil
        ? "超過這個時間後，租戶就不能再修改。"
        : "目前沒有公布明確的租戶修改截止時間。",
    },
    {
      key: "cancel-cutoff",
      label: "租戶可取消截止時間",
      at: booking.cancelableUntil,
      detail: booking.cancelableUntil
        ? "超過這個時間後，租戶就不能再取消。"
        : "目前沒有公布明確的租戶取消截止時間。",
    },
    {
      key: "current",
      label: "目前流程狀態",
      at: booking.updatedAt,
      detail: `目前訂單狀態為 ${formatPortalCodeLabel(booking.orderStatus, booking.orderStatus)}。`,
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
): BookingActionCapabilities {
  const isTerminal = TERMINAL_ORDER_STATUSES.has(booking.orderStatus);
  const isOnTripLane = ON_TRIP_ORDER_STATUSES.has(booking.orderStatus);
  const updateWindowOpen = isCutoffOpen(booking.modifiableUntil);
  const cancelWindowOpen = isCutoffOpen(booking.cancelableUntil);

  return {
    canUpdate: !isTerminal && !isOnTripLane && updateWindowOpen,
    canCancel: !isTerminal && cancelWindowOpen,
    updateReason: isTerminal
      ? "已完成或已取消的訂單為唯讀。"
      : isOnTripLane
        ? "行程中的訂單不能再由租戶端修改。"
        : updateWindowOpen
          ? null
          : "租戶可修改時段已關閉。",
    cancelReason: isTerminal
      ? "已完成或已取消的訂單不能再次取消。"
      : cancelWindowOpen
        ? null
        : "租戶可取消時段已關閉。",
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
): string {
  if (!override) return "未設定";
  return `${formatPortalCodeLabel(override.actorType, override.actorType)} · ${override.reason}`;
}

export function summarizeComplianceGates(
  gates: ComplianceGateRecord[] | undefined,
): string {
  if (!gates || gates.length === 0) {
    return "目前沒有對租戶公開的合規關卡。";
  }
  const blocked = gates.filter((gate) => gate.blocking).length;
  if (blocked > 0) {
    return `共 ${gates.length} 個合規關卡，其中 ${blocked} 個目前阻擋中。`;
  }
  return `共 ${gates.length} 個合規關卡，目前都沒有阻擋。`;
}

export function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) return "未公布";
  const minor = Number(amount.amountMinor);
  if (!Number.isFinite(minor)) return "未公布";
  const major = (minor / 100).toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${major} ${amount.currency}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "未公布";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "未公布";
  return date.toLocaleString("zh-TW");
}

export function formatBookingStatusLabel(status: OwnedOrderStatus): string {
  return formatPortalCodeLabel(status, status);
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
