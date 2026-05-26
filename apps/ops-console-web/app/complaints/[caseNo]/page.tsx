"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  AuditLogRecord,
  CallSessionRecord,
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintTimelineEntry,
  EmptyReason,
  OwnedOrderRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { useTranslation } from "@/lib/i18n";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasIcon,
  Timeline,
  buildCanvasTheme,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type { TimelineItem } from "@drts/ui-web";

type ResourceActionDescriptor = {
  action: string;
  enabled: boolean;
  disabledReasonCode?: string;
  requiresReason?: boolean;
  riskLevel: "low" | "medium" | "high";
};

type ComplaintDetailPageProps = {
  params: {
    caseNo: string;
  };
};

const REFRESH_TIER = {
  code: "T3",
  labelEn: "15s active poll",
  labelZh: "15 秒輪詢",
  staleAfterMs: 15_000,
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function formatDateTime(locale: "en" | "zh", value: string | null | undefined) {
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

function formatShortDateTime(
  locale: "en" | "zh",
  value: string | null | undefined,
) {
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

function formatRelativeAge(locale: "en" | "zh", value: string | null | undefined) {
  if (!value) {
    return locale === "en" ? "Unknown" : "未知";
  }

  const deltaMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / (1000 * 60)),
  );

  if (deltaMinutes < 1) {
    return locale === "en" ? "Just now" : "剛剛";
  }
  if (deltaMinutes < 60) {
    return locale === "en" ? `${deltaMinutes} min ago` : `${deltaMinutes} 分鐘前`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return locale === "en" ? `${deltaHours} hr ago` : `${deltaHours} 小時前`;
  }

  const deltaDays = Math.round(deltaHours / 24);
  return locale === "en" ? `${deltaDays} day(s) ago` : `${deltaDays} 天前`;
}

function getComplaintTone(record: ComplaintCaseRecord): CanvasTone {
  if (record.slaBreach) {
    return "danger";
  }
  if (record.status === "resolved" || record.status === "closed") {
    return "success";
  }
  if (record.severity === "high") {
    return "warn";
  }
  return "info";
}

function getTimelineTone(action: ComplaintTimelineEntry["action"]): TimelineItem["tone"] {
  if (action === "sla_breached" || action === "escalated_to_incident") {
    return "danger";
  }
  if (action === "case_resolved" || action === "case_closed") {
    return "success";
  }
  if (action === "case_reopened" || action === "incident_linked") {
    return "warning";
  }
  return "accent";
}

function actionLinkStyle(
  currentTheme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
) {
  const common = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "30px",
    padding: "6px 10px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    opacity: disabled ? 0.48 : 1,
    pointerEvents: disabled ? "none" : "auto",
    cursor: disabled ? "not-allowed" : "pointer",
  } as const;

  if (variant === "primary") {
    return {
      ...common,
      background: currentTheme.accent,
      color: "#ffffff",
      border: `1px solid ${currentTheme.accent}`,
    } as const;
  }

  if (variant === "ghost") {
    return {
      ...common,
      background: "transparent",
      color: currentTheme.textMuted,
      border: "1px solid transparent",
    } as const;
  }

  return {
    ...common,
    background: currentTheme.surface,
    color: currentTheme.text,
    border: `1px solid ${currentTheme.border}`,
  } as const;
}

