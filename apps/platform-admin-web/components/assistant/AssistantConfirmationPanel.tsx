"use client";

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { CanvasPill as Pill } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import {
  assistantCardStyle,
  assistantInsetStyle,
  assistantMutedTextStyle,
  assistantRiskTone,
  assistantTheme,
  type AssistantConfirmationRequest,
} from "./assistant-types";

const bodyStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 18,
};

const buttonRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

function buttonStyle(
  kind: "primary" | "secondary" | "danger",
  disabled = false,
) {
  const palette =
    kind === "primary"
      ? {
          background: assistantTheme.accent,
          color: "#ffffff",
          border: assistantTheme.accent,
        }
      : kind === "danger"
        ? {
            background: assistantTheme.danger,
            color: "#ffffff",
            border: assistantTheme.danger,
          }
        : {
            background: assistantTheme.surface,
            color: assistantTheme.text,
            border: assistantTheme.border,
          };

  return {
    appearance: "none",
    borderRadius: 10,
    border: `1px solid ${palette.border}`,
    background: disabled ? assistantTheme.surfaceLo : palette.background,
    color: disabled ? assistantTheme.textDim : palette.color,
    padding: "9px 14px",
    fontSize: 13,
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
  } satisfies CSSProperties;
}

export function AssistantConfirmationPanel({
  request,
  isSubmitting = false,
  onConfirm,
  onCancel,
}: {
  request: AssistantConfirmationRequest;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { locale } = useTranslation();
  const reasonFieldId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const copy =
    locale === "zh"
      ? {
          ariaLabel: "平台助理確認面板",
          requiredError: "此操作執行前必須填寫原因。",
          targetResource: "目標資源",
          defaultReasonLabel: "執行原因",
          requiredPlaceholder: "高風險操作必填原因。",
          optionalPlaceholder: "可選填操作備註。",
          requiredHint: "在提供非空原因前，這個動作無法執行。",
          optionalHint: "若有填寫，原因會一併附加到稽核軌跡。",
          cancel: "取消",
          executing: "執行中…",
          confirm: "確認並執行",
          riskLabel: (risk: AssistantConfirmationRequest["riskLevel"]) =>
            ({
              high: "高風險",
              medium: "中風險",
              low: "低風險",
            })[risk],
        }
      : {
          ariaLabel: "Assistant confirmation panel",
          requiredError: "Reason is required before this action can run.",
          targetResource: "Target resource",
          defaultReasonLabel: "Execution reason",
          requiredPlaceholder: "Required for high-risk execution.",
          optionalPlaceholder: "Optional operator note.",
          requiredHint:
            "This action cannot execute until a non-empty reason is supplied.",
          optionalHint:
            "Reason will be attached to the audit trail when provided.",
          cancel: "Cancel",
          executing: "Executing...",
          confirm: "Confirm and execute",
          riskLabel: (risk: AssistantConfirmationRequest["riskLevel"]) =>
            ({
              high: "HIGH RISK",
              medium: "MEDIUM RISK",
              low: "LOW RISK",
            })[risk],
        };
  const requiresReason = Boolean(
    request.requiresReason || request.riskLevel === "high",
  );
  const trimmedReason = reason.trim();
  const canSubmit =
    !isSubmitting && (!requiresReason || trimmedReason.length > 0);

  async function handleConfirm() {
    if (requiresReason && trimmedReason.length === 0) {
      setError(copy.requiredError);
      return;
    }

    setError(null);
    await onConfirm(trimmedReason);
  }

  return (
    <section style={assistantCardStyle} aria-label={copy.ariaLabel}>
      <div style={bodyStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color={assistantTheme.accent} />
              <strong style={{ color: assistantTheme.text, fontSize: 16 }}>
                {request.title}
              </strong>
            </div>
            <div style={assistantMutedTextStyle}>{request.message}</div>
          </div>
          <Pill
            theme={assistantTheme}
            tone={assistantRiskTone(request.riskLevel)}
          >
            {copy.riskLabel(request.riskLevel)}
          </Pill>
        </div>

        {request.resourceLabel ? (
          <div style={{ ...assistantInsetStyle, padding: "10px 12px" }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: assistantTheme.textDim,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 4,
              }}
            >
              {copy.targetResource}
            </div>
            <div style={{ color: assistantTheme.text, fontSize: 13.5 }}>
              {request.resourceLabel}
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 8 }}>
          <label
            htmlFor={reasonFieldId}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: assistantTheme.text,
            }}
          >
            {request.reasonLabel ?? copy.defaultReasonLabel}
          </label>
          <textarea
            id={reasonFieldId}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            placeholder={
              request.reasonPlaceholder ??
              (requiresReason
                ? copy.requiredPlaceholder
                : copy.optionalPlaceholder)
            }
            rows={4}
            style={{
              width: "100%",
              resize: "vertical",
              minHeight: 96,
              borderRadius: 12,
              border: `1px solid ${error ? assistantTheme.danger : assistantTheme.border}`,
              padding: "10px 12px",
              background: assistantTheme.surface,
              color: assistantTheme.text,
              fontSize: 13,
              lineHeight: 1.5,
              fontFamily: assistantTheme.fontFamily,
              boxSizing: "border-box",
            }}
          />
          <div style={assistantMutedTextStyle}>
            {request.reasonHint ??
              (requiresReason ? copy.requiredHint : copy.optionalHint)}
          </div>
        </div>

        {error ? (
          <div
            style={{
              ...assistantInsetStyle,
              borderColor: assistantTheme.dangerBorder,
              background: assistantTheme.dangerBg,
              color: assistantTheme.danger,
              padding: "10px 12px",
              display: "flex",
              gap: 8,
              alignItems: "start",
            }}
          >
            <AlertTriangle size={16} />
            <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{error}</span>
          </div>
        ) : null}

        <div style={buttonRowStyle}>
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              style={buttonStyle("secondary", isSubmitting)}
            >
              {request.cancelLabel ?? copy.cancel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canSubmit}
            style={buttonStyle(
              request.riskLevel === "high" ? "danger" : "primary",
              !canSubmit,
            )}
          >
            {isSubmitting
              ? copy.executing
              : (request.confirmLabel ?? copy.confirm)}
          </button>
        </div>
      </div>
    </section>
  );
}
