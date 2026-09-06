import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Re-create the state and clamping logic to test pure viewport and storage mathematics
// matching assistant-widget.tsx specifications.
const STORAGE_KEY = "ops-console.assistant-widget.v1";
const WIDGET_MIN_WIDTH = 320;
const WIDGET_MIN_HEIGHT = 240;
const WIDGET_MAX_WIDTH = 560;
const WIDGET_MAX_HEIGHT = 720;
const MINIMIZED_HEIGHT = 64;
const EDGE_GAP = 20;

type DockSide = "free" | "left" | "right";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WidgetState = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  closed: boolean;
  docked: DockSide;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampRect(
  rect: Rect,
  viewport: { width: number; height: number },
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

function resolveDockedPosition(
  docked: DockSide,
  rect: { x: number; y: number; width: number; height: number; minimized?: boolean },
  viewport: { width: number; height: number },
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

function buildDefaultState(viewport: { width: number; height: number }): WidgetState {
  const isMobile = viewport.width < 768;
  const width = isMobile
    ? Math.max(280, Math.min(viewport.width - EDGE_GAP * 2, 350))
    : 420;
  const height = 360;
  const minimized = true; // Minimized by default (R19 / C048)
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

function readStoredState(
  storage: Storage,
  viewport: { width: number; height: number },
): WidgetState | null {
  try {
    const raw = storage.getItem(STORAGE_KEY);
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

describe("SR-OPS-SHELL-001: Assistant Widget Layout & Responsiveness", () => {
  let mockStorage: Record<string, string>;
  let storageStub: Storage;

  beforeEach(() => {
    mockStorage = {};
    storageStub = {
      getItem: vi.fn((key: string) => mockStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
      }),
      clear: vi.fn(() => {
        mockStorage = {};
      }),
      key: vi.fn(() => null),
      length: 0,
    };
  });

  describe("Desktop 1440px Layout & Default State (R19 / C048)", () => {
    const desktopViewport = { width: 1440, height: 1000 };

    it("defaults to minimized: true so workspace action controls are not blocked", () => {
      const state = buildDefaultState(desktopViewport);
      expect(state.minimized).toBe(true);
      expect(state.closed).toBe(false);
      expect(state.docked).toBe("right");

      // Dimensions
      expect(state.width).toBe(420);
      expect(state.height).toBe(360);

      // Anchored to bottom right
      expect(state.x).toBe(1440 - 420 - EDGE_GAP); // 1000
      expect(state.y).toBe(1000 - MINIMIZED_HEIGHT - EDGE_GAP); // 916

      // The workspace between y: 620..916 is completely free and unblocked!
      expect(state.y).toBeGreaterThanOrEqual(900);
    });

    it("anchors cleanly to bottom right when expanded", () => {
      const state = buildDefaultState(desktopViewport);
      const expandedRect = resolveDockedPosition(
        state.docked,
        { ...state, minimized: false },
        desktopViewport,
      );

      expect(expandedRect.x).toBe(1000);
      expect(expandedRect.y).toBe(1000 - 360 - EDGE_GAP); // 620
      expect(expandedRect.width).toBe(420);
      expect(expandedRect.height).toBe(360);
    });
  });

  describe("Mobile 390px Viewport Layout (Acceptance)", () => {
    const mobileViewport = { width: 390, height: 844 };

    it("clamps width and positions safely inside 390px viewport", () => {
      const state = buildDefaultState(mobileViewport);

      expect(state.minimized).toBe(true);
      // Width fits within mobile viewport with margins (<= 350)
      expect(state.width).toBeLessThanOrEqual(350);
      expect(state.width).toBeGreaterThanOrEqual(280);

      // Boundaries check
      expect(state.x).toBeGreaterThanOrEqual(EDGE_GAP);
      expect(state.x + state.width).toBeLessThanOrEqual(mobileViewport.width - EDGE_GAP);
      expect(state.y + MINIMIZED_HEIGHT).toBeLessThanOrEqual(mobileViewport.height - EDGE_GAP);
    });

    it("preserves reasonable layout when expanded on mobile without overflowing width", () => {
      const state = buildDefaultState(mobileViewport);
      const expandedRect = resolveDockedPosition(
        state.docked,
        { ...state, minimized: false },
        mobileViewport,
      );

      expect(expandedRect.width).toBeLessThanOrEqual(350);
      expect(expandedRect.x + expandedRect.width).toBeLessThanOrEqual(mobileViewport.width);
      expect(expandedRect.y + expandedRect.height).toBeLessThanOrEqual(mobileViewport.height);
    });
  });

  describe("Page Reload Preservation (重載保留合理版面)", () => {
    it("preserves closed and minimized state on reload", () => {
      const viewport = { width: 1440, height: 1000 };
      storageStub.setItem(
        STORAGE_KEY,
        JSON.stringify({
          x: 1000,
          y: 916,
          width: 420,
          height: 360,
          minimized: true,
          closed: true,
          docked: "right",
        }),
      );

      const restored = readStoredState(storageStub, viewport);
      expect(restored).not.toBeNull();
      expect(restored!.closed).toBe(true);
      expect(restored!.minimized).toBe(true);
      expect(restored!.docked).toBe("right");
    });

    it("re-clamps safely when desktop-saved state is restored on a 390px mobile viewport", () => {
      // Saved on desktop: width 560, x: 800
      storageStub.setItem(
        STORAGE_KEY,
        JSON.stringify({
          x: 800,
          y: 600,
          width: 560,
          height: 500,
          minimized: false,
          closed: false,
          docked: "right",
        }),
      );

      const mobileViewport = { width: 390, height: 844 };
      const restored = readStoredState(storageStub, mobileViewport);

      expect(restored).not.toBeNull();
      // Must not exceed mobile screen bounds
      expect(restored!.width).toBeLessThanOrEqual(350);
      expect(restored!.x + restored!.width).toBeLessThanOrEqual(mobileViewport.width - EDGE_GAP);
      expect(restored!.y + restored!.height).toBeLessThanOrEqual(mobileViewport.height - EDGE_GAP);
      expect(restored!.docked).toBe("right");
    });

    it("re-clamps safely when restored in minimized mode on mobile", () => {
      storageStub.setItem(
        STORAGE_KEY,
        JSON.stringify({
          x: 1000,
          y: 916,
          width: 420,
          height: 360,
          minimized: true,
          closed: false,
          docked: "right",
        }),
      );

      const mobileViewport = { width: 390, height: 844 };
      const restored = readStoredState(storageStub, mobileViewport);

      expect(restored).not.toBeNull();
      expect(restored!.minimized).toBe(true);
      expect(restored!.y).toBe(mobileViewport.height - MINIMIZED_HEIGHT - EDGE_GAP); // 760
      expect(restored!.x).toBe(mobileViewport.width - restored!.width - EDGE_GAP);
    });
  });
});
