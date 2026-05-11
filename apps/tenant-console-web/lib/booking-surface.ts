import {
  OWNED_ORDER_STATUSES,
  type BookingRecord,
  type OwnedOrderStatus,
  type TenantInvoiceRecord,
} from "@drts/contracts";
import type { ManagementTone, StepState } from "@drts/ui-web";
import type { SourceVisibility } from "./source-domain";

const ACTIVE_ORDER_STATUSES = new Set<OwnedOrderStatus>(
  OWNED_ORDER_STATUSES.filter(
    (status) => status !== "completed" && status !== "cancelled",
  ),
);

const ATTENTION_ORDER_STATUSES = new Set<OwnedOrderStatus>([
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "proof_pending",
  "redispatch_required",
]);

const BLOCKED_ORDER_STATUSES = new Set<OwnedOrderStatus>([
  "cancelled",
  "dispatch_failed",
  "dispatch_timeout",
  "exception_hold",
  "no_supply",
  "redispatch_required",
]);

type LifecycleStage =
  | "created"
  | "queued"
  | "broadcast"
  | "assigned"
  | "on_trip"
  | "completed";

type LifecycleDefinition = {
  id: LifecycleStage;
  title: string;
  description: string;
};

export type BookingLifecycleStep = LifecycleDefinition & {
  state: StepState;
  stateLabel: string;
  tone?: ManagementTone;
};

export type BookingActivityRecord = {
  id: string;
  title: string;
  detail: string;
  timestamp: string | null;
  tone?: ManagementTone;
  meta?: string[];
};

const LIFECYCLE_STEPS: readonly LifecycleDefinition[] = [
  {
    id: "created",
    title: "Created",
    description: "Tenant intake accepted into the booking ledger.",
  },
  {
    id: "queued",
    title: "Queued",
    description: "Booking is waiting for policy and dispatch entry checks.",
  },
  {
    id: "broadcast",
    title: "Broadcast",
    description: "Dispatch is matching or recovering the trip supply lane.",
  },
  {
    id: "assigned",
    title: "Assigned",
    description: "A fulfillment path has been attached to the booking.",
  },
  {
    id: "on_trip",
    title: "On trip",
    description: "The ride has moved into execution or proof collection.",
  },
  {
    id: "completed",
    title: "Completed",
    description: "Execution is closed and finance artifacts can follow.",
  },
] as const;

