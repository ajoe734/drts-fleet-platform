"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionIntent, ResourceActionDescriptor } from "@drts/contracts";
import { buildCanvasTheme, CanvasIcon } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import {
  useOpsAssistantActionBridge,
  useOpsAssistantContext,
} from "./assistant-context-provider";
import {
  buildAssistantActions,
  resolveAssistantActionHref,
  type AssistantAction,
} from "./assistant-actions";
import { buildTier0HelpResult, buildTier1ScopedResult } from "./help-search";
import type { AssistantActionReceipt } from "./context-envelope";

type DockSide = "free" | "left" | "right";

type WidgetState = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
  docked: DockSide;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type StreamState = {
  activeIndex: number;
  visibleChars: number;
};

type ConversationEntry = {
  id: string;
  author: "assistant" | "operator" | "system";
  tone: "neutral" | "accent" | "success" | "danger";
  message: string;
  meta?: string;
  auditHref?: string | null;
};

const STORAGE_KEY = "ops-console.assistant-widget.v1";
const WIDGET_MIN_WIDTH = 320;
const WIDGET_MIN_HEIGHT = 240;
const WIDGET_MAX_WIDTH = 560;
const WIDGET_MAX_HEIGHT = 720;
const HEADER_HEIGHT = 48;
const MINIMIZED_HEIGHT = 64;
const EDGE_GAP = 20;
const MOVE_STEP = 24;
const RESIZE_STEP = 24;
const STREAM_TICK_MS = 42;
const STREAM_PAUSE_MS = 1500;
const FORCE_DEGRADED_KEY = "ops-console.assistant.force-degraded";
const FORCE_DISABLED_KEY = "ops-console.assistant.force-disabled";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const STREAM_MESSAGES = [
  "Assistant shell online. Monitoring dispatch exceptions, handoff notes, and queue pressure.",
  "Mock stream active. Replace this source with the real assistant transport when the API contract lands.",
  "Widget state persists locally so operators keep position, dock choice, and density across route changes.",
];

function getViewportRect() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function buildDefaultState(viewport = getViewportRect()): WidgetState {
  const width = 420;
  const height = 360;
  return {
    width,
    height,
    x: Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP),
    y: Math.max(72, viewport.height - height - EDGE_GAP),
    minimized: false,
    closed: false,
    docked: "right",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampRect(rect: Rect, viewport = getViewportRect()): Rect {
  const width = clamp(
    rect.width,
    WIDGET_MIN_WIDTH,
    Math.min(WIDGET_MAX_WIDTH, viewport.width - EDGE_GAP * 2),
  );
  const height = clamp(
    rect.height,
    WIDGET_MIN_HEIGHT,
    Math.min(WIDGET_MAX_HEIGHT, viewport.height - EDGE_GAP * 2),
  );
  const maxX = Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP);
  const maxY = Math.max(EDGE_GAP, viewport.height - height - EDGE_GAP);

  return {
    x: clamp(rect.x, EDGE_GAP, maxX),
    y: clamp(rect.y, EDGE_GAP, maxY),
    width,
    height,
  };
}

function resolveDockedPosition(
  docked: DockSide,
  rect: Rect,
  viewport = getViewportRect(),
): Rect {
  const next = clampRect(rect, viewport);
  if (docked === "left") {
    return { ...next, x: EDGE_GAP };
  }
  if (docked === "right") {
    return {
      ...next,
      x: Math.max(EDGE_GAP, viewport.width - next.width - EDGE_GAP),
    };
  }
  return next;
}

function readStoredState(): WidgetState | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<WidgetState>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number"
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      width: parsed.width,
      height: parsed.height,
      minimized: parsed.minimized ?? false,
      closed: parsed.closed ?? false,
      docked:
        parsed.docked === "left" || parsed.docked === "right"
          ? parsed.docked
          : "free",
    };
  } catch {
    return null;
  }
}

