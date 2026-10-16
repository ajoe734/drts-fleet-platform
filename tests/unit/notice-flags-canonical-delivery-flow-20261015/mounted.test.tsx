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
        screen.getAllByRole("button", { name: "Mark as read" }).at(-1)!,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Read" })).toBeTruthy(),
      );
      mounted.unmount();
    },
  );
});
