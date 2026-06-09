"use client";

import { useState, useTransition } from "react";
import type { ResourceActionDescriptor } from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";
import {
  acknowledgeBreachAction,
  approveApprovalRequestAction,
  escalateApprovalRequestAction,
  nudgeApprovalRequestAction,
  rejectApprovalRequestAction,
  type ApprovalActionResult,
} from "./actions";
import { t } from "@/lib/translations";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

type Locale = "en" | "zh";

function actionLabel(action: string, locale: Locale): string {
  switch (action) {
    case "approve":
      return t("approvalRequests.action.approve", locale);
    case "reject":
      return t("approvalRequests.action.reject", locale);
    case "escalate":
      return t("approvalRequests.action.escalate", locale);
    case "nudge":
      return t("approvalRequests.action.nudge", locale);
    case "acknowledge_breach":
      return t("approvalRequests.action.acknowledgeBreach", locale);
    default:
      return action;
  }
}

function actionTone(
  riskLevel: ResourceActionDescriptor["riskLevel"],
): "danger" | "warn" | "neutral" {
  if (riskLevel === "high") {
    return "danger";
  }
  if (riskLevel === "medium") {
    return "warn";
  }
  return "neutral";
}

export function ApprovalActions({
  requestId,
  actions,
  canNudge,
  canAcknowledge,
  locale,
}: {
  requestId: string;
  actions: ResourceActionDescriptor[];
  canNudge: boolean;
  canAcknowledge: boolean;
  locale: Locale;
}) {
  const [pending, startTransition] = useTransition();
  const [selectedAction, setSelectedAction] =
    useState<ResourceActionDescriptor | null>(null);
  const [reason, setReason] = useState("");

  const extraActions: ResourceActionDescriptor[] = [
    ...(canNudge
      ? [
          {
            action: "nudge",
            enabled: true,
            requiresReason: false,
            riskLevel: "medium" as const,
          },
        ]
      : []),
    ...(canAcknowledge
      ? [
          {
            action: "acknowledge_breach",
            enabled: true,
            requiresReason: false,
            riskLevel: "medium" as const,
          },
        ]
      : []),
  ];
  const allActions: ResourceActionDescriptor[] = [...actions, ...extraActions];

  function handle(run: () => Promise<ApprovalActionResult>) {
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        window.alert(
          t("approvalRequests.action.failed", locale, {
            message: result.message,
          }),
        );
        return;
      }
      setSelectedAction(null);
      setReason("");
    });
  }

  function onConfirm() {
    if (!selectedAction) {
      return;
    }
    if (selectedAction.requiresReason && !reason.trim()) {
      return;
    }
    const note = reason.trim() ? reason : undefined;
    switch (selectedAction.action) {
      case "approve":
        handle(() => approveApprovalRequestAction(requestId, reason));
        return;
      case "reject":
        handle(() => rejectApprovalRequestAction(requestId, reason));
        return;
      case "escalate":
        handle(() => escalateApprovalRequestAction(requestId, reason));
        return;
      case "nudge":
        handle(() => nudgeApprovalRequestAction(requestId, note));
        return;
      case "acknowledge_breach":
        handle(() => acknowledgeBreachAction(requestId, note));
        return;
      default:
        window.alert(
          t("approvalRequests.action.unsupported", locale, {
            action: selectedAction.action,
          }),
        );
    }
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {allActions.map((action) => (
          <Btn
            key={action.action}
            theme={theme}
            size="xs"
            variant={action.riskLevel === "high" ? "primary" : "secondary"}
            danger={action.riskLevel === "high"}
            disabled={!action.enabled || pending}
            onClick={() => {
              setSelectedAction(action);
              setReason("");
            }}
          >
            {actionLabel(action.action, locale)}
            {action.requiresReason ? " *" : ""}
          </Btn>
        ))}
      </div>

      {selectedAction ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(2,6,23,0.66)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => {
            if (!pending) {
              setSelectedAction(null);
            }
          }}
        >
          <div
            style={{ width: "min(440px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <Card
              theme={theme}
              title={
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {actionLabel(selectedAction.action, locale)}
                  <Pill
                    theme={theme}
                    tone={actionTone(selectedAction.riskLevel)}
                  >
                    {t("approvalRequests.action.risk", locale, {
                      riskLevel: selectedAction.riskLevel,
                    })}
                  </Pill>
                </span>
              }
              subtitle={requestId}
            >
              {selectedAction.requiresReason ? (
                <Banner
                  theme={theme}
                  tone="warn"
                  icon="warn"
                  title={t("approvalRequests.action.highRisk", locale)}
                  body={t("approvalRequests.action.auditNote", locale)}
                />
              ) : (
                <Banner
                  theme={theme}
                  tone="info"
                  icon="info"
                  title={t("approvalRequests.action.optionalNote", locale)}
                  body={t("approvalRequests.action.optionalAuditNote", locale)}
                />
              )}

              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label
                  style={{
                    display: "grid",
                    gap: 6,
                    color: theme.text,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {t("approvalRequests.action.reason", locale)}
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: theme.surfaceHi,
                      color: theme.text,
                      padding: "10px 12px",
                      font: "inherit",
                    }}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <Btn
                  theme={theme}
                  onClick={() => {
                    if (!pending) {
                      setSelectedAction(null);
                    }
                  }}
                  disabled={pending}
                >
                  {t("common.cancel", locale)}
                </Btn>
                <Btn
                  theme={theme}
                  variant="primary"
                  danger={selectedAction.riskLevel === "high"}
                  disabled={
                    pending ||
                    (!!selectedAction.requiresReason && !reason.trim())
                  }
                  onClick={onConfirm}
                >
                  {pending
                    ? t("approvalRequests.action.working", locale)
                    : t("approvalRequests.action.confirm", locale)}
                </Btn>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
