import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  CallSessionRecord,
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  EmptyReason,
  IncidentRecord,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  Timeline,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { ManagementTone, TimelineItem } from "@drts/ui-web";

type ComplaintDetailPageProps = {
  params: Promise<{
    caseNo: string;
  }>;
};

// Packet §5.6 refresh tier — T3 medium (15s).
const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_TIER_INTERVAL_MS = 15_000;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type LoadResult<T> = { ok: true; value: T } | { ok: false; value: T };

async function loadOrFail<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<LoadResult<T>> {
  try {
    const value = await loader();
    return { ok: true, value };
  } catch {
    return { ok: false, value: fallback };
  }
}

async function passThrough<T>(value: T): Promise<LoadResult<T>> {
  return { ok: true, value };
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatShortDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
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

function formatAgeFromNow(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return locale === "en" ? "time unknown" : "時間未知";
  }
  const deltaMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (deltaMinutes < 60) {
    return locale === "en"
      ? `${deltaMinutes} min ago`
      : `${deltaMinutes} 分鐘前`;
  }
  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return locale === "en" ? `${deltaHours} hr ago` : `${deltaHours} 小時前`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return locale === "en" ? `${deltaDays} d ago` : `${deltaDays} 天前`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA computation per packet §5.6 (slaStatus / slaBreachedAt land per app).
// ─────────────────────────────────────────────────────────────────────────────

function deriveSlaStatus(
  record: ComplaintCaseRecord,
): "within_sla" | "warning" | "breached" {
  if (record.slaStatus) {
    return record.slaStatus;
  }
  if (record.slaBreach) {
    return "breached";
  }
  const due = new Date(record.slaDueAt).getTime();
  const now = Date.now();
  if (Number.isFinite(due)) {
    if (now >= due) {
      return "breached";
    }
    if (due - now <= 30 * 60_000) {
      return "warning";
    }
  }
  return "within_sla";
}

function deriveSlaBreachedAt(record: ComplaintCaseRecord): string | null {
  if (record.slaBreachedAt !== undefined) {
    return record.slaBreachedAt;
  }
  return record.slaBreach ? record.updatedAt : null;
}

function getSlaTone(status: "within_sla" | "warning" | "breached"): CanvasTone {
  if (status === "breached") return "danger";
  if (status === "warning") return "warn";
  return "success";
}

function getSeverityTone(
  severity: ComplaintCaseRecord["severity"],
): CanvasTone {
  return severity === "high" ? "danger" : "info";
}

function getStatusTone(status: ComplaintCaseRecord["status"]): CanvasTone {
  if (status === "resolved" || status === "closed") return "success";
  if (status === "reopened") return "warn";
  if (status === "under_investigation" || status === "assigned") return "info";
  return "warn"; // new
}

function getTimelineTone(
  action: ComplaintTimelineEntry["action"],
): ManagementTone {
  if (action === "case_resolved" || action === "case_closed") return "success";
  if (action === "sla_breached" || action === "escalated_to_incident") {
    return "danger";
  }
  if (action === "case_reopened" || action === "incident_linked")
    return "warning";
  if (action === "case_assigned" || action === "case_note_added") return "info";
  return "accent";
}

// ─────────────────────────────────────────────────────────────────────────────
// availableActions descriptors — packet §5.6 must-support set.
// Backend may populate `record.availableActions`; otherwise the page derives
// a safe default from current status / role-neutral defaults.
// ─────────────────────────────────────────────────────────────────────────────

type ComplaintActionKey =
  | "note"
  | "assign"
  | "resolve"
  | "close"
  | "reopen"
  | "escalate"
  | "export"
  | "sla_waiver";

const ACTION_ORDER: ComplaintActionKey[] = [
  "note",
  "assign",
  "resolve",
  "close",
  "reopen",
  "escalate",
  "export",
  "sla_waiver",
];

type IconName =
  | "plus"
  | "users"
  | "check"
  | "warn"
  | "copy"
  | "ext"
  | "arrow"
  | "phone"
  | "filter"
  | "flags"
  | "dashboard";

const ACTION_ICON: Record<ComplaintActionKey, IconName> = {
  note: "plus",
  assign: "users",
  resolve: "check",
  close: "check",
  reopen: "warn",
  escalate: "warn",
  export: "copy",
  sla_waiver: "warn",
};

function getActionLabel(locale: Locale, action: ComplaintActionKey): string {
  switch (action) {
    case "note":
      return t("complaints.addNote", locale);
    case "assign":
      return t("complaints.assignCase", locale);
    case "resolve":
      return t("complaints.resolveCase", locale);
    case "close":
      return t("complaints.close", locale);
    case "reopen":
      return t("complaints.reopenCase", locale);
    case "escalate":
      return t("complaints.escalateToIncident", locale);
    case "export":
      return locale === "en" ? "Export view" : "匯出檢視";
    case "sla_waiver":
      return locale === "en" ? "Manual SLA waiver" : "手動 SLA 豁免";
  }
}

function deriveDefaultActions(
  record: ComplaintCaseRecord,
  hasExport: boolean,
): ResourceActionDescriptor[] {
  const status = record.status;
  const closed = status === "closed";
  const resolved = status === "resolved";
  const escalated = Boolean(record.relatedIncidentId);
  return [
    {
      action: "note",
      enabled: !closed,
      riskLevel: "low",
    },
    {
      action: "assign",
      enabled: !closed,
      riskLevel: "medium",
    },
    {
      action: "resolve",
      enabled: !closed && !resolved && !escalated,
      ...(closed || resolved
        ? { disabledReasonCode: "complaint_terminal" }
        : escalated
          ? { disabledReasonCode: "complaint_escalated" }
          : {}),
      riskLevel: "medium",
    },
    {
      action: "close",
      enabled: resolved,
      ...(resolved ? {} : { disabledReasonCode: "complaint_not_resolved" }),
      riskLevel: "medium",
    },
    {
      action: "reopen",
      enabled: resolved || closed,
      ...(resolved || closed
        ? {}
        : { disabledReasonCode: "complaint_not_terminal" }),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "escalate",
      enabled: !escalated && !closed,
      ...(escalated
        ? { disabledReasonCode: "already_escalated" }
        : closed
          ? { disabledReasonCode: "complaint_terminal" }
          : {}),
      requiresReason: true,
      riskLevel: "high",
    },
    {
      action: "export",
      enabled: hasExport,
      ...(hasExport ? {} : { disabledReasonCode: "export_not_ready" }),
      riskLevel: "low",
    },
    {
      action: "sla_waiver",
      enabled: deriveSlaStatus(record) !== "within_sla",
      ...(deriveSlaStatus(record) === "within_sla"
        ? { disabledReasonCode: "no_sla_breach" }
        : {}),
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function resolveDescriptors(
  record: ComplaintCaseRecord,
  hasExport: boolean,
): Map<ComplaintActionKey, ResourceActionDescriptor> {
  const fromBackend = record.availableActions ?? [];
  const defaults = deriveDefaultActions(record, hasExport);
  const map = new Map<ComplaintActionKey, ResourceActionDescriptor>();
  for (const d of defaults) {
    map.set(d.action as ComplaintActionKey, d);
  }
  for (const d of fromBackend) {
    if (ACTION_ORDER.includes(d.action as ComplaintActionKey)) {
      map.set(d.action as ComplaintActionKey, d);
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// EmptyState — six distinct visuals per ui-runtime.ts EmptyReason
// (driver_not_eligible is driver-app only; not surfaced in ops console).
// ─────────────────────────────────────────────────────────────────────────────

type EmptyStateConfig = {
  icon: IconName;
  tone: "info" | "warn" | "danger" | "success" | "muted";
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
};

const EMPTY_STATE_CONFIG: Record<
  Exclude<EmptyReason, "driver_not_eligible">,
  EmptyStateConfig
> = {
  no_data: {
    icon: "dashboard",
    tone: "muted",
    titleEn: "No data yet",
    titleZh: "尚無資料",
    bodyEn: "Nothing has been recorded for this section.",
    bodyZh: "此區段目前沒有任何紀錄。",
  },
  not_provisioned: {
    icon: "plus",
    tone: "info",
    titleEn: "Not provisioned",
    titleZh: "尚未啟用",
    bodyEn: "This capability has not been set up for the case yet.",
    bodyZh: "此能力尚未在本案件上啟用。",
  },
  fetch_failed: {
    icon: "warn",
    tone: "danger",
    titleEn: "Fetch failed",
    titleZh: "讀取失敗",
    bodyEn: "We could not load this section. Retry from the chrome refresh.",
    bodyZh: "此區段讀取失敗，請使用上方刷新重試。",
  },
  permission_denied: {
    icon: "flags",
    tone: "warn",
    titleEn: "Permission denied",
    titleZh: "權限不足",
    bodyEn:
      "Your role cannot view this content. Audit deep link available for compliance review.",
    bodyZh: "您的角色無權檢視此內容。合規人員可使用稽核深連結。",
  },
  external_unavailable: {
    icon: "ext",
    tone: "warn",
    titleEn: "External system unavailable",
    titleZh: "外部系統暫時無法使用",
    bodyEn:
      "An upstream provider (CTI, recording, audit) is degraded. Showing last known state.",
    bodyZh: "上游服務（CTI、錄音、稽核）暫時降級，顯示為最後已知狀態。",
  },
  filtered_empty: {
    icon: "filter",
    tone: "info",
    titleEn: "Nothing matches the filter",
    titleZh: "符合條件的紀錄為空",
    bodyEn: "Loosen the filter to see additional records.",
    bodyZh: "請放寬條件以檢視更多紀錄。",
  },
};

const EMPTY_TONE_STYLES: Record<
  EmptyStateConfig["tone"],
  { background: string; border: string; text: string; accent: string }
> = {
  info: {
    background: "rgba(59, 130, 246, 0.10)",
    border: "rgba(59, 130, 246, 0.35)",
    text: "#cbd5e1",
    accent: "#60a5fa",
  },
  warn: {
    background: "rgba(245, 158, 11, 0.10)",
    border: "rgba(245, 158, 11, 0.35)",
    text: "#fde68a",
    accent: "#fbbf24",
  },
  danger: {
    background: "rgba(248, 113, 113, 0.10)",
    border: "rgba(248, 113, 113, 0.35)",
    text: "#fecaca",
    accent: "#f87171",
  },
  success: {
    background: "rgba(34, 197, 94, 0.10)",
    border: "rgba(34, 197, 94, 0.35)",
    text: "#bbf7d0",
    accent: "#4ade80",
  },
  muted: {
    background: "rgba(148, 163, 184, 0.08)",
    border: "rgba(148, 163, 184, 0.25)",
    text: "#cbd5e1",
    accent: "#94a3b8",
  },
};

function EmptyState({
  reason,
  locale,
  bodyOverride,
}: {
  reason: Exclude<EmptyReason, "driver_not_eligible">;
  locale: Locale;
  bodyOverride?: string;
}) {
  const config = EMPTY_STATE_CONFIG[reason];
  const tone = EMPTY_TONE_STYLES[config.tone];
  return (
    <div
      data-empty-reason={reason}
      style={{
        display: "grid",
        gap: "6px",
        padding: "12px 14px",
        background: tone.background,
        border: `1px dashed ${tone.border}`,
        borderRadius: 8,
        color: tone.text,
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <CanvasIcon name={config.icon} size={14} />
        <strong style={{ color: tone.accent, fontWeight: 600 }}>
          {locale === "en" ? config.titleEn : config.titleZh}
        </strong>
        <span
          style={{
            marginLeft: "auto",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: 10.5,
            color: tone.accent,
            opacity: 0.85,
          }}
        >
          {reason}
        </span>
      </div>
      <span>
        {bodyOverride ?? (locale === "en" ? config.bodyEn : config.bodyZh)}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionButton — renders a CTA from a ResourceActionDescriptor (Q-X13).
// ─────────────────────────────────────────────────────────────────────────────

function actionButtonStyle(
  base: CanvasTheme,
  enabled: boolean,
  variant: "primary" | "secondary" | "danger",
): CSSProperties {
  if (!enabled) {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: "rgba(148,163,184,0.12)",
      color: "#94a3b8",
      border: "1px dashed rgba(148,163,184,0.35)",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
      cursor: "not-allowed",
    } as CSSProperties;
  }

  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: base.accent,
      color: "#ffffff",
      border: `1px solid ${base.accent}`,
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
    } as CSSProperties;
  }

  if (variant === "danger") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: "rgba(248,113,113,0.12)",
      color: "#fecaca",
      border: "1px solid rgba(248,113,113,0.5)",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
    } as CSSProperties;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    background: base.surface,
    color: base.text,
    border: `1px solid ${base.border}`,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
  } as CSSProperties;
}

function ActionButton({
  descriptor,
  label,
  iconName,
  locale,
}: {
  descriptor: ResourceActionDescriptor;
  label: string;
  iconName: IconName;
  locale: Locale;
}) {
  const variant: "primary" | "secondary" | "danger" =
    descriptor.riskLevel === "high"
      ? "danger"
      : descriptor.riskLevel === "medium"
        ? "primary"
        : "secondary";
  const style = actionButtonStyle(theme, descriptor.enabled, variant);
  const tooltip =
    !descriptor.enabled && descriptor.disabledReasonCode
      ? locale === "en"
        ? `Disabled: ${descriptor.disabledReasonCode}`
        : `已停用：${descriptor.disabledReasonCode}`
      : descriptor.requiresReason && descriptor.enabled
        ? locale === "en"
          ? "Confirmation reason required"
          : "需要填寫原因"
        : undefined;
  return (
    <span
      title={tooltip}
      data-action={descriptor.action}
      data-enabled={descriptor.enabled}
      data-risk={descriptor.riskLevel}
      style={style}
    >
      <CanvasIcon name={iconName} size={12} />
      <span>{label}</span>
      {descriptor.requiresReason && descriptor.enabled ? (
        <span
          aria-hidden
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.3,
            opacity: 0.85,
          }}
        >
          *
        </span>
      ) : null}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-app / intra-app deep link button
// ─────────────────────────────────────────────────────────────────────────────

function deepLinkStyle(base: CanvasTheme): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    background: base.surface,
    color: base.text,
    border: `1px solid ${base.border}`,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  } as CSSProperties;
}

function DeepLink({
  href,
  label,
  iconName = "ext",
  external = false,
}: {
  href: string;
  label: string;
  iconName?: IconName;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={deepLinkStyle(theme)}
      >
        <CanvasIcon name={iconName} size={12} />
        <span>{label}</span>
      </a>
    );
  }
  return (
    <Link href={href} style={deepLinkStyle(theme)}>
      <CanvasIcon name={iconName} size={12} />
      <span>{label}</span>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function ComplaintDetailPage({
  params,
}: ComplaintDetailPageProps) {
  const [{ caseNo }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const complaintResult = await loadOrFail(
    () => client.getComplaint(caseNo),
    null as ComplaintCaseRecord | null,
  );
  if (!complaintResult.ok || !complaintResult.value) {
    notFound();
  }
  const complaint = complaintResult.value;

  const [
    timelineResult,
    exportResult,
    auditResult,
    relatedCallResult,
    relatedIncidentResult,
  ] = await Promise.all([
    loadOrFail(
      () => client.getComplaintTimeline(caseNo),
      [] as ComplaintTimelineEntry[],
    ),
    loadOrFail(
      () => client.getComplaintExportView(caseNo),
      null as ComplaintExportViewRecord | null,
    ),
    loadOrFail(() => client.listAuditLogs(), [] as AuditLogRecord[]),
    complaint.relatedCallId
      ? loadOrFail(
          () => client.getCallSession(complaint.relatedCallId as string),
          null as CallSessionRecord | null,
        )
      : passThrough(null as CallSessionRecord | null),
    complaint.relatedIncidentId
      ? loadOrFail(
          () => client.getIncident(complaint.relatedIncidentId as string),
          null as IncidentRecord | null,
        )
      : passThrough(null as IncidentRecord | null),
  ]);

  const slaStatus = deriveSlaStatus(complaint);
  const slaBreachedAt = deriveSlaBreachedAt(complaint);
  const slaTone = getSlaTone(slaStatus);
  const severityTone = getSeverityTone(complaint.severity);
  const statusTone = getStatusTone(complaint.status);
  const isClosed =
    complaint.status === "closed" || complaint.status === "resolved";
  const isEscalated = Boolean(complaint.relatedIncidentId);
  const isReopened = complaint.status === "reopened";

  const descriptors = resolveDescriptors(
    complaint,
    Boolean(exportResult.ok && exportResult.value),
  );

  // ── Filter audit log subset to this case ────────────────────────────────
  const auditSubset =
    auditResult.ok && auditResult.value
      ? auditResult.value
          .filter(
            (entry) =>
              entry.resourceType === "complaint_case" &&
              entry.resourceId === complaint.caseNo,
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
      : [];

  // ── Timeline items ─────────────────────────────────────────────────────
  const timelineEntries =
    timelineResult.ok && timelineResult.value ? timelineResult.value : [];
  const timelineItems: TimelineItem[] = [...timelineEntries]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((entry) => ({
      id: entry.entryId,
      title: formatOpsCodeLabel(locale, entry.action),
      detail: entry.note,
      timestamp: formatShortDateTime(locale, entry.createdAt),
      tone: getTimelineTone(entry.action),
      eyebrow: entry.caseNo,
    }));

  // ── Header banner — status-aware ────────────────────────────────────────
  const bannerTone: CanvasTone =
    slaStatus === "breached"
      ? "danger"
      : slaStatus === "warning"
        ? "warn"
        : isEscalated
          ? "danger"
          : isClosed
            ? "success"
            : isReopened
              ? "warn"
              : "info";

  const bannerTitle =
    slaStatus === "breached"
      ? locale === "en"
        ? `SLA breached at ${formatShortDateTime(locale, slaBreachedAt)}`
        : `SLA 已於 ${formatShortDateTime(locale, slaBreachedAt)} 違規`
      : slaStatus === "warning"
        ? locale === "en"
          ? `SLA window closing — due ${formatShortDateTime(locale, complaint.slaDueAt)}`
          : `SLA 即將到期 — 截止 ${formatShortDateTime(locale, complaint.slaDueAt)}`
        : isEscalated
          ? locale === "en"
            ? "Case escalated to incident — read-only context"
            : "案件已升級為事故 — 僅供唯讀檢視"
          : isClosed
            ? locale === "en"
              ? "Case closed — audit-export packet view"
              : "案件已結案 — 進入稽核匯出檢視"
            : isReopened
              ? locale === "en"
                ? `Case reopened (${complaint.reopenCount}x) — investigate root cause`
                : `案件已重啟（${complaint.reopenCount} 次）— 請調查根因`
              : locale === "en"
                ? "Active complaint — manage SLA and timeline"
                : "進行中客訴 — 管理 SLA 與時間軸";

  const bannerBody = [
    complaint.assigneeId
      ? locale === "en"
        ? `Assigned to ${complaint.assigneeId}`
        : `目前由 ${complaint.assigneeId} 處理`
      : locale === "en"
        ? "Unassigned"
        : "未指派",
    complaint.relatedOrderId
      ? `${locale === "en" ? "Order" : "訂單"} ${complaint.relatedOrderId}`
      : null,
    complaint.relatedCallId
      ? `${locale === "en" ? "Call" : "通話"} ${complaint.relatedCallId}`
      : null,
    complaint.relatedIncidentId
      ? `${locale === "en" ? "Incident" : "事故"} ${complaint.relatedIncidentId}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // ── Case summary DL items ──────────────────────────────────────────────
  const summaryItems = [
    { k: locale === "en" ? "Case" : "案件", v: complaint.caseNo, mono: true },
    {
      k: locale === "en" ? "Opened" : "建立時間",
      v: formatDateTime(locale, complaint.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Updated" : "更新時間",
      v: `${formatShortDateTime(locale, complaint.updatedAt)} · ${formatAgeFromNow(
        locale,
        complaint.updatedAt,
      )}`,
    },
    {
      k: locale === "en" ? "Source" : "來源",
      v: formatOpsCodeLabel(locale, complaint.caseSource),
    },
    {
      k: locale === "en" ? "Category" : "類別",
      v: formatOpsCodeLabel(locale, complaint.category),
      mono: true,
    },
    {
      k: locale === "en" ? "Severity" : "嚴重程度",
      v: (
        <Pill theme={theme} tone={severityTone} dot>
          {formatOpsCodeLabel(locale, complaint.severity)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v: (
        <Pill theme={theme} tone={statusTone} dot>
          {formatOpsCodeLabel(locale, complaint.status)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Assignee" : "負責人",
      v: complaint.assigneeId ?? t("complaints.unassigned", locale),
      mono: Boolean(complaint.assigneeId),
    },
    {
      k: locale === "en" ? "SLA status" : "SLA 狀態",
      v: (
        <Pill theme={theme} tone={slaTone} dot>
          {slaStatus}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "SLA due" : "SLA 截止",
      v: formatDateTime(locale, complaint.slaDueAt),
      mono: true,
    },
    {
      k: locale === "en" ? "SLA breached at" : "SLA 違規時間",
      v: slaBreachedAt ? formatDateTime(locale, slaBreachedAt) : "—",
      mono: Boolean(slaBreachedAt),
    },
    {
      k: t("complaints.detail.reopenCount", locale),
      v: String(complaint.reopenCount),
      mono: true,
    },
  ];

  // ── Linked entities ─────────────────────────────────────────────────────
  const linkedItems = [
    {
      k: locale === "en" ? "Related order" : "相關訂單",
      v: complaint.relatedOrderId ? (
        <Link
          href={`/dispatch?orderId=${encodeURIComponent(complaint.relatedOrderId)}`}
          style={{ color: theme.accent, fontFamily: theme.monoFamily }}
        >
          {complaint.relatedOrderId} →
        </Link>
      ) : (
        "—"
      ),
      mono: !complaint.relatedOrderId,
    },
    {
      k: locale === "en" ? "Related call" : "相關通話",
      v: complaint.relatedCallId ? (
        <Link
          href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
          style={{ color: theme.accent, fontFamily: theme.monoFamily }}
        >
          {complaint.relatedCallId} →
        </Link>
      ) : (
        "—"
      ),
      mono: !complaint.relatedCallId,
    },
    {
      k: locale === "en" ? "Related incident" : "相關事故",
      v: complaint.relatedIncidentId ? (
        <Link
          href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
          style={{ color: theme.accent, fontFamily: theme.monoFamily }}
        >
          {complaint.relatedIncidentId} →
        </Link>
      ) : (
        "—"
      ),
      mono: !complaint.relatedIncidentId,
    },
  ];

  // ── Recording panel state (EmptyReason-aware) ──────────────────────────
  const relatedCall =
    relatedCallResult.ok && relatedCallResult.value
      ? relatedCallResult.value
      : null;
  const callFetchFailed = !relatedCallResult.ok;
  let recordingNode: ReactNode;
  if (!complaint.relatedCallId) {
    recordingNode = <EmptyState reason="no_data" locale={locale} />;
  } else if (callFetchFailed) {
    recordingNode = <EmptyState reason="fetch_failed" locale={locale} />;
  } else if (!relatedCall) {
    recordingNode = (
      <EmptyState reason="external_unavailable" locale={locale} />
    );
  } else if (!relatedCall.recordingId) {
    recordingNode = (
      <EmptyState
        reason="external_unavailable"
        locale={locale}
        bodyOverride={
          locale === "en"
            ? "Recording provider has not delivered the artifact callback yet (PII-masked playback gates on recording_id)."
            : "錄音供應商尚未回傳 callback，PII 遮罩播放需待 recording_id 就緒。"
        }
      />
    );
  } else {
    recordingNode = (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 10,
          background: theme.surfaceLo,
          borderRadius: 7,
        }}
      >
        <CanvasIcon name="phone" size={14} />
        <span
          style={{
            flex: 1,
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
            color: theme.text,
          }}
        >
          {relatedCall.recordingId}
        </span>
        <Btn theme={theme} size="xs" icon="ext">
          {locale === "en" ? "Play (PII masked)" : "播放（PII 遮罩）"}
        </Btn>
      </div>
    );
  }

  // ── Recovery notes (closingNote + status) ───────────────────────────────
  let recoveryNode: ReactNode;
  if (complaint.closingNote) {
    recoveryNode = (
      <div
        style={{
          color: theme.text,
          fontSize: 12.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {complaint.closingNote}
      </div>
    );
  } else if (complaint.status === "new") {
    recoveryNode = (
      <EmptyState
        reason="not_provisioned"
        locale={locale}
        bodyOverride={
          locale === "en"
            ? "Service recovery action has not been planned yet. Assign first to enable recovery workflow."
            : "尚未規劃 service recovery action。請先指派負責人以啟動恢復流程。"
        }
      />
    );
  } else {
    recoveryNode = <EmptyState reason="no_data" locale={locale} />;
  }

  // ── Linked incident (escalation) sub-state ──────────────────────────────
  const relatedIncident =
    relatedIncidentResult.ok && relatedIncidentResult.value
      ? relatedIncidentResult.value
      : null;
  let escalationNode: ReactNode;
  if (!complaint.relatedIncidentId) {
    escalationNode = (
      <EmptyState
        reason="not_provisioned"
        locale={locale}
        bodyOverride={
          locale === "en"
            ? "Case has not been escalated. Use escalate-to-incident to open an investigation channel."
            : "尚未升級為事故。需要時可使用「升級為事故」開啟調查通道。"
        }
      />
    );
  } else if (!relatedIncidentResult.ok) {
    escalationNode = <EmptyState reason="fetch_failed" locale={locale} />;
  } else if (!relatedIncident) {
    escalationNode = (
      <EmptyState reason="external_unavailable" locale={locale} />
    );
  } else {
    escalationNode = (
      <DL
        theme={theme}
        cols={1}
        items={[
          {
            k: locale === "en" ? "Incident" : "事故",
            v: (
              <Link
                href={`/incidents/${encodeURIComponent(relatedIncident.incidentId)}`}
                style={{ color: theme.accent, fontFamily: theme.monoFamily }}
              >
                {relatedIncident.incidentId} · {relatedIncident.title} →
              </Link>
            ),
          },
          {
            k: locale === "en" ? "Severity" : "嚴重程度",
            v: (
              <Pill
                theme={theme}
                tone={
                  relatedIncident.severity === "critical" ||
                  relatedIncident.severity === "high"
                    ? "danger"
                    : "warn"
                }
                dot
              >
                {formatOpsCodeLabel(locale, relatedIncident.severity)}
              </Pill>
            ),
          },
          {
            k: locale === "en" ? "Status" : "狀態",
            v: (
              <Pill theme={theme} tone="info" dot>
                {formatOpsCodeLabel(locale, relatedIncident.status)}
              </Pill>
            ),
          },
        ]}
      />
    );
  }

  // ── Audit subset (permission-denied + filtered_empty handling) ──────────
  let auditNode: ReactNode;
  if (!auditResult.ok) {
    auditNode = <EmptyState reason="permission_denied" locale={locale} />;
  } else if (auditResult.value.length === 0) {
    auditNode = <EmptyState reason="fetch_failed" locale={locale} />;
  } else if (auditSubset.length === 0) {
    auditNode = <EmptyState reason="filtered_empty" locale={locale} />;
  } else {
    auditNode = (
      <DL
        theme={theme}
        cols={1}
        items={auditSubset.slice(0, 5).map((entry) => ({
          k: `${formatShortDateTime(locale, entry.createdAt)} · ${formatOpsCodeLabel(
            locale,
            entry.actionName,
          )}`,
          v: (
            <div style={{ display: "grid", gap: 4 }}>
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontSize: 11.5,
                  color: theme.text,
                }}
              >
                {entry.requestId}
              </span>
              <span style={{ color: theme.textMuted, fontSize: 12 }}>
                {entry.actorId ?? entry.actorType}
              </span>
            </div>
          ),
        }))}
      />
    );
  }

  // ── Export view ────────────────────────────────────────────────────────
  const exportView =
    exportResult.ok && exportResult.value ? exportResult.value : null;
  const exportNode = exportView ? (
    <DL
      theme={theme}
      cols={1}
      items={[
        {
          k: locale === "en" ? "Generated at" : "生成時間",
          v: formatDateTime(locale, exportView.exportGeneratedAt),
          mono: true,
        },
        {
          k: locale === "en" ? "Audit-ready" : "稽核就緒",
          v: (
            <Pill
              theme={theme}
              tone={exportView.readyForAudit ? "success" : "warn"}
              dot
            >
              {exportView.readyForAudit
                ? t("complaints.readyForAudit", locale)
                : t("complaints.notExportReady", locale)}
            </Pill>
          ),
        },
        {
          k: locale === "en" ? "Timeline entries" : "時間軸筆數",
          v: String(exportView.timeline.length),
          mono: true,
        },
      ]}
    />
  ) : !exportResult.ok ? (
    <EmptyState reason="fetch_failed" locale={locale} />
  ) : (
    <EmptyState reason="not_provisioned" locale={locale} />
  );

  // ── Navigation deep links — packet §3.4 / §5.6 exits ────────────────────
  const navLinks: ReactNode[] = [
    <DeepLink
      key="back"
      href="/complaints"
      iconName="arrow"
      label={t("nav.complaints", locale)}
    />,
  ];
  if (complaint.relatedOrderId) {
    navLinks.push(
      <DeepLink
        key="order"
        href={`/dispatch?orderId=${encodeURIComponent(complaint.relatedOrderId)}`}
        label={`${getOpsLabel(locale, "order")} ${complaint.relatedOrderId}`}
      />,
    );
  }
  if (complaint.relatedCallId) {
    navLinks.push(
      <DeepLink
        key="call"
        href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
        label={`${locale === "en" ? "Call" : "通話"} ${complaint.relatedCallId}`}
      />,
    );
  }
  if (complaint.relatedIncidentId) {
    navLinks.push(
      <DeepLink
        key="incident"
        href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
        label={`${locale === "en" ? "Incident" : "事故"} ${complaint.relatedIncidentId}`}
      />,
    );
  }

  // ── Page header ────────────────────────────────────────────────────────
  const headerTitle = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span style={{ fontFamily: theme.monoFamily }}>{complaint.caseNo}</span>
      <Pill theme={theme} tone={slaTone} dot>
        SLA {slaStatus}
      </Pill>
      <Pill theme={theme} tone={severityTone}>
        {formatOpsCodeLabel(locale, complaint.severity)}
      </Pill>
      {isReopened ? (
        <Pill theme={theme} tone="warn" dot>
          {locale === "en"
            ? `reopened ${complaint.reopenCount}x`
            : `已重啟 ${complaint.reopenCount} 次`}
        </Pill>
      ) : null}
      {isEscalated ? (
        <Pill theme={theme} tone="danger" dot>
          {locale === "en" ? "escalated" : "已升級"}
        </Pill>
      ) : null}
    </span>
  );

  const headerSubtitle = [
    formatOpsCodeLabel(locale, complaint.category),
    formatOpsCodeLabel(locale, complaint.status),
    formatDateTime(locale, complaint.createdAt),
    `T3 · ${REFRESH_TIER} · ${Math.round(REFRESH_TIER_INTERVAL_MS / 1000)}s`,
  ].join(" · ");

  const headerActions = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      {ACTION_ORDER.map((key) => {
        const descriptor = descriptors.get(key);
        if (!descriptor) return null;
        return (
          <ActionButton
            key={key}
            descriptor={descriptor}
            label={getActionLabel(locale, key)}
            iconName={ACTION_ICON[key]}
            locale={locale}
          />
        );
      })}
    </div>
  );

  return (
    <>
      <PageHeader
        theme={theme}
        title={headerTitle}
        subtitle={headerSubtitle}
        actions={headerActions}
      />

      <div style={{ padding: 24 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          {/* Left column */}
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Banner
              theme={theme}
              tone={bannerTone}
              icon={bannerTone === "success" ? "check" : "warn"}
              title={bannerTitle}
              body={bannerBody || complaint.description}
            />

            <Card
              theme={theme}
              title={locale === "en" ? "Case summary" : "案件摘要"}
            >
              <DL theme={theme} cols={3} items={summaryItems} />
              <div style={{ height: 14 }} />
              <Field
                theme={theme}
                label={t("complaints.form.description", locale)}
              >
                <div
                  style={{
                    color: theme.text,
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {complaint.description}
                </div>
              </Field>
              {complaint.resolutionCode ? (
                <>
                  <div style={{ height: 12 }} />
                  <Field
                    theme={theme}
                    label={t("complaints.detail.resolution", locale)}
                  >
                    <Pill theme={theme} tone="success" dot>
                      {formatOpsCodeLabel(locale, complaint.resolutionCode)}
                    </Pill>
                  </Field>
                </>
              ) : null}
            </Card>

            <Card
              theme={theme}
              title={
                locale === "en" ? "Timeline · cross-actor" : "時間軸 · 跨角色"
              }
            >
              {!timelineResult.ok ? (
                <EmptyState reason="fetch_failed" locale={locale} />
              ) : timelineItems.length === 0 ? (
                <EmptyState reason="no_data" locale={locale} />
              ) : (
                <Timeline
                  density="compact"
                  items={timelineItems}
                  emptyState={t("complaints.timelineEmpty", locale)}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={
                locale === "en" ? "Audit trail (subset)" : "稽核紀錄（子集）"
              }
            >
              {auditNode}
            </Card>
          </div>

          {/* Right column */}
          <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
            <Card
              theme={theme}
              title={
                locale === "en" ? "Recording · PII masked" : "錄音 · PII 已遮罩"
              }
            >
              {recordingNode}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Linked entities" : "關聯實體"}
            >
              <DL theme={theme} cols={1} items={linkedItems} />
            </Card>

            <Card
              theme={theme}
              title={
                locale === "en"
                  ? "Escalation · linked incident"
                  : "升級 · 關聯事故"
              }
            >
              {escalationNode}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Recovery notes" : "復原備註"}
            >
              {recoveryNode}
            </Card>

            <Card theme={theme} title={t("complaints.timelineExport", locale)}>
              {exportNode}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Navigation" : "導覽"}
              padding={14}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {navLinks}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
