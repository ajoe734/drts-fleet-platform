"use client";

import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  IncidentEscalationTarget,
  IncidentSeverity,
  IncidentStatus,
  RecordServiceRecoveryActionCommand,
  ResourceActionDescriptor,
  UpdateIncidentCommand,
} from "@drts/contracts";
import {
  INCIDENT_ESCALATION_TARGETS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const SERVICE_RECOVERY_TYPES: RecordServiceRecoveryActionCommand["actionType"][] =
  [
    "passenger_recontact",
    "fare_adjustment",
    "redispatch_ordered",
    "voucher_issued",
    "apology_sent",
    "driver_reassigned",
    "other",
  ];

type IncidentDetailActionPanelProps = {
  incidentId: string;
  locale: Locale;
  availableActions: ResourceActionDescriptor[];
  initialIntent: string | null;
  initialStatus: IncidentStatus;
  initialSeverity: IncidentSeverity;
  initialAssignedTo: string | null;
  initialEscalationTarget: IncidentEscalationTarget | null;
  initialResolutionNote: string | null;
  latestAuditHref: string | null;
};

type ReceiptState = {
  actionId: string | null;
  auditId: string | null;
  title: string;
  body: string;
  auditHref: string | null;
};

function normalizeIntent(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.trim().toLowerCase();
}

function actionIntent(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("update")) return "update";
  if (normalized.includes("resolve")) return "resolve";
  if (normalized.includes("close")) return "close";
  if (normalized.includes("recovery")) return "service_recovery";
  if (normalized.includes("ack")) return "acknowledge";
  if (normalized.includes("police")) return "notify_police";
  if (normalized.includes("lift")) return "lift_suppression";
  return normalized;
}

function actionCopy(action: string, locale: Locale) {
  const normalized = action.toLowerCase();
  if (normalized.includes("update")) {
    return locale === "en" ? "Update incident" : "更新事故";
  }
  if (normalized.includes("resolve")) {
    return locale === "en" ? "Resolve incident" : "標記事故已處理";
  }
  if (normalized.includes("close")) {
    return locale === "en" ? "Close incident" : "關閉事故";
  }
  if (normalized.includes("recovery")) {
    return locale === "en" ? "Add recovery action" : "新增補救行動";
  }
  if (normalized.includes("ack")) {
    return locale === "en" ? "Acknowledge escalation" : "確認升級";
  }
  if (normalized.includes("police")) {
    return locale === "en" ? "Notify police" : "通知警方";
  }
  if (normalized.includes("lift")) {
    return locale === "en" ? "Lift suppression" : "解除抑制";
  }
  return formatOpsCodeLabel(locale, action);
}

function actionSummary(intent: string, locale: Locale) {
  switch (intent) {
    case "update":
      return locale === "en"
        ? "Adjust severity, owner, escalation target, status, and resolution note."
        : "調整嚴重程度、負責人、升級對象、狀態與結案備註。";
    case "resolve":
      return locale === "en"
        ? "Mark the incident resolved after recovery is complete."
        : "在補救完成後將事故標記為已處理。";
    case "close":
      return locale === "en"
        ? "Close the incident and record the required closeout reason."
        : "關閉事故並記錄必填的結案原因。";
    case "service_recovery":
      return locale === "en"
        ? "Record a passenger or operational recovery action into the timeline."
        : "將乘客或營運補救行動記錄進時間線。";
    case "acknowledge":
      return locale === "en"
        ? "Record that the escalation target accepted the handoff."
        : "記錄升級對象已接受此次 handoff。";
    case "notify_police":
      return locale === "en"
        ? "Escalate this incident to law enforcement and capture the reason in the incident workspace."
        : "將事故升級給警方處理，並在 incident 工作區留下原因。";
    default:
      return locale === "en"
        ? "This action stays in the incident workspace."
        : "此動作會停留在 incident 工作區內完成。";
  }
}

function actionTone(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  if (riskLevel === "high") {
    return "danger";
  }
  if (riskLevel === "medium") {
    return "warn";
  }
  return "info";
}

function actionVariant(riskLevel: ResourceActionDescriptor["riskLevel"]) {
  if (riskLevel === "high") {
    return { variant: "secondary" as const, danger: true };
  }
  if (riskLevel === "medium") {
    return { variant: "primary" as const, danger: false };
  }
  return { variant: "secondary" as const, danger: false };
}

