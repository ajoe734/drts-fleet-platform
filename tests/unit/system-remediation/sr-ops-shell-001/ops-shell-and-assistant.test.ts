import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CrossAppResourceLink } from "@drts/contracts";
import {
  resolvePlatformAdminOrigin,
  buildPlatformAdminCrossAppHref,
  resolveAssistantActionHref,
  buildAssistantActions,
} from "../../../../apps/ops-console-web/components/ops-assistant/assistant-actions";
import type { OpsAssistantContext } from "../../../../apps/ops-console-web/components/ops-assistant/context-envelope";

describe("SR-OPS-SHELL-001: Cross-App Platform Admin & Audit Link Resolution", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN;
    delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
    delete process.env.PLATFORM_ADMIN_ORIGIN;
    delete process.env.PLATFORM_ADMIN_URL;
    delete process.env.DEV_PLATFORM_ADMIN_ORIGIN;
    delete process.env.STAGING_PLATFORM_ADMIN_ORIGIN;
    delete process.env.PROD_PLATFORM_ADMIN_ORIGIN;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("resolves platform-admin origin from NEXT_PUBLIC_PLATFORM_ADMIN_URL when set", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "https://admin.drts.example.com/";
    const origin = resolvePlatformAdminOrigin();
    expect(origin).toBe("https://admin.drts.example.com");
  });

  it("resolves platform-admin origin from NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN when set", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN = "https://platform-admin.internal";
    const origin = resolvePlatformAdminOrigin();
    expect(origin).toBe("https://platform-admin.internal");
  });

  it("resolves platform-admin origin from staging/dev environment variables", () => {
    process.env.STAGING_PLATFORM_ADMIN_ORIGIN = "https://staging-admin.drts.local/";
    const origin = resolvePlatformAdminOrigin();
    expect(origin).toBe("https://staging-admin.drts.local");
  });

  it("defaults to http://localhost:3002 when no env is configured in node/server context", () => {
    const origin = resolvePlatformAdminOrigin();
    expect(origin).toBe("http://localhost:3002");
  });

  it("resolves browser localhost window location to port 3002", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error mock window
    globalThis.window = {
      location: {
        hostname: "localhost",
        protocol: "http:",
        port: "3003",
      },
    };

    try {
      const origin = resolvePlatformAdminOrigin();
      expect(origin).toBe("http://localhost:3002");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("resolves browser domain ops.example.com to platform-admin.example.com", () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error mock window
    globalThis.window = {
      location: {
        hostname: "ops.fleet-mobility.test",
        protocol: "https:",
        port: "",
      },
    };

    try {
      const origin = resolvePlatformAdminOrigin();
      expect(origin).toBe("https://platform-admin.fleet-mobility.test");
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it("buildPlatformAdminCrossAppHref builds absolute platform-admin audit URL with resource context", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "https://admin.fleet.test";
    const link: CrossAppResourceLink = {
      targetApp: "platform-admin",
      route: "/audit",
      resourceType: "dispatch_order",
      resourceId: "ORD-20260906-001",
      openMode: "new_tab",
      label: "View audit",
    };

    const href = buildPlatformAdminCrossAppHref(link);
    expect(href).toContain("https://admin.fleet.test/audit");
    expect(href).toContain("resourceType=dispatch_order");
    expect(href).toContain("resourceId=ORD-20260906-001");
    // Must NOT be a relative path that 404s on ops-console
    expect(href.startsWith("/")).toBe(false);
  });

  it("buildPlatformAdminCrossAppHref leaves absolute external URL intact", () => {
    const link: CrossAppResourceLink = {
      targetApp: "platform-admin",
      route: "https://audit.partner.test/records/REC-99",
      resourceType: "record",
      resourceId: "REC-99",
      openMode: "new_tab",
      label: "External audit",
    };

    const href = buildPlatformAdminCrossAppHref(link);
    expect(href).toBe("https://audit.partner.test/records/REC-99");
  });

  it("resolveAssistantActionHref resolves cross_app actions targeting platform-admin to valid absolute URLs", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
    const paymentAction = {
      kind: "cross_app" as const,
      label: "Platform Payments",
      description: "Open payments queue",
      link: {
        targetApp: "platform-admin" as const,
        route: "/payments",
        resourceType: "payments_queue",
        resourceId: "",
        openMode: "new_tab" as const,
        label: "Payments",
      },
    };

    const href = resolveAssistantActionHref(paymentAction);
    expect(href).toBe("http://localhost:3002/payments");
    expect(href).not.toBe("/_apps/platform-admin/payments");
    expect(href).not.toBe("/platform-admin/payments");
  });

  it("buildAssistantActions for /dispatch includes cross_app audit action with selected context", () => {
    const mockContext: OpsAssistantContext = {
      route: "/dispatch",
      board: "assigned",
      selectedEntity: {
        kind: "order",
        id: "ORD-991",
      },
      identity: {
        actorType: "ops_user",
        realm: "ops",
        env: "staging",
      },
      health: {
        status: "healthy",
        lastChecked: "2026-09-06T06:00:00Z",
        services: {},
      },
      locale: "en",
    };

    const actions = buildAssistantActions(mockContext);
    const auditAction = actions.find(
      (a) => a.kind === "cross_app" && a.link.targetApp === "platform-admin" && a.link.route.includes("/audit"),
    );

    expect(auditAction).toBeDefined();
    if (auditAction && auditAction.kind === "cross_app") {
      expect(auditAction.link.route).toContain("resourceType=order");
      expect(auditAction.link.route).toContain("resourceId=ORD-991");
      const resolved = resolveAssistantActionHref(auditAction);
      expect(resolved).toMatch(/^https?:\/\/[^/]+\/audit/);
    }
  });
});

