"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  ActionIntent,
  ActionReceipt,
  IncidentCategory,
  IncidentEscalationTarget,
  IncidentSeverity,
  IncidentStatus,
  RecordServiceRecoveryActionCommand,
  ResourceActionDescriptor,
  UpdateIncidentCommand,
} from "@drts/contracts";
import {
  INCIDENT_CATEGORIES,
  INCIDENT_ESCALATION_TARGETS,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
} from "@drts/contracts";
import { useAssistantActionBridgeRegistration } from "@/components/ops-assistant";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t, type Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasField as Field,
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
  initialCategory: IncidentCategory;
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
  if (normalized.includes("lift")) return "lift_suppression";
  return normalized;
}

function actionCopy(action: string, locale: Locale) {
  const normalized = action.toLowerCase();
  if (normalized.includes("update")) {
    return t("incidents.actions.updateIncident", locale);
  }
  if (normalized.includes("resolve")) {
    return t("incidents.actions.resolveIncident", locale);
  }
  if (normalized.includes("close")) {
    return t("incidents.actions.closeIncident", locale);
  }
  if (normalized.includes("recovery")) {
    return t("incidents.actions.addRecoveryAction", locale);
  }
  if (normalized.includes("ack")) {
    return t("incidents.actions.acknowledgeEscalation", locale);
  }
  if (normalized.includes("lift")) {
    return t("incidents.actions.liftSuppression", locale);
  }
  return formatOpsCodeLabel(locale, action);
}

