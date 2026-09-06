import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  EDGE_GAP,
  WIDGET_MAX_WIDTH,
  buildDefaultState,
  clampRect,
  readStoredState,
  resolveDockedPosition,
  writeStoredState,
  type WidgetState,
} from "../../../../apps/ops-console-web/components/ops-assistant/widget-geometry";
import { resolveAssistantAuditHref } from "../../../../apps/ops-console-web/components/ops-assistant/audit-link";

const DESKTOP_VIEWPORT = { width: 1440, height: 1000 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

describe("SR-OPS-SHELL-001: assistant widget must not obstruct console controls by default (R19)", () => {
  it("defaults to closed on first visit at 1440px so no console control starts covered", () => {
    const state = buildDefaultState(DESKTOP_VIEWPORT);
    expect(state.closed).toBe(true);
  });

  it("defaults to closed on first visit at a 390px mobile viewport", () => {
    const state = buildDefaultState(MOBILE_VIEWPORT);
    expect(state.closed).toBe(true);
  });

  it("never sizes the default panel wider than a 390px viewport allows", () => {
    const state = buildDefaultState(MOBILE_VIEWPORT);
    expect(state.width).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.width - EDGE_GAP * 2,
    );
    expect(state.x).toBeGreaterThanOrEqual(EDGE_GAP);
    expect(state.x + state.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
  });

  it("clamps an oversized/dragged rect back inside a 390px viewport (right-docked)", () => {
    const oversized = { x: 900, y: 900, width: WIDGET_MAX_WIDTH, height: 720 };
    const docked = resolveDockedPosition("right", oversized, MOBILE_VIEWPORT);

    expect(docked.width).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.width - EDGE_GAP * 2,
    );
    expect(docked.x).toBeGreaterThanOrEqual(EDGE_GAP);
    expect(docked.x + docked.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    expect(docked.y + docked.height).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.height,
    );
  });

  it("clamps an oversized rect back inside a 1440px viewport (right-docked)", () => {
    const oversized = { x: 4000, y: 4000, width: 2000, height: 2000 };
    const docked = resolveDockedPosition(
      "right",
      oversized,
      DESKTOP_VIEWPORT,
    );

    expect(docked.x).toBeGreaterThanOrEqual(EDGE_GAP);
    expect(docked.x + docked.width).toBeLessThanOrEqual(
      DESKTOP_VIEWPORT.width,
    );
    expect(docked.y + docked.height).toBeLessThanOrEqual(
      DESKTOP_VIEWPORT.height,
    );
  });

  it("clampRect never returns a rect that overflows either edge of a narrow viewport", () => {
    const rect = { x: -100, y: -100, width: 900, height: 900 };
    const clamped = clampRect(rect, MOBILE_VIEWPORT);
    expect(clamped.x).toBeGreaterThanOrEqual(EDGE_GAP);
    expect(clamped.y).toBeGreaterThanOrEqual(EDGE_GAP);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.width,
    );
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(
      MOBILE_VIEWPORT.height,
    );
  });
});

describe("SR-OPS-SHELL-001: persisted widget state (reload keeps a reasonable layout)", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    };
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("round-trips an explicit open state through write/read", () => {
    const openState: WidgetState = {
      x: 40,
      y: 60,
      width: 400,
      height: 340,
      minimized: false,
      closed: false,
      docked: "free",
    };
    writeStoredState(openState);
    expect(readStoredState()).toEqual(openState);
  });

  it("defaults a persisted-but-incomplete record to closed rather than open", () => {
    const win = (globalThis as { window: { localStorage: Storage } }).window;
    win.localStorage.setItem(
      "ops-console.assistant-widget.v1",
      JSON.stringify({ x: 10, y: 10, width: 400, height: 300 }),
    );

    const restored = readStoredState();
    expect(restored?.closed).toBe(true);
  });
});

describe("SR-OPS-SHELL-001: assistant audit deep-link resolves cross-app, not an ops-console 404 (R18)", () => {
  const ENV_KEYS = [
    "NEXT_PUBLIC_PLATFORM_ADMIN_URL",
    "DRTS_PLATFORM_ADMIN_URL",
  ] as const;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("passes an explicit backend-provided auditHref through unchanged", () => {
    const href = resolveAssistantAuditHref(
      "https://platform-admin.internal/audit?auditId=AUD-1",
      "AUD-1",
    );
    expect(href).toBe("https://platform-admin.internal/audit?auditId=AUD-1");
  });

  it("falls back to the platform-admin cross-app base, not a bare ops-console route", () => {
    const href = resolveAssistantAuditHref(null, "AUD-42");

    // ops-console-web ships no /audit route (only platform-admin-web does),
    // so a bare relative fallback 404s on the ops origin. Regression guard
    // for R18: the fallback must carry the _apps/platform-admin prefix.
    expect(href).toBe("/_apps/platform-admin/audit?auditId=AUD-42");
    expect(href.startsWith("/audit")).toBe(false);
  });

  it("falls back the same way when auditHref is undefined", () => {
    const href = resolveAssistantAuditHref(undefined, "AUD-7");
    expect(href).toBe("/_apps/platform-admin/audit?auditId=AUD-7");
  });

  it("honors the deployed platform-admin base URL override for the fallback", () => {
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL =
      "https://platform-admin.drts.example";
    const href = resolveAssistantAuditHref(null, "AUD-9");
    expect(href).toBe(
      "https://platform-admin.drts.example/audit?auditId=AUD-9",
    );
  });

  it("percent-encodes the auditId in the fallback route", () => {
    const href = resolveAssistantAuditHref(null, "AUD/with space");
    expect(href).toBe(
      "/_apps/platform-admin/audit?auditId=AUD%2Fwith%20space",
    );
  });
});
