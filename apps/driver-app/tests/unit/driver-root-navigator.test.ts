import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const screenRegistrations: Array<{ name: string; options: Record<string, unknown> }> = [];
let passedTabBar: any = null;

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn().mockReturnValue({ remove: vi.fn() }),
  },
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  },
  Pressable: "Pressable",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("react-native-reanimated", () => ({}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, top: 47, left: 0, right: 0 }),
}));

vi.mock("@react-navigation/native", () => ({
  ThemeProvider: (props: { children?: React.ReactNode }) =>
    React.createElement("ThemeProvider", props, props.children),
}));

vi.mock("expo-status-bar", () => ({
  StatusBar: () => React.createElement("StatusBar"),
}));

vi.mock("expo-router", () => {
  const MockScreen = (props: { name: string; options?: Record<string, unknown> }) => {
    screenRegistrations.push({ name: props.name, options: props.options ?? {} });
    return React.createElement("Tabs.Screen", props);
  };

  const MockTabs = (props: {
    children?: React.ReactNode;
    tabBar?: (tabBarProps: any) => React.ReactNode;
    screenOptions?: Record<string, unknown>;
  }) => {
    passedTabBar = props.tabBar;
    return React.createElement("Tabs", props, props.children);
  };

  MockTabs.Screen = MockScreen;

  return {
    Tabs: MockTabs,
    useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
    useSegments: () => ["index"],
  };
});

vi.mock("@/lib/driver-location-heartbeat", () => ({
  initializeDriverLocationHeartbeat: vi.fn(),
  syncDriverLocationHeartbeat: vi.fn(),
}));

vi.mock("@/lib/driver-identity-bootstrap", () => ({
  syncDriverIdentityBootstrap: vi.fn(),
}));

vi.mock("@/lib/driver-tracking-recovery", () => ({
  evaluateTrackingRecovery: vi.fn(),
}));

vi.mock("@/lib/driver-identity-routing", () => ({
  allowUnprovisionedDriverRoute: vi.fn().mockReturnValue(true),
  resetDriverAppToOnboarding: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  formatDriverError: vi.fn(),
  getDriverClient: () => ({ listDriverTasks: vi.fn().mockResolvedValue([]) }),
  getDriverIdentityIssue: vi.fn(),
  initializeDriverIdentity: vi.fn(),
  isDriverIdentityProvisioned: vi.fn().mockReturnValue(true),
}));

import RootLayout from "../../app/_layout";

describe("RootLayout navigator structure", () => {
  it("declares the five main tabs and all existing sub-screens once in the root navigator", () => {
    screenRegistrations.length = 0;
    passedTabBar = null;

    act(() => {
      create(React.createElement(RootLayout));
    });

    expect(passedTabBar).toBeDefined();

    const registeredNames = screenRegistrations.map((s) => s.name);
    expect(registeredNames).toEqual([
      "index",
      "jobs",
      "trip",
      "platform-presence",
      "settings",
      "onboarding",
      "earnings",
      "shift",
      "sos",
      "incident",
      "safety-operator",
    ]);

    // Check main 5 tabs have valid titles and no href: null
    const rootTabNames = ["index", "jobs", "trip", "platform-presence", "settings"];
    for (const name of rootTabNames) {
      const reg = screenRegistrations.find((s) => s.name === name);
      expect(reg).toBeDefined();
      expect(reg?.options.href).not.toBe(null);
    }

    // Check sub-screens are declared with href: null so they render in tab shell without duplicate tab buttons
    const subScreenNames = [
      "onboarding",
      "earnings",
      "shift",
      "sos",
      "incident",
      "safety-operator",
    ];
    for (const name of subScreenNames) {
      const reg = screenRegistrations.find((s) => s.name === name);
      expect(reg).toBeDefined();
      expect(reg?.options.href).toBe(null);
    }
  });

  it("renders the bottom tab bar when provided sub-screen navigation state", () => {
    expect(passedTabBar).toBeDefined();

    let tabRenderer: any;
    act(() => {
      tabRenderer = create(
        passedTabBar({
          state: {
            index: 9,
            routes: screenRegistrations.map((s) => ({
              key: `key-${s.name}`,
              name: s.name,
            })),
          },
        }),
      );
    });

    const tabs = tabRenderer.root.findAllByProps({ accessibilityRole: "tab" });
    expect(tabs.length).toBe(5);

    // Route index 9 is "incident", so "行程" tab should be active
    const activeTab = tabs.find(
      (t: any) => t.props.accessibilityState?.selected === true,
    );
    expect(activeTab).toBeDefined();
    expect(activeTab.findByType("Text").props.children).toBe("行程");
  });
});
