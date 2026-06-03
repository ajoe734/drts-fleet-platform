"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  ComplaintCaseRecord,
  ComplaintExportViewRecord,
  ComplaintResolutionCode,
  ComplaintTimelineEntry,
  EscalateComplaintToIncidentCommand,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { COMPLAINT_CATEGORY_VALID_RESOLUTIONS } from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  Timeline as CanvasTimeline,
  buildCanvasTheme,
  type CanvasTone,
  type TimelineItem,
} from "@drts/ui-web";

type Locale = "en" | "zh";
type ComplaintCaseUiRecord = ComplaintCaseRecord & {
  slaStatus?: "within_sla" | "warning" | "breached";
  slaBreachedAt?: string | null;
};

type ActionKey = "add_note" | "assign" | "resolve" | "escalate_to_incident";
type ModalState = {
  descriptor: ResourceActionDescriptor;
  action: ActionKey;
} | null;
type Receipt = {
  title: string;
  body: string;
} | null;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const CURRENT_AGENT_ID = "AGENT-OPS-002";

const controlStyle: CSSProperties = {
  background: theme.bgRaised,
  color: theme.text,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: theme.fontFamily,
  width: "100%",
};

const textareaStyle: CSSProperties = {
  ...controlStyle,
  resize: "vertical",
  minHeight: 88,
};

function tx(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
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
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatRelativeSla(locale: Locale, value: string) {
  const deltaMinutes = Math.round(
    (new Date(value).getTime() - Date.now()) / (1000 * 60),
  );
  if (!Number.isFinite(deltaMinutes)) {
    return "—";
  }
  if (deltaMinutes >= 0) {
    return tx(
      locale,
      `due in ${deltaMinutes} min`,
      `還有 ${deltaMinutes} 分鐘`,
    );
  }
  return tx(
    locale,
    `overdue ${Math.abs(deltaMinutes)} min`,
    `逾期 ${Math.abs(deltaMinutes)} 分鐘`,
  );
}

function resolveSlaStatus(record: ComplaintCaseUiRecord) {
  if (record.slaStatus) {
    return record.slaStatus;
  }
  if (record.slaBreach) {
    return "breached" as const;
  }
  const msToDue = new Date(record.slaDueAt).getTime() - Date.now();
  if (Number.isFinite(msToDue) && msToDue <= 60 * 60 * 1000) {
    return "warning" as const;
  }
  return "within_sla" as const;
}

function statusTone(status: ComplaintCaseRecord["status"]): CanvasTone {
  switch (status) {
    case "resolved":
      return "success";
    case "closed":
      return "neutral";
    case "reopened":
      return "warn";
    default:
      return "info";
  }
}

function actionLabel(locale: Locale, action: ActionKey) {
  switch (action) {
    case "add_note":
      return tx(locale, "Note", "新增備註");
    case "assign":
      return tx(locale, "Assign", "重新指派");
    case "resolve":
      return tx(locale, "Resolve", "結案");
    case "escalate_to_incident":
      return tx(locale, "Escalate", "升級事故");
  }
}

function actionIcon(action: ActionKey) {
  switch (action) {
    case "add_note":
      return "plus" as const;
    case "assign":
      return "users" as const;
    case "resolve":
      return "check" as const;
    case "escalate_to_incident":
      return "warn" as const;
  }
}

function deriveActions(
  record: ComplaintCaseRecord,
): ResourceActionDescriptor[] {
  if (record.status === "resolved" || record.status === "closed") {
    return [];
  }
  return [
    { action: "add_note", enabled: true, riskLevel: "low" },
    { action: "assign", enabled: true, riskLevel: "medium" },
    { action: "resolve", enabled: true, riskLevel: "medium" },
    {
      action: "escalate_to_incident",
      enabled: true,
      riskLevel: "high",
      requiresReason: true,
    },
  ];
}

function buildTimelineItems(
  locale: Locale,
  complaint: ComplaintCaseUiRecord,
  timeline: ComplaintTimelineEntry[],
): TimelineItem[] {
  return timeline.map((entry) => {
    const tone: NonNullable<TimelineItem["tone"]> =
      entry.action === "sla_breached"
        ? "danger"
        : entry.action === "case_reopened" ||
            entry.action === "escalated_to_incident"
          ? "warning"
          : entry.action === "case_created"
            ? "accent"
            : "info";

    const actor =
      entry.action === "case_created"
        ? complaint.caseSource === "phone"
          ? "hotline.intake"
          : complaint.caseSource === "ops"
            ? "ops.console"
            : `${complaint.caseSource}.intake`
        : entry.action === "sla_breached" || entry.action === "sla_recalculated"
          ? "system.sla"
          : "ops.compliance";

    return {
      id: entry.entryId,
      eyebrow:
        actor === "system.sla"
          ? "system"
          : actor.includes("intake")
            ? "intake"
            : "ops",
      title: formatOpsCodeLabel(locale, entry.action),
      detail: entry.note,
      timestamp: formatDateTime(locale, entry.createdAt),
      tone,
      meta: actor,
    };
  });
}

function DetailValue({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <span style={mono ? { fontFamily: theme.monoFamily, fontSize: 11.5 } : {}}>
      {children}
    </span>
  );
}

function CanvasActionButton({
  descriptor,
  locale,
  busy,
  onClick,
}: {
  descriptor: ResourceActionDescriptor;
  locale: Locale;
  busy: boolean;
  onClick: () => void;
}) {
  const action = descriptor.action as ActionKey;
  return (
    <Btn
      theme={theme}
      size="sm"
      icon={actionIcon(action)}
      danger={descriptor.riskLevel === "high"}
      variant={descriptor.riskLevel === "medium" ? "secondary" : "ghost"}
      disabled={!descriptor.enabled || busy}
      onClick={onClick}
    >
      {actionLabel(locale, action)}
      {descriptor.requiresReason ? " *" : ""}
    </Btn>
  );
}

function ModalField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <Field theme={theme} label={required ? `${label} *` : label}>
      {children}
    </Field>
  );
}

