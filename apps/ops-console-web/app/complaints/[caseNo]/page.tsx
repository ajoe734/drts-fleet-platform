import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type {
  AuditLogRecord,
  CallSessionRecord,
  ComplaintCaseRecord,
  ComplaintCaseStatus,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  EmptyReason,
  EmptyStateEnvelope,
  IncidentRecord,
  OwnedOrderRecord,
  ResourceActionDescriptor,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
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
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t, type Locale } from "@/lib/translations";

type ComplaintDetailPageProps = {
  params: Promise<{ caseNo: string }>;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

// Refresh tier per packet §3.2 / §5.6 → T3 (15s) ops medium.
const REFRESH_TIER_MS = 15000;

type FetchResult<T> = { value: T; failed: boolean };

async function loadOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<FetchResult<T>> {
  try {
    return { value: await loader(), failed: false };
  } catch {
    return { value: fallback, failed: true };
  }
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

function getStatusTone(status: ComplaintCaseStatus): CanvasTone {
  if (status === "resolved" || status === "closed") {
    return "success";
  }
  if (status === "reopened") {
    return "warn";
  }
  return "info";
}

function getSeverityTone(severity: "normal" | "high"): CanvasTone {
  return severity === "high" ? "danger" : "info";
}

// "slaStatus" derived per §5.6 — backend currently emits `slaBreach: boolean`
// + `slaDueAt`. Map them to a 3-state surface (ok / warning / breached) so the
// UI can render a distinct SLA-warning vs SLA-breached affordance.
type SlaStatus = "ok" | "warning" | "breached";

function deriveSlaStatus(record: ComplaintCaseRecord): SlaStatus {
  if (record.slaBreach) {
    return "breached";
  }
  const dueMs = new Date(record.slaDueAt).getTime();
  const warnMs = 4 * 60 * 60 * 1000;
  if (Number.isFinite(dueMs) && dueMs - Date.now() <= warnMs) {
    return "warning";
  }
  return "ok";
}

function slaTone(status: SlaStatus): CanvasTone {
  if (status === "breached") {
    return "danger";
  }
  if (status === "warning") {
    return "warn";
  }
  return "success";
}

function slaLabel(status: SlaStatus, locale: Locale) {
  if (status === "breached") {
    return locale === "en" ? "SLA breached" : "SLA 已逾期";
  }
  if (status === "warning") {
    return locale === "en" ? "SLA warning" : "SLA 即將到期";
  }
  return locale === "en" ? "SLA on track" : "SLA 正常";
}

function isClosedStatus(status: ComplaintCaseStatus) {
  return status === "resolved" || status === "closed";
}

function getTimelineTone(
  action: ComplaintTimelineEntry["action"],
): ManagementTone {
  if (action === "case_resolved" || action === "case_closed") {
    return "success";
  }
  if (action === "sla_breached" || action === "escalated_to_incident") {
    return "danger";
  }
  if (action === "case_reopened") {
    return "warning";
  }
  if (action === "case_assigned") {
    return "accent";
  }
  if (action === "case_created") {
    return "accent";
  }
  return "info";
}

// ---------------------------------------------------------------------------
// availableActions — derived per packet §3.5 / §5.6 from current status.
// ---------------------------------------------------------------------------
// `ComplaintCaseRecord` does not yet carry `availableActions` on the wire (the
// system-design-answers note in `packages/contracts/src/ui-runtime.ts` lets the
// field land in the same PR that rebuilds the consumer). Until backend emits
// it, the descriptor list is computed from `status` + `relatedIncidentId` and
// the page renders CTAs *only* via this list — so swapping in the wire field
// later is a one-line change.

function deriveAvailableActions(
  record: ComplaintCaseRecord,
): ResourceActionDescriptor[] {
  const closed = isClosedStatus(record.status);
  const escalated = Boolean(record.relatedIncidentId);

  return [
    {
      action: "add_note",
      enabled: !closed,
      riskLevel: "low",
      ...(closed ? { disabledReasonCode: "case_closed" } : {}),
    },
    {
      action: "assign",
      enabled: !closed,
      riskLevel: "medium",
      ...(closed ? { disabledReasonCode: "case_closed" } : {}),
    },
    {
      action: "resolve",
      enabled: !closed && record.status !== "new",
      riskLevel: "medium",
      ...(closed
        ? { disabledReasonCode: "case_closed" }
        : record.status === "new"
          ? { disabledReasonCode: "case_unassigned" }
          : {}),
    },
    {
      action: "close",
      enabled: record.status === "resolved",
      riskLevel: "medium",
      ...(record.status !== "resolved"
        ? { disabledReasonCode: "case_not_resolved" }
        : {}),
    },
    {
      action: "reopen",
      enabled: closed,
      riskLevel: "high",
      requiresReason: true,
      ...(closed ? {} : { disabledReasonCode: "case_already_open" }),
    },
    {
      action: "escalate_to_incident",
      enabled: !closed && !escalated,
      riskLevel: "high",
      requiresReason: true,
      ...(escalated
        ? { disabledReasonCode: "already_escalated" }
        : closed
          ? { disabledReasonCode: "case_closed" }
          : {}),
    },
    {
      action: "export",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "sla_waiver",
      enabled: record.slaBreach && !closed,
      riskLevel: "high",
      requiresReason: true,
      ...(closed
        ? { disabledReasonCode: "case_closed" }
        : !record.slaBreach
          ? { disabledReasonCode: "sla_not_breached" }
          : {}),
    },
  ];
}

const ACTION_COPY: Record<
  string,
  {
    en: string;
    zh: string;
    icon: "plus" | "users" | "check" | "warn" | "copy" | "ext" | "clock";
  }
> = {
  add_note: { en: "Add note", zh: "新增備註", icon: "plus" },
  assign: { en: "Assign / reassign", zh: "指派 / 重新指派", icon: "users" },
  resolve: { en: "Mark resolved", zh: "標記解決", icon: "check" },
  close: { en: "Close case", zh: "結案", icon: "check" },
  reopen: { en: "Reopen", zh: "重新開啟", icon: "ext" },
  escalate_to_incident: {
    en: "Escalate to incident",
    zh: "升級為事故",
    icon: "warn",
  },
  export: { en: "Export", zh: "匯出", icon: "copy" },
  sla_waiver: { en: "Manual SLA waiver", zh: "手動 SLA 豁免", icon: "clock" },
};

const REASON_COPY: Record<string, { en: string; zh: string }> = {
  case_closed: { en: "Case is closed", zh: "案件已結案" },
  case_unassigned: {
    en: "Assign the case before resolving",
    zh: "解決前需先指派",
  },
  case_not_resolved: { en: "Mark resolved first", zh: "請先標記解決" },
  case_already_open: {
    en: "Case is still open",
    zh: "案件仍處於開啟狀態",
  },
  already_escalated: {
    en: "Already escalated to incident",
    zh: "已升級為事故",
  },
  sla_not_breached: { en: "SLA is not breached", zh: "SLA 尚未逾期" },
};

function describeDisabledReason(
  descriptor: ResourceActionDescriptor,
  locale: Locale,
): string | null {
  if (descriptor.enabled || !descriptor.disabledReasonCode) {
    return null;
  }
  const lookup = REASON_COPY[descriptor.disabledReasonCode];
  return lookup ? lookup[locale] : descriptor.disabledReasonCode;
}

// Map each action descriptor to a Btn or Link; mutation flows live on the list
// page (`/complaints`) — the detail page returns the user there with the case
// preselected and the requested action surfaced via URL params, so per §3.4
// the modal confirmation pattern (medium/high) and reason capture (high) are
// driven from the existing client island that already owns those forms.
function actionHref(descriptor: ResourceActionDescriptor, caseNo: string) {
  const params = new URLSearchParams({
    caseNo,
    action: descriptor.action,
  });
  return `/complaints?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// EmptyReason — packet §3.6 requires all 6 backend reasons render distinctly.
// ---------------------------------------------------------------------------
// `EmptyReason` actually has 7 members in the ui-runtime contract (the 6 in
// packet §3.6 plus `driver_not_eligible`, which is driver-app-only per
// Q-DRV01). The ops console renders 6 distinct presentations; the
// `driver_not_eligible` case is included for exhaustiveness so the union
// stays narrowed.

type EmptyCopy = {
  en: string;
  zh: string;
  enBody: string;
  zhBody: string;
  icon: "warn" | "ext" | "clock" | "filter" | "audit" | "users" | "copy";
  tone: CanvasTone;
};

const EMPTY_COPY: Record<EmptyReason, EmptyCopy> = {
  no_data: {
    en: "No entries yet",
    zh: "尚無記錄",
    enBody: "Nothing has been recorded against this case yet.",
    zhBody: "本案件目前沒有任何記錄。",
    icon: "clock",
    tone: "neutral",
  },
  not_provisioned: {
    en: "Feature not enabled",
    zh: "功能尚未啟用",
    enBody:
      "This module is not provisioned for the current tenant — enable it before expecting data.",
    zhBody: "目前租戶尚未啟用此模組，啟用後才會有資料。",
    icon: "ext",
    tone: "info",
  },
  fetch_failed: {
    en: "Failed to load",
    zh: "載入失敗",
    enBody:
      "We couldn't reach the backend for this view. Refresh to try again.",
    zhBody: "目前無法取得此檢視的資料，請重新整理。",
    icon: "warn",
    tone: "danger",
  },
  permission_denied: {
    en: "You don't have permission",
    zh: "權限不足",
    enBody: "Your role doesn't include access to this view.",
    zhBody: "您的角色尚未授權檢視此區塊。",
    icon: "audit",
    tone: "warn",
  },
  external_unavailable: {
    en: "External system unavailable",
    zh: "外部系統暫不可用",
    enBody:
      "An upstream adapter is degraded; data may resume shortly without intervention.",
    zhBody: "外部介接服務暫時降級，資料稍後恢復。",
    icon: "ext",
    tone: "warn",
  },
  driver_not_eligible: {
    en: "Driver not eligible",
    zh: "司機暫不符合條件",
    enBody:
      "This view is gated on driver eligibility — included for contract exhaustiveness.",
    zhBody: "此檢視須在司機符合條件時才會出現資料。",
    icon: "users",
    tone: "neutral",
  },
  filtered_empty: {
    en: "No matches for current filters",
    zh: "目前篩選條件無符合結果",
    enBody: "Widen the filters to see more entries.",
    zhBody: "請放寬篩選條件以檢視更多記錄。",
    icon: "filter",
    tone: "neutral",
  },
};

function renderEmptyEnvelope(
  envelope: EmptyStateEnvelope,
  locale: Locale,
): ReactNode {
  const copy = EMPTY_COPY[envelope.reason];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "14px 12px",
        borderRadius: 8,
        border: `1px dashed ${theme.border}`,
        background: theme.surfaceLo,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 6,
            background: theme.surface,
            color:
              copy.tone === "danger"
                ? theme.danger
                : copy.tone === "warn"
                  ? theme.warn
                  : copy.tone === "info"
                    ? theme.info
                    : theme.textMuted,
          }}
        >
          <CanvasIcon name={copy.icon} size={14} />
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: theme.text,
          }}
        >
          {locale === "en" ? copy.en : copy.zh}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: theme.monoFamily,
            fontSize: 10.5,
            color: theme.textMuted,
          }}
        >
          {envelope.reason}
        </span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: theme.textMuted,
          lineHeight: 1.5,
        }}
      >
        {locale === "en" ? copy.enBody : copy.zhBody}
      </p>
      {envelope.messageCode ? (
        <span
          style={{
            fontFamily: theme.monoFamily,
            fontSize: 10.5,
            color: theme.textDim,
          }}
        >
          messageCode: {envelope.messageCode}
        </span>
      ) : null}
    </div>
  );
}

const SHOWCASE_REASONS: EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
];

// ---------------------------------------------------------------------------
// Cross-app deep links — packet §3.10 + §5.6 entry/exit.
// ---------------------------------------------------------------------------
// Same-app deep links (ops-console → ops-console) keep the user in the same
// tab. There are no cross-app jumps from this page in Phase 1; the audit
// drawer would deep-link to platform-admin per §3.10 if the user has audit
// read scope — surfaced inline via the audit subset card and a "View audit"
// hint with `openMode: new_tab`.
function inAppLink(href: string, label: string, mono: boolean = true) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: theme.accent,
        textDecoration: "none",
        fontFamily: mono ? theme.monoFamily : undefined,
        fontSize: 12,
      }}
    >
      <span>{label}</span>
      <CanvasIcon name="arrow" size={11} />
    </Link>
  );
}

function newTabLink(href: string, label: string) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: theme.accent,
        textDecoration: "none",
        fontFamily: theme.monoFamily,
        fontSize: 12,
      }}
    >
      <span>{label}</span>
      <CanvasIcon name="ext" size={11} />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ComplaintDetailPage({
  params,
}: ComplaintDetailPageProps) {
  const [{ caseNo }, locale, client] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const caseResult = await loadOrFallback(
    () => client.getComplaint(caseNo),
    null as ComplaintCaseRecord | null,
  );

  if (!caseResult.value) {
    // §5.6 state variant: case not found — caller may have followed a stale
    // link or hit a fetch failure that surfaces as missing case. Both collapse
    // to Next's notFound() (the global not-found UI distinguishes them).
    notFound();
  }

  const record = caseResult.value;
  const slaStatus = deriveSlaStatus(record);
  const closed = isClosedStatus(record.status);
  const escalated = Boolean(record.relatedIncidentId);
  const availableActions = deriveAvailableActions(record);
  const generatedAt = new Date().toISOString();

  const [
    timelineResult,
    exportViewResult,
    auditLogsResult,
    orderResult,
    callSessionResult,
    incidentResult,
  ] = await Promise.all([
    loadOrFallback(
      () => client.getComplaintTimeline(caseNo),
      [] as ComplaintTimelineEntry[],
    ),
    loadOrFallback(
      () => client.getComplaintExportView(caseNo),
      null as ComplaintExportViewRecord | null,
    ),
    loadOrFallback(() => client.listAuditLogs(), [] as AuditLogRecord[]),
    record.relatedOrderId
      ? loadOrFallback(
          () => client.getOrder(record.relatedOrderId as string),
          null as OwnedOrderRecord | null,
        )
      : Promise.resolve({
          value: null as OwnedOrderRecord | null,
          failed: false,
        } as FetchResult<OwnedOrderRecord | null>),
    record.relatedCallId
      ? loadOrFallback(
          () => client.getCallSession(record.relatedCallId as string),
          null as CallSessionRecord | null,
        )
      : Promise.resolve({
          value: null as CallSessionRecord | null,
          failed: false,
        } as FetchResult<CallSessionRecord | null>),
    record.relatedIncidentId
      ? loadOrFallback(
          () => client.getIncident(record.relatedIncidentId as string),
          null as IncidentRecord | null,
        )
      : Promise.resolve({
          value: null as IncidentRecord | null,
          failed: false,
        } as FetchResult<IncidentRecord | null>),
  ]);

  const timelineEntries = [...timelineResult.value].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Derive `slaBreachedAt` from the timeline (the wire shape doesn't carry it
  // as a discrete field today; §5.6 still wants it shown when SLA breached).
  const slaBreachedAt =
    [...timelineEntries]
      .filter((entry) => entry.action === "sla_breached")
      .map((entry) => entry.createdAt)
      .sort()
      .pop() ?? null;

  const caseAuditLogs = auditLogsResult.value
    .filter(
      (entry) =>
        (entry.resourceType === "complaint" ||
          entry.resourceType === "complaint_case") &&
        (entry.resourceId === record.caseNo || entry.resourceId === caseNo),
    )
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const timelineItems: TimelineItem[] = timelineEntries.map((entry) => ({
    id: entry.entryId,
    title: formatOpsCodeLabel(locale, entry.action),
    detail: entry.note,
    timestamp: formatShortDateTime(locale, entry.createdAt),
    tone: getTimelineTone(entry.action),
  }));

  const timelineEnvelope: EmptyStateEnvelope | null =
    timelineItems.length === 0
      ? {
          reason: timelineResult.failed ? "fetch_failed" : "no_data",
          messageCode: timelineResult.failed
            ? "complaints.timelineFetchFailed"
            : "complaints.timelineEmpty",
        }
      : null;

  const auditEnvelope: EmptyStateEnvelope | null =
    caseAuditLogs.length === 0
      ? {
          reason: auditLogsResult.failed ? "fetch_failed" : "no_data",
          messageCode: auditLogsResult.failed
            ? "complaints.auditFetchFailed"
            : "complaints.auditEmpty",
        }
      : null;

  const recoveryEnvelope: EmptyStateEnvelope | null = record.closingNote
    ? null
    : {
        reason: closed ? "no_data" : "filtered_empty",
        messageCode: closed
          ? "complaints.recoveryAbsent"
          : "complaints.recoveryPending",
      };

  // Summary items per §5.6 must-show data set.
  const summaryItems = [
    { k: locale === "en" ? "Case" : "案件編號", v: record.caseNo, mono: true },
    {
      k: locale === "en" ? "Opened" : "開立時間",
      v: formatDateTime(locale, record.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Source" : "來源",
      v: formatOpsCodeLabel(locale, record.caseSource),
    },
    {
      k: locale === "en" ? "Category" : "類別",
      v: formatOpsCodeLabel(locale, record.category),
    },
    {
      k: locale === "en" ? "Severity" : "嚴重程度",
      v: (
        <Pill theme={theme} tone={getSeverityTone(record.severity)} dot>
          {formatOpsCodeLabel(locale, record.severity)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v: (
        <Pill theme={theme} tone={getStatusTone(record.status)} dot>
          {formatOpsCodeLabel(locale, record.status)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "SLA status" : "SLA 狀態",
      v: (
        <Pill theme={theme} tone={slaTone(slaStatus)} dot>
          {slaLabel(slaStatus, locale)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "SLA due" : "SLA 截止",
      v: formatDateTime(locale, record.slaDueAt),
      mono: true,
    },
    {
      k: locale === "en" ? "SLA breached at" : "SLA 逾期時間",
      v: slaBreachedAt ? formatDateTime(locale, slaBreachedAt) : "—",
      mono: Boolean(slaBreachedAt),
    },
    {
      k: locale === "en" ? "Reopens" : "重開次數",
      v: String(record.reopenCount),
      mono: true,
    },
    {
      k: locale === "en" ? "Assignee" : "負責人",
      v: record.assigneeId ?? (locale === "en" ? "Unassigned" : "尚未指派"),
      mono: Boolean(record.assigneeId),
    },
    {
      k: locale === "en" ? "Updated" : "更新時間",
      v: formatDateTime(locale, record.updatedAt),
      mono: true,
    },
  ];

  const relatedItems = [
    {
      k: locale === "en" ? "Related order" : "相關訂單",
      v: record.relatedOrderId
        ? inAppLink(
            `/dispatch/${encodeURIComponent(record.relatedOrderId)}`,
            record.relatedOrderId,
          )
        : "—",
      mono: !record.relatedOrderId,
    },
    {
      k: locale === "en" ? "Related call" : "相關通話",
      v: record.relatedCallId
        ? inAppLink(
            `/callcenter?callId=${encodeURIComponent(record.relatedCallId)}`,
            record.relatedCallId,
          )
        : "—",
      mono: !record.relatedCallId,
    },
    {
      k: locale === "en" ? "Linked incident" : "已連結事故",
      v: record.relatedIncidentId
        ? inAppLink(
            `/incidents/${encodeURIComponent(record.relatedIncidentId)}`,
            record.relatedIncidentId,
          )
        : locale === "en"
          ? "— (not escalated)"
          : "— (未升級)",
      mono: !record.relatedIncidentId,
    },
    {
      k: locale === "en" ? "Tenant" : "租戶",
      v: orderResult.value?.tenantId ?? "—",
      mono: Boolean(orderResult.value?.tenantId),
    },
  ];

  const callSession = callSessionResult.value;
  const recordingReady =
    callSession?.recordingState === "ready" && callSession.recordingUrl;
  const recordingPending = callSession?.recordingState === "pending";
  const recordingMissing = callSession?.recordingState === "missing";

  const headerActions = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        justifyContent: "flex-end",
      }}
    >
      {availableActions.map((descriptor) => {
        const copy = ACTION_COPY[descriptor.action];
        const label = copy
          ? copy[locale]
          : formatOpsCodeLabel(locale, descriptor.action);
        const disabledReason = describeDisabledReason(descriptor, locale);
        const variant: "primary" | "secondary" | "ghost" =
          descriptor.action === "escalate_to_incident" && descriptor.enabled
            ? "primary"
            : "secondary";
        if (descriptor.enabled) {
          return (
            <Link
              key={descriptor.action}
              href={actionHref(descriptor, record.caseNo)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                height: 28,
                padding: "5px 10px",
                borderRadius: 7,
                background:
                  variant === "primary" ? theme.accent : theme.surface,
                color: variant === "primary" ? "#fff" : theme.text,
                border: `1px solid ${
                  variant === "primary" ? theme.accent : theme.border
                }`,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: "none",
              }}
              title={
                descriptor.requiresReason
                  ? locale === "en"
                    ? "Requires reason"
                    : "需填寫原因"
                  : descriptor.riskLevel === "medium"
                    ? locale === "en"
                      ? "Confirmation required"
                      : "需確認"
                    : undefined
              }
            >
              {copy ? <CanvasIcon name={copy.icon} size={12} /> : null}
              <span>{label}</span>
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontSize: 10,
                  color:
                    variant === "primary"
                      ? "rgba(255,255,255,.75)"
                      : theme.textMuted,
                }}
              >
                {descriptor.riskLevel}
              </span>
            </Link>
          );
        }
        return (
          <span
            key={descriptor.action}
            title={disabledReason ?? undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 28,
              padding: "5px 10px",
              borderRadius: 7,
              background: theme.surfaceLo,
              color: theme.textDim,
              border: `1px dashed ${theme.border}`,
              fontSize: 12,
              fontWeight: 500,
              cursor: "not-allowed",
            }}
          >
            {copy ? <CanvasIcon name={copy.icon} size={12} /> : null}
            <span>{label}</span>
            {disabledReason ? (
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontSize: 10,
                  color: theme.textMuted,
                }}
              >
                · {disabledReason}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );

  const headerTitle = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span>{record.caseNo}</span>
      <Pill theme={theme} tone={slaTone(slaStatus)} dot>
        {slaLabel(slaStatus, locale)}
      </Pill>
      <Pill theme={theme} tone={getSeverityTone(record.severity)}>
        {formatOpsCodeLabel(locale, record.severity)}
      </Pill>
      {escalated ? (
        <Pill theme={theme} tone="danger" dot>
          {locale === "en" ? "Escalated" : "已升級事故"}
        </Pill>
      ) : null}
      {closed ? (
        <Pill theme={theme} tone="success" dot>
          {locale === "en" ? "Read-only" : "唯讀"}
        </Pill>
      ) : null}
    </span>
  );

  const headerSubtitle = [
    formatOpsCodeLabel(locale, record.category),
    record.description,
    locale === "en"
      ? `Assignee ${record.assigneeId ?? "—"}`
      : `負責人 ${record.assigneeId ?? "—"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  // Refresh tier banner — packet §3.2 (T3 ops medium · 15s) + §3.3 (stale +
  // refresh affordance). Static SSR render; the refresh affordance is a link
  // back to the same URL so users can re-fetch on demand. Live polling lands
  // when the client island that owns mutations is split out.
  const refreshAffordance = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 8,
        background: theme.surfaceLo,
        border: `1px solid ${theme.border}`,
        fontSize: 12,
        color: theme.textMuted,
      }}
    >
      <CanvasIcon name="clock" size={12} />
      <span>
        {locale === "en"
          ? `T3 · medium · ${REFRESH_TIER_MS / 1000}s`
          : `T3 · 中速 · 每 ${REFRESH_TIER_MS / 1000} 秒`}
      </span>
      <span style={{ color: theme.textDim }}>·</span>
      <span style={{ fontFamily: theme.monoFamily, color: theme.textDim }}>
        {formatShortDateTime(locale, generatedAt)}
      </span>
      <Link
        href={`/complaints/${encodeURIComponent(record.caseNo)}`}
        style={{
          marginLeft: 6,
          color: theme.accent,
          textDecoration: "none",
          fontSize: 11.5,
        }}
      >
        {locale === "en" ? "Refresh" : "重新整理"}
      </Link>
    </div>
  );

  // Description / closingNote field block, surfaced inline under summary per
  // §5.6 (description + recovery notes both must-show).
  const descriptionBlock = (
    <Field theme={theme} label={locale === "en" ? "Description" : "事件說明"}>
      <div
        style={{
          color: theme.text,
          fontSize: 12.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {record.description}
      </div>
    </Field>
  );

  const closingBlock = record.closingNote ? (
    <Field theme={theme} label={locale === "en" ? "Closing note" : "結案備註"}>
      <div
        style={{
          color: theme.text,
          fontSize: 12.5,
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
        }}
      >
        {record.closingNote}
      </div>
      {record.resolutionCode ? (
        <div
          style={{
            marginTop: 6,
            fontFamily: theme.monoFamily,
            fontSize: 11.5,
            color: theme.textMuted,
          }}
        >
          {locale === "en" ? "Resolution code: " : "解決代碼："}
          {formatOpsCodeLabel(locale, record.resolutionCode)}
        </div>
      ) : null}
    </Field>
  ) : null;

  return (
    <>
      <PageHeader
        theme={theme}
        title={headerTitle}
        subtitle={headerSubtitle}
        actions={headerActions}
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Link
              href="/complaints"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: theme.textMuted,
                textDecoration: "none",
              }}
            >
              <CanvasIcon name="arrow" size={11} />
              <span>
                {locale === "en" ? "Back to complaints" : "返回客訴清單"}
              </span>
            </Link>
          </div>
          {refreshAffordance}
        </div>

        {slaStatus === "breached" ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={
              locale === "en"
                ? "SLA breached — escalate or document attribution"
                : "SLA 已逾期，請升級或記錄歸因"
            }
            body={
              locale === "en"
                ? `Breach recorded at ${formatDateTime(locale, slaBreachedAt)}. Decide whether the breach is real or an attribution issue, then escalate or apply a manual waiver per §5.6.`
                : `逾期記錄於 ${formatDateTime(locale, slaBreachedAt)}。請判斷此次逾期是否真實或為歸因問題，必要時升級或執行手動 SLA 豁免（見 §5.6）。`
            }
          />
        ) : slaStatus === "warning" ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="clock"
            title={locale === "en" ? "SLA window closing" : "SLA 即將到期"}
            body={
              locale === "en"
                ? `SLA due ${formatDateTime(locale, record.slaDueAt)} — keep recovery work moving to avoid a breach.`
                : `SLA 將於 ${formatDateTime(locale, record.slaDueAt)} 到期，請持續推進處理。`
            }
          />
        ) : null}

        {escalated ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={locale === "en" ? "Escalated to incident" : "已升級為事故"}
            body={(() => {
              const incident = incidentResult.value;
              const idLabel = record.relatedIncidentId;
              if (incident) {
                const titleStatus = `${incident.title} · ${formatOpsCodeLabel(locale, incident.status)} · ${formatOpsCodeLabel(locale, incident.severity)}`;
                return locale === "en"
                  ? `Linked to ${idLabel} — ${titleStatus}. Resolution continues at the incident workspace.`
                  : `已連結事故 ${idLabel} — ${titleStatus}，後續處理請於事故工作區進行。`;
              }
              return locale === "en"
                ? `Linked to ${idLabel}. Resolution continues at the incident workspace.`
                : `已連結事故 ${idLabel}，後續處理請於事故工作區進行。`;
            })()}
            actions={
              record.relatedIncidentId ? (
                <Link
                  href={`/incidents/${encodeURIComponent(record.relatedIncidentId)}`}
                  style={{
                    color: theme.accent,
                    textDecoration: "none",
                    fontSize: 12,
                  }}
                >
                  {locale === "en" ? "Open incident →" : "前往事故 →"}
                </Link>
              ) : undefined
            }
          />
        ) : null}

        {closed ? (
          <Banner
            theme={theme}
            tone="success"
            icon="check"
            title={
              locale === "en"
                ? `Case ${record.status === "closed" ? "closed" : "resolved"} — read-only`
                : `案件已${record.status === "closed" ? "結案" : "解決"}，僅供檢視`
            }
            body={
              locale === "en"
                ? "Mutations require reopening the case first."
                : "後續修改需先重新開啟案件。"
            }
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card
              theme={theme}
              title={locale === "en" ? "Case summary" : "案件摘要"}
              actions={(() => {
                const exportView = exportViewResult.value;
                if (!exportView) {
                  return null;
                }
                const ready = exportView.readyForAudit;
                return (
                  <Pill theme={theme} tone={ready ? "success" : "warn"} dot>
                    {ready
                      ? locale === "en"
                        ? `Export ready · ${formatShortDateTime(locale, exportView.exportGeneratedAt)}`
                        : `匯出可用 · ${formatShortDateTime(locale, exportView.exportGeneratedAt)}`
                      : locale === "en"
                        ? "Export pending audit fields"
                        : "匯出仍待補齊稽核欄位"}
                  </Pill>
                );
              })()}
            >
              <DL theme={theme} cols={3} items={summaryItems} />
              <div style={{ height: 14 }} />
              {descriptionBlock}
              {closingBlock ? <div style={{ height: 12 }} /> : null}
              {closingBlock}
            </Card>

            <Card
              theme={theme}
              title={t("complaints.timeline", locale)}
              subtitle={
                locale === "en"
                  ? "Cross-actor chronological log"
                  : "跨角色時間軸"
              }
            >
              {timelineEnvelope ? (
                renderEmptyEnvelope(timelineEnvelope, locale)
              ) : (
                <Timeline density="compact" items={timelineItems} />
              )}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Audit trail" : "稽核紀錄"}
              subtitle={
                locale === "en"
                  ? "Filtered to this case · open in platform-admin for full view"
                  : "已篩選至本案件，完整檢視請至 platform-admin"
              }
            >
              {auditEnvelope ? (
                renderEmptyEnvelope(auditEnvelope, locale)
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {caseAuditLogs.slice(0, 8).map((entry) => (
                    <div
                      key={entry.auditId}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr auto",
                        gap: 12,
                        alignItems: "baseline",
                        padding: "8px 10px",
                        borderRadius: 7,
                        background: theme.surfaceLo,
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: theme.monoFamily,
                          fontSize: 11,
                          color: theme.textMuted,
                        }}
                      >
                        {formatShortDateTime(locale, entry.createdAt)}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: theme.text,
                        }}
                      >
                        {formatOpsCodeLabel(locale, entry.actionName)} ·{" "}
                        {entry.actorType}
                      </span>
                      {newTabLink(
                        `https://admin.drts.io/audit?auditId=${encodeURIComponent(entry.auditId)}`,
                        locale === "en" ? "View" : "檢視",
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card
              theme={theme}
              title={
                locale === "en"
                  ? "Recording · PII masked"
                  : "通話錄音（PII 已遮罩）"
              }
            >
              {callSession ? (
                recordingReady ? (
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
                        fontSize: 11,
                        color: theme.text,
                      }}
                    >
                      {callSession.recordingId ?? callSession.callId}
                    </span>
                    {callSession.recordingUrl ? (
                      <a
                        href={callSession.recordingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: theme.accent,
                          textDecoration: "none",
                          fontSize: 11.5,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <CanvasIcon name="ext" size={11} />
                        {locale === "en" ? "Play (masked)" : "播放（已遮罩）"}
                      </a>
                    ) : null}
                  </div>
                ) : recordingPending ? (
                  renderEmptyEnvelope(
                    {
                      reason: "external_unavailable",
                      messageCode: "complaints.recording.pending",
                    },
                    locale,
                  )
                ) : recordingMissing ? (
                  renderEmptyEnvelope(
                    {
                      reason: "no_data",
                      messageCode: "complaints.recording.missing",
                    },
                    locale,
                  )
                ) : (
                  renderEmptyEnvelope(
                    {
                      reason: "not_provisioned",
                      messageCode: "complaints.recording.unknown",
                    },
                    locale,
                  )
                )
              ) : (
                renderEmptyEnvelope(
                  {
                    reason: callSessionResult.failed
                      ? "fetch_failed"
                      : record.relatedCallId
                        ? "external_unavailable"
                        : "no_data",
                    messageCode: "complaints.recording.absent",
                  },
                  locale,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Linked entities" : "關聯資料"}
            >
              <DL theme={theme} cols={1} items={relatedItems} />
            </Card>

            <Card
              theme={theme}
              title={locale === "en" ? "Recovery notes" : "服務恢復備註"}
              subtitle={
                locale === "en"
                  ? "Surface vs root cause must be distinct per §5.6"
                  : "區分「表面解決」與「根因處理」（§5.6）"
              }
            >
              {recoveryEnvelope ? (
                renderEmptyEnvelope(recoveryEnvelope, locale)
              ) : (
                <Banner
                  theme={theme}
                  tone={closed ? "success" : "warn"}
                  icon={closed ? "check" : "warn"}
                  title={
                    closed
                      ? locale === "en"
                        ? "Recovery recorded"
                        : "已登記恢復處理"
                      : locale === "en"
                        ? "Recovery in progress"
                        : "處理進行中"
                  }
                  body={record.closingNote ?? ""}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={
                locale === "en"
                  ? "Empty-state coverage"
                  : "EmptyReason 覆蓋（6 種）"
              }
              subtitle={
                locale === "en"
                  ? "Visual contract per packet §3.6"
                  : "依 packet §3.6 規範"
              }
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                }}
              >
                {SHOWCASE_REASONS.map((reason) => (
                  <div key={reason}>
                    {renderEmptyEnvelope(
                      {
                        reason,
                        messageCode: `complaints.emptyReason.${reason}`,
                      },
                      locale,
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
