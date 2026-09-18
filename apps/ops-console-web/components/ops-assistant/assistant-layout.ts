import type { CSSProperties } from "react";

export type DockSide = "free" | "left" | "right";

export type WidgetState = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
  docked: DockSide;
};

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const STORAGE_KEY = "ops-console.assistant-widget.v1";
export const WIDGET_MIN_WIDTH = 320;
export const WIDGET_MIN_HEIGHT = 240;
export const WIDGET_MAX_WIDTH = 560;
export const WIDGET_MAX_HEIGHT = 720;
export const HEADER_HEIGHT = 48;
export const MINIMIZED_HEIGHT = 64;
export const EDGE_GAP = 20;
export const MOVE_STEP = 24;
export const RESIZE_STEP = 24;
export const STREAM_TICK_MS = 42;
export const STREAM_PAUSE_MS = 1500;
export const FORCE_DEGRADED_KEY = "ops-console.assistant.force-degraded";
export const FORCE_DISABLED_KEY = "ops-console.assistant.force-disabled";
export const PORTAL_ROOT_ATTR = "data-ops-assistant-root";

export type AssistantTheme = {
  surface?: string;
  surfaceHi?: string;
  surfaceLo?: string;
  bgRaised?: string;
  text?: string;
  textMuted?: string;
  border?: string;
  borderStrong?: string;
  accentBorder?: string;
  accentBg?: string;
  accentHi?: string;
  shadow?: string;
};

export function getViewportRect(w?: {
  innerWidth: number;
  innerHeight: number;
}): { width: number; height: number } {
  if (w) {
    return { width: w.innerWidth, height: w.innerHeight };
  }
  if (typeof window !== "undefined") {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
    };
  }
  return { width: 1280, height: 720 };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampRect(
  rect: Rect,
  viewport: { width: number; height: number } = getViewportRect(),
  minimized = false,
): Rect {
  const isMobile = viewport.width < 768;
  const minW = isMobile
    ? Math.min(280, viewport.width - EDGE_GAP * 2)
    : WIDGET_MIN_WIDTH;
  const maxW = Math.max(
    minW,
    Math.min(WIDGET_MAX_WIDTH, viewport.width - EDGE_GAP * 2),
  );
  const width = clamp(rect.width, minW, maxW);

  const height = minimized
    ? MINIMIZED_HEIGHT
    : clamp(
        rect.height,
        WIDGET_MIN_HEIGHT,
        Math.min(WIDGET_MAX_HEIGHT, viewport.height - EDGE_GAP * 2),
      );

  const maxX = Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP);
  const maxY = Math.max(
    EDGE_GAP,
    viewport.height - (minimized ? MINIMIZED_HEIGHT : height) - EDGE_GAP,
  );

  return {
    x: clamp(rect.x, EDGE_GAP, maxX),
    y: clamp(rect.y, EDGE_GAP, maxY),
    width,
    height,
  };
}

export function resolveDockedPosition(
  docked: DockSide,
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    minimized?: boolean;
  },
  viewport: { width: number; height: number } = getViewportRect(),
): Rect {
  const minimized = rect.minimized ?? false;
  const next = clampRect(
    {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    viewport,
    minimized,
  );
  const effectiveHeight = minimized ? MINIMIZED_HEIGHT : next.height;
  const dockedY = Math.max(
    EDGE_GAP,
    viewport.height - effectiveHeight - EDGE_GAP,
  );

  if (docked === "left") {
    return { ...next, x: EDGE_GAP, y: dockedY };
  }
  if (docked === "right") {
    return {
      ...next,
      x: Math.max(EDGE_GAP, viewport.width - next.width - EDGE_GAP),
      y: dockedY,
    };
  }
  return next;
}

export function buildDefaultState(
  viewport: { width: number; height: number } = getViewportRect(),
): WidgetState {
  const isMobile = viewport.width < 768;
  const width = isMobile
    ? Math.max(280, Math.min(viewport.width - EDGE_GAP * 2, 350))
    : 420;
  const height = 360;
  const minimized = true; // Minimized by default to ensure workspace controls are not obscured (R19 / C048)
  const effectiveHeight = minimized ? MINIMIZED_HEIGHT : height;
  return {
    width,
    height,
    x: Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP),
    y: Math.max(EDGE_GAP, viewport.height - effectiveHeight - EDGE_GAP),
    minimized,
    closed: false,
    docked: "right",
  };
}

