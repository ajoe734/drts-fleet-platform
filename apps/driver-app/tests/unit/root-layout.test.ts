import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

const mocks = vi.hoisted(() => ({
  addEventListener: vi.fn(),
  removeSubscription: vi.fn(),
  useSegments: vi.fn(() => [] as string[]),
  replace: vi.fn(),
  canDismiss: vi.fn(() => false),
  dismissAll: vi.fn(),
  initializeDriverLocationHeartbeat: vi.fn(),
  stopDriverLocationHeartbeat: vi.fn(async () => undefined),
  syncDriverLocationHeartbeat: vi.fn(),
  syncDriverIdentityBootstrap: vi.fn(),
  evaluateTrackingRecovery: vi.fn(),
  allowUnprovisionedDriverRoute: vi.fn(() => false),
  resetDriverAppToOnboarding: vi.fn(),
  getDriverIdentityIssue: vi.fn(() => null),
  initializeDriverIdentity: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(() => true),
  listDriverTasks: vi.fn(),
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (...args: unknown[]) => {
      mocks.addEventListener(...args);
      return { remove: mocks.removeSubscription };
    },
  },
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: (props: Record<string, unknown>) =>
    React.createElement("Text", props, props.children as never),
  View: (props: Record<string, unknown>) =>
    React.createElement("View", props, props.children as never),
}));

vi.mock("react-native-reanimated", () => ({}));

vi.mock("expo-router", () => {
  const Stack = Object.assign(
    (props: Record<string, unknown>) =>
      React.createElement("Stack", props, props.children as never),
    {
      Screen: (props: Record<string, unknown>) =>
        React.createElement("StackScreen", props),
    },
  );
  return {
    Stack,
    useRouter: () => ({
      replace: mocks.replace,
      canDismiss: mocks.canDismiss,
      dismissAll: mocks.dismissAll,
    }),
    useSegments: mocks.useSegments,
  };
});

vi.mock("expo-status-bar", () => ({ StatusBar: passthrough("StatusBar") }));
vi.mock("@react-navigation/native", () => ({
  ThemeProvider: passthrough("ThemeProvider"),
}));

vi.mock("@/lib/driver-location-heartbeat", () => ({
  initializeDriverLocationHeartbeat: mocks.initializeDriverLocationHeartbeat,
  stopDriverLocationHeartbeat: mocks.stopDriverLocationHeartbeat,
  syncDriverLocationHeartbeat: mocks.syncDriverLocationHeartbeat,
}));
vi.mock("@/lib/driver-identity-bootstrap", () => ({
  syncDriverIdentityBootstrap: mocks.syncDriverIdentityBootstrap,
}));
vi.mock("@/lib/driver-tracking-recovery", () => ({
  evaluateTrackingRecovery: mocks.evaluateTrackingRecovery,
}));
vi.mock("@/lib/driver-identity-routing", () => ({
  allowUnprovisionedDriverRoute: mocks.allowUnprovisionedDriverRoute,
  resetDriverAppToOnboarding: mocks.resetDriverAppToOnboarding,
}));
vi.mock("@/lib/api-client", () => ({
  formatDriverError: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  getDriverClient: () => ({ listDriverTasks: mocks.listDriverTasks }),
  getDriverClientOrNull: () =>
    mocks.isDriverIdentityProvisioned()
      ? { listDriverTasks: mocks.listDriverTasks }
      : null,
  getDriverIdentityIssue: mocks.getDriverIdentityIssue,
  initializeDriverIdentity: mocks.initializeDriverIdentity,
  isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
}));

import RootLayout from "../../app/_layout";
import {
  markDriverSessionSignedIn,
  markDriverSessionSignedOut,
  resetDriverSessionLifecycleForTests,
} from "../../lib/driver-session-lifecycle";

async function flush() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
}

async function renderLayout() {
  let renderer: any;
  await act(async () => {
    renderer = create(React.createElement(RootLayout));
    await flush();
  });
  return renderer;
}

