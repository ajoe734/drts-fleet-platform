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
} as const;

export type HostErrorCode =
  (typeof HOST_ERROR_CODES)[keyof typeof HOST_ERROR_CODES];

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

/**
 * Extracts resolution summary while stripping any reporter PII.
 */
export function extractResolutionSummary(record?: {
  closingNote?: string | null | undefined;
  resolutionCode?: string | null | undefined;
} | null): string | null {
  if (!record) return null;
  if (record.closingNote && record.closingNote.trim().length > 0) {
    return record.closingNote.trim();
  }
  if (record.resolutionCode && record.resolutionCode.trim().length > 0) {
    return record.resolutionCode.trim();
  }
  return null;
}