export function ComplaintDetailClient({
  locale,
  initialComplaint,
  initialTimeline,
  initialExportView,
}: {
  locale: Locale;
  initialComplaint: ComplaintCaseUiRecord;
  initialTimeline: ComplaintTimelineEntry[];
  initialExportView: ComplaintExportViewRecord | null;
}) {
  const [complaint, setComplaint] = useState(initialComplaint);
  const [timeline, setTimeline] = useState(initialTimeline);
  const [exportView, setExportView] = useState(initialExportView);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [receipt, setReceipt] = useState<Receipt>(null);
  const [error, setError] = useState<string | null>(null);

  const [assigneeId, setAssigneeId] = useState(
    complaint.assigneeId ?? CURRENT_AGENT_ID,
  );
  const [assignmentNote, setAssignmentNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [resolutionCode, setResolutionCode] = useState<ComplaintResolutionCode>(
    COMPLAINT_CATEGORY_VALID_RESOLUTIONS[complaint.category]?.[0] ??
      "resolved_other",
  );
  const [closingNote, setClosingNote] = useState("");
  const [escalateTitle, setEscalateTitle] = useState(complaint.caseNo);
  const [escalateReason, setEscalateReason] = useState("");

  const actions = useMemo(() => deriveActions(complaint), [complaint]);
  const validResolutionCodes = useMemo(
    () => COMPLAINT_CATEGORY_VALID_RESOLUTIONS[complaint.category] ?? [],
    [complaint.category],
  );
  const timelineItems = useMemo(
    () => buildTimelineItems(locale, complaint, timeline),
    [complaint, locale, timeline],
  );

  useEffect(() => {
    setAssigneeId(complaint.assigneeId ?? CURRENT_AGENT_ID);
    setEscalateTitle(complaint.caseNo);
    setResolutionCode((current: ComplaintResolutionCode) =>
      validResolutionCodes.includes(current)
        ? current
        : (validResolutionCodes[0] ?? "resolved_other"),
    );
  }, [complaint, validResolutionCodes]);

  async function refreshDetail() {
    const client = getOpsClient();
    try {
      const [nextComplaint, nextTimeline, nextExportView] = await Promise.all([
        client.getComplaint(complaint.caseNo) as Promise<ComplaintCaseUiRecord>,
        client.getComplaintTimeline(complaint.caseNo),
        client.getComplaintExportView(complaint.caseNo),
      ]);
      setComplaint(nextComplaint);
      setTimeline(nextTimeline);
      setExportView(nextExportView);
      setError(null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : tx(locale, "Failed to refresh case", "重新整理案件失敗"),
      );
    }
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await refreshDetail();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : tx(locale, "Action failed", "操作失敗"),
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function submitModal() {
    if (!modal) {
      return;
    }

    const key = `${modal.action}-${complaint.caseNo}`;
    await runAction(key, async () => {
      const client = getOpsClient();
      if (modal.action === "add_note") {
        await client.addComplaintNote(complaint.caseNo, { note: noteText });
        setReceipt({
          title: tx(locale, "Case note added", "已新增案件備註"),
          body:
            noteText ||
            tx(locale, "No note text recorded.", "未填寫備註內容。"),
        });
      } else if (modal.action === "assign") {
        await client.assignComplaint(complaint.caseNo, {
          assigneeId,
          note: assignmentNote || null,
        });
        setReceipt({
          title: tx(locale, "Case reassigned", "案件已重新指派"),
          body: `${assigneeId}${assignmentNote ? ` · ${assignmentNote}` : ""}`,
        });
      } else if (modal.action === "resolve") {
        await client.resolveComplaint(complaint.caseNo, {
          resolutionCode,
          closingNote,
        });
        setReceipt({
          title: tx(locale, "Case resolved", "案件已結案"),
          body: `${formatOpsCodeLabel(locale, resolutionCode)}${closingNote ? ` · ${closingNote}` : ""}`,
        });
      } else if (modal.action === "escalate_to_incident") {
        await client.escalateComplaintToIncident(complaint.caseNo, {
          title: escalateTitle,
          reason: escalateReason,
          severity: "high",
        } satisfies EscalateComplaintToIncidentCommand);
        setReceipt({
          title: tx(locale, "Incident created", "已建立事故"),
          body: `${escalateTitle} · ${escalateReason}`,
        });
      }
      setModal(null);
      setAssignmentNote("");
      setNoteText("");
      setClosingNote("");
      setEscalateReason("");
    });
  }

  const slaStatus = resolveSlaStatus(complaint);
  const readOnly =
    complaint.status === "resolved" || complaint.status === "closed";

  return (
    <>
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <PageHeader
          theme={theme}
          title={
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span style={{ fontFamily: theme.monoFamily }}>
                {complaint.caseNo}
              </span>
              {slaStatus === "breached" ? (
                <Pill theme={theme} tone="danger" dot>
                  {tx(locale, "SLA breached", "SLA breached")}
                </Pill>
              ) : null}
              <Pill
                theme={theme}
                tone={complaint.severity === "high" ? "danger" : "neutral"}
              >
                {formatOpsCodeLabel(locale, complaint.severity)}
              </Pill>
              <Pill theme={theme} tone={statusTone(complaint.status)} dot>
                {formatOpsCodeLabel(locale, complaint.status)}
              </Pill>
            </span>
          }
          subtitle={`${formatOpsCodeLabel(locale, complaint.category)} · ${complaint.description}`}
          actions={
            !readOnly ? (
              <>
                {actions.map((descriptor) => (
                  <CanvasActionButton
                    key={descriptor.action}
                    descriptor={descriptor}
                    locale={locale}
                    busy={
                      busyKey === `${descriptor.action}-${complaint.caseNo}`
                    }
                    onClick={() =>
                      setModal({
                        descriptor,
                        action: descriptor.action as ActionKey,
                      })
                    }
                  />
                ))}
              </>
            ) : undefined
          }
        />

        {readOnly ? (
          <Banner
            theme={theme}
            tone="info"
            icon="audit"
            title={tx(locale, "Read-only case", "唯讀案件")}
            body={tx(
              locale,
              "Resolved and closed complaints stay immutable here; use the timeline for audit review.",
              "已解決或已關閉的客訴在此為唯讀；請以時間軸進行稽核檢視。",
            )}
          />
        ) : null}

        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={tx(locale, "Action error", "操作錯誤")}
            body={error}
          />
        ) : null}

        {receipt ? (
          <Banner
            theme={theme}
            tone="success"
            icon="ok"
            title={receipt.title}
            body={receipt.body}
            actions={
              <Btn
                theme={theme}
                size="xs"
                icon="x"
                onClick={() => setReceipt(null)}
              >
                {tx(locale, "Dismiss", "關閉")}
              </Btn>
            }
          />
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card
              theme={theme}
              title={tx(locale, "Case summary", "Case summary")}
            >
              <DL
                theme={theme}
                cols={3}
                items={[
                  {
                    k: "CASE",
                    v: <DetailValue mono>{complaint.caseNo}</DetailValue>,
                  },
                  {
                    k: "OPENED",
                    v: (
                      <DetailValue mono>
                        {formatDateTime(locale, complaint.createdAt)}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "SOURCE",
                    v: <DetailValue mono>{complaint.caseSource}</DetailValue>,
                  },
                  {
                    k: "CATEGORY",
                    v: (
                      <DetailValue mono>
                        {formatOpsCodeLabel(locale, complaint.category)}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "SEVERITY",
                    v: (
                      <DetailValue mono>
                        {formatOpsCodeLabel(locale, complaint.severity)}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "ASSIGNEE",
                    v: (
                      <DetailValue mono>
                        {complaint.assigneeId ??
                          tx(locale, "Unassigned", "未指派")}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "SLA STATUS",
                    v: (
                      <DetailValue mono>
                        {formatOpsCodeLabel(locale, slaStatus)}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "SLA DUE AT",
                    v: (
                      <DetailValue
                        mono
                      >{`${formatDateTime(locale, complaint.slaDueAt)} · ${formatRelativeSla(locale, complaint.slaDueAt)}`}</DetailValue>
                    ),
                  },
                  {
                    k: "SLA BREACHED AT",
                    v: (
                      <DetailValue mono>
                        {formatDateTime(
                          locale,
                          complaint.slaBreach ? complaint.updatedAt : null,
                        )}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "REOPENS",
                    v: (
                      <DetailValue mono>
                        {String(complaint.reopenCount)}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "RELATED ORDER",
                    v: complaint.relatedOrderId ? (
                      <Link
                        href={`/dispatch?orderId=${encodeURIComponent(complaint.relatedOrderId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {complaint.relatedOrderId} →
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    k: "RELATED CALL",
                    v: complaint.relatedCallId ? (
                      <Link
                        href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {complaint.relatedCallId} →
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </Card>

            <Card
              theme={theme}
              title={tx(
                locale,
                "Timeline · cross-actor",
                "Timeline · cross-actor",
              )}
            >
              <CanvasTimeline
                items={timelineItems}
                density="compact"
                emptyState={
                  <div style={{ color: theme.textDim, fontSize: 12.5 }}>
                    {tx(locale, "No timeline entries.", "尚無時間軸紀錄。")}
                  </div>
                }
              />
            </Card>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Card
              theme={theme}
              title={tx(
                locale,
                "Recording · PII masked",
                "Recording · PII masked",
              )}
            >
              {complaint.relatedCallId ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 10,
                    background: theme.bgRaised,
                    borderRadius: 7,
                    color: theme.text,
                  }}
                >
                  <span
                    style={{
                      fontFamily: theme.monoFamily,
                      fontSize: 11.5,
                      flex: 1,
                    }}
                  >
                    rec_{complaint.relatedCallId.slice(-6)}.m4a · PII masked
                  </span>
                  <Link
                    href={`/callcenter?callId=${encodeURIComponent(complaint.relatedCallId)}`}
                    style={{
                      color: theme.accent,
                      textDecoration: "none",
                      fontSize: 12,
                    }}
                  >
                    {tx(locale, "Open call", "前往通話")} →
                  </Link>
                </div>
              ) : (
                <Banner
                  theme={theme}
                  tone="info"
                  icon="phone"
                  title={tx(locale, "No linked recording", "沒有關聯錄音")}
                  body={tx(
                    locale,
                    "This case was not created from a hotline session.",
                    "這筆案件不是由熱線通話建立。",
                  )}
                />
              )}
            </Card>

            <Card
              theme={theme}
              title={tx(locale, "Linked entities", "Linked entities")}
            >
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: "RELATED ORDER",
                    v: complaint.relatedOrderId ? (
                      <DetailValue mono>{complaint.relatedOrderId}</DetailValue>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    k: "RELATED CALL SESSION",
                    v: complaint.relatedCallId ? (
                      <DetailValue mono>{complaint.relatedCallId}</DetailValue>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    k: "RELATED INCIDENT",
                    v: complaint.relatedIncidentId ? (
                      <Link
                        href={`/incidents/${encodeURIComponent(complaint.relatedIncidentId)}`}
                        style={{ color: theme.accent, textDecoration: "none" }}
                      >
                        {complaint.relatedIncidentId} →
                      </Link>
                    ) : (
                      tx(locale, "— (not escalated)", "—（未升級）")
                    ),
                  },
                  {
                    k: "STATUS",
                    v: (
                      <DetailValue mono>
                        {formatOpsCodeLabel(locale, complaint.status)}
                      </DetailValue>
                    ),
                  },
                  {
                    k: "ASSIGNEE",
                    v: (
                      <DetailValue mono>
                        {complaint.assigneeId ??
                          tx(locale, "Unassigned", "未指派")}
                      </DetailValue>
                    ),
                  },
                ]}
              />
            </Card>

            <Card
              theme={theme}
              title={tx(locale, "Recovery notes", "Recovery notes")}
            >
              <Banner
                theme={theme}
                tone={exportView?.readyForAudit ? "success" : "warn"}
                icon={exportView?.readyForAudit ? "ok" : "warn"}
                title={
                  exportView?.readyForAudit
                    ? tx(locale, "Audit packet ready", "可生成審計封包")
                    : tx(
                        locale,
                        "Recovery plan still required",
                        "待補 recovery 規劃",
                      )
                }
                body={
                  exportView?.readyForAudit
                    ? tx(
                        locale,
                        `Export generated ${formatDateTime(locale, exportView.exportGeneratedAt)}`,
                        `匯出生成於 ${formatDateTime(locale, exportView.exportGeneratedAt)}`,
                      )
                    : tx(
                        locale,
                        "No formal recovery action is captured yet. Add note / resolve evidence before audit closeout.",
                        "目前尚未有正式 recovery action，請先補 note / resolve 證據再進入稽核結案。",
                      )
                }
              />
            </Card>
          </div>
        </div>

        <Link
          href="/complaints"
          style={{
            color: theme.accent,
            textDecoration: "none",
            fontSize: 12.5,
          }}
        >
          ← {tx(locale, "Back to complaints", "返回客訴列表")}
        </Link>
      </div>

      {modal ? (
        <ConfirmModal
          modal={modal}
          locale={locale}
          busy={busyKey === `${modal.action}-${complaint.caseNo}`}
          validResolutionCodes={validResolutionCodes}
          assigneeId={assigneeId}
          setAssigneeId={setAssigneeId}
          assignmentNote={assignmentNote}
          setAssignmentNote={setAssignmentNote}
          noteText={noteText}
          setNoteText={setNoteText}
          resolutionCode={resolutionCode}
          setResolutionCode={setResolutionCode}
          closingNote={closingNote}
          setClosingNote={setClosingNote}
          escalateTitle={escalateTitle}
          setEscalateTitle={setEscalateTitle}
          escalateReason={escalateReason}
          setEscalateReason={setEscalateReason}
          onCancel={() => setModal(null)}
          onConfirm={() => void submitModal()}
        />
      ) : null}
    </>
  );
}

function ConfirmModal({
  modal,
  locale,
  busy,
  validResolutionCodes,
  assigneeId,
  setAssigneeId,
  assignmentNote,
  setAssignmentNote,
  noteText,
  setNoteText,
  resolutionCode,
  setResolutionCode,
  closingNote,
  setClosingNote,
  escalateTitle,
  setEscalateTitle,
  escalateReason,
  setEscalateReason,
  onCancel,
  onConfirm,
}: {
  modal: NonNullable<ModalState>;
  locale: Locale;
  busy: boolean;
  validResolutionCodes: readonly ComplaintResolutionCode[];
  assigneeId: string;
  setAssigneeId: (value: string) => void;
  assignmentNote: string;
  setAssignmentNote: (value: string) => void;
  noteText: string;
  setNoteText: (value: string) => void;
  resolutionCode: ComplaintResolutionCode;
  setResolutionCode: (value: ComplaintResolutionCode) => void;
  closingNote: string;
  setClosingNote: (value: string) => void;
  escalateTitle: string;
  setEscalateTitle: (value: string) => void;
  escalateReason: string;
  setEscalateReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isEscalate = modal.action === "escalate_to_incident";
  const confirmDisabled =
    busy ||
    (modal.action === "assign" && assigneeId.trim() === "") ||
    (isEscalate &&
      (escalateTitle.trim() === "" || escalateReason.trim() === ""));

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{ width: "100%", maxWidth: 480 }}
      >
        <Card
          theme={theme}
          title={
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {actionLabel(locale, modal.action)}
              <Pill
                theme={theme}
                tone={
                  modal.descriptor.riskLevel === "high"
                    ? "danger"
                    : modal.descriptor.riskLevel === "medium"
                      ? "warn"
                      : "neutral"
                }
              >
                {formatOpsCodeLabel(locale, modal.descriptor.riskLevel)}
              </Pill>
            </span>
          }
        >
          {modal.descriptor.requiresReason ? (
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title={tx(locale, "Reason required", "必須填寫原因")}
              body={tx(
                locale,
                "This action writes immutable escalation context to the complaint timeline.",
                "這個動作會把不可變更的升級原因寫入客訴時間軸。",
              )}
            />
          ) : null}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 12,
            }}
          >
            {modal.action === "add_note" ? (
              <ModalField label={tx(locale, "Case note", "案件備註")}>
                <textarea
                  style={textareaStyle}
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                />
              </ModalField>
            ) : null}

            {modal.action === "assign" ? (
              <>
                <ModalField
                  label={tx(locale, "Assignee ID", "負責人 ID")}
                  required
                >
                  <input
                    style={controlStyle}
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                  />
                </ModalField>
                <ModalField label={tx(locale, "Assignment note", "指派備註")}>
                  <textarea
                    style={textareaStyle}
                    value={assignmentNote}
                    onChange={(event) => setAssignmentNote(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}

            {modal.action === "resolve" ? (
              <>
                <ModalField label={tx(locale, "Resolution code", "處理代碼")}>
                  <select
                    style={controlStyle}
                    value={resolutionCode}
                    onChange={(event) =>
                      setResolutionCode(
                        event.target.value as ComplaintResolutionCode,
                      )
                    }
                  >
                    {validResolutionCodes.map((code) => (
                      <option key={code} value={code}>
                        {formatOpsCodeLabel(locale, code)}
                      </option>
                    ))}
                  </select>
                </ModalField>
                <ModalField label={tx(locale, "Closing note", "結案備註")}>
                  <textarea
                    style={textareaStyle}
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}

            {modal.action === "escalate_to_incident" ? (
              <>
                <ModalField
                  label={tx(locale, "Incident title", "事故標題")}
                  required
                >
                  <input
                    style={controlStyle}
                    value={escalateTitle}
                    onChange={(event) => setEscalateTitle(event.target.value)}
                  />
                </ModalField>
                <ModalField
                  label={tx(locale, "Escalation reason", "升級原因")}
                  required
                >
                  <textarea
                    style={textareaStyle}
                    value={escalateReason}
                    onChange={(event) => setEscalateReason(event.target.value)}
                  />
                </ModalField>
              </>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 16,
            }}
          >
            <Btn theme={theme} icon="x" onClick={onCancel}>
              {tx(locale, "Cancel", "取消")}
            </Btn>
            <Btn
              theme={theme}
              variant="primary"
              icon={actionIcon(modal.action)}
              danger={modal.descriptor.riskLevel === "high"}
              disabled={confirmDisabled}
              onClick={onConfirm}
            >
              {busy
                ? tx(locale, "Saving...", "儲存中...")
                : actionLabel(locale, modal.action)}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
