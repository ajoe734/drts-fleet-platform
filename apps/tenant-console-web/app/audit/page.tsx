import type { CSSProperties } from "react";
import type {
  AuditLogRecord,
  EmptyReason,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { API_URL, getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const controlRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: th.fontFamily,
};

const nativeMonoInputStyle: CSSProperties = {
  ...nativeInputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "6px 11px",
  minHeight: 28,
  fontSize: 12,
  fontWeight: 600,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
  borderRadius: 7,
  cursor: "pointer",
  textDecoration: "none",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
};

const ghostButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  background: "transparent",
};

const auditTableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12.5,
  fontFamily: th.fontFamily,
};

const auditHeaderCellStyle: CSSProperties = {
  textAlign: "left",
  padding: "9px 12px",
  fontSize: 10.5,
  fontWeight: 600,
  color: th.textMuted,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  background: th.surfaceLo,
  borderBottom: `1px solid ${th.border}`,
  whiteSpace: "nowrap",
  verticalAlign: "bottom",
};

const auditCellStyle: CSSProperties = {
  padding: "12px",
  borderBottom: `1px solid ${th.border}`,
  verticalAlign: "top",
  color: th.text,
};

const monoCellStyle: CSSProperties = {
  ...auditCellStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  whiteSpace: "nowrap",
};

const stackedCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 3,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11,
  lineHeight: 1.35,
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  gap: 16,
};

const detailCodeStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  background: th.bg,
  border: `1px solid ${th.border}`,
  color: th.text,
  fontSize: 11.5,
  lineHeight: 1.5,
  overflowX: "auto",
  fontFamily: th.monoFamily,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const emptyStateWrapStyle: CSSProperties = {
  padding: "24px 22px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  alignItems: "flex-start",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
};

const actorToneByScope = {
  tenant: "accent",
  ops: "info",
  platform: "warn",
  system: "neutral",
  partner: "success",
} as const;

const auditDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const pageActions: ResourceActionDescriptor[] = [
  { action: "filter", enabled: true, riskLevel: "low" },
  { action: "refresh", enabled: true, riskLevel: "low" },
  { action: "export", enabled: true, riskLevel: "low" },
];

type SearchParamsInput = Record<string, string | string[] | undefined>;

type FilterState = {
  actor: string;
  module: string;
  action: string;
  from: string;
  to: string;
  auditId: string;
  expanded: string;
  empty: EmptyReason | "";
};

type AuditViewModel = {
  record: AuditLogRecord;
  createdAtLabel: string;
  actorScope: keyof typeof actorToneByScope;
  actorLabel: string;
  actorSubLabel: string;
  resourceLabel: string;
  masked: boolean;
  detailLink: ResourceLink;
  auditLink: string;
  oldSummary: string;
  newSummary: string;
};

type ResourceLink = {
  href: string;
  label: string;
  external: boolean;
};

function getSingleParam(searchParams: SearchParamsInput, key: string): string {
  const value = searchParams[key];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function parseFilters(searchParams: SearchParamsInput): FilterState {
  const emptyParam = getSingleParam(searchParams, "empty");

  return {
    actor: getSingleParam(searchParams, "actor"),
    module: getSingleParam(searchParams, "module"),
    action: getSingleParam(searchParams, "action"),
    from: getSingleParam(searchParams, "from"),
    to: getSingleParam(searchParams, "to"),
    auditId: getSingleParam(searchParams, "auditId"),
    expanded: getSingleParam(searchParams, "expanded"),
    empty: isEmptyReason(emptyParam) ? emptyParam : "",
  };
}

function isEmptyReason(value: string): value is EmptyReason {
  return (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  );
}

function formatAuditAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return auditDateFormatter.format(parsed);
}

function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dayFormatter.format(parsed);
}

function normalizeActorScope(
  actorType: AuditLogRecord["actorType"],
): keyof typeof actorToneByScope {
  switch (actorType) {
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "platform_admin":
      return "platform";
    case "partner_api_key":
      return "partner";
    default:
      return "system";
  }
}

function actorScopeLabel(scope: keyof typeof actorToneByScope) {
  return scope.toUpperCase();
}