function screens(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "StackScreen")
    .map((node: any) => [node.props.name, node.props.options?.title]);
}

describe("RootLayout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.addEventListener.mockReset();
    mocks.removeSubscription.mockReset();
    mocks.useSegments.mockReset().mockReturnValue([]);
    mocks.replace.mockReset();
    mocks.initializeDriverLocationHeartbeat.mockReset();
    mocks.stopDriverLocationHeartbeat.mockReset().mockResolvedValue(undefined);
    mocks.syncDriverLocationHeartbeat.mockReset();
    resetDriverSessionLifecycleForTests();
    mocks.syncDriverIdentityBootstrap.mockReset().mockResolvedValue(undefined);
    mocks.evaluateTrackingRecovery.mockReset();
    mocks.allowUnprovisionedDriverRoute.mockReset().mockReturnValue(false);
    mocks.resetDriverAppToOnboarding.mockReset();
    mocks.isDriverIdentityProvisioned.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("render failures", () => {
    it("shows a plain Chinese notice instead of a stack trace", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.useSegments.mockImplementation(() => {
        throw new Error("boom at app/(tabs)/index/index.tsx:2491");
      });

      let renderer: any;
      await act(async () => {
        renderer = create(React.createElement(RootLayout));
        await flush();
      });

      const rendered = JSON.stringify(renderer.toJSON());
      expect(rendered).toContain("畫面暫時無法顯示");
      expect(rendered).not.toContain("boom");
      expect(rendered).not.toContain(".tsx");
      expect(rendered).not.toContain("EXPO_PUBLIC");

      warn.mockRestore();
      error.mockRestore();
    });
  });

  describe("navigation stack", () => {
    it("mounts the tab shell as the only top-level route", async () => {
      const renderer = await renderLayout();

      expect(screens(renderer)).toEqual([["(tabs)", undefined]]);
    });

    it("hides the native header", async () => {
      const renderer = await renderLayout();
      const stack = renderer.root.findByType("Stack");

      expect(stack.props.screenOptions.headerShown).toBe(false);
    });

    it("wraps the stack in the driver navigation theme", async () => {
      const renderer = await renderLayout();
      expect(
        renderer.root.findByType("ThemeProvider").props.value,
      ).toBeTruthy();
    });
  });

  describe("heartbeat bootstrap", () => {
    it("initialises location tracking exactly once on mount", async () => {
      await renderLayout();
      expect(mocks.initializeDriverLocationHeartbeat).toHaveBeenCalledTimes(1);
    });

    it("runs the identity bootstrap with the live driver dependencies", async () => {
      await renderLayout();

      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);
      const input = mocks.syncDriverIdentityBootstrap.mock.calls[0][0] as any;
      expect(input.allowUnprovisionedRoute).toBe(false);
      expect(input.cancelled()).toBe(false);
      expect(input.isDriverIdentityProvisioned).toBe(
        mocks.isDriverIdentityProvisioned,
      );
      expect(input.syncDriverLocationHeartbeat).toBe(
        mocks.syncDriverLocationHeartbeat,
      );
      expect(input.evaluateTrackingRecovery).toBe(
        mocks.evaluateTrackingRecovery,
      );
    });

    it("passes the current route segments to the unprovisioned-route gate", async () => {
      mocks.useSegments.mockReturnValue(["onboarding"]);
      mocks.allowUnprovisionedDriverRoute.mockReturnValue(true);
      await renderLayout();

      expect(mocks.allowUnprovisionedDriverRoute).toHaveBeenCalledWith([
        "onboarding",
      ]);
      expect(
        (mocks.syncDriverIdentityBootstrap.mock.calls[0][0] as any)
          .allowUnprovisionedRoute,
      ).toBe(true);
    });

    it("re-syncs whenever the app returns to the foreground", async () => {
      await renderLayout();
      const listener = mocks.addEventListener.mock.calls[0][1] as (
        state: string,
      ) => void;

      await act(async () => {
        listener("active");
        await flush();
      });
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(2);
    });

    it("does not re-sync when the app goes to the background", async () => {
      await renderLayout();
      const listener = mocks.addEventListener.mock.calls[0][1] as (
        state: string,
      ) => void;

      await act(async () => {
        listener("background");
        await flush();
      });
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);
    });

    it("revalidates the session every 10 minutes", async () => {
      await renderLayout();

      await act(async () => {
        vi.advanceTimersByTime(10 * 60 * 1000);
        await flush();
      });
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(2);

      await act(async () => {
        vi.advanceTimersByTime(10 * 60 * 1000);
        await flush();
      });
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(3);
    });

    it("does not revalidate before the interval elapses", async () => {
      await renderLayout();

      await act(async () => {
        vi.advanceTimersByTime(9 * 60 * 1000);
        await flush();
      });
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);
    });

    it("tears down the listener and interval on unmount", async () => {
      const renderer = await renderLayout();

      await act(async () => {
        renderer.unmount();
      });

      expect(mocks.removeSubscription).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(30 * 60 * 1000);
        await flush();
      });
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);
    });

    it("marks the run cancelled after unmount", async () => {
      const renderer = await renderLayout();
      const input = mocks.syncDriverIdentityBootstrap.mock.calls[0][0] as any;

      await act(async () => {
        renderer.unmount();
      });
      expect(input.cancelled()).toBe(true);
    });

    it("returns no tasks instead of throwing when the session is gone", async () => {
      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await renderLayout();

      const input = mocks.syncDriverIdentityBootstrap.mock.calls[0][0] as any;
      await expect(input.listDriverTasks()).resolves.toEqual([]);
      expect(mocks.listDriverTasks).not.toHaveBeenCalled();
    });

    it("warns rather than rejecting when a bootstrap run throws", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onUnhandled);
      mocks.syncDriverIdentityBootstrap.mockRejectedValue(
        new Error("裝置同步逾時"),
      );

      try {
        await renderLayout();
        await act(async () => {
          await flush();
        });
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }

      expect(rejections).toEqual([]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it("stops location tracking when the driver signs out", async () => {
      await act(async () => {
        markDriverSessionSignedIn();
      });
      await renderLayout();
      expect(mocks.stopDriverLocationHeartbeat).not.toHaveBeenCalled();

      mocks.isDriverIdentityProvisioned.mockReturnValue(false);
      await act(async () => {
        markDriverSessionSignedOut();
        await flush();
      });

      expect(mocks.stopDriverLocationHeartbeat).toHaveBeenCalledTimes(1);
    });

    it("re-arms the bootstrap on the next sign-in", async () => {
      await act(async () => {
        markDriverSessionSignedIn();
      });
      await renderLayout();
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(1);

      await act(async () => {
        markDriverSessionSignedOut();
        await flush();
      });
      await act(async () => {
        markDriverSessionSignedIn();
        await flush();
      });

      // One run per session epoch: the previous interval was torn down first.
      expect(mocks.syncDriverIdentityBootstrap).toHaveBeenCalledTimes(3);
    });

    it("never uses console.error, which LogBox would show as a red screen", async () => {
      const source = readFileSync(
        join(__dirname, "..", "..", "app", "_layout.tsx"),
        "utf8",
      );

      expect(source).not.toContain("console.error(");
      expect(source).toContain("console.warn(");
    });

    it("logs rather than crashes when the bootstrap reports a warning", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      mocks.syncDriverIdentityBootstrap.mockImplementation(
        async (input: any) => {
          input.onWarning(new Error("裝置同步逾時"));
        },
      );

      await renderLayout();

      expect(warn).toHaveBeenCalledWith(
        "Driver heartbeat bootstrap sync failed",
        "裝置同步逾時",
      );
      warn.mockRestore();
    });
  });
});
