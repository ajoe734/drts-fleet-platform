import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasField,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "manual";
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3103";
const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3102";

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const filterBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const compactFieldStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const labelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const selectStyle: CSSProperties = {
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "7px 10px",
  fontSize: 12.5,
  color: th.text,
  fontFamily: th.fontFamily,
  width: "100%",
  minHeight: 34,
};

const formActionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const buttonBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: "5px 10px",
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: "none",
  fontFamily: th.fontFamily,
};

const buttonPrimaryStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: th.accent,
  color: "#fff",
  border: `1px solid ${th.accent}`,
};

const buttonSecondaryStyle: CSSProperties = {
  ...buttonBaseStyle,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
};

const buttonDisabledStyle: CSSProperties = {
  ...buttonSecondaryStyle,
  opacity: 0.55,
  cursor: "not-allowed",
};

const subtleCopyStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
};

const emptyStateWrapStyle: CSSProperties = {
  padding: 28,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  textAlign: "center",
};

const emptyStateTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: th.text,
};

const emptyStateBodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: th.textMuted,
  maxWidth: 560,
};

const actorCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const actorIdStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  fontFamily: th.monoFamily,
};

const resourceCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const linkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontWeight: 600,
};

const detailsStyle: CSSProperties = {
  minWidth: 240,
};

const detailSummaryStyle: CSSProperties = {
  cursor: "pointer",
  color: th.accent,
  fontSize: 11.5,
  fontWeight: 600,
};

const detailBodyStyle: CSSProperties = {
  marginTop: 8,
  padding: 10,
  borderRadius: 8,
  background: th.surfaceLo,
  border: `1px solid ${th.border}`,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  whiteSpace: "normal",
};

const detailRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr",
  gap: 8,
  alignItems: "start",
  fontSize: 11.5,
};

const detailKeyStyle: CSSProperties = {
  color: th.textDim,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const detailValueStyle: CSSProperties = {
  color: th.text,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionHintStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
};

type QueryValue = string | string[] | undefined;

type AuditQuery = {
  auditId: string;
  actor: string;
  module: string;
  action: string;
  from: string;
  to: string;
  emptyReason: EmptyReason | "";
};

type AuditRow = {
  auditId: string;
  at: string;
  actor: ReactNode;
  module: string;
  action: ReactNode;
  resource: ReactNode;
  request: string;
  detail: ReactNode;
};

function getQueryValue(value: QueryValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function isEmptyReason(value: string): value is EmptyReason {
  return [
    "no_data",
    "not_provisioned",
    "fetch_failed",
    "permission_denied",
    "external_unavailable",
    "filtered_empty",
  ].includes(value);
}

function parseAuditQuery(params: Record<string, QueryValue>): AuditQuery {
  const emptyReasonParam = getQueryValue(params.emptyReason);

  return {
    auditId: getQueryValue(params.auditId).trim(),
    actor: getQueryValue(params.actor).trim(),
    module: getQueryValue(params.module).trim(),
    action: getQueryValue(params.action).trim(),
    from: getQueryValue(params.from).trim(),
    to: getQueryValue(params.to).trim(),
    emptyReason: isEmptyReason(emptyReasonParam) ? emptyReasonParam : "",
  };
}

const auditDateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const generatedAtFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatAuditAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return auditDateFormatter.format(parsed);
}

function formatGeneratedAt(value: Date) {
  return generatedAtFormatter.format(value);
}

function getActorRealm(
  actorType: AuditLogRecord["actorType"],
): "tenant" | "ops" | "platform" | "partner" | "system" {
  switch (actorType) {
    case "tenant_admin":
      return "tenant";
    case "ops_user":
      return "ops";
    case "platform_admin":
      return "platform";
    case "partner_api_key":
      return "partner";
    case "system":
    default:
      return "system";
  }
}

function getActorPillTone(actorType: AuditLogRecord["actorType"]) {
  switch (getActorRealm(actorType)) {
    case "tenant":
      return "accent" as const;
    case "ops":
      return "info" as const;
    case "platform":
      return "warn" as const;
    case "partner":
      return "danger" as const;
    case "system":
    default:
      return "neutral" as const;
  }
}

function getActorLabel(actorType: AuditLogRecord["actorType"]) {
  const realm = getActorRealm(actorType);
  if (realm === "system") {
    return "system";
  }
  return realm;
}

function formatActorName(log: AuditLogRecord) {
  if (log.actorId) {
    return log.actorId;
  }
  if (log.actorType === "system") {
    return "system";
  }
  return "masked";
}

function formatResourceLabel(log: AuditLogRecord) {
  return log.resourceId ?? log.resourceType;
}

function isMasked(log: AuditLogRecord) {
  const summaries = [log.oldValuesSummary, log.newValuesSummary]
    .filter(Boolean)
    .map((value) => JSON.stringify(value).toLowerCase());

  return (
    !log.actorId ||
    summaries.some((summary) =>
      ["masked", "redacted", "***"].some((token) => summary.includes(token)),
    )
  );
}

function stringifySummary(value: Record<string, unknown> | undefined) {
  if (!value) return "—";
  const entries = Object.entries(value);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 4)
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(" · ");
}

