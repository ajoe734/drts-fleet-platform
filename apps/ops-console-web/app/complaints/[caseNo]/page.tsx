import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type {
  AuditLogRecord,
  CallSessionRecord,
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  EmptyReason,
  IncidentRecord,
  OwnedOrderRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  Timeline,
  buildCanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { ManagementTone, TimelineItem } from "@drts/ui-web";
import ComplaintDetailActionWorkspace from "./complaint-detail-action-workspace";

type ComplaintDetailPageProps = {
  params: Promise<{
    caseNo: string;
  }>;
};

type ActionId =
  | "add_note"
  | "assign"
  | "resolve"
  | "close"
  | "reopen"
  | "escalate_to_incident"
  | "export"
  | "manual_sla_waiver";

type LoadResult<T> = {
  data: T | null;
  error: Error | null;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";

async function loadOptional<T>(loader: () => Promise<T>): Promise<LoadResult<T>> {
  try {
    return {
      data: await loader(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function copyText(locale: Locale, en: string, zh: string) {
  return locale === "en" ? en : zh;
}

function getErrorStatus(error: Error | null) {
  if (!error) {
    return null;
  }
  const matched = error.message.match(/API error (\d+):/);
  return matched ? Number.parseInt(matched[1] ?? "", 10) : null;
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

function formatRelativeDue(locale: Locale, value: string) {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );

  if (deltaMinutes >= 0) {
    return copyText(
      locale,
      `Due in ${deltaMinutes} min`,
      `剩餘 ${deltaMinutes} 分鐘`,
    );
  }

  return copyText(
    locale,
    `Breached by ${Math.abs(deltaMinutes)} min`,
    `已逾期 ${Math.abs(deltaMinutes)} 分鐘`,
  );
}

function maskPhone(phone: string | null | undefined) {
  if (!phone) {
    return "—";
  }
  if (phone.length <= 4) {
    return phone;
  }
  return `${phone.slice(0, 4)}-•••-${phone.slice(-3)}`;
}

function maskIdentifier(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  if (value.length <= 7) {
    return `•••${value.slice(-4)}`;
  }
  return `${value.slice(0, 3)}•••${value.slice(-4)}`;
}

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
) {
  const styles = {
    primary: {
      background: theme.accent,
      borderColor: theme.accent,
      color: "#ffffff",
    },
    secondary: {
      background: theme.surface,
      borderColor: theme.border,
      color: theme.text,
    },
    ghost: {
      background: "transparent",
      borderColor: "transparent",
      color: theme.textMuted,
    },
  } as const;

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "30px",
    padding: "7px 11px",
    borderRadius: "8px",
    border: `1px solid ${styles[variant].borderColor}`,
    background: disabled ? theme.surfaceLo : styles[variant].background,
    color: disabled ? theme.textMuted : styles[variant].color,
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1.1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.72 : 1,
  } as const;
}

function getComplaintStatusTone(status: ComplaintCaseRecord["status"]): CanvasTone {
  if (status === "closed" || status === "resolved") {
    return "success";
  }
  if (status === "reopened") {
    return "warn";
  }
  return "info";
}

function getComplaintSeverityTone(
  severity: ComplaintCaseRecord["severity"],
): CanvasTone {
  return severity === "high" ? "danger" : "info";
}

function getSlaTone(slaStatus: "within_sla" | "warning" | "breached"): CanvasTone {
  if (slaStatus === "breached") {
    return "danger";
  }
  if (slaStatus === "warning") {
    return "warn";
  }
  return "success";
}

function getTimelineTone(action: ComplaintTimelineEntry["action"]): ManagementTone {
  if (action === "case_closed" || action === "case_resolved") {
    return "success";
  }
  if (action === "sla_breached" || action === "escalated_to_incident") {
    return "danger";
  }
  if (action === "case_reopened" || action === "incident_linked") {
    return "warning";
  }
  if (action === "case_note_added") {
    return "info";
  }
  return "accent";
}

function getTimelineActionLabel(
  locale: Locale,
  action: ComplaintTimelineEntry["action"],
) {
  switch (action) {
    case "case_created":
      return copyText(locale, "Case created", "案件建立");
    case "case_assigned":
      return copyText(locale, "Assigned", "完成指派");
    case "case_note_added":
      return copyText(locale, "Note added", "新增備註");
    case "case_reopened":
      return copyText(locale, "Case reopened", "案件重開");
    case "sla_breached":
      return copyText(locale, "SLA breached", "SLA 逾期");
    case "sla_recalculated":
      return copyText(locale, "SLA recalculated", "SLA 重新計算");
    case "case_resolved":
      return copyText(locale, "Resolved", "標記已處理");
    case "case_closed":
      return copyText(locale, "Closed", "正式關閉");
    case "escalated_to_incident":
      return copyText(locale, "Escalated to incident", "升級為事故");
    case "incident_linked":
      return copyText(locale, "Incident linked", "已連結事故");
    default:
      return action;
  }
}

function getActionLabel(
  locale: Locale,
  action: ActionId,
  complaint: ComplaintCaseRecord,
) {
  switch (action) {
    case "add_note":
      return copyText(locale, "Add note", "新增備註");
    case "assign":
      return complaint.assigneeId
        ? copyText(locale, "Reassign", "重新指派")
        : copyText(locale, "Assign", "指派");
    case "resolve":
      return copyText(locale, "Resolve", "標記已處理");
    case "close":
      return copyText(locale, "Close", "正式關閉");
    case "reopen":
      return copyText(locale, "Reopen", "重開案件");
    case "escalate_to_incident":
      return copyText(locale, "Escalate", "升級事故");
    case "export":
      return copyText(locale, "Export", "匯出");
    case "manual_sla_waiver":
      return copyText(locale, "Manual SLA waiver", "人工 SLA waiver");
    default:
      return action;
  }
}

function getDisabledReasonLabel(locale: Locale, code?: string) {
  switch (code) {
    case "case_read_only":
      return copyText(locale, "Read-only after resolution.", "案件進入唯讀狀態。");
    case "requires_resolution":
      return copyText(locale, "Resolve before close.", "請先完成處理再關閉。");
    case "already_linked_incident":
      return copyText(locale, "Incident already linked.", "已連結事故。");
    case "artifact_not_ready":
      return copyText(locale, "Artifact available after closeout.", "完成關閉後才會產出匯出憑證。");
    case "restricted_role":
      return copyText(locale, "Restricted role required.", "需具備受限角色權限。");
    case "closed_case_only":
      return copyText(locale, "Only closed cases may reopen.", "僅已關閉案件可重開。");
    default:
      return copyText(locale, "Currently unavailable.", "目前不可執行。");
  }
}

function getReporterSummary(
  locale: Locale,
  complaint: ComplaintCaseRecord,
  relatedOrder: OwnedOrderRecord | null,
  relatedCall: CallSessionRecord | null,
) {
  if (relatedOrder?.bookedBy?.name) {
    return {
      primary: relatedOrder.bookedBy.name,
      secondary:
        relatedOrder.bookedBy.email ??
        copyText(locale, "Order-origin reporter", "訂單來源回報"),
    };
  }

  if (relatedCall?.callerPhone) {
    return {
      primary: copyText(locale, "Phone intake", "電話客訴"),
      secondary: maskPhone(relatedCall.callerPhone),
    };
  }

  return {
    primary: copyText(locale, "Platform intake", "平台建立"),
    secondary: formatOpsCodeLabel(locale, complaint.caseSource),
  };
}

function getTenantLabel(order: OwnedOrderRecord | null) {
  if (!order) {
    return null;
  }

  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function buildAvailableActions(
  complaint: ComplaintCaseRecord,
  exportView: ComplaintExportViewRecord | null,
): ResourceActionDescriptor[] {
  const isClosed = complaint.status === "closed";
  const isResolved = complaint.status === "resolved";
  const isReadOnly = isClosed || isResolved;
  const maybeOptionalFields = (
    disabledReasonCode?: string,
    requiresReason = false,
  ) => ({
    ...(disabledReasonCode ? { disabledReasonCode } : {}),
    ...(requiresReason ? { requiresReason: true } : {}),
  });

  const withOptionalFields = (
    descriptor: ResourceActionDescriptor,
    optional: {
      disabledReasonCode?: string;
      requiresReason?: boolean;
    } = {},
  ): ResourceActionDescriptor => ({
    ...descriptor,
    ...(optional.disabledReasonCode
      ? { disabledReasonCode: optional.disabledReasonCode }
      : {}),
    ...(optional.requiresReason ? { requiresReason: true } : {}),
  });

  return [
    withOptionalFields({
      action: "add_note",
      enabled: !isReadOnly,
      riskLevel: "low",
    }, maybeOptionalFields(isReadOnly ? "case_read_only" : undefined)),
    withOptionalFields({
      action: "assign",
      enabled: !isReadOnly,
      riskLevel: "medium",
    }, maybeOptionalFields(isReadOnly ? "case_read_only" : undefined)),
    withOptionalFields({
      action: "resolve",
      enabled: !isReadOnly,
      riskLevel: "medium",
    }, maybeOptionalFields(isReadOnly ? "case_read_only" : undefined)),
    withOptionalFields({
      action: "close",
      enabled: !isClosed && isResolved,
      riskLevel: "medium",
    }, maybeOptionalFields(
      isClosed
        ? "case_read_only"
        : !isResolved
          ? "requires_resolution"
          : undefined,
    )),
    withOptionalFields({
      action: "reopen",
      enabled: isClosed,
      riskLevel: "high",
    }, maybeOptionalFields(
      isClosed ? undefined : "closed_case_only",
      true,
    )),
    withOptionalFields({
      action: "escalate_to_incident",
      enabled: !isReadOnly && !complaint.relatedIncidentId,
      riskLevel: "high",
    }, maybeOptionalFields(
      complaint.relatedIncidentId
        ? "already_linked_incident"
        : isReadOnly
          ? "case_read_only"
          : undefined,
      true,
    )),
    withOptionalFields({
      action: "export",
      enabled: Boolean(exportView?.readyForAudit),
      riskLevel: "low",
    }, maybeOptionalFields(
      exportView?.readyForAudit ? undefined : "artifact_not_ready",
    )),
    withOptionalFields({
      action: "manual_sla_waiver",
      enabled: false,
      riskLevel: "high",
    }, maybeOptionalFields("restricted_role", true)),
  ];
}

function getSlaStatus(complaint: ComplaintCaseRecord) {
  if (complaint.slaBreach) {
    return "breached" as const;
  }

  const deltaHours =
    (new Date(complaint.slaDueAt).getTime() - Date.now()) / (1000 * 60 * 60);
  return deltaHours <= 4 ? ("warning" as const) : ("within_sla" as const);
}

function resolveEmptyReasonFromError(
  error: Error | null,
  fallback: EmptyReason,
  notFoundReason: EmptyReason = "no_data",
) {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) {
    return "permission_denied" as const;
  }
  if (status === 404) {
    return notFoundReason;
  }
  if (status === 502 || status === 503 || status === 504) {
    return "external_unavailable" as const;
  }
  return fallback;
}

function renderEmptyState(
  locale: Locale,
  reason: EmptyReason,
  contextLabel: string,
) {
  const config = {
    no_data: {
      tone: "info",
      title: copyText(locale, "No current data", "目前沒有資料"),
      body: copyText(
        locale,
        `${contextLabel} has no recorded items yet.`,
        `${contextLabel} 目前尚無記錄內容。`,
      ),
    },
    not_provisioned: {
      tone: "warn",
      title: copyText(locale, "Not provisioned", "尚未啟用"),
      body: copyText(
        locale,
        `${contextLabel} is not provisioned on this case path.`,
        `${contextLabel} 在此案件路徑尚未啟用。`,
      ),
    },
    fetch_failed: {
      tone: "danger",
      title: copyText(locale, "Fetch failed", "讀取失敗"),
      body: copyText(
        locale,
        `${contextLabel} could not be loaded from the backend snapshot.`,
        `${contextLabel} 無法從後端快照載入。`,
      ),
    },
    permission_denied: {
      tone: "danger",
      title: copyText(locale, "Permission denied", "權限不足"),
      body: copyText(
        locale,
        `${contextLabel} is hidden because the current actor lacks scope.`,
        `${contextLabel} 因目前角色權限不足而無法顯示。`,
      ),
    },
    external_unavailable: {
      tone: "warn",
      title: copyText(locale, "External dependency unavailable", "外部依賴暫不可用"),
      body: copyText(
        locale,
        `${contextLabel} depends on an external adapter that is degraded right now.`,
        `${contextLabel} 依賴外部介接，目前服務降級。`,
      ),
    },
    filtered_empty: {
      tone: "info",
      title: copyText(locale, "Filtered subset is empty", "篩選後為空"),
      body: copyText(
        locale,
        `${contextLabel} is scoped to this complaint and no matching entries were found.`,
        `${contextLabel} 已限定為本案件子集，目前找不到符合項目。`,
      ),
    },
    driver_not_eligible: {
      tone: "warn",
      title: copyText(locale, "Unavailable", "目前不可用"),
      body: copyText(
        locale,
        `${contextLabel} is unavailable in this workspace.`,
        `${contextLabel} 在此 workspace 目前不可用。`,
      ),
    },
  }[reason];

  const toneColor =
    config.tone === "danger"
      ? theme.danger
      : config.tone === "warn"
        ? theme.warn
        : theme.accent;
  const borderColor =
    config.tone === "danger"
      ? theme.dangerBorder
      : config.tone === "warn"
        ? theme.warnBorder
        : theme.border;
  const backgroundColor =
    config.tone === "danger"
      ? theme.dangerBg
      : config.tone === "warn"
        ? theme.warnBg
        : theme.surfaceLo;

  return (
    <div
      style={{
        display: "grid",
        gap: "8px",
        padding: "14px",
        borderRadius: "14px",
        border: `1px solid ${borderColor}`,
        background: backgroundColor,
      }}
    >
      <strong style={{ color: toneColor }}>{config.title}</strong>
      <span
        style={{
          color: theme.text,
          fontSize: "12.5px",
          lineHeight: 1.55,
        }}
      >
        {config.body}
      </span>
      <span
        style={{
          color: theme.textMuted,
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {reason}
      </span>
    </div>
  );
}

function buildComplaintHeaderActions(
  locale: Locale,
  complaint: ComplaintCaseRecord,
  availableActions: ResourceActionDescriptor[],
) {
  const routeBase = `/complaints/${encodeURIComponent(complaint.caseNo)}`;

  return (
    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
      {availableActions.map((descriptor) => {
        const actionId = descriptor.action as ActionId;
        const label = getActionLabel(locale, actionId, complaint);
        const disabledReason = descriptor.enabled
          ? null
          : getDisabledReasonLabel(locale, descriptor.disabledReasonCode);

        if (actionId === "export") {
          return descriptor.enabled ? (
            <a
              key={descriptor.action}
              href={`${routeBase}/artifact`}
              target="_blank"
              rel="noreferrer"
              style={actionLinkStyle("secondary")}
            >
              <CanvasIcon name="ext" size={12} />
              <span>{label}</span>
            </a>
          ) : (
            <span
              key={descriptor.action}
              title={disabledReason ?? undefined}
              style={actionLinkStyle("secondary", true)}
            >
              {label}
            </span>
          );
        }

        const sectionId =
          actionId === "close" ? "action-resolve" : `action-${actionId.replaceAll("_", "-")}`;

        return descriptor.enabled ? (
          <a
            key={descriptor.action}
            href={`#${sectionId}`}
            style={actionLinkStyle(
              descriptor.riskLevel === "high" ? "primary" : "secondary",
            )}
          >
            {label}
          </a>
        ) : (
          <span
            key={descriptor.action}
            title={disabledReason ?? undefined}
            style={actionLinkStyle("secondary", true)}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function buildAuditHref(auditId: string) {
  return `${PLATFORM_ADMIN_BASE_URL.replace(/\/$/, "")}/audit?auditId=${encodeURIComponent(auditId)}`;
}

export default async function ComplaintDetailPage({
  params,
}: ComplaintDetailPageProps) {
  const [{ caseNo }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const complaintResult = await loadOptional(() => client.getComplaint(caseNo));
  if (complaintResult.error) {
    if (getErrorStatus(complaintResult.error) === 404) {
      notFound();
    }
    throw complaintResult.error;
  }

  const complaint = complaintResult.data;
  if (!complaint) {
    notFound();
  }

  const [
    timelineResult,
    exportViewResult,
    relatedOrderResult,
    relatedCallResult,
    relatedIncidentResult,
    auditResult,
  ] = await Promise.all([
    loadOptional(() => client.getComplaintTimeline(complaint.caseNo)),
    loadOptional(() => client.getComplaintExportView(complaint.caseNo)),
    complaint.relatedOrderId
      ? loadOptional(() => client.getOrder(complaint.relatedOrderId as string))
      : Promise.resolve({ data: null, error: null } as LoadResult<OwnedOrderRecord>),
    complaint.relatedCallId
      ? loadOptional(() => client.getCallSession(complaint.relatedCallId as string))
      : Promise.resolve({ data: null, error: null } as LoadResult<CallSessionRecord>),
    complaint.relatedIncidentId
      ? loadOptional(() => client.getIncident(complaint.relatedIncidentId as string))
      : Promise.resolve({ data: null, error: null } as LoadResult<IncidentRecord>),
    loadOptional(() => client.listAuditLogs()),
  ]);

  const timelineEntries = [...(timelineResult.data ?? [])].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
  const exportView =
    exportViewResult.data ??
    ({
      complaintCase: complaint,
      timeline: timelineEntries,
      exportGeneratedAt: new Date().toISOString(),
      readyForAudit: false,
    } satisfies ComplaintExportViewRecord);
  const relatedOrder = relatedOrderResult.data;
  const relatedCall = relatedCallResult.data;
  const relatedIncident = relatedIncidentResult.data;
  const auditEntries = [...(auditResult.data ?? [])]
    .filter(
      (entry) =>
        entry.resourceType === "complaint_case" &&
        entry.resourceId === complaint.caseNo,
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
    );
  const reporter = getReporterSummary(locale, complaint, relatedOrder, relatedCall);
  const tenantLabel = getTenantLabel(relatedOrder);
  const slaStatus = getSlaStatus(complaint);
  const availableActions = buildAvailableActions(complaint, exportView);
  const latestAudit = auditEntries[0] ?? null;
  const slaBreachedAt =
    timelineEntries.find((entry) => entry.action === "sla_breached")?.createdAt ??
    null;
  const snapshotAt = new Date().toISOString();

  const timelineItems: TimelineItem[] = timelineResult.error
    ? []
    : timelineEntries.map((entry) => {
        const matchingAudit =
          auditEntries.find(
            (audit) =>
              Math.abs(
                new Date(audit.createdAt).getTime() -
                  new Date(entry.createdAt).getTime(),
              ) <= 1_500,
          ) ?? null;

        return {
          id: entry.entryId,
          title: getTimelineActionLabel(locale, entry.action),
          detail: entry.note,
          timestamp: formatShortDateTime(locale, entry.createdAt),
          tone: getTimelineTone(entry.action),
          eyebrow:
            entry.action === "case_created"
              ? reporter.primary
              : entry.action === "sla_breached"
                ? "system.sla"
                : complaint.assigneeId ??
                  copyText(locale, "ops workspace", "ops workspace"),
          supportingContent: matchingAudit ? (
            <a
              href={buildAuditHref(matchingAudit.auditId)}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: theme.textMuted,
                textDecoration: "none",
                fontSize: "12px",
              }}
            >
              <CanvasIcon name="audit" size={12} />
              <span style={{ fontFamily: theme.monoFamily }}>
                {matchingAudit.requestId}
              </span>
            </a>
          ) : null,
        };
      });

  const degradedSurfaces = [
    timelineResult.error
      ? copyText(locale, "Timeline snapshot failed.", "Timeline 快照讀取失敗。")
      : null,
    exportViewResult.error
      ? copyText(locale, "Export view fallback is active.", "匯出視圖已切到 fallback。")
      : null,
    relatedCallResult.error
      ? copyText(locale, "Call / recording data is degraded.", "通話 / 錄音資料目前降級。")
      : null,
    auditResult.error
      ? copyText(locale, "Audit subset could not be fully loaded.", "稽核子集目前無法完整載入。")
      : null,
  ].filter(Boolean) as string[];

  const summaryItems = [
    { k: "CASE", v: complaint.caseNo, mono: true },
    {
      k: copyText(locale, "Source", "來源"),
      v: tenantLabel
        ? `${formatOpsCodeLabel(locale, complaint.caseSource)} · ${tenantLabel}`
        : formatOpsCodeLabel(locale, complaint.caseSource),
    },
    {
      k: copyText(locale, "Category", "類別"),
      v: formatOpsCodeLabel(locale, complaint.category),
      mono: true,
    },
    {
      k: copyText(locale, "Severity", "嚴重程度"),
      v: (
        <Pill theme={theme} tone={getComplaintSeverityTone(complaint.severity)} dot>
          {formatOpsCodeLabel(locale, complaint.severity)}
        </Pill>
      ),
    },
    {
      k: copyText(locale, "Status", "狀態"),
      v: (
        <Pill theme={theme} tone={getComplaintStatusTone(complaint.status)} dot>
          {formatOpsCodeLabel(locale, complaint.status)}
        </Pill>
      ),
    },
    {
      k: copyText(locale, "Assignee", "負責人"),
      v:
        complaint.assigneeId ?? copyText(locale, "Unassigned", "未指派"),
      mono: true,
    },
    {
      k: copyText(locale, "SLA status", "SLA 狀態"),
      v: (
        <Pill theme={theme} tone={getSlaTone(slaStatus)} dot>
          {slaStatus === "breached"
            ? copyText(locale, "breached", "已逾期")
            : slaStatus === "warning"
              ? copyText(locale, "warning", "警示")
              : copyText(locale, "within_sla", "SLA 內")}
        </Pill>
      ),
    },
    {
      k: copyText(locale, "SLA due", "SLA 到期"),
      v: formatDateTime(locale, complaint.slaDueAt),
      mono: true,
    },
    {
      k: copyText(locale, "SLA breached at", "SLA 逾期時間"),
      v: formatDateTime(locale, slaBreachedAt),
      mono: true,
    },
    {
      k: copyText(locale, "Created", "建立時間"),
      v: formatDateTime(locale, complaint.createdAt),
      mono: true,
    },
    {
      k: copyText(locale, "Updated", "更新時間"),
      v: formatDateTime(locale, complaint.updatedAt),
      mono: true,
    },
    {
      k: copyText(locale, "Reopens", "重開次數"),
      v: String(complaint.reopenCount ?? 0),
      mono: true,
    },
  ];

  const relatedItems = [
    {
      k: copyText(locale, "Related order", "關聯訂單"),
      v: complaint.relatedOrderId ? (
        <Link
          href={`/dispatch/${encodeURIComponent(complaint.relatedOrderId)}`}
          style={actionLinkStyle("secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>
            {getOpsLabel(locale, "order")} {complaint.relatedOrderId}
          </span>
        </Link>
      ) : (
        "—"
      ),
      mono: !complaint.relatedOrderId,
    },
    {
      k: copyText(locale, "Call session", "關聯通話"),
      v: complaint.relatedCallId ? (
        <Link
          href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
          style={actionLinkStyle("secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{complaint.relatedCallId}</span>
        </Link>
      ) : (
        "—"
      ),
      mono: !complaint.relatedCallId,
    },
    {
      k: copyText(locale, "Incident", "關聯事故"),
      v: complaint.relatedIncidentId ? (
        <Link
          href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
          style={actionLinkStyle("secondary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{complaint.relatedIncidentId}</span>
        </Link>
      ) : (
        "—"
      ),
      mono: !complaint.relatedIncidentId,
    },
    {
      k: copyText(locale, "Tenant", "租戶"),
      v: tenantLabel ?? "—",
      mono: Boolean(tenantLabel),
    },
  ];

  const auditItems =
    auditResult.error || auditEntries.length === 0
      ? null
      : auditEntries.slice(0, 4).map((entry) => ({
          k: `${formatShortDateTime(locale, entry.createdAt)} · ${entry.actionName}`,
          v: (
            <div style={{ display: "grid", gap: "4px" }}>
              <a
                href={buildAuditHref(entry.auditId)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex",
                  gap: "6px",
                  alignItems: "center",
                  color: theme.accent,
                  textDecoration: "none",
                  fontFamily: theme.monoFamily,
                  fontSize: "11.5px",
                }}
              >
                <CanvasIcon name="audit" size={12} />
                <span>{entry.auditId}</span>
              </a>
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {entry.requestId}
              </span>
            </div>
          ),
        }));

  const recoveryCardBody =
    complaint.closingNote && complaint.resolutionCode ? (
      <div style={{ display: "grid", gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Pill theme={theme} tone="success" dot>
            {copyText(locale, "Post-resolution", "已進入處理後階段")}
          </Pill>
          <Pill theme={theme} tone="info">
            {formatOpsCodeLabel(locale, complaint.resolutionCode)}
          </Pill>
        </div>
        <div
          style={{
            padding: "12px",
            borderRadius: "12px",
            border: `1px solid ${theme.successBorder}`,
            background: theme.successBg,
            color: theme.text,
            lineHeight: 1.6,
            fontSize: "12.5px",
            whiteSpace: "pre-wrap",
          }}
        >
          {complaint.closingNote}
        </div>
      </div>
    ) : renderEmptyState(locale, "no_data", copyText(locale, "Recovery notes", "恢復備註"));

  const auditBody = auditResult.error
    ? renderEmptyState(
        locale,
        resolveEmptyReasonFromError(auditResult.error, "external_unavailable"),
        copyText(locale, "Audit subset", "稽核子集"),
      )
    : auditItems
      ? <DL theme={theme} cols={1} items={auditItems} />
      : renderEmptyState(
          locale,
          "filtered_empty",
          copyText(locale, "Audit subset", "稽核子集"),
        );

  const recordingBody = relatedCallResult.error
    ? renderEmptyState(
        locale,
        resolveEmptyReasonFromError(
          relatedCallResult.error,
          "external_unavailable",
          "fetch_failed",
        ),
        copyText(locale, "Recording playback", "錄音播放"),
      )
    : !relatedCall || !relatedCall.recordingId
      ? renderEmptyState(
          locale,
          "not_provisioned",
          copyText(locale, "Recording playback", "錄音播放"),
        )
      : (
          <div style={{ display: "grid", gap: "10px" }}>
            <div
              style={{
                display: "grid",
                gap: "8px",
                padding: "12px",
                borderRadius: "12px",
                border: `1px solid ${theme.border}`,
                background: theme.surfaceLo,
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <Pill
                  theme={theme}
                  tone={relatedCall.recordingState === "ready" ? "success" : "warn"}
                  dot
                >
                  {formatOpsCodeLabel(locale, relatedCall.recordingState)}
                </Pill>
                <span
                  style={{ fontFamily: theme.monoFamily, fontSize: "12px" }}
                >
                  {maskIdentifier(relatedCall.recordingId)}
                </span>
              </div>
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {copyText(
                  locale,
                  `Provider ref ${maskIdentifier(relatedCall.providerRecordingRef)} · PII masked playback`,
                  `Provider ref ${maskIdentifier(relatedCall.providerRecordingRef)} · 已遮罩播放`,
                )}
              </span>
            </div>
            {relatedCall.recordingUrl ? (
              <>
                <audio
                  controls
                  preload="none"
                  src={relatedCall.recordingUrl}
                  style={{ width: "100%" }}
                />
                <a
                  href={relatedCall.recordingUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={actionLinkStyle("secondary")}
                >
                  <CanvasIcon name="ext" size={12} />
                  <span>{copyText(locale, "Open raw playback", "外開播放")}</span>
                </a>
              </>
            ) : renderEmptyState(
                locale,
                "external_unavailable",
                copyText(locale, "Recording playback", "錄音播放"),
              )}
          </div>
        );

  const relatedIncidentBody =
    complaint.relatedIncidentId && !relatedIncident && relatedIncidentResult.error
      ? renderEmptyState(
          locale,
          resolveEmptyReasonFromError(
            relatedIncidentResult.error,
            "fetch_failed",
          ),
          copyText(locale, "Linked incident", "關聯事故"),
        )
      : complaint.relatedIncidentId && relatedIncident
        ? (
            <div style={{ display: "grid", gap: "8px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <Pill theme={theme} tone={getComplaintSeverityTone("high")} dot>
                  {formatOpsCodeLabel(locale, relatedIncident.severity)}
                </Pill>
                <Pill theme={theme} tone="info">
                  {formatOpsCodeLabel(locale, relatedIncident.status)}
                </Pill>
              </div>
              <Link
                href={`/incidents/${encodeURIComponent(relatedIncident.incidentId)}`}
                style={actionLinkStyle("secondary")}
              >
                <CanvasIcon name="ext" size={12} />
                <span>
                  {relatedIncident.incidentId} · {relatedIncident.title}
                </span>
              </Link>
            </div>
          )
        : renderEmptyState(
            locale,
            "no_data",
            copyText(locale, "Linked incident", "關聯事故"),
          );

  return (
    <>
      <PageHeader
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span>{complaint.caseNo}</span>
            <Pill theme={theme} tone={getSlaTone(slaStatus)} dot>
              {slaStatus === "breached"
                ? copyText(locale, "SLA breached", "SLA 逾期")
                : slaStatus === "warning"
                  ? copyText(locale, "SLA warning", "SLA 警示")
                  : copyText(locale, "Within SLA", "SLA 內")}
            </Pill>
            <Pill theme={theme} tone={getComplaintSeverityTone(complaint.severity)}>
              {formatOpsCodeLabel(locale, complaint.severity)}
            </Pill>
            <Pill theme={theme} tone={getComplaintStatusTone(complaint.status)} dot>
              {formatOpsCodeLabel(locale, complaint.status)}
            </Pill>
            {complaint.relatedIncidentId ? (
              <Pill theme={theme} tone="danger">
                {copyText(locale, "Escalated", "已升級事故")}
              </Pill>
            ) : null}
          </span>
        }
        subtitle={`${formatOpsCodeLabel(locale, complaint.category)} · ${formatRelativeDue(locale, complaint.slaDueAt)}`}
        actions={buildComplaintHeaderActions(locale, complaint, availableActions)}
      />

      <div style={{ padding: "0 24px 24px", display: "grid", gap: "16px" }}>
        {degradedSurfaces.length > 0 ? (
          <div
            style={{
              display: "grid",
              gap: "8px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.warnBorder}`,
              background: theme.warnBg,
            }}
          >
            <strong style={{ color: theme.warn }}>
              {copyText(locale, "Degraded snapshot", "降級快照")}
            </strong>
            <ul
              style={{
                margin: 0,
                paddingLeft: "18px",
                color: theme.text,
                fontSize: "12.5px",
                lineHeight: 1.6,
              }}
            >
              {degradedSurfaces.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {(complaint.status === "resolved" || complaint.status === "closed") ? (
          <div
            style={{
              display: "grid",
              gap: "8px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.successBorder}`,
              background: theme.successBg,
            }}
          >
            <strong style={{ color: theme.success }}>
              {complaint.status === "closed"
                ? copyText(locale, "Closed / audit-visible state", "已關閉 / 保留稽核可視性")
                : copyText(locale, "Post-resolution review state", "處理後待關閉狀態")}
            </strong>
            <span style={{ color: theme.text, fontSize: "12.5px", lineHeight: 1.55 }}>
              {complaint.status === "closed"
                ? copyText(
                    locale,
                    "Writable ops actions are locked except for route-safe reopen and export evidence review.",
                    "除了重開與檢視匯出憑證外，其他寫入動作均已鎖定。",
                  )
                : copyText(
                    locale,
                    "Resolution is recorded. Review recovery notes, audit subset, and closeout artifact before final closure.",
                    "處理結果已記錄；請確認恢復備註、稽核子集與匯出憑證後再正式關閉。",
                  )}
            </span>
          </div>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.45fr) minmax(340px, 1fr)",
            gap: "16px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "16px" }}>
            <Card
              theme={theme}
              title={copyText(locale, "Case summary", "案件摘要")}
              subtitle={copyText(
                locale,
                "Header contract, SLA posture, reporter, and linked order/call context.",
                "對齊 spec 的 header 合約、SLA 姿態、回報者與訂單 / 通話上下文。",
              )}
            >
              <div style={{ display: "grid", gap: "14px" }}>
                <DL theme={theme} cols={3} items={summaryItems} />
                <Field
                  theme={theme}
                  label={copyText(locale, "Description", "案件描述")}
                >
                  <div
                    style={{
                      color: theme.text,
                      fontSize: "12.5px",
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {complaint.description}
                  </div>
                </Field>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "12px",
                  }}
                >
                  <Field
                    theme={theme}
                    label={copyText(locale, "Reporter", "回報者")}
                  >
                    <div style={{ display: "grid", gap: "4px" }}>
                      <strong style={{ color: theme.text }}>
                        {reporter.primary}
                      </strong>
                      <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                        {reporter.secondary}
                      </span>
                    </div>
                  </Field>
                  <Field
                    theme={theme}
                    label={copyText(locale, "Resolution posture", "處理姿態")}
                  >
                    <div style={{ display: "grid", gap: "4px" }}>
                      <strong style={{ color: theme.text }}>
                        {complaint.resolutionCode
                          ? formatOpsCodeLabel(locale, complaint.resolutionCode)
                          : copyText(locale, "Pre-resolution", "尚未處理完成")}
                      </strong>
                      <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                        {complaint.resolutionCode
                          ? copyText(
                              locale,
                              "Post-resolution visibility is active.",
                              "已進入處理後可視狀態。",
                            )
                          : copyText(
                              locale,
                              "Recovery notes are still pending.",
                              "恢復備註仍待補齊。",
                            )}
                      </span>
                    </div>
                  </Field>
                </div>
              </div>
            </Card>

            <Card theme={theme} title={copyText(locale, "Timeline", "案件時間軸")}>
              {timelineResult.error ? (
                renderEmptyState(
                  locale,
                  resolveEmptyReasonFromError(timelineResult.error, "fetch_failed"),
                  copyText(locale, "Timeline", "案件時間軸"),
                )
              ) : (
                <Timeline
                  density="compact"
                  items={timelineItems}
                  emptyState={copyText(locale, "No timeline yet.", "目前尚無時間軸。")}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={copyText(locale, "Audit subset", "稽核子集")}
              subtitle={copyText(
                locale,
                "Filtered to this complaint case only.",
                "僅顯示此案件的稽核事件。",
              )}
            >
              {auditBody}
            </Card>
          </div>

          <div style={{ display: "grid", gap: "16px" }}>
            <ComplaintDetailActionWorkspace
              locale={locale}
              complaint={complaint}
              availableActions={availableActions}
              auditBaseUrl={PLATFORM_ADMIN_BASE_URL}
            />

            <Card
              theme={theme}
              title={copyText(locale, "Recording · PII masked", "錄音 · 已遮罩")}
              subtitle={copyText(
                locale,
                "Use masked playback controls before exporting or escalating.",
                "在匯出或升級前，先於遮罩播放中確認證據內容。",
              )}
            >
              {recordingBody}
            </Card>

            <Card
              theme={theme}
              title={copyText(locale, "Linked entities", "關聯實體")}
            >
              <div style={{ display: "grid", gap: "12px" }}>
                <DL theme={theme} cols={1} items={relatedItems} />
                {relatedIncidentBody}
              </div>
            </Card>

            <Card
              theme={theme}
              title={copyText(locale, "Recovery notes", "恢復備註")}
            >
              {recoveryCardBody}
            </Card>

            <Card
              theme={theme}
              title={copyText(locale, "Export view", "匯出視圖")}
            >
              {exportViewResult.error ? (
                renderEmptyState(
                  locale,
                  resolveEmptyReasonFromError(exportViewResult.error, "fetch_failed"),
                  copyText(locale, "Export view", "匯出視圖"),
                )
              ) : (
                <div style={{ display: "grid", gap: "10px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <Pill
                      theme={theme}
                      tone={exportView.readyForAudit ? "success" : "warn"}
                      dot
                    >
                      {exportView.readyForAudit
                        ? copyText(locale, "artifact_ready", "可下載憑證")
                        : copyText(locale, "awaiting_closeout", "等待正式關閉")}
                    </Pill>
                    <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                      {formatDateTime(locale, exportView.exportGeneratedAt)}
                    </span>
                  </div>
                  <a
                    href={`/complaints/${encodeURIComponent(complaint.caseNo)}/artifact`}
                    target="_blank"
                    rel="noreferrer"
                    style={actionLinkStyle("secondary", !exportView.readyForAudit)}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>
                      {copyText(
                        locale,
                        "Open artifact link",
                        "開啟匯出憑證連結",
                      )}
                    </span>
                  </a>
                </div>
              )}
            </Card>

            <Card
              theme={theme}
              title={copyText(locale, "Navigation", "導覽")}
              padding={14}
            >
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <Link href="/complaints" style={actionLinkStyle("secondary")}>
                  <CanvasIcon name="arrow" size={12} />
                  <span>{copyText(locale, "Back to list", "返回客訴列表")}</span>
                </Link>
                {complaint.relatedOrderId ? (
                  <Link
                    href={`/dispatch/${encodeURIComponent(complaint.relatedOrderId)}`}
                    style={actionLinkStyle("ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>{getOpsLabel(locale, "order")}</span>
                  </Link>
                ) : null}
                {complaint.relatedIncidentId ? (
                  <Link
                    href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
                    style={actionLinkStyle("ghost")}
                  >
                    <CanvasIcon name="ext" size={12} />
                    <span>{getOpsLabel(locale, "incident")}</span>
                  </Link>
                ) : null}
              </div>
            </Card>

            <Card
              theme={theme}
              title={copyText(locale, "Refresh tier", "刷新層級")}
            >
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "Tier",
                    v: "T3 · 15s",
                    mono: true,
                  },
                  {
                    k: copyText(locale, "Snapshot generated", "快照時間"),
                    v: formatDateTime(locale, snapshotAt),
                    mono: true,
                  },
                  {
                    k: copyText(locale, "Data freshness", "資料新鮮度"),
                    v: degradedSurfaces.length > 0 ? "degraded" : "fresh",
                    mono: true,
                  },
                  {
                    k: copyText(locale, "Latest audit", "最近稽核"),
                    v: latestAudit ? (
                      <a
                        href={buildAuditHref(latestAudit.auditId)}
                        target="_blank"
                        rel="noreferrer"
                        style={actionLinkStyle("ghost")}
                      >
                        <CanvasIcon name="audit" size={12} />
                        <span>{latestAudit.auditId}</span>
                      </a>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
