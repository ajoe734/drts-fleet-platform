"use client";

import type { KeyboardEvent } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import {
  assistantCardStyle,
  assistantMutedTextStyle,
  assistantStatusTone,
  assistantTheme,
  type AssistantViewState,
} from "./assistant-types";
import { CanvasPill as Pill } from "@drts/ui-web";

const busyStates: AssistantViewState[] = [
  "thinking",
  "planning",
  "awaiting_confirmation",
  "executing",
];

function helperCopyKey(state: AssistantViewState) {
  switch (state) {
    case "thinking":
      return "assistant.composer.helper.thinking";
    case "planning":
      return "assistant.composer.helper.planning";
    case "awaiting_confirmation":
      return "assistant.composer.helper.awaitingConfirmation";
    case "executing":
      return "assistant.composer.helper.executing";
    case "receipt":
      return "assistant.composer.helper.receipt";
    case "error":
      return "assistant.composer.helper.error";
    case "idle":
    default:
      return "assistant.composer.helper.idle";
  }
}

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  state = "idle",
  disabled = false,
  placeholder = "Ask Platform Admin to inspect, plan, or execute a governed action...",
  submitLabel = "Send",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  state?: AssistantViewState;
  disabled?: boolean;
  placeholder?: string;
  submitLabel?: string;
}) {
  const { t } = useTranslation();
  const isBusy = busyStates.includes(state);
  const submitDisabled = disabled || isBusy || value.trim().length === 0;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!submitDisabled) {
        onSubmit();
      }
    }
  }

  return (
    <section style={{ ...assistantCardStyle, padding: 18 }}>
      <div style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={16} color={assistantTheme.accent} />
            <strong style={{ color: assistantTheme.text, fontSize: 15.5 }}>
              {t("assistant.common.name")}
            </strong>
          </div>
          <Pill theme={assistantTheme} tone={assistantStatusTone(state)}>
            {t(`assistant.state.${state}`)}
          </Pill>
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ===
            "Ask Platform Admin to inspect, plan, or execute a governed action..."
              ? t("assistant.composer.placeholder")
              : placeholder
          }
          rows={4}
          disabled={disabled}
          style={{
            width: "100%",
            resize: "vertical",
            minHeight: 112,
            borderRadius: 14,
            border: `1px solid ${assistantTheme.border}`,
            padding: "12px 14px",
            background: disabled
              ? assistantTheme.surfaceLo
              : assistantTheme.surface,
            color: assistantTheme.text,
            fontFamily: assistantTheme.fontFamily,
            fontSize: 14,
            lineHeight: 1.5,
            boxSizing: "border-box",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={assistantMutedTextStyle}>{t(helperCopyKey(state))}</div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            style={{
              appearance: "none",
              border: `1px solid ${submitDisabled ? assistantTheme.border : assistantTheme.accent}`,
              borderRadius: 12,
              background: submitDisabled
                ? assistantTheme.surfaceLo
                : assistantTheme.accent,
              color: submitDisabled ? assistantTheme.textDim : "#ffffff",
              padding: "10px 14px",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: submitDisabled ? "not-allowed" : "pointer",
            }}
          >
            <SendHorizontal size={15} />
            {isBusy
              ? t("assistant.composer.waiting")
              : submitLabel === "Send"
                ? t("assistant.composer.submit")
                : submitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
