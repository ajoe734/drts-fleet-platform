import type {
  HostVehicleSummary,
  HostVehicleContractPeriod,
  HostVehicleEarningsSummary,
  HostVehicleMaintenanceItem,
  HostVehicleMaintenanceStatus,
  HostVehicleTripItem,
  HostVehicleCaseItem,
  HostVehicleCaseCategory,
  HostVehicleCaseStatus,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";

export {
  HOST_VEHICLE_MAINTENANCE_STATUSES,
  HOST_VEHICLE_CASE_CATEGORIES,
  HOST_VEHICLE_CASE_STATUSES,
} from "@drts/contracts";

export type {
  HostVehicleSummary,
  HostVehicleContractPeriod,
  HostVehicleEarningsSummary,
  HostVehicleMaintenanceItem,
  HostVehicleMaintenanceStatus,
  HostVehicleTripItem,
  HostVehicleCaseItem,
  HostVehicleCaseCategory,
  HostVehicleCaseStatus,
};

export const HOST_ERROR_CODES = {
  UNAUTHORIZED: "HOST_UNAUTHORIZED",
  FORBIDDEN: "HOST_FORBIDDEN",
  VEHICLE_NOT_FOUND: "HOST_VEHICLE_NOT_FOUND",
  MUTATION_NOT_SUPPORTED: "HOST_MUTATION_NOT_SUPPORTED",
  AUTHORITY_UNAVAILABLE: "HOST_AUTHORITY_UNAVAILABLE",
} as const;

export type HostErrorCode =
  (typeof HOST_ERROR_CODES)[keyof typeof HOST_ERROR_CODES];

/**
 * C012-F3-CONFIGURED-AUTHORITY-FAILURE-AS-EMPTY fix: thrown by
 * `HostViewRepository` when the configured database is enabled but a query
 * against it rejects. Previously that rejection was caught and silently
 * replaced with the (often empty) in-memory offline-harness store, so a real
 * read failure was indistinguishable from a legitimately empty/zero result.
 * This is a distinct, retryable 503 — never a fabricated 200 — and is only
 * ever thrown when `isEnabled()` is true; the in-memory store remains the
 * intentional, unchanged backing when the database is disabled entirely.
 */
export class HostAuthorityUnavailableError extends ApiRequestError {
  constructor(operation: string, cause: unknown) {
    super(
      503,
      HOST_ERROR_CODES.AUTHORITY_UNAVAILABLE,
      `Host data authority is temporarily unavailable (${operation}).`,
      {
        operation,
        causeMessage: cause instanceof Error ? cause.message : String(cause),
      },
      true,
    );
  }
}

/**
 * Masks VIN to preserve leading digits while masking trailing 6 characters.
 * Example: 1HGCR2F83HA123456 -> 1HGCR2F83HA******
 */
export function maskVin(vin?: string | null): string {
  if (!vin) return "******";
  const trimmed = vin.trim();
  if (trimmed.length <= 6) return "******";
  return `${trimmed.slice(0, -6)}******`;
}

/**
 * Extracts high-level administrative district / city without revealing exact street address or passenger PII.
 */
export function extractDistrictOrCity(address?: string | null): string {
  if (!address) return "市區";
  let trimmed = address.trim();
  // Strip optional leading county/city (e.g. 台北市, 新北市, 台中市, 彰化縣)
  const cityPrefixMatch = trimmed.match(/^[^\d\s,]{2,3}[縣市](.+)$/);
  if (cityPrefixMatch && cityPrefixMatch[1]) {
    trimmed = cityPrefixMatch[1];
  }
  // 1. Prioritize district / township (區 / 鄉 / 鎮)
  const districtMatch = trimmed.match(/([\u4e00-\u9fa5]{2,4}(?:區|鄉|鎮))/);
  if (districtMatch && districtMatch[1]) {
    return districtMatch[1];
  }
  // 2. Fall back to city (市)
  const cityMatch = trimmed.match(/([\u4e00-\u9fa5]{2,4}市)/);
  if (cityMatch && cityMatch[1]) {
    return cityMatch[1];
  }
  // 3. If concise string without digits, return directly
  if (trimmed.length <= 6 && !/\d/.test(trimmed)) {
    return trimmed;
  }
  return "市區";
}

/**
 * Redacts trip endpoints into a generic de-identified area summary.
 * Example: "信義區 → 內湖區" or "大安區 → 南港區"
 */
export function maskAreaSummary(
  pickupAddress?: string | null,
  dropoffAddress?: string | null,
): string {
  const from = extractDistrictOrCity(pickupAddress);
  const to = extractDistrictOrCity(dropoffAddress);
  return `${from} → ${to}`;
}

/**
 * Maps raw complaint category into approved HostVehicleCaseCategory.
 */
export function mapComplaintCategory(
  category?: string | null,
): HostVehicleCaseCategory {
  switch (category) {
    case "vehicle_condition":
      return "vehicle_condition";
    case "safety_concern":
      return "accident";
    case "equipment":
      return "equipment";
    case "driver_service":
    case "route_issue":
    case "fare_dispute":
    case "lost_and_found":
    case "service_feedback":
    default:
      return "service_feedback";
  }
}

/**
 * Maps raw complaint status into approved HostVehicleCaseStatus.
 */
export function mapComplaintStatus(
  status?: string | null,
): HostVehicleCaseStatus {
  switch (status) {
    case "under_investigation":
      return "investigating";
    case "resolved":
      return "resolved";
    case "closed":
      return "closed";
    case "new":
    case "assigned":
    case "reopened":
    case "open":
    default:
      return "open";
  }
}

/**
 * Maps raw maintenance status to HostVehicleMaintenanceStatus.
 */
export function mapMaintenanceStatus(
  status?: string | null,
): HostVehicleMaintenanceStatus {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "overdue":
      return "overdue";
    case "scheduled":
    default:
      return "scheduled";
  }
}

