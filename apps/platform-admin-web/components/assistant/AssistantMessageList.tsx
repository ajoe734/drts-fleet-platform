"use client";

import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  LoaderCircle,
  User,
} from "lucide-react";
import { CanvasPill as Pill } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import { AssistantActionPlanCard } from "./AssistantActionPlanCard";
import { AssistantConfirmationPanel } from "./AssistantConfirmationPanel";
import { AssistantReceiptCard } from "./AssistantReceiptCard";
import {
  assistantCardStyle,
  assistantMutedTextStyle,
  assistantStatusTone,
  assistantTheme,
  type AssistantMessageRecord,
} from "./assistant-types";

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const bubbleStyle: CSSProperties = {
  ...assistantCardStyle,
  padding: 16,
  display: "grid",
  gap: 12,
};

function roleMeta(
  role: AssistantMessageRecord["role"],
  t: (key: string) => string,
) {
  switch (role) {
    case "user":
      return {
        label: t("assistant.message.role.user"),
        icon: <User size={16} color={assistantTheme.text} />,
        align: "end" as const,
        background: assistantTheme.accentBg,
      };
    case "system":
      return {
        label: t("assistant.message.role.system"),
        icon: <CheckCircle2 size={16} color={assistantTheme.info} />,
        align: "start" as const,
        background: assistantTheme.surfaceLo,
      };
    case "assistant":
    default:
      return {
        label: t("assistant.message.role.assistant"),
        icon: <Bot size={16} color={assistantTheme.accent} />,
        align: "start" as const,
        background: assistantTheme.surface,
      };
  }
}

function stateBanner(
  message: AssistantMessageRecord,
  t: (key: string) => string,
) {
  switch (message.state) {
    case "thinking":
      return {
        tone: "info" as const,
        icon: <LoaderCircle size={15} className="animate-spin" />,
        text: t("assistant.message.banner.thinking"),
      };
    case "planning":
      return {
        tone: "info" as const,
        icon: <LoaderCircle size={15} className="animate-spin" />,
        text: t("assistant.message.banner.planning"),
      };
    case "awaiting_confirmation":
      return {
        tone: "warn" as const,
        icon: <AlertTriangle size={15} />,
        text: t("assistant.message.banner.awaitingConfirmation"),
      };
    case "executing":
      return {
        tone: "accent" as const,
        icon: <LoaderCircle size={15} className="animate-spin" />,
        text: t("assistant.message.banner.executing"),
      };
    case "receipt":
      return {
        tone: "success" as const,
        icon: <CheckCircle2 size={15} />,
        text: t("assistant.message.banner.receipt"),
      };
    case "error":
      if (!message.error) {
        return {
          tone: "danger" as const,
          icon: <AlertTriangle size={15} />,
          text: t("assistant.message.banner.error"),
        };
      }
      return {
        tone: "danger" as const,
        icon: <AlertTriangle size={15} />,
        text: message.error.title ?? t("assistant.message.banner.error"),
      };
    case "idle":
    default:
      return null;
  }
}

export function AssistantMessageList({
  messages,
  isConfirming = false,
  onConfirmAction,
  onCancelConfirmation,
  emptyTitle = "Platform Admin assistant is ready",
  emptyBody = "Ask for an analysis, review a plan, or approve a governed action to start the conversation.",
}: {
  messages: AssistantMessageRecord[];
  isConfirming?: boolean;
  onConfirmAction?: (messageId: string, reason: string) => void | Promise<void>;
  onCancelConfirmation?: (messageId: string) => void;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const { t } = useTranslation();

  if (messages.length === 0) {
    const resolvedEmptyTitle =
      emptyTitle === "Platform Admin assistant is ready"
        ? t("assistant.message.empty.title")
        : emptyTitle;
    const resolvedEmptyBody =
      emptyBody ===
      "Ask for an analysis, review a plan, or approve a governed action to start the conversation."
        ? t("assistant.message.empty.body")
        : emptyBody;

    return (
      <section
        style={{
          ...assistantCardStyle,
          padding: "34px 24px",
          textAlign: "center",
          display: "grid",
          gap: 10,
          placeItems: "center",
        }}
      >
        <Bot size={28} color={assistantTheme.accent} />
        <strong style={{ color: assistantTheme.text, fontSize: 17 }}>
          {resolvedEmptyTitle}
        </strong>
        <div style={{ ...assistantMutedTextStyle, maxWidth: 560 }}>
          {resolvedEmptyBody}
        </div>
      </section>
    );
  }

  return (
    <div style={stackStyle}>
      {messages.map((message) => {
        const meta = roleMeta(message.role, t);
        const banner = stateBanner(message, t);

        return (
          <article
            key={message.id}
            style={{
              display: "grid",
              gap: 10,
              justifyItems: meta.align,
            }}
          >
            <div
              style={{
                ...bubbleStyle,
                width: "min(100%, 820px)",
                background: meta.background,
              }}
            >
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
                  {meta.icon}
                  <strong style={{ color: assistantTheme.text, fontSize: 13 }}>
                    {meta.label}
                  </strong>
                </div>
                {message.state ? (
                  <Pill
                    theme={assistantTheme}
                    tone={assistantStatusTone(message.state)}
                  >
                    {t(`assistant.state.${message.state}`)}
                  </Pill>
                ) : null}
              </div>

              <div
                style={{
                  color: assistantTheme.text,
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {message.content}
              </div>

              {banner ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${
                      banner.tone === "danger"
                        ? assistantTheme.dangerBorder
                        : banner.tone === "warn"
                          ? assistantTheme.warnBorder
                          : banner.tone === "success"
                            ? assistantTheme.successBorder
                            : assistantTheme.infoBorder
                    }`,
                    background:
                      banner.tone === "danger"
                        ? assistantTheme.dangerBg
                        : banner.tone === "warn"
                          ? assistantTheme.warnBg
                          : banner.tone === "success"
                            ? assistantTheme.successBg
                            : banner.tone === "accent"
                              ? assistantTheme.accentBg
                              : assistantTheme.infoBg,
                    color:
                      banner.tone === "danger"
                        ? assistantTheme.danger
                        : banner.tone === "warn"
                          ? assistantTheme.warn
                          : banner.tone === "success"
                            ? assistantTheme.success
                            : banner.tone === "accent"
                              ? assistantTheme.accent
                              : assistantTheme.info,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  {banner.icon}
                  {banner.text}
                </div>
              ) : null}

              {message.plan ? (
                <AssistantActionPlanCard plan={message.plan} />
              ) : null}

              {message.confirmation && onConfirmAction ? (
                <AssistantConfirmationPanel
                  request={message.confirmation}
                  isSubmitting={isConfirming}
                  onConfirm={(reason) => onConfirmAction(message.id, reason)}
                  {...(onCancelConfirmation
                    ? {
                        onCancel: () => onCancelConfirmation(message.id),
                      }
                    : {})}
                />
              ) : null}

              {message.receipt ? (
                <AssistantReceiptCard receipt={message.receipt} />
              ) : null}

              {message.error ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${assistantTheme.dangerBorder}`,
                    background: assistantTheme.dangerBg,
                    color: assistantTheme.danger,
                    padding: "12px 14px",
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <strong style={{ fontSize: 13.5 }}>
                    {message.error.title ?? t("assistant.message.error.title")}
                  </strong>
                  <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    {message.error.message}
                  </div>
                  {message.error.hint ? (
                    <div style={{ fontSize: 12 }}>{message.error.hint}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
