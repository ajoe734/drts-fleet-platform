"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { CanvasIcon, buildCanvasTheme } from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import {
  ASSISTANT_HEADER_HEIGHT,
  useAssistantWindow,
} from "./use-assistant-window";
import { useMockStream } from "./use-mock-stream";
import type { AssistantMessage } from "./types";

const Z_INDEX = 2147483000;
const DOCK_WIDTH = 384;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

// Module-level guard so only one widget instance ever renders, even if the
// component is accidentally mounted in more than one place.
let activeInstances = 0;

function useSingleInstance(): boolean {
  const [isPrimary, setIsPrimary] = useState(false);
  useEffect(() => {
    activeInstances += 1;
    setIsPrimary(activeInstances === 1);
    return () => {
      activeInstances -= 1;
    };
  }, []);
  return isPrimary;
}

function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: Parameters<typeof CanvasIcon>[0]["name"];
  label: string;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      style={{
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 7,
        border: "1px solid transparent",
        background: hover ? theme.surfaceHi : "transparent",
        color: hover ? theme.text : theme.textMuted,
        cursor: "pointer",
        padding: 0,
      }}
    >
      <CanvasIcon name={icon} size={15} />
    </button>
  );
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "84%",
          padding: "8px 11px",
          borderRadius: 10,
          fontSize: 12.5,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          background: isUser ? theme.accentBg : theme.surfaceLo,
          color: isUser ? theme.accent : theme.text,
          border: `1px solid ${isUser ? theme.accentBorder : theme.border}`,
        }}
      >
        {message.content}
        {message.streaming ? (
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: 7,
              height: 14,
              marginLeft: 2,
              verticalAlign: "text-bottom",
              background: theme.accent,
              borderRadius: 1,
              opacity: 0.7,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

export function OpsAssistant() {
  const isPrimary = useSingleInstance();
  const { t } = useTranslation();
  const window_ = useAssistantWindow();
  const {
    mode,
    position,
    size,
    ready,
    isDragging,
    isResizing,
    open,
    close,
    minimize,
    toggleDock,
    onDragPointerDown,
    onResizePointerDown,
    nudgePosition,
    nudgeSize,
    keyboardStep,
  } = window_;

  const { messages, isStreaming, send } = useMockStream(
    t("assistant.greeting"),
  );
  const [draft, setDraft] = useState("");

  const dialogId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const isExpanded = mode === "floating" || mode === "docked";

  // Focus the composer when the window opens / docks.
  useEffect(() => {
    if (isExpanded) {
      inputRef.current?.focus();
    }
  }, [isExpanded]);

  // Keep the conversation scrolled to the latest message/token.
  useEffect(() => {
    if (isExpanded) {
      logEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, isExpanded]);

  const submitDraft = useCallback(() => {
    if (!draft.trim()) {
      return;
    }
    send(draft);
    setDraft("");
  }, [draft, send]);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitDraft();
      }
    },
    [submitDraft],
  );

  const handleMoveKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (mode !== "floating") {
        return;
      }
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -keyboardStep],
        ArrowDown: [0, keyboardStep],
        ArrowLeft: [-keyboardStep, 0],
        ArrowRight: [keyboardStep, 0],
      };
      const delta = map[event.key];
      if (delta) {
        event.preventDefault();
        nudgePosition(delta[0], delta[1]);
      }
    },
    [keyboardStep, mode, nudgePosition],
  );

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const map: Record<string, [number, number]> = {
        ArrowUp: [0, -keyboardStep],
        ArrowDown: [0, keyboardStep],
        ArrowLeft: [-keyboardStep, 0],
        ArrowRight: [keyboardStep, 0],
      };
      const delta = map[event.key];
      if (delta) {
        event.preventDefault();
        nudgeSize(delta[0], delta[1]);
      }
    },
    [keyboardStep, nudgeSize],
  );

  const handleShellKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        minimize();
      }
    },
    [minimize],
  );

  if (!isPrimary || !ready) {
    return null;
  }

  const portalTarget = document.body;

  // ── Launcher (closed) ───────────────────────────────────────────────
  if (mode === "closed") {
    return createPortal(
      <div
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: Z_INDEX,
        }}
      >
        <button
          type="button"
          onClick={open}
          aria-label={t("assistant.open")}
          aria-haspopup="dialog"
          title={t("assistant.open")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            height: 44,
            padding: "0 16px",
            borderRadius: 22,
            border: `1px solid ${theme.accentBorder}`,
            background: `linear-gradient(135deg, ${theme.accent}, ${theme.accentHi})`,
            color: theme.invert,
            fontFamily: theme.fontFamily,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: theme.shadow,
          }}
        >
          <CanvasIcon name="cmdk" size={16} />
          {t("assistant.title")}
        </button>
      </div>,
      portalTarget,
    );
  }

  // ── Minimized (collapsed pill) ──────────────────────────────────────
  if (mode === "minimized") {
    return createPortal(
      <div
        style={{ position: "fixed", right: 20, bottom: 20, zIndex: Z_INDEX }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: 40,
            padding: "0 8px 0 14px",
            borderRadius: 20,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.shadow,
            color: theme.text,
            fontFamily: theme.fontFamily,
          }}
        >
          <button
            type="button"
            onClick={open}
            aria-label={t("assistant.restore")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "transparent",
              border: "none",
              color: theme.text,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              padding: 0,
            }}
          >
            <CanvasIcon name="cmdk" size={15} style={{ color: theme.accent }} />
            {t("assistant.title")}
            {isStreaming ? (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: theme.accent,
                }}
              />
            ) : null}
          </button>
          <IconButton icon="x" label={t("assistant.close")} onClick={close} />
        </div>
      </div>,
      portalTarget,
    );
  }

  // ── Floating / docked window ────────────────────────────────────────
  const docked = mode === "docked";
  const frameStyle: CSSProperties = docked
    ? {
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: DOCK_WIDTH,
        borderRadius: 0,
        borderRight: "none",
        borderTop: "none",
        borderBottom: "none",
      }
    : {
        position: "fixed",
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        borderRadius: 12,
      };

  return createPortal(
    // Full-viewport overlay is click-through (pointer-events: none); only the
    // window itself is interactive, so the console stays usable behind it.
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_INDEX,
        pointerEvents: "none",
      }}
    >
      <section
        role="dialog"
        aria-modal="false"
        aria-label={t("assistant.title")}
        aria-describedby={`${dialogId}-log`}
        onKeyDown={handleShellKeyDown}
        style={{
          display: "flex",
          flexDirection: "column",
          background: theme.surface,
          border: `1px solid ${theme.borderStrong}`,
          boxShadow: theme.shadow,
          color: theme.text,
          fontFamily: theme.fontFamily,
          overflow: "hidden",
          pointerEvents: "auto",
          userSelect: isDragging || isResizing ? "none" : "auto",
          ...frameStyle,
        }}
      >
        {/* Title bar — drag handle (floating) + keyboard move target */}
        <header
          onPointerDown={docked ? undefined : onDragPointerDown}
          onKeyDown={handleMoveKeyDown}
          role={docked ? undefined : "button"}
          tabIndex={docked ? undefined : 0}
          aria-label={docked ? undefined : t("assistant.move")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: ASSISTANT_HEADER_HEIGHT,
            padding: "0 8px 0 12px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.surfaceHi,
            cursor: docked ? "default" : isDragging ? "grabbing" : "grab",
            flexShrink: 0,
            touchAction: "none",
          }}
        >
          <CanvasIcon name="cmdk" size={15} style={{ color: theme.accent }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t("assistant.title")}
            </span>
            <span
              style={{
                fontSize: 10,
                color: theme.textMuted,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {t("assistant.subtitle")}
            </span>
          </div>
          <IconButton
            icon={docked ? "ext" : "pin"}
            label={docked ? t("assistant.undock") : t("assistant.dock")}
            onClick={toggleDock}
          />
          <IconButton
            icon="chevD"
            label={t("assistant.minimize")}
            onClick={minimize}
          />
          <IconButton icon="x" label={t("assistant.close")} onClick={close} />
        </header>

        {/* Conversation log */}
        <div
          id={`${dialogId}-log`}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label={t("assistant.messageLog")}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: theme.bg,
          }}
        >
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Composer */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            padding: 10,
            borderTop: `1px solid ${theme.border}`,
            background: theme.surface,
            flexShrink: 0,
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            rows={1}
            placeholder={t("assistant.inputPlaceholder")}
            aria-label={t("assistant.inputPlaceholder")}
            style={{
              flex: 1,
              resize: "none",
              maxHeight: 96,
              padding: "8px 10px",
              borderRadius: 8,
              border: `1px solid ${theme.border}`,
              background: theme.bgRaised,
              color: theme.text,
              fontFamily: theme.fontFamily,
              fontSize: 12.5,
              lineHeight: 1.4,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={submitDraft}
            disabled={!draft.trim() || isStreaming}
            aria-label={t("assistant.send")}
            title={t("assistant.send")}
            style={{
              width: 34,
              height: 34,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              border: `1px solid ${theme.accent}`,
              background: theme.accent,
              color: theme.invert,
              cursor: !draft.trim() || isStreaming ? "not-allowed" : "pointer",
              opacity: !draft.trim() || isStreaming ? 0.5 : 1,
              flexShrink: 0,
              padding: 0,
            }}
          >
            <CanvasIcon name="arrow" size={16} />
          </button>
        </div>

        {/* Resize handle (floating only) */}
        {docked ? null : (
          <div
            role="button"
            tabIndex={0}
            aria-label={t("assistant.resize")}
            onPointerDown={onResizePointerDown}
            onKeyDown={handleResizeKeyDown}
            style={{
              position: "absolute",
              right: 0,
              bottom: 0,
              width: 18,
              height: 18,
              cursor: "nwse-resize",
              touchAction: "none",
              color: theme.textDim,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-end",
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M11 4L4 11M11 8L8 11"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </section>
    </div>,
    portalTarget,
  );
}
