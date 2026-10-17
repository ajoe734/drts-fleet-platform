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
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { buildCanvasTheme } from "../../../packages/ui-web/src/canvas-tokens";
import { sourceModuleLoader } from "./source-module-loader";
import { principal, wireHarness } from "./wire-harness";

beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "notice-unit-secret-at-least-thirty-two-characters");
  for (const key of [
    "JWT_KEY_RING_JSON",
    "JWT_PRIVATE_KEY",
    "JWT_PUBLIC_KEY",
    "JWT_ALGORITHMS",
  ])
    vi.stubEnv(key, "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  for (const key of ["APP_ENV", "DRTS_ENV", "NODE_ENV"])
    vi.stubEnv(key, "test");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function workspace(h: ReturnType<typeof wireHarness>) {
  const client = h.client(principal("driver"));
  const clearers = new Set<() => void>();
  // Other workspace resources are external to this notice command. Actual
  // notice SDK, signed guard, controller, lifecycle and audit store stay real.
  vi.spyOn(client, "listUnifiedDriverTasks").mockResolvedValue([]);
  vi.spyOn(client, "getPlatformPresence").mockRejectedValue(
    new Error("Unavailable platform fixture"),
  );
  vi.spyOn(client, "isFeatureEnabled").mockResolvedValue(false);
  const root = resolve("apps/driver-app");
  const pure = sourceModuleLoader();
  const Container = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  const Button = ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
    accessibilityLabel?: string;
  }) => (
    <button
      onClick={onPress}
      disabled={disabled}
      aria-label={accessibilityLabel}
    >
      {children}
    </button>
  );
  const load = sourceModuleLoader(
    {
      react: React,
      "react/jsx-runtime": jsxRuntime,
      "react-native": {
        View: Container,
        Text: Container,
        Pressable: Button,
        ActivityIndicator: () => null,
        StyleSheet: { create: (v: unknown) => v },
      },
      "expo-router": { useRouter: () => ({ push() {} }), Redirect: () => null },
      "@expo/vector-icons": { Ionicons: () => null },
      "@/components/canvas-primitives": {
        Shell: Container,
        Card: Container,
        Pill: Container,
        Banner: Container,
        KPI: () => null,
        Btn: Button,
        PageHeader: ({
          title,
          subtitle,
          actions,
        }: {
          title: React.ReactNode;
          subtitle: React.ReactNode;
          actions: React.ReactNode;
        }) => (
          <div>
            {title}
            {subtitle}
            {actions}
          </div>
        ),
        driverCanvasTheme: buildCanvasTheme(),
      },
      "@/lib/api-client": {
        getDriverClient: () => client,
        getDriverId: () => "driver-reader",
        initializeDriverIdentity: async () => {},
        isDriverIdentityProvisioned: () => true,
        registerProtectedCacheClearHandler: (callback: () => void) => {
          clearers.add(callback);
          return () => clearers.delete(callback);
        },
        formatDriverError: (e: Error) => e.message,
      },
      "@/lib/driver-workspace-cockpit": pure(
        resolve(root, "lib/driver-workspace-cockpit.ts"),
      ),
      "@/lib/money": pure(resolve(root, "lib/money.ts")),
      "@/lib/strings": pure(resolve(root, "lib/strings.ts")),
      // The separate banner has its own mounted coverage; exercise the original
      // workspace inbox controls here without adding a second notification reader.
      "../components/platform-notice-banner": {
        PlatformNoticeBanner: () => null,
      },
    },
    ["apps/driver-app/app/index.tsx"],
  );
  return {
    Workspace: load<{ default: React.ComponentType }>(
      resolve(root, "app/index.tsx"),
    ).default,
    clearers,
  };
}

it.each(["已讀", "全部標記已讀"])(
  "actual workspace %s cannot manufacture a read timestamp when the store has not acknowledged its command",
  async (action) => {
    const h = wireHarness();
    for (const seed of h.service.listPlatformNotices())
      h.service.resolveNotice(seed.noticeId);
    const notice = h.service.createPlatformNotice({
      title: "Workspace receipt",
      body: "Original inbox caller",
      severity: "info",
      targetAudience: "drivers",
    });
    const { Workspace } = workspace(h);
    render(<Workspace />);
    await waitFor(() => expect(screen.getByText("1 則待讀通知")).toBeTruthy());
    fireEvent.click(screen.getByText("1 則待讀通知"));
    const noWrite = vi
      .spyOn(h.audit, "markNotificationsRead")
      .mockReturnValueOnce({ updated: 0 } as ReturnType<
        typeof h.audit.markNotificationsRead
      >);
    fireEvent.click(screen.getByRole("button", { name: action, exact: true }));
    await waitFor(() => expect(noWrite).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "全部標記已讀",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    expect(screen.getByText("1 則待讀通知")).toBeTruthy();
    expect(
      h.service
        .listPlatformNotices()
        .find((n) => n.noticeId === notice.noticeId)
        ?.outcomes.find((o) => o.recipientId === "driver-reader"),
    ).toMatchObject({ state: "available", readAt: null });
    noWrite.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: action, exact: true }));
    await waitFor(() => expect(screen.getByText("通知已清空")).toBeTruthy());
    const outcome = h.service
      .listPlatformNotices()
      .find((n) => n.noticeId === notice.noticeId)
      ?.outcomes.find((o) => o.recipientId === "driver-reader");
    expect(outcome).toMatchObject({
      state: "read",
      readAt: expect.any(String),
    });
    expect(
      h.requests.some(
        (r) =>
          r.method === "POST" &&
          r.path === `/api/driver/platform-notices/${notice.noticeId}/read`,
      ),
    ).toBe(true);
    expect(h.requests.some((r) => r.path === "/api/notifications/read")).toBe(
      false,
    );
  },
);

it.each(["identity clear", "unmount"])(
  "pending workspace reads do not overlap or publish after %s",
  async (boundary) => {
    const h = wireHarness();
    const { Workspace, clearers } = workspace(h);
    const view = render(<Workspace />);
    await waitFor(() => expect(screen.getByText(/則待讀通知/)).toBeTruthy());
    fireEvent.click(screen.getByText(/則待讀通知/));
    let release!: () => void;
    h.setBeforeReturn(async (path) => {
      if (path === "/api/driver/platform-notices")
        await new Promise<void>((resolve) => {
          release = resolve;
        });
    });
    fireEvent.click(screen.getByRole("button", { name: "全部標記已讀" }));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    const held = h.requests.at(-1)!;
    fireEvent.click(screen.getByRole("button", { name: "全部標記已讀" }));
    expect(h.requests.at(-1)).toBe(held);
    if (boundary === "unmount") view.unmount();
    else
      act(() => {
        for (const callback of clearers) callback();
      });
    expect(held.signal?.aborted).toBe(true);
    const count = h.requests.length;
    await act(async () => {
      release();
    });
    expect(h.requests.length).toBe(count);
    expect(screen.queryByText(/則待讀通知/)).toBeNull();
    view.unmount();
    expect(clearers.size).toBe(0);
  },
);
