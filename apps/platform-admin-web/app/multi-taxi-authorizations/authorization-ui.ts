import type {
  MultiTaxiAuthorizedVehicleRecord,
  MultiTaxiOperatingAuthorizationRecord,
  MultiTaxiOperatingAuthorizationStatus,
} from "@drts/contracts";

export type AuthorizationSort = "canonical" | "updated_desc" | "effective_asc";

export type VehicleListScope = "all" | "current" | "history";

export interface AuthorizationRegistryQuery {
  search: string;
  status: MultiTaxiOperatingAuthorizationStatus | "all";
  sort: AuthorizationSort;
}

export interface AuthorizationDraftInput {
  operatorId: string;
  authorityCode: string;
  businessPlanVersion: string;
  serviceAreaCodes: string;
  activeFareVersionId: string;
  effectiveFrom: string;
  effectiveUntil: string;
}

export interface AuthorizedVehicleInput {
  vehicleId: string;
  effectiveFrom: string;
  effectiveUntil: string;
}

export type AuthorizationDraftField = keyof AuthorizationDraftInput;
export type AuthorizedVehicleField = keyof AuthorizedVehicleInput;
export type ValidationCode = "required" | "invalid_date" | "invalid_window";

export interface ValidationIssue<Field extends string> {
  field: Field;
  code: ValidationCode;
}

export interface AuthorizationActionState {
  editDraft: boolean;
  activate: boolean;
  suspend: boolean;
  addVehicle: boolean;
}

export type AuthorizationErrorKind =
  | "session"
  | "permission"
  | "stale"
  | "conflict"
  | "validation"
  | "unavailable"
  | "request";

export interface ClassifiedAuthorizationError {
  kind: AuthorizationErrorKind;
  code: string;
  message: string;
  retryable: boolean;
}

const STATUS_ORDER: Record<MultiTaxiOperatingAuthorizationStatus, number> = {
  approved: 0,
  draft: 1,
  suspended: 2,
  expired: 3,
  revoked: 4,
};

const REQUIRED_DRAFT_FIELDS: AuthorizationDraftField[] = [
  "operatorId",
  "authorityCode",
  "businessPlanVersion",
  "serviceAreaCodes",
  "activeFareVersionId",
  "effectiveFrom",
];