function getEmptyStateConfig(locale: "en" | "zh", reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return {
        tone: "info" as const,
        icon: "search" as const,
        title: locale === "en" ? "No complaint data yet" : "尚無客訴資料",
        body:
          locale === "en"
            ? "This route exists, but the case has not accumulated timeline, recovery, or export evidence yet."
            : "此路由已建立，但案件尚未累積時間軸、補救措施或匯出證據。",
      };
    case "not_provisioned":
      return {
        tone: "warn" as const,
        icon: "flags" as const,
        title: locale === "en" ? "Evidence feed not provisioned" : "證據來源尚未佈建",
        body:
          locale === "en"
            ? "The complaint shell is ready, but a linked dependency such as recording retention or audit export is not provisioned yet."
            : "客訴頁面已就緒，但錄音保存或 audit export 等依賴尚未佈建。",
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: locale === "en" ? "Complaint fetch failed" : "客訴資料讀取失敗",
        body:
          locale === "en"
            ? "The backend did not return a usable complaint payload. Refresh or inspect service health before acting on the case."
            : "後端未回傳可用客訴資料。請先 refresh 或確認服務健康狀態。",
      };
    case "permission_denied":
      return {
        tone: "danger" as const,
        icon: "audit" as const,
        title: locale === "en" ? "You do not have complaint access" : "你沒有此客訴的存取權限",
        body:
          locale === "en"
            ? "The route resolved, but the current actor cannot inspect this complaint or its attached evidence."
            : "路由已解析，但目前身分不可檢視此客訴或其附加證據。",
      };
    case "external_unavailable":
      return {
        tone: "warn" as const,
        icon: "phone" as const,
        title: locale === "en" ? "External evidence unavailable" : "外部證據暫時不可用",
        body:
          locale === "en"
            ? "A linked system such as call recording or audit storage is unavailable, so this complaint is shown in a degraded mode."
            : "通話錄音或 audit 儲存等外部系統暫時不可用，頁面因此降級顯示。",
      };
    case "filtered_empty":
      return {
        tone: "info" as const,
        icon: "filter" as const,
        title: locale === "en" ? "Nothing matches this filtered view" : "目前篩選條件下沒有資料",
        body:
          locale === "en"
            ? "The complaint exists, but the current slice is intentionally empty because of the selected audit or recovery filter."
            : "客訴本身存在，但目前的 audit 或 recovery 篩選條件讓此區塊為空。",
      };
    default:
      return {
        tone: "info" as const,
        icon: "search" as const,
        title: locale === "en" ? "No data" : "沒有資料",
        body: locale === "en" ? "No data returned." : "未取得資料。",
      };
  }
}

function renderEmptyState(locale: "en" | "zh", reason: EmptyReason) {
  const config = getEmptyStateConfig(locale, reason);

  return (
    <Card theme={theme} title={locale === "en" ? "Empty reason" : "空狀態原因"}>
      <Banner
        theme={theme}
        tone={config.tone}
        icon={config.icon}
        title={config.title}
        body={config.body}
      />
      <div style={{ height: 12 }} />
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <Link href="/complaints" style={actionLinkStyle(theme)}>
          <CanvasIcon name="arrow" size={12} />
          <span>{locale === "en" ? "Back to complaints" : "返回客訴列表"}</span>
        </Link>
        <Link href="/complaints" style={actionLinkStyle(theme, "ghost")}>
          <CanvasIcon name="clock" size={12} />
          <span>{locale === "en" ? "Refresh page" : "重新整理頁面"}</span>
        </Link>
      </div>
    </Card>
  );
}

function renderCaseNotFound(locale: "en" | "zh", caseNo: string) {
  return (
    <Card theme={theme} title={locale === "en" ? "Complaint not found" : "找不到客訴案件"}>
      <Banner
        theme={theme}
        tone="danger"
        icon="search"
        title={
          locale === "en"
            ? `Case ${caseNo} does not exist`
            : `案件 ${caseNo} 不存在`
        }
        body={
          locale === "en"
            ? "Return to the complaint list and select another case."
            : "請返回客訴列表並改選其他案件。"
        }
      />
      <div style={{ height: 12 }} />
      <Link href="/complaints" style={actionLinkStyle(theme)}>
        <CanvasIcon name="arrow" size={12} />
        <span>{locale === "en" ? "Back to complaints" : "返回客訴列表"}</span>
      </Link>
    </Card>
  );
}

