import type { CSSProperties } from "react";
import type {
  AuditLogRecord,
  ControlledDownloadRecord,
  EmptyReason,
  ExportTenantAuditCommand,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasCard,
  CanvasDL,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
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
  display: "grid",
  gap: 16,
};

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 0.85fr)",
  gap: 16,
  alignItems: "start",
};

const mainLaneStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const sideLaneStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const fieldStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const inputStyle: CSSProperties = {
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

const monoInputStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const controlRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

const linkButtonBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 28,
  padding: "6px 11px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  textDecoration: "none",
  fontFamily: th.fontFamily,
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
};

const summaryCellStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: th.surfaceLo,
  border: `1px solid ${th.border}`,
  display: "grid",
  gap: 4,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 10.5,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
  fontWeight: 600,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: th.text,
};

const summarySubStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  lineHeight: 1.45,
};

const stackedCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const primaryTextStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const secondaryTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const monoTextStyle: CSSProperties = {
  color: th.text,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
};

const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
};

const detailCodeStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 10,
  background: th.bg,
  border: `1px solid ${th.border}`,
  color: th.text,
  fontFamily: th.monoFamily,
  fontSize: 11.5,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  overflowX: "auto",
};

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 10,
};

const listItemStyle: CSSProperties = {
  paddingBottom: 10,
  borderBottom: `1px solid ${th.border}`,
  display: "grid",
  gap: 4,
};

const emptyStateStyle: CSSProperties = {
  padding: "24px 20px",
  display: "grid",
  gap: 12,
  alignItems: "start",
};

const emptyReasonPreviewStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const tableCardStyle: CSSProperties = {
  overflow: "hidden",
};

const actorToneByScope = {
  tenant: "accent",
  ops: "info",
  platform: "warn",
  system: "neutral",
  partner: "success",
} satisfies Record<string, CanvasTone>;

const pageActionCatalog = [
  { action: "filter", enabled: true, riskLevel: "low" },
  { action: "refresh", enabled: true, riskLevel: "low" },
  { action: "export", enabled: true, riskLevel: "low" },
] satisfies ResourceActionDescriptor[];

const auditDateFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "medium",
});

const dayFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "medium",
});

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

type ResourceLink = {
  href: string;
  label: string;
  external: boolean;
  appLabel: string;
};

type AuditViewModel = {
  record: AuditLogRecord;
  actorScope: keyof typeof actorToneByScope;
  createdAtLabel: string;
  actorLabel: string;
  actorSubLabel: string;
  masked: boolean;
  resourceLabel: string;
  resourceLink: ResourceLink;
  requestAuditLink: string;
  oldSummary: string;
  newSummary: string;
};

type AuditTableRow = AuditViewModel &
  Record<string, unknown> & {
    _selected: boolean;
  };

type EmptyStateSpec = {
  title: string;
  body: string;
  tone: CanvasTone;
  actions: Array<{ href: string; label: string }>;
};

type ExportState = {
  download: ControlledDownloadRecord | null;
  error: string | null;
  rowCount: number;
};