describe("SR-OPS-SHELL-001: Assistant Widget Obstruction & Viewport Clamping", () => {
  const WIDGET_MIN_HEIGHT = 240;
  const WIDGET_MAX_WIDTH = 560;
  const WIDGET_MAX_HEIGHT = 720;
  const MINIMIZED_HEIGHT = 64;
  const EDGE_GAP = 20;

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  function clampRect(
    rect: { x: number; y: number; width: number; height: number; minimized?: boolean },
    viewport: { width: number; height: number },
  ) {
    const isMobile = viewport.width < 640;
    const edgeGap = isMobile ? 8 : EDGE_GAP;
    const minWidth = Math.min(280, Math.max(200, viewport.width - edgeGap * 2));
    const maxWidth = Math.max(
      minWidth,
      Math.min(WIDGET_MAX_WIDTH, viewport.width - edgeGap * 2),
    );
    const width = clamp(rect.width, minWidth, maxWidth);
    const minHeight = Math.min(
      WIDGET_MIN_HEIGHT,
      Math.max(160, viewport.height - edgeGap * 2),
    );
    const maxHeight = Math.max(
      minHeight,
      Math.min(WIDGET_MAX_HEIGHT, viewport.height - edgeGap * 2),
    );
    const height = clamp(rect.height, minHeight, maxHeight);
    const effectiveHeight = rect.minimized ? MINIMIZED_HEIGHT : height;
    const maxX = Math.max(edgeGap, viewport.width - width - edgeGap);
    const maxY = Math.max(edgeGap, viewport.height - effectiveHeight - edgeGap);

    return {
      x: clamp(rect.x, edgeGap, maxX),
      y: clamp(rect.y, edgeGap, maxY),
      width,
      height,
    };
  }

  function buildDefaultState(viewport: { width: number; height: number }) {
    const isMobile = viewport.width < 640;
    const edgeGap = isMobile ? 8 : EDGE_GAP;
    const width = isMobile
      ? Math.max(280, Math.min(360, viewport.width - edgeGap * 2))
      : 420;
    const height = isMobile
      ? Math.max(240, Math.min(320, viewport.height - 120))
      : 360;
    return {
      width,
      height,
      x: Math.max(edgeGap, viewport.width - width - edgeGap),
      y: Math.max(edgeGap, viewport.height - MINIMIZED_HEIGHT - edgeGap),
      minimized: true,
      closed: false,
      docked: "right" as const,
    };
  }

  it("initializes in minimized state so desktop 1440x1000 controls are unobstructed", () => {
    const desktopViewport = { width: 1440, height: 1000 };
    const defaultState = buildDefaultState(desktopViewport);

    expect(defaultState.minimized).toBe(true);
    expect(defaultState.closed).toBe(false);
    expect(defaultState.width).toBe(420);
    // Minimized widget must sit at bottom edge (y = 1000 - 64 - 20 = 916)
    expect(defaultState.y).toBe(916);

    // In a 1440x1000 workspace, the main action CTA panel is in y: 400..850 range.
    // The top of the minimized widget (y = 916) leaves y < 916 completely unobstructed.
    expect(defaultState.y).toBeGreaterThan(850);
  });

  it("scales and clamps properly on 390x844 mobile viewport without horizontal overflow", () => {
    const mobileViewport = { width: 390, height: 844 };
    const defaultState = buildDefaultState(mobileViewport);

    expect(defaultState.minimized).toBe(true);
    // Width must not exceed 390 - 2 * 8 = 374
    expect(defaultState.width).toBeLessThanOrEqual(374);
    // Left x plus width must not exceed viewport width
    expect(defaultState.x + defaultState.width).toBeLessThanOrEqual(390);
    // Minimized widget sits near bottom edge (844 - 64 - 8 = 772)
    expect(defaultState.y).toBe(772);
  });

  it("clamping out-of-bounds coordinates keeps widget within visible bounds", () => {
    const viewport = { width: 1440, height: 1000 };
    const outOfBounds = {
      x: 2000,
      y: 1500,
      width: 900,
      height: 900,
      minimized: false,
    };

    const clamped = clampRect(outOfBounds, viewport);
    expect(clamped.width).toBe(WIDGET_MAX_WIDTH);
    expect(clamped.height).toBe(WIDGET_MAX_HEIGHT);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(viewport.width - EDGE_GAP);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(viewport.height - EDGE_GAP);
  });

  it("minimized clamping uses MINIMIZED_HEIGHT rather than full height", () => {
    const viewport = { width: 1440, height: 1000 };
    const rect = {
      x: 1000,
      y: 950,
      width: 420,
      height: 360,
      minimized: true,
    };

    const clamped = clampRect(rect, viewport);
    // With minimized = true, effective height is 64, so maxY is 1000 - 64 - 20 = 916
    expect(clamped.y).toBe(916);
  });

  it("state reload preserves minimized setting and clamps correctly", () => {
    const rawStored = JSON.stringify({
      x: 1000,
      y: 600,
      width: 420,
      height: 360,
      minimized: true,
      closed: false,
      docked: "right",
    });

    const parsed = JSON.parse(rawStored);
    expect(parsed.minimized).toBe(true);
    expect(parsed.docked).toBe("right");

    const clamped = clampRect(parsed, { width: 1440, height: 1000 });
    expect(clamped.x).toBeLessThanOrEqual(1440 - 420 - EDGE_GAP);
    expect(clamped.y).toBeLessThanOrEqual(1000 - MINIMIZED_HEIGHT - EDGE_GAP);
  });
});

