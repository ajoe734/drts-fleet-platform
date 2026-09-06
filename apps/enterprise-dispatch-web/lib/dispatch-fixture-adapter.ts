import type {
  BookingRecord,
  ComplianceGateRecord,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
} from "@drts/contracts";

export type EnterpriseDispatchBookingFixture = {
  reservationWindowStart: string;
  reservationWindowEnd: string;
  pickupAddress: string;
  pickupAddressName?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffAddress: string;
  dropoffAddressName?: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  passengerName: string;
  passengerPhone: string;
  bookedByName?: string;
  bookedByEmail?: string;
  onsiteContactName?: string;
  onsiteContactPhone?: string;
  costCenter?: string;
  vehiclePreference?: string;
  notes?: string;
  flightNo?: string;
  terminal?: string;
  luggageCount?: number | null;
  signoffRequired?: boolean;
  direction?: "pickup" | "dropoff";
};

export type EnterpriseDispatchGateSnapshot = {
  totalCount: number;
  blockingCount: number;
  reviewRequiredCount: number;
  clearCount: number;
  primaryGateType: ComplianceGateRecord["gateType"] | null;
  primaryGateState: ComplianceGateRecord["state"] | "clear";
  nextAction: string | null;
  summary: string;
};

export type EnterpriseDispatchEmbedDisposition = {
  allowed: false;
  mode: "deep_link_only";
  reasonCode:
    | "PHASE1_DEEP_LINK_ONLY"
    | "FORBIDDEN_CROSS_APP_LINK"
    | "MISSING_CROSS_APP_LINK";
  fallbackHref: string | null;
  targetApp: CrossAppResourceLink["targetApp"] | null;
};

export function adaptBookingFixtureToCreateCommand(
  fixture: EnterpriseDispatchBookingFixture,
): CreateTenantBookingCommand {
  const bookedByName = fixture.bookedByName?.trim();
  const bookedByEmail = fixture.bookedByEmail?.trim();
  const onsiteContactName = fixture.onsiteContactName?.trim();
  const onsiteContactPhone = fixture.onsiteContactPhone?.trim();
  const notes = fixture.notes?.trim();
  const costCenter = fixture.costCenter?.trim();
  const vehiclePreference = fixture.vehiclePreference?.trim();
  const flightNo = fixture.flightNo?.trim();
  const terminal = fixture.terminal?.trim();

  return {
    businessDispatchSubtype: "enterprise_dispatch",
    pickup: {
      address: fixture.pickupAddress,
      ...(fixture.pickupAddressName
        ? { addressName: fixture.pickupAddressName }
        : {}),
      ...(fixture.pickupLat !== undefined ? { lat: fixture.pickupLat } : {}),
      ...(fixture.pickupLng !== undefined ? { lng: fixture.pickupLng } : {}),
    },
    dropoff: {
      address: fixture.dropoffAddress,
      ...(fixture.dropoffAddressName
        ? { addressName: fixture.dropoffAddressName }
        : {}),
      ...(fixture.dropoffLat !== undefined ? { lat: fixture.dropoffLat } : {}),
      ...(fixture.dropoffLng !== undefined ? { lng: fixture.dropoffLng } : {}),
    },
    reservationWindowStart: fixture.reservationWindowStart,
    reservationWindowEnd: fixture.reservationWindowEnd,
    passenger: {
      name: fixture.passengerName,
      phone: fixture.passengerPhone,
    },
    ...(bookedByName && bookedByEmail
      ? {
          bookedBy: {
            name: bookedByName,
            email: bookedByEmail,
          },
        }
      : {}),
    ...(onsiteContactName && onsiteContactPhone
      ? {
          onsiteContact: {
            name: onsiteContactName,
            phone: onsiteContactPhone,
          },
        }
      : {}),
    ...(costCenter ? { costCenter } : {}),
    ...(vehiclePreference ? { vehiclePreference } : {}),
    ...(fixture.signoffRequired !== undefined
      ? { signoffRequired: fixture.signoffRequired }
      : {}),
    ...(fixture.direction ? { direction: fixture.direction } : {}),
    ...(flightNo ? { flightNo } : {}),
    ...(terminal ? { terminal } : {}),
    ...(fixture.luggageCount != null
      ? { luggageCount: fixture.luggageCount }
      : {}),
    ...(notes ? { notes } : {}),
  };
}