function actionDetail(action: ResourceActionDescriptor, locale: Locale) {
  const details = [];
  if (!action.enabled && action.disabledReasonCode) {
    details.push(formatOpsCodeLabel(locale, action.disabledReasonCode));
  }
  if (action.requiresReason) {
    details.push(locale === "en" ? "Reason required" : "必填原因");
  }
  return details.join(" · ");
}

function CanvasActionButton({
  action,
  locale,
  icon,
  children,
  disabled,
  onClick,
}: {
  action: ResourceActionDescriptor;
  locale: Locale;
  icon?: Parameters<typeof CanvasIcon>[0]["name"];
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const { variant, danger } = actionVariant(action.riskLevel);

  return (
    <Btn
      theme={theme}
      size="sm"
      variant={variant}
      danger={danger}
      disabled={disabled ?? !action.enabled}
      {...(onClick ? { onClick } : {})}
      {...(icon ? { icon } : {})}
      {...(actionDetail(action, locale)
        ? {
            style: {
              position: "relative" as const,
            },
          }
        : {})}
    >
      {children}
    </Btn>
  );
}

function buildBasePath(incidentId: string, searchParams: URLSearchParams) {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("intent");
  const query = next.toString();
  return query
    ? `/incidents/${encodeURIComponent(incidentId)}?${query}`
    : `/incidents/${encodeURIComponent(incidentId)}`;
}

function withOptionalString<T extends object>(
  value: string,
  apply: (trimmed: string) => T,
) {
  const trimmed = value.trim();
  return trimmed ? apply(trimmed) : {};
}

export function IncidentDetailActionPanel({
  incidentId,
  locale,
  availableActions,
  initialIntent,
  initialStatus,
  initialSeverity,
  initialAssignedTo,
  initialEscalationTarget,
  initialResolutionNote,
  latestAuditHref,
}: IncidentDetailActionPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<IncidentStatus>(initialStatus);
  const [severity, setSeverity] = useState<IncidentSeverity>(initialSeverity);
  const [assignedTo, setAssignedTo] = useState(initialAssignedTo ?? "");
  const [escalationTarget, setEscalationTarget] = useState<
    IncidentEscalationTarget | ""
  >(initialEscalationTarget ?? "");
  const [resolutionNote, setResolutionNote] = useState(
    initialResolutionNote ?? "",
  );
  const [reasonText, setReasonText] = useState("");
  const [ackActor, setAckActor] = useState(initialAssignedTo ?? "ops-user-001");
  const [recoveryType, setRecoveryType] = useState<
    RecordServiceRecoveryActionCommand["actionType"]
  >("passenger_recontact");
  const [recoveryActor, setRecoveryActor] = useState("ops-user-001");
  const [recoveryNote, setRecoveryNote] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const currentIntent =
    normalizeIntent(searchParams.get("intent")) ?? initialIntent;
  const supportedIntent =
    currentIntent === "update" ||
    currentIntent === "resolve" ||
    currentIntent === "close" ||
    currentIntent === "service_recovery" ||
    currentIntent === "acknowledge" ||
    currentIntent === "notify_police";

  const selectedAction = useMemo(
    () =>
      availableActions.find(
        (action) => actionIntent(action.action) === currentIntent,
      ) ?? null,
    [availableActions, currentIntent],
  );

  useEffect(() => {
    setStatus(initialStatus);
    setSeverity(initialSeverity);
    setAssignedTo(initialAssignedTo ?? "");
    setEscalationTarget(initialEscalationTarget ?? "");
    setResolutionNote(initialResolutionNote ?? "");
    setAckActor(initialAssignedTo ?? "ops-user-001");
    setReasonText("");
    setRecoveryNote("");
    setError(null);
  }, [
    initialAssignedTo,
    initialEscalationTarget,
    initialResolutionNote,
    initialSeverity,
    initialStatus,
    currentIntent,
  ]);

  if (!currentIntent && !receipt) {
    return null;
  }

  if (currentIntent === "lift_suppression") {
    const href = buildBasePath(incidentId, searchParams);
    return (
      <Card
        theme={theme}
        title={locale === "en" ? "Lift suppression" : "解除抑制"}
      >
        <Banner
          theme={theme}
          tone="warn"
          icon="warn"
          title={
            locale === "en"
              ? "Driver-side suppression lift is not writable from this incident form"
              : "這個 incident 表單目前不能直接寫入司機抑制解除"
          }
          body={
            locale === "en"
              ? "The deep link now lands correctly. Continue in Driver detail for contextual review, then return here after the driver state is updated."
              : "deep link 現在會正確落點。請先到 Driver detail 做情境確認，再回到此頁追蹤司機狀態更新。"
          }
        />
        <div
          style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}
        >
          <Btn
            theme={theme}
            size="sm"
            icon="arrow"
            onClick={() => router.replace(href)}
          >
            {locale === "en" ? "Dismiss" : "關閉"}
          </Btn>
        </div>
      </Card>
    );
  }

  const basePath = buildBasePath(incidentId, searchParams);

  async function handleSubmit() {
    if (!selectedAction || !selectedAction.enabled || !supportedIntent) {
      return;
    }

    if (selectedAction.requiresReason && reasonText.trim().length === 0) {
      setError(
        locale === "en"
          ? "Reason is required for this action."
          : "此動作必須填寫原因。",
      );
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const client = getOpsClient();
      const receiptTitle = actionCopy(selectedAction.action, locale);
      let receiptBody =
        locale === "en"
          ? "Mutation completed. Refreshing timeline and audit subset."
          : "動作已送出，正在刷新 timeline 與 audit 摘要。";
      let nextReceipt: ReceiptState | null = null;

      // NOTE: the current backend does not return a receipt envelope on
      // incident writes — updateIncident yields a bare IncidentRecord and
      // recordServiceRecoveryAction yields a bare ServiceRecoveryActionRecord
      // (api-client unwraps envelope.data). Packet §3.4 intends actionId/auditId
      // receipts, but until the backend lane (UI-BE-007-DSP) emits them we
      // degrade gracefully: surface what the record gives us and link to the
      // latest audit subset the server snapshot already exposes.
      if (currentIntent === "service_recovery") {
        const created = await client.recordServiceRecoveryAction(incidentId, {
          actionType: recoveryType,
          actor: recoveryActor.trim() || "ops-user-001",
          note: recoveryNote.trim(),
        });
        receiptBody =
          locale === "en"
            ? `Recorded ${formatOpsCodeLabel(locale, created.actionType)} by ${created.actor}.`
            : `已由 ${created.actor} 記錄 ${formatOpsCodeLabel(locale, created.actionType)}。`;
        nextReceipt = {
          actionId: created.actionId,
          auditId: null,
          title: receiptTitle,
          body: receiptBody,
          auditHref: latestAuditHref,
        };
      } else {
        const payload: UpdateIncidentCommand =
          currentIntent === "update"
            ? {
                status,
                severity,
                escalationTarget: escalationTarget || null,
                ...withOptionalString(assignedTo, (trimmed) => ({
                  assignedTo: trimmed,
                })),
                ...withOptionalString(resolutionNote, (trimmed) => ({
                  resolutionNote: trimmed,
                })),
              }
            : currentIntent === "resolve"
              ? {
                  status: "resolved",
                  resolutionNote: resolutionNote.trim() || reasonText.trim(),
                }
              : currentIntent === "close"
                ? {
                    status: "closed",
                    resolutionNote: reasonText.trim(),
                  }
                : currentIntent === "notify_police"
                  ? {
                      resolutionNote: (() => {
                        const note = reasonText.trim();
                        const prefix =
                          locale === "en"
                            ? `Police notified: ${note}`
                            : `已通知警方：${note}`;
                        return resolutionNote.trim()
                          ? `${resolutionNote.trim()}\n${prefix}`
                          : prefix;
                      })(),
                    }
                  : {
                      // No dedicated acknowledge endpoint on the current backend
                      // (UI-BE-007-DSP does not expose one yet); record the
                      // acknowledgment — including who acknowledged — into the
                      // resolution note so it persists and lands on the timeline,
                      // without silently reassigning ownership.
                      resolutionNote: (() => {
                        const actor = ackActor.trim() || "ops-user";
                        const note = reasonText.trim();
                        if (note) {
                          return locale === "en"
                            ? `Escalation acknowledged by ${actor}: ${note}`
                            : `升級已由 ${actor} 確認：${note}`;
                        }
                        return locale === "en"
                          ? `Escalation acknowledged by ${actor}.`
                          : `升級已由 ${actor} 確認。`;
                      })(),
                    };

        await client.updateIncident(incidentId, payload);
        nextReceipt = {
          actionId: null,
          auditId: null,
          title: receiptTitle,
          body: receiptBody,
          auditHref: latestAuditHref,
        };
      }

      setReceipt(
        nextReceipt ?? {
          actionId: null,
          auditId: null,
          title: receiptTitle,
          body: receiptBody,
          auditHref: latestAuditHref,
        },
      );
      startTransition(() => {
        router.replace(basePath);
        router.refresh();
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : locale === "en"
            ? "Unknown incident action failure."
            : "incident 動作失敗。",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card
      theme={theme}
      title={
        selectedAction
          ? actionCopy(selectedAction.action, locale)
          : locale === "en"
            ? "Action context"
            : "動作上下文"
      }
    >
      {receipt ? (
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <Banner
            theme={theme}
            tone="success"
            icon="check"
            title={
              locale === "en"
                ? `${receipt.title} completed`
                : `${receipt.title}已完成`
            }
            body={receipt.body}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {receipt.actionId
                ? locale === "en"
                  ? `Action ${receipt.actionId} recorded`
                  : `已記錄動作 ${receipt.actionId}`
                : locale === "en"
                  ? "Action recorded · receipt id pending backend"
                  : "動作已記錄 · 回執編號待後端提供"}
            </span>
            {receipt.auditHref ? (
              <a
                href={receipt.auditHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  color: theme.accentHi,
                  fontSize: 12.5,
                  textDecoration: "none",
                }}
              >
                {locale === "en" ? "Open latest audit" : "開啟最新審計"}
              </a>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {locale === "en"
                  ? "Audit subset refreshes on the server snapshot."
                  : "audit 摘要會隨 server snapshot 一起刷新。"}
              </span>
            )}
            <button
              type="button"
              onClick={() => setReceipt(null)}
              style={{
                border: "none",
                background: "transparent",
                color: theme.textMuted,
                cursor: "pointer",
                padding: 0,
                fontSize: 12.5,
              }}
            >
              {locale === "en" ? "Dismiss receipt" : "關閉回執"}
            </button>
          </div>
        </div>
      ) : null}

      {selectedAction ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Banner
            theme={theme}
            tone={actionTone(selectedAction.riskLevel)}
            icon={selectedAction.riskLevel === "high" ? "warn" : "info"}
            title={
              locale === "en"
                ? `${actionCopy(selectedAction.action, locale)} confirmation`
                : `${actionCopy(selectedAction.action, locale)}確認`
            }
            body={actionSummary(currentIntent ?? "", locale)}
          />

          {!supportedIntent ? (
            <Banner
              theme={theme}
              tone="warn"
              icon="warn"
              title={
                locale === "en"
                  ? "This action remains descriptor-driven, but the incident form cannot submit it yet"
                  : "這個動作維持 descriptor-driven，但 incident 表單目前還不能直接送出"
              }
              body={
                locale === "en"
                  ? "Keep the CTA visible for parity. This intent still needs a dedicated backend endpoint before the form can execute it."
                  : "保留 CTA 以維持 parity；這個 intent 仍需要專屬後端端點，表單才能真正執行。"
              }
            />
          ) : null}

          {currentIntent === "update" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <Field theme={theme} label={t("incidents.form.status", locale)}>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as IncidentStatus)
                  }
                  style={inputStyle}
                >
                  {INCIDENT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field theme={theme} label={t("incidents.form.severity", locale)}>
                <select
                  value={severity}
                  onChange={(event) =>
                    setSeverity(event.target.value as IncidentSeverity)
                  }
                  style={inputStyle}
                >
                  {INCIDENT_SEVERITIES.map((value) => (
                    <option key={value} value={value}>
                      {formatOpsCodeLabel(locale, value)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                theme={theme}
                label={t("incidents.form.assignedTo", locale)}
              >
                <input
                  value={assignedTo}
                  onChange={(event) => setAssignedTo(event.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field
                theme={theme}
                label={t("incidents.form.escalationTarget", locale)}
              >
                <select
                  value={escalationTarget}
                  onChange={(event) =>
                    setEscalationTarget(
                      event.target.value as IncidentEscalationTarget | "",
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">
                    {t("incidents.form.escalationNone", locale)}
                  </option>
                  {INCIDENT_ESCALATION_TARGETS.map((value) => (
                    <option key={value} value={value}>
                      {t(`incidents.escalationBadge.${value}` as never, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                theme={theme}
                label={t("incidents.form.resolutionNote", locale)}
              >
                <textarea
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  rows={4}
                  style={textareaStyle}
                />
              </Field>
            </div>
          ) : null}

          {currentIntent === "resolve" || currentIntent === "close" ? (
            <Field
              theme={theme}
              label={
                currentIntent === "close"
                  ? locale === "en"
                    ? "Close reason"
                    : "關閉原因"
                  : t("incidents.form.resolutionNote", locale)
              }
            >
              <textarea
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                rows={4}
                style={textareaStyle}
              />
            </Field>
          ) : null}

          {currentIntent === "acknowledge" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <Field
                theme={theme}
                label={locale === "en" ? "Acknowledged by" : "確認人"}
              >
                <input
                  value={ackActor}
                  onChange={(event) => setAckActor(event.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field
                theme={theme}
                label={locale === "en" ? "Acknowledgment note" : "確認備註"}
              >
                <textarea
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  rows={3}
                  style={textareaStyle}
                />
              </Field>
            </div>
          ) : null}

          {currentIntent === "service_recovery" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <Field
                theme={theme}
                label={t("incidents.serviceRecovery.type", locale)}
              >
                <select
                  value={recoveryType}
                  onChange={(event) =>
                    setRecoveryType(
                      event.target
                        .value as RecordServiceRecoveryActionCommand["actionType"],
                    )
                  }
                  style={inputStyle}
                >
                  {SERVICE_RECOVERY_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {t(`incidents.serviceRecovery.${value}` as never, locale)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                theme={theme}
                label={t("incidents.serviceRecovery.actor", locale)}
              >
                <input
                  value={recoveryActor}
                  onChange={(event) => setRecoveryActor(event.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field
                theme={theme}
                label={t("incidents.serviceRecovery.note", locale)}
              >
                <textarea
                  value={recoveryNote}
                  onChange={(event) => setRecoveryNote(event.target.value)}
                  rows={4}
                  style={textareaStyle}
                />
              </Field>
            </div>
          ) : null}

          {selectedAction.requiresReason &&
          currentIntent !== "close" &&
          currentIntent !== "acknowledge" &&
          currentIntent !== "resolve" ? (
            <Field
              theme={theme}
              label={locale === "en" ? "Required reason" : "必填原因"}
            >
              <textarea
                value={reasonText}
                onChange={(event) => setReasonText(event.target.value)}
                rows={3}
                style={textareaStyle}
              />
            </Field>
          ) : null}

          {error ? (
            <Banner theme={theme} tone="danger" icon="warn" title={error} />
          ) : null}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <CanvasActionButton
              action={selectedAction}
              locale={locale}
              icon={selectedAction.riskLevel === "high" ? "warn" : "check"}
              disabled={
                isPending || !selectedAction.enabled || !supportedIntent
              }
              onClick={() => {
                void handleSubmit();
              }}
            >
              {isPending
                ? locale === "en"
                  ? "Submitting"
                  : "送出中"
                : locale === "en"
                  ? `Confirm ${actionCopy(selectedAction.action, locale)}`
                  : `確認${actionCopy(selectedAction.action, locale)}`}
            </CanvasActionButton>
            <Btn
              theme={theme}
              size="sm"
              icon="arrow"
              onClick={() => {
                setReceipt(null);
                router.replace(basePath);
              }}
            >
              {locale === "en" ? "Cancel" : "取消"}
            </Btn>
            {!selectedAction.enabled && selectedAction.disabledReasonCode ? (
              <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {formatOpsCodeLabel(locale, selectedAction.disabledReasonCode)}
              </span>
            ) : !supportedIntent ? (
              <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {locale === "en"
                  ? "Backend endpoint pending for this intent."
                  : "此 intent 對應的後端端點尚未提供。"}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <Banner
          theme={theme}
          tone="info"
          icon="info"
          title={locale === "en" ? "Unknown action intent" : "未知的動作意圖"}
          body={
            locale === "en"
              ? "The deep link intent was not recognized for this incident snapshot."
              : "這個 incident snapshot 無法識別 deep link 帶來的 intent。"
          }
        />
      )}
    </Card>
  );
}

const inputStyle = {
  width: "100%",
  minHeight: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.text,
  padding: "8px 10px",
  fontSize: 12.5,
};

const textareaStyle = {
  ...inputStyle,
  minHeight: 88,
  resize: "vertical" as const,
};