function writeStoredState(state: WidgetState) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isAssistantEnabled() {
  if (process.env.NEXT_PUBLIC_OPS_ASSISTANT_ENABLED === "false") {
    return false;
  }
  if (typeof window === "undefined") {
    return true;
  }
  return window.localStorage.getItem(FORCE_DISABLED_KEY) !== "true";
}

function isForcedDegraded() {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_OPS_ASSISTANT_DEGRADED === "true";
  }
  return (
    process.env.NEXT_PUBLIC_OPS_ASSISTANT_DEGRADED === "true" ||
    window.localStorage.getItem(FORCE_DEGRADED_KEY) === "true"
  );
}

function ActionButton({
  label,
  icon,
  pressed,
  onClick,
}: {
  label: string;
  icon: "minus" | "pin" | "chevR" | "arrow" | "x";
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      style={{
        width: 28,
        height: 28,
        borderRadius: 8,
        border: `1px solid ${pressed ? theme.accentBorder : theme.border}`,
        background: pressed ? theme.accentBg : theme.surfaceLo,
        color: pressed ? theme.accentHi : theme.textMuted,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        cursor: "pointer",
      }}
    >
      <CanvasIcon
        name={icon === "minus" ? "more" : icon}
        size={14}
        style={{ transform: icon === "minus" ? "rotate(90deg)" : undefined }}
      />
    </button>
  );
}