function isTenantOwnedResource(log: AuditLogRecord) {
  return [
    "booking",
    "owned_order",
    "invoice",
    "cost_center",
    "tenant_user",
    "tenant_role",
    "tenant_settings",
    "tenant_profile",
    "report_job",
  ].includes(log.resourceType);
}

function isOpsOwnedResource(log: AuditLogRecord) {
  return (
    ["complaint_case", "incident"].includes(log.resourceType) ||
    ["complaint", "incident"].includes(log.moduleName)
  );
}

function buildResourceLink(log: AuditLogRecord): CrossAppResourceLink | null {
  const id = log.resourceId;

  if (isTenantOwnedResource(log)) {
    if (log.resourceType === "booking" || log.resourceType === "owned_order") {
      return {
        targetApp: "tenant-console",
        route: `/bookings?q=${encodeURIComponent(id ?? log.requestId)}`,
        resourceType: log.resourceType,
        resourceId: id ?? log.requestId,
        openMode: "same_tab",
        label: "查看租戶叫車",
      };
    }
    if (log.resourceType === "invoice") {
      return {
        targetApp: "tenant-console",
        route: "/invoices",
        resourceType: log.resourceType,
        resourceId: id ?? "invoice",
        openMode: "same_tab",
        label: "查看對帳單",
      };
    }
    if (log.resourceType === "cost_center") {
      return {
        targetApp: "tenant-console",
        route: "/cost-centers",
        resourceType: log.resourceType,
        resourceId: id ?? "cost_center",
        openMode: "same_tab",
        label: "查看成本中心",
      };
    }
    if (
      log.resourceType === "tenant_user" ||
      log.resourceType === "tenant_role"
    ) {
      return {
        targetApp: "tenant-console",
        route: "/users",
        resourceType: log.resourceType,
        resourceId: id ?? "users",
        openMode: "same_tab",
        label: "查看人員與角色",
      };
    }
    return {
      targetApp: "tenant-console",
      route: "/settings",
      resourceType: log.resourceType,
      resourceId: id ?? log.auditId,
      openMode: "same_tab",
      label: "在 Tenant Console 檢視",
    };
  }

  if (isOpsOwnedResource(log)) {
    const route =
      log.resourceType === "complaint_case" || log.moduleName === "complaint"
        ? `/complaints/${encodeURIComponent(id ?? log.requestId)}`
        : log.resourceType === "incident" || log.moduleName === "incident"
          ? `/incidents/${encodeURIComponent(id ?? log.requestId)}`
          : `/audit?auditId=${encodeURIComponent(log.auditId)}`;
    return {
      targetApp: "ops-console",
      route,
      resourceType: log.resourceType,
      resourceId: id ?? log.auditId,
      openMode: "new_tab",
      label: "在 Ops Console 開啟",
    };
  }

  if (
    log.resourceType === "tenant" ||
    log.moduleName === "tenant" ||
    log.actorType === "platform_admin" ||
    log.actorType === "system"
  ) {
    const route =
      log.resourceType === "tenant" || log.moduleName === "tenant"
        ? `/tenants/${encodeURIComponent(log.tenantId ?? id ?? "tenant")}`
        : `/audit?auditId=${encodeURIComponent(log.auditId)}`;
    return {
      targetApp: "platform-admin",
      route,
      resourceType: log.resourceType,
      resourceId: id ?? log.auditId,
      openMode: "new_tab",
      label:
        log.actorType === "platform_admin"
          ? "在 Platform Admin 開啟"
          : "在 Platform Admin 檢視稽核",
    };
  }

  return null;
}