function timestamp(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function boundaryDistance(
  record: MultiTaxiOperatingAuthorizationRecord,
  nowMs: number,
) {
  const candidates = [record.effectiveFrom, record.effectiveUntil]
    .map(timestamp)
    .filter((value) => Number.isFinite(value) && value >= nowMs);
  return candidates.length > 0
    ? Math.min(...candidates) - nowMs
    : Number.POSITIVE_INFINITY;
}

export function selectAuthorizationRows(
  rows: MultiTaxiOperatingAuthorizationRecord[],
  query: AuthorizationRegistryQuery,
  now = new Date(),
) {
  const needle = query.search.trim().toLocaleLowerCase();
  const result = rows.filter((record) => {
    if (query.status !== "all" && record.status !== query.status) {
      return false;
    }
    if (!needle) return true;
    return [
      record.authorizationId,
      record.authorityCode,
      record.operatorId,
      record.businessPlanVersion,
      record.activeFareVersionId,
      ...record.serviceAreaCodes,
    ].some((value) => value.toLocaleLowerCase().includes(needle));
  });

  return result.sort((left, right) => {
    if (query.sort === "updated_desc") {
      return timestamp(right.updatedAt) - timestamp(left.updatedAt);
    }
    if (query.sort === "effective_asc") {
      return timestamp(left.effectiveFrom) - timestamp(right.effectiveFrom);
    }

    const statusDelta = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
    if (statusDelta !== 0) return statusDelta;
    const leftBoundary = boundaryDistance(left, now.getTime());
    const rightBoundary = boundaryDistance(right, now.getTime());
    if (leftBoundary !== rightBoundary) {
      if (!Number.isFinite(leftBoundary)) return 1;
      if (!Number.isFinite(rightBoundary)) return -1;
      return leftBoundary - rightBoundary;
    }
    return timestamp(right.updatedAt) - timestamp(left.updatedAt);
  });
}

export function getEffectiveWindowState(
  record: MultiTaxiOperatingAuthorizationRecord,
  now = new Date(),
  warningDays = 30,
) {
  if (!record.effectiveUntil) return "open" as const;
  const until = timestamp(record.effectiveUntil);
  if (!Number.isFinite(until)) return "invalid" as const;
  if (until < now.getTime()) return "expired" as const;
  if (until - now.getTime() <= warningDays * 24 * 60 * 60 * 1000) {
    return "expiring" as const;
  }
  return "active" as const;
}

export function getAuthorizationActionState(
  status: MultiTaxiOperatingAuthorizationStatus,
): AuthorizationActionState {
  return {
    editDraft: status === "draft",
    activate: status === "draft" || status === "suspended",
    suspend: status === "approved",
    addVehicle:
      status === "draft" || status === "approved" || status === "suspended",
  };
}

export function validateAuthorizationDraft(input: AuthorizationDraftInput) {
  const issues: ValidationIssue<AuthorizationDraftField>[] = [];
  for (const field of REQUIRED_DRAFT_FIELDS) {
    if (!input[field].trim()) issues.push({ field, code: "required" });
  }

  const from = input.effectiveFrom ? Date.parse(input.effectiveFrom) : NaN;
  const until = input.effectiveUntil ? Date.parse(input.effectiveUntil) : null;
  if (input.effectiveFrom && !Number.isFinite(from)) {
    issues.push({ field: "effectiveFrom", code: "invalid_date" });
  }
  if (input.effectiveUntil && !Number.isFinite(until)) {
    issues.push({ field: "effectiveUntil", code: "invalid_date" });
  } else if (until !== null && Number.isFinite(from) && until <= from) {
    issues.push({ field: "effectiveUntil", code: "invalid_window" });
  }
  return issues;
}

export function validateAuthorizedVehicle(input: AuthorizedVehicleInput) {
  const issues: ValidationIssue<AuthorizedVehicleField>[] = [];
  if (!input.vehicleId.trim()) {
    issues.push({ field: "vehicleId", code: "required" });
  }
  if (!input.effectiveFrom.trim()) {
    issues.push({ field: "effectiveFrom", code: "required" });
  }

  const from = input.effectiveFrom ? Date.parse(input.effectiveFrom) : NaN;
  const until = input.effectiveUntil ? Date.parse(input.effectiveUntil) : null;
  if (input.effectiveFrom && !Number.isFinite(from)) {
    issues.push({ field: "effectiveFrom", code: "invalid_date" });
  }
  if (input.effectiveUntil && !Number.isFinite(until)) {
    issues.push({ field: "effectiveUntil", code: "invalid_date" });
  } else if (until !== null && Number.isFinite(from) && until <= from) {
    issues.push({ field: "effectiveUntil", code: "invalid_window" });
  }
  return issues;
}

export function isCurrentVehicleMembership(
  vehicle: MultiTaxiAuthorizedVehicleRecord,
  now = new Date(),
) {
  const from = timestamp(vehicle.effectiveFrom);
  const until = timestamp(vehicle.effectiveUntil);
  return (
    vehicle.status === "active" &&
    from <= now.getTime() &&
    (vehicle.effectiveUntil === null || until >= now.getTime())
  );
}

export function selectAuthorizedVehicles(
  vehicles: MultiTaxiAuthorizedVehicleRecord[],
  search: string,
  scope: VehicleListScope,
  now = new Date(),
) {
  const needle = search.trim().toLocaleLowerCase();
  return vehicles.filter((vehicle) => {
    const current = isCurrentVehicleMembership(vehicle, now);
    if (scope === "current" && !current) return false;
    if (scope === "history" && current) return false;
    return (
      !needle ||
      vehicle.vehicleId.toLocaleLowerCase().includes(needle) ||
      vehicle.authorizationVehicleId.toLocaleLowerCase().includes(needle)
    );
  });
}

export function classifyAuthorizationError(
  error: unknown,
): ClassifiedAuthorizationError {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as {
          statusCode?: unknown;
          code?: unknown;
          apiMessage?: unknown;
          message?: unknown;
          retryable?: unknown;
        })
      : {};
  const statusCode =
    typeof candidate.statusCode === "number" ? candidate.statusCode : 0;
  const code =
    typeof candidate.code === "string"
      ? candidate.code
      : statusCode
        ? `HTTP_${statusCode}`
        : "REQUEST_FAILED";
  const message =
    typeof candidate.apiMessage === "string"
      ? candidate.apiMessage
      : typeof candidate.message === "string"
        ? candidate.message
        : String(error);
  const normalizedCode = code.toUpperCase();

  if (statusCode === 401 || normalizedCode.includes("SESSION")) {
    return { kind: "session", code, message, retryable: false };
  }
  if (
    statusCode === 403 ||
    normalizedCode.includes("FORBIDDEN") ||
    normalizedCode.includes("IDENTITY_REQUIRED")
  ) {
    return { kind: "permission", code, message, retryable: false };
  }
  if (
    statusCode === 404 ||
    normalizedCode.includes("UNAVAILABLE") ||
    normalizedCode.includes("NOT_FOUND")
  ) {
    return { kind: "unavailable", code, message, retryable: true };
  }
  if (
    normalizedCode.includes("STALE") ||
    normalizedCode.includes("VERSION_CONFLICT")
  ) {
    return { kind: "stale", code, message, retryable: true };
  }
  if (
    statusCode === 409 ||
    normalizedCode.includes("NOT_EDITABLE") ||
    normalizedCode.includes("CANNOT_ACTIVATE") ||
    normalizedCode.includes("NOT_ACTIVE")
  ) {
    return { kind: "conflict", code, message, retryable: true };
  }
  if (statusCode === 400 || normalizedCode.includes("VALIDATION")) {
    return { kind: "validation", code, message, retryable: false };
  }
  return {
    kind: "request",
    code,
    message,
    retryable:
      candidate.retryable === true || statusCode === 0 || statusCode >= 500,
  };
}
