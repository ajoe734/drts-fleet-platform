import type {
  BookingRecord,
  InvoiceLineRecord,
  MoneyAmount,
  OwnedOrderStatus,
  TenantInvoiceRecord,
} from "@drts/contracts";

const TERMINAL_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "completed",
  "cancelled",
]);

const ON_TRIP_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "enroute_pickup",
  "arrived_pickup",
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
      label: "Booking created",
      at: booking.createdAt,
      detail: "Tenant intake accepted into the booking ledger.",
    },
    {
      key: "window-start",
      label: "Reservation window opens",
      at: booking.reservationWindowStart,
      detail: "Primary service commitment window begins.",
    },
    {
      key: "window-end",
      label: "Reservation window closes",
      at: booking.reservationWindowEnd,
      detail: "Requested pickup or dropoff commitment window ends.",
    },
    {
      key: "modify-cutoff",
      label: "Tenant modification cutoff",
      at: booking.modifiableUntil,
      detail: booking.modifiableUntil
        ? "Further tenant edits follow this cutoff."
        : "No explicit tenant edit cutoff was published.",
    },
    {
      key: "cancel-cutoff",
      label: "Tenant cancellation cutoff",
      at: booking.cancelableUntil,
      detail: booking.cancelableUntil
        ? "Further tenant cancellation follows this cutoff."
        : "No explicit tenant cancellation cutoff was published.",
    },
    {
      key: "current",
      label: "Current workflow state",
      at: booking.updatedAt,
      detail: `Order status is ${booking.orderStatus}.`,
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
      ? "Completed and cancelled bookings are read-only."
      : isOnTripLane
        ? "On-trip bookings can no longer be edited from tenant control."
        : updateWindowOpen
          ? null
          : "Tenant edit window has closed.",
    cancelReason: isTerminal
      ? "Completed and cancelled bookings cannot be cancelled again."
      : cancelWindowOpen
        ? null
        : "Tenant cancellation window has closed.",
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

export function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) return "Not published";
  const minor = Number(amount.amountMinor);
  if (!Number.isFinite(minor)) return "Not published";
  const major = (minor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${major} ${amount.currency}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Not published";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not published";
  return date.toLocaleString();
}

export function formatBookingStatusLabel(status: OwnedOrderStatus): string {
  return status.replace(/_/g, " ");
}
