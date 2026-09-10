// Pure formatting / classification helpers for the Host (individual owner)
// restricted read-only surface. No "server-only" import here: these are used
// by both server-loaders (host-data.server.ts) and page/component render
// code, and are unit-tested directly (no network/React needed).
//
// Ground truth: packages/contracts/src/system-remediation.ts (HostVehicle*
// interfaces, SYSTEM_REMEDIATION_ERROR_CODES Family 3) and
// docs/05-ui/drts-design-canvas/fleet-host.jsx / host-screen-contract.md.

import type { HostVehicleEarningsSummary } from "@drts/contracts";

export function formatHostMoney(amountMajor: number): string {
  return `NT$ ${amountMajor.toLocaleString("en-US")}`;
}

// Renders null (never a fabricated 0 or percentage) so callers show the
// "— (pending_policy)" fallback themselves — see HostEarningsPanel.
export function formatHostMoneyOrNull(
  amountMajor: number | null,
): string | null {
  return amountMajor === null ? null : formatHostMoney(amountMajor);
}

// host-screen-contract.md §3: three distinct, non-interchangeable earnings
// states. "no_record" is a caller-supplied variant (set when the API call
// itself resolves as not-found for the period — see loadHostVehicleEarnings)
// since HostVehicleEarningsSummary has no null/absent representation of its
// own. "zero" is real, calculated zero activity, independent of
// settlementStatus (both fixtures in the canvas carry
// settlementStatus: "pending_policy" — the zero/non-zero distinction is
// grossRevenue/tripsCount, not settlementStatus).
export type HostEarningsVariant = "no_record" | "zero" | "reported";

export function classifyHostEarningsVariant(
  earnings: Pick<HostVehicleEarningsSummary, "grossRevenue" | "tripsCount">,
): HostEarningsVariant {
  if (earnings.grossRevenue === 0 && earnings.tripsCount === 0) {
    return "zero";
  }
  return "reported";
}

export const HOST_VEHICLE_STATUS_TONE: Record<
  string,
  "success" | "warn" | "neutral"
> = {
  active: "success",
  maintenance: "warn",
  inactive: "neutral",
};

export const HOST_MAINT_STATUS_TONE: Record<
  string,
  "info" | "warn" | "success" | "neutral" | "danger"
> = {
  scheduled: "info",
  in_progress: "warn",
  completed: "success",
  cancelled: "neutral",
  overdue: "danger",
};

export const HOST_CASE_STATUS_TONE: Record<
  string,
  "danger" | "warn" | "success" | "neutral"
> = {
  open: "danger",
  investigating: "warn",
  resolved: "success",
  closed: "neutral",
};

export const HOST_CASE_CATEGORY_LABEL: Record<string, string> = {
  vehicle_condition: "車況 · Vehicle condition",
  accident: "事故 · Accident",
  equipment: "設備 · Equipment",
  service_feedback: "服務反饋 · Service feedback",
};

export const HOST_TRIP_STATUS_TONE: Record<
  string,
  "success" | "danger" | "info"
> = {
  completed: "success",
  cancelled: "danger",
};

export function hostTripStatusTone(
  status: string,
): "success" | "danger" | "info" {
  return HOST_TRIP_STATUS_TONE[status] ?? "info";
}

// Family 3 error codes (SYSTEM_REMEDIATION_ERROR_CODES) mapped to a page-
// renderable access state. `fetch_failed` covers both a classified 5xx and
// the network-level failure expected while SR-HOST-BE-001's backend module
// is not yet merged to `dev` (no route to fail against with a coded error at
// all) — never rendered as fabricated vehicle data either way.
export type HostAccessState =
  | "unauthorized"
  | "forbidden"
  | "vehicle_not_found"
  | "fetch_failed";

const HOST_ERROR_CODE_TO_STATE: Record<string, HostAccessState> = {
  HOST_UNAUTHORIZED: "unauthorized",
  HOST_FORBIDDEN: "forbidden",
  HOST_VEHICLE_NOT_FOUND: "vehicle_not_found",
};

const HOST_STATUS_CODE_TO_STATE: Record<number, HostAccessState> = {
  401: "unauthorized",
  403: "forbidden",
  404: "vehicle_not_found",
};

export function classifyHostAccessError(err: unknown): HostAccessState {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const code = (err as { code: string }).code;
    const state = HOST_ERROR_CODE_TO_STATE[code];
    if (state) {
      return state;
    }
  }
  if (
    err &&
    typeof err === "object" &&
    "statusCode" in err &&
    typeof (err as { statusCode: unknown }).statusCode === "number"
  ) {
    const statusCode = (err as { statusCode: number }).statusCode;
    const state = HOST_STATUS_CODE_TO_STATE[statusCode];
    if (state) {
      return state;
    }
  }
  return "fetch_failed";
}

export function sliceIsoDate(iso: string): string {
  return iso.slice(0, 10);
}

export function getCurrentHostPeriodMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