function sameUtcDay(left: Date, right: Date) {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function stageForStatus(status: OwnedOrderStatus): LifecycleStage {
  switch (status) {
    case "created":
      return "created";
    case "recording_pending":
      return "queued";
    case "ready_for_dispatch":
    case "delayed_queue":
    case "dispatch_failed":
    case "dispatch_timeout":
    case "exception_hold":
    case "no_supply":
    case "redispatch_required":
      return "broadcast";
    case "preassigned":
    case "assigned":
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
      return "assigned";
    case "on_trip":
    case "proof_pending":
      return "on_trip";
    case "completed":
      return "completed";
    case "cancelled":
    default:
      return "broadcast";
  }
}

export function formatOrderStatusLabel(status: OwnedOrderStatus) {
  return status.replace(/_/g, " ");
}

export function isActiveOrderStatus(status: OwnedOrderStatus) {
  return ACTIVE_ORDER_STATUSES.has(status);
}

export function needsAttention(status: OwnedOrderStatus) {
  return ATTENTION_ORDER_STATUSES.has(status);
}

export function getOrderStatusTone(status: OwnedOrderStatus): ManagementTone {
  switch (status) {
    case "completed":
    case "assigned":
    case "driver_accepted":
    case "enroute_pickup":
    case "arrived_pickup":
    case "on_trip":
      return "success";
    case "created":
    case "recording_pending":
    case "preassigned":
      return "tenant";
    case "ready_for_dispatch":
      return "info";
    case "proof_pending":
    case "delayed_queue":
      return "warning";
    case "cancelled":
    case "dispatch_failed":
    case "dispatch_timeout":
    case "exception_hold":
    case "no_supply":
    case "redispatch_required":
      return "danger";
    default:
      return "neutral";
  }
}

export function getSourceTone(source: SourceVisibility): ManagementTone {
  return source.tone === "external" ? "warning" : "tenant";
}

export function countCompletedToday(
  bookings: BookingRecord[],
  now: Date = new Date(),
) {
  return bookings.filter((booking) => {
    if (booking.orderStatus !== "completed") {
      return false;
    }

    const updatedAt = new Date(booking.updatedAt);
    return !Number.isNaN(updatedAt.getTime()) && sameUtcDay(updatedAt, now);
  }).length;
}

export function countBookingsThisMonth(
  bookings: BookingRecord[],
  now: Date = new Date(),
) {
  return bookings.filter((booking) => {
    const createdAt = new Date(booking.createdAt);
    return (
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getUTCFullYear() === now.getUTCFullYear() &&
      createdAt.getUTCMonth() === now.getUTCMonth()
    );
  }).length;
}

export function latestInvoice(invoices: TenantInvoiceRecord[]) {
  return (
    [...invoices].sort((left, right) => {
      return (
        new Date(right.periodEnd).getTime() - new Date(left.periodEnd).getTime()
      );
    })[0] ?? null
  );
}

export function buildBookingLifecycleSteps(
  status: OwnedOrderStatus,
): BookingLifecycleStep[] {
  const stage = stageForStatus(status);
  const activeIndex = LIFECYCLE_STEPS.findIndex((step) => step.id === stage);
  const isBlocked = BLOCKED_ORDER_STATUSES.has(status);

  return LIFECYCLE_STEPS.map((step, index) => {
    let state: StepState = "upcoming";

    if (status === "completed") {
      state =
        index < activeIndex
          ? "complete"
          : index === activeIndex
            ? "current"
            : "upcoming";
    } else if (index < activeIndex) {
      state = "complete";
    } else if (index === activeIndex) {
      state = isBlocked ? "blocked" : "current";
    }

    const tone =
      index === activeIndex
        ? getOrderStatusTone(status)
        : state === "complete"
          ? "success"
          : null;

    return {
      ...step,
      state,
      stateLabel:
        index === activeIndex ? formatOrderStatusLabel(status) : step.title,
      ...(tone ? { tone } : {}),
    };
  });
}

export function buildBookingActivityRecords(
  booking: BookingRecord,
  source: SourceVisibility,
  relatedInvoices: TenantInvoiceRecord[],
): BookingActivityRecord[] {
  const records: BookingActivityRecord[] = [
    {
      id: "created",
      title: "Booking created",
      detail: booking.bookedBy
        ? `Created by ${booking.bookedBy.name} for ${booking.passenger.name}.`
        : `Booking opened for ${booking.passenger.name}.`,
      timestamp: booking.createdAt,
      tone: "tenant",
      meta: [booking.bookingId, booking.orderId],
    },
    {
      id: "reservation-window",
      title: "Reservation window",
      detail: `${booking.pickup.address} -> ${booking.dropoff.address}`,
      timestamp: booking.reservationWindowStart,
      tone: "info",
      meta: [
        `window closes ${booking.reservationWindowEnd}`,
        booking.businessDispatchSubtype,
      ],
    },
    {
      id: "modification-cutoff",
      title: "Tenant modification cutoff",
      detail: booking.modifiableUntil
        ? "Tenant update commands remain valid until this cutoff."
        : "No explicit update cutoff was published for this booking.",
      timestamp: booking.modifiableUntil,
      tone: "neutral",
    },
    {
      id: "cancellation-cutoff",
      title: "Tenant cancellation cutoff",
      detail: booking.cancelableUntil
        ? "Tenant cancellation remains available until this cutoff."
        : "No explicit cancellation cutoff was published for this booking.",
      timestamp: booking.cancelableUntil,
      tone: "neutral",
    },
  ];

  if (booking.complianceGates?.length) {
    const blockingCount = booking.complianceGates.filter(
      (gate) => gate.blocking,
    ).length;
    records.push({
      id: "compliance",
      title: "Compliance posture",
      detail:
        blockingCount > 0
          ? `${blockingCount} compliance gate(s) are currently blocking or require operator attention.`
          : `${booking.complianceGates.length} compliance gate(s) are on file with no current blockers.`,
      timestamp: booking.updatedAt,
      tone: blockingCount > 0 ? "warning" : "success",
      meta: [source.badge],
    });
  }

  records.push({
    id: "status",
    title: "Current workflow status",
    detail: `Order status is ${formatOrderStatusLabel(booking.orderStatus)} and booking status is ${booking.status}.`,
    timestamp: booking.updatedAt,
    tone: getOrderStatusTone(booking.orderStatus),
    meta: [source.summary],
  });

  if (relatedInvoices.length > 0) {
    records.push({
      id: "invoice",
      title: "Invoice linkage visible",
      detail: `${relatedInvoices.length} invoice record(s) currently reference this order.`,
      timestamp:
        relatedInvoices[0]?.updatedAt ?? relatedInvoices[0]?.createdAt ?? null,
      tone: "success",
      meta: relatedInvoices.map((invoice) => invoice.invoiceId),
    });
  }

  return records;
}
