import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintCategory,
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiHealthEnvelope,
  UiRefreshMetadata,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { crossAppHref } from "@/lib/ops-cross-app-links";
import { resolveEmptyReason } from "@/lib/ops-empty-state";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import { OpsAutoRefresh } from "@/components/ops-auto-refresh";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { ComplaintCreateLauncher } from "./complaint-create-launcher";

// ─────────────────────────────────────────────────────────────────────────────
// Complaint Center — /complaints (packet §5.5, canvas OC_Complaints)
//
// Refresh tier T3 (15s). SLA status is backend-computed per Q-OPS13; when the
// backend has not yet attached `slaStatus` / `availableActions` envelopes the
// page synthesizes them from the existing `ComplaintCaseRecord` fields so the
// CTA surface and SLA urgency states stay honest. Mutating actions
// (assign / resolve / close / reopen / note) live on the complaint detail
// route (§5.6, Q-OPS01) and are surfaced here as descriptor-driven CTAs.
// ─────────────────────────────────────────────────────────────────────────────

type ComplaintsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SlaStatus = "within_sla" | "warning" | "breached";

type ComplaintRuntimeRecord = ComplaintCaseRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  slaStatus?: SlaStatus;
  assigneeName?: string | null;
};

type ComplaintListEnvelope = {
  items: ComplaintRuntimeRecord[];
  refresh?: UiRefreshMetadata;
  health?: UiHealthEnvelope;
  emptyState?: EmptyStateEnvelope;
};

type ComplaintListPayload = ComplaintCaseRecord[] | ComplaintListEnvelope;

type ComplaintTab = "all" | "mine" | "breach" | "escalated";
type StatusFilter = "all" | ComplaintCaseStatus;
type SeverityFilter = "all" | "normal" | "high";
type SlaFilter = "all" | SlaStatus;
type AssigneeFilter = "all" | "me" | "unassigned";

type ComplaintFilters = {
  tab: ComplaintTab;
  q: string;
  status: StatusFilter;
  severity: SeverityFilter;
  sla: SlaFilter;
  assignee: AssigneeFilter;
  emptyReason: EmptyReason | null;
};

type HealthLoadResult = {
  health: UiHealthEnvelope | null;
  error: string | null;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type ComplaintRow = Record<string, unknown> & {
  caseNo: string;
  category: ComplaintCategory;
  categoryLabel: string;
  sourceLabel: string;
  severity: "normal" | "high";
  severityLabel: string;
  severityTone: CanvasTone;
  description: string;
  relatedOrderId: string | null;
  relatedCallId: string | null;
  relatedIncidentId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  status: ComplaintCaseStatus;
  statusLabel: string;
  statusTone: CanvasTone;
  active: boolean;
  slaStatus: SlaStatus;
  slaLabel: string;
  slaTone: CanvasTone;
  slaDueAt: string;
  slaCountdownLabel: string;
  reopenCount: number;
  reopened: boolean;
  lastUpdateLabel: string;
  availableActions: ResourceActionDescriptor[];
  crossAppLinks: CrossAppResourceLink[];
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

// Best-effort "me" identity for the assignee filter. Real identity arrives with
// the protected session contract; ops-console pages stub a stable actor id today
// (mirrors incidents/vehicles).
const OPS_ACTOR_ID = "ops-user-001";

// SLA warning window: a case is "warning" once it is within this window of its
// due time (or already past due without an explicit breach flag).
const SLA_WARNING_WINDOW_MS = 4 * 60 * 60 * 1000;
const T3_STALE_AFTER_MS = 15_000;

// Packet §3.2 / §5.5 — complaint center polls on the T3 "medium" tier (15s).
const COMPLAINT_REFRESH_TIER: RefreshTier = "medium";

const STATUS_OPTIONS: ComplaintCaseStatus[] = [
  "new",
  "assigned",
  "under_investigation",
  "resolved",
  "closed",
  "reopened",
];

const ACTIVE_STATUSES = new Set<ComplaintCaseStatus>([
  "new",
  "assigned",
  "under_investigation",
  "reopened",
]);

const EMPTY_REASONS = new Set<EmptyReason>([
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
]);

const EMPTY_OVERRIDE_REASON_CODES: Record<EmptyReason, string> = {
  no_data: "complaint_queue_empty",
  not_provisioned: "complaint_center_not_provisioned",
  fetch_failed: "complaint_queue_fetch_failed",
  permission_denied: "complaint_queue_permission_denied",
  external_unavailable: "complaint_queue_external_unavailable",
  driver_not_eligible: "driver_not_eligible",
  filtered_empty: "complaint_queue_filtered_empty",
};

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const summaryCardStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  display: "grid",
  gap: 4,
};

const summaryLabelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const summaryValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.05,
  color: theme.text,
};

const summaryFootStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(200px, 1.6fr) repeat(4, minmax(0, 1fr)) auto",
  gap: 10,
  alignItems: "end",
};

const fieldStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: theme.textMuted,
};

const fieldStyle: CSSProperties = {
  width: "100%",
  height: 34,
  padding: "0 10px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
};

const helperRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
};

const helperTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minWidth: 0,
  whiteSpace: "normal",
};

const primaryTextStyle: CSSProperties = {
  color: theme.text,
  fontWeight: 600,
  minWidth: 0,
};

const secondaryTextStyle: CSSProperties = {
  color: theme.textDim,
  fontSize: 11.5,
  minWidth: 0,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 11.5,
  minWidth: 0,
};

const actionStackStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  minWidth: 0,
  whiteSpace: "normal",
};

const emptyStateStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: 10,
  padding: "28px 20px",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyReason(value: string | null | undefined): value is EmptyReason {
  return (
    value !== null &&
    value !== undefined &&
    EMPTY_REASONS.has(value as EmptyReason)
  );
}

function resolveFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ComplaintFilters {
  const tabParam = firstParam(searchParams.tab);
  const statusParam = firstParam(searchParams.status);
  const severityParam = firstParam(searchParams.severity);
  const slaParam = firstParam(searchParams.sla);
  const assigneeParam = firstParam(searchParams.assignee);
  const emptyReasonParam = firstParam(searchParams.emptyReason);

  return {
    tab:
      tabParam === "mine" || tabParam === "breach" || tabParam === "escalated"
        ? tabParam
        : "all",
    q: firstParam(searchParams.q)?.trim() ?? "",
    status: STATUS_OPTIONS.includes(statusParam as ComplaintCaseStatus)
      ? (statusParam as ComplaintCaseStatus)
      : "all",
    severity:
      severityParam === "normal" || severityParam === "high"
        ? severityParam
        : "all",
    sla:
      slaParam === "within_sla" ||
      slaParam === "warning" ||
      slaParam === "breached"
        ? slaParam
        : "all",
    assignee:
      assigneeParam === "me" || assigneeParam === "unassigned"
        ? assigneeParam
        : "all",
    emptyReason: isEmptyReason(emptyReasonParam) ? emptyReasonParam : null,
  };
}

function buildHref(
  filters: ComplaintFilters,
  overrides: Partial<ComplaintFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.tab !== "all") params.set("tab", next.tab);
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.severity !== "all") params.set("severity", next.severity);
  if (next.sla !== "all") params.set("sla", next.sla);
  if (next.assignee !== "all") params.set("assignee", next.assignee);
  if (next.emptyReason) params.set("emptyReason", next.emptyReason);
  const query = params.toString();
  return query ? `/complaints?${query}` : "/complaints";
}

function hasActiveFilters(filters: ComplaintFilters) {
  return (
    filters.tab !== "all" ||
    filters.q.length > 0 ||
    filters.status !== "all" ||
    filters.severity !== "all" ||
    filters.sla !== "all" ||
    filters.assignee !== "all"
  );
}

function buttonStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
): CSSProperties {
  const styles =
    variant === "primary"
      ? {
          background: theme.accent,
          color: "#ffffff",
          borderColor: theme.accent,
        }
      : variant === "ghost"
        ? {
            background: "transparent",
            color: theme.textMuted,
            borderColor: "transparent",
          }
        : {
            background: theme.surface,
            color: theme.text,
            borderColor: theme.border,
          };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: theme.fontFamily,
  };
}

function tonePalette(tone: CanvasTone) {
  const palette: Record<CanvasTone, { bg: string; fg: string; bd: string }> = {
    success: {
      bg: theme.successBg,
      fg: theme.success,
      bd: theme.successBorder,
    },
    warn: { bg: theme.warnBg, fg: theme.warn, bd: theme.warnBorder },
    danger: { bg: theme.dangerBg, fg: theme.danger, bd: theme.dangerBorder },
    info: { bg: theme.infoBg, fg: theme.info, bd: theme.infoBorder },
    accent: { bg: theme.accentBg, fg: theme.accent, bd: theme.accentBorder },
    neutral: { bg: theme.surfaceLo, fg: theme.textMuted, bd: theme.border },
  };
  return palette[tone];
}

function linkButtonStyle(
  tone: CanvasTone = "neutral",
  disabled = false,
): CSSProperties {
  const palette = tonePalette(tone);
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 26,
    padding: "4px 9px",
    borderRadius: 7,
    border: `1px solid ${palette.bd}`,
    background: palette.bg,
    color: palette.fg,
    textDecoration: "none",
    fontSize: 11.5,
    fontWeight: 600,
    opacity: disabled ? 0.48 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    pointerEvents: disabled ? "none" : "auto",
  };
}

function tinyMetaStyle(tone: CanvasTone = "neutral"): CSSProperties {
  return {
    fontSize: 10.5,
    color: tonePalette(tone).fg,
    letterSpacing: 0.2,
  };
}

