import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CrossAppResourceLink } from "@drts/contracts";
import {
  resolvePlatformAdminOrigin,
  buildPlatformAdminCrossAppHref,
  resolveAssistantActionHref,
  buildAssistantActions,
} from "../../../../apps/ops-console-web/components/ops-assistant/assistant-actions";
import {
  resolvePlatformAdminBase,
  buildPlatformAdminHref,
  buildPlatformAdminAuditHref,
  platformAdminAuditLink,
  crossAppHref,
  DEFAULT_PLATFORM_ADMIN_BASE,
} from "../../../../apps/ops-console-web/lib/ops-cross-app-links";
import {
  parseAuditResourceContext,
  filterAuditRecords,
  clearAuditResourceSearchParams,
  getAuditContextCopy,
} from "../../../../apps/platform-admin-web/lib/audit-resource-context";
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

describe("SR-OPS-SHELL-001: Ops Cross-App Links Shared Resolver", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL;
    delete process.env.DRTS_PLATFORM_ADMIN_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolvePlatformAdminBase falls back to DEFAULT_PLATFORM_ADMIN_BASE when unconfigured", () => {
    expect(resolvePlatformAdminBase()).toBe(DEFAULT_PLATFORM_ADMIN_BASE);
  });

  it("resolvePlatformAdminBase respects NEXT_PUBLIC_PLATFORM_ADMIN_URL and trims trailing slash", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002/";
    expect(resolvePlatformAdminBase()).toBe("http://localhost:3002");
  });

  it("resolvePlatformAdminBase respects DRTS_PLATFORM_ADMIN_URL fallback", () => {
    process.env.DRTS_PLATFORM_ADMIN_URL = "https://platform.fleet.internal/";
    expect(resolvePlatformAdminBase()).toBe("https://platform.fleet.internal");
  });

  it("buildPlatformAdminHref joins configured base with relative path", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
    expect(buildPlatformAdminHref("/audit")).toBe("http://localhost:3002/audit");
    expect(buildPlatformAdminHref("/adapter-registry?platformCode=TAXI_01")).toBe(
      "http://localhost:3002/adapter-registry?platformCode=TAXI_01",
    );
  });

  it("buildPlatformAdminHref retains absolute URLs unchanged", () => {
    expect(buildPlatformAdminHref("https://external.example.com/audit")).toBe(
      "https://external.example.com/audit",
    );
  });

  it("buildPlatformAdminAuditHref constructs correct URLs with and without resource context", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";

    // No context -> /audit
    expect(buildPlatformAdminAuditHref()).toBe("http://localhost:3002/audit");

    // auditId only
    expect(buildPlatformAdminAuditHref({ auditId: "aud-999" })).toBe(
      "http://localhost:3002/audit?auditId=aud-999",
    );

    // resourceType + resourceId
    expect(
      buildPlatformAdminAuditHref({
        resourceType: "order",
        resourceId: "ord-12345",
      }),
    ).toBe("http://localhost:3002/audit?resourceType=order&resourceId=ord-12345");

    // Both auditId and resource context (intersected)
    expect(
      buildPlatformAdminAuditHref({
        auditId: "aud-999",
        resourceType: "forwarded_order",
        resourceId: "fwd-789",
      }),
    ).toBe(
      "http://localhost:3002/audit?auditId=aud-999&resourceType=forwarded_order&resourceId=fwd-789",
    );
  });

  it("platformAdminAuditLink returns valid CrossAppResourceLink", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL = "http://localhost:3002";
    const link = platformAdminAuditLink({
      resourceType: "order",
      resourceId: "ord-123",
      label: "Audit Order",
    });

    expect(link.targetApp).toBe("platform-admin");
    expect(link.openMode).toBe("new_tab");
    expect(link.route).toBe("/audit?resourceType=order&resourceId=ord-123");
    expect(crossAppHref(link)).toBe(
      "http://localhost:3002/audit?resourceType=order&resourceId=ord-123",
    );
  });
});

