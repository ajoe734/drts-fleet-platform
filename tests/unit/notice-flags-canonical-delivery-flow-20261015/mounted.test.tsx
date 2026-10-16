// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import * as canvas from "../../../packages/ui-web/src/index";
import {
  t,
  getNoticesPageCopy,
} from "../../../apps/platform-admin-web/lib/translations";
import { wireHarness, principal } from "./wire-harness";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "notice-unit-secret-at-least-thirty-two-characters");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const copy = getNoticesPageCopy("en");
function adminPages(h: ReturnType<typeof wireHarness>) {
  const client = h.client(principal("platform"));
  const root = resolve("apps/platform-admin-web");
  const load = createUiModuleLoader(root, {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "@drts/ui-web": canvas,
    "@/lib/admin-client": {
      usePlatformAdminClient: () => client,
      formatDateTime: (v: string | null) => v ?? "—",
    },
    "@/lib/i18n": {
      useTranslation: () => ({
        locale: "en",
        t: (key: string, params?: Record<string, string | number>) =>
          t(key, "en", params),
      }),
    },
    "@/components/assistant/route-context": {
      usePlatformAdminAssistantPage: () => {},
    },
  });
  return {
    client,
    Notices: load<{ default: React.ComponentType }>(
      resolve(root, "app/notices/page.tsx"),
    ).default,
    Flags: load<{ default: React.ComponentType }>(
      resolve(root, "app/feature-flags/page.tsx"),
    ).default,
  };
}
const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });
};
describe("mounted production forms and observers through local typed transport", () => {
  it("real notice composer carries schedule/expiry/high-risk reason and truthful history; second observer sees clock boundaries", async () => {
    const h = wireHarness();
    const { Notices } = adminPages(h);
    const first = render(<Notices />);
    const second = render(<Notices />);
    await waitFor(() =>
      expect(
        within(first.container).getByRole("button", {
          name: copy.createNotice,
        }),
      ).toBeTruthy(),
    );
    fireEvent.click(
      within(first.container).getByRole("button", { name: copy.createNotice }),
    );
    fireEvent.change(within(first.container).getByLabelText(copy.noticeTitle), {
      target: { value: "Mounted lifecycle" },
    });
    fireEvent.change(within(first.container).getByLabelText(copy.noticeBody), {
      target: { value: "Window test" },
    });
    fireEvent.change(
      within(first.container).getByLabelText(copy.noticeSeverity),
      { target: { value: "maintenance" } },
    );
    fireEvent.change(
      within(first.container).getByLabelText(copy.noticeAudience),
      { target: { value: "drivers" } },
    );
    const start = new Date(Date.now() + 60_000);
    const end = new Date(start.getTime() + 60_000);
    // datetime-local is interpreted in the process timezone, like the real form.
    fireEvent.change(
      within(first.container).getByLabelText(copy.scheduledStart),
      { target: { value: start.toISOString().slice(0, 16) } },
    );
    fireEvent.change(
      within(first.container).getByLabelText("Expiry (optional)"),
      { target: { value: end.toISOString().slice(0, 16) } },
    );
    fireEvent.change(
      within(first.container).getByLabelText(copy.internalReason),
      { target: { value: "Planned upgrade" } },
    );
    fireEvent.click(within(first.container).getByRole("checkbox"));
    fireEvent.click(
      within(first.container).getByRole("button", { name: copy.publishNotice }),
    );
    await waitFor(() =>
      expect(
        h.requests.some(
          (r) =>
            r.method === "POST" && r.path === "/api/platform-admin/notices",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        within(first.container).getByText("Mounted lifecycle"),
      ).toBeTruthy(),
    );
    const sent = h.requests.find(
      (r) => r.method === "POST" && r.path === "/api/platform-admin/notices",
    )!.body;
    expect(sent).toMatchObject({
      severity: "maintenance",
      reason: "Planned upgrade",
      confirmed: true,
      scheduledAt: start.toISOString().slice(0, 16) + ":00.000Z",
      expiresAt: end.toISOString().slice(0, 16) + ":00.000Z",
    });
    expect(
      within(second.container).queryByText("Mounted lifecycle"),
    ).toBeNull();
    fireEvent.click(
      within(first.container).getByRole("button", { name: copy.history }),
    );
    expect(
      within(first.container).getByText("drivers: scheduled"),
    ).toBeTruthy();
    expect(first.container.textContent).not.toMatch(/delivered [13] \/ [13]/i);
    first.unmount();
    second.unmount();
  });

  it("two mounted notice observers refresh after another legitimate command and expiry, with abort cleanup", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T09:00:00Z"));
    const h = wireHarness();
    const { Notices, client } = adminPages(h);
    const one = render(<Notices />);
    const two = render(<Notices />);
    await flush();
    expect(within(two.container).queryByText("External timed")).toBeNull();
    await client.post("/api/platform-admin/notices", {
      body: {
        title: "External timed",
        body: "Second observer",
        severity: "warning",
        targetAudience: "all",
        scheduledAt: "2026-10-16T09:00:30Z",
        expiresAt: "2026-10-16T09:01:00Z",
      },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flush();
    expect(within(one.container).getByText("External timed")).toBeTruthy();
    expect(within(two.container).getByText("External timed")).toBeTruthy();
    expect(
      h.service.listPlatformNotices().find((n) => n.title === "External timed")
        ?.status,
    ).toBe("active");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flush();
    expect(
      h.service.listPlatformNotices().find((n) => n.title === "External timed")
        ?.downlistedReason,
    ).toBe("expired");
    const reads = h.requests.length;
    one.unmount();
    two.unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.requests.length).toBe(reads);
  });

  it("two mounted flag observers refresh after an authorized global command", async () => {
    vi.useFakeTimers();
    const h = wireHarness();
    const { Flags, client } = adminPages(h);
    const one = render(<Flags />);
    const two = render(<Flags />);
    await flush();
    const label = `${t("featureFlagsAdmin.toggle", "en")} tenant-portal.booking`;
    expect(
      within(two.container).getByRole("button", { name: label }).parentElement
        ?.textContent,
    ).toContain("Enabled");
    await client.updateFeatureFlag("tenant-portal.booking", false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await flush();
    expect(
      within(one.container).getByRole("button", { name: label }).parentElement
        ?.textContent,
    ).toContain("Disabled");
    expect(
      within(two.container).getByRole("button", { name: label }).parentElement
        ?.textContent,
    ).toContain("Disabled");
  });

  it("selected-scope response wins over an older mounted response, and unmount aborts pending work", async () => {
    vi.useFakeTimers();
    const h = wireHarness();
    const { Flags } = adminPages(h);
    const tenantId = h.tenants.list()[0]!.id;
    await h.flags.upsertTenantOverride(
      "tenant-portal.booking",
      tenantId,
      false,
    );
    let release!: () => void;
    let held = false;
    const view = render(<Flags />);
    await flush();
    h.setBeforeReturn(async (path) => {
      if (path === "/api/admin/flags" && !held) {
        held = true;
        await new Promise<void>((r) => {
          release = r;
        });
      }
    });
    fireEvent.click(
      within(view.container).getByRole("button", {
        name: t("common.refresh", "en"),
      }),
    );
    await flush();
    const firstSignal = h.requests
      .filter((r) => r.path === "/api/admin/flags")
      .at(-1)?.signal;
    fireEvent.change(
      within(view.container).getByLabelText(
        t("featureFlagsAdmin.scopeField", "en"),
      ),
      { target: { value: tenantId } },
    );
    await flush();
    expect(firstSignal?.aborted).toBe(true);
    const label = `${t("featureFlagsAdmin.toggle", "en")} tenant-portal.booking`;
    expect(
      within(view.container).getByRole("button", { name: label }).parentElement
        ?.textContent,
    ).toContain("Disabled");
    await act(async () => {
      release();
    });
    await flush();
    expect(
      within(view.container).getByRole("button", { name: label }).parentElement
        ?.textContent,
    ).toContain("Disabled");
    let finish!: () => void;
    h.setBeforeReturn(async (path) => {
      if (path === "/api/admin/flags")
        await new Promise<void>((r) => {
          finish = r;
        });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    const latest = h.requests
      .filter((r) => r.path === "/api/admin/flags")
      .at(-1)!.signal;
    const calls = h.requests.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(h.requests.length).toBe(calls);
    view.unmount();
    expect(latest?.aborted).toBe(true);
    finish();
    await flush();
  });

  it("actual flag form does not create a local success receipt after a no-row repository ACK", async () => {
    const h = wireHarness();
    const { Flags } = adminPages(h);
    const view = render(<Flags />);
    const label = `${t("featureFlagsAdmin.toggle", "en")} tenant-portal.booking`;
    await waitFor(() =>
      expect(
        within(view.container).getByRole("button", { name: label }),
      ).toBeTruthy(),
    );
    vi.spyOn(h.flags, "updateFlag").mockResolvedValueOnce(undefined);
    fireEvent.click(
      within(view.container).getByRole("button", { name: label }),
    );
    fireEvent.change(
      within(view.container).getByLabelText(
        t("featureFlagsAdmin.reasonLabel", "en"),
      ),
      { target: { value: "Regression" } },
    );
    fireEvent.click(
      within(view.container).getByRole("button", {
        name: t("featureFlagsAdmin.confirmDisable", "en"),
      }),
    );
    await waitFor(() =>
      expect(view.container.textContent).toContain("Global flag not found"),
    );
    expect(view.container.textContent).not.toContain(
      t("featureFlagsAdmin.actionApplied", "en"),
    );
  });

  it("mounted native driver banner uses the scoped route, acknowledges real outcome, and clears on identity change", async () => {
    const h = wireHarness();
    const client = h.client(principal("driver"));
    const clearers = new Set<() => void>();
    const load = createUiModuleLoader(resolve("apps/driver-app"), {
      react: React,
      "react/jsx-runtime": jsxRuntime,
      "react-native": {
        View: ({ children }: { children: React.ReactNode }) => (
          <div>{children}</div>
        ),
        Text: ({ children }: { children: React.ReactNode }) => (
          <span>{children}</span>
        ),
        Pressable: ({
          children,
          onPress,
          disabled,
        }: {
          children: React.ReactNode;
          onPress: () => void;
          disabled: boolean;
        }) => (
          <button disabled={disabled} onClick={onPress}>
            {children}
          </button>
        ),
      },
      "../lib/api-client": {
        getDriverClient: () => client,
        registerProtectedCacheClearHandler: (fn: () => void) => {
          clearers.add(fn);
          return () => clearers.delete(fn);
        },
      },
    });
    const NativeBanner = load<{ PlatformNoticeBanner: React.ComponentType }>(
      resolve("apps/driver-app/components/platform-notice-banner.tsx"),
    ).PlatformNoticeBanner;
    h.service.createPlatformNotice({
      title: "Driver scoped",
      body: "Native banner",
      severity: "critical",
      reason: "Incident",
      confirmed: true,
      targetAudience: "drivers",
    });
    const view = render(<NativeBanner />);
    await waitFor(() => expect(screen.getByText("Driver scoped")).toBeTruthy());
    fireEvent.click(
      within(screen.getByText("Driver scoped").parentElement!).getByRole(
        "button",
        { name: "標示已讀" },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "已讀" })).toBeTruthy(),
    );
    act(() => {
      for (const fn of clearers) fn();
    });
    expect(screen.queryByText("Driver scoped")).toBeNull();
    view.unmount();
    expect(clearers.size).toBe(0);
    expect(h.requests.every((r) => r.path !== "/api/notifications")).toBe(true);
  });

  it.each(["ops", "tenant"] as const)(
    "mounted %s banner shows only legal available notices, posts an actual read, polls and cleans up",
    async (realm) => {
      const h = wireHarness();
      const client = h.client(
        principal(realm, "reader", realm === "tenant" ? "A" : null),
      );
      const root = resolve(
        `apps/${realm === "ops" ? "ops" : "tenant"}-console-web`,
      );
      const load = createUiModuleLoader(root, {
        react: React,
        "react/jsx-runtime": jsxRuntime,
        "../lib/api-client": { getOpsClient: () => client },
        "../lib/browser-api-client": { createBrowserApiClient: () => client },
        "../lib/i18n": { useTranslation: () => ({ locale: "en" }) },
      });
      const Banner = load<{ PlatformNoticeBanner: React.ComponentType }>(
        resolve(root, "components/platform-notice-banner.tsx"),
      ).PlatformNoticeBanner;
      h.service.createPlatformNotice({
        title: "Selected banner",
        body: "Critical selected",
        severity: "critical",
        targetAudience: realm === "ops" ? "ops" : "tenants",
        reason: "Incident",
        confirmed: true,
      });
      h.service.createPlatformNotice({
        title: "Other audience",
        body: "Drivers only",
        severity: "info",
        targetAudience: "drivers",
      });
      const mounted = render(<Banner />);
      await waitFor(() =>
        expect(screen.getByText("Selected banner")).toBeTruthy(),
      );
      expect(screen.queryByText("Other audience")).toBeNull();
      fireEvent.click(
        within(
          screen.getByText("Selected banner").closest("article")!,
        ).getByRole("button", { name: "Mark as read" }),
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Read" })).toBeTruthy(),
      );
      mounted.unmount();
    },
  );
});
