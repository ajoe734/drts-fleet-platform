"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantMode,
  AssistantPosition,
  AssistantSize,
  AssistantWindowState,
} from "./types";

const STORAGE_KEY = "drts-ops-assistant-window-v1";

export const ASSISTANT_MIN_SIZE: AssistantSize = { width: 320, height: 360 };
export const ASSISTANT_HEADER_HEIGHT = 44;
const DEFAULT_SIZE: AssistantSize = { width: 384, height: 560 };
const VIEWPORT_MARGIN = 16;
/** Step (px) used when moving/resizing the window with the keyboard. */
const KEYBOARD_STEP = 24;

function isBrowser() {
  return typeof window !== "undefined";
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function clampSize(size: AssistantSize): AssistantSize {
  const maxWidth = isBrowser()
    ? Math.max(
        ASSISTANT_MIN_SIZE.width,
        window.innerWidth - VIEWPORT_MARGIN * 2,
      )
    : size.width;
  const maxHeight = isBrowser()
    ? Math.max(
        ASSISTANT_MIN_SIZE.height,
        window.innerHeight - VIEWPORT_MARGIN * 2,
      )
    : size.height;
  return {
    width: clamp(size.width, ASSISTANT_MIN_SIZE.width, maxWidth),
    height: clamp(size.height, ASSISTANT_MIN_SIZE.height, maxHeight),
  };
}

/** Keep the window on-screen, leaving at least the header reachable. */
function clampPosition(
  position: AssistantPosition,
  size: AssistantSize,
): AssistantPosition {
  if (!isBrowser()) {
    return position;
  }
  const maxX = window.innerWidth - size.width - VIEWPORT_MARGIN;
  const maxY = window.innerHeight - ASSISTANT_HEADER_HEIGHT - VIEWPORT_MARGIN;
  return {
    x: clamp(position.x, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, maxX)),
    y: clamp(position.y, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, maxY)),
  };
}

function defaultPosition(size: AssistantSize): AssistantPosition {
  if (!isBrowser()) {
    return { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN };
  }
  return clampPosition(
    {
      x: window.innerWidth - size.width - VIEWPORT_MARGIN,
      y: window.innerHeight - size.height - VIEWPORT_MARGIN,
    },
    size,
  );
}

function readPersisted(): Partial<AssistantWindowState> | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AssistantWindowState>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writePersisted(state: AssistantWindowState) {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

const VALID_MODES: AssistantMode[] = [
  "closed",
  "floating",
  "minimized",
  "docked",
];

export interface UseAssistantWindow {
  mode: AssistantMode;
  position: AssistantPosition;
  size: AssistantSize;
  /** True once client-side state (storage + viewport) has been resolved. */
  ready: boolean;
  isDragging: boolean;
  isResizing: boolean;
  open: () => void;
  close: () => void;
  minimize: () => void;
  toggleDock: () => void;
  setMode: (mode: AssistantMode) => void;
  onDragPointerDown: (event: ReactPointerEvent) => void;
  onResizePointerDown: (event: ReactPointerEvent) => void;
  nudgePosition: (dx: number, dy: number) => void;
  nudgeSize: (dw: number, dh: number) => void;
  keyboardStep: number;
}

type ReactPointerEvent = {
  clientX: number;
  clientY: number;
  button: number;
  pointerId: number;
  currentTarget: { setPointerCapture?: (id: number) => void };
  preventDefault: () => void;
};

export function useAssistantWindow(): UseAssistantWindow {
  const [state, setState] = useState<AssistantWindowState>({
    mode: "closed",
    position: { x: VIEWPORT_MARGIN, y: VIEWPORT_MARGIN },
    size: DEFAULT_SIZE,
  });
  const [ready, setReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  // Latest state mirror for pointer handlers (avoids stale closures).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Resolve persisted state + viewport defaults after mount.
  useEffect(() => {
    const persisted = readPersisted();
    const size = clampSize(persisted?.size ?? DEFAULT_SIZE);
    const mode =
      persisted?.mode && VALID_MODES.includes(persisted.mode)
        ? persisted.mode
        : "closed";
    const position = persisted?.position
      ? clampPosition(persisted.position, size)
      : defaultPosition(size);
    setState({ mode, position, size });
    setReady(true);
  }, []);

  // Persist whenever resolved state changes.
  useEffect(() => {
    if (ready) {
      writePersisted(state);
    }
  }, [ready, state]);

  // Re-clamp on viewport resize so the window never strands off-screen.
  useEffect(() => {
    if (!isBrowser()) {
      return;
    }
    function handleResize() {
      setState((prev) => {
        const size = clampSize(prev.size);
        return { ...prev, size, position: clampPosition(prev.position, size) };
      });
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const setMode = useCallback((mode: AssistantMode) => {
    setState((prev) => ({ ...prev, mode }));
  }, []);

  const open = useCallback(() => setMode("floating"), [setMode]);
  const close = useCallback(() => setMode("closed"), [setMode]);
  const minimize = useCallback(() => setMode("minimized"), [setMode]);

  const toggleDock = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: prev.mode === "docked" ? "floating" : "docked",
    }));
  }, []);

  const nudgePosition = useCallback((dx: number, dy: number) => {
    setState((prev) => ({
      ...prev,
      position: clampPosition(
        { x: prev.position.x + dx, y: prev.position.y + dy },
        prev.size,
      ),
    }));
  }, []);

  const nudgeSize = useCallback((dw: number, dh: number) => {
    setState((prev) => {
      const size = clampSize({
        width: prev.size.width + dw,
        height: prev.size.height + dh,
      });
      return { ...prev, size, position: clampPosition(prev.position, size) };
    });
  }, []);

  const onDragPointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0 || stateRef.current.mode !== "floating") {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = stateRef.current.position;
    setIsDragging(true);

    function handleMove(moveEvent: PointerEvent) {
      const size = stateRef.current.size;
      setState((prev) => ({
        ...prev,
        position: clampPosition(
          {
            x: origin.x + (moveEvent.clientX - startX),
            y: origin.y + (moveEvent.clientY - startY),
          },
          size,
        ),
      }));
    }
    function handleUp() {
      setIsDragging(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, []);

  const onResizePointerDown = useCallback((event: ReactPointerEvent) => {
    if (event.button !== 0 || stateRef.current.mode !== "floating") {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = stateRef.current.size;
    setIsResizing(true);

    function handleMove(moveEvent: PointerEvent) {
      setState((prev) => {
        const size = clampSize({
          width: origin.width + (moveEvent.clientX - startX),
          height: origin.height + (moveEvent.clientY - startY),
        });
        return { ...prev, size, position: clampPosition(prev.position, size) };
      });
    }
    function handleUp() {
      setIsResizing(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }, []);

  return {
    mode: state.mode,
    position: state.position,
    size: state.size,
    ready,
    isDragging,
    isResizing,
    open,
    close,
    minimize,
    toggleDock,
    setMode,
    onDragPointerDown,
    onResizePointerDown,
    nudgePosition,
    nudgeSize,
    keyboardStep: KEYBOARD_STEP,
  };
}