function maskString(value: string) {
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

function maskEmail(value: string) {
  const [name, domain] = value.split("@");
  if (!domain) return maskString(value);
  const head = (name ?? "").slice(0, 2) || "••";
  return `${head}•••@${domain}`;
}

function shouldMaskByKey(key: string) {
  return /(email|phone|mobile|address|token|secret|key|credential|passport|contact)/i.test(
    key,
  );
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (typeof value === "string") {
    if (value.includes("@")) return maskEmail(value);
    if (shouldMaskByKey(key)) return maskString(value);
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey),
      ]),
    );
  }

  return value;
}

function stringifySummary(value: Record<string, unknown> | undefined) {
  if (!value) return "—";
  return JSON.stringify(sanitizeValue(value), null, 2);
}

function isLikelyMaskedActor(
  actorId: string | null,
  actorType: AuditLogRecord["actorType"],
) {
  if (!actorId) return actorType !== "system";
  return actorId.includes("@");
}

function formatActorPrimary(record: AuditLogRecord) {
  if (!record.actorId) {
    return record.actorType === "system" ? "System actor" : "Masked by policy";
  }

  return record.actorId.includes("@")
    ? maskEmail(record.actorId)
    : record.actorId;
}

function formatActorSecondary(record: AuditLogRecord) {
  if (!record.actorId) {
    return record.actorType === "system"
      ? "background automation"
      : "sensitive identity";
  }

  return record.actorId.includes("@")
    ? "masked sensitive identity"
    : record.actorId;
}

function formatResource(record: AuditLogRecord) {
  if (record.resourceId) return `${record.resourceType} · ${record.resourceId}`;
  return record.resourceType || "—";
}

function buildAuditSelfLink(filters: FilterState, auditId: string) {
  const params = new URLSearchParams();
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.module) params.set("module", filters.module);
  if (filters.action) params.set("action", filters.action);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("auditId", auditId);
  params.set("expanded", auditId);
  return `/audit?${params.toString()}#audit-${encodeURIComponent(auditId)}`;
}

function buildBaseUrl(base: string, route: string) {
  return `${base.replace(/\/$/, "")}${route}`;
}

function buildResourceLink(record: AuditLogRecord): ResourceLink {
  const auditRoute = `/audit?auditId=${encodeURIComponent(record.auditId)}`;
  if (record.actorType === "ops_user") {
    return {
      href: buildBaseUrl(OPS_CONSOLE_URL, auditRoute),
      label: "前往 Ops Console",
      external: true,
    };
  }

  if (record.actorType === "platform_admin") {
    return {
      href: buildBaseUrl(PLATFORM_ADMIN_URL, auditRoute),
      label: "前往 Platform Admin",
      external: true,
    };
  }

  switch (record.resourceType) {
    case "booking":
    case "owned_order":
      return {
        href: record.resourceId
          ? `/bookings/${encodeURIComponent(record.resourceId)}`
          : auditRoute,
        label: "查看叫車",
        external: false,
      };
    case "invoice":
      return {
        href: "/invoices",
        label: "查看對帳單",
        external: false,
      };
    case "report_job":
      return {
        href: "/reports",
        label: "查看報表",
        external: false,
      };
    case "tenant_settings":
      return {
        href: "/settings",
        label: "查看租戶設定",
        external: false,
      };
    case "tenant_user":
      return {
        href: "/users",
        label: "查看人員與角色",
        external: false,
      };
    case "cost_center":
      return {
        href: "/cost-centers",
        label: "查看成本中心",
        external: false,
      };
    default:
      return {
        href: `/audit?auditId=${encodeURIComponent(record.auditId)}`,
        label: "回到稽核詳細",
        external: false,
      };
  }
}

