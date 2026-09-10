/**
 * Audit Resource Context Receiver Contract (SR-OPS-SHELL-001 / Q-SR-OPS-SHELL-001)
 *
 * Implements query parameter parsing, validation, and exact-equality intersection
 * filtering over authorized listAuditLogs() results on /audit.
 *
 * Contract:
 * - optional auditId and/or complete resourceType + resourceId pair.
 * - intersection of exact equality when multiple parameters present.
 * - URL context never grants permission.
 * - Missing all context keeps general audit list (status: "none").
 * - Incomplete, malformed or conflicting context yields explicit invalid state (status: "invalid").
 * - Unknown/no-match yields contextual empty state (isContextualEmpty: true), never silently unfiltered.
 */

export interface NoneAuditResourceContext {
  status: "none";
}

export interface ValidAuditResourceContext {
  status: "valid";
  auditId?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface InvalidAuditResourceContext {
  status: "invalid";
  reason: string;
}

export type AuditResourceContext =
  | NoneAuditResourceContext
  | ValidAuditResourceContext
  | InvalidAuditResourceContext;

export interface QueryGetter {
  get(key: string): string | null;
  getAll?(key: string): string[];
  has?(key: string): boolean;
}

export function parseAuditResourceContext(
  source?: string | URLSearchParams | QueryGetter | null,
): AuditResourceContext {
  if (!source) {
    return { status: "none" };
  }

  let getter: QueryGetter;
  if (typeof source === "string") {
    const raw = source.startsWith("?") ? source.slice(1) : source;
    if (!raw.trim()) {
      return { status: "none" };
    }
    getter = new URLSearchParams(raw);
  } else {
    getter = source;
  }

  // Check for duplicate conflicting parameters if getAll is supported
  if (typeof getter.getAll === "function") {
    const checkConflicts = (key: string): string | null => {
      const values = getter.getAll!(key);
      const unique = new Set(values.map((v) => v.trim()).filter(Boolean));
      if (unique.size > 1) {
        return `Conflicting multiple values for parameter '${key}'`;
      }
      return null;
    };

    const auditIdConflict = checkConflicts("auditId");
    if (auditIdConflict) {
      return { status: "invalid", reason: auditIdConflict };
    }
    const typeConflict = checkConflicts("resourceType");
    if (typeConflict) {
      return { status: "invalid", reason: typeConflict };
    }
    const idConflict = checkConflicts("resourceId");
    if (idConflict) {
      return { status: "invalid", reason: idConflict };
    }
  }

  const rawAuditId = getter.get("auditId");
  const rawResourceType = getter.get("resourceType");
  const rawResourceId = getter.get("resourceId");

  const hasAuditIdKey =
    typeof getter.has === "function"
      ? getter.has("auditId")
      : rawAuditId !== null;
  const hasResourceTypeKey =
    typeof getter.has === "function"
      ? getter.has("resourceType")
      : rawResourceType !== null;
  const hasResourceIdKey =
    typeof getter.has === "function"
      ? getter.has("resourceId")
      : rawResourceId !== null;

  if (!hasAuditIdKey && !hasResourceTypeKey && !hasResourceIdKey) {
    return { status: "none" };
  }

  // Check for empty string values when key is explicitly present
  if (hasAuditIdKey && (!rawAuditId || !rawAuditId.trim())) {
    return {
      status: "invalid",
      reason: "Parameter 'auditId' is present but empty",
    };
  }
  if (hasResourceTypeKey && (!rawResourceType || !rawResourceType.trim())) {
    return {
      status: "invalid",
      reason: "Parameter 'resourceType' is present but empty",
    };
  }
  if (hasResourceIdKey && (!rawResourceId || !rawResourceId.trim())) {
    return {
      status: "invalid",
      reason: "Parameter 'resourceId' is present but empty",
    };
  }

  // Check complete pair requirement
  if (hasResourceTypeKey && !hasResourceIdKey) {
    return {
      status: "invalid",
      reason: "Parameter 'resourceType' requires accompanying 'resourceId'",
    };
  }
  if (hasResourceIdKey && !hasResourceTypeKey) {
    return {
      status: "invalid",
      reason: "Parameter 'resourceId' requires accompanying 'resourceType'",
    };
  }

  const auditId = rawAuditId?.trim();
  const resourceType = rawResourceType?.trim();
  const resourceId = rawResourceId?.trim();

  return {
    status: "valid",
    ...(auditId ? { auditId } : {}),
    ...(resourceType && resourceId ? { resourceType, resourceId } : {}),
  };
}

export interface FilterAuditRecordsResult<T> {
  filteredRecords: T[];
  isFiltered: boolean;
  isContextualEmpty: boolean;
}

export function filterAuditRecords<
  T extends {
    auditId: string;
    resourceType?: string | null;
    resourceId?: string | null;
  },
>(records: T[], context: AuditResourceContext): FilterAuditRecordsResult<T> {
  if (context.status !== "valid") {
    return {
      filteredRecords: records,
      isFiltered: false,
      isContextualEmpty: false,
    };
  }

  const matches = records.filter((r) => {
    if (context.auditId && r.auditId !== context.auditId) {
      return false;
    }
    if (context.resourceType && r.resourceType !== context.resourceType) {
      return false;
    }
    if (context.resourceId && r.resourceId !== context.resourceId) {
      return false;
    }
    return true;
  });

  return {
    filteredRecords: matches,
    isFiltered: true,
    isContextualEmpty: matches.length === 0,
  };
}

export function clearAuditResourceSearchParams(
  search: string | URLSearchParams,
): string {
  const params =
    typeof search === "string"
      ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
      : new URLSearchParams(search.toString());

  params.delete("auditId");
  params.delete("resourceType");
  params.delete("resourceId");

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getAuditContextCopy(locale: string) {
  const isZh = locale.startsWith("zh");
  return {
    filteredBannerTitle: isZh
      ? "已套用跨應用資源導航篩選"
      : "Cross-App Resource Context Filter Applied",
    invalidContextTitle: isZh
      ? "URL 資源篩選參數格式無效"
      : "Invalid URL Resource Context",
    clearFilter: isZh ? "清除資源篩選" : "Clear resource filter",
    contextualEmptyTitle: isZh
      ? "查無符合此跨應用資源條件的稽核紀錄"
      : "No audit records match the requested resource context",
    contextualEmptyDescription: isZh
      ? "目前授權範圍內無相符紀錄；此為內容篩選結果，非整體系統無紀錄。"
      : "No matching records found in authorized scope. This is a scoped filter result, not an empty system log.",
    resourceLabel: isZh ? "資源類型與編號" : "Resource",
    auditIdLabel: isZh ? "稽核識別碼" : "Audit ID",
  };
}