function resolveHref(link: CrossAppResourceLink) {
  if (link.targetApp === "tenant-console") {
    return link.route;
  }

  const base =
    link.targetApp === "ops-console" ? OPS_CONSOLE_URL : PLATFORM_ADMIN_URL;
  return `${base}${link.route}`;
}

function matchesDateRange(log: AuditLogRecord, query: AuditQuery) {
  const createdAtMs = Date.parse(log.createdAt);
  if (Number.isNaN(createdAtMs)) {
    return false;
  }

  if (query.from) {
    const fromMs = Date.parse(`${query.from}T00:00:00Z`);
    if (!Number.isNaN(fromMs) && createdAtMs < fromMs) {
      return false;
    }
  }

  if (query.to) {
    const toMs = Date.parse(`${query.to}T23:59:59.999Z`);
    if (!Number.isNaN(toMs) && createdAtMs > toMs) {
      return false;
    }
  }

  return true;
}

function filterLogs(logs: AuditLogRecord[], query: AuditQuery) {
  return logs.filter((log) => {
    if (query.actor && getActorRealm(log.actorType) !== query.actor) {
      return false;
    }
    if (query.module && log.moduleName !== query.module) {
      return false;
    }
    if (query.action && log.actionName !== query.action) {
      return false;
    }
    return matchesDateRange(log, query);
  });
}