function getSingleParam(searchParams: SearchParamsInput, key: string): string {
  const value = searchParams[key];
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
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

function buildAuditHref(overrides: Partial<FilterState>) {
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
  const params = new URLSearchParams();

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

function formatAuditAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : auditDateFormatter.format(parsed);
}

function formatDay(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dayFormatter.format(parsed);
}

function formatArtifactAt(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : auditDateFormatter.format(parsed);
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
  return `${(name ?? "").slice(0, 2) || "••"}•••@${domain}`;
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
    : record.actorType;
}

function isLikelyMaskedActor(record: AuditLogRecord) {
  if (!record.actorId) {
    return record.actorType !== "system";
  }
  return record.actorId.includes("@");
}

function formatResource(record: AuditLogRecord) {
  if (!record.resourceId) return record.resourceType || "—";
  return `${record.resourceType} · ${record.resourceId}`;
}

function buildBaseUrl(base: string, route: string) {
  return `${base.replace(/\/$/, "")}${route}`;
}

function buildRequestAuditLink(filters: FilterState, auditId: string) {
  return `${buildAuditHref({ ...filters, auditId, expanded: auditId, empty: "" })}#audit-detail`;
}

function buildResourceLink(record: AuditLogRecord): ResourceLink {
  const auditRoute = `/audit?auditId=${encodeURIComponent(record.auditId)}`;

  switch (record.resourceType) {
    case "booking":
    case "owned_order":
      return {
        href: record.resourceId
          ? `/bookings/${encodeURIComponent(record.resourceId)}`
          : auditRoute,
        label: "查看叫車詳情",
        external: false,
        appLabel: "Tenant Console",
      };
    case "invoice":
      return {
        href: "/invoices",
        label: "查看對帳單",
        external: false,
        appLabel: "Tenant Console",
      };
    case "report_job":
      return {
        href: "/reports",
        label: "查看報表工作",
        external: false,
        appLabel: "Tenant Console",
      };
    case "tenant_settings":
      return {
        href: "/settings",
        label: "查看租戶設定",
        external: false,
        appLabel: "Tenant Console",
      };
    case "tenant_user":
      return {
        href: "/users",
        label: "查看人員與角色",
        external: false,
        appLabel: "Tenant Console",
      };
    case "cost_center":
      return {
        href: "/cost-centers",
        label: "查看成本中心",
        external: false,
        appLabel: "Tenant Console",
      };
    default:
      break;
  }

  if (record.actorType === "ops_user") {
    return {
      href: buildBaseUrl(OPS_CONSOLE_URL, auditRoute),
      label: "在 Ops Console 開啟",
      external: true,
      appLabel: "Ops Console",
    };
  }

  if (record.actorType === "platform_admin") {
    return {
      href: buildBaseUrl(PLATFORM_ADMIN_URL, auditRoute),
      label: "在 Platform Admin 開啟",
      external: true,
      appLabel: "Platform Admin",
    };
  }

  return {
    href: auditRoute,
    label: "固定連結此稽核列",
    external: false,
    appLabel: "Tenant Console",
  };
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
    if (
      filters.auditId &&
      !record.auditId.includes(filters.auditId) &&
      !record.requestId.includes(filters.auditId)
    ) {
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
    actorScope,
    createdAtLabel: formatAuditAt(record.createdAt),
    actorLabel: formatActorPrimary(record),
    actorSubLabel: formatActorSecondary(record),
    masked: isLikelyMaskedActor(record),
    resourceLabel: formatResource(record),
    resourceLink: buildResourceLink(record),
    requestAuditLink: buildRequestAuditLink(filters, record.auditId),
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

function buildEmptyState(reason: EmptyReason): EmptyStateSpec {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "稽核治理尚未完成 provisioning",
        body: "列表可讀，但簽章匯出與治理附件尚未在此租戶啟用，需先完成設定與治理接線。",
        tone: "warn",
        actions: [
          { href: "/settings", label: "查看租戶設定" },
          { href: "/audit", label: "回到稽核" },
        ],
      };
    case "permission_denied":
      return {
        title: "目前角色無法讀取稽核資料",
        body: "此畫面僅對具 audit read 權限的租戶角色開放，請由 `tc_admin` 或 `tc_finance` 協助。",
        tone: "danger",
        actions: [{ href: "/users", label: "查看角色配置" }],
      };
    case "external_unavailable":
      return {
        title: "上游稽核服務暫時不可用",
        body: `Tenant snapshot 無法自 ${API_URL} 取得最新資料。此頁 refresh tier 為 T6，只支援手動重新整理。`,
        tone: "warn",
        actions: [{ href: "/audit", label: "重新整理" }],
      };
    case "fetch_failed":
      return {
        title: "稽核資料讀取失敗",
        body: "保留目前篩選條件後重試；若持續失敗，請帶著 request correlation 聯絡平台支援。",
        tone: "danger",
        actions: [{ href: "/audit", label: "重新整理" }],
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有命中任何稽核列",
        body: "可放寬 actor、module、action 或時間範圍，或直接清除所有篩選後重新檢視。",
        tone: "info",
        actions: [
          { href: "/audit", label: "清除篩選" },
          { href: buildAuditHref({ empty: "" }), label: "退出空態預覽" },
        ],
      };
    case "no_data":
    default:
      return {
        title: "目前沒有可顯示的稽核列",
        body: "此租戶尚未產生任何 state-changing action，或 audit snapshot 仍在初始化中。",
        tone: "neutral",
        actions: [
          { href: "/bookings/new", label: "建立第一筆叫車" },
          { href: "/audit", label: "重新整理" },
        ],
      };
  }
}

function resolvePageActions(rowCount: number) {
  return pageActionCatalog.map((action) => {
    if (action.action !== "export") {
      return action;
    }
    return rowCount > 0
      ? action
      : {
          ...action,
          enabled: false,
          disabledReasonCode: "No visible audit rows to export",
        };
  });
}

function renderActionLink(
  action: ResourceActionDescriptor,
  href: string,
  label: string,
) {
  const style: CSSProperties =
    action.action === "refresh"
      ? {
          ...linkButtonBaseStyle,
          background: th.accent,
          borderColor: th.accent,
          color: "#fff",
        }
      : action.action === "export"
        ? {
            ...linkButtonBaseStyle,
            background: "transparent",
            color: th.textMuted,
          }
        : {
            ...linkButtonBaseStyle,
            background: th.surface,
            color: th.text,
          };

  return (
    <a
      href={action.enabled ? href : undefined}
      style={{
        ...style,
        ...(action.enabled
          ? null
          : { opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }),
      }}
      title={!action.enabled ? action.disabledReasonCode : undefined}
    >
      {label}
    </a>
  );
}

function buildTableColumns(
  filters: FilterState,
): CanvasTableColumn<AuditTableRow>[] {
  return [
    {
      h: "AT",
      w: 150,
      mono: true,
      r: (row) => row.createdAtLabel,
    },
    {
      h: "ACTOR",
      w: 220,
      r: (row) => (
        <div style={stackedCellStyle}>
          <span style={primaryTextStyle}>{row.actorLabel}</span>
          <span style={secondaryTextStyle}>{row.actorSubLabel}</span>
          {row.masked ? (
            <span style={secondaryTextStyle}>masked sensitive identity</span>
          ) : null}
        </div>
      ),
    },
    {
      h: "SCOPE",
      w: 108,
      r: (row) => (
        <CanvasPill theme={th} tone={actorToneByScope[row.actorScope]} dot>
          {actorScopeLabel(row.actorScope)}
        </CanvasPill>
      ),
    },
    {
      h: "MODULE / ACTION",
      w: 210,
      r: (row) => (
        <div style={stackedCellStyle}>
          <span style={monoTextStyle}>{row.record.moduleName}</span>
          <span style={secondaryTextStyle}>{row.record.actionName}</span>
        </div>
      ),
    },
    {
      h: "RESOURCE",
      w: 230,
      r: (row) => (
        <div style={stackedCellStyle}>
          <span>{row.resourceLabel}</span>
          <span style={secondaryTextStyle}>{row.resourceLink.appLabel}</span>
        </div>
      ),
    },
    {
      h: "REQUEST",
      w: 170,
      mono: true,
      r: (row) => row.record.requestId || "—",
    },
    {
      h: "DETAIL",
      w: 116,
      r: (row) => (
        <a
          href={`${buildAuditHref({ ...filters, expanded: row.record.auditId, empty: "" })}#audit-detail`}
          style={inlineLinkStyle}
        >
          {row._selected ? "已展開" : "查看細節"}
        </a>
      ),
    },
  ];
}

async function loadAuditLogs() {
  const client = getTenantClient();
  const logs = (await client.listTenantAuditLogs()) as AuditLogRecord[];
  return [...logs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function normalizeExportScope(
  value: string,
): NonNullable<ExportTenantAuditCommand["actorScope"]> | null {
  switch (value) {
    case "tenant":
    case "ops":
    case "platform":
    case "system":
    case "partner":
      return value;
    default:
      return null;
  }
}

function buildExportCommand(filters: FilterState): ExportTenantAuditCommand {
  return {
    actorScope: normalizeExportScope(filters.actor),
    moduleName: filters.module || null,
    actionName: filters.action || null,
    from: filters.from || null,
    to: filters.to || null,
    auditId: filters.auditId || null,
  } as ExportTenantAuditCommand;
}

async function loadAuditExport(filters: FilterState): Promise<ExportState> {
  try {
    const client = getTenantClient();
    const download = (await client.exportTenantAudit(
      buildExportCommand(filters),
    )) as ControlledDownloadRecord;
    return { download, error: null, rowCount: 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { download: null, error: message, rowCount: 0 };
  }
}

function buildExportState(
  rowCount: number,
  download: ControlledDownloadRecord | null,
  error: string | null,
): ExportState {
  return {
    download,
    error,
    rowCount,
  };
}

function shortenManifestHash(value: string | null | undefined) {
  if (!value) return "—";
  if (value.length <= 24) return value;
  return `${value.slice(0, 16)}…${value.slice(-8)}`;
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
  const focusedAuditId =
    filters.expanded || filters.auditId || rows[0]?.record.auditId || "";
  const focusedRow =
    rows.find((row) => row.record.auditId === focusedAuditId) ??
    rows[0] ??
    null;
  const tableRows: AuditTableRow[] = rows.map((row) => ({
    ...row,
    _selected: row.record.auditId === focusedRow?.record.auditId,
  }));

  const actorOptions = Array.from(
    new Set(records.map((record) => normalizeActorScope(record.actorType))),
  );
  const moduleOptions = Array.from(
    new Set(records.map((record) => record.moduleName)),
  ).sort((left, right) => left.localeCompare(right, "en"));
  const actionOptions = Array.from(
    new Set(records.map((record) => record.actionName)),
  ).sort((left, right) => left.localeCompare(right, "en"));
  const visibleActorScopes = Array.from(
    new Set(
      filteredRecords.map((record) => normalizeActorScope(record.actorType)),
    ),
  );
  const moduleCount = new Set(
    filteredRecords.map((record) => record.moduleName),
  ).size;
  const maskedActorCount = rows.filter((row) => row.masked).length;
  const requestLinkedCount = filteredRecords.filter((record) =>
    Boolean(record.requestId),
  ).length;
  const exportCount = rows.length;
  const availableActions = resolvePageActions(exportCount);
  const filterAction = availableActions.find(
    (action) => action.action === "filter",
  )!;
  const refreshAction = availableActions.find(
    (action) => action.action === "refresh",
  )!;
  const exportAction = availableActions.find(
    (action) => action.action === "export",
  )!;
  const emptyReason =
    filters.empty ||
    errorReason ||
    (filteredRecords.length === 0
      ? records.length > 0
        ? "filtered_empty"
        : "no_data"
      : null);
  const emptyState = emptyReason ? buildEmptyState(emptyReason) : null;
  const exportLoadState =
    exportAction.enabled && !emptyState ? await loadAuditExport(filters) : null;
  const exportState = buildExportState(
    exportCount,
    exportLoadState?.download ?? null,
    exportLoadState?.error ?? null,
  );
  const exportDisabledReason =
    "disabledReasonCode" in exportAction
      ? exportAction.disabledReasonCode
      : undefined;
  const exportActionResolved =
    exportAction.enabled && exportState.download?.downloadUrl
      ? exportAction
      : {
          ...exportAction,
          enabled: false,
          disabledReasonCode:
            exportDisabledReason ??
            exportState.error ??
            "Signed export unavailable",
        };
  const exportReady = Boolean(exportState.download?.downloadUrl);

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="稽核"
        subtitle="cross-actor visibility · request correlation · refresh tier T6"
        actions={
          <>
            {renderActionLink(filterAction, "/audit", "清除篩選")}
            {renderActionLink(
              refreshAction,
              buildAuditHref(filters),
              "重新整理",
            )}
            {renderActionLink(
              exportActionResolved,
              exportState.download?.downloadUrl ?? "#",
              exportReady ? "下載簽章匯出" : "匯出篩選結果",
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone="info"
          icon="audit"
          title="Tenant audit includes tenant, ops, platform, system, and partner actors on tenant-owned resources"
          body="Q-TEN13 要求租戶側可檢視跨 actor realm 的租戶資源操作。此頁保留 request correlation，並對 sensitive fields 做 policy-safe masking。"
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Visible Rows"
            value={String(filteredRecords.length)}
            sub={
              records.length
                ? `of ${records.length} in snapshot`
                : "current snapshot"
            }
          />
          <CanvasKPI
            theme={th}
            label="Actor Scopes"
            value={String(visibleActorScopes.length)}
            sub={visibleActorScopes.join(" · ") || "—"}
          />
          <CanvasKPI
            theme={th}
            label="Modules"
            value={String(moduleCount)}
            sub="distinct modules in current filter"
          />
          <CanvasKPI
            theme={th}
            label="Masked Fields"
            value={String(maskedActorCount)}
            sub="rows with policy-safe identity masking"
          />
        </div>

        <div style={contentGridStyle}>
          <div style={mainLaneStyle}>
            <CanvasCard
              theme={th}
              title="篩選"
              subtitle="server-side on tenant snapshot"
            >
              <form
                action="/audit"
                method="get"
                style={{ display: "grid", gap: 14 }}
              >
                <div style={filterGridStyle}>
                  <label style={fieldStackStyle}>
                    <span style={fieldLabelStyle}>Actor Scope</span>
                    <select
                      defaultValue={filters.actor}
                      name="actor"
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
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
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStackStyle}>
                    <span style={fieldLabelStyle}>To</span>
                    <input
                      defaultValue={filters.to}
                      name="to"
                      type="date"
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStackStyle}>
                    <span style={fieldLabelStyle}>Audit / Request ID</span>
                    <input
                      defaultValue={filters.auditId}
                      name="auditId"
                      placeholder="audit-… or req-…"
                      style={monoInputStyle}
                    />
                  </label>
                </div>

                <div style={controlRowStyle}>
                  <button
                    type="submit"
                    style={{
                      ...linkButtonBaseStyle,
                      background: th.accent,
                      borderColor: th.accent,
                      color: "#fff",
                    }}
                  >
                    套用篩選
                  </button>
                  <a
                    href="/audit"
                    style={{
                      ...linkButtonBaseStyle,
                      background: th.surface,
                      color: th.text,
                    }}
                  >
                    重設
                  </a>
                  <span style={secondaryTextStyle}>
                    Refresh tier T6: manual refresh only. Export follows the
                    current filtered subset.
                  </span>
                </div>
              </form>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="稽核列表"
              subtitle="Cross-actor rows remain visible on tenant-owned resources regardless of actor realm."
              padding={0}
              style={tableCardStyle}
            >
              {errorMessage ? (
                <div style={{ padding: 16 }}>
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    title="Latest fetch returned an error"
                    body={errorMessage}
                  />
                </div>
              ) : null}

              {exportState.error ? (
                <div style={{ padding: 16 }}>
                  <CanvasBanner
                    theme={th}
                    tone="warn"
                    title="Signed export is temporarily unavailable"
                    body={exportState.error}
                  />
                </div>
              ) : null}

              {emptyState ? (
                <div style={emptyStateStyle}>
                  <CanvasPill theme={th} tone={emptyState.tone} dot>
                    {emptyReason}
                  </CanvasPill>
                  <div>
                    <div
                      style={{ fontSize: 18, fontWeight: 700, color: th.text }}
                    >
                      {emptyState.title}
                    </div>
                    <div
                      style={{
                        ...secondaryTextStyle,
                        marginTop: 6,
                        maxWidth: 640,
                      }}
                    >
                      {emptyState.body}
                    </div>
                  </div>
                  <div style={controlRowStyle}>
                    {emptyState.actions.map((action) => (
                      <a
                        key={`${action.href}-${action.label}`}
                        href={action.href}
                        style={{
                          ...linkButtonBaseStyle,
                          background: th.surface,
                          color: th.text,
                        }}
                      >
                        {action.label}
                      </a>
                    ))}
                  </div>
                  <div style={emptyReasonPreviewStyle}>
                    {(
                      [
                        "no_data",
                        "not_provisioned",
                        "fetch_failed",
                        "permission_denied",
                        "external_unavailable",
                        "filtered_empty",
                      ] as EmptyReason[]
                    ).map((reason) => (
                      <a
                        key={reason}
                        href={buildAuditHref({ ...filters, empty: reason })}
                        style={inlineLinkStyle}
                      >
                        {reason}
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <CanvasTable<AuditTableRow>
                  theme={th}
                  rows={tableRows}
                  columns={buildTableColumns(filters)}
                />
              )}
            </CanvasCard>

            {focusedRow ? (
              <CanvasCard
                theme={th}
                title="稽核細節"
                subtitle="Expanded detail for the currently focused audit record."
              >
                <div id="audit-detail" style={{ display: "grid", gap: 16 }}>
                  <CanvasDL
                    theme={th}
                    cols={2}
                    items={[
                      {
                        label: "Audit ID",
                        value: focusedRow.record.auditId,
                        mono: true,
                      },
                      {
                        label: "Request ID",
                        value: focusedRow.record.requestId || "—",
                        mono: true,
                      },
                      {
                        label: "Actor Type",
                        value: focusedRow.record.actorType,
                        mono: true,
                      },
                      {
                        label: "Tenant",
                        value: focusedRow.record.tenantId ?? "—",
                        mono: true,
                      },
                      {
                        label: "Resource",
                        value: focusedRow.resourceLabel,
                        mono: true,
                      },
                      {
                        label: "Created At",
                        value: formatDay(focusedRow.record.createdAt),
                        mono: true,
                      },
                    ]}
                  />

                  <div style={summaryGridStyle}>
                    <div style={summaryCellStyle}>
                      <span style={summaryLabelStyle}>Exit path</span>
                      <span style={summaryValueStyle}>
                        {focusedRow.resourceLink.appLabel}
                      </span>
                      <span style={summarySubStyle}>
                        In-app for tenant resources, new tab for
                        ops/platform-owned follow-up.
                      </span>
                    </div>
                    <div style={summaryCellStyle}>
                      <span style={summaryLabelStyle}>Masking</span>
                      <span style={summaryValueStyle}>
                        {focusedRow.masked
                          ? "Sensitive fields masked"
                          : "No masking applied"}
                      </span>
                      <span style={summarySubStyle}>
                        Email / contact-like values are rendered with
                        policy-safe obfuscation.
                      </span>
                    </div>
                    <div style={summaryCellStyle}>
                      <span style={summaryLabelStyle}>Correlation</span>
                      <span style={summaryValueStyle}>
                        {focusedRow.record.requestId
                          ? "Request-linked"
                          : "Standalone"}
                      </span>
                      <span style={summarySubStyle}>
                        Use request ID to trace the same action across services.
                      </span>
                    </div>
                  </div>

                  <div style={detailGridStyle}>
                    <div>
                      <div style={fieldLabelStyle}>Old Values Summary</div>
                      <pre style={detailCodeStyle}>{focusedRow.oldSummary}</pre>
                    </div>
                    <div>
                      <div style={fieldLabelStyle}>New Values Summary</div>
                      <pre style={detailCodeStyle}>{focusedRow.newSummary}</pre>
                    </div>
                  </div>

                  <div style={controlRowStyle}>
                    <a
                      href={focusedRow.requestAuditLink}
                      style={{
                        ...linkButtonBaseStyle,
                        background: th.surface,
                        color: th.text,
                      }}
                    >
                      固定連結此稽核列
                    </a>
                    <a
                      href={focusedRow.resourceLink.href}
                      target={
                        focusedRow.resourceLink.external ? "_blank" : undefined
                      }
                      rel={
                        focusedRow.resourceLink.external
                          ? "noreferrer"
                          : undefined
                      }
                      style={{
                        ...linkButtonBaseStyle,
                        background: th.accent,
                        borderColor: th.accent,
                        color: "#fff",
                      }}
                    >
                      {focusedRow.resourceLink.label}
                    </a>
                  </div>
                </div>
              </CanvasCard>
            ) : null}
          </div>

          <div style={sideLaneStyle}>
            <CanvasCard
              theme={th}
              title="Cross-actor coverage"
              subtitle="Each actor realm stays visually distinct for Q-TEN13 review."
            >
              <div style={summaryGridStyle}>
                {(
                  [
                    [
                      "tenant",
                      "Tenant admins / finance can verify tenant-originated changes.",
                    ],
                    [
                      "ops",
                      "Ops interventions remain visible without leaving the tenant realm.",
                    ],
                    [
                      "platform",
                      "Platform overrides and governance actions are surfaced distinctly.",
                    ],
                    [
                      "system",
                      "Automations stay readable even when no human actor is attached.",
                    ],
                    [
                      "partner",
                      "Partner API key mutations remain attributable in the shared audit lane.",
                    ],
                  ] as Array<[keyof typeof actorToneByScope, string]>
                ).map(([scope, body]) => (
                  <div key={scope} style={summaryCellStyle}>
                    <CanvasPill theme={th} tone={actorToneByScope[scope]} dot>
                      {actorScopeLabel(scope)}
                    </CanvasPill>
                    <div style={summarySubStyle}>{body}</div>
                  </div>
                ))}
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Current filter summary"
              subtitle="What this snapshot is showing right now."
            >
              <div style={summaryGridStyle}>
                <div style={summaryCellStyle}>
                  <span style={summaryLabelStyle}>Request-linked rows</span>
                  <span style={summaryValueStyle}>{requestLinkedCount}</span>
                  <span style={summarySubStyle}>
                    Rows retaining request correlation.
                  </span>
                </div>
                <div style={summaryCellStyle}>
                  <span style={summaryLabelStyle}>Signed export</span>
                  <span style={summaryValueStyle}>{exportState.rowCount}</span>
                  <span style={summarySubStyle}>
                    {exportReady
                      ? `Artifact ready · ${formatArtifactAt(exportState.download?.expiresAt)} 到期`
                      : exportState.error
                        ? "Artifact unavailable while export endpoint is failing."
                        : "Visible rows eligible for the next signed export."}
                  </span>
                </div>
                <div style={summaryCellStyle}>
                  <span style={summaryLabelStyle}>Artifact hash</span>
                  <span style={summaryValueStyle}>
                    {shortenManifestHash(exportState.download?.manifestHash)}
                  </span>
                  <span style={summarySubStyle}>
                    {exportReady
                      ? `Subject ${exportState.download?.subjectId} · immutable signed subset`
                      : "Manifest hash appears after a signed export is issued."}
                  </span>
                </div>
                <div style={summaryCellStyle}>
                  <span style={summaryLabelStyle}>Pinned query</span>
                  <span style={summaryValueStyle}>
                    {filters.auditId ? "Deep-linked" : "Ad hoc"}
                  </span>
                  <span style={summarySubStyle}>
                    {filters.auditId
                      ? "Opened from a receipt or copied audit/request link."
                      : "Browsing the tenant audit snapshot directly."}
                  </span>
                </div>
              </div>
            </CanvasCard>

            <CanvasCard
              theme={th}
              title="Exit paths"
              subtitle="Cross-app deep links open a new tab when the owning console is outside tenant."
            >
              <ul style={listStyle}>
                <li style={listItemStyle}>
                  <span style={primaryTextStyle}>Tenant resources</span>
                  <span style={secondaryTextStyle}>
                    Booking, invoice, report, settings, users, and cost-center
                    records open in-app.
                  </span>
                </li>
                <li style={listItemStyle}>
                  <span style={primaryTextStyle}>Ops-owned follow-up</span>
                  <span style={secondaryTextStyle}>
                    Unknown ops-origin rows exit to `Ops Console
                    /audit?auditId=...` in a new tab.
                  </span>
                </li>
                <li
                  style={{
                    ...listItemStyle,
                    borderBottom: "none",
                    paddingBottom: 0,
                  }}
                >
                  <span style={primaryTextStyle}>Platform-owned follow-up</span>
                  <span style={secondaryTextStyle}>
                    Governance or platform-admin trails exit to `Platform Admin
                    /audit?auditId=...`.
                  </span>
                </li>
              </ul>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