function pickPrimaryGate(
  gates: ComplianceGateRecord[],
): ComplianceGateRecord | null {
  return (
    gates.find((gate) => gate.blocking) ??
    gates.find((gate) => gate.state === "review_required") ??
    gates[0] ??
    null
  );
}

export function summarizeBookingGates(
  bookingOrGates: BookingRecord | ComplianceGateRecord[] | undefined,
): EnterpriseDispatchGateSnapshot {
  const gates = Array.isArray(bookingOrGates)
    ? bookingOrGates
    : (bookingOrGates?.complianceGates ?? []);
  const blockingCount = gates.filter((gate) => gate.blocking).length;
  const reviewRequiredCount = gates.filter(
    (gate) => gate.state === "review_required",
  ).length;
  const clearCount = gates.filter((gate) => gate.state === "clear").length;
  const primaryGate = pickPrimaryGate(gates);

  if (gates.length === 0) {
    return {
      totalCount: 0,
      blockingCount: 0,
      reviewRequiredCount: 0,
      clearCount: 0,
      primaryGateType: null,
      primaryGateState: "clear",
      nextAction: null,
      summary: "No compliance gates published on the tenant booking record.",
    };
  }

  return {
    totalCount: gates.length,
    blockingCount,
    reviewRequiredCount,
    clearCount,
    primaryGateType: primaryGate?.gateType ?? null,
    primaryGateState: primaryGate?.state ?? "clear",
    nextAction: primaryGate?.nextAction ?? null,
    summary:
      blockingCount > 0
        ? `${blockingCount} blocking gate(s) require dispatch follow-up.`
        : reviewRequiredCount > 0
          ? `${reviewRequiredCount} gate(s) are pending manual review.`
          : `${clearCount} gate(s) published and currently clear.`,
  };
}

// ── Authoritative booking → enterprise home/trip display adapters ──────────
// Converts a live `BookingRecord` (from `EnterpriseDispatchTenantClient`) into
// the display concerns the home/trip surfaces need, without depending on the
// static enterprise-fixtures.ts demo data (SR-ENTERPRISE-DATA-001 / R08).

export type EnterpriseTripDisplayState =
  | "assigned"
  | "approval"
  | "reserved"
  | "enroute"
  | "completed"
  | "cancelled"
  | "nosupply";

const NO_SUPPLY_ORDER_STATUSES = new Set([
  "no_supply",
  "dispatch_failed",
  "dispatch_timeout",
  "redispatch_required",
]);

const ENROUTE_ORDER_STATUSES = new Set([
  "on_trip",
  "enroute_pickup",
  "arrived_pickup",
  "proof_pending",
]);

const ASSIGNED_ORDER_STATUSES = new Set([
  "assigned",
  "driver_accepted",
  "preassigned",
]);

// Derives the 7-state enterprise UI enum from a real BookingRecord's
// `status`/`orderStatus`/`approvalState` fields. This is the authoritative
// replacement for reading a fixed `state` off a fixture row.
export function deriveBookingDisplayState(
  booking: Pick<BookingRecord, "status" | "orderStatus" | "approvalState">,
): EnterpriseTripDisplayState {
  if (booking.status === "cancelled") {
    return "cancelled";
  }
  if (NO_SUPPLY_ORDER_STATUSES.has(booking.orderStatus)) {
    return "nosupply";
  }
  if (booking.approvalState === "pending") {
    return "approval";
  }
  if (booking.orderStatus === "completed") {
    return "completed";
  }
  if (ENROUTE_ORDER_STATUSES.has(booking.orderStatus)) {
    return "enroute";
  }
  if (ASSIGNED_ORDER_STATUSES.has(booking.orderStatus)) {
    return "assigned";
  }
  return "reserved";
}

