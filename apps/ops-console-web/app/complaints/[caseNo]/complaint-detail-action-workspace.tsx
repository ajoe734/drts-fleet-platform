"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useTransition,
} from "react";
import type {
  AuditLogRecord,
  ComplaintCaseRecord,
  ComplaintResolutionCode,
  EscalateComplaintToIncidentCommand,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { COMPLAINT_CATEGORY_VALID_RESOLUTIONS } from "@drts/contracts";
import {
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import type { Locale } from "@/lib/translations";

type ComplaintDetailActionWorkspaceProps = {
  locale: Locale;
  complaint: ComplaintCaseRecord;
  availableActions: ResourceActionDescriptor[];
  auditBaseUrl: string;
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

type ReceiptState = {
  actionLabel: string;
  auditId: string | null;
  requestId: string | null;
  incidentId?: string | null;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const SECTION_BY_ACTION: Record<ActionId, string> = {
  add_note: "action-add-note",
  assign: "action-assign",
  resolve: "action-resolve",
  close: "action-resolve",
  reopen: "action-reopen",
  escalate_to_incident: "action-escalate",
  export: "action-export",
  manual_sla_waiver: "action-manual-sla-waiver",
};

function copyText(locale: Locale, en: string, zh: string) {
  return locale === "en" ? en : zh;
}

function buttonStyle(
  variant: "primary" | "secondary" | "danger" | "ghost" = "secondary",
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
    danger: {
      background: theme.dangerBg,
      borderColor: theme.dangerBorder,
      color: theme.danger,
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
    minHeight: "34px",
    padding: "8px 12px",
    borderRadius: "9px",
    border: `1px solid ${styles[variant].borderColor}`,
    background: disabled ? theme.surfaceLo : styles[variant].background,
    color: disabled ? theme.textMuted : styles[variant].color,
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1.2,
    textDecoration: "none",
    opacity: disabled ? 0.72 : 1,
  } as const;
}

function inputStyle() {
  return {
    width: "100%",
    minHeight: "38px",
    padding: "10px 11px",
    borderRadius: "9px",
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    fontSize: "13px",
    outline: "none",
  } as const;
}

function textareaStyle(rows = 3) {
  return {
    ...inputStyle(),
    minHeight: `${rows * 24 + 18}px`,
    resize: "vertical" as const,
  };
}

function resolveDescriptor(
  actions: ResourceActionDescriptor[],
  actionId: ActionId,
) {
  return actions.find((action) => action.action === actionId);
}

function getDisabledReasonLabel(locale: Locale, code?: string) {
  switch (code) {
    case "case_read_only":
      return copyText(locale, "Case is read-only after resolution.", "案件已進入唯讀狀態。");
    case "requires_resolution":
      return copyText(locale, "Resolve the case before closing.", "請先完成處理再關閉案件。");
    case "already_linked_incident":
      return copyText(locale, "This case is already linked to an incident.", "案件已連結事故。");
    case "artifact_not_ready":
      return copyText(locale, "Export artifact becomes available after closeout.", "完成結案後才會產出匯出憑證。");
    case "restricted_role":
      return copyText(locale, "Restricted to the SLA-waiver role.", "僅限具 SLA waiver 權限的角色。");
    case "closed_case_only":
      return copyText(locale, "Only closed cases may be reopened.", "只有已關閉案件可以重開。");
    default:
      return copyText(locale, "Unavailable in the current case state.", "目前案件狀態不可執行。");
  }
}

function getRiskTone(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  if (riskLevel === "high") {
    return "danger" as const;
  }
  if (riskLevel === "medium") {
    return "warn" as const;
  }
  return "info" as const;
}

function buildAuditHref(auditBaseUrl: string, auditId: string) {
  return `${auditBaseUrl.replace(/\/$/, "")}/audit?auditId=${encodeURIComponent(auditId)}`;
}

export function ComplaintDetailActionWorkspace({
  locale,
  complaint,
  availableActions,
  auditBaseUrl,
}: ComplaintDetailActionWorkspaceProps) {
  const router = useRouter();
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<ActionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [assigneeId, setAssigneeId] = useState(
    complaint.assigneeId ?? "AGENT-OPS-002",
  );
  const [assignmentNote, setAssignmentNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const resolutionOptions = useMemo(
    () => COMPLAINT_CATEGORY_VALID_RESOLUTIONS[complaint.category] ?? [],
    [complaint.category],
  );
  const [resolutionCode, setResolutionCode] = useState<ComplaintResolutionCode>(
    complaint.resolutionCode ?? resolutionOptions[0] ?? "resolved_other",
  );
  const [closingNote, setClosingNote] = useState(complaint.closingNote ?? "");
  const [reopenReason, setReopenReason] = useState("");
  const [escalateTitle, setEscalateTitle] = useState(
    `${complaint.caseNo} · ${formatOpsCodeLabel(locale, complaint.category)}`,
  );
  const [escalateSeverity, setEscalateSeverity] =
    useState<EscalateComplaintToIncidentCommand["severity"]>(
      complaint.severity === "high" ? "high" : "medium",
    );
  const [escalateReason, setEscalateReason] = useState("");

  const refreshWorkspace = useEffectEvent(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      refreshWorkspace();
    }, 15_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshWorkspace]);

  useEffect(() => {
    setResolutionCode(
      complaint.resolutionCode ?? resolutionOptions[0] ?? "resolved_other",
    );
    setClosingNote(complaint.closingNote ?? "");
    setAssigneeId(complaint.assigneeId ?? "AGENT-OPS-002");
  }, [
    complaint.assigneeId,
    complaint.closingNote,
    complaint.resolutionCode,
    resolutionOptions,
  ]);

  async function fetchLatestAuditEntry() {
    const audits = await getOpsClient().listAuditLogs();
    return (
      [...audits]
        .filter(
          (entry) =>
            entry.resourceType === "complaint_case" &&
            entry.resourceId === complaint.caseNo,
        )
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        )[0] ?? null
    );
  }

  async function runAction<T>(
    actionId: ActionId,
    actionLabel: string,
    action: () => Promise<T>,
    options?: {
      afterSuccess?: (result: T) => void;
    },
  ) {
    setBusyAction(actionId);
    setError(null);
    try {
      const result = await action();
      const audit = await fetchLatestAuditEntry().catch(() => null);
      setReceipt({
        actionLabel,
        auditId: audit?.auditId ?? null,
        requestId: audit?.requestId ?? null,
        incidentId:
          typeof result === "object" &&
          result !== null &&
          "incident" in result &&
          typeof result.incident === "object" &&
          result.incident !== null &&
          "incidentId" in result.incident
            ? String(result.incident.incidentId)
            : null,
      });
      options?.afterSuccess?.(result);
      refreshWorkspace();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : copyText(locale, "Unexpected action failure.", "動作執行失敗。"),
      );
    } finally {
      setBusyAction(null);
    }
  }

  const addNoteAction = resolveDescriptor(availableActions, "add_note");
  const assignAction = resolveDescriptor(availableActions, "assign");
  const resolveAction = resolveDescriptor(availableActions, "resolve");
  const closeAction = resolveDescriptor(availableActions, "close");
  const reopenAction = resolveDescriptor(availableActions, "reopen");
  const escalateAction = resolveDescriptor(
    availableActions,
    "escalate_to_incident",
  );
  const exportAction = resolveDescriptor(availableActions, "export");
  const manualSlaWaiverAction = resolveDescriptor(
    availableActions,
    "manual_sla_waiver",
  );

  const enabledActions = availableActions.filter((action) => action.enabled);
  const disabledActions = availableActions.filter((action) => !action.enabled);
  const exportHref = `/complaints/${encodeURIComponent(complaint.caseNo)}/artifact`;

  return (
    <Card
      theme={theme}
      title={copyText(locale, "Action workspace", "處理動作")}
      subtitle={copyText(
        locale,
        "Available CTAs are contract-driven and refresh every 15s.",
        "CTA 依 availableActions 顯示，並以 15 秒 cadence 自動刷新。",
      )}
    >
      <div style={{ display: "grid", gap: "14px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Pill theme={theme} tone="info" dot>
              T3 · 15s
            </Pill>
            <Pill theme={theme} tone={enabledActions.length > 0 ? "info" : "warn"}>
              {copyText(
                locale,
                `${enabledActions.length} active CTA(s)`,
                `${enabledActions.length} 個可執行 CTA`,
              )}
            </Pill>
          </div>
          <button
            type="button"
            onClick={() => refreshWorkspace()}
            style={buttonStyle("ghost", isRefreshing)}
            disabled={isRefreshing}
          >
            <CanvasIcon name="clock" size={12} />
            <span>
              {isRefreshing
                ? copyText(locale, "Refreshing…", "刷新中…")
                : copyText(locale, "Refresh now", "立即刷新")}
            </span>
          </button>
        </div>

        {receipt ? (
          <div
            style={{
              display: "grid",
              gap: "8px",
              padding: "12px",
              borderRadius: "12px",
              border: `1px solid ${theme.successBorder}`,
              background: theme.successBg,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ color: theme.text }}>
                {copyText(locale, "Action receipt", "動作回條")} ·{" "}
                {receipt.actionLabel}
              </strong>
              {receipt.auditId ? (
                <a
                  href={buildAuditHref(auditBaseUrl, receipt.auditId)}
                  target="_blank"
                  rel="noreferrer"
                  style={buttonStyle("secondary")}
                >
                  <CanvasIcon name="audit" size={12} />
                  <span>{copyText(locale, "View audit", "查看稽核")}</span>
                </a>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                color: theme.textMuted,
                fontSize: "12px",
              }}
            >
              {receipt.requestId ? (
                <span style={{ fontFamily: theme.monoFamily }}>
                  {receipt.requestId}
                </span>
              ) : null}
              {receipt.incidentId ? (
                <Link
                  href={`/incidents/${encodeURIComponent(receipt.incidentId)}`}
                  style={buttonStyle("ghost")}
                >
                  <CanvasIcon name="ext" size={12} />
                  <span>
                    {copyText(locale, "Open incident", "前往事故")}{" "}
                    {receipt.incidentId}
                  </span>
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: `1px solid ${theme.dangerBorder}`,
              background: theme.dangerBg,
              color: theme.danger,
              fontSize: "12.5px",
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        ) : null}

        {enabledActions.length === 0 ? (
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
              color: theme.textMuted,
              fontSize: "12.5px",
            }}
          >
            {copyText(
              locale,
              "No writable action is currently available. This complaint stays in read-only mode with audit visibility.",
              "目前沒有可寫入動作。此案件維持唯讀，只保留稽核可視性。",
            )}
          </div>
        ) : null}

        {addNoteAction ? (
          <section
            id={SECTION_BY_ACTION.add_note}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>{copyText(locale, "Add note", "新增備註")}</strong>
              <Pill theme={theme} tone={getRiskTone(addNoteAction.riskLevel)}>
                {addNoteAction.riskLevel}
              </Pill>
            </div>
            {addNoteAction.enabled ? (
              <form
                style={{ display: "grid", gap: "10px" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction("add_note", copyText(locale, "Add note", "新增備註"), async () => {
                    const result = await getOpsClient().addComplaintNote(
                      complaint.caseNo,
                      { note: noteText.trim() },
                    );
                    setNoteText("");
                    return result;
                  });
                }}
              >
                <Field
                  theme={theme}
                  label={copyText(locale, "Investigation note", "調查備註")}
                >
                  <textarea
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    rows={3}
                    required
                    style={textareaStyle(3)}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busyAction === "add_note"}
                  style={buttonStyle("secondary", busyAction === "add_note")}
                >
                  {busyAction === "add_note"
                    ? copyText(locale, "Saving…", "儲存中…")
                    : copyText(locale, "Post note", "送出備註")}
                </button>
              </form>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {getDisabledReasonLabel(locale, addNoteAction.disabledReasonCode)}
              </span>
            )}
          </section>
        ) : null}

        {assignAction ? (
          <section
            id={SECTION_BY_ACTION.assign}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>
                {complaint.assigneeId
                  ? copyText(locale, "Reassign", "重新指派")
                  : copyText(locale, "Assign", "指派")}
              </strong>
              <Pill theme={theme} tone={getRiskTone(assignAction.riskLevel)}>
                {assignAction.riskLevel}
              </Pill>
            </div>
            {assignAction.enabled ? (
              <form
                style={{ display: "grid", gap: "10px" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    "assign",
                    complaint.assigneeId
                      ? copyText(locale, "Reassign", "重新指派")
                      : copyText(locale, "Assign", "指派"),
                    async () =>
                      getOpsClient().assignComplaint(complaint.caseNo, {
                        assigneeId: assigneeId.trim(),
                        note: assignmentNote.trim() || null,
                      }),
                    {
                      afterSuccess: () => {
                        setAssignmentNote("");
                      },
                    },
                  );
                }}
              >
                <Field
                  theme={theme}
                  label={copyText(locale, "Assignee", "負責人")}
                >
                  <input
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                    required
                    style={inputStyle()}
                  />
                </Field>
                <Field
                  theme={theme}
                  label={copyText(locale, "Handoff note", "交接備註")}
                >
                  <textarea
                    value={assignmentNote}
                    onChange={(event) => setAssignmentNote(event.target.value)}
                    rows={2}
                    style={textareaStyle(2)}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busyAction === "assign"}
                  style={buttonStyle("secondary", busyAction === "assign")}
                >
                  {busyAction === "assign"
                    ? copyText(locale, "Saving…", "儲存中…")
                    : complaint.assigneeId
                      ? copyText(locale, "Confirm reassignment", "確認改派")
                      : copyText(locale, "Confirm assignment", "確認指派")}
                </button>
              </form>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {getDisabledReasonLabel(locale, assignAction.disabledReasonCode)}
              </span>
            )}
          </section>
        ) : null}

        {(resolveAction || closeAction) ? (
          <section
            id={SECTION_BY_ACTION.resolve}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>{copyText(locale, "Resolve / close", "處理 / 關閉")}</strong>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {resolveAction ? (
                  <Pill
                    theme={theme}
                    tone={getRiskTone(resolveAction.riskLevel)}
                  >
                    resolve · {resolveAction.riskLevel}
                  </Pill>
                ) : null}
                {closeAction ? (
                  <Pill theme={theme} tone={getRiskTone(closeAction.riskLevel)}>
                    close · {closeAction.riskLevel}
                  </Pill>
                ) : null}
              </div>
            </div>
            {resolveAction?.enabled || closeAction?.enabled ? (
              <form style={{ display: "grid", gap: "10px" }}>
                <Field
                  theme={theme}
                  label={copyText(locale, "Resolution code", "處理結果碼")}
                >
                  <select
                    value={resolutionCode}
                    onChange={(event) =>
                      setResolutionCode(
                        event.target.value as ComplaintResolutionCode,
                      )
                    }
                    style={inputStyle()}
                  >
                    {resolutionOptions.map((code) => (
                      <option key={code} value={code}>
                        {formatOpsCodeLabel(locale, code)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  theme={theme}
                  label={copyText(locale, "Recovery / closing note", "恢復 / 關閉備註")}
                >
                  <textarea
                    value={closingNote}
                    onChange={(event) => setClosingNote(event.target.value)}
                    rows={3}
                    required
                    style={textareaStyle(3)}
                  />
                </Field>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {resolveAction?.enabled ? (
                    <button
                      type="button"
                      disabled={busyAction === "resolve"}
                      onClick={() => {
                        void runAction(
                          "resolve",
                          copyText(locale, "Resolve", "標記已處理"),
                          async () =>
                            getOpsClient().resolveComplaint(complaint.caseNo, {
                              resolutionCode,
                              closingNote: closingNote.trim(),
                            }),
                        );
                      }}
                      style={buttonStyle("secondary", busyAction === "resolve")}
                    >
                      {busyAction === "resolve"
                        ? copyText(locale, "Saving…", "儲存中…")
                        : copyText(locale, "Resolve case", "標記已處理")}
                    </button>
                  ) : null}
                  {closeAction?.enabled ? (
                    <button
                      type="button"
                      disabled={busyAction === "close"}
                      onClick={() => {
                        void runAction(
                          "close",
                          copyText(locale, "Close", "正式關閉"),
                          async () =>
                            getOpsClient().closeComplaint(complaint.caseNo, {
                              resolutionCode,
                              closingNote: closingNote.trim(),
                            }),
                        );
                      }}
                      style={buttonStyle("primary", busyAction === "close")}
                    >
                      {busyAction === "close"
                        ? copyText(locale, "Closing…", "關閉中…")
                        : copyText(locale, "Close case", "正式關閉")}
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {getDisabledReasonLabel(
                  locale,
                  closeAction?.disabledReasonCode ??
                    resolveAction?.disabledReasonCode,
                )}
              </span>
            )}
          </section>
        ) : null}

        {reopenAction ? (
          <section
            id={SECTION_BY_ACTION.reopen}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>{copyText(locale, "Reopen", "重開案件")}</strong>
              <Pill theme={theme} tone={getRiskTone(reopenAction.riskLevel)}>
                {reopenAction.riskLevel}
              </Pill>
            </div>
            {reopenAction.enabled ? (
              <form
                style={{ display: "grid", gap: "10px" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    "reopen",
                    copyText(locale, "Reopen", "重開案件"),
                    async () =>
                      getOpsClient().reopenComplaint(complaint.caseNo, {
                        reason: reopenReason.trim(),
                      }),
                    {
                      afterSuccess: () => {
                        setReopenReason("");
                      },
                    },
                  );
                }}
              >
                <Field
                  theme={theme}
                  label={copyText(locale, "Required reason", "必填原因")}
                >
                  <textarea
                    value={reopenReason}
                    onChange={(event) => setReopenReason(event.target.value)}
                    rows={3}
                    required
                    style={textareaStyle(3)}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busyAction === "reopen"}
                  style={buttonStyle("danger", busyAction === "reopen")}
                >
                  {busyAction === "reopen"
                    ? copyText(locale, "Reopening…", "重開中…")
                    : copyText(locale, "Confirm reopen", "確認重開")}
                </button>
              </form>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {getDisabledReasonLabel(locale, reopenAction.disabledReasonCode)}
              </span>
            )}
          </section>
        ) : null}

        {escalateAction ? (
          <section
            id={SECTION_BY_ACTION.escalate_to_incident}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>
                {copyText(locale, "Escalate to incident", "升級為事故")}
              </strong>
              <Pill theme={theme} tone={getRiskTone(escalateAction.riskLevel)}>
                {escalateAction.riskLevel}
              </Pill>
            </div>
            {escalateAction.enabled ? (
              <form
                style={{ display: "grid", gap: "10px" }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction(
                    "escalate_to_incident",
                    copyText(locale, "Escalate", "升級為事故"),
                    async () =>
                      getOpsClient().escalateComplaintToIncident(
                        complaint.caseNo,
                        {
                          title: escalateTitle.trim(),
                          severity: escalateSeverity,
                          reason: escalateReason.trim(),
                        },
                      ),
                    {
                      afterSuccess: () => {
                        setEscalateReason("");
                      },
                    },
                  );
                }}
              >
                <Field
                  theme={theme}
                  label={copyText(locale, "Incident title", "事故標題")}
                >
                  <input
                    value={escalateTitle}
                    onChange={(event) => setEscalateTitle(event.target.value)}
                    required
                    style={inputStyle()}
                  />
                </Field>
                <Field
                  theme={theme}
                  label={copyText(locale, "Severity", "嚴重程度")}
                >
                  <select
                    value={escalateSeverity}
                    onChange={(event) =>
                      setEscalateSeverity(
                        event.target
                          .value as EscalateComplaintToIncidentCommand["severity"],
                      )
                    }
                    style={inputStyle()}
                  >
                    {(["low", "medium", "high", "critical"] as const).map(
                      (severity) => (
                        <option key={severity} value={severity}>
                          {formatOpsCodeLabel(locale, severity)}
                        </option>
                      ),
                    )}
                  </select>
                </Field>
                <Field
                  theme={theme}
                  label={copyText(locale, "Required escalation reason", "必填升級原因")}
                >
                  <textarea
                    value={escalateReason}
                    onChange={(event) => setEscalateReason(event.target.value)}
                    rows={3}
                    required
                    style={textareaStyle(3)}
                  />
                </Field>
                <button
                  type="submit"
                  disabled={busyAction === "escalate_to_incident"}
                  style={buttonStyle(
                    "danger",
                    busyAction === "escalate_to_incident",
                  )}
                >
                  {busyAction === "escalate_to_incident"
                    ? copyText(locale, "Escalating…", "升級中…")
                    : copyText(locale, "Create incident handoff", "建立事故交接")}
                </button>
              </form>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {getDisabledReasonLabel(
                  locale,
                  escalateAction.disabledReasonCode,
                )}
              </span>
            )}
          </section>
        ) : null}

        {exportAction ? (
          <section
            id={SECTION_BY_ACTION.export}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px solid ${theme.border}`,
              background: theme.surfaceLo,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>{copyText(locale, "Export artifact", "匯出憑證")}</strong>
              <Pill theme={theme} tone={getRiskTone(exportAction.riskLevel)}>
                {exportAction.riskLevel}
              </Pill>
            </div>
            {exportAction.enabled ? (
              <a
                href={exportHref}
                target="_blank"
                rel="noreferrer"
                style={buttonStyle("secondary")}
              >
                <CanvasIcon name="ext" size={12} />
                <span>
                  {copyText(
                    locale,
                    "Open signed-style artifact",
                    "開啟 signed-style 匯出憑證",
                  )}
                </span>
              </a>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                {getDisabledReasonLabel(locale, exportAction.disabledReasonCode)}
              </span>
            )}
          </section>
        ) : null}

        {manualSlaWaiverAction ? (
          <section
            id={SECTION_BY_ACTION.manual_sla_waiver}
            style={{
              display: "grid",
              gap: "10px",
              padding: "14px",
              borderRadius: "14px",
              border: `1px dashed ${theme.warnBorder}`,
              background: theme.warnBg,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "8px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <strong>
                {copyText(locale, "Manual SLA waiver", "人工 SLA waiver")}
              </strong>
              <Pill
                theme={theme}
                tone={getRiskTone(manualSlaWaiverAction.riskLevel)}
              >
                {manualSlaWaiverAction.riskLevel}
              </Pill>
            </div>
            <span style={{ color: theme.text, fontSize: "12px", lineHeight: 1.55 }}>
              {getDisabledReasonLabel(
                locale,
                manualSlaWaiverAction.disabledReasonCode,
              )}
            </span>
          </section>
        ) : null}

        {disabledActions.length > 0 ? (
          <div style={{ display: "grid", gap: "8px" }}>
            <strong style={{ fontSize: "12px", color: theme.text }}>
              {copyText(locale, "Disabled affordances", "停用中的動作")}
            </strong>
            <div style={{ display: "grid", gap: "8px" }}>
              {disabledActions.map((action) => (
                <div
                  key={action.action}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    flexWrap: "wrap",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: `1px solid ${theme.border}`,
                    background: theme.surface,
                  }}
                >
                  <div style={{ display: "grid", gap: "4px" }}>
                    <span style={{ color: theme.text, fontWeight: 600 }}>
                      {formatOpsCodeLabel(locale, action.action)}
                    </span>
                    <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                      {getDisabledReasonLabel(locale, action.disabledReasonCode)}
                    </span>
                  </div>
                  <a href={`#${SECTION_BY_ACTION[action.action as ActionId]}`}>
                    <span style={buttonStyle("ghost")}>
                      {copyText(locale, "Inspect", "查看")}
                    </span>
                  </a>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export default ComplaintDetailActionWorkspace;
