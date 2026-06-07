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

function roleMeta(role: AssistantMessageRecord["role"]) {
  switch (role) {
    case "user":
      return {
        label: "Operator",
        icon: <User size={16} color={assistantTheme.text} />,
        align: "end" as const,
        background: assistantTheme.accentBg,
      };
    case "system":
      return {
        label: "System",
        icon: <CheckCircle2 size={16} color={assistantTheme.info} />,
        align: "start" as const,
        background: assistantTheme.surfaceLo,
      };
    case "assistant":
    default:
      return {
        label: "Assistant",
        icon: <Bot size={16} color={assistantTheme.accent} />,
        align: "start" as const,
        background: assistantTheme.surface,
      };
  }
}

export function AssistantMessageList({
  messages,
  isConfirming = false,
  onConfirmAction,
  onCancelConfirmation,
  emptyTitle,
  emptyBody,
}: {
  messages: AssistantMessageRecord[];
  isConfirming?: boolean;
  onConfirmAction?: (messageId: string, reason: string) => void | Promise<void>;
  onCancelConfirmation?: (messageId: string) => void;
  emptyTitle?: string;
  emptyBody?: string;
}) {
  const { locale } = useTranslation();
  const copy =
    locale === "zh"
      ? {
          emptyTitleFallback: "平台管理助理已就緒",
          emptyBodyFallback:
            "詢問分析、檢查治理計畫，或核准一個平台治理動作來開始對話。",
          roleLabel: (role: AssistantMessageRecord["role"]) =>
            ({
              assistant: "助理",
              system: "系統",
              user: "操作人",
            })[role],
          stateLabel: (state: NonNullable<AssistantMessageRecord["state"]>) =>
            ({
              awaiting_confirmation: "等待確認",
              error: "錯誤",
              executing: "執行中",
              idle: "待命",
              planning: "規劃中",
              receipt: "已完成",
              thinking: "思考中",
            })[state],
          banner: (message: AssistantMessageRecord) => {
            switch (message.state) {
              case "thinking":
                return {
                  tone: "info" as const,
                  icon: <LoaderCircle size={15} className="animate-spin" />,
                  text: "助理正在分析目前的平台頁面脈絡。",
                };
              case "planning":
                return {
                  tone: "info" as const,
                  icon: <LoaderCircle size={15} className="animate-spin" />,
                  text: "助理正在整理可供檢視的治理行動計畫。",
                };
              case "awaiting_confirmation":
                return {
                  tone: "warn" as const,
                  icon: <AlertTriangle size={15} />,
                  text: "執行已暫停，等待操作人確認這個動作。",
                };
              case "executing":
                return {
                  tone: "accent" as const,
                  icon: <LoaderCircle size={15} className="animate-spin" />,
                  text: "助理正在執行已核准的動作。",
                };
              case "receipt":
                return {
                  tone: "success" as const,
                  icon: <CheckCircle2 size={15} />,
                  text: "執行已完成，且已記錄收據。",
                };
              case "error":
                return {
                  tone: "danger" as const,
                  icon: <AlertTriangle size={15} />,
                  text: message.error?.title ?? "執行錯誤",
                };
              case "idle":
              default:
                return null;
            }
          },
          errorFallback: "助理錯誤",
        }
      : {
          emptyTitleFallback: "Platform Admin assistant is ready",
          emptyBodyFallback:
            "Ask for an analysis, review a plan, or approve a governed action to start the conversation.",
          roleLabel: (role: AssistantMessageRecord["role"]) =>
            ({
              assistant: "Assistant",
              system: "System",
              user: "Operator",
            })[role],
          stateLabel: (state: NonNullable<AssistantMessageRecord["state"]>) =>
            state === "awaiting_confirmation"
              ? "awaiting confirmation"
              : state.replaceAll("_", " "),
          banner: (message: AssistantMessageRecord) => {
            switch (message.state) {
              case "thinking":
                return {
                  tone: "info" as const,
                  icon: <LoaderCircle size={15} className="animate-spin" />,
                  text: "Assistant is analyzing current platform context.",
                };
              case "planning":
                return {
                  tone: "info" as const,
                  icon: <LoaderCircle size={15} className="animate-spin" />,
                  text: "Assistant is preparing a governed action plan for review.",
                };
              case "awaiting_confirmation":
                return {
                  tone: "warn" as const,
                  icon: <AlertTriangle size={15} />,
                  text: "Execution is paused until an operator confirms the action.",
                };
              case "executing":
                return {
                  tone: "accent" as const,
                  icon: <LoaderCircle size={15} className="animate-spin" />,
                  text: "Assistant is executing the approved action.",
                };
              case "receipt":
                return {
                  tone: "success" as const,
                  icon: <CheckCircle2 size={15} />,
                  text: "Execution completed and a receipt has been recorded.",
                };
              case "error":
                return {
                  tone: "danger" as const,
                  icon: <AlertTriangle size={15} />,
                  text: message.error?.title ?? "Execution error",
                };
              case "idle":
              default:
                return null;
            }
          },
          errorFallback: "Assistant error",
        };

  if (messages.length === 0) {
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
          {emptyTitle ?? copy.emptyTitleFallback}
        </strong>
        <div style={{ ...assistantMutedTextStyle, maxWidth: 560 }}>
          {emptyBody ?? copy.emptyBodyFallback}
        </div>
      </section>
    );
  }

  return (
    <div style={stackStyle}>
      {messages.map((message) => {
        const meta = roleMeta(message.role);
        const banner = copy.banner(message);

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
                    {copy.roleLabel(message.role)}
                  </strong>
                </div>
                {message.state ? (
                  <Pill
                    theme={assistantTheme}
                    tone={assistantStatusTone(message.state)}
                  >
                    {copy.stateLabel(message.state)}
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
                    {message.error.title ?? copy.errorFallback}
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