function toneColor(tone: CanvasTone) {
  return tonePalette(tone).fg;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "—", "—");
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "unknown", "未知");
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatSlaCountdown(
  locale: Locale,
  slaStatus: SlaStatus,
  slaDueAt: string,
  nowMs: number,
) {
  const deltaMinutes = Math.round(
    (new Date(slaDueAt).getTime() - nowMs) / (1000 * 60),
  );

  if (slaStatus === "breached") {
    const overdue = Math.abs(deltaMinutes);
    return copy(
      locale,
      `Breached · ${overdue} min over`,
      `已違規 · 逾期 ${overdue} 分鐘`,
    );
  }

  if (deltaMinutes < 0) {
    const overdue = Math.abs(deltaMinutes);
    return copy(
      locale,
      `Past due ${overdue} min`,
      `已超過期限 ${overdue} 分鐘`,
    );
  }

  if (deltaMinutes < 60) {
    return copy(
      locale,
      `Due in ${deltaMinutes} min`,
      `${deltaMinutes} 分鐘內到期`,
    );
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  return copy(locale, `Due in ${deltaHours} hr`, `${deltaHours} 小時內到期`);
}

function deriveSlaStatus(
  record: ComplaintRuntimeRecord,
  nowMs: number,
): SlaStatus {
  if (record.slaStatus) {
    return record.slaStatus;
  }
  if (record.slaBreach) {
    return "breached";
  }
  const remainingMs = new Date(record.slaDueAt).getTime() - nowMs;
  if (remainingMs <= SLA_WARNING_WINDOW_MS) {
    return "warning";
  }
  return "within_sla";
}

function slaTone(slaStatus: SlaStatus): CanvasTone {
  if (slaStatus === "breached") return "danger";
  if (slaStatus === "warning") return "warn";
  return "success";
}

function slaLabel(locale: Locale, slaStatus: SlaStatus) {
  switch (slaStatus) {
    case "breached":
      return copy(locale, "breached", "已違規");
    case "warning":
      return copy(locale, "warning", "即將違規");
    default:
      return copy(locale, "within SLA", "SLA 內");
  }
}

function statusTone(status: ComplaintCaseStatus): CanvasTone {
  switch (status) {
    case "resolved":
      return "success";
    case "closed":
      return "neutral";
    case "reopened":
      return "danger";
    case "under_investigation":
      return "warn";
    case "assigned":
      return "info";
    case "new":
    default:
      return "accent";
  }
}

function severityTone(severity: "normal" | "high"): CanvasTone {
  return severity === "high" ? "danger" : "neutral";
}

function complaintSeverityWeight(severity: "normal" | "high") {
  return severity === "high" ? 2 : 1;
}

function slaWeight(slaStatus: SlaStatus) {
  if (slaStatus === "breached") return 3;
  if (slaStatus === "warning") return 2;
  return 1;
}

function compareComplaintPriority(a: ComplaintRow, b: ComplaintRow) {
  const slaDelta = slaWeight(b.slaStatus) - slaWeight(a.slaStatus);
  if (slaDelta !== 0) return slaDelta;

  const activeDelta = Number(b.active) - Number(a.active);
  if (activeDelta !== 0) return activeDelta;

  const severityDelta =
    complaintSeverityWeight(b.severity) - complaintSeverityWeight(a.severity);
  if (severityDelta !== 0) return severityDelta;

  return new Date(a.slaDueAt).getTime() - new Date(b.slaDueAt).getTime();
}

function synthesizeCrossAppLinks(
  record: ComplaintRuntimeRecord,
  locale: Locale,
): CrossAppResourceLink[] {
  if (record.crossAppLinks && record.crossAppLinks.length > 0) {
    return record.crossAppLinks;
  }

  // Closed / resolved cases expose the audit-export trail; audit lives in
  // platform-admin per Q-X10, so the deep link opens in a new tab (§3.4 / §3.10).
  if (record.status === "closed" || record.status === "resolved") {
    return [
      {
        targetApp: "platform-admin",
        route: `/audit?resourceType=complaint&resourceId=${encodeURIComponent(record.caseNo)}`,
        resourceType: "complaint",
        resourceId: record.caseNo,
        openMode: "new_tab",
        label: copy(locale, "Audit trail", "稽核軌跡"),
      },
    ];
  }

  return [];
}

function actionTone(action: ResourceActionDescriptor): CanvasTone {
  if (!action.enabled) {
    return "neutral";
  }
  if (action.riskLevel === "high") return "danger";
  if (action.riskLevel === "medium") return "warn";
  return "accent";
}

function actionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_complaint_detail":
      return copy(locale, "Case detail", "案件詳情");
    case "assign":
      return copy(locale, "Assign / reassign", "指派");
    case "escalate":
      return copy(locale, "Escalate to incident", "升級事故");
    case "export":
      return copy(locale, "Export view", "匯出檢視");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function actionReason(action: ResourceActionDescriptor, locale: Locale) {
  if (!action.disabledReasonCode) {
    return null;
  }

  switch (action.disabledReasonCode) {
    case "complaint_detail_pending":
      return copy(
        locale,
        "Detail route ships with Q-OPS01 (UI-FE-OPS-CMPID).",
        "詳情路由由 Q-OPS01（UI-FE-OPS-CMPID）交付。",
      );
    case "already_escalated":
      return copy(locale, "Already linked to an incident.", "已連結事故案件。");
    case "case_not_active":
      return copy(locale, "Case is no longer active.", "案件已非進行中。");
    default:
      return formatOpsCodeLabel(locale, action.disabledReasonCode);
  }
}

function synthesizeAvailableActions(
  record: ComplaintRuntimeRecord,
  active: boolean,
): ResourceActionDescriptor[] {
  if (record.availableActions && record.availableActions.length > 0) {
    return record.availableActions;
  }

  const actions: ResourceActionDescriptor[] = [
    // Detail + mutation surface (assign/resolve/close/reopen/note) lives on the
    // detail route (§5.6) which is not shipped yet — surface it disabled.
    {
      action: "open_complaint_detail",
      enabled: false,
      disabledReasonCode: "complaint_detail_pending",
      riskLevel: "low",
    },
    {
      action: "assign",
      enabled: false,
      disabledReasonCode: active
        ? "complaint_detail_pending"
        : "case_not_active",
      riskLevel: "medium",
    },
  ];

  // Escalation to incident is a high-risk, reason-required action (§3.4) and is
  // genuinely reachable from the list via the incident create flow.
  actions.push({
    action: "escalate",
    enabled: active && !record.relatedIncidentId,
    ...(record.relatedIncidentId
      ? { disabledReasonCode: "already_escalated" }
      : !active
        ? { disabledReasonCode: "case_not_active" }
        : {}),
    requiresReason: true,
    riskLevel: "high",
  });

  if (record.status === "closed" || record.status === "resolved") {
    actions.push({ action: "export", enabled: true, riskLevel: "low" });
  }

  return actions;
}

function buildActionHref(
  action: ResourceActionDescriptor,
  row: ComplaintRow,
): { href: string; newTab: boolean } | null {
  switch (action.action) {
    case "escalate": {
      const params = new URLSearchParams({
        create: "1",
        complaintCaseNo: row.caseNo,
        title: row.caseNo,
        description: row.description,
        severity: row.severity === "high" ? "high" : "medium",
      });
      if (row.relatedOrderId) {
        params.set("relatedOrderId", row.relatedOrderId);
      }
      return { href: `/incidents?${params.toString()}`, newTab: false };
    }
    case "export": {
      const link = row.crossAppLinks[0];
      return link ? { href: crossAppHref(link), newTab: true } : null;
    }
    default:
      return null;
  }
}

function refreshBadgeLabel(refresh: UiRefreshMetadata, locale: Locale) {
  const freshness = copy(
    locale,
    refresh.dataFreshness.toUpperCase(),
    formatOpsCodeLabel(locale, refresh.dataFreshness),
  );

  return `${freshness} · T3 · 15s`;
}

function refreshBody(refresh: UiRefreshMetadata, locale: Locale) {
  return copy(
    locale,
    `Snapshot ${formatLongDateTime(locale, refresh.generatedAt)} UTC from ${refresh.source}.`,
    `快照於 ${formatLongDateTime(locale, refresh.generatedAt)} UTC 產生，來源 ${formatOpsCodeLabel(locale, refresh.source)}。`,
  );
}

function synthesizeRefreshMetadata(
  generatedAt: string,
  freshness: UiRefreshMetadata["dataFreshness"] = "fresh",
): UiRefreshMetadata {
  return {
    generatedAt,
    staleAfterMs: T3_STALE_AFTER_MS,
    dataFreshness: freshness,
    source: "live",
  };
}

function normalizeComplaintPayload(
  payload: ComplaintListPayload | null,
  fallbackGeneratedAt: string,
): ComplaintListEnvelope {
  if (!payload) {
    return {
      items: [],
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "unknown"),
    };
  }

  if (Array.isArray(payload)) {
    return {
      items: payload,
      refresh: synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
    };
  }

  const normalized: ComplaintListEnvelope = {
    items: payload.items ?? [],
    refresh:
      payload.refresh ??
      synthesizeRefreshMetadata(fallbackGeneratedAt, "fresh"),
  };

  if (payload.health) {
    normalized.health = payload.health;
  }
  if (payload.emptyState) {
    normalized.emptyState = payload.emptyState;
  }

  return normalized;
}

