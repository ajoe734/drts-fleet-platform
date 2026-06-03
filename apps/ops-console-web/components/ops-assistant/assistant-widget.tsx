"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { buildCanvasTheme, CanvasIcon } from "@drts/ui-web";

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

  const activeMessage = STREAM_MESSAGES[stream.activeIndex] ?? "";

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
        role="region"
        aria-labelledby={titleId}
        aria-describedby={instructionsId}
        aria-live="off"
        style={shellStyle}
      >
        <div
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
                  Quick actions
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 8,
                  }}
                >
                  {[
                    "Open incident queue",
                    "Draft handoff",
                    "Summarize dispatch lag",
                    "Inspect vehicle alerts",
                  ].map((label) => (
                    <div
                      key={label}
                      style={{
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        padding: "10px 12px",
                        background: theme.surfaceLo,
                        fontSize: 12,
                        color: theme.textMuted,
                      }}
                    >
                      {label}
                    </div>
                  ))}
                </div>
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
  liveRegionId,
}: {
  author: string;
  message: string;
  tone: "neutral" | "accent";
  liveRegionId?: string;
}) {
  const isAccent = tone === "accent";
  return (
    <div
      style={{
        borderRadius: 12,
        padding: "10px 12px",
        background: isAccent ? theme.accentBg : theme.surfaceLo,
        border: `1px solid ${isAccent ? theme.accentBorder : theme.border}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: isAccent ? theme.accentHi : theme.textDim,
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