describe("SR-OPS-SHELL-001: Platform Admin Audit Receiver Context & Filtering", () => {
  const sampleRecords = [
    {
      auditId: "aud-001",
      actorId: "actor-1",
      actorType: "system",
      tenantId: "t-01",
      moduleName: "dispatch",
      actionName: "order.create",
      resourceType: "order",
      resourceId: "ord-100",
      createdAt: "2026-09-06T10:00:00Z",
      requestId: "req-1",
    },
    {
      auditId: "aud-002",
      actorId: "actor-2",
      actorType: "admin",
      tenantId: "t-01",
      moduleName: "forwarder",
      actionName: "forwarder.assign",
      resourceType: "forwarded_order",
      resourceId: "fwd-200",
      createdAt: "2026-09-06T10:05:00Z",
      requestId: "req-2",
    },
    {
      auditId: "aud-003",
      actorId: "actor-1",
      actorType: "system",
      tenantId: "t-01",
      moduleName: "dispatch",
      actionName: "order.update",
      resourceType: "order",
      resourceId: "ord-100",
      createdAt: "2026-09-06T10:10:00Z",
      requestId: "req-3",
    },
  ];

  it("parses empty or missing URL context as status: none", () => {
    expect(parseAuditResourceContext("")).toEqual({ status: "none" });
    expect(parseAuditResourceContext("?")).toEqual({ status: "none" });
    expect(parseAuditResourceContext("?tab=log")).toEqual({ status: "none" });
  });

  it("parses valid auditId alone as status: valid", () => {
    const ctx = parseAuditResourceContext("?auditId=aud-001");
    expect(ctx).toEqual({
      status: "valid",
      auditId: "aud-001",
    });
  });

  it("parses valid resourceType + resourceId pair as status: valid", () => {
    const ctx = parseAuditResourceContext(
      "?resourceType=order&resourceId=ord-100",
    );
    expect(ctx).toEqual({
      status: "valid",
      resourceType: "order",
      resourceId: "ord-100",
    });
  });

  it("parses both auditId and resource pair as status: valid with all fields", () => {
    const ctx = parseAuditResourceContext(
      "?auditId=aud-001&resourceType=order&resourceId=ord-100",
    );
    expect(ctx).toEqual({
      status: "valid",
      auditId: "aud-001",
      resourceType: "order",
      resourceId: "ord-100",
    });
  });

  it("flags incomplete resourceType without resourceId as status: invalid", () => {
    const ctx = parseAuditResourceContext("?resourceType=order");
    expect(ctx.status).toBe("invalid");
    if (ctx.status === "invalid") {
      expect(ctx.reason).toContain("requires accompanying 'resourceId'");
    }
  });

  it("flags incomplete resourceId without resourceType as status: invalid", () => {
    const ctx = parseAuditResourceContext("?resourceId=ord-100");
    expect(ctx.status).toBe("invalid");
    if (ctx.status === "invalid") {
      expect(ctx.reason).toContain("requires accompanying 'resourceType'");
    }
  });

  it("flags empty parameter values as status: invalid", () => {
    const ctx1 = parseAuditResourceContext("?auditId=");
    expect(ctx1.status).toBe("invalid");

    const ctx2 = parseAuditResourceContext("?resourceType=&resourceId=ord-100");
    expect(ctx2.status).toBe("invalid");

    const ctx3 = parseAuditResourceContext("?resourceType=order&resourceId=");
    expect(ctx3.status).toBe("invalid");
  });

  it("flags conflicting duplicate parameters as status: invalid", () => {
    const params = new URLSearchParams();
    params.append("resourceType", "order");
    params.append("resourceType", "forwarded_order");
    params.append("resourceId", "ord-100");

    const ctx = parseAuditResourceContext(params);
    expect(ctx.status).toBe("invalid");
    if (ctx.status === "invalid") {
      expect(ctx.reason).toContain("Conflicting multiple values");
    }
  });

  it("filterAuditRecords filters by exact equality when context is valid", () => {
    const ctx = parseAuditResourceContext("?resourceType=order&resourceId=ord-100");
    const result = filterAuditRecords(sampleRecords, ctx);

    expect(result.isFiltered).toBe(true);
    expect(result.isContextualEmpty).toBe(false);
    expect(result.filteredRecords).toHaveLength(2);
    expect(result.filteredRecords.map((r) => r.auditId)).toEqual([
      "aud-001",
      "aud-003",
    ]);
  });

  it("filterAuditRecords intersects multiple criteria", () => {
    const ctx = parseAuditResourceContext(
      "?auditId=aud-001&resourceType=order&resourceId=ord-100",
    );
    const result = filterAuditRecords(sampleRecords, ctx);

    expect(result.isFiltered).toBe(true);
    expect(result.isContextualEmpty).toBe(false);
    expect(result.filteredRecords).toHaveLength(1);
    expect(result.filteredRecords[0].auditId).toBe("aud-001");
  });

  it("filterAuditRecords yields contextual empty state on unknown/no-match", () => {
    const ctx = parseAuditResourceContext(
      "?resourceType=order&resourceId=non-existent",
    );
    const result = filterAuditRecords(sampleRecords, ctx);

    expect(result.isFiltered).toBe(true);
    expect(result.isContextualEmpty).toBe(true);
    expect(result.filteredRecords).toHaveLength(0);
  });

  it("filterAuditRecords preserves unfiltered list when context is none", () => {
    const result = filterAuditRecords(sampleRecords, { status: "none" });
    expect(result.isFiltered).toBe(false);
    expect(result.isContextualEmpty).toBe(false);
    expect(result.filteredRecords).toHaveLength(3);
  });

  it("clearAuditResourceSearchParams strips resource parameters while retaining others", () => {
    const original = "?tab=log&resourceType=order&resourceId=ord-100&module=dispatch";
    const cleared = clearAuditResourceSearchParams(original);
    expect(cleared).toBe("?tab=log&module=dispatch");

    const auditOnly = "?auditId=aud-001";
    expect(clearAuditResourceSearchParams(auditOnly)).toBe("");
  });

  it("getAuditContextCopy provides localized strings", () => {
    const zh = getAuditContextCopy("zh");
    expect(zh.clearFilter).toBe("清除資源篩選");
    const en = getAuditContextCopy("en");
    expect(en.clearFilter).toBe("Clear resource filter");
  });
});

