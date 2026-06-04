"use client";

import type { KeyboardEvent } from "react";
import { SendHorizontal, Sparkles } from "lucide-react";
import {
  assistantCardStyle,
  assistantMutedTextStyle,
  assistantStateLabel,
  assistantStatusTone,
  assistantTheme,
  type AssistantViewState,
} from "./assistant-types";
import { CanvasPill as Pill } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";

const busyStates: AssistantViewState[] = [
  "thinking",
  "planning",
  "awaiting_confirmation",
  "executing",
];

function helperCopy(state: AssistantViewState, t: (key: string) => string) {
  switch (state) {
    case "thinking":
      return t("assistant.composer.helper.thinking");
    case "planning":
      return t("assistant.composer.helper.planning");
    case "awaiting_confirmation":
      return t("assistant.composer.helper.awaitingConfirmation");
    case "executing":
      return t("assistant.composer.helper.executing");
    case "receipt":
      return t("assistant.composer.helper.receipt");
    case "error":
      return t("assistant.composer.helper.error");
    case "idle":
    default:
      return t("assistant.composer.helper.idle");
  }
}

export function AssistantComposer({
  value,
  onChange,
  onSubmit,
  state = "idle",
  disabled = false,
  placeholder,
  submitLabel,
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
  const resolvedPlaceholder =
    placeholder ?? t("assistant.composer.placeholder");
  const resolvedSubmitLabel = submitLabel ?? t("assistant.composer.submit");

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
              {t("assistant.composer.title")}
            </strong>
          </div>
          <Pill theme={assistantTheme} tone={assistantStatusTone(state)}>
            {t(assistantStateLabel(state))}
          </Pill>
        </div>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
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
          <div style={assistantMutedTextStyle}>{helperCopy(state, t)}</div>
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
            {isBusy ? t("assistant.composer.waiting") : resolvedSubmitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