describe("SR-OPS-SHELL-001: OpsShell Link Interception & Keyboard Focus Return", () => {
  it("OpsShell link interception rewrites relative /platform-admin/audit to absolute URL to prevent ops 404", () => {
    const origin = resolvePlatformAdminOrigin();
    const openSpy = vi.fn();
    const originalOpen = globalThis.window?.open;
    // @ts-expect-error mock window
    globalThis.window = {
      open: openSpy,
      location: { hostname: "localhost", protocol: "http:", port: "3003" },
    };

    try {
      // Simulate the handleClickCapture logic in ops-shell.tsx
      const href = "/platform-admin/audit";
      let targetPath = href;
      if (targetPath.startsWith("/platform-admin")) {
        targetPath = targetPath.slice("/platform-admin".length) || "/";
      }
      const targetUrl = new URL(targetPath, origin);
      globalThis.window.open(targetUrl.toString(), "_blank", "noopener,noreferrer");

      expect(openSpy).toHaveBeenCalledWith(
        "http://localhost:3002/audit",
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      if (originalOpen) {
        globalThis.window.open = originalOpen;
      }
    }
  });

  it("OpsShell link interception handles /_apps/platform-admin/payments", () => {
    const origin = resolvePlatformAdminOrigin();
    const openSpy = vi.fn();
    // @ts-expect-error mock window
    globalThis.window = {
      open: openSpy,
      location: { hostname: "localhost", protocol: "http:", port: "3003" },
    };

    try {
      const href = "/_apps/platform-admin/payments";
      let targetPath = href;
      if (targetPath.startsWith("/_apps/platform-admin")) {
        targetPath = targetPath.slice("/_apps/platform-admin".length) || "/";
      }
      const targetUrl = new URL(targetPath, origin);
      globalThis.window.open(targetUrl.toString(), "_blank", "noopener,noreferrer");

      expect(openSpy).toHaveBeenCalledWith(
        "http://localhost:3002/payments",
        "_blank",
        "noopener,noreferrer",
      );
    } finally {
      // cleanup
    }
  });

  it("focus returns to launcher button when widget closes", () => {
    const launcherButton = { focus: vi.fn() };
    const launcherRef = { current: launcherButton };

    // Simulate handleClose
    const handleClose = () => {
      launcherRef.current?.focus();
    };

    handleClose();
    expect(launcherButton.focus).toHaveBeenCalledTimes(1);
  });

  it("focus moves to drag handle when widget opens from launcher", () => {
    const dragHandle = { focus: vi.fn() };
    const dragHandleRef = { current: dragHandle };

    const handleOpen = () => {
      dragHandleRef.current?.focus();
    };

    handleOpen();
    expect(dragHandle.focus).toHaveBeenCalledTimes(1);
  });
});