function buildAuditRows(logs: AuditLogRecord[]): AuditRow[] {
  return logs.map((log) => {
    const resourceLink = buildResourceLink(log);
    const resourceHref = resourceLink ? resolveHref(resourceLink) : null;
    const masked = isMasked(log);

    return {
      auditId: log.auditId,
      at: formatAuditAt(log.createdAt),
      actor: (
        <div style={actorCellStyle}>
          <div style={chipRowStyle}>
            <CanvasPill theme={th} tone={getActorPillTone(log.actorType)} dot>
              {getActorLabel(log.actorType)}
            </CanvasPill>
            {masked ? (
              <CanvasPill theme={th} tone="neutral">
                masked
              </CanvasPill>
            ) : null}
          </div>
          <strong>{formatActorName(log)}</strong>
          <span style={actorIdStyle}>{log.actorType}</span>
        </div>
      ),
      module: log.moduleName,
      action: (
        <span style={{ color: th.accent, fontFamily: th.monoFamily }}>
          {log.actionName}
        </span>
      ),
      resource: (
        <div style={resourceCellStyle}>
          <strong>{log.resourceType}</strong>
          {resourceHref ? (
            <a
              href={resourceHref}
              rel={
                resourceLink?.openMode === "new_tab" ? "noreferrer" : undefined
              }
              style={linkStyle}
              target={
                resourceLink?.openMode === "new_tab" ? "_blank" : undefined
              }
            >
              {formatResourceLabel(log)}
            </a>
          ) : (
            <span style={{ color: th.textMuted }}>
              {formatResourceLabel(log)}
            </span>
          )}
        </div>
      ),
      request: log.requestId,
      detail: (
        <details style={detailsStyle}>
          <summary style={detailSummaryStyle}>展開</summary>
          <div style={detailBodyStyle}>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>audit</span>
              <span style={{ ...detailValueStyle, fontFamily: th.monoFamily }}>
                {log.auditId}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>old</span>
              <span style={detailValueStyle}>
                {stringifySummary(log.oldValuesSummary)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>new</span>
              <span style={detailValueStyle}>
                {stringifySummary(log.newValuesSummary)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>link</span>
              {resourceHref ? (
                <a
                  href={resourceHref}
                  rel={
                    resourceLink?.openMode === "new_tab"
                      ? "noreferrer"
                      : undefined
                  }
                  style={linkStyle}
                  target={
                    resourceLink?.openMode === "new_tab" ? "_blank" : undefined
                  }
                >
                  {resourceLink?.label}
                </a>
              ) : (
                <span style={detailValueStyle}>無可導向的資源明細</span>
              )}
            </div>
          </div>
        </details>
      ),
    };
  });
}

function buildQueryString(query: AuditQuery) {
  const params = new URLSearchParams();
  if (query.auditId) params.set("auditId", query.auditId);
  if (query.actor) params.set("actor", query.actor);
  if (query.module) params.set("module", query.module);
  if (query.action) params.set("action", query.action);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.emptyReason) params.set("emptyReason", query.emptyReason);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function getPageActions(input: {
  hasRows: boolean;
  hasFocusedRecord: boolean;
}): ResourceActionDescriptor[] {
  return [
    {
      action: "filter",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "export",
      enabled: input.hasRows,
      riskLevel: "low",
      ...(input.hasRows ? {} : { disabledReasonCode: "no_matching_rows" }),
    },
    {
      action: "view_audit_receipt",
      enabled: input.hasFocusedRecord,
      riskLevel: "low",
      ...(input.hasFocusedRecord
        ? {}
        : { disabledReasonCode: "no_receipt_context" }),
    },
  ];
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildCsvHref(logs: AuditLogRecord[]) {
  const header = [
    "createdAt",
    "auditId",
    "actorRealm",
    "actorType",
    "actorId",
    "moduleName",
    "actionName",
    "resourceType",
    "resourceId",
    "requestId",
  ];
  const rows = logs.map((log) =>
    [
      log.createdAt,
      log.auditId,
      getActorRealm(log.actorType),
      log.actorType,
      log.actorId ?? "masked",
      log.moduleName,
      log.actionName,
      log.resourceType,
      log.resourceId ?? "",
      log.requestId,
    ]
      .map((value) => escapeCsvCell(String(value)))
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function deriveEmptyReason(input: {
  override: EmptyReason | "";
  loadError: string | null;
  allCount: number;
  filteredCount: number;
  hasFilter: boolean;
}): EmptyReason | null {
  if (input.override) {
    return input.override;
  }
  if (input.loadError) {
    if (
      input.loadError.includes("403") ||
      input.loadError.includes("401") ||
      input.loadError.includes("forbidden")
    ) {
      return "permission_denied";
    }
    if (
      input.loadError.includes("503") ||
      input.loadError.includes("502") ||
      input.loadError.includes("timeout")
    ) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  if (input.filteredCount > 0) {
    return null;
  }
  if (input.hasFilter && input.allCount > 0) {
    return "filtered_empty";
  }
  return "no_data";
}

function getEmptyCopy(
  reason: EmptyReason,
  actions: ResourceActionDescriptor[],
): {
  tone: "info" | "warn" | "danger" | "neutral";
  title: string;
  body: string;
  actionLabel?: string;
} {
  const exportAction = actions.find((item) => item.action === "export");

  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn",
        title: "租戶尚未啟用稽核檢視",
        body: "此租戶的 evidence lane 尚未 provision 完成。等後端治理配置完成後，tenant admin 與 finance 才會看到 append-only 稽核列。",
      };
    case "permission_denied":
      return {
        tone: "danger",
        title: "目前身分沒有 audit read 權限",
        body: "此頁只對具備 tenant-scoped audit visibility 的角色開放。若這不是預期行為，請由 tenant admin 檢查角色與範圍設定。",
      };
    case "external_unavailable":
      return {
        tone: "warn",
        title: "外部 evidence 來源暫時不可用",
        body: "目前顯示通道未能取得完整 cross-actor evidence。這種情況不會假裝成空資料；待上游恢復後請手動 refresh。",
      };
    case "fetch_failed":
      return {
        tone: "danger",
        title: "稽核資料讀取失敗",
        body: "後端回應失敗，因此頁面沒有用假資料填補。請稍後重整，或確認 API 與 auth bootstrap 是否正常。",
      };
    case "filtered_empty":
      return {
        tone: "info",
        title: "目前篩選條件沒有命中紀錄",
        body: "Cross-actor audit 仍存在，但此組 actor/module/action/time 條件下沒有相符列。清除篩選即可回到完整 tenant scope。",
        ...(exportAction?.enabled === false
          ? { actionLabel: "清除篩選後才可匯出" }
          : {}),
      };
    case "no_data":
    default:
      return {
        tone: "neutral",
        title: "目前沒有任何稽核紀錄",
        body: "此租戶尚未產生可見的 state-changing evidence。等第一筆 tenant/ops/platform/system 動作落地後，這裡會顯示 append-only ledger。",
      };
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, QueryValue>>;
}) {
  const query = parseAuditQuery(await searchParams);
  const generatedAt = new Date();
  const client = getTenantClient();

  let logs: AuditLogRecord[] = [];
  let loadError: string | null = null;

  try {
    logs = ((await client.listTenantAuditLogs()) as AuditLogRecord[])
      .slice()
      .sort((left, right) => {
        return Date.parse(right.createdAt) - Date.parse(left.createdAt);
      });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "unknown error";
  }

  const filteredLogs = loadError ? [] : filterLogs(logs, query);
  const focusedLog = query.auditId
    ? (logs.find((log) => log.auditId === query.auditId) ?? null)
    : null;
  const hasFilter = Boolean(
    query.actor ||
    query.module ||
    query.action ||
    query.from ||
    query.to ||
    query.auditId,
  );
  const pageActions = getPageActions({
    hasRows: filteredLogs.length > 0,
    hasFocusedRecord: Boolean(focusedLog),
  });
  const emptyReason = deriveEmptyReason({
    override: query.emptyReason,
    loadError,
    allCount: logs.length,
    filteredCount: filteredLogs.length,
    hasFilter,
  });
  const emptyCopy = emptyReason ? getEmptyCopy(emptyReason, pageActions) : null;

  const actorOptions = Array.from(
    new Set(logs.map((log) => getActorRealm(log.actorType))),
  );
  const moduleOptions = Array.from(
    new Set(logs.map((log) => log.moduleName)),
  ).sort();
  const actionOptions = Array.from(
    new Set(logs.map((log) => log.actionName)),
  ).sort();

  const visibleLogs = emptyReason ? [] : filteredLogs;
  const exportHref = pageActions.find((action) => action.action === "export")
    ?.enabled
    ? buildCsvHref(visibleLogs)
    : null;
  const rows = buildAuditRows(visibleLogs);
  const columns: CanvasTableColumn<AuditRow>[] = [
    { h: "When", k: "at", w: 170, mono: true },
    { h: "Actor", k: "actor", w: 220 },
    { h: "Module", k: "module", w: 140, mono: true },
    { h: "Action", k: "action", w: 190 },
    { h: "Resource", k: "resource", w: 220 },
    { h: "Request", k: "request", w: 160, mono: true },
    { h: "Detail", k: "detail", w: 260 },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核 · cross-actor"
        subtitle="不可變 · 7 年保存 · 含所有 actor realm 對 tenant 資源的動作 (Q-TEN13)"
        actions={
          <div style={formActionStyle}>
            <CanvasPill theme={th} tone="neutral" dot>
              T6 manual refresh
            </CanvasPill>
            <Link
              href={`/audit${buildQueryString(query)}`}
              style={buttonSecondaryStyle}
            >
              手動刷新
            </Link>
            {exportHref ? (
              <a
                download="tenant-audit-export.csv"
                href={exportHref}
                style={buttonSecondaryStyle}
              >
                匯出篩選結果
              </a>
            ) : (
              <span
                aria-disabled="true"
                style={buttonDisabledStyle}
                title={
                  pageActions.find((action) => action.action === "export")
                    ?.disabledReasonCode
                }
              >
                匯出篩選結果
              </span>
            )}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
          }}
        >
          <CanvasKPI
            theme={th}
            label="Visible rows"
            value={visibleLogs.length}
            sub={
              emptyReason ? "0 visible" : `${logs.length} total in tenant scope`
            }
          />
          <CanvasKPI
            theme={th}
            label="Actor realms"
            value={actorOptions.length}
            sub={actorOptions.join(" · ") || "—"}
          />
          <CanvasKPI
            theme={th}
            label="Modules"
            value={moduleOptions.length}
            sub={moduleOptions.slice(0, 3).join(" · ") || "—"}
          />
          <CanvasKPI
            theme={th}
            label="Snapshot"
            value={REFRESH_TIER}
            sub={formatGeneratedAt(generatedAt)}
            hint="manual tier"
          />
        </div>

        <CanvasBanner
          theme={th}
          tone="info"
          title="跨 actor 可見性 · Q-TEN13"
          body="本租戶可看到：(a) 自家使用者對自家資源的動作；(b) ops 對 booking / complaint 的動作；(c) platform admin 影響租戶設定的動作；(d) system 對租戶資源的動作。敏感欄位由 policy 自動 mask。"
        />

        {query.auditId ? (
          <CanvasBanner
            theme={th}
            tone={focusedLog ? "accent" : "warn"}
            title={
              focusedLog
                ? `Receipt deep link · ${query.auditId}`
                : "Receipt deep link 未命中"
            }
            body={
              focusedLog
                ? "此頁已接住 ActionReceipt 的 `auditId`。下方列表保留完整 tenant scope，同時你可用 focused record 追查單筆 evidence。"
                : "目前 tenant scope 內找不到這筆 auditId；可能是範圍不屬於此租戶、資料尚未同步，或上游提供了錯誤 receipt。"
            }
          />
        ) : null}

        <CanvasCard
          theme={th}
          title="篩選與動作"
          subtitle="依 actor、module、action、time range 調查，並保留 request correlation。"
          actions={
            <div style={actionHintStyle}>
              {pageActions.map((action) => (
                <CanvasPill
                  key={action.action}
                  theme={th}
                  tone={action.enabled ? "accent" : "neutral"}
                >
                  {action.action}
                  {action.enabled
                    ? ""
                    : ` · ${action.disabledReasonCode ?? "disabled"}`}
                </CanvasPill>
              ))}
            </div>
          }
        >
          <form action="/audit" method="get" style={filterBarStyle}>
            <div style={compactFieldStyle}>
              <span style={labelStyle}>Actor realm</span>
              <select
                defaultValue={query.actor}
                name="actor"
                style={selectStyle}
              >
                <option value="">All actor realms</option>
                {actorOptions.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
            </div>
            <div style={compactFieldStyle}>
              <span style={labelStyle}>Module</span>
              <select
                defaultValue={query.module}
                name="module"
                style={selectStyle}
              >
                <option value="">All modules</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </select>
            </div>
            <div style={compactFieldStyle}>
              <span style={labelStyle}>Action</span>
              <select
                defaultValue={query.action}
                name="action"
                style={selectStyle}
              >
                <option value="">All actions</option>
                {actionOptions.map((actionName) => (
                  <option key={actionName} value={actionName}>
                    {actionName}
                  </option>
                ))}
              </select>
            </div>
            <div style={compactFieldStyle}>
              <CanvasField theme={th} label="From">
                <input
                  defaultValue={query.from}
                  name="from"
                  style={selectStyle}
                  type="date"
                />
              </CanvasField>
            </div>
            <div style={compactFieldStyle}>
              <CanvasField theme={th} label="To">
                <input
                  defaultValue={query.to}
                  name="to"
                  style={selectStyle}
                  type="date"
                />
              </CanvasField>
            </div>
            <div style={compactFieldStyle}>
              <span style={labelStyle}>Empty state demo</span>
              <select
                defaultValue={query.emptyReason}
                name="emptyReason"
                style={selectStyle}
              >
                <option value="">Live data</option>
                <option value="no_data">no_data</option>
                <option value="not_provisioned">not_provisioned</option>
                <option value="fetch_failed">fetch_failed</option>
                <option value="permission_denied">permission_denied</option>
                <option value="external_unavailable">
                  external_unavailable
                </option>
                <option value="filtered_empty">filtered_empty</option>
              </select>
            </div>
            <div style={{ ...formActionStyle, gridColumn: "1 / -1" }}>
              <input name="auditId" type="hidden" value={query.auditId} />
              <button style={buttonPrimaryStyle} type="submit">
                套用篩選
              </button>
              <Link href="/audit" style={linkStyle}>
                清除條件
              </Link>
              <span style={subtleCopyStyle}>
                Receipt deep link 可帶 `auditId` 進來；跨 app
                連結一律新分頁開啟。
              </span>
            </div>
          </form>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="Append-only ledger"
          subtitle="時間優先、request-first correlation，並保留 per-record expand。"
        >
          {focusedLog ? (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${th.accent}`,
                background: th.surfaceLo,
                display: "grid",
                gap: 8,
              }}
            >
              <div style={chipRowStyle}>
                <CanvasPill
                  theme={th}
                  tone={getActorPillTone(focusedLog.actorType)}
                  dot
                >
                  focused record
                </CanvasPill>
                <CanvasPill theme={th} tone="neutral">
                  {focusedLog.auditId}
                </CanvasPill>
              </div>
              <p
                style={{
                  ...emptyStateBodyStyle,
                  maxWidth: "none",
                  textAlign: "left",
                }}
              >
                {formatAuditAt(focusedLog.createdAt)} · {focusedLog.moduleName}{" "}
                / {focusedLog.actionName} · request {focusedLog.requestId}
              </p>
            </div>
          ) : null}
          {emptyCopy ? (
            <div style={emptyStateWrapStyle}>
              <CanvasPill theme={th} tone={emptyCopy.tone}>
                {emptyReason}
              </CanvasPill>
              <h2 style={emptyStateTitleStyle}>{emptyCopy.title}</h2>
              <p style={emptyStateBodyStyle}>{emptyCopy.body}</p>
              {emptyCopy.actionLabel ? (
                <span style={subtleCopyStyle}>{emptyCopy.actionLabel}</span>
              ) : null}
            </div>
          ) : (
            <CanvasTable<AuditRow> theme={th} columns={columns} rows={rows} />
          )}
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="Cross-app navigation"
          subtitle="Tenant-owned resources stay in-app; ops/platform-owned evidence jumps to the owning console."
        >
          <div style={chipRowStyle}>
            <CanvasPill theme={th} tone="accent">
              in-app tenant resources
            </CanvasPill>
            <CanvasPill theme={th} tone="info">
              ops-console new tab
            </CanvasPill>
            <CanvasPill theme={th} tone="warn">
              platform-admin new tab
            </CanvasPill>
          </div>
          <p
            style={{
              ...emptyStateBodyStyle,
              maxWidth: "none",
              textAlign: "left",
            }}
          >
            {loadError
              ? `目前 audit API 讀取失敗：${loadError}`
              : `目前篩選 query: ${buildQueryString(query) || "none"}。Tenant-owned resource 一律留在本 app；ops / platform-owned evidence 走 deep link 新分頁。若後端尚未提供 EmptyStateEnvelope，本頁以錯誤型別與查詢結果退化推導；若要驗證 6 種 distinct states，可用上方 empty state demo 選單切換。`}
          </p>
        </CanvasCard>
      </div>
    </div>
  );
}
