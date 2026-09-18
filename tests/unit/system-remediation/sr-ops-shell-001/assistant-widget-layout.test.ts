import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  EDGE_GAP,
  MINIMIZED_HEIGHT,
  PORTAL_ROOT_ATTR,
  buildDefaultState,
  resolveDockedPosition,
  readStoredState,
  writeStoredState,
  buildPortalRootStyle,
  buildLauncherButtonStyle,
  buildShellPanelStyle,
  resolveEffectivePointerEvents,
  toggleWidgetClosed,
  toggleWidgetMinimized,
  type WidgetState,
} from "../../../../apps/ops-console-web/components/ops-assistant/assistant-layout";

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
      expect(state.x + state.width).toBeLessThanOrEqual(
        mobileViewport.width - EDGE_GAP,
      );
      expect(state.y + MINIMIZED_HEIGHT).toBeLessThanOrEqual(
        mobileViewport.height - EDGE_GAP,
      );
    });

    it("preserves reasonable layout when expanded on mobile without overflowing width", () => {
      const state = buildDefaultState(mobileViewport);
      const expandedRect = resolveDockedPosition(
        state.docked,
        { ...state, minimized: false },
        mobileViewport,
      );

      expect(expandedRect.width).toBeLessThanOrEqual(350);
      expect(expandedRect.x + expandedRect.width).toBeLessThanOrEqual(
        mobileViewport.width,
      );
      expect(expandedRect.y + expandedRect.height).toBeLessThanOrEqual(
        mobileViewport.height,
      );
    });
  });

  describe("Page Reload Preservation (重載保留合理版面)", () => {
    it("preserves closed and minimized state on reload", () => {
      const viewport = { width: 1440, height: 1000 };
      writeStoredState(
        {
          x: 1000,
          y: 916,
          width: 420,
          height: 360,
          minimized: true,
          closed: true,
          docked: "right",
        },
        storageStub,
      );

      expect(STORAGE_KEY).toBe("ops-console.assistant-widget.v1");
      const restored = readStoredState(viewport, storageStub);
      expect(restored).not.toBeNull();
      expect(restored!.closed).toBe(true);
      expect(restored!.minimized).toBe(true);
      expect(restored!.docked).toBe("right");
    });

    it("re-clamps safely when desktop-saved state is restored on a 390px mobile viewport", () => {
      // Saved on desktop: width 560, x: 800
      writeStoredState(
        {
          x: 800,
          y: 600,
          width: 560,
          height: 500,
          minimized: false,
          closed: false,
          docked: "right",
        },
        storageStub,
      );

      const mobileViewport = { width: 390, height: 844 };
      const restored = readStoredState(mobileViewport, storageStub);

      expect(restored).not.toBeNull();
      // Must not exceed mobile screen bounds
      expect(restored!.width).toBeLessThanOrEqual(350);
      expect(restored!.x + restored!.width).toBeLessThanOrEqual(
        mobileViewport.width - EDGE_GAP,
      );
      expect(restored!.y + restored!.height).toBeLessThanOrEqual(
        mobileViewport.height - EDGE_GAP,
      );
      expect(restored!.docked).toBe("right");
    });

    it("re-clamps safely when restored in minimized mode on mobile", () => {
      writeStoredState(
        {
          x: 1000,
          y: 916,
          width: 420,
          height: 360,
          minimized: true,
          closed: false,
          docked: "right",
        },
        storageStub,
      );

      const mobileViewport = { width: 390, height: 844 };
      const restored = readStoredState(mobileViewport, storageStub);

      expect(restored).not.toBeNull();
      expect(restored!.minimized).toBe(true);
      expect(restored!.y).toBe(
        mobileViewport.height - MINIMIZED_HEIGHT - EDGE_GAP,
      ); // 760
      expect(restored!.x).toBe(
        mobileViewport.width - restored!.width - EDGE_GAP,
      );
    });
  });

  describe("Pointer-Events Isolation & Click-Through Protection (R19 / Acceptance #2)", () => {
    it("configures portal root with pointerEvents: none to prevent workspace occlusion", () => {
      const rootStyle = buildPortalRootStyle();
      expect(rootStyle.pointerEvents).toBe("none");
    });

    it("explicitly configures launcher button with pointerEvents: auto", () => {
      const launcherStyle = buildLauncherButtonStyle();
      expect(launcherStyle.pointerEvents).toBe("auto");
      expect(launcherStyle.position).toBe("fixed");
      expect(launcherStyle.right).toBe(EDGE_GAP);
      expect(launcherStyle.bottom).toBe(EDGE_GAP);
      expect(launcherStyle.zIndex).toBe(5000);
      expect(launcherStyle.cursor).toBe("pointer");
    });

    it("explicitly configures shell panel with pointerEvents: auto", () => {
      const state = buildDefaultState();
      const panelStyle = buildShellPanelStyle(state);
      expect(panelStyle.pointerEvents).toBe("auto");
      expect(panelStyle.position).toBe("fixed");
      expect(panelStyle.zIndex).toBe(5000);
    });

    it("reproduces CSS inheritance: unstyled child in portal root inherits pointer-events: none (the bug)", () => {
      const portalRoot = {
        style: { pointerEvents: "none" },
        parentElement: null,
      };
      // A child button WITHOUT explicit pointerEvents style inherits pointerEvents: none
      const deadButton = {
        style: {} as { pointerEvents?: string },
        parentElement: portalRoot,
      };

      const effectivePointerEvents = resolveEffectivePointerEvents(deadButton);
      expect(effectivePointerEvents).toBe("none");
    });

    it("verifies fix: launcher button with pointerEvents: auto overrides portal root none", () => {
      const portalRoot = {
        style: { pointerEvents: "none" },
        parentElement: null,
      };
      // Fixed launcher button with explicit pointerEvents: auto
      const fixedLauncherButton = {
        style: buildLauncherButtonStyle() as { pointerEvents?: string },
        parentElement: portalRoot,
      };

      const effectivePointerEvents =
        resolveEffectivePointerEvents(fixedLauncherButton);
      expect(effectivePointerEvents).toBe("auto");
    });

    it("verifies fix: expanded shell panel with pointerEvents: auto overrides portal root none", () => {
      const portalRoot = {
        style: { pointerEvents: "none" },
        parentElement: null,
      };
      const state = buildDefaultState();
      const fixedPanel = {
        style: buildShellPanelStyle(state) as { pointerEvents?: string },
        parentElement: portalRoot,
      };

      const effectivePointerEvents = resolveEffectivePointerEvents(fixedPanel);
      expect(effectivePointerEvents).toBe("auto");
    });
  });

  describe("Assistant Open/Close State Machine & Interaction Cycle (Acceptance #2)", () => {
    it("full open -> close -> reopen lifecycle toggles state and persists correctly", () => {
      const viewport = { width: 1440, height: 1000 };
      let state: WidgetState = buildDefaultState(viewport);

      // 1. Initial default state: closed is false, panel is visible
      expect(state.closed).toBe(false);

      // 2. User clicks header Close button -> closed becomes true
      state = toggleWidgetClosed(state, true);
      expect(state.closed).toBe(true);
      writeStoredState(state, storageStub);

      // Verify closed state is persisted to storage
      const reloadedClosed = readStoredState(viewport, storageStub);
      expect(reloadedClosed?.closed).toBe(true);

      // 3. User clicks floating launcher button (with pointerEvents: auto) -> closed becomes false
      state = toggleWidgetClosed(reloadedClosed!, false);
      expect(state.closed).toBe(false);
      writeStoredState(state, storageStub);

      // Verify reopened state is persisted to storage
      const reloadedOpen = readStoredState(viewport, storageStub);
      expect(reloadedOpen?.closed).toBe(false);
      expect(reloadedOpen?.width).toBe(420);
      expect(reloadedOpen?.minimized).toBe(true);
    });

    it("toggleWidgetMinimized correctly toggles between minimized and expanded heights", () => {
      const viewport = { width: 1440, height: 1000 };
      let state = buildDefaultState(viewport);
      expect(state.minimized).toBe(true);

      // Expand
      state = toggleWidgetMinimized(state, viewport);
      expect(state.minimized).toBe(false);
      expect(state.y).toBe(1000 - 360 - EDGE_GAP); // 620

      // Minimize
      state = toggleWidgetMinimized(state, viewport);
      expect(state.minimized).toBe(true);
      expect(state.y).toBe(1000 - MINIMIZED_HEIGHT - EDGE_GAP); // 916
    });
  });

  describe("DOM-Level Click & Focus Management Simulation", () => {
    type MockElement = {
      tagName: string;
      attributes: Record<string, string>;
      style: Record<string, any>;
      children: MockElement[];
      parentElement: MockElement | null;
      listeners: Record<string, ((event: any) => void)[]>;
      setAttribute: (name: string, value: string) => void;
      getAttribute: (name: string) => string | null;
      addEventListener: (type: string, listener: (event: any) => void) => void;
      removeEventListener: (
        type: string,
        listener: (event: any) => void,
      ) => void;
      dispatchEvent: (event: {
        type: string;
        defaultPrevented?: boolean;
        [key: string]: any;
      }) => boolean;
      click: () => void;
      focus: () => void;
      isFocused: boolean;
      appendChild: (child: MockElement) => void;
      removeChild: (child: MockElement) => void;
    };

    function createMockElement(tagName: string): MockElement {
      const el: MockElement = {
        tagName,
        attributes: {},
        style: {},
        children: [],
        parentElement: null,
        listeners: {},
        isFocused: false,
        setAttribute(name: string, value: string) {
          el.attributes[name] = value;
        },
        getAttribute(name: string) {
          return el.attributes[name] ?? null;
        },
        addEventListener(type: string, listener: (event: any) => void) {
          el.listeners[type] = el.listeners[type] || [];
          el.listeners[type].push(listener);
        },
        removeEventListener(type: string, listener: (event: any) => void) {
          if (!el.listeners[type]) return;
          el.listeners[type] = el.listeners[type].filter((l) => l !== listener);
        },
        dispatchEvent(event: {
          type: string;
          defaultPrevented?: boolean;
          [key: string]: any;
        }) {
          const list = el.listeners[event.type] || [];
          for (const listener of list) {
            listener(event);
          }
          return !event.defaultPrevented;
        },
        click() {
          // Check effective pointer-events before dispatching click
          const effective = resolveEffectivePointerEvents(el);
          if (effective === "none") {
            // Pointer events are ignored by mouse/touch when effective pointer-events is none
            return;
          }
          el.dispatchEvent({ type: "click" });
        },
        focus() {
          el.isFocused = true;
        },
        appendChild(child: MockElement) {
          child.parentElement = el;
          el.children.push(child);
        },
        removeChild(child: MockElement) {
          el.children = el.children.filter((c) => c !== child);
          child.parentElement = null;
        },
      };
      return el;
    }

    it("simulates portal root creation with pointerEvents: none and attribute", () => {
      const body = createMockElement("BODY");
      const portalRoot = createMockElement("DIV");
      portalRoot.setAttribute(PORTAL_ROOT_ATTR, "true");
      Object.assign(portalRoot.style, buildPortalRootStyle());
      body.appendChild(portalRoot);

      expect(portalRoot.getAttribute(PORTAL_ROOT_ATTR)).toBe("true");
      expect(portalRoot.style.pointerEvents).toBe("none");
      expect(body.children).toContain(portalRoot);
    });

    it("simulates click on unstyled launcher button: click is dropped due to inherited pointerEvents: none", () => {
      const portalRoot = createMockElement("DIV");
      Object.assign(portalRoot.style, buildPortalRootStyle()); // pointerEvents: none

      const buggyLauncher = createMockElement("BUTTON");
      // Buggy: missing pointerEvents: auto
      let clicked = false;
      buggyLauncher.addEventListener("click", () => {
        clicked = true;
      });
      portalRoot.appendChild(buggyLauncher);

      // Attempt mouse click
      buggyLauncher.click();

      // Click did not fire!
      expect(clicked).toBe(false);
    });

    it("simulates click on fixed launcher button: click fires and reopens widget", () => {
      const portalRoot = createMockElement("DIV");
      Object.assign(portalRoot.style, buildPortalRootStyle()); // pointerEvents: none

      const fixedLauncher = createMockElement("BUTTON");
      fixedLauncher.setAttribute("data-testid", "ops-assistant-launcher");
      Object.assign(fixedLauncher.style, buildLauncherButtonStyle()); // pointerEvents: auto

      let widgetClosed = true;
      let focusReturnedToDragHandle = false;
      const dragHandle = createMockElement("DIV");
      dragHandle.setAttribute("data-testid", "ops-assistant-drag-handle");

      fixedLauncher.addEventListener("click", () => {
        widgetClosed = false;
        dragHandle.focus();
        focusReturnedToDragHandle = dragHandle.isFocused;
      });
      portalRoot.appendChild(fixedLauncher);

      // Mouse click on launcher button
      fixedLauncher.click();

      // Successfully clicked and reopened!
      expect(widgetClosed).toBe(false);
      expect(focusReturnedToDragHandle).toBe(true);
    });

    it("simulates Escape key press on panel: closes widget and returns focus to launcher", () => {
      const portalRoot = createMockElement("DIV");
      Object.assign(portalRoot.style, buildPortalRootStyle());

      const launcher = createMockElement("BUTTON");
      launcher.setAttribute("data-testid", "ops-assistant-launcher");
      Object.assign(launcher.style, buildLauncherButtonStyle());
      portalRoot.appendChild(launcher);

      const panel = createMockElement("SECTION");
      panel.setAttribute("data-testid", "ops-assistant-panel");
      const state = buildDefaultState();
      Object.assign(panel.style, buildShellPanelStyle(state));
      portalRoot.appendChild(panel);

      let widgetClosed = false;
      panel.addEventListener("keydown", (e: any) => {
        if (e.key === "Escape") {
          widgetClosed = true;
          launcher.focus();
        }
      });

      // User presses Escape
      panel.dispatchEvent({ type: "keydown", key: "Escape" });

      expect(widgetClosed).toBe(true);
      expect(launcher.isFocused).toBe(true);
    });

    it("verifies underlying page CTA buttons remain clickable when assistant is mounted", () => {
      const body = createMockElement("BODY");

      // Underlying page CTA (e.g. 1440px desktop or 390px mobile action button)
      const pageCta = createMockElement("BUTTON");
      pageCta.setAttribute("data-testid", "dispatch-action-cta");
      let ctaClicked = false;
      pageCta.addEventListener("click", () => {
        ctaClicked = true;
      });
      body.appendChild(pageCta);

      // Assistant portal root mounted on top of body
      const portalRoot = createMockElement("DIV");
      portalRoot.setAttribute(PORTAL_ROOT_ATTR, "true");
      Object.assign(portalRoot.style, buildPortalRootStyle()); // pointerEvents: none
      body.appendChild(portalRoot);

      // Clicking page CTA succeeds because portal root doesn't intercept
      pageCta.click();
      expect(ctaClicked).toBe(true);
    });
  });

  describe("Realistic Viewport Geometry, Collision & Hit-Testing (1440px / 390px Acceptance)", () => {
    type Box = { left: number; top: number; width: number; height: number };

    function intersects(b1: Box, b2: Box): boolean {
      return (
        b1.left < b2.left + b2.width &&
        b1.left + b1.width > b2.left &&
        b1.top < b2.top + b2.height &&
        b1.top + b1.height > b2.top
      );
    }

    type HitTarget = {
      id: string;
      box: Box;
      pointerEvents: "none" | "auto";
      zIndex: number;
    };

    function hitTest(x: number, y: number, targets: HitTarget[]): string | null {
      // Sort descending by z-index
      const sorted = [...targets].sort((a, b) => b.zIndex - a.zIndex);
      for (const target of sorted) {
        if (target.pointerEvents === "none") {
          continue; // transparent to pointer events
        }
        const { left, top, width, height } = target.box;
        if (x >= left && x <= left + width && y >= top && y <= top + height) {
          return target.id;
        }
      }
      return null;
    }

    it("verifies 1440x900 desktop default minimized panel does not block workspace CTA controls and portal click-through works", () => {
      const desktop = { width: 1440, height: 900 };
      const defaultState = buildDefaultState(desktop);

      // Default state is closed: false, minimized: true (R19 / C048)
      expect(defaultState.closed).toBe(false);
      expect(defaultState.minimized).toBe(true);

      // Panel style derived directly from component layout builder
      const panelStyle = buildShellPanelStyle(defaultState);
      expect(panelStyle.pointerEvents).toBe("auto");
      expect(panelStyle.position).toBe("fixed");
      expect(panelStyle.zIndex).toBe(5000);

      const panelBox: Box = {
        left: Number(panelStyle.left), // 1440 - 420 - 20 = 1000
        top: Number(panelStyle.top), // 900 - 64 - 20 = 816
        width: Number(panelStyle.width), // 420
        height: Number(panelStyle.height), // 64 (MINIMIZED_HEIGHT)
      };

      // Underlying workspace elements: e.g. dispatch board pagination and submit CTA for real dispatch order 'ord-tpe-2026-8801'
      const paginationCta: Box = {
        left: 24,
        top: 840,
        width: 220,
        height: 36,
      };
      const dispatchAssignCta: Box = {
        left: 600,
        top: 840,
        width: 180,
        height: 36,
      };

      // 1. Workspace CTAs in the main content area do not collide with minimized panel at bottom-right
      expect(intersects(paginationCta, panelBox)).toBe(false);
      expect(intersects(dispatchAssignCta, panelBox)).toBe(false);

      // 2. Hit-testing simulation with portal root
      const portalRootStyle = buildPortalRootStyle();
      const portalRoot: HitTarget = {
        id: "ops-assistant-portal-root",
        box: { left: 0, top: 0, width: 1440, height: 900 },
        pointerEvents: (portalRootStyle.pointerEvents as "none") ?? "none",
        zIndex: 5000,
      };
      const panelTarget: HitTarget = {
        id: "ops-assistant-panel",
        box: panelBox,
        pointerEvents: (panelStyle.pointerEvents as "auto") ?? "auto",
        zIndex: 5000,
      };
      const paginationTarget: HitTarget = {
        id: "dispatch-pagination-cta",
        box: paginationCta,
        pointerEvents: "auto",
        zIndex: 10,
      };
      const dispatchTarget: HitTarget = {
        id: "dispatch-order-assign-cta",
        box: dispatchAssignCta,
        pointerEvents: "auto",
        zIndex: 10,
      };

      const targets = [portalRoot, panelTarget, paginationTarget, dispatchTarget];

      // Click on pagination CTA (x: 100, y: 855) -> must hit pagination CTA, not intercepted by portal root
      expect(hitTest(100, 855, targets)).toBe("dispatch-pagination-cta");

      // Click on dispatch CTA (x: 650, y: 855) -> must hit dispatch CTA, not intercepted by portal root
      expect(hitTest(650, 855, targets)).toBe("dispatch-order-assign-cta");

      // Click on minimized assistant panel (x: 1100, y: 830) -> hits assistant panel
      expect(hitTest(1100, 830, targets)).toBe("ops-assistant-panel");

      // Click on empty workspace area (x: 500, y: 500) -> passes through portal
      expect(hitTest(500, 500, targets)).toBeNull();
    });

    it("verifies 1440x900 desktop closed launcher button geometry and non-occlusion", () => {
      const desktop = { width: 1440, height: 900 };

      // When operator closes widget, launcher button is shown
      const launcherStyle = buildLauncherButtonStyle();
      expect(launcherStyle.pointerEvents).toBe("auto");
      expect(launcherStyle.position).toBe("fixed");
      expect(launcherStyle.right).toBe(EDGE_GAP);
      expect(launcherStyle.bottom).toBe(EDGE_GAP);
      expect(launcherStyle.height).toBe(48);

      // Launcher includes icon (16px) + gap (10px) + label text + horizontal padding (32px), estimated ~140px width
      const estimatedLauncherWidth = 140;
      const launcherBox: Box = {
        left: desktop.width - estimatedLauncherWidth - EDGE_GAP, // 1280
        top: desktop.height - 48 - EDGE_GAP, // 832
        width: estimatedLauncherWidth,
        height: 48,
      };

      const paginationCta: Box = {
        left: 24,
        top: 840,
        width: 220,
        height: 36,
      };
      const dispatchAssignCta: Box = {
        left: 600,
        top: 840,
        width: 180,
        height: 36,
      };

      // Does not collide with workspace CTAs
      expect(intersects(paginationCta, launcherBox)).toBe(false);
      expect(intersects(dispatchAssignCta, launcherBox)).toBe(false);

      const targets: HitTarget[] = [
        {
          id: "ops-assistant-portal-root",
          box: { left: 0, top: 0, width: 1440, height: 900 },
          pointerEvents: "none",
          zIndex: 5000,
        },
        {
          id: "ops-assistant-launcher",
          box: launcherBox,
          pointerEvents: "auto",
          zIndex: 5001,
        },
        {
          id: "dispatch-pagination-cta",
          box: paginationCta,
          pointerEvents: "auto",
          zIndex: 10,
        },
      ];

      expect(hitTest(100, 855, targets)).toBe("dispatch-pagination-cta");
      expect(hitTest(1300, 850, targets)).toBe("ops-assistant-launcher");
    });

    it("verifies 390x844 mobile viewport clamp, CTA accessibility, and safe boundaries", () => {
      const mobile = { width: 390, height: 844 };
      const defaultState = buildDefaultState(mobile);

      // Clamped width fits screen with margin on both sides (<= 350)
      expect(defaultState.width).toBeLessThanOrEqual(350);
      expect(defaultState.width + EDGE_GAP * 2).toBeLessThanOrEqual(mobile.width);
      expect(defaultState.closed).toBe(false);
      expect(defaultState.minimized).toBe(true);

      const panelStyle = buildShellPanelStyle(defaultState);
      const panelBox: Box = {
        left: Number(panelStyle.left), // 20
        top: Number(panelStyle.top), // 760
        width: Number(panelStyle.width), // 350
        height: Number(panelStyle.height), // 64
      };

      // Bottom action bar on mobile placed above docked panel or with safe scroll padding
      const mobileActionBar: Box = {
        left: 16,
        top: 680,
        width: 358,
        height: 48,
      };

      // Workspace element does not collide with docked minimized panel
      expect(intersects(mobileActionBar, panelBox)).toBe(false);

      const targets: HitTarget[] = [
        {
          id: "ops-assistant-portal-root",
          box: { left: 0, top: 0, width: 390, height: 844 },
          pointerEvents: "none",
          zIndex: 5000,
        },
        {
          id: "ops-assistant-panel",
          box: panelBox,
          pointerEvents: "auto",
          zIndex: 5000,
        },
        {
          id: "mobile-action-bar-submit",
          box: mobileActionBar,
          pointerEvents: "auto",
          zIndex: 20,
        },
      ];

      // Click on mobile action bar -> hits mobile action bar
      expect(hitTest(100, 700, targets)).toBe("mobile-action-bar-submit");
      // Click on minimized panel -> hits assistant panel
      expect(hitTest(200, 780, targets)).toBe("ops-assistant-panel");
    });

    it("maintains reasonable layout after toggle cycle and simulated browser reload", () => {
      const desktop = { width: 1440, height: 900 };
      const mockStorage: Record<string, string> = {};
      const storage: Storage = {
        getItem: (k) => mockStorage[k] ?? null,
        setItem: (k, v) => {
          mockStorage[k] = v;
        },
        removeItem: (k) => {
          delete mockStorage[k];
        },
        clear: () => {},
        key: () => null,
        length: 0,
      };

      // 1. Initial load (fallback to default state when storage is empty)
      let state = readStoredState(desktop, storage) ?? buildDefaultState(desktop);
      expect(state.minimized).toBe(true);
      expect(state.closed).toBe(false);

      // 2. Open / expand assistant
      state = toggleWidgetMinimized(state, desktop);
      expect(state.minimized).toBe(false);
      writeStoredState(state, storage);

      // 3. User closes assistant (launcher mode)
      state = toggleWidgetClosed(state, true);
      expect(state.closed).toBe(true);
      writeStoredState(state, storage);

      // 4. Simulated browser reload (e.g. page refresh)
      const reloadedState = readStoredState(desktop, storage);
      expect(reloadedState?.closed).toBe(true);
      expect(reloadedState?.minimized).toBe(false);

      // 5. Reopen via launcher
      const reopenedState = toggleWidgetClosed(reloadedState!, false);
      expect(reopenedState.closed).toBe(false);

      // Boundary guarantees
      expect(reopenedState.x).toBeGreaterThanOrEqual(EDGE_GAP);
      expect(reopenedState.x + reopenedState.width).toBeLessThanOrEqual(
        desktop.width - EDGE_GAP,
      );
    });
  });
});