function matchesDateRange(record: AuditLogRecord, filters: FilterState) {
  if (!filters.from && !filters.to) return true;
  const createdAt = new Date(record.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;

  if (filters.from) {
    const from = new Date(`${filters.from}T00:00:00.000Z`);
    if (createdAt < from) return false;
  }

  if (filters.to) {
    const to = new Date(`${filters.to}T23:59:59.999Z`);
    if (createdAt > to) return false;
  }

  return true;
}

function applyFilters(records: AuditLogRecord[], filters: FilterState) {
  return records.filter((record) => {
    if (
      filters.actor &&
      normalizeActorScope(record.actorType) !== filters.actor
    ) {
      return false;
    }
    if (filters.module && record.moduleName !== filters.module) {
      return false;
    }
    if (filters.action && record.actionName !== filters.action) {
      return false;
    }
    if (filters.auditId && record.auditId !== filters.auditId) {
      return false;
    }
    return matchesDateRange(record, filters);
  });
}

function toViewModel(
  record: AuditLogRecord,
  filters: FilterState,
): AuditViewModel {
  const actorScope = normalizeActorScope(record.actorType);
  return {
    record,
    createdAtLabel: formatAuditAt(record.createdAt),
    actorScope,
    actorLabel: formatActorPrimary(record),
    actorSubLabel: formatActorSecondary(record),
    resourceLabel: formatResource(record),
    masked: isLikelyMaskedActor(record.actorId, record.actorType),
    detailLink: buildResourceLink(record),
    auditLink: buildAuditSelfLink(filters, record.auditId),
    oldSummary: stringifySummary(record.oldValuesSummary),
    newSummary: stringifySummary(record.newValuesSummary),
  };
}

function describeErrorReason(error: unknown): EmptyReason {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("401") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized")
  ) {
    return "permission_denied";
  }

  if (
    normalized.includes("502") ||
    normalized.includes("503") ||
    normalized.includes("504") ||
    normalized.includes("econnrefused") ||
    normalized.includes("unavailable")
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

function buildEmptyState(reason: EmptyReason) {
  const clearHref = "/audit";
  const filteredHref = buildAuditHref({
    empty: "",
  });

  switch (reason) {
    case "not_provisioned":
      return {
        title: "稽核匯出治理尚未啟用",
        body: "租戶端仍可閱讀稽核列，但簽章匯出與治理附件尚未在此租戶完成 provisioning。",
        actions: [
          { href: "/settings", label: "查看租戶設定" },
          { href: clearHref, label: "回到稽核" },
        ],
      };
    case "permission_denied":
      return {
        title: "目前角色無法查看稽核資料",
        body: "此頁依 §9.6.12 只對具 audit read 的租戶角色開放。請請求 `tc_admin` 或 `tc_finance` 協助。",
        actions: [{ href: "/settings", label: "查看租戶設定" }],
      };
    case "external_unavailable":
      return {
        title: "上游稽核服務暫時不可用",
        body: `無法自 ${API_URL} 取得 tenant audit snapshot。此頁為 T6 手動刷新，請稍後重試。`,
        actions: [{ href: clearHref, label: "重新整理" }],
      };
    case "fetch_failed":
      return {
        title: "稽核資料讀取失敗",
        body: "請保留目前篩選條件並重新整理；若問題持續，請以 request correlation 通知平台支援。",
        actions: [{ href: clearHref, label: "重新整理" }],
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有命中任何稽核列",
        body: "可放寬 actor / module / action / 時間範圍，或直接清除所有篩選。",
        actions: [
          { href: clearHref, label: "清除篩選" },
          { href: filteredHref, label: "退出示範空態" },
        ],
      };
    case "no_data":
    default:
      return {
        title: "目前沒有可顯示的稽核列",
        body: "此租戶尚未產生任何 state-changing action，或資料保留快照仍在初始化。",
        actions: [
          { href: "/bookings/new", label: "建立第一筆叫車" },
          { href: clearHref, label: "重新整理" },
        ],
      };
  }
}

function buildAuditHref(overrides: Partial<FilterState>) {
  const params = new URLSearchParams();
  const merged: FilterState = {
    actor: "",
    module: "",
    action: "",
    from: "",
    to: "",
    auditId: "",
    expanded: "",
    empty: "",
    ...overrides,
  };

  if (merged.actor) params.set("actor", merged.actor);
  if (merged.module) params.set("module", merged.module);
  if (merged.action) params.set("action", merged.action);
  if (merged.from) params.set("from", merged.from);
  if (merged.to) params.set("to", merged.to);
  if (merged.auditId) params.set("auditId", merged.auditId);
  if (merged.expanded) params.set("expanded", merged.expanded);
  if (merged.empty) params.set("empty", merged.empty);

  const query = params.toString();
  return query ? `/audit?${query}` : "/audit";
}

function buildCsv(rows: AuditViewModel[]) {
  const lines = [
    [
      "createdAt",
      "actorScope",
      "actorId",
      "moduleName",
      "actionName",
      "resourceType",
      "resourceId",
      "requestId",
      "auditId",
    ],
    ...rows.map((row) => [
      row.record.createdAt,
      row.actorScope,
      row.record.actorId ?? "",
      row.record.moduleName,
      row.record.actionName,
      row.record.resourceType,
      row.record.resourceId ?? "",
      row.record.requestId,
      row.record.auditId,
    ]),
  ];

  return lines
    .map((line) =>
      line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","),
    )
    .join("\n");
}

function exportHref(rows: AuditViewModel[]) {
  return `data:text/csv;charset=utf-8,${encodeURIComponent(buildCsv(rows))}`;
}

async function loadAuditLogs() {
  const client = getTenantClient();
  const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];
  return [...logs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function renderActionButton(
  action: ResourceActionDescriptor,
  href: string,
  label: string,
  icon?: string,
) {
  const baseStyle =
    action.action === "refresh"
      ? primaryButtonStyle
      : action.action === "filter"
        ? secondaryButtonStyle
        : ghostButtonStyle;

  return (
    <a
      href={action.enabled ? href : undefined}
      title={!action.enabled ? action.disabledReasonCode : undefined}
      style={{
        ...baseStyle,
        ...(!action.enabled
          ? { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }
          : {}),
      }}
    >
      <span style={{ fontFamily: th.monoFamily, fontSize: 11.5 }}>
        {icon ? `[${icon}]` : null}
      </span>
      <span>{label}</span>
    </a>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const filters = parseFilters(await searchParams);
  let records: AuditLogRecord[] = [];
  let errorReason: EmptyReason | null = null;
  let errorMessage: string | null = null;

  try {
    records = await loadAuditLogs();
  } catch (error) {
    errorReason = filters.empty || describeErrorReason(error);
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  const filteredRecords = applyFilters(records, filters);
  const rows = filteredRecords.map((record) => toViewModel(record, filters));
  const actorOptions = Array.from(
    new Set(records.map((record) => normalizeActorScope(record.actorType))),
  );
  const moduleOptions = Array.from(
    new Set(records.map((record) => record.moduleName)),
  ).sort();
  const actionOptions = Array.from(
    new Set(records.map((record) => record.actionName)),
  ).sort();
  const moduleCount = new Set(
    filteredRecords.map((record) => record.moduleName),
  ).size;
  const requestLinkedCount = filteredRecords.filter(
    (record) => record.requestId,
  ).length;
  const visibleActorScopes = new Set(
    filteredRecords.map((record) => normalizeActorScope(record.actorType)),
  );
  const focusedAuditId = filters.expanded || filters.auditId;
  const emptyReason =
    filters.empty ||
    errorReason ||
    (filteredRecords.length === 0
      ? records.length > 0
        ? "filtered_empty"
        : "no_data"
      : null);
  const emptyState = emptyReason ? buildEmptyState(emptyReason) : null;
  const refreshAction = pageActions.find(
    (action) => action.action === "refresh",
  )!;
  const filterAction = pageActions.find(
    (action) => action.action === "filter",
  )!;
  const exportAction = {
    ...pageActions.find((action) => action.action === "export")!,
    enabled: filteredRecords.length > 0,
    ...(filteredRecords.length > 0
      ? {}
      : { disabledReasonCode: "No visible audit rows to export" }),
  };

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核"
        subtitle="cross-actor visibility · request correlation · manual refresh T6"
        actions={
          <>
            {renderActionButton(
              filterAction,
              buildAuditHref({ empty: "" }),
              "清除篩選",
              "filter",
            )}
            {renderActionButton(
              refreshAction,
              buildAuditHref(filters),
              "重新整理",
              "refresh",
            )}
            {renderActionButton(
              exportAction,
              exportHref(rows),
              "匯出篩選結果",
              "export",
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="audit"
          title="Tenant audit includes cross-actor tenant-owned actions"
          body="Q-TEN13 要求 tenant admin / finance 可看見 tenant、ops、platform、system 對租戶資源的操作；敏感欄位在此頁以 policy-safe 方式呈現。"
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Visible Rows"
            value={String(filteredRecords.length)}
            sub={
              records.length ? `of ${records.length} rows` : "current snapshot"
            }
          />
          <CanvasKPI
            theme={th}
            label="Modules"
            value={String(moduleCount)}
            sub="distinct modules in current filter"
          />
          <CanvasKPI
            theme={th}
            label="Actor Scopes"
            value={String(visibleActorScopes.size)}
            sub={Array.from(visibleActorScopes).join(" · ") || "—"}
          />
          <CanvasKPI
            theme={th}
            label="Request-linked"
            value={String(requestLinkedCount)}
            sub="rows retaining request correlation"
          />
        </div>

        <CanvasCard theme={th}>
          <form
            action="/audit"
            method="get"
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            <div style={filterGridStyle}>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>Actor Scope</span>
                <select
                  defaultValue={filters.actor}
                  name="actor"
                  style={nativeInputStyle}
                >
                  <option value="">全部</option>
                  {actorOptions.map((option) => (
                    <option key={option} value={option}>
                      {actorScopeLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>Module</span>
                <select
                  defaultValue={filters.module}
                  name="module"
                  style={nativeInputStyle}
                >
                  <option value="">全部</option>
                  {moduleOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>Action</span>
                <select
                  defaultValue={filters.action}
                  name="action"
                  style={nativeInputStyle}
                >
                  <option value="">全部</option>
                  {actionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>From</span>
                <input
                  defaultValue={filters.from}
                  name="from"
                  type="date"
                  style={nativeInputStyle}
                />
              </label>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>To</span>
                <input
                  defaultValue={filters.to}
                  name="to"
                  type="date"
                  style={nativeInputStyle}
                />
              </label>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>Audit ID</span>
                <input
                  defaultValue={filters.auditId}
                  name="auditId"
                  placeholder="req / audit deep link"
                  style={nativeMonoInputStyle}
                />
              </label>
            </div>

            <div style={controlRowStyle}>
              <button style={primaryButtonStyle} type="submit">
                套用篩選
              </button>
              <a href="/audit" style={secondaryButtonStyle}>
                重設
              </a>
              <span style={secondaryTextStyle}>
                T6 manual refresh only. Filters are applied server-side on the
                tenant snapshot.
              </span>
            </div>
          </form>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="Recent audit rows"
          subtitle="Expand a row for masked detail and resource exit paths."
        >
          {errorMessage ? (
            <div style={{ padding: "0 0 12px" }}>
              <CanvasBanner
                theme={th}
                tone="warn"
                title="Latest fetch returned an error"
                body={errorMessage}
              />
            </div>
          ) : null}

          {emptyState ? (
            <div style={emptyStateWrapStyle}>
              <CanvasPill theme={th} tone="warn" dot>
                {emptyReason}
              </CanvasPill>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
                  {emptyState.title}
                </div>
                <div
                  style={{
                    ...secondaryTextStyle,
                    fontSize: 12.5,
                    maxWidth: 620,
                  }}
                >
                  {emptyState.body}
                </div>
              </div>
              <div style={actionRowStyle}>
                {emptyState.actions.map((action) => (
                  <a
                    key={action.href + action.label}
                    href={action.href}
                    style={secondaryButtonStyle}
                  >
                    {action.label}
                  </a>
                ))}
              </div>
              <div style={secondaryTextStyle}>
                EmptyReason previews:{" "}
                {(
                  [
                    "no_data",
                    "not_provisioned",
                    "fetch_failed",
                    "permission_denied",
                    "external_unavailable",
                    "filtered_empty",
                  ] as EmptyReason[]
                ).map((reason, index, all) => (
                  <span key={reason}>
                    <a
                      href={buildAuditHref({ ...filters, empty: reason })}
                      style={inlineLinkStyle}
                    >
                      {reason}
                    </a>
                    {index < all.length - 1 ? " · " : ""}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={auditTableStyle}>
                <thead>
                  <tr>
                    <th style={{ ...auditHeaderCellStyle, width: 168 }}>AT</th>
                    <th style={{ ...auditHeaderCellStyle, width: 230 }}>
                      ACTOR
                    </th>
                    <th style={{ ...auditHeaderCellStyle, width: 132 }}>
                      SCOPE
                    </th>
                    <th style={{ ...auditHeaderCellStyle, width: 144 }}>
                      MODULE
                    </th>
                    <th style={{ ...auditHeaderCellStyle, width: 220 }}>
                      ACTION
                    </th>
                    <th style={{ ...auditHeaderCellStyle, width: 220 }}>
                      RESOURCE
                    </th>
                    <th style={{ ...auditHeaderCellStyle, width: 160 }}>
                      REQUEST
                    </th>
                    <th style={auditHeaderCellStyle}>DETAIL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = row.record.auditId === focusedAuditId;
                    return (
                      <tr
                        id={`audit-${row.record.auditId}`}
                        key={row.record.auditId}
                      >
                        <td style={monoCellStyle}>{row.createdAtLabel}</td>
                        <td style={auditCellStyle}>
                          <div style={stackedCellStyle}>
                            <strong>{row.actorLabel}</strong>
                            <span style={secondaryTextStyle}>
                              {row.actorSubLabel}
                            </span>
                            {row.masked ? (
                              <span style={secondaryTextStyle}>
                                masked sensitive identity
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td style={auditCellStyle}>
                          <CanvasPill
                            theme={th}
                            tone={actorToneByScope[row.actorScope]}
                            dot
                          >
                            {actorScopeLabel(row.actorScope)}
                          </CanvasPill>
                        </td>
                        <td style={monoCellStyle}>{row.record.moduleName}</td>
                        <td style={monoCellStyle}>{row.record.actionName}</td>
                        <td style={auditCellStyle}>
                          <div style={stackedCellStyle}>
                            <span>{row.resourceLabel}</span>
                            <a
                              href={row.detailLink.href}
                              style={inlineLinkStyle}
                              target={
                                row.detailLink.external ? "_blank" : undefined
                              }
                              rel={
                                row.detailLink.external
                                  ? "noreferrer"
                                  : undefined
                              }
                            >
                              {row.detailLink.label}
                            </a>
                          </div>
                        </td>
                        <td style={monoCellStyle}>
                          {row.record.requestId || "—"}
                        </td>
                        <td style={auditCellStyle}>
                          <details open={open}>
                            <summary
                              style={{ cursor: "pointer", color: th.accent }}
                            >
                              {open ? "收合細節" : "展開細節"}
                            </summary>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 12,
                                marginTop: 12,
                              }}
                            >
                              <CanvasDL
                                theme={th}
                                cols={2}
                                items={[
                                  {
                                    label: "Audit ID",
                                    value: row.record.auditId,
                                    mono: true,
                                  },
                                  {
                                    label: "Actor Type",
                                    value: row.record.actorType,
                                    mono: true,
                                  },
                                  {
                                    label: "Tenant",
                                    value: row.record.tenantId ?? "—",
                                    mono: true,
                                  },
                                  {
                                    label: "Resource ID",
                                    value: row.record.resourceId ?? "—",
                                    mono: true,
                                  },
                                  {
                                    label: "Request",
                                    value: row.record.requestId || "—",
                                    mono: true,
                                  },
                                  {
                                    label: "Date",
                                    value: formatDay(row.record.createdAt),
                                    mono: true,
                                  },
                                ]}
                              />
                              <div style={detailGridStyle}>
                                <div>
                                  <div style={fieldLabelStyle}>
                                    Old Values Summary
                                  </div>
                                  <pre style={detailCodeStyle}>
                                    {row.oldSummary}
                                  </pre>
                                </div>
                                <div>
                                  <div style={fieldLabelStyle}>
                                    New Values Summary
                                  </div>
                                  <pre style={detailCodeStyle}>
                                    {row.newSummary}
                                  </pre>
                                </div>
                              </div>
                              <div style={actionRowStyle}>
                                <a
                                  href={row.auditLink}
                                  style={secondaryButtonStyle}
                                >
                                  固定連結此稽核列
                                </a>
                                <a
                                  href={row.detailLink.href}
                                  style={secondaryButtonStyle}
                                  target={
                                    row.detailLink.external
                                      ? "_blank"
                                      : undefined
                                  }
                                  rel={
                                    row.detailLink.external
                                      ? "noreferrer"
                                      : undefined
                                  }
                                >
                                  {row.detailLink.label}
                                </a>
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
