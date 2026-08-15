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
import { getServerLocale } from "@/lib/server-locale";
import { type Locale, t } from "@/lib/translations";

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

type AuditEmptyCopy = {
  tone: "warn" | "danger" | "info" | "neutral";
  title: string;
  body: string;
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

function getActorRealmLabel(
  actorRealm: (typeof ACTOR_REALM_OPTIONS)[number],
  locale: Locale,
) {
  switch (actorRealm) {
    case "tenant":
      return t("audit.actor.tenant", locale);
    case "ops":
      return t("audit.actor.ops", locale);
    case "platform":
      return t("audit.actor.platform", locale);
    case "partner":
      return t("audit.actor.partner", locale);
    case "system":
      return t("audit.actor.system", locale);
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

function formatActorName(log: AuditLogRecord, locale: Locale) {
  if (log.actorId) return log.actorId;
  return log.actorType === "system"
    ? t("audit.actor.systemName", locale)
    : t("audit.actor.masked", locale);
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

function buildResourceLink(
  log: AuditLogRecord,
  locale: Locale,
): CrossAppResourceLink | null {
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
        label: t("audit.link.bookings", locale),
      };
    }
    if (log.resourceType === "invoice") {
      return {
        targetApp: "tenant-console",
        route: "/invoices",
        resourceType: log.resourceType,
        resourceId: id ?? "invoice",
        openMode: "same_tab",
        label: t("audit.link.invoices", locale),
      };
    }
    if (log.resourceType === "cost_center") {
      return {
        targetApp: "tenant-console",
        route: "/cost-centers",
        resourceType: log.resourceType,
        resourceId: id ?? "cost_center",
        openMode: "same_tab",
        label: t("audit.link.costCenters", locale),
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
        label: t("audit.link.users", locale),
      };
    }
    if (log.resourceType === "tenant_passenger") {
      return {
        targetApp: "tenant-console",
        route: "/passengers",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: t("audit.link.passengers", locale),
      };
    }
    if (log.resourceType === "tenant_address") {
      return {
        targetApp: "tenant-console",
        route: "/bookings/new",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: t("audit.link.addresses", locale),
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
        label: t("audit.link.rules", locale),
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
        label: t("audit.link.costCenterQuota", locale),
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
        label: t("audit.link.settings", locale),
      };
    }
    if (log.resourceType === "tenant_api_key") {
      return {
        targetApp: "tenant-console",
        route: "/api-keys",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: t("audit.link.apiKeys", locale),
      };
    }
    if (["webhook_endpoint", "webhook_delivery"].includes(log.resourceType)) {
      return {
        targetApp: "tenant-console",
        route: "/webhooks",
        resourceType: log.resourceType,
        resourceId: tenantResourceId,
        openMode: "same_tab",
        label: t("audit.link.webhooks", locale),
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
        label: t("audit.link.partner", locale),
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
        label: t("audit.link.reportJob", locale),
      };
    }
    return {
      targetApp: "tenant-console",
      route: "/settings",
      resourceType: log.resourceType,
      resourceId: tenantResourceId,
      openMode: "same_tab",
      label: t("audit.link.tenantConsole", locale),
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
      label: t("audit.link.opsConsole", locale),
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
          ? t("audit.link.platformAdminOpen", locale)
          : t("audit.link.platformAdminAudit", locale),
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

function buildAuditRows(logs: AuditLogRecord[], locale: Locale): AuditRow[] {
  return logs.map((log) => {
    const resourceLink = buildResourceLink(log, locale);
    const resourceHref = resourceLink ? resolveHref(resourceLink) : null;
    const masked = isMasked(log);
    const actorRealm = getActorRealm(log.actorType);

    return {
      at: formatAuditAt(log.createdAt),
      actor: (
        <div style={actorCellStyle}>
          <div style={chipRowStyle}>
            <CanvasPill theme={th} tone={getActorPillTone(log.actorType)} dot>
              {getActorRealmLabel(actorRealm, locale)}
            </CanvasPill>
            {masked ? (
              <CanvasPill theme={th} tone="neutral">
                {t("audit.actor.masked", locale)}
              </CanvasPill>
            ) : null}
          </div>
          <strong>{formatActorName(log, locale)}</strong>
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
          <summary style={detailSummaryStyle}>
            {t("audit.detail.expand", locale)}
          </summary>
          <div style={detailBodyStyle}>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>
                {t("audit.detail.audit", locale)}
              </span>
              <span style={{ ...detailValueStyle, fontFamily: th.monoFamily }}>
                {log.auditId}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>
                {t("audit.detail.old", locale)}
              </span>
              <span style={detailValueStyle}>
                {stringifySummary(log.oldValuesSummary)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>
                {t("audit.detail.new", locale)}
              </span>
              <span style={detailValueStyle}>
                {stringifySummary(log.newValuesSummary)}
              </span>
            </div>
            <div style={detailRowStyle}>
              <span style={detailKeyStyle}>
                {t("audit.detail.link", locale)}
              </span>
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
                <span style={detailValueStyle}>
                  {t("audit.detail.noResource", locale)}
                </span>
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

function getActionVisualSpec(action: string, locale: Locale): ActionVisualSpec {
  switch (action) {
    case "filter":
      return {
        label: t("audit.pageAction.filter.label", locale),
        helper: t("audit.pageAction.filter.helper", locale),
      };
    case "refresh":
      return {
        label: t("audit.pageAction.refresh.label", locale),
        helper: t("audit.pageAction.refresh.helper", locale),
      };
    case "export":
      return {
        label: t("audit.pageAction.export.label", locale),
        helper: t("audit.pageAction.export.helper", locale),
      };
    default:
      return {
        label: action,
        helper: t("audit.pageAction.default.helper", locale),
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

function buildCsvHref(logs: AuditLogRecord[], locale: Locale) {
  const header = [
    t("audit.csv.createdAt", locale),
    t("audit.csv.auditId", locale),
    t("audit.csv.actorRealm", locale),
    t("audit.csv.actorType", locale),
    t("audit.csv.actorId", locale),
    t("audit.csv.moduleName", locale),
    t("audit.csv.actionName", locale),
    t("audit.csv.resourceType", locale),
    t("audit.csv.resourceId", locale),
    t("audit.csv.requestId", locale),
  ];
  const rows = logs.map((log) =>
    [
      log.createdAt,
      log.auditId,
      getActorRealm(log.actorType),
      log.actorType,
      log.actorId ?? t("audit.actor.masked", locale),
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

function getEmptyCopy(reason: EmptyReason, locale: Locale): AuditEmptyCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "warn" as const,
        title: t("audit.empty.notProvisioned.title", locale),
        body: t("audit.empty.notProvisioned.body", locale),
      };
    case "permission_denied":
      return {
        tone: "danger" as const,
        title: t("audit.empty.permissionDenied.title", locale),
        body: t("audit.empty.permissionDenied.body", locale),
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        title: t("audit.empty.externalUnavailable.title", locale),
        body: t("audit.empty.externalUnavailable.body", locale),
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        title: t("audit.empty.fetchFailed.title", locale),
        body: t("audit.empty.fetchFailed.body", locale),
      };
    case "filtered_empty":
      return {
        tone: "info" as const,
        title: t("audit.empty.filteredEmpty.title", locale),
        body: t("audit.empty.filteredEmpty.body", locale),
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        title: t("audit.empty.noData.title", locale),
        body: t("audit.empty.noData.body", locale),
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
  const locale = await getServerLocale();
  const query = parseAuditQuery(await searchParams);
  const generatedAt = new Date();
  const client = await getTenantClient();

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
    loadError =
      error instanceof Error ? error.message : t("sla.error.unknown", locale);
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
    ? buildCsvHref(visibleLogs, locale)
    : undefined;
  const rows = buildAuditRows(visibleLogs, locale);
  const moduleOptions = Array.from(
    new Set(logs.map((log) => log.moduleName)),
  ).sort();
  const actionOptions = Array.from(
    new Set(logs.map((log) => log.actionName)),
  ).sort();
  const focusedLog = query.auditId
    ? (logs.find((log) => log.auditId === query.auditId) ?? null)
    : null;
  const emptyCopy = emptyReason ? getEmptyCopy(emptyReason, locale) : null;

  const columns: CanvasTableColumn<AuditRow>[] = [
    { h: t("audit.col.at", locale), k: "at", w: 170, mono: true },
    { h: t("audit.col.actor", locale), k: "actor", w: 280 },
    { h: t("audit.col.module", locale), k: "module", w: 140, mono: true },
    { h: t("audit.col.action", locale), k: "action", w: 190 },
    { h: t("audit.col.resource", locale), k: "resource", w: 220 },
    { h: t("audit.col.request", locale), k: "request", w: 160, mono: true },
    { h: t("audit.col.detail", locale), k: "detail", w: 260 },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("audit.header.title", locale)}
        subtitle={t("audit.header.subtitle", locale)}
        actions={renderActionButton({
          action: actionLookup.get("export"),
          href: exportHref,
          label: t("audit.header.export", locale),
          icon: "export",
          download: "tenant-audit-export.csv",
        })}
      />

      <div style={pageBodyStyle}>
        <div style={heroMetaStyle}>
          <CanvasPill theme={th} tone="neutral" dot>
            {t("audit.meta.refresh", locale)}
          </CanvasPill>
          <CanvasPill theme={th} tone="accent">
            {t("audit.meta.visible", locale, { count: visibleLogs.length })}
          </CanvasPill>
          <CanvasPill theme={th} tone="info">
            {t("audit.meta.scope", locale, { count: logs.length })}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {t("audit.meta.snapshot", locale, {
              time: formatGeneratedAt(
                refreshMetadata?.generatedAt
                  ? new Date(refreshMetadata.generatedAt)
                  : generatedAt,
              ),
            })}
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
            {refreshMetadata?.dataFreshness ?? t("audit.meta.manual", locale)}
          </CanvasPill>
          <CanvasPill theme={th} tone="neutral">
            {t("audit.meta.source", locale, {
              source: refreshMetadata?.source ?? t("audit.meta.live", locale),
            })}
          </CanvasPill>
        </div>

        <CanvasBanner
          theme={th}
          tone="info"
          title={t("audit.banner.visibility.title", locale)}
          body={t("audit.banner.visibility.body", locale)}
        />

        {query.auditId ? (
          <CanvasBanner
            theme={th}
            tone={focusedLog ? "accent" : "warn"}
            title={
              focusedLog
                ? t("audit.banner.receiptHitTitle", locale, {
                    auditId: query.auditId,
                  })
                : t("audit.banner.receiptMissTitle", locale)
            }
            body={
              focusedLog
                ? t("audit.banner.receiptHitBody", locale)
                : t("audit.banner.receiptMissBody", locale)
            }
          />
        ) : null}

        <CanvasCard
          theme={th}
          title={t("audit.filters.title", locale)}
          subtitle={t("audit.filters.subtitle", locale)}
          actions={
            <div style={chipRowStyle}>
              {pageActions.map((action) => {
                const spec = getActionVisualSpec(action.action, locale);
                return (
                  <CanvasPill
                    key={action.action}
                    theme={th}
                    tone={action.enabled ? "accent" : "neutral"}
                  >
                    {spec.label}
                    {action.enabled
                      ? ""
                      : ` · ${action.disabledReasonCode ?? t("audit.filters.disabled", locale)}`}
                  </CanvasPill>
                );
              })}
            </div>
          }
        >
          <form action="/audit" method="get" style={filterGridStyle}>
            <CanvasField
              theme={th}
              label={t("audit.filters.actorLabel", locale)}
            >
              <select
                defaultValue={query.actor}
                name="actor"
                style={inputStyle}
              >
                <option value="">{t("audit.filters.actorAll", locale)}</option>
                {ACTOR_REALM_OPTIONS.map((actor) => (
                  <option key={actor} value={actor}>
                    {getActorRealmLabel(actor, locale)}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField
              theme={th}
              label={t("audit.filters.moduleLabel", locale)}
            >
              <select
                defaultValue={query.module}
                name="module"
                style={inputStyle}
              >
                <option value="">{t("audit.filters.moduleAll", locale)}</option>
                {moduleOptions.map((moduleName) => (
                  <option key={moduleName} value={moduleName}>
                    {moduleName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField
              theme={th}
              label={t("audit.filters.actionLabel", locale)}
            >
              <select
                defaultValue={query.action}
                name="action"
                style={inputStyle}
              >
                <option value="">{t("audit.filters.actionAll", locale)}</option>
                {actionOptions.map((actionName) => (
                  <option key={actionName} value={actionName}>
                    {actionName}
                  </option>
                ))}
              </select>
            </CanvasField>
            <CanvasField
              theme={th}
              label={t("audit.filters.fromLabel", locale)}
            >
              <input
                defaultValue={query.from}
                name="from"
                style={inputStyle}
                type="date"
              />
            </CanvasField>
            <CanvasField theme={th} label={t("audit.filters.toLabel", locale)}>
              <input
                defaultValue={query.to}
                name="to"
                style={inputStyle}
                type="date"
              />
            </CanvasField>
            <CanvasField
              theme={th}
              label={t("audit.filters.auditIdLabel", locale)}
              hint={t("audit.filters.auditIdHint", locale)}
            >
              <input
                defaultValue={query.auditId}
                name="auditId"
                placeholder={t("audit.filters.auditIdPlaceholder", locale)}
                style={inputStyle}
                type="text"
              />
            </CanvasField>
            <CanvasField
              theme={th}
              label={t("audit.filters.emptyReasonLabel", locale)}
              hint={t("audit.filters.emptyReasonHint", locale)}
            >
              <select
                defaultValue={query.emptyReason}
                name="emptyReason"
                style={inputStyle}
              >
                <option value="">
                  {t("audit.filters.emptyReason.live", locale)}
                </option>
                <option value="no_data">
                  {t("audit.filters.emptyReason.noData", locale)}
                </option>
                <option value="not_provisioned">
                  {t("audit.filters.emptyReason.notProvisioned", locale)}
                </option>
                <option value="fetch_failed">
                  {t("audit.filters.emptyReason.fetchFailed", locale)}
                </option>
                <option value="permission_denied">
                  {t("audit.filters.emptyReason.permissionDenied", locale)}
                </option>
                <option value="external_unavailable">
                  {t("audit.filters.emptyReason.externalUnavailable", locale)}
                </option>
                <option value="filtered_empty">
                  {t("audit.filters.emptyReason.filteredEmpty", locale)}
                </option>
              </select>
            </CanvasField>

            <div style={{ ...formActionStyle, gridColumn: "1 / -1" }}>
              <CanvasBtn theme={th} variant="primary" size="sm" type="submit">
                {t("audit.filters.apply", locale)}
              </CanvasBtn>
              {renderActionButton({
                action: actionLookup.get("refresh"),
                href: `/audit${buildQueryString(query)}`,
                label: t("audit.filters.refresh", locale),
                icon: "refresh",
                download: undefined,
              })}
              {renderActionButton({
                action: actionLookup.get("export"),
                href: exportHref,
                label: t("audit.filters.export", locale),
                icon: "export",
                download: "tenant-audit-export.csv",
              })}
              <Link href="/audit" style={linkStyle}>
                {t("audit.filters.clear", locale)}
              </Link>
            </div>

            <div style={{ ...formFootnoteStyle, gridColumn: "1 / -1" }}>
              {loadError
                ? `${t("audit.filters.loadErrorPrefix", locale)}：${loadError}`
                : t("audit.filters.footnote", locale)}
            </div>
          </form>
        </CanvasCard>

        <CanvasCard
          theme={th}
          title={t("audit.ledger.title", locale)}
          subtitle={t("audit.ledger.subtitle", locale)}
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
