import type { AuditLogRecord } from "@drts/contracts";

export interface AuditResourceContextFilter {
  auditId?: string;
  resourceType?: string;
  resourceId?: string;
}

export type AuditContextEvaluation =
  | {
      kind: "none";
    }
  | {
      kind: "valid";
      filter: AuditResourceContextFilter;
      summary: string;
    }
  | {
      kind: "invalid";
      error: string;
    };

export interface FilterAuditRecordsResult {
  rows: AuditLogRecord[];
  isContextActive: boolean;
  isInvalid: boolean;
  isNoMatch: boolean;
  errorMessage?: string | undefined;
  contextSummary?: string | undefined;
}

export interface ReadonlySearchParamsLike {
  get(name: string): string | null;
  getAll?(name: string): string[];
}

/**
 * Parses and validates audit resource context from URL search parameters.
 *
 * Contract:
 * - Missing all context: { kind: "none" } -> general unfiltered audit list.
 * - Optional auditId and/or complete resourceType + resourceId pair: { kind: "valid" }.
 * - Incomplete resourceType / resourceId pair (one present, other missing): { kind: "invalid" }.
 * - Duplicate / conflicting values for any context parameter: { kind: "invalid" }.
 * - Empty string values when parameter key is present: { kind: "invalid" }.
 */
export function parseAuditResourceContext(
  searchParams: ReadonlySearchParamsLike | URLSearchParams | null | undefined,
): AuditContextEvaluation {
  if (!searchParams) {
    return { kind: "none" };
  }

  // Check for duplicate query parameters
  if (typeof searchParams.getAll === "function") {
    const auditIdAll = searchParams.getAll("auditId");
    const resourceTypeAll = searchParams.getAll("resourceType");
    const resourceIdAll = searchParams.getAll("resourceId");

    if (auditIdAll.length > 1) {
      return {
        kind: "invalid",
        error: "Conflicting duplicate 'auditId' query parameters specified in URL.",
      };
    }
    if (resourceTypeAll.length > 1) {
      return {
        kind: "invalid",
        error: "Conflicting duplicate 'resourceType' query parameters specified in URL.",
      };
    }
    if (resourceIdAll.length > 1) {
      return {
        kind: "invalid",
        error: "Conflicting duplicate 'resourceId' query parameters specified in URL.",
      };
    }
  }

  const rawAuditId = searchParams.get("auditId");
  const rawResourceType = searchParams.get("resourceType");
  const rawResourceId = searchParams.get("resourceId");

  const hasAuditId = rawAuditId !== null;
  const hasResourceType = rawResourceType !== null;
  const hasResourceId = rawResourceId !== null;

  if (!hasAuditId && !hasResourceType && !hasResourceId) {
    return { kind: "none" };
  }

  const auditId = rawAuditId !== null ? rawAuditId.trim() : undefined;
  const resourceType = rawResourceType !== null ? rawResourceType.trim() : undefined;
  const resourceId = rawResourceId !== null ? rawResourceId.trim() : undefined;

  // Empty string checks
  if (hasAuditId && (!auditId || auditId.length === 0)) {
    return {
      kind: "invalid",
      error: "Malformed URL query: 'auditId' parameter cannot be empty.",
    };
  }

  // Incomplete resource context check:
  // Both or neither of resourceType and resourceId must be specified
  if (hasResourceType !== hasResourceId) {
    return {
      kind: "invalid",
      error: "Incomplete resource context: both 'resourceType' and 'resourceId' must be provided together.",
    };
  }

  if (hasResourceType && hasResourceId) {
    if (!resourceType || resourceType.length === 0) {
      return {
        kind: "invalid",
        error: "Malformed resource context: 'resourceType' parameter cannot be empty.",
      };
    }
    if (!resourceId || resourceId.length === 0) {
      return {
        kind: "invalid",
        error: "Malformed resource context: 'resourceId' parameter cannot be empty.",
      };
    }
  }

  if (!auditId && !resourceType && !resourceId) {
    return { kind: "none" };
  }

  const filter: AuditResourceContextFilter = {};
  const summaryParts: string[] = [];

  if (auditId) {
    filter.auditId = auditId;
    summaryParts.push(`auditId: ${auditId}`);
  }
  if (resourceType && resourceId) {
    filter.resourceType = resourceType;
    filter.resourceId = resourceId;
    summaryParts.push(`resource: ${resourceType}#${resourceId}`);
  }

  return {
    kind: "valid",
    filter,
    summary: summaryParts.join(" ∩ "),
  };
}

/**
 * Filters authorized audit log records using the evaluated URL context.
 *
 * Intersects exact equality when multiple context criteria are present.
 * When context is active and has no visible match, returns an empty list
 * with isNoMatch: true (never silently shows unfiltered audit records).
 * Module filtering is composed with the active resource context.
 */
export function filterAuditRecordsByContext(
  records: AuditLogRecord[],
  evaluation: AuditContextEvaluation,
  filterModule?: string,
): FilterAuditRecordsResult {
  if (evaluation.kind === "invalid") {
    return {
      rows: [],
      isContextActive: true,
      isInvalid: true,
      isNoMatch: false,
      errorMessage: evaluation.error,
    };
  }

  let matchedRecords = records;

  if (evaluation.kind === "valid") {
    const { auditId, resourceType, resourceId } = evaluation.filter;

    matchedRecords = matchedRecords.filter((rec) => {
      if (auditId && rec.auditId !== auditId) {
        return false;
      }
      if (resourceType && rec.resourceType !== resourceType) {
        return false;
      }
      if (resourceId && rec.resourceId !== resourceId) {
        return false;
      }
      return true;
    });

    if (matchedRecords.length === 0) {
      return {
        rows: [],
        isContextActive: true,
        isInvalid: false,
        isNoMatch: true,
        contextSummary: evaluation.summary,
      };
    }
  }

  const rows = filterModule
    ? matchedRecords.filter((rec) => rec.moduleName === filterModule)
    : matchedRecords;

  return {
    rows,
    isContextActive: evaluation.kind === "valid",
    isInvalid: false,
    isNoMatch: false,
    contextSummary: evaluation.kind === "valid" ? evaluation.summary : undefined,
  };
}
