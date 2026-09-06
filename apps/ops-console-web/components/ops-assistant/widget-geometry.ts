/**
 * Ops Assistant — floating widget geometry (pure, DOM-free).
 *
 * Extracted from `assistant-widget.tsx` so the default-state / viewport-clamp
 * behavior that gates SR-OPS-SHELL-001 (assistant must not obstruct console
 * controls by default, and must never overflow a 390px viewport) can be
 * regression-tested without mounting the React tree.
 */

export type DockSide = "free" | "left" | "right";

export interface WidgetState {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
  docked: DockSide;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export const STORAGE_KEY = "ops-console.assistant-widget.v1";
export const WIDGET_MIN_WIDTH = 320;
export const WIDGET_MIN_HEIGHT = 240;
export const WIDGET_MAX_WIDTH = 560;
export const WIDGET_MAX_HEIGHT = 720;
export const EDGE_GAP = 20;

export function getViewportRect(): Viewport {
  if (typeof window === "undefined") {
    return { width: 1280, height: 720 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function clampRect(rect: Rect, viewport: Viewport): Rect {
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

export function resolveDockedPosition(
  docked: DockSide,
  rect: Rect,
  viewport: Viewport = getViewportRect(),
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

/**
 * Default widget geometry. `closed: true` is load-bearing (SR-OPS-SHELL-001 /
 * R19): the assistant must never auto-open on top of console controls before
 * an operator has asked for it. First-visit users only see the small launcher
 * button; returning users' explicit open/close choice is restored from
 * `readStoredState()` instead of this default.
 */
export function buildDefaultState(
  viewport: Viewport = getViewportRect(),
): WidgetState {
  const width = clamp(420, WIDGET_MIN_WIDTH, viewport.width - EDGE_GAP * 2);
  const height = clamp(360, WIDGET_MIN_HEIGHT, viewport.height - EDGE_GAP * 2);
  return {
    width,
    height,
    x: Math.max(EDGE_GAP, viewport.width - width - EDGE_GAP),
    y: Math.max(72, viewport.height - height - EDGE_GAP),
    minimized: false,
    closed: true,
    docked: "right",
  };
}

export function readStoredState(): WidgetState | null {
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
      closed: parsed.closed ?? true,
      docked:
        parsed.docked === "left" || parsed.docked === "right"
          ? parsed.docked
          : "free",
    };
  } catch {
    return null;
  }
}

export function writeStoredState(state: WidgetState): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