export function readStoredState(
  viewport: { width: number; height: number } = getViewportRect(),
  storage?: { getItem(key: string): string | null },
): WidgetState | null {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) {
    return null;
  }
  try {
    const raw = targetStorage.getItem(STORAGE_KEY);
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
    const minimized = parsed.minimized ?? true;
    const closed = parsed.closed ?? false;
    const docked: DockSide =
      parsed.docked === "left" || parsed.docked === "right"
        ? parsed.docked
        : "free";

    const dockedRect = resolveDockedPosition(
      docked,
      {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width,
        height: parsed.height,
        minimized,
      },
      viewport,
    );

    return {
      ...dockedRect,
      minimized,
      closed,
      docked,
    };
  } catch {
    return null;
  }
}

export function writeStoredState(
  state: WidgetState,
  storage?: { setItem(key: string, value: string): void },
): void {
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) {
    return;
  }
  targetStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isAssistantEnabled(
  storage?: { getItem(key: string): string | null },
  envValue?: string,
): boolean {
  const enabledEnv =
    envValue ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_OPS_ASSISTANT_ENABLED
      : undefined);
  if (enabledEnv === "false") {
    return false;
  }
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) {
    return true;
  }
  return targetStorage.getItem(FORCE_DISABLED_KEY) !== "true";
}

export function isForcedDegraded(
  storage?: { getItem(key: string): string | null },
  envValue?: string,
): boolean {
  const degradedEnv =
    envValue ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_OPS_ASSISTANT_DEGRADED
      : undefined);
  const targetStorage =
    storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!targetStorage) {
    return degradedEnv === "true";
  }
  return degradedEnv === "true" || targetStorage.getItem(FORCE_DEGRADED_KEY) === "true";
}

export function buildPortalRootStyle(): CSSProperties {
  return {
    pointerEvents: "none",
  };
}

export function buildLauncherButtonStyle(
  theme?: AssistantTheme,
): CSSProperties {
  return {
    position: "fixed",
    right: EDGE_GAP,
    bottom: EDGE_GAP,
    zIndex: 5000,
    height: 48,
    padding: "0 16px",
    borderRadius: 999,
    border: `1px solid ${theme?.accentBorder ?? "#38bdf8"}`,
    background: theme?.surface ?? "#1e293b",
    color: theme?.text ?? "#f8fafc",
    boxShadow: theme?.shadow ?? "0 10px 25px rgba(0,0,0,0.5)",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    pointerEvents: "auto",
  };
}

export function buildShellPanelStyle(
  widget: WidgetState,
  theme?: AssistantTheme,
): CSSProperties {
  return {
    position: "fixed",
    left: widget.x,
    top: widget.y,
    width: widget.width,
    height: widget.minimized ? MINIMIZED_HEIGHT : widget.height,
    zIndex: 5000,
    borderRadius: 18,
    background: theme?.bgRaised ?? "#0f172a",
    border: `1px solid ${theme?.borderStrong ?? "#334155"}`,
    boxShadow: theme?.shadow ?? "0 20px 40px rgba(0,0,0,0.6)",
    color: theme?.text ?? "#f8fafc",
    overflow: "hidden",
    display: widget.closed ? "none" : "grid",
    gridTemplateRows: `${HEADER_HEIGHT}px 1fr`,
    pointerEvents: "auto",
  };
}

export function toggleWidgetClosed(
  current: WidgetState,
  closed: boolean,
): WidgetState {
  return {
    ...current,
    closed,
  };
}

export function toggleWidgetMinimized(
  current: WidgetState,
  viewport: { width: number; height: number } = getViewportRect(),
): WidgetState {
  const nextMinimized = !current.minimized;
  const effectiveHeight = nextMinimized ? MINIMIZED_HEIGHT : current.height;
  let nextY = current.y;
  if (current.docked === "right" || current.docked === "left") {
    nextY = Math.max(
      EDGE_GAP,
      viewport.height - effectiveHeight - EDGE_GAP,
    );
  } else {
    const bottom =
      current.y + (current.minimized ? MINIMIZED_HEIGHT : current.height);
    nextY = clamp(
      bottom - effectiveHeight,
      EDGE_GAP,
      viewport.height - effectiveHeight - EDGE_GAP,
    );
  }
  return {
    ...current,
    minimized: nextMinimized,
    y: nextY,
    closed: false,
  };
}

/**
 * Resolves effective pointerEvents value honoring CSS inheritance.
 * If parent has pointer-events: none and child has no pointer-events defined,
 * child inherits pointer-events: none (unclickable).
 * If child explicitly sets pointer-events: auto, child is clickable.
 */
export function resolveEffectivePointerEvents(element: {
  style?: { pointerEvents?: string };
  parentElement?: any;
}): "auto" | "none" {
  let current: any = element;
  while (current) {
    if (current.style && current.style.pointerEvents) {
      const val = current.style.pointerEvents;
      if (val === "auto" || val === "none") {
        return val;
      }
    }
    current = current.parentElement;
  }
  return "auto";
}