export function OpsAssistantWidget() {
  if (!isAssistantEnabled()) {
    return null;
  }

  const router = useRouter();
  const context = useOpsAssistantContext();
  const actionBridge = useOpsAssistantActionBridge();
  const titleId = useId();
  const instructionsId = useId();
  const liveRegionId = useId();
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    rect: Rect;
  } | null>(null);
  const resizeStateRef = useRef<{
    startX: number;
    startY: number;
    rect: Rect;
  } | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  const [widget, setWidget] = useState<WidgetState>(() => buildDefaultState());
  const [stream, setStream] = useState<StreamState>({
    activeIndex: 0,
    visibleChars: 0,
  });
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [pendingIntent, setPendingIntent] = useState<ActionIntent | null>(null);
  const [isProposing, setIsProposing] = useState(false);
  const [isExecutingIntent, setIsExecutingIntent] = useState(false);
  const [draft, setDraft] = useState("");
  const actions = useMemo(() => buildAssistantActions(context), [context]);

  const activeMessage = STREAM_MESSAGES[stream.activeIndex] ?? "";

  const appendConversation = useEffectEvent((entry: ConversationEntry) => {
    setConversation((current) => [...current.slice(-9), entry]);
  });

  useEffect(() => {
    const node = document.createElement("div");
    node.setAttribute("data-ops-assistant-root", "true");
    document.body.appendChild(node);
    setPortalNode(node);

    const stored = readStoredState();
    const nextState = stored ?? buildDefaultState();
    const dockedRect = resolveDockedPosition(nextState.docked, nextState);
    setWidget({
      ...nextState,
      ...dockedRect,
    });

    return () => {
      document.body.removeChild(node);
    };
  }, []);

  useEffect(() => {
    if (!portalNode) {
      return;
    }
    writeStoredState(widget);
  }, [portalNode, widget]);

  useEffect(() => {
    const handleResize = () => {
      setWidget((current) => {
        const nextRect = resolveDockedPosition(current.docked, current);
        if (
          nextRect.x === current.x &&
          nextRect.y === current.y &&
          nextRect.width === current.width &&
          nextRect.height === current.height
        ) {
          return current;
        }
        return { ...current, ...nextRect };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => {
        setStream((current) => {
          const message = STREAM_MESSAGES[current.activeIndex] ?? "";
          if (current.visibleChars < message.length) {
            return {
              ...current,
              visibleChars: current.visibleChars + 1,
            };
          }
          return {
            activeIndex: (current.activeIndex + 1) % STREAM_MESSAGES.length,
            visibleChars: 0,
          };
        });
      },
      stream.visibleChars < activeMessage.length
        ? STREAM_TICK_MS
        : STREAM_PAUSE_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [activeMessage.length, stream]);

  const clearPointerInteraction = useEffectEvent(() => {
    dragStateRef.current = null;
    resizeStateRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  });

  const handlePointerMove = useEffectEvent((event: PointerEvent) => {
    if (dragStateRef.current) {
      const { startX, startY, rect } = dragStateRef.current;
      const nextRect = resolveDockedPosition("free", {
        ...rect,
        x: rect.x + (event.clientX - startX),
        y: rect.y + (event.clientY - startY),
      });
      setWidget((current) => ({
        ...current,
        ...nextRect,
        docked: "free",
        closed: false,
      }));
      return;
    }

    if (resizeStateRef.current) {
      const { startX, startY, rect } = resizeStateRef.current;
      const viewport = getViewportRect();
      const nextRect = resolveDockedPosition(
        widget.docked,
        {
          ...rect,
          width: rect.width + (event.clientX - startX),
          height: rect.height + (event.clientY - startY),
        },
        viewport,
      );

      setWidget((current) => ({
        ...current,
        width: nextRect.width,
        height: nextRect.height,
        ...(current.docked === "free"
          ? {
              x: clamp(
                current.x,
                EDGE_GAP,
                viewport.width - nextRect.width - EDGE_GAP,
              ),
            }
          : { x: nextRect.x }),
        y: clamp(
          current.y,
          EDGE_GAP,
          viewport.height - nextRect.height - EDGE_GAP,
        ),
      }));
    }
  });

  const handlePointerUp = useEffectEvent(() => {
    clearPointerInteraction();
  });

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const setDock = (docked: DockSide) => {
    setWidget((current) => {
      const nextRect = resolveDockedPosition(docked, current);
      return {
        ...current,
        ...nextRect,
        docked,
        closed: false,
      };
    });
  };

  const moveBy = (dx: number, dy: number) => {
    setWidget((current) => {
      const nextRect = resolveDockedPosition(
        current.docked === "free" ? "free" : current.docked,
        {
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        },
      );
      return {
        ...current,
        ...nextRect,
        docked: current.docked === "free" ? "free" : current.docked,
      };
    });
  };

  const resizeBy = (dw: number, dh: number) => {
    setWidget((current) => {
      const nextRect = resolveDockedPosition(current.docked, {
        ...current,
        width: current.width + dw,
        height: current.height + dh,
      });
      return {
        ...current,
        ...nextRect,
      };
    });
  };

  const onDragPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      rect: {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height,
      },
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    resizeStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      rect: {
        x: widget.x,
        y: widget.y,
        width: widget.width,
        height: widget.height,
      },
    };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  };

  const onHeaderKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveBy(-MOVE_STEP, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveBy(MOVE_STEP, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveBy(0, -MOVE_STEP);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveBy(0, MOVE_STEP);
        break;
      case "Home":
        event.preventDefault();
        setDock("left");
        break;
      case "End":
        event.preventDefault();
        setDock("right");
        break;
      case "Escape":
        event.preventDefault();
        setWidget((current) => ({ ...current, closed: true }));
        break;
      default:
        break;
    }
  };

  const onResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        resizeBy(-RESIZE_STEP, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        resizeBy(RESIZE_STEP, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        resizeBy(0, -RESIZE_STEP);
        break;
      case "ArrowDown":
        event.preventDefault();
        resizeBy(0, RESIZE_STEP);
        break;
      default:
        break;
    }
  };

  const handleAction = (action: AssistantAction) => {
    const href = resolveAssistantActionHref(action);
    if (action.kind === "cross_app") {
      window.open(href, "_blank", "noopener,noreferrer");
      return;
    }
    router.push(href);
  };

  const describeIntent = (intent: ActionIntent) =>
    `${intent.resourceKind}:${intent.resourceId} · ${intent.action}`;

  const buildAlternatives = (descriptors: ResourceActionDescriptor[]) => {
    const alternatives = descriptors
      .filter((descriptor) => descriptor.enabled)
      .map((descriptor) => descriptor.action)
      .slice(0, 3);
    return alternatives.length > 0
      ? `Available: ${alternatives.join(", ")}`
      : "No enabled alternatives.";
  };

  const handleSubmitPrompt = () => {
    const query = draft.trim();
    if (!query) {
      return;
    }

    appendConversation({
      id: `${Date.now()}-operator-query`,
      author: "operator",
      tone: "neutral",
      message: query,
    });

    const scoped = buildTier1ScopedResult(context, actionBridge);
    const lowerQuery = query.toLowerCase();
    const wantsScopedAnswer =
      /scope|selected|current|available|action|actions|can i|what can/i.test(
        lowerQuery,
      );

    if (wantsScopedAnswer && scoped) {
      appendConversation({
        id: `${Date.now()}-scoped-answer`,
        author: "assistant",
        tone: "accent",
        message: scoped.message,
        meta: scoped.meta,
      });
      setDraft("");
      return;
    }

    const help = buildTier0HelpResult(query);
    appendConversation({
      id: `${Date.now()}-tier0-answer`,
      author: "assistant",
      tone: isForcedDegraded() ? "neutral" : "accent",
      message: isForcedDegraded()
        ? `LLM degraded. Showing curated help-search fallback.\n\n${help.message}`
        : help.message,
      meta: help.meta,
    });
    setDraft("");
  };

  async function handleProposeAction(action: ResourceActionDescriptor) {
    if (!actionBridge || isProposing) {
      return;
    }

    setIsProposing(true);
    try {
      const intent = await getOpsClient().post<ActionIntent>(
        "/api/assistant/tools/propose-action",
        {
          body: {
            resourceKind: actionBridge.resourceKind,
            resourceId: actionBridge.resourceId,
            action: action.action,
          },
        },
      );
      setPendingIntent(intent);
      appendConversation({
        id: `${Date.now()}-${intent.action}`,
        author: "assistant",
        tone: "accent",
        message: `Proposed ${intent.action} for ${intent.resourceKind} ${intent.resourceId}.`,
        meta: describeIntent(intent),
      });
    } catch (error) {
      appendConversation({
        id: `${Date.now()}-propose-error`,
        author: "system",
        tone: "danger",
        message:
          error instanceof Error
            ? error.message
            : "Assistant action proposal failed.",
      });
    } finally {
      setIsProposing(false);
    }
  }

  async function handleExecuteIntent() {
    if (!actionBridge || !pendingIntent || isExecutingIntent) {
      return;
    }

    const descriptor = actionBridge.resolveDescriptor(pendingIntent);
    if (!descriptor) {
      appendConversation({
        id: `${Date.now()}-unavailable`,
        author: "assistant",
        tone: "danger",
        message: `Unavailable action: ${pendingIntent.action}.`,
        meta: buildAlternatives(actionBridge.availableActions),
      });
      setPendingIntent(null);
      return;
    }

    if (!descriptor.enabled) {
      appendConversation({
        id: `${Date.now()}-disabled`,
        author: "assistant",
        tone: "danger",
        message: `Action blocked: ${descriptor.action}.`,
        meta: descriptor.disabledReasonCode
          ? `${descriptor.disabledReasonCode} · ${buildAlternatives(actionBridge.availableActions)}`
          : buildAlternatives(actionBridge.availableActions),
      });
      setPendingIntent(null);
      return;
    }

    setIsExecutingIntent(true);
    appendConversation({
      id: `${Date.now()}-execute`,
      author: "operator",
      tone: "neutral",
      message:
        descriptor.riskLevel === "low"
          ? `Executing ${descriptor.action}.`
          : `Opening ${descriptor.riskLevel}-risk confirmation for ${descriptor.action}.`,
      ...(descriptor.requiresReason || descriptor.riskLevel === "high"
        ? {
            meta: "Reason may be required by the existing page confirmation UI.",
          }
        : {}),
    });

    try {
      const receipt = await actionBridge.invoke(pendingIntent, descriptor);
      appendReceipt(receipt, descriptor.action);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Assistant action failed.";
      appendConversation({
        id: `${Date.now()}-execute-error`,
        author: "system",
        tone: message === "ASSISTANT_ACTION_CANCELLED" ? "neutral" : "danger",
        message:
          message === "ASSISTANT_ACTION_CANCELLED"
            ? "Action cancelled."
            : message,
      });
    } finally {
      setPendingIntent(null);
      setIsExecutingIntent(false);
    }
  }

  const appendReceipt = useEffectEvent(
    (receipt: AssistantActionReceipt, action: string) => {
      appendConversation({
        id: `${Date.now()}-${receipt.actionId}`,
        author: "assistant",
        tone: "success",
        message: receipt.message || `${action} completed.`,
        meta: `actionId ${receipt.actionId} · auditId ${receipt.auditId}`,
        auditHref:
          receipt.auditHref ??
          `/audit?auditId=${encodeURIComponent(receipt.auditId)}`,
      });
    },
  );

  if (!portalNode) {
    return null;
  }

  const shellStyle: CSSProperties = {
    position: "fixed",
    left: widget.x,
    top: widget.y,
    width: widget.width,
    height: widget.minimized ? MINIMIZED_HEIGHT : widget.height,
    zIndex: 5000,
    borderRadius: 18,
    background: theme.bgRaised,
    border: `1px solid ${theme.borderStrong}`,
    boxShadow: theme.shadow,
    color: theme.text,
    overflow: "hidden",
    display: widget.closed ? "none" : "grid",
    gridTemplateRows: `${HEADER_HEIGHT}px 1fr`,
    pointerEvents: "auto",
  };

  return createPortal(
    <>
      {widget.closed ? (
        <button
          type="button"
          data-testid="ops-assistant-launcher"
          aria-label="Open operations assistant"
          onClick={() =>
            setWidget((current) => ({ ...current, closed: false }))
          }
          style={{
            position: "fixed",
            right: EDGE_GAP,
            bottom: EDGE_GAP,
            zIndex: 5000,
            height: 48,
            padding: "0 16px",
            borderRadius: 999,
            border: `1px solid ${theme.accentBorder}`,
            background: theme.surface,
            color: theme.text,
            boxShadow: theme.shadow,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
          }}
        >
          <CanvasIcon name="callcenter" size={16} />
          <span style={{ fontSize: 13, fontWeight: 700 }}>Assistant</span>
        </button>
      ) : null}

      <section
        data-testid="ops-assistant-panel"
        role="region"
        aria-labelledby={titleId}
        aria-describedby={instructionsId}
        aria-live="off"
        style={shellStyle}
      >
        <div
          data-testid="ops-assistant-drag-handle"
          tabIndex={0}
          onPointerDown={onDragPointerDown}
          onKeyDown={onHeaderKeyDown}
          aria-label="Assistant widget header. Use arrow keys to move, Home or End to dock, Escape to close."
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 10px 0 14px",
            background: `linear-gradient(135deg, ${theme.surface}, ${theme.surfaceHi})`,
            borderBottom: `1px solid ${theme.border}`,
            cursor: "grab",
            outline: "none",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: theme.accentHi,
              boxShadow: `0 0 0 4px ${theme.accentBg}`,
            }}
          />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              id={titleId}
              style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.15 }}
            >
              Operations Assistant
            </div>
            <div
              style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.15 }}
            >
              Floating shell · mock stream · persistent layout
            </div>
          </div>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ActionButton
              label={
                widget.minimized ? "Expand assistant" : "Minimize assistant"
              }
              icon="minus"
              pressed={widget.minimized}
              onClick={() =>
                setWidget((current) => ({
                  ...current,
                  minimized: !current.minimized,
                  closed: false,
                }))
              }
            />
            <ActionButton
              label="Dock assistant to left edge"
              icon="pin"
              pressed={widget.docked === "left"}
              onClick={() =>
                setDock(widget.docked === "left" ? "free" : "left")
              }
            />
            <ActionButton
              label="Dock assistant to right edge"
              icon="arrow"
              pressed={widget.docked === "right"}
              onClick={() =>
                setDock(widget.docked === "right" ? "free" : "right")
              }
            />
            <ActionButton
              label="Close assistant"
              icon="x"
              onClick={() =>
                setWidget((current) => ({ ...current, closed: true }))
              }
            />
          </div>
        </div>

        {!widget.minimized ? (
          <div
            style={{
              minHeight: 0,
              display: "grid",
              gridTemplateRows: "1fr auto",
              background: `linear-gradient(180deg, ${theme.bgRaised} 0%, ${theme.surfaceLo} 100%)`,
            }}
          >
            <div
              style={{
                padding: 14,
                overflow: "auto",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 11, color: theme.textDim }}>
                    Session
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: theme.success,
                      background: theme.successBg,
                      border: `1px solid ${theme.successBorder}`,
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    online
                  </span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  <MessageBubble
                    tone="neutral"
                    author="System"
                    message="Queue scan complete. No active blocking incidents in the shell frame."
                  />
                  <MessageBubble
                    tone="accent"
                    author="Assistant"
                    message={activeMessage.slice(0, stream.visibleChars)}
                    liveRegionId={liveRegionId}
                  />
                </div>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  Action bridge
                </div>
                {actionBridge ? (
                  <>
                    <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                      {`${actionBridge.resourceKind}:${actionBridge.resourceId}`}
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {actionBridge.availableActions.map((action) => (
                        <button
                          key={`assistant-action:${action.action}`}
                          type="button"
                          data-testid={`ops-assistant-action-${action.action}`}
                          disabled={isProposing || isExecutingIntent}
                          onClick={() => void handleProposeAction(action)}
                          style={actionButtonStyle}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "center",
                            }}
                          >
                            <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                              {action.action}
                            </span>
                            <span
                              style={{
                                fontSize: 10.5,
                                color: theme.textDim,
                              }}
                            >
                              {formatOpsCodeLabel(
                                context?.locale ?? "en",
                                action.riskLevel,
                              )}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              color: theme.textMuted,
                              textAlign: "left",
                              lineHeight: 1.45,
                            }}
                          >
                            {action.enabled
                              ? action.requiresReason
                                ? "Existing confirmation flow requires a reason."
                                : "Resolve via availableActions, then reuse the existing page action flow."
                              : `Disabled: ${action.disabledReasonCode ?? "unavailable"}`}
                          </span>
                        </button>
                      ))}
                    </div>
                    {pendingIntent ? (
                      <div
                        style={{
                          borderRadius: 10,
                          border: `1px solid ${theme.accentBorder}`,
                          background: theme.accentBg,
                          padding: 10,
                          display: "grid",
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 12.5, color: theme.text }}>
                          {`Pending intent · ${pendingIntent.action}`}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            lineHeight: 1.45,
                          }}
                        >
                          {describeIntent(pendingIntent)}
                        </span>
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          <button
                            type="button"
                            data-testid="ops-assistant-open-confirmation"
                            disabled={isExecutingIntent}
                            onClick={() => void handleExecuteIntent()}
                            style={primaryAssistButtonStyle}
                          >
                            {isExecutingIntent
                              ? "Working..."
                              : "Open confirmation"}
                          </button>
                          <button
                            type="button"
                            disabled={isExecutingIntent}
                            onClick={() => setPendingIntent(null)}
                            style={secondaryAssistButtonStyle}
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div
                    style={{
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      padding: "10px 12px",
                      background: theme.surfaceLo,
                      fontSize: 12,
                      color: theme.textMuted,
                      lineHeight: 1.45,
                    }}
                  >
                    Focus a supported detail view to let the assistant resolve
                    `ActionIntent` against that resource&apos;s available
                    actions.
                  </div>
                )}
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  Assistant actions
                </div>
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <label
                    htmlFor="ops-assistant-composer"
                    style={{ fontSize: 11, color: theme.textDim }}
                  >
                    Ask assistant
                  </label>
                  <textarea
                    id="ops-assistant-composer"
                    data-testid="ops-assistant-composer"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Ask about refresh tiers, current scope, or available actions"
                    rows={3}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      borderRadius: 10,
                      border: `1px solid ${theme.border}`,
                      background: theme.surfaceLo,
                      color: theme.text,
                      padding: "10px 12px",
                      font: "inherit",
                      lineHeight: 1.45,
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      data-testid="ops-assistant-send"
                      onClick={handleSubmitPrompt}
                      style={primaryAssistButtonStyle}
                    >
                      Ask
                    </button>
                  </div>
                  {actions.length > 0 ? (
                    actions.map((action) => (
                      <button
                        key={`${action.kind}:${resolveAssistantActionHref(action)}`}
                        type="button"
                        onClick={() => handleAction(action)}
                        style={actionButtonStyle}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                            {action.label}
                          </span>
                          <CanvasIcon
                            name={action.kind === "cross_app" ? "ext" : "arrow"}
                            size={13}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 11,
                            color: theme.textMuted,
                            lineHeight: 1.45,
                            textAlign: "left",
                          }}
                        >
                          {action.description}
                        </span>
                      </button>
                    ))
                  ) : (
                    <div
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        padding: "10px 12px",
                        background: theme.surfaceLo,
                        fontSize: 12,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      Open a board or detail page to let the assistant emit
                      route-aware actions and deep links.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  Conversation
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {conversation.length > 0 ? (
                    conversation.map((entry) => (
                      <MessageBubble
                        key={entry.id}
                        tone={entry.tone}
                        author={
                          entry.author === "assistant"
                            ? "Assistant"
                            : entry.author === "operator"
                              ? "Operator"
                              : "System"
                        }
                        message={entry.message}
                        {...(entry.meta ? { meta: entry.meta } : {})}
                        {...(entry.auditHref !== undefined
                          ? { auditHref: entry.auditHref }
                          : {})}
                      />
                    ))
                  ) : (
                    <div
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        padding: "10px 12px",
                        background: theme.surfaceLo,
                        fontSize: 12,
                        color: theme.textMuted,
                        lineHeight: 1.45,
                      }}
                    >
                      Proposed actions, disabled refusals, and action receipts
                      will be written back here.
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface,
                  padding: 12,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 11, color: theme.textDim }}>
                  Context envelope
                </div>
                <dl
                  style={{
                    margin: 0,
                    display: "grid",
                    gridTemplateColumns: "max-content 1fr",
                    gap: "6px 10px",
                    fontSize: 11.5,
                  }}
                >
                  <dt style={{ color: theme.textDim }}>Route</dt>
                  <dd style={contextValueStyle}>{context?.route ?? "—"}</dd>
                  <dt style={{ color: theme.textDim }}>Board</dt>
                  <dd style={contextValueStyle}>{context?.board ?? "—"}</dd>
                  <dt style={{ color: theme.textDim }}>Tab</dt>
                  <dd style={contextValueStyle}>{context?.activeTab ?? "—"}</dd>
                  <dt style={{ color: theme.textDim }}>Selection</dt>
                  <dd style={contextValueStyle}>
                    {context?.selectedEntity
                      ? `${context.selectedEntity.kind}:${context.selectedEntity.id}`
                      : "—"}
                  </dd>
                  <dt style={{ color: theme.textDim }}>Filters</dt>
                  <dd style={contextValueStyle}>
                    {context?.visibleFilters
                      ? JSON.stringify(context.visibleFilters)
                      : "—"}
                  </dd>
                </dl>
              </div>
            </div>

            <div
              style={{
                borderTop: `1px solid ${theme.border}`,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: theme.surface,
              }}
            >
              <div
                id={instructionsId}
                style={{ fontSize: 11, color: theme.textMuted, minWidth: 0 }}
              >
                Header arrows move. Resize handle arrows resize. Layout persists
                in local storage.
              </div>
              <button
                type="button"
                data-testid="ops-assistant-resize-handle"
                aria-label="Resize assistant widget"
                onPointerDown={onResizePointerDown}
                onKeyDown={onResizeKeyDown}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                  color: theme.textMuted,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "nwse-resize",
                  padding: 0,
                }}
              >
                <CanvasIcon
                  name="chevR"
                  size={13}
                  style={{ transform: "rotate(45deg)" }}
                />
              </button>
            </div>
          </div>
        ) : (
          <div
            id={instructionsId}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 14px",
              fontSize: 12,
              color: theme.textMuted,
              background: theme.surface,
            }}
          >
            <span>Minimized. Expand to resume the live mock stream.</span>
            <button
              type="button"
              data-testid="ops-assistant-restore"
              aria-label="Restore assistant widget"
              onClick={() =>
                setWidget((current) => ({ ...current, minimized: false }))
              }
              style={restoreButtonStyle}
            >
              Restore
            </button>
          </div>
        )}
      </section>
    </>,
    portalNode,
  );
}