function actionSummary(intent: string, locale: Locale) {
  switch (intent) {
    case "update":
      return t("incidents.actionPanel.summary.update", locale);
    case "resolve":
      return t("incidents.actionPanel.summary.resolve", locale);
    case "close":
      return t("incidents.actionPanel.summary.close", locale);
    case "service_recovery":
      return t("incidents.actionPanel.summary.serviceRecovery", locale);
    case "acknowledge":
      return t("incidents.actionPanel.summary.acknowledge", locale);
    default:
      return t("incidents.actionPanel.summary.default", locale);
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

function parseAuditIdFromHref(auditHref: string | null) {
  if (!auditHref) {
    return null;
  }

  try {
    const url = new URL(auditHref, "https://ops-console.local");
    const auditId = url.searchParams.get("auditId");
    return auditId && auditId.trim().length > 0 ? auditId : null;
  } catch {
    return null;
  }
}

export function IncidentDetailActionPanel({
  incidentId,
  locale,
  availableActions,
  initialIntent,
  initialStatus,
  initialCategory,
  initialSeverity,
  initialAssignedTo,
  initialEscalationTarget,
  initialResolutionNote,
  latestAuditHref,
}: IncidentDetailActionPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<IncidentStatus>(initialStatus);
  const [category, setCategory] = useState<IncidentCategory>(initialCategory);
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
  const assistantBridgePromiseRef = useRef<{
    resolve: (receipt: ActionReceipt & { auditHref?: string | null }) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const searchParamsKey = searchParams.toString();
  const currentIntent =
    normalizeIntent(searchParams.get("intent")) ?? initialIntent;

  const selectedAction = useMemo(
    () =>
      availableActions.find(
        (action) => actionIntent(action.action) === currentIntent,
      ) ?? null,
    [availableActions, currentIntent],
  );

  useEffect(() => {
    setStatus(initialStatus);
    setCategory(initialCategory);
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
    initialCategory,
    initialEscalationTarget,
    initialResolutionNote,
    initialSeverity,
    initialStatus,
    currentIntent,
  ]);

  const assistantActionBridge = useMemo(
    () => ({
      resourceKind: "incident" as const,
      resourceId: incidentId,
      availableActions,
      resolveDescriptor: (intent: ActionIntent) =>
        availableActions.find((action) => {
          const normalizedIntent = normalizeIntent(intent.action);
          return (
            action.action.toLowerCase() === intent.action.toLowerCase() ||
            actionIntent(action.action) === normalizedIntent
          );
        }) ?? null,
      invoke: async (
        _intent: ActionIntent,
        descriptor: ResourceActionDescriptor,
      ) => {
        const nextIntent = actionIntent(descriptor.action);
        setError(null);
        return new Promise<ActionReceipt & { auditHref?: string | null }>(
          (resolve, reject) => {
            assistantBridgePromiseRef.current = { resolve, reject };
            const nextParams = new URLSearchParams(searchParamsKey);
            nextParams.set("intent", nextIntent);
            router.replace(
              `/incidents/${encodeURIComponent(incidentId)}?${nextParams.toString()}`,
            );
          },
        );
      },
    }),
    [availableActions, incidentId, router, searchParamsKey],
  );

  useAssistantActionBridgeRegistration(assistantActionBridge);

  if (!currentIntent && !receipt) {
    return null;
  }

  if (currentIntent === "lift_suppression") {
    const href = buildBasePath(incidentId, searchParams);
    return (
      <Card
        theme={theme}
        title={t("incidents.actions.liftSuppression", locale)}
      >
        <Banner
          theme={theme}
          tone="warn"
          icon="warn"
          title={t("incidents.actionPanel.liftSuppression.title", locale)}
          body={t("incidents.actionPanel.liftSuppression.body", locale)}
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
            {t("incidents.actionPanel.dismiss", locale)}
          </Btn>
        </div>
      </Card>
    );
  }

  const basePath = buildBasePath(incidentId, searchParams);

  async function handleSubmit() {
    if (!selectedAction || !selectedAction.enabled) {
      return;
    }

    if (selectedAction.requiresReason && reasonText.trim().length === 0) {
      setError(t("incidents.actionPanel.error.reasonRequired", locale));
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      const client = getOpsClient();
      const receiptTitle = actionCopy(selectedAction.action, locale);
      let receiptBody = t("incidents.actionPanel.receipt.body.default", locale);
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
          t("incidents.actionPanel.receipt.body.serviceRecovery", locale, {
            actionType: formatOpsCodeLabel(locale, created.actionType),
            actor: created.actor,
          });
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
                        return t(
                          "incidents.actionPanel.acknowledgment.withNote",
                          locale,
                          { actor, note },
                        );
                      }
                      return t(
                        "incidents.actionPanel.acknowledgment.noNote",
                        locale,
                        { actor },
                      );
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
      assistantBridgePromiseRef.current?.resolve({
        actionId:
          nextReceipt?.actionId ??
          `incident-${incidentId}-${selectedAction.action}-${Date.now()}`,
        auditId:
          nextReceipt?.auditId ??
          parseAuditIdFromHref(nextReceipt?.auditHref ?? latestAuditHref) ??
          `audit-pending-${incidentId}`,
        resourceType: "incident",
        resourceId: incidentId,
        status: "completed",
        message: receiptBody,
        auditHref: nextReceipt?.auditHref ?? latestAuditHref,
      });
      assistantBridgePromiseRef.current = null;
      startTransition(() => {
        router.replace(basePath);
        router.refresh();
      });
    } catch (submitError) {
      assistantBridgePromiseRef.current?.reject(
        submitError instanceof Error
          ? submitError
          : new Error("Unknown incident action failure."),
      );
      assistantBridgePromiseRef.current = null;
      setError(
        submitError instanceof Error
          ? submitError.message
          : t("incidents.actionPanel.error.unknownFailure", locale),
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
          : t("incidents.actionPanel.contextTitle", locale)
      }
    >
      {receipt ? (
        <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <Banner
            theme={theme}
            tone="success"
            icon="check"
            title={
              t("incidents.actionPanel.receipt.completedTitle", locale, {
                title: receipt.title,
              })
            }
            body={receipt.body}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
              {receipt.actionId
                ? t("incidents.actionPanel.receipt.actionRecorded", locale, {
                    actionId: receipt.actionId,
                  })
                : t("incidents.actionPanel.receipt.pendingBackend", locale)}
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
                {t("incidents.detail.navigation.openLatestAudit", locale)}
              </a>
            ) : (
              <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {t("incidents.actionPanel.receipt.auditRefreshes", locale)}
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
              {t("incidents.actionPanel.dismissReceipt", locale)}
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
              t("incidents.actionPanel.confirmationTitle", locale, {
                action: actionCopy(selectedAction.action, locale),
              })
            }
            body={actionSummary(currentIntent ?? "", locale)}
          />

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
                label={t("incidents.form.category", locale)}
              >
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as IncidentCategory)
                  }
                  style={inputStyle}
                >
                  {INCIDENT_CATEGORIES.map((value) => (
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
                  ? t("incidents.actionPanel.closeReason", locale)
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
                label={t("incidents.actionPanel.acknowledgedBy", locale)}
              >
                <input
                  value={ackActor}
                  onChange={(event) => setAckActor(event.target.value)}
                  style={inputStyle}
                />
              </Field>
              <Field
                theme={theme}
                label={t("incidents.actionPanel.acknowledgmentNote", locale)}
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
              label={t("incidents.actionPanel.requiredReason", locale)}
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
            <Btn
              theme={theme}
              size="sm"
              icon={selectedAction.riskLevel === "high" ? "warn" : "check"}
              disabled={isPending || !selectedAction.enabled}
              onClick={() => {
                void handleSubmit();
              }}
            >
              {isPending
                ? t("incidents.actionPanel.submitting", locale)
                : t("incidents.actionPanel.confirmAction", locale, {
                    action: actionCopy(selectedAction.action, locale),
                  })}
            </Btn>
            <Btn
              theme={theme}
              size="sm"
              icon="arrow"
              onClick={() => {
                setReceipt(null);
                assistantBridgePromiseRef.current?.reject(
                  new Error("ASSISTANT_ACTION_CANCELLED"),
                );
                assistantBridgePromiseRef.current = null;
                router.replace(basePath);
              }}
            >
              {t("common.cancel", locale)}
            </Btn>
            {!selectedAction.enabled && selectedAction.disabledReasonCode ? (
              <span style={{ color: theme.textMuted, fontSize: 12.5 }}>
                {formatOpsCodeLabel(locale, selectedAction.disabledReasonCode)}
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <Banner
          theme={theme}
          tone="info"
          icon="info"
          title={t("incidents.actionPanel.unknownIntent.title", locale)}
          body={t("incidents.actionPanel.unknownIntent.body", locale)}
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
