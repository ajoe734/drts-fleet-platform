import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  ApiListData,
  AuditLogRecord,
  CrossAppResourceLink,
  EmptyReason,
  ResourceActionDescriptor,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
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

const heroMetaStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const formActionStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const formFootnoteStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  color: th.text,
  fontFamily: th.fontFamily,
  fontSize: 12.5,
  padding: "7px 10px",
};

const emptyStateWrapStyle: CSSProperties = {
  padding: "28px 20px",
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
  maxWidth: 720,
  fontSize: 12.5,
  lineHeight: 1.6,
  color: th.textMuted,
};

const actorCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  minWidth: 0,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  alignItems: "center",
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

const detailSummaryStyle: CSSProperties = {
  cursor: "pointer",
  color: th.accent,
  fontSize: 11.5,
  fontWeight: 600,
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
  at: string;
  actor: ReactNode;
  module: string;
  action: ReactNode;
  resource: ReactNode;
  request: string;
  detail: ReactNode;
};

type ActionVisualSpec = {
  label: string;
  helper: string;
};

type TenantAuditListLike = ApiListData<AuditLogRecord> & {
  availableActions?: ResourceActionDescriptor[];
  refreshMetadata?: UiRefreshMetadata;
  refresh?: UiRefreshMetadata;
};

const ACTOR_REALM_OPTIONS = [
  "tenant",
  "ops",
  "platform",
  "partner",
  "system",
] as const;

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

function normalizeAuditListResponse(
  input: AuditLogRecord[] | TenantAuditListLike,
): {
  items: AuditLogRecord[];
  availableActions: ResourceActionDescriptor[];
  refreshMetadata: UiRefreshMetadata | null;
} {
  if (Array.isArray(input)) {
    return {
      items: input,
      availableActions: [],
      refreshMetadata: null,
    };
  }

  return {
    items: input.items ?? [],
    availableActions: input.availableActions ?? [],
    refreshMetadata: input.refreshMetadata ?? input.refresh ?? null,
  };
}