// C012-F4-PRIVATE-CLOSING-NOTE-AS-REDACTED-CONCLUSION fix: `closingNote` is a
// freeform field ComplaintService accepts and stores unchanged
// (complaint.service.ts's `resolveComplaintCase`/`closeComplaintCase` only
// validate it is non-blank), so it can lawfully contain the reporter's name,
// phone number, or other private context. `resolutionCode` is the canonical,
// closed enum (`COMPLAINT_RESOLUTION_CODES`, packages/contracts) the same
// service independently validates against `COMPLAINT_CATEGORY_VALID_RESOLUTIONS`
// — it carries a meaningful, de-identified conclusion by construction. The
// Host projection surfaces only that canonical code, never the freeform note;
// there is no text-scrubbing heuristic here to bypass because the private
// field is never read in the first place.
const RESOLUTION_CODE_LABELS: Record<string, string> = {
  resolved_with_apology: "已處理 · 致歉 Resolved — apology issued",
  resolved_with_refund: "已處理 · 退款 Resolved — refund issued",
  resolved_with_credit: "已處理 · 補償金 Resolved — credit issued",
  resolved_with_corrective_action: "已處理 · 已採取改善措施 Resolved — corrective action taken",
  resolved_driver_warning: "已處理 · 駕駛警告 Resolved — driver warning issued",
  resolved_driver_suspension: "已處理 · 駕駛停權 Resolved — driver suspension issued",
  resolved_no_fault: "已處理 · 無過失 Resolved — no fault found",
  resolved_duplicate: "已處理 · 重複案件 Resolved — duplicate case",
  resolved_withdrawn: "已處理 · 申訴人撤回 Resolved — withdrawn by reporter",
  resolved_item_returned: "已處理 · 物品已歸還 Resolved — item returned",
  resolved_item_not_found: "已處理 · 物品未尋獲 Resolved — item not found",
  resolved_other: "已處理 · 其他 Resolved — other",
};

function humanizeUnknownResolutionCode(code: string): string {
  return code
    .replace(/^resolved_/, "")
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Projects the complaint case's canonical, non-personal resolution code into
 * a Host-safe conclusion. Never reads or forwards `closingNote` (see above).
 */
export function extractResolutionSummary(
  resolutionCode?: string | null,
): string | null {
  const code = resolutionCode?.trim();
  if (!code) return null;
  return RESOLUTION_CODE_LABELS[code] ?? humanizeUnknownResolutionCode(code);
}