function MessageBubble({
  author,
  message,
  tone,
  meta,
  auditHref,
  liveRegionId,
}: {
  author: string;
  message: string;
  tone: "neutral" | "accent" | "success" | "danger";
  meta?: string;
  auditHref?: string | null;
  liveRegionId?: string;
}) {
  const bubbleTheme =
    tone === "accent"
      ? {
          background: theme.accentBg,
          border: theme.accentBorder,
          text: theme.accentHi,
        }
      : tone === "success"
        ? {
            background: theme.successBg,
            border: theme.successBorder,
            text: theme.success,
          }
        : tone === "danger"
          ? {
              background: theme.dangerBg,
              border: theme.dangerBorder,
              text: theme.danger,
            }
          : {
              background: theme.surfaceLo,
              border: theme.border,
              text: theme.textDim,
            };
  return (
    <div
      style={{
        borderRadius: 12,
        padding: "10px 12px",
        background: bubbleTheme.background,
        border: `1px solid ${bubbleTheme.border}`,
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: bubbleTheme.text,
          marginBottom: 4,
        }}
      >
        {author}
      </div>
      <div
        {...(liveRegionId
          ? {
              id: liveRegionId,
              "aria-live": "polite" as const,
              "aria-atomic": true,
            }
          : {})}
        style={{ fontSize: 12.5, lineHeight: 1.45, color: theme.text }}
      >
        {message || " "}
      </div>
      {meta ? (
        <div
          style={{
            fontSize: 10.5,
            color: theme.textMuted,
            fontFamily: theme.monoFamily,
          }}
        >
          {meta}
        </div>
      ) : null}
      {auditHref ? (
        <a
          href={auditHref}
          target="_blank"
          rel="noreferrer"
          style={{
            color: theme.accentHi,
            fontSize: 11,
            textDecoration: "none",
          }}
        >
          View audit
        </a>
      ) : null}
    </div>
  );
}

const restoreButtonStyle: CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${theme.accentBorder}`,
  background: theme.accentBg,
  color: theme.accentHi,
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 10px",
  cursor: "pointer",
};

const actionButtonStyle: CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  padding: "10px 12px",
  background: theme.surfaceLo,
  color: theme.text,
  display: "grid",
  gap: 6,
  textAlign: "left",
  cursor: "pointer",
};

const primaryAssistButtonStyle: CSSProperties = {
  height: 30,
  padding: "0 12px",
  borderRadius: 8,
  border: `1px solid ${theme.accentBorder}`,
  background: theme.accentBg,
  color: theme.text,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryAssistButtonStyle: CSSProperties = {
  ...primaryAssistButtonStyle,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  fontWeight: 600,
};

const contextValueStyle: CSSProperties = {
  margin: 0,
  color: theme.text,
  fontFamily: theme.monoFamily,
  wordBreak: "break-word",
};