function deriveAvailableActions(record: ComplaintCaseRecord): ResourceActionDescriptor[] {
  const isClosed = record.status === "closed";
  const isResolved = record.status === "resolved";
  const isActive = ["new", "assigned", "under_investigation", "reopened"].includes(
    record.status,
  );

  return [
    {
      action: "add_note",
      enabled: !isClosed,
      disabledReasonCode: isClosed ? "closed_case_read_only" : undefined,
      riskLevel: "low",
    },
    {
      action: "assign",
      enabled: !isClosed,
      disabledReasonCode: isClosed ? "closed_case_read_only" : undefined,
      riskLevel: "medium",
    },
    {
      action: "resolve",
      enabled: isActive,
      disabledReasonCode: isActive ? undefined : "resolve_requires_active_case",
      riskLevel: "medium",
    },
    {
      action: "close",
      enabled: isResolved,
      disabledReasonCode: isResolved ? undefined : "close_requires_resolved_case",
      riskLevel: "medium",
    },
    {
      action: "reopen",
      enabled: isResolved || isClosed,
      disabledReasonCode:
        isResolved || isClosed ? undefined : "reopen_requires_resolved_or_closed_case",
      riskLevel: "high",
      requiresReason: true,
    },
    {
      action: "escalate_to_incident",
      enabled: !record.relatedIncidentId && !isClosed,
      disabledReasonCode: record.relatedIncidentId
        ? "incident_already_linked"
        : isClosed
          ? "closed_case_read_only"
          : undefined,
      riskLevel: "high",
      requiresReason: true,
    },
    {
      action: "export",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "manual_sla_waiver",
      enabled: false,
      disabledReasonCode: "restricted_role_ops_manager_only",
      riskLevel: "high",
      requiresReason: true,
    },
  ];
}

function getActionLabel(locale: "en" | "zh", action: string) {
  const labels: Record<string, { en: string; zh: string }> = {
    add_note: { en: "Add note", zh: "新增備註" },
    assign: { en: "Assign / reassign", zh: "指派 / 重新指派" },
    resolve: { en: "Resolve", zh: "解決" },
    close: { en: "Close", zh: "關閉" },
    reopen: { en: "Reopen", zh: "重開" },
    escalate_to_incident: { en: "Escalate to incident", zh: "升級為事故" },
    export: { en: "Export view", zh: "匯出檢視" },
    manual_sla_waiver: { en: "Manual SLA waiver", zh: "人工 SLA 豁免" },
  };

  return labels[action]?.[locale] ?? action;
}

function getDisabledReasonLabel(locale: "en" | "zh", code: string | undefined) {
  if (!code) {
    return null;
  }

  const labels: Record<string, { en: string; zh: string }> = {
    closed_case_read_only: {
      en: "Closed cases are read-only except reopen.",
      zh: "已關閉案件除重開外皆為唯讀。",
    },
    resolve_requires_active_case: {
      en: "Only active cases can move to resolved.",
      zh: "只有進行中的案件可標記為已解決。",
    },
    close_requires_resolved_case: {
      en: "Close is allowed only after resolution.",
      zh: "需先解決後才能關閉。",
    },
    reopen_requires_resolved_or_closed_case: {
      en: "Only resolved or closed cases can reopen.",
      zh: "只有已解決或已關閉案件可重開。",
    },
    incident_already_linked: {
      en: "This complaint is already linked to an incident.",
      zh: "此客訴已連結事故。",
    },
    restricted_role_ops_manager_only: {
      en: "Restricted to the SLA waiver authority lane.",
      zh: "僅 SLA waiver 權限角色可執行。",
    },
  };

  return labels[code]?.[locale] ?? code;
}

function getActionHref(caseNo: string, action: string) {
  return `/complaints?caseNo=${encodeURIComponent(caseNo)}&action=${encodeURIComponent(action)}`;
}