function getActorRealm(
  actorType: AuditLogRecord["actorType"],
): (typeof ACTOR_REALM_OPTIONS)[number] {
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

function formatActorName(log: AuditLogRecord) {
  if (log.actorId) return log.actorId;
  return log.actorType === "system" ? "system" : "masked";
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
    "tenant_cost_center",
    "tenant_cost_center_coverage_report",
    "tenant_quota_ledger",
    "tenant_quota_policy",
    "tenant_quota_snapshot",
    "tenant_user",
    "tenant_role",
    "tenant_user_role",
    "tenant_passenger",
    "tenant_address",
    "tenant_approval_rule",
    "tenant_approval_rule_set",
    "tenant_approval_request",
    "tenant_settings",
    "tenant_profile",
    "tenant_notifications",
    "tenant_sla",
    "tenant_api_key",
    "webhook_endpoint",
    "webhook_delivery",
    "partner_entry",
    "partner_eligibility",
    "partner_ingress_credential",
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
    const tenantResourceId = id ?? log.requestId ?? log.auditId;

    if (log.resourceType === "booking" || log.resourceType === "owned_order") {
      const bookingId = id ?? log.requestId;
      return {
        targetApp: "tenant-console",
        route: bookingId
          ? `/bookings/${encodeURIComponent(bookingId)}`
          : "/bookings",
        resourceType: log.resourceType,
        resourceId: bookingId,
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
        label: "查看發票",
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
      log.resourceType === "tenant_role" ||
      log.resourceType === "tenant_user_role"
    ) {
      return {
        targetApp: "tenant-console",
        route: "/users",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看使用者與角色",
      };
    }
    if (log.resourceType === "tenant_passenger") {
      return {
        targetApp: "tenant-console",
        route: "/passengers",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看乘客名錄",
      };
    }
    if (log.resourceType === "tenant_address") {
      return {
        targetApp: "tenant-console",
        route: "/bookings/new",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "在 Tenant Console 檢視地址脈絡",
      };
    }
    if (
      [
        "tenant_approval_rule",
        "tenant_approval_rule_set",
        "tenant_approval_request",
      ].includes(log.resourceType)
    ) {
      return {
        targetApp: "tenant-console",
        route: "/rules",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看審批規則與請求",
      };
    }
    if (
      [
        "cost_center",
        "tenant_cost_center",
        "tenant_cost_center_coverage_report",
        "tenant_quota_ledger",
        "tenant_quota_policy",
        "tenant_quota_snapshot",
      ].includes(log.resourceType)
    ) {
      return {
        targetApp: "tenant-console",
        route: "/cost-centers",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看成本中心與額度",
      };
    }
    if (
      [
        "tenant_settings",
        "tenant_profile",
        "tenant_notifications",
        "tenant_sla",
      ].includes(log.resourceType)
    ) {
      return {
        targetApp: "tenant-console",
        route: "/settings",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看租戶設定",
      };
    }
    if (log.resourceType === "tenant_api_key") {
      return {
        targetApp: "tenant-console",
        route: "/api-keys",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看 API 金鑰",
      };
    }
    if (["webhook_endpoint", "webhook_delivery"].includes(log.resourceType)) {
      return {
        targetApp: "tenant-console",
        route: "/webhooks",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看 Webhook 狀態",
      };
    }
    if (
      [
        "partner_entry",
        "partner_eligibility",
        "partner_ingress_credential",
      ].includes(log.resourceType)
    ) {
      return {
        targetApp: "tenant-console",
        route: "/partner",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看 Partner Booking 設定",
      };
    }
    if (log.resourceType === "report_job") {
      return {
        targetApp: "tenant-console",
        route: tenantResourceId
          ? `/reports?jobId=${encodeURIComponent(tenantResourceId)}#job-detail`
          : "/reports",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: "查看報表工作明細",
      };
    }
    return {
      targetApp: "tenant-console",
      route: "/settings",
      resourceType: log.resourceType,
      resourceId: tenantResourceId,
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
  if (link.targetApp === "tenant-console") return link.route;
  const base =
    link.targetApp === "ops-console" ? OPS_CONSOLE_URL : PLATFORM_ADMIN_URL;
  return `${base}${link.route}`;
}

function matchesDateRange(log: AuditLogRecord, query: AuditQuery) {
  const createdAtMs = Date.parse(log.createdAt);
  if (Number.isNaN(createdAtMs)) return false;

  if (query.from) {
    const fromMs = Date.parse(`${query.from}T00:00:00Z`);
    if (!Number.isNaN(fromMs) && createdAtMs < fromMs) return false;
  }

  if (query.to) {
    const toMs = Date.parse(`${query.to}T23:59:59.999Z`);
    if (!Number.isNaN(toMs) && createdAtMs > toMs) return false;
  }

  return true;
}

function filterLogs(logs: AuditLogRecord[], query: AuditQuery) {
  return logs.filter((log) => {
    if (query.auditId && log.auditId !== query.auditId) return false;
    if (query.actor && getActorRealm(log.actorType) !== query.actor) {
      return false;
    }
    if (query.module && log.moduleName !== query.module) return false;
    if (query.action && log.actionName !== query.action) return false;
    return matchesDateRange(log, query);
  });
}

function buildAuditRows(logs: AuditLogRecord[]): AuditRow[] {
  return logs.map((log) => {
    const resourceLink = buildResourceLink(log);
    const resourceHref = resourceLink ? resolveHref(resourceLink) : null;
    const masked = isMasked(log);

    return {
      at: formatAuditAt(log.createdAt),
      actor: (
        <div style={actorCellStyle}>
          <div style={chipRowStyle}>
            <CanvasPill theme={th} tone={getActorPillTone(log.actorType)} dot>
              {getActorRealm(log.actorType)}
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
        <details>
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

function getActionVisualSpec(action: string): ActionVisualSpec {
  switch (action) {
    case "filter":
      return {
        label: "Filter",
        helper: "依 actor、module、action、時間範圍收斂結果。",
      };
    case "refresh":
      return {
        label: "Refresh",
        helper: "T6 manual tier，不做自動輪詢。",
      };
    case "export":
      return {
        label: "Export",
        helper: "匯出目前篩選結果，對應 signed artifact workflow。",
      };
    default:
      return {
        label: action,
        helper: "由 availableActions 決定是否顯示或禁用。",
      };
  }
}

function getPageActions(input: {
  hasRows: boolean;
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
      ...(input.hasRows ? {} : { disabledReasonCode: "no_matching_rows" }),
      riskLevel: "low",
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
  if (input.override) return input.override;
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
  if (input.filteredCount > 0) return null;
  if (input.hasFilter && input.allCount > 0) return "filtered_empty";
  return "no_data";
}

function getEmptyCopy(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn" as const,
        title: "租戶尚未啟用稽核檢視",
        body: "此租戶的 evidence lane 尚未 provision 完成。等治理設定完成後，tenant admin 與 finance 才會看到 append-only audit ledger。",
      };
    case "permission_denied":
      return {
        tone: "danger" as const,
        title: "目前身分沒有 audit read 權限",
        body: "此頁只對具備 tenant-scoped audit visibility 的角色開放。若這不是預期行為，請由 tenant admin 檢查角色與範圍設定。",
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        title: "外部 evidence 來源暫時不可用",
        body: "目前顯示通道未能取得完整 cross-actor evidence。這種情況不會假裝成空資料；待上游恢復後請手動 refresh。",
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        title: "稽核資料讀取失敗",
        body: "後端回應失敗，因此頁面沒有用假資料填補。請稍後重整，或確認 API 與 auth bootstrap 是否正常。",
      };
    case "filtered_empty":
      return {
        tone: "info" as const,
        title: "目前篩選條件沒有命中紀錄",
        body: "Cross-actor audit 仍存在，但此組 actor、module、action、時間條件下沒有相符列。清除篩選即可回到完整 tenant scope。",
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        title: "目前沒有任何稽核紀錄",
        body: "此租戶尚未產生可見的 state-changing evidence。等第一筆 tenant、ops、platform 或 system 動作落地後，這裡會顯示 append-only ledger。",
      };
  }
}

function renderActionButton(input: {
  action: ResourceActionDescriptor | undefined;
  href: string | undefined;
  label: string;
  icon: string | undefined;
  download: string | undefined;
}) {
  if (!input.action?.enabled || !input.href) {
    return (
      <span
        aria-disabled="true"
        style={{ opacity: 0.55 }}
        title={input.action?.disabledReasonCode}
      >
        <CanvasBtn theme={th} icon={input.icon} size="sm">
          {input.label}
        </CanvasBtn>
      </span>
    );
  }

  if (input.download) {
    return (
      <a
        download={input.download}
        href={input.href}
        style={{ textDecoration: "none" }}
      >
        <CanvasBtn theme={th} icon={input.icon} size="sm">
          {input.label}
        </CanvasBtn>
      </a>
    );
  }

  return (
    <Link href={input.href} style={{ textDecoration: "none" }}>
      <CanvasBtn theme={th} icon={input.icon} size="sm">
        {input.label}
      </CanvasBtn>
    </Link>
  );
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
  let serverActions: ResourceActionDescriptor[] = [];
  let refreshMetadata: UiRefreshMetadata | null = null;

  try {
    const auditResponse = normalizeAuditListResponse(
      await client.listTenantAuditLogs(),
    );

    logs = auditResponse.items
      .slice()
      .sort(
        (left, right) =>
          Date.parse(right.createdAt) - Date.parse(left.createdAt),
      );
    serverActions = auditResponse.availableActions;
    refreshMetadata = auditResponse.refreshMetadata;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "unknown error";
  }

  const filteredLogs = loadError ? [] : filterLogs(logs, query);
  const hasFilter = Boolean(
    query.actor ||
    query.module ||
    query.action ||
    query.from ||
    query.to ||
    query.auditId,
  );
  const emptyReason = deriveEmptyReason({
    override: query.emptyReason,
    loadError,
    allCount: logs.length,
    filteredCount: filteredLogs.length,
    hasFilter,
  });
  const visibleLogs = emptyReason ? [] : filteredLogs;
  const pageActions =
    serverActions.length > 0
      ? serverActions
      : getPageActions({ hasRows: visibleLogs.length > 0 });
  const actionLookup = new Map(
    pageActions.map((action) => [action.action, action] as const),
  );
  const exportHref = actionLookup.get("export")?.enabled
    ? buildCsvHref(visibleLogs)
    : undefined;
  const rows = buildAuditRows(visibleLogs);
  const moduleOptions = Array.from(
    new Set(logs.map((log) => log.moduleName)),
  ).sort();
  const actionOptions = Array.from(
    new Set(logs.map((log) => log.actionName)),
  ).sort();
  const focusedLog = query.auditId
    ? (logs.find((log) => log.auditId === query.auditId) ?? null)
    : null;
  const emptyCopy = emptyReason ? getEmptyCopy(emptyReason) : null;

  const columns: CanvasTableColumn<AuditRow>[] = [
    { h: "WHEN", k: "at", w: 170, mono: true },
    { h: "ACTOR", k: "actor", w: 280 },
    { h: "MODULE", k: "module", w: 140, mono: true },
    { h: "ACTION", k: "action", w: 190 },
    { h: "RESOURCE", k: "resource", w: 220 },
    { h: "REQUEST", k: "request", w: 160, mono: true },
    { h: "DETAIL", k: "detail", w: 260 },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核 · cross-actor"
        subtitle="不可變 · 7 年保存 · 含所有 actor realm 對 tenant 資源的動作 (Q-TEN13)"
        actions={renderActionButton({
          action: actionLookup.get("export"),
          href: exportHref,
          label: "匯出 (簽名 artifact)",
          icon: "export",
          download: "tenant-audit-export.csv",
        })}
      />

      <div style={pageBodyStyle}>
        <div style={heroMetaStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            T6 manual refresh
          </CanvasPill>
          <CanvasPill theme={th} tone="accent">
            visible {visibleLogs.length}
          </CanvasPill>
          <CanvasPill theme={th} tone="info">
            tenant scope {logs.length}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            snapshot{" "}
            {formatGeneratedAt(
              refreshMetadata?.generatedAt
                ? new Date(refreshMetadata.generatedAt)
                : generatedAt,
            )}
          </CanvasPill>
          <CanvasPill
            theme={th}
            tone={
              refreshMetadata?.dataFreshness === "degraded"
                ? "warn"
                : refreshMetadata?.dataFreshness === "stale"
                  ? "danger"
                  : "neutral"
            }
          >
            {refreshMetadata?.dataFreshness ?? "manual"}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            source {refreshMetadata?.source ?? "live"}
          </CanvasPill>
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
                ? "此頁已接住 action receipt 的 auditId，並將 ledger 聚焦到該筆紀錄。"
                : "目前 tenant scope 內找不到這筆 auditId；可能不屬於此租戶、資料尚未同步，或 receipt 指向錯誤。"
            }
          />
        ) : null}

        <CanvasCard
          theme={th}
          title="篩選"
          subtitle="依 actor、module、action、time range 調查 tenant-owned evidence。"
          actions={
            <div style={chipRowStyle}>
              {pageActions.map((action) => {
                const spec = getActionVisualSpec(action.action);
                return (
                  <CanvasPill
                    key={action.action}
                    theme={th}
                    tone={action.enabled ? "accent" : "neutral"}
                  >
                    {spec.label}
                    {action.enabled
                      ? ""
                      : ` · ${action.disabledReasonCode ?? "disabled"}`}
                  </CanvasPill>
                );
              })}
            </div>
          }
        >
          <form action="/audit" method="get" style={filterGridStyle}>
            <CanvasField theme={th} label="Actor realm">
              <select
                defaultValue={query.actor}
                name="actor"
                style={inputStyle}
              >
                <option value="">All actor realms</option>
                {ACTOR_REALM_OPTIONS.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label="Module">
              <select
                defaultValue={query.module}
                name="module"
                style={inputStyle}
              >
                <option value="">All modules</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label="Action">
              <select
                defaultValue={query.action}
                name="action"
                style={inputStyle}
              >
                <option value="">All actions</option>
                {actionOptions.map((actionName) => (
                  <option key={actionName} value={actionName}>
                    {actionName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField theme={th} label="From">
              <input
                defaultValue={query.from}
                name="from"
                style={inputStyle}
                type="date"
              />
            </CanvasField>
            <CanvasField theme={th} label="To">
              <input
                defaultValue={query.to}
                name="to"
                style={inputStyle}
                type="date"
              />
            </CanvasField>
            <CanvasField
              theme={th}
              label="Audit receipt"
              hint="支援 action receipt deep link。"
            >
              <input
                defaultValue={query.auditId}
                name="auditId"
                placeholder="audit_..."
                style={inputStyle}
                type="text"
              />
            </CanvasField>
            <CanvasField
              theme={th}
              label="Empty state demo"
              hint="驗證 6 種 distinct states。"
            >
              <select
                defaultValue={query.emptyReason}
                name="emptyReason"
                style={inputStyle}
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
            </CanvasField>

            <div style={{ ...formActionStyle, gridColumn: "1 / -1" }}>
              <button type="submit" style={{ all: "unset" }}>
                <CanvasBtn theme={th} variant="primary" size="sm">
                  套用篩選
                </CanvasBtn>
              </button>
              {renderActionButton({
                action: actionLookup.get("refresh"),
                href: `/audit${buildQueryString(query)}`,
                label: "手動刷新",
                icon: "refresh",
                download: undefined,
              })}
              {renderActionButton({
                action: actionLookup.get("export"),
                href: exportHref,
                label: "匯出篩選結果",
                icon: "export",
                download: "tenant-audit-export.csv",
              })}
              <Link href="/audit" style={linkStyle}>
                清除條件
              </Link>
            </div>

            <div style={{ ...formFootnoteStyle, gridColumn: "1 / -1" }}>
              {loadError
                ? `目前 audit API 讀取失敗：${loadError}`
                : "Tenant-owned resource 留在本 app；ops / platform-owned evidence 走 deep link 新分頁。manual tier 不會自動輪詢。"}
            </div>
          </form>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title="Append-only ledger"
          subtitle="時間優先、request-first correlation，並保留 per-record expand 與跨 app deep links。"
          padding={0}
        >
          {emptyCopy ? (
            <div style={emptyStateWrapStyle}>
              <CanvasPill theme={th} tone={emptyCopy.tone}>
                {emptyReason}
              </CanvasPill>
              <h2 style={emptyStateTitleStyle}>{emptyCopy.title}</h2>
              <p style={emptyStateBodyStyle}>{emptyCopy.body}</p>
            </div>
          ) : (
            <CanvasTable<AuditRow> theme={th} columns={columns} rows={rows} />
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