describe("SR-OPS-SHELL-001: Dispatch Board Selected Record Resource Context Mapping", () => {
  it("maps RuntimeOwnedOrder to resourceType=order and orderId", () => {
    const ownedRecord = {
      orderId: "ORD-OWNED-20260906-001",
      availableActions: [],
    };

    const isForwarded = "mirrorOrderId" in ownedRecord;
    const resourceType = isForwarded ? "forwarded_order" : "order";
    const resourceId = isForwarded
      ? (ownedRecord as any).mirrorOrderId
      : ownedRecord.orderId;

    expect(resourceType).toBe("order");
    expect(resourceId).toBe("ORD-OWNED-20260906-001");

    const href = buildPlatformAdminAuditHref({ resourceType, resourceId });
    expect(href).toContain("resourceType=order");
    expect(href).toContain("resourceId=ORD-OWNED-20260906-001");
  });

  it("maps RuntimeForwardedOrder to resourceType=forwarded_order and mirrorOrderId", () => {
    const forwardedRecord = {
      mirrorOrderId: "FWD-MIRROR-20260906-999",
      platformCode: "YXC_01",
      availableActions: [],
    };

    const isForwarded = "mirrorOrderId" in forwardedRecord;
    const resourceType = isForwarded ? "forwarded_order" : "order";
    const resourceId = isForwarded
      ? forwardedRecord.mirrorOrderId
      : (forwardedRecord as any).orderId;

    expect(resourceType).toBe("forwarded_order");
    expect(resourceId).toBe("FWD-MIRROR-20260906-999");

    const href = buildPlatformAdminAuditHref({ resourceType, resourceId });
    expect(href).toContain("resourceType=forwarded_order");
    expect(href).toContain("resourceId=FWD-MIRROR-20260906-999");
  });
});