function ComplaintDetailInner({ caseNo }: { caseNo: string }) {
  const { locale } = useTranslation();
  const searchParams = useSearchParams();
  const [complaint, setComplaint] = useState<ComplaintCaseRecord | null>(null);
  const [timeline, setTimeline] = useState<ComplaintTimelineEntry[]>([]);
  const [exportView, setExportView] = useState<ComplaintExportViewRecord | null>(null);
  const [callSession, setCallSession] = useState<CallSessionRecord | null>(null);
  const [order, setOrder] = useState<OwnedOrderRecord | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emptyReason = searchParams.get("emptyReason") as EmptyReason | null;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const client = getOpsClient();
        const complaintRecord = await client.getComplaint(caseNo);
        const [timelineItems, exportRecord, fullAuditLogs] = await Promise.all([
          client.getComplaintTimeline(caseNo),
          client.getComplaintExportView(caseNo),
          client.listAuditLogs(),
        ]);
        const [callRecord, orderRecord] = await Promise.all([
          complaintRecord.relatedCallId
            ? client.getCallSession(complaintRecord.relatedCallId)
            : Promise.resolve(null),
          complaintRecord.relatedOrderId
            ? client.getOrder(complaintRecord.relatedOrderId)
            : Promise.resolve(null),
        ]);

        if (cancelled) {
          return;
        }

        setComplaint(complaintRecord);
        setTimeline(timelineItems);
        setExportView(exportRecord);
        setAuditLogs(fullAuditLogs);
        setCallSession(callRecord);
        setOrder(orderRecord);
        setError(null);
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        if (nextError instanceof Error && /404/.test(nextError.message)) {
          setComplaint(null);
          setError("__NOT_FOUND__");
        } else {
          setError(nextError instanceof Error ? nextError.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [caseNo]);

  const complaintAudits = useMemo(
    () =>
      [...auditLogs]
        .filter(
          (entry) =>
            entry.resourceType === "complaint" && entry.resourceId === caseNo,
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
    [auditLogs, caseNo],
  );

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader
          theme={theme}
          title={locale === "en" ? "Complaint detail" : "客訴詳情"}
          subtitle={locale === "en" ? "Loading case data..." : "載入案件資料中..."}
        />
      </div>
    );
  }

  if (!complaint) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader
          theme={theme}
          title={locale === "en" ? "Complaint detail" : "客訴詳情"}
          subtitle={caseNo}
        />
        {renderCaseNotFound(locale, caseNo)}
      </div>
    );
  }

  const availableActions = deriveAvailableActions(complaint);
  const latestAudit = complaintAudits[0] ?? null;
  const refreshTimestamp = exportView?.exportGeneratedAt ?? complaint.updatedAt;
  const isStale =
    Date.now() - new Date(refreshTimestamp).getTime() > REFRESH_TIER.staleAfterMs;
  const timelineItems: TimelineItem[] = [...timeline]
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
      supportingContent: (
        <span
          style={{
            color: theme.textMuted,
            fontSize: "12px",
          }}
        >
          {formatRelativeAge(locale, entry.createdAt)}
        </span>
      ),
    }));

  const summaryItems = [
    { k: "CASE", v: complaint.caseNo, mono: true },
    {
      k: locale === "en" ? "Source" : "來源",
      v: formatOpsCodeLabel(locale, complaint.caseSource),
      mono: true,
    },
    {
      k: locale === "en" ? "Category" : "類別",
      v: formatOpsCodeLabel(locale, complaint.category),
      mono: true,
    },
    {
      k: locale === "en" ? "Severity" : "嚴重度",
      v: (
        <Pill theme={theme} tone={complaint.severity === "high" ? "danger" : "info"} dot>
          {formatOpsCodeLabel(locale, complaint.severity)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Status" : "狀態",
      v: (
        <Pill theme={theme} tone={getComplaintTone(complaint)} dot>
          {formatOpsCodeLabel(locale, complaint.status)}
        </Pill>
      ),
    },
    {
      k: locale === "en" ? "Assignee" : "負責人",
      v: complaint.assigneeId ?? (locale === "en" ? "Unassigned" : "未指派"),
      mono: Boolean(complaint.assigneeId),
    },
    {
      k: locale === "en" ? "Created" : "建立時間",
      v: formatDateTime(locale, complaint.createdAt),
      mono: true,
    },
    {
      k: locale === "en" ? "Updated" : "更新時間",
      v: formatDateTime(locale, complaint.updatedAt),
      mono: true,
    },
    {
      k: locale === "en" ? "SLA due" : "SLA 到期",
      v: formatDateTime(locale, complaint.slaDueAt),
      mono: true,
    },
    {
      k: locale === "en" ? "SLA state" : "SLA 狀態",
      v: complaint.slaBreach
        ? locale === "en"
          ? "Breached"
          : "已違規"
        : locale === "en"
          ? "Within window"
          : "時限內",
      mono: true,
    },
    {
      k: locale === "en" ? "Reopens" : "重開次數",
      v: `${complaint.reopenCount}`,
      mono: true,
    },
    {
      k: locale === "en" ? "Refresh tier" : "Refresh tier",
      v: `${REFRESH_TIER.code} · ${
        locale === "en" ? REFRESH_TIER.labelEn : REFRESH_TIER.labelZh
      }`,
      mono: true,
    },
  ];

  const linkedItems = [
    {
      k: locale === "en" ? "Related order" : "關聯訂單",
      v: complaint.relatedOrderId ? (
        <Link
          href={`/dispatch/${encodeURIComponent(complaint.relatedOrderId)}`}
          style={actionLinkStyle(theme)}
        >
          <CanvasIcon name="ext" size={12} />
          <span>
            {getOpsLabel(locale, "order")} {complaint.relatedOrderId}
          </span>
        </Link>
      ) : (
        "—"
      ),
    },
    {
      k: locale === "en" ? "Call session" : "通話 Session",
      v: complaint.relatedCallId ? (
        <Link
          href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
          style={actionLinkStyle(theme)}
        >
          <CanvasIcon name="phone" size={12} />
          <span>{complaint.relatedCallId}</span>
        </Link>
      ) : (
        "—"
      ),
    },
    {
      k: locale === "en" ? "Recording" : "錄音證據",
      v:
        callSession?.recordingUrl && callSession.recordingId ? (
          <a
            href={callSession.recordingUrl}
            target="_blank"
            rel="noreferrer"
            style={actionLinkStyle(theme)}
          >
            <CanvasIcon name="phone" size={12} />
            <span>{`${callSession.recordingId} · PII masked`}</span>
          </a>
        ) : callSession?.recordingState ? (
          `${formatOpsCodeLabel(locale, callSession.recordingState)}`
        ) : (
          "—"
        ),
    },
    {
      k: locale === "en" ? "Incident" : "關聯事故",
      v: complaint.relatedIncidentId ? (
        <Link
          href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
          style={actionLinkStyle(theme)}
        >
          <CanvasIcon name="warn" size={12} />
          <span>{complaint.relatedIncidentId}</span>
        </Link>
      ) : (
        locale === "en" ? "Not escalated" : "尚未升級"
      ),
    },
  ];

  const auditItems =
    complaintAudits.length > 0
      ? complaintAudits.slice(0, 4).map((entry) => ({
          k: `${formatShortDateTime(locale, entry.createdAt)} · ${entry.actionName}`,
          v: (
            <div style={{ display: "grid", gap: "4px" }}>
              <span
                style={{
                  fontFamily: theme.monoFamily,
                  fontSize: "11.5px",
                  color: theme.text,
                }}
              >
                {entry.auditId}
              </span>
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {entry.actorId ?? entry.actorType}
              </span>
            </div>
          ),
        }))
      : [
          {
            k: locale === "en" ? "Audit" : "稽核",
            v: locale === "en" ? "No complaint audit rows yet." : "目前尚無此客訴的 audit 紀錄。",
          },
        ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={`${complaint.caseNo} · ${formatOpsCodeLabel(locale, complaint.category)}`}
        subtitle={[
          formatOpsCodeLabel(locale, complaint.status),
          complaint.slaBreach
            ? locale === "en"
              ? "SLA breached"
              : "SLA 違規"
            : locale === "en"
              ? "SLA healthy"
              : "SLA 正常",
          complaint.assigneeId ??
            (locale === "en" ? "Unassigned" : "未指派"),
          formatDateTime(locale, complaint.updatedAt),
        ].join(" · ")}
        actions={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <Pill theme={theme} tone={isStale ? "warn" : "success"}>
              {REFRESH_TIER.code}
            </Pill>
            <Link href="/complaints" style={actionLinkStyle(theme)}>
              <CanvasIcon name="arrow" size={12} />
              <span>{locale === "en" ? "Complaint list" : "客訴列表"}</span>
            </Link>
            <Link href={getActionHref(complaint.caseNo, "export")} style={actionLinkStyle(theme)}>
              <CanvasIcon name="export" size={12} />
              <span>{locale === "en" ? "Export packet" : "匯出封包"}</span>
            </Link>
            {latestAudit ? (
              <a
                href={`/audit?auditId=${encodeURIComponent(latestAudit.auditId)}`}
                target="_blank"
                rel="noreferrer"
                style={actionLinkStyle(theme, "primary")}
              >
                <CanvasIcon name="audit" size={12} />
                <span>{locale === "en" ? "View audit" : "檢視 audit"}</span>
              </a>
            ) : null}
          </div>
        }
      />

      <div style={{ padding: 24 }}>
        <div style={{ display: "grid", gap: 16 }}>
          {error ? (
            <Banner
              theme={theme}
              tone="danger"
              icon="warn"
              title={locale === "en" ? "Complaint detail degraded" : "客訴詳情降級顯示"}
              body={error}
            />
          ) : null}

          <Banner
            theme={theme}
            tone={complaint.slaBreach ? "danger" : getComplaintTone(complaint)}
            icon={complaint.relatedIncidentId ? "warn" : "complaints"}
            title={
              complaint.slaBreach
                ? locale === "en"
                  ? "SLA breach requires end-to-end ownership"
                  : "SLA 已違規，需全程接手處理"
                : locale === "en"
                  ? "Complaint remains inside ops until closure"
                  : "客訴在關閉前維持由 ops 負責"
            }
            body={[
              locale === "en"
                ? `Refresh ${formatDateTime(locale, refreshTimestamp)}`
                : `最近刷新 ${formatDateTime(locale, refreshTimestamp)}`,
              isStale
                ? locale === "en"
                  ? `Content is stale for ${REFRESH_TIER.code}. Refresh before making a resolution or escalation decision.`
                  : `內容已超過 ${REFRESH_TIER.code} 新鮮度，請先 refresh 再做解決或升級判斷。`
                : locale === "en"
                  ? `Data is within ${REFRESH_TIER.labelEn}.`
                  : `資料仍在 ${REFRESH_TIER.labelZh} 內。`,
            ].join(" · ")}
          />

          {emptyReason ? renderEmptyState(locale, emptyReason) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 1fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <div style={{ display: "grid", gap: 16 }}>
              <Card theme={theme} title={locale === "en" ? "Case summary" : "案件摘要"}>
                <DL theme={theme} cols={3} items={summaryItems} />
                <div style={{ height: 14 }} />
                <Field theme={theme} label={locale === "en" ? "Description" : "描述"}>
                  <div
                    style={{
                      color: theme.text,
                      fontSize: "12.5px",
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {complaint.description}
                  </div>
                </Field>
                <div style={{ height: 12 }} />
                <Field theme={theme} label={locale === "en" ? "Reporter context" : "回報來源"}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <Pill theme={theme} tone="info" dot>
                      {formatOpsCodeLabel(locale, complaint.caseSource)}
                    </Pill>
                    <span style={{ color: theme.textMuted }}>
                      {callSession?.callerPhone ??
                        (locale === "en"
                          ? "Reporter identity not expanded in current contract."
                          : "目前 contract 未展開回報人身分。")}
                    </span>
                  </div>
                </Field>
              </Card>

              <Card theme={theme} title={locale === "en" ? "Timeline" : "時間軸"}>
                <Timeline
                  density="compact"
                  items={timelineItems}
                  emptyState={locale === "en" ? "No timeline entries yet." : "目前尚無時間軸紀錄。"}
                />
              </Card>

              <Card theme={theme} title={locale === "en" ? "Audit subset" : "Audit 子集"}>
                <DL theme={theme} cols={1} items={auditItems} />
              </Card>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <Card
                theme={theme}
                title={locale === "en" ? "Available actions" : "可用動作"}
                subtitle={
                  locale === "en"
                    ? "CTAs are rendered from the complaint action descriptor set."
                    : "CTA 依案件 action descriptor 集合顯示。"
                }
              >
                <div style={{ display: "grid", gap: 10 }}>
                  {availableActions.map((action) => (
                    <div
                      key={action.action}
                      style={{
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        padding: 12,
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <strong style={{ color: theme.text }}>
                          {getActionLabel(locale, action.action)}
                        </strong>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Pill theme={theme} tone={action.enabled ? "success" : "neutral"}>
                            {action.enabled
                              ? locale === "en"
                                ? "enabled"
                                : "可執行"
                              : locale === "en"
                                ? "disabled"
                                : "停用"}
                          </Pill>
                          <Pill
                            theme={theme}
                            tone={
                              action.riskLevel === "high"
                                ? "danger"
                                : action.riskLevel === "medium"
                                  ? "warn"
                                  : "info"
                            }
                          >
                            {action.riskLevel}
                          </Pill>
                          {action.requiresReason ? (
                            <Pill theme={theme} tone="warn">
                              {locale === "en" ? "reason required" : "需填原因"}
                            </Pill>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ color: theme.textMuted, fontSize: "12px" }}>
                        {action.enabled
                          ? locale === "en"
                            ? "Opens the complaint workspace flow for this action."
                            : "開啟此案件對應的 complaint workspace 流程。"
                          : getDisabledReasonLabel(locale, action.disabledReasonCode)}
                      </div>
                      <Link
                        href={getActionHref(complaint.caseNo, action.action)}
                        style={actionLinkStyle(theme, action.action === "escalate_to_incident" ? "primary" : "secondary", !action.enabled)}
                        aria-disabled={!action.enabled}
                      >
                        <CanvasIcon
                          name={
                            action.action === "export"
                              ? "export"
                              : action.action === "escalate_to_incident"
                                ? "warn"
                                : action.action === "assign"
                                  ? "users"
                                  : "plus"
                          }
                          size={12}
                        />
                        <span>{getActionLabel(locale, action.action)}</span>
                      </Link>
                    </div>
                  ))}
                </div>
              </Card>

              <Card theme={theme} title={locale === "en" ? "Linked entities" : "關聯項目"}>
                <DL theme={theme} cols={1} items={linkedItems} />
                {order ? (
                  <>
                    <div style={{ height: 12 }} />
                    <Field theme={theme} label={locale === "en" ? "Order route" : "訂單路線"}>
                      <div
                        style={{
                          color: theme.text,
                          fontSize: "12.5px",
                          lineHeight: 1.55,
                        }}
                      >
                        {`${order.pickup.addressLine1} → ${order.dropoff.addressLine1}`}
                      </div>
                    </Field>
                  </>
                ) : null}
              </Card>

              <Card theme={theme} title={locale === "en" ? "Recovery notes" : "補救措施"}>
                {complaint.closingNote || complaint.resolutionCode ? (
                  <>
                    <DL
                      theme={theme}
                      cols={1}
                      items={[
                        {
                          k: locale === "en" ? "Resolution code" : "解決代碼",
                          v: complaint.resolutionCode
                            ? formatOpsCodeLabel(locale, complaint.resolutionCode)
                            : "—",
                        },
                      ]}
                    />
                    <div style={{ height: 12 }} />
                    <Field theme={theme} label={locale === "en" ? "Recovery / closing note" : "補救 / 關閉備註"}>
                      <div
                        style={{
                          color: theme.text,
                          fontSize: "12.5px",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {complaint.closingNote ?? "—"}
                      </div>
                    </Field>
                  </>
                ) : (
                  <Banner
                    theme={theme}
                    tone="warn"
                    icon="warn"
                    title={locale === "en" ? "Pre-resolution state" : "尚未解決"}
                    body={
                      locale === "en"
                        ? "No recovery note is recorded yet. The case still needs remediation narrative before resolve / close."
                        : "尚未記錄補救說明。案件在 resolve / close 前仍需補上 remediation narrative。"
                    }
                  />
                )}
              </Card>

              <Card theme={theme} title={locale === "en" ? "Navigation" : "導覽"}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href="/complaints" style={actionLinkStyle(theme)}>
                    <CanvasIcon name="arrow" size={12} />
                    <span>{locale === "en" ? "Back to list" : "返回列表"}</span>
                  </Link>
                  {complaint.relatedIncidentId ? (
                    <Link
                      href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
                      style={actionLinkStyle(theme, "ghost")}
                    >
                      <CanvasIcon name="warn" size={12} />
                      <span>{locale === "en" ? "Open incident" : "開啟事故"}</span>
                    </Link>
                  ) : null}
                  {complaint.relatedOrderId ? (
                    <Link
                      href={`/dispatch/${encodeURIComponent(complaint.relatedOrderId)}`}
                      style={actionLinkStyle(theme, "ghost")}
                    >
                      <CanvasIcon name="ext" size={12} />
                      <span>{locale === "en" ? "Open dispatch order" : "開啟派遣訂單"}</span>
                    </Link>
                  ) : null}
                  {complaint.relatedCallId ? (
                    <Link
                      href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
                      style={actionLinkStyle(theme, "ghost")}
                    >
                      <CanvasIcon name="phone" size={12} />
                      <span>{locale === "en" ? "Open callcenter session" : "開啟客服通話"}</span>
                    </Link>
                  ) : null}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function ComplaintDetailPage({ params }: ComplaintDetailPageProps) {
  return <ComplaintDetailInner caseNo={params.caseNo} />;
}
