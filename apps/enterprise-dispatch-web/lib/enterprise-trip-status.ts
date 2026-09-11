import type { OwnedOrderStatus, TenantBookingSummary } from "@drts/contracts";

// SR-ENTERPRISE-DATA-001: pure, testable enterprise home/trip status logic
// for authoritative `TenantDashboardSummary.upcomingBookings` data. Only
// imports types from @drts/contracts (aliased directly to source in the
// root vitest.config.ts) and classifies fetch errors by duck-typing the
// ApiClientError shape (statusCode/code) instead of `instanceof
// ApiClientError`, so root Vitest
// (tests/unit/system-remediation/sr-enterprise-data-001/) can import this
// module without resolving @drts/api-client or this app's own "@/" alias —
// mirroring the ./enterprise-booking-search precedent from
// SR-ENTERPRISE-SEARCH-001.

export type EnterpriseOrderStatusTone =
  | "primary"
  | "success"
  | "warn"
  | "info"
  | "neutral"
  | "danger";

const ORDER_STATUS_TONE: Record<OwnedOrderStatus, EnterpriseOrderStatusTone> =
  {
    created: "neutral",
    recording_pending: "neutral",
    ready_for_dispatch: "warn",
    preassigned: "primary",
    assigned: "primary",
    driver_accepted: "primary",
    enroute_pickup: "info",
    arrived_pickup: "info",
    on_trip: "info",
    proof_pending: "info",
    completed: "success",
    cancelled: "neutral",
    redispatch_required: "warn",
    dispatch_failed: "danger",
    dispatch_timeout: "danger",
    no_supply: "danger",
    delayed_queue: "warn",
    exception_hold: "danger",
  };

export function getEnterpriseOrderStatusTone(
  status: OwnedOrderStatus,
): EnterpriseOrderStatusTone {
  return ORDER_STATUS_TONE[status] ?? "neutral";
}

// Statuses where the order is actively moving through dispatch/fulfilment —
// what the home "active trip" card and the trip page track. Terminal states
// (completed/cancelled) and pre-dispatch/exception states are excluded so
// they fall back to the honest "no active trip" empty state instead of
// showing a stale or exceptional order as if it were a live trip.
const ACTIVE_TRIP_STATUSES = new Set<OwnedOrderStatus>([
  "preassigned",
  "assigned",
  "driver_accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

export function isEnterpriseActiveTripStatus(
  status: OwnedOrderStatus,
): boolean {
  return ACTIVE_TRIP_STATUSES.has(status);
}

export function selectActiveEnterpriseTrip(
  bookings: readonly TenantBookingSummary[],
): TenantBookingSummary | null {
  return (
    bookings.find((booking) => isEnterpriseActiveTripStatus(booking.status)) ??
    null
  );
}

// Index into the 5-stage progress rail (assigned/enroute/arrived/in
// progress/completed). `null` means the status doesn't map onto that rail
// (e.g. an exception state); callers should show the status pill as-is
// instead of forcing a stage.
const TRIP_PROGRESS_STAGE: Partial<Record<OwnedOrderStatus, number>> = {
  preassigned: 0,
  assigned: 0,
  driver_accepted: 0,
  enroute_pickup: 1,
  arrived_pickup: 2,
  on_trip: 3,
  proof_pending: 3,
  completed: 4,
};

export function getEnterpriseTripProgressStage(
  status: OwnedOrderStatus,
): number | null {
  return TRIP_PROGRESS_STAGE[status] ?? null;
}

export type EnterpriseBookingFetchErrorState =
  | "not-found"
  | "quota-blocked"
  | "no-supply"
  | "degraded";

/**
 * Classifies a booking-detail fetch failure. Duck-typed on ApiClientError's
 * shape (statusCode/code) rather than `instanceof ApiClientError` — see the
 * file header for why. A 404 must resolve to "not-found", never "degraded":
 * a missing booking is not a retryable temporary fault.
 */
export function classifyEnterpriseBookingFetchError(
  error: unknown,
): EnterpriseBookingFetchErrorState {
  if (!error || typeof error !== "object") return "degraded";
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (statusCode === 404) return "not-found";
  const code = String((error as { code?: unknown }).code ?? "").toLowerCase();
  if (code.includes("quota") || code.includes("policy")) return "quota-blocked";
  if (code.includes("supply") || code.includes("vehicle_unavailable"))
    return "no-supply";
  return "degraded";
}

export type EnterpriseDashboardFetchErrorState = "auth-required" | "degraded";

/**
 * Classifies a tenant-dashboard fetch failure (home/trip). A 401/403 means
 * the previously-verified session was rejected by the API itself (e.g.
 * revoked between the session check and this call), so it must resolve to
 * "auth-required", not a generic degraded/retryable state.
 */
export function classifyEnterpriseDashboardFetchError(
  error: unknown,
): EnterpriseDashboardFetchErrorState {
  if (!error || typeof error !== "object") return "degraded";
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (statusCode === 401 || statusCode === 403) return "auth-required";
  return "degraded";
}