// True when the booking was made by the passenger for themselves rather than
// a delegate/administrator booking on someone else's behalf.
export function isSelfBooking(
  booking: Pick<BookingRecord, "passenger" | "bookedBy">,
): boolean {
  if (!booking.bookedBy) {
    return true;
  }
  return booking.bookedBy.name.trim() === booking.passenger.name.trim();
}

// Prefers the human-readable place name over the raw geocoded address string.
export function resolveEnterpriseBookingAddress(payload: {
  address: string;
  addressName?: string | null;
}): string {
  return payload.addressName?.trim() || payload.address;
}

// Formats an ISO timestamp fixed to Asia/Taipei so home/trip surfaces cannot
// drift a booking's reservation window across a day/month boundary depending
// on the server's local timezone (same class of bug as R16 in SR-BANK-001).
export function formatEnterpriseReservationWindow(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    // `hour12: false` alone can still resolve to ICU's h24 cycle (rendering
    // midnight as "24:xx" instead of "00:xx" depending on Node's ICU data).
    // Force h23 explicitly so midnight always reads "00:xx".
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

export type EnterpriseDispatchGatewayRoute =
  | "/degraded"
  | "/no-supply"
  | "/quota-blocked";

export interface EnterpriseBookingFetchOutcome {
  // True only for a genuine "this booking does not exist" response — must
  // never be reported as a retryable/temporary fault (R08).
  notFound: boolean;
  gatewayRoute: EnterpriseDispatchGatewayRoute | null;
}

interface DispatchApiErrorLike {
  statusCode: number;
  code: string;
  retryable: boolean;
}

// Structural check (not `instanceof ApiClientError`) so this stays testable
// with plain mock objects and does not pull `@drts/api-client` into every
// consumer of this module.
function isDispatchApiErrorLike(
  error: unknown,
): error is DispatchApiErrorLike {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.statusCode === "number" &&
    typeof candidate.code === "string" &&
    typeof candidate.retryable === "boolean"
  );
}

// Classifies a booking-fetch failure into "not found" vs. a specific gateway
// state page, so a real 404 is never presented as "service temporarily
// unstable" (R08 finding: 404 BOOKING_NOT_FOUND rendered as a retryable
// degraded fault).
export function resolveEnterpriseBookingFetchOutcome(
  error: unknown,
): EnterpriseBookingFetchOutcome {
  if (!isDispatchApiErrorLike(error)) {
    return { notFound: false, gatewayRoute: "/degraded" };
  }
  if (error.statusCode === 404) {
    return { notFound: true, gatewayRoute: null };
  }
  const code = error.code.toLowerCase();
  if (code.includes("quota") || code.includes("policy")) {
    return { notFound: false, gatewayRoute: "/quota-blocked" };
  }
  if (code.includes("supply") || code.includes("vehicle_unavailable")) {
    return { notFound: false, gatewayRoute: "/no-supply" };
  }
  if (error.statusCode >= 500 || error.retryable) {
    return { notFound: false, gatewayRoute: "/degraded" };
  }
  return { notFound: false, gatewayRoute: null };
}

export function resolveDispatchEmbedDisposition(
  link?: CrossAppResourceLink | null,
): EnterpriseDispatchEmbedDisposition {
  if (!link) {
    return {
      allowed: false,
      mode: "deep_link_only",
      reasonCode: "MISSING_CROSS_APP_LINK",
      fallbackHref: null,
      targetApp: null,
    };
  }

  if (link.openMode !== "new_tab" && link.openMode !== "same_tab") {
    return {
      allowed: false,
      mode: "deep_link_only",
      reasonCode: "FORBIDDEN_CROSS_APP_LINK",
      fallbackHref: null,
      targetApp: link.targetApp,
    };
  }

  return {
    allowed: false,
    mode: "deep_link_only",
    reasonCode: "PHASE1_DEEP_LINK_ONLY",
    fallbackHref: link.route,
    targetApp: link.targetApp,
  };
}
