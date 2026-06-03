"use client";

import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { CanvasPill as Pill } from "@drts/ui-web";
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
  const reasonFieldId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const requiresReason = Boolean(
    request.requiresReason || request.riskLevel === "high",
  );
  const disabled = Boolean(request.disabled);
  const trimmedReason = reason.trim();
  const canSubmit =
    !disabled && !isSubmitting && (!requiresReason || trimmedReason.length > 0);

  async function handleConfirm() {
    if (requiresReason && trimmedReason.length === 0) {
      setError("Reason is required before this action can run.");
      return;
    }
    if (disabled) {
      setError(request.disabledReason ?? "This action is currently unavailable.");
      return;
    }

    setError(null);
    await onConfirm(trimmedReason);
  }

  return (
    <section
      style={assistantCardStyle}
      aria-label="Assistant confirmation panel"
    >
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
            {request.riskLevel.toUpperCase()} RISK
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
              Target resource
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
            {request.reasonLabel ?? "Execution reason"}
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
                ? "Required for high-risk execution."
                : "Optional operator note.")
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
              (requiresReason
                ? "This action cannot execute until a non-empty reason is supplied."
                : "Reason will be attached to the audit trail when provided.")}
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

        {!error && request.disabledReason ? (
          <div
            style={{
              ...assistantInsetStyle,
              borderColor: assistantTheme.warnBorder,
              background: assistantTheme.warnBg,
              color: assistantTheme.warn,
              padding: "10px 12px",
              fontSize: 12.5,
              lineHeight: 1.45,
            }}
          >
            {request.disabledReason}
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
              {request.cancelLabel ?? "Cancel"}
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
              ? "Executing..."
              : (request.confirmLabel ?? "Confirm and execute")}
          </button>
        </div>
      </div>
    </section>
  );
}
