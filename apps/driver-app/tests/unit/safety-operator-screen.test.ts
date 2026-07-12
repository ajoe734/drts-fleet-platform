import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  getSafetyOperatorQueueSnapshot: vi.fn(),
  isDriverIdentityProvisioned: vi.fn(),
}));

vi.mock("react-native", () => ({
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({
    back: mocks.back,
  }),
}));

vi.mock("@drts/ui-tokens", () => ({
  REALM_COLORS: {
    platform: {
      light: "#0f766e",
      dark: "#5eead4",
    },
  },
  SURFACE_ACCENTS: {
    platform: {
      light: "#0f766e",
      dark: "#5eead4",
    },
  },
}));

vi.mock("@/lib/theme", () => {
  const proxy: unknown = new Proxy(
    { mode: "light" },
    {
      get: (_target, prop) => {
        if (prop === "mode") {
          return "light";
        }
        if (prop === Symbol.toPrimitive || prop === "toString") {
          return () => "0";
        }
        return proxy;
      },
    },
  );

  return {
    driverTheme: proxy,
  };
});

vi.mock("@/lib/api-client", () => ({
  getDriverClient: () => ({
    submitSafetyOperatorTakeoverReport: vi.fn(),
    submitSafetyOperatorPreTripChecklist: vi.fn(),
    createSafetyOperatorTripCloseout: vi.fn(),
  }),
  isDriverIdentityProvisioned: mocks.isDriverIdentityProvisioned,
  recoverDriverSessionFromApiError: vi.fn(),
}));

vi.mock("@/lib/safety-operator-offline-queue", () => ({
  clearSafetyOperatorSyncedQueueEntries: vi.fn(),
  enqueueSafetyOperatorItem: vi.fn(),
  getSafetyOperatorQueueSnapshot: mocks.getSafetyOperatorQueueSnapshot,
  markSafetyOperatorQueueFailed: vi.fn(),
  markSafetyOperatorQueueSynced: vi.fn(),
  markSafetyOperatorQueueSyncing: vi.fn(),
}));

import SafetyOperatorScreen from "../../app/safety-operator";

async function flushEffects() {
  await Promise.resolve();
  await Promise.resolve();
}

function collectText(node: unknown): string[] {
  if (node == null) {
    return [];
  }

  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }

  if (Array.isArray(node)) {
    return node.flatMap((child) => collectText(child));
  }

  if (React.isValidElement(node)) {
    return collectText(
      (node as React.ReactElement<{ children?: unknown }>).props.children,
    );
  }

  return [];
}

describe("SafetyOperatorScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDriverIdentityProvisioned.mockReturnValue(false);
    mocks.getSafetyOperatorQueueSnapshot.mockResolvedValue({
      items: [],
      queuedCount: 0,
      failedCount: 0,
      syncingCount: 0,
      lastSyncedAt: null,
    });
  });

  it("renders the safety-operator route chrome and unprovisioned queue notice", async () => {
    let renderer: any;

    await act(async () => {
      renderer = create(React.createElement(SafetyOperatorScreen));
      await flushEffects();
    });

    const text = renderer.root
      .findAllByType("Text")
      .flatMap((node: { props: { children?: unknown } }) =>
        collectText(node.props.children),
      )
      .join(" ");

    expect(text).toContain("Safety Operator Realm");
    expect(text).toContain("FSD 沙盒");
    expect(text).toContain("返回 Driver");
    expect(text).toContain("待同步");
    expect(text).toContain("同步失敗");
    expect(text).toContain("裝置尚未完成正式綁定");
    expect(text).toContain("資格");
    expect(text).toContain("開班");
    expect(text).toContain("派車");
    expect(text).toContain("行前");
    expect(text).toContain("監看");
    expect(text).toContain("接管");
    expect(text).toContain("證據");
    expect(text).toContain("結案");
    expect(text).toContain("交班");
  });
});