async function loadWithError<T>(
  loader: () => Promise<T>,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeLegacyHealthStatus(status: string | undefined) {
  if (status === "healthy" || status === "ok") return "healthy";
  if (status === "down" || status === "unhealthy") return "down";
  if (status === "degraded") return "degraded";
  return "degraded";
}

function normalizeHealthPayload(payload: unknown): UiHealthEnvelope | null {
  const unwrapped =
    isRecord(payload) && "data" in payload ? payload.data : payload;

  if (!isRecord(unwrapped)) {
    return null;
  }

  if (
    typeof unwrapped.status === "string" &&
    Array.isArray(unwrapped.degradedServices) &&
    typeof unwrapped.lastCheckedAt === "string"
  ) {
    return {
      status:
        unwrapped.status === "healthy" ||
        unwrapped.status === "degraded" ||
        unwrapped.status === "down"
          ? unwrapped.status
          : "degraded",
      degradedServices: unwrapped.degradedServices
        .filter(isRecord)
        .map((entry) => ({
          service: String(entry.service ?? "service"),
          impact: String(entry.impact ?? "degraded"),
          severity: entry.severity === "critical" ? "critical" : "warning",
        })),
      lastCheckedAt: unwrapped.lastCheckedAt,
    };
  }

  if (typeof unwrapped.status === "string") {
    const timestamp =
      typeof unwrapped.timestamp === "string"
        ? unwrapped.timestamp
        : new Date().toISOString();
    const service =
      typeof unwrapped.service === "string" ? unwrapped.service : "api";
    const normalizedStatus = normalizeLegacyHealthStatus(unwrapped.status);

    return {
      status: normalizedStatus,
      degradedServices:
        normalizedStatus === "healthy"
          ? []
          : [
              {
                service,
                impact: `health=${unwrapped.status}`,
                severity: normalizedStatus === "down" ? "critical" : "warning",
              },
            ],
      lastCheckedAt: timestamp,
    };
  }

  return null;
}

async function loadHealthEnvelope(): Promise<HealthLoadResult> {
  const apiBaseUrl = process.env.DRTS_API_URL ?? "http://localhost:3001";

  try {
    const response = await fetch(new URL("/api/health", apiBaseUrl), {
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        health: {
          status: "down",
          degradedServices: [
            {
              service: "api",
              impact: `status=${response.status}`,
              severity: "critical",
            },
          ],
          lastCheckedAt: new Date().toISOString(),
        },
        error: `health status ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      health: normalizeHealthPayload(payload),
      error: null,
    };
  } catch (error) {
    return {
      health: {
        status: "down",
        degradedServices: [
          {
            service: "api",
            impact:
              error instanceof Error ? error.message : "health fetch failed",
            severity: "critical",
          },
        ],
        lastCheckedAt: new Date().toISOString(),
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function mergeHealthSignals(
  baseHealth: UiHealthEnvelope | null,
  supplementalServices: UiHealthEnvelope["degradedServices"],
): UiHealthEnvelope | null {
  if (!baseHealth && supplementalServices.length === 0) {
    return null;
  }

  const degradedServices = [
    ...(baseHealth?.degradedServices ?? []),
    ...supplementalServices,
  ];

  if (degradedServices.length === 0 && baseHealth?.status === "healthy") {
    return baseHealth;
  }

  const status =
    baseHealth?.status === "down" ||
    degradedServices.some((service) => service.severity === "critical")
      ? "down"
      : degradedServices.length > 0
        ? "degraded"
        : "healthy";

  return {
    status,
    degradedServices,
    lastCheckedAt: baseHealth?.lastCheckedAt ?? new Date().toISOString(),
  };
}

function buildEmptyStateViewModel(
  reason: EmptyReason,
  locale: Locale,
  filters: ComplaintFilters,
  rawMessage: string | null,
) {
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info" as const,
        icon: "complaints" as const,
        title: copy(
          locale,
          "Complaint center not provisioned",
          "客訴中心尚未開通",
        ),
        description: copy(
          locale,
          "Complaint intake is not enabled for this environment yet. Open the call center to capture cases in the meantime.",
          "此環境尚未啟用客訴受理。可先由客服中心建立案件。",
        ),
        actionLabel: copy(locale, "Open call center", "開啟客服中心"),
        actionHref: "/callcenter",
        actionNewTab: false,
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: copy(locale, "Complaint snapshot failed", "客訴快照讀取失敗"),
        description:
          rawMessage ??
          copy(
            locale,
            "The complaints endpoint did not return a usable payload.",
            "客訴端點未回傳可用內容。",
          ),
        actionLabel: copy(locale, "Retry", "重新整理"),
        actionHref: buildHref(filters, {}),
        actionNewTab: false,
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        icon: "users" as const,
        title: copy(locale, "Complaint scope denied", "無法存取客訴範圍"),
        description: copy(
          locale,
          "This actor can enter the shell but lacks the ops_compliance scope for the complaint queue.",
          "目前帳號可進入殼層，但沒有客訴佇列所需的 ops_compliance 權限。",
        ),
        actionLabel: copy(locale, "Open ops dashboard", "返回儀表板"),
        actionHref: "/dashboard",
        actionNewTab: false,
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        icon: "health" as const,
        title: copy(
          locale,
          "External dependency unavailable",
          "外部相依服務不可用",
        ),
        description: copy(
          locale,
          "SLA computation or case-recording dependencies are degraded. Latest case state may be incomplete.",
          "SLA 計算或案件記錄相依服務降級，最新案件狀態可能不完整。",
        ),
        actionLabel: copy(locale, "Retry", "重新整理"),
        actionHref: buildHref(filters, {}),
        actionNewTab: false,
      };
    case "filtered_empty":
      return {
        tone: "accent" as const,
        icon: "filter" as const,
        title: copy(
          locale,
          "No complaints match this slice",
          "目前條件沒有符合的客訴",
        ),
        description: copy(
          locale,
          "Widen the tab, status, severity, SLA, or assignee filters to restore results.",
          "放寬分頁、狀態、嚴重度、SLA 或負責人條件即可恢復結果。",
        ),
        actionLabel: copy(locale, "Clear filters", "清除條件"),
        actionHref: "/complaints",
        actionNewTab: false,
      };
    case "no_data":
    default:
      return {
        tone: "neutral" as const,
        icon: "complaints" as const,
        title: copy(locale, "No open complaints", "目前沒有未結客訴"),
        description: copy(
          locale,
          "The complaint queue is healthy and there are no cases waiting for triage right now.",
          "客訴佇列健康，目前沒有等待處理的案件。",
        ),
        actionLabel: copy(locale, "Open call center", "前往客服中心"),
        actionHref: "/callcenter",
        actionNewTab: false,
      };
  }
}

function renderAction(
  action: ResourceActionDescriptor,
  row: ComplaintRow,
  locale: Locale,
  key: string,
): ReactNode {
  const label = actionLabel(action, locale);
  const target = action.enabled ? buildActionHref(action, row) : null;
  const reason = actionReason(action, locale);

  return (
    <div key={key} style={{ display: "grid", gap: 4 }}>
      {target ? (
        <Link
          href={target.href}
          target={target.newTab ? "_blank" : undefined}
          rel={target.newTab ? "noreferrer" : undefined}
          style={linkButtonStyle(actionTone(action))}
        >
          {label}
          {target.newTab ? <CanvasIcon name="ext" size={11} /> : null}
        </Link>
      ) : (
        <span
          style={linkButtonStyle(actionTone(action), !action.enabled)}
          title={reason ?? undefined}
        >
          {label}
        </span>
      )}
      <span style={tinyMetaStyle(actionTone(action))}>
        {copy(locale, `risk:${action.riskLevel}`, `風險:${action.riskLevel}`)}
        {action.requiresReason
          ? copy(locale, " · reason required", " · 需填原因")
          : ""}
      </span>
      {!action.enabled && reason ? (
        <span style={mutedTextStyle}>{reason}</span>
      ) : null}
    </div>
  );
}

function buildColumns(locale: Locale): CanvasTableColumn<ComplaintRow>[] {
  return [
    {
      h: copy(locale, "CASE", "案件"),
      w: 150,
      r: (row) => (
        <div style={stackStyle}>
          <span
            style={{
              ...primaryTextStyle,
              ...monoTextStyle,
              color: theme.accent,
            }}
          >
            {row.caseNo}
          </span>
          <span style={secondaryTextStyle}>{row.sourceLabel}</span>
        </div>
      ),
    },
    {
      h: copy(locale, "CATEGORY / DESC", "類別 / 摘要"),
      w: 280,
      r: (row) => (
        <div style={stackStyle}>
          <span style={primaryTextStyle}>{row.categoryLabel}</span>
          <span style={secondaryTextStyle}>{row.description}</span>
          {row.reopened ? (
            <div>
              <Pill theme={theme} tone="danger">
                {copy(
                  locale,
                  `reopened ×${row.reopenCount}`,
                  `已重啟 ×${row.reopenCount}`,
                )}
              </Pill>
            </div>
          ) : null}
        </div>
      ),
    },
    {
      h: copy(locale, "SEV", "嚴重度"),
      w: 96,
      r: (row) => (
        <Pill theme={theme} tone={row.severityTone} dot>
          {row.severityLabel}
        </Pill>
      ),
    },
    {
      h: copy(locale, "ORDER / CALL", "訂單 / 來電"),
      w: 150,
      r: (row) => (
        <div style={stackStyle}>
          {row.relatedOrderId ? (
            <Link
              href={`/dispatch?orderId=${encodeURIComponent(row.relatedOrderId)}`}
              style={linkButtonStyle("accent")}
            >
              {row.relatedOrderId}
            </Link>
          ) : (
            <span style={{ ...mutedTextStyle, ...monoTextStyle }}>
              {copy(locale, "no order", "無訂單")}
            </span>
          )}
          {row.relatedCallId ? (
            <Link
              href={`/callcenter?callId=${encodeURIComponent(row.relatedCallId)}`}
              style={{
                ...secondaryTextStyle,
                ...monoTextStyle,
                color: theme.info,
              }}
            >
              {row.relatedCallId}
            </Link>
          ) : (
            <span style={{ ...mutedTextStyle, ...monoTextStyle }}>
              {copy(locale, "no call", "無來電")}
            </span>
          )}
        </div>
      ),
    },
    {
      h: copy(locale, "SLA · backend computed", "SLA · 後端計算"),
      w: 170,
      r: (row) => (
        <div style={stackStyle}>
          <Pill theme={theme} tone={row.slaTone} dot>
            {row.slaLabel}
          </Pill>
          <span style={secondaryTextStyle}>{row.slaCountdownLabel}</span>
          <span style={{ ...mutedTextStyle, ...monoTextStyle }}>
            {copy(locale, "due", "期限")} · {row.lastUpdateLabel}
          </span>
        </div>
      ),
    },
    {
      h: copy(locale, "OWNER", "負責人"),
      w: 140,
      r: (row) =>
        row.assigneeId ? (
          <div style={stackStyle}>
            <span style={primaryTextStyle}>
              {row.assigneeName ?? row.assigneeId}
            </span>
            <span style={{ ...secondaryTextStyle, ...monoTextStyle }}>
              {row.assigneeId}
            </span>
          </div>
        ) : (
          <Pill theme={theme} tone="warn">
            {copy(locale, "unassigned", "未指派")}
          </Pill>
        ),
    },
    {
      h: copy(locale, "STATUS", "狀態"),
      w: 130,
      r: (row) => (
        <div style={stackStyle}>
          <Pill theme={theme} tone={row.statusTone} dot>
            {row.statusLabel}
          </Pill>
          {row.relatedIncidentId ? (
            <Link
              href={`/incidents?incidentId=${encodeURIComponent(row.relatedIncidentId)}`}
              style={{ ...tinyMetaStyle("danger") }}
            >
              {copy(locale, "→ incident", "→ 事故")}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      h: copy(locale, "ACTIONS", "操作"),
      w: 220,
      r: (row) => (
        <div style={actionStackStyle}>
          {row.availableActions
            .slice(0, 3)
            .map((action, index) =>
              renderAction(
                action,
                row,
                locale,
                `${row.caseNo}-${action.action}-${index}`,
              ),
            )}
          {row.crossAppLinks.slice(0, 1).map((link) => (
            <Link
              key={`${row.caseNo}-${link.label}`}
              href={crossAppHref(link)}
              target={link.openMode === "new_tab" ? "_blank" : undefined}
              rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
              style={linkButtonStyle("info")}
            >
              {link.label}
              {link.openMode === "new_tab" ? (
                <CanvasIcon name="ext" size={11} />
              ) : null}
            </Link>
          ))}
        </div>
      ),
    },
  ];
}

export default async function ComplaintsPage({
  searchParams,
}: ComplaintsPageProps) {
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const requestStartedAt = new Date().toISOString();
  const nowMs = Date.now();

  const [complaintsResult, healthResult] = await Promise.all([
    loadWithError(() => client.get<ComplaintListPayload>("/api/complaints")),
    loadHealthEnvelope(),
  ]);

  const complaintPayload = normalizeComplaintPayload(
    complaintsResult.data,
    requestStartedAt,
  );

  const degradedServices: UiHealthEnvelope["degradedServices"] = [];
  if (complaintsResult.error) {
    degradedServices.push({
      service: "complaint_center",
      impact: complaintsResult.error,
      severity: "critical",
    });
  }
  if (healthResult.error) {
    degradedServices.push({
      service: "api",
      impact: healthResult.error,
      severity: "critical",
    });
  }

  const health = mergeHealthSignals(
    complaintPayload.health ?? healthResult.health,
    degradedServices,
  );

  const rows: ComplaintRow[] = complaintPayload.items.map((record) => {
    const sla = deriveSlaStatus(record, nowMs);
    const active = ACTIVE_STATUSES.has(record.status);
    const crossAppLinks = synthesizeCrossAppLinks(record, locale);

    const provisional = {
      caseNo: record.caseNo,
      category: record.category,
      categoryLabel: formatOpsCodeLabel(locale, record.category),
      sourceLabel: formatOpsCodeLabel(locale, record.caseSource),
      severity: record.severity,
      severityLabel: formatOpsCodeLabel(locale, record.severity),
      severityTone: severityTone(record.severity),
      description: record.description,
      relatedOrderId: record.relatedOrderId,
      relatedCallId: record.relatedCallId,
      relatedIncidentId: record.relatedIncidentId,
      assigneeId: record.assigneeId,
      assigneeName: record.assigneeName ?? null,
      status: record.status,
      statusLabel: formatOpsCodeLabel(locale, record.status),
      statusTone: statusTone(record.status),
      active,
      slaStatus: sla,
      slaLabel: slaLabel(locale, sla),
      slaTone: slaTone(sla),
      slaDueAt: record.slaDueAt,
      slaCountdownLabel: formatSlaCountdown(
        locale,
        sla,
        record.slaDueAt,
        nowMs,
      ),
      reopenCount: record.reopenCount,
      reopened: record.reopenCount > 0,
      lastUpdateLabel: formatDateTime(locale, record.updatedAt),
      crossAppLinks,
    };

    return {
      ...provisional,
      availableActions: synthesizeAvailableActions(record, active),
    };
  });

  const filteredRows = rows
    .filter((row) => {
      if (filters.tab === "mine" && row.assigneeId !== OPS_ACTOR_ID) {
        return false;
      }
      if (filters.tab === "breach" && row.slaStatus !== "breached") {
        return false;
      }
      if (filters.tab === "escalated" && !row.relatedIncidentId) {
        return false;
      }
      if (filters.status !== "all" && row.status !== filters.status) {
        return false;
      }
      if (filters.severity !== "all" && row.severity !== filters.severity) {
        return false;
      }
      if (filters.sla !== "all" && row.slaStatus !== filters.sla) {
        return false;
      }
      if (filters.assignee === "me" && row.assigneeId !== OPS_ACTOR_ID) {
        return false;
      }
      if (filters.assignee === "unassigned" && row.assigneeId) {
        return false;
      }

      if (!filters.q) {
        return true;
      }

      const haystack = [
        row.caseNo,
        row.categoryLabel,
        row.category,
        row.description,
        row.status,
        row.assigneeId ?? "",
        row.relatedOrderId ?? "",
        row.relatedCallId ?? "",
        row.relatedIncidentId ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(filters.q.toLowerCase());
    })
    .sort(compareComplaintPriority);

  const openCount = rows.filter((row) => row.active).length;
  const breachedCount = rows.filter(
    (row) => row.slaStatus === "breached",
  ).length;
  const warningCount = rows.filter((row) => row.slaStatus === "warning").length;
  const escalatedCount = rows.filter((row) => row.relatedIncidentId).length;
  const reopenedCount = rows.filter((row) => row.reopened).length;
  const mineCount = rows.filter(
    (row) => row.assigneeId === OPS_ACTOR_ID,
  ).length;
  const reopenRate =
    rows.length > 0 ? Math.round((reopenedCount / rows.length) * 100) : 0;
  const slaEmergency =
    rows.length > 0 &&
    breachedCount >= Math.max(2, Math.ceil(rows.length * 0.3));

  let emptyReason = filters.emptyReason;
  if (!emptyReason && filteredRows.length === 0) {
    if (
      complaintPayload.emptyState?.reason &&
      isEmptyReason(complaintPayload.emptyState.reason)
    ) {
      emptyReason = complaintPayload.emptyState.reason;
    } else {
      const externalAvailable = !(
        health &&
        health.status !== "healthy" &&
        health.degradedServices.some(
          (service) =>
            service.service === "complaint_center" || service.service === "api",
        )
      );
      emptyReason = resolveEmptyReason({
        ok: !complaintsResult.error,
        itemCount: filteredRows.length,
        filtersActive: hasActiveFilters(filters),
        externalAvailable,
      });
    }
  }

  const displayedRows = emptyReason ? [] : filteredRows;
  const emptyView = emptyReason
    ? buildEmptyStateViewModel(
        emptyReason,
        locale,
        filters,
        complaintsResult.error ??
          (complaintPayload.emptyState?.messageCode
            ? formatOpsCodeLabel(
                locale,
                complaintPayload.emptyState.messageCode,
              )
            : null),
      )
    : null;

  const refresh =
    complaintPayload.refresh ?? synthesizeRefreshMetadata(requestStartedAt);
  const refreshHref = buildHref(filters, {});

  const tabConfig: Array<{
    key: ComplaintTab;
    label: string;
    count: number;
    tone: CanvasTone;
  }> = [
    {
      key: "all",
      label: copy(locale, "All", "全部"),
      count: rows.length,
      tone: "neutral",
    },
    {
      key: "mine",
      label: copy(locale, "Mine", "我負責"),
      count: mineCount,
      tone: "accent",
    },
    {
      key: "breach",
      label: copy(locale, "SLA breach", "SLA 違規"),
      count: breachedCount,
      tone: "danger",
    },
    {
      key: "escalated",
      label: copy(locale, "Escalated", "已升級事故"),
      count: escalatedCount,
      tone: "warn",
    },
  ];

  const tabs = tabConfig.map((tab) => (
    <Link
      key={tab.key}
      href={buildHref(filters, { tab: tab.key })}
      style={{
        color: theme.text,
        textDecoration: "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {tab.label}
      <span style={tinyMetaStyle(tab.tone)}>{tab.count}</span>
    </Link>
  ));
  const activeTabIndex = tabConfig.findIndex((tab) => tab.key === filters.tab);
  const activeTab = tabs[activeTabIndex === -1 ? 0 : activeTabIndex];

  const columns = buildColumns(locale);
  // Audit lives in platform-admin (Q-X10); open the cross-app trail in a new tab.
  const auditHref = crossAppHref({
    targetApp: "platform-admin",
    route: "/audit?resourceType=complaint",
    resourceType: "complaint",
    resourceId: "",
    openMode: "new_tab",
    label: "audit",
  });

  return (
    <>
      <PageHeader
        theme={theme}
        title={copy(locale, "Complaint Center", "客訴中心")}
        subtitle={copy(
          locale,
          "case lifecycle · SLA · escalation · reopen never overwrites the record",
          "案件全流程 · SLA · 升級 · reopen 不得覆蓋紀錄",
        )}
        tabs={tabs}
        activeTab={activeTab}
        actions={
          <>
            <Pill
              theme={theme}
              tone={refresh.dataFreshness === "fresh" ? "success" : "warn"}
            >
              {refreshBadgeLabel(refresh, locale)}
            </Pill>
            <a href={refreshHref} style={buttonStyle("secondary")}>
              <CanvasIcon name="arrow" size={12} />
              {copy(locale, "Refresh", "重新整理")}
            </a>
            <a
              href={auditHref}
              target="_blank"
              rel="noreferrer"
              style={buttonStyle("secondary")}
            >
              <CanvasIcon name="ext" size={12} />
              {copy(locale, "Export / Audit", "匯出 / 稽核")}
            </a>
            <ComplaintCreateLauncher locale={locale} />
          </>
        }
      />

      <div style={pageBodyStyle}>
        <OpsAutoRefresh tier={COMPLAINT_REFRESH_TIER} />
        {health && health.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={health.status === "down" ? "danger" : "warn"}
            icon={health.status === "down" ? "warn" : "health"}
            title={copy(
              locale,
              "Complaint page is running degraded",
              "客訴頁面目前為降級模式",
            )}
            body={`${
              health.degradedServices
                .map((service) => `${service.service}: ${service.impact}`)
                .join(" · ") || "health unknown"
            } · ${copy(locale, "checked", "檢查時間")} ${formatLongDateTime(
              locale,
              health.lastCheckedAt,
            )} UTC`}
          />
        ) : null}

        {refresh.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={refresh.dataFreshness === "degraded" ? "warn" : "info"}
            icon={refresh.dataFreshness === "degraded" ? "warn" : "clock"}
            title={copy(
              locale,
              "Snapshot is not fresh",
              "目前顯示的快照非最新",
            )}
            body={refreshBody(refresh, locale)}
          />
        ) : null}

        {slaEmergency ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              "SLA emergency: multiple complaints have breached",
              "SLA 警報：多筆客訴已違規",
            )}
            body={copy(
              locale,
              `${breachedCount}/${rows.length} complaints have breached SLA. Triage by severity and escalate to incidents where service recovery crosses the complaint boundary.`,
              `目前 ${breachedCount}/${rows.length} 筆客訴已違規 SLA；請依嚴重度分流，必要時升級為事故協調 service recovery。`,
            )}
            actions={
              <Link
                href={buildHref(filters, { tab: "breach" })}
                style={linkButtonStyle("danger")}
              >
                {copy(locale, "View breached", "檢視違規案件")}
              </Link>
            }
          />
        ) : null}

        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Open cases", "未結客訴")}
            </span>
            <span style={summaryValueStyle}>{openCount}</span>
            <span style={summaryFootStyle}>
              {copy(
                locale,
                `${breachedCount} breached · ${warningCount} warning`,
                `${breachedCount} 違規 · ${warningCount} 即將違規`,
              )}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "SLA breached", "SLA 違規")}
            </span>
            <span
              style={{
                ...summaryValueStyle,
                color: breachedCount > 0 ? theme.danger : theme.text,
              }}
            >
              {breachedCount}
            </span>
            <span style={summaryFootStyle}>
              {copy(locale, "backend-computed slaStatus", "後端計算 slaStatus")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Escalated", "升級事故")}
            </span>
            <span
              style={{
                ...summaryValueStyle,
                color: escalatedCount > 0 ? theme.warn : theme.text,
              }}
            >
              {escalatedCount}
            </span>
            <span style={summaryFootStyle}>
              {copy(locale, "linked to an incident", "已連結事故案件")}
            </span>
          </div>
          <div style={summaryCardStyle}>
            <span style={summaryLabelStyle}>
              {copy(locale, "Reopen rate", "reopen 率")}
            </span>
            <span
              style={{
                ...summaryValueStyle,
                color: reopenRate > 0 ? theme.info : theme.text,
              }}
            >
              {reopenRate}%
            </span>
            <span style={summaryFootStyle}>
              {copy(
                locale,
                `${reopenedCount} reopened case(s)`,
                `${reopenedCount} 筆案件曾重啟`,
              )}
            </span>
          </div>
        </div>

        <Card
          theme={theme}
          title={copy(locale, "Filters", "篩選")}
          subtitle={copy(
            locale,
            "Tab, status, severity, SLA state, and assignee views run on the same T3 snapshot.",
            "分頁、狀態、嚴重度、SLA 狀態與負責人條件都套用同一份 T3 快照。",
          )}
        >
          <form method="get" style={{ display: "grid", gap: 0 }}>
            <input type="hidden" name="tab" value={filters.tab} />
            {filters.emptyReason ? (
              <input
                type="hidden"
                name="emptyReason"
                value={filters.emptyReason}
              />
            ) : null}
            <div style={filterGridStyle}>
              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Search", "搜尋")}
                </span>
                <input
                  name="q"
                  defaultValue={filters.q}
                  placeholder={copy(
                    locale,
                    "case no, description, order, call",
                    "案件編號、摘要、訂單、來電",
                  )}
                  style={fieldStyle}
                />
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Status", "狀態")}
                </span>
                <select
                  name="status"
                  defaultValue={filters.status}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {formatOpsCodeLabel(locale, status)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Severity", "嚴重度")}
                </span>
                <select
                  name="severity"
                  defaultValue={filters.severity}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="high">
                    {formatOpsCodeLabel(locale, "high")}
                  </option>
                  <option value="normal">
                    {formatOpsCodeLabel(locale, "normal")}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "SLA", "SLA")}
                </span>
                <select
                  name="sla"
                  defaultValue={filters.sla}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="within_sla">
                    {copy(locale, "Within SLA", "SLA 內")}
                  </option>
                  <option value="warning">
                    {copy(locale, "Warning", "即將違規")}
                  </option>
                  <option value="breached">
                    {copy(locale, "Breached", "已違規")}
                  </option>
                </select>
              </label>

              <label style={fieldStackStyle}>
                <span style={fieldLabelStyle}>
                  {copy(locale, "Assignee", "負責人")}
                </span>
                <select
                  name="assignee"
                  defaultValue={filters.assignee}
                  style={fieldStyle}
                >
                  <option value="all">{copy(locale, "All", "全部")}</option>
                  <option value="me">{copy(locale, "Me", "我")}</option>
                  <option value="unassigned">
                    {copy(locale, "Unassigned", "未指派")}
                  </option>
                </select>
              </label>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={buttonStyle("primary")}>
                  <CanvasIcon name="search" size={12} />
                  {copy(locale, "Apply", "套用")}
                </button>
                <Link href="/complaints" style={buttonStyle("ghost")}>
                  {copy(locale, "Reset", "重設")}
                </Link>
              </div>
            </div>
          </form>

          <div style={helperRowStyle}>
            <span style={helperTextStyle}>
              {copy(
                locale,
                `${displayedRows.length} visible / ${rows.length} total`,
                `目前顯示 ${displayedRows.length} / 總數 ${rows.length}`,
              )}
            </span>
            <span style={{ ...helperTextStyle, ...monoTextStyle }}>
              {copy(locale, "generated", "生成時間")} ·{" "}
              {formatLongDateTime(locale, refresh.generatedAt)} UTC
            </span>
            <span style={helperTextStyle}>
              {copy(
                locale,
                "row CTAs come from availableActions",
                "每列 CTA 以 availableActions 為準",
              )}
            </span>
          </div>
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Complaint queue", "客訴佇列")}
          subtitle={copy(
            locale,
            "SLA priority, ownership, escalation, and audit handoff in one triage grid.",
            "在同一張表內整合 SLA 優先序、負責人、升級與稽核交接。",
          )}
        >
          {emptyView ? (
            <div style={emptyStateStyle}>
              <CanvasIcon
                name={emptyView.icon}
                size={26}
                style={{ color: toneColor(emptyView.tone) }}
              />
              <strong style={{ color: theme.text, fontSize: 15 }}>
                {emptyView.title}
              </strong>
              <span
                style={{
                  color: theme.textMuted,
                  maxWidth: 520,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                }}
              >
                {emptyView.description}
              </span>
              <Link
                href={emptyView.actionHref}
                target={emptyView.actionNewTab ? "_blank" : undefined}
                rel={emptyView.actionNewTab ? "noreferrer" : undefined}
                style={linkButtonStyle(emptyView.tone)}
              >
                {emptyView.actionLabel}
                {emptyView.actionNewTab ? (
                  <CanvasIcon name="ext" size={11} />
                ) : null}
              </Link>
              <span style={tinyMetaStyle(emptyView.tone)}>
                {copy(locale, "emptyReason", "空狀態")} ·{" "}
                {EMPTY_OVERRIDE_REASON_CODES[emptyReason ?? "no_data"]}
              </span>
            </div>
          ) : (
            <Table theme={theme} columns={columns} rows={displayedRows} />
          )}
        </Card>
      </div>
    </>
  );
}
