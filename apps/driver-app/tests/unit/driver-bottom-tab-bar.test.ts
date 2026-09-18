import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
  },
  Pressable: "Pressable",
  StyleSheet: { create: <T>(styles: T) => styles },
  Text: "Text",
  View: "View",
}));

vi.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ bottom: 34, top: 47, left: 0, right: 0 }),
}));

import { DriverBottomTabBar } from "../../components/driver-bottom-tab-bar";

describe("DriverBottomTabBar", () => {
  it("renders all five root tabs once with correct labels and accessibility roles", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(DriverBottomTabBar, {
          currentRouteName: "index",
        }),
      );
    });

    const root = renderer.root;
    const tabList = root.findByProps({ testID: "driver-bottom-tab-bar" });
    expect(tabList.props.accessibilityRole).toBe("tablist");

    const tabs = root.findAllByProps({ accessibilityRole: "tab" });
    expect(tabs.length).toBe(5);

    const labels = tabs.map(
      (t: any) =>
        t.findByType("Text").props.children,
    );
    expect(labels).toEqual(["工作台", "任務", "行程", "平台", "設定"]);
  });

  it("marks the active tab when on a root tab route", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(DriverBottomTabBar, {
          currentRouteName: "jobs",
        }),
      );
    });

    const tabs = renderer.root.findAllByProps({ accessibilityRole: "tab" });
    const activeTabs = tabs.filter(
      (t: any) => t.props.accessibilityState?.selected === true,
    );

    expect(activeTabs.length).toBe(1);
    expect(activeTabs[0].findByType("Text").props.children).toBe("任務");
  });

  it("keeps the tab bar visible and marks the correct tab active on sub-screens", () => {
    const subScreenScenarios: Array<{
      route: string;
      expectedActiveTab: string;
    }> = [
      { route: "incident", expectedActiveTab: "行程" },
      { route: "sos", expectedActiveTab: "行程" },
      { route: "earnings", expectedActiveTab: "設定" },
      { route: "shift", expectedActiveTab: "工作台" },
      { route: "safety-operator", expectedActiveTab: "設定" },
      { route: "onboarding", expectedActiveTab: "工作台" },
    ];

    for (const { route, expectedActiveTab } of subScreenScenarios) {
      let renderer: any;
      act(() => {
        renderer = create(
          React.createElement(DriverBottomTabBar, {
            currentRouteName: route,
          }),
        );
      });

      const tabs = renderer.root.findAllByProps({ accessibilityRole: "tab" });
      expect(tabs.length).toBe(5);

      const activeTabs = tabs.filter(
        (t: any) => t.props.accessibilityState?.selected === true,
      );
      expect(activeTabs.length).toBe(1);
      expect(activeTabs[0].findByType("Text").props.children).toBe(
        expectedActiveTab,
      );
    }
  });

  it("handles tab press navigation and emits tabPress event", () => {
    const emit = vi.fn().mockReturnValue({ defaultPrevented: false });
    const navigate = vi.fn();

    const mockNavigation: any = {
      emit,
      navigate,
    };

    const mockState: any = {
      index: 0,
      routes: [
        { key: "index-key", name: "index" },
        { key: "jobs-key", name: "jobs" },
        { key: "trip-key", name: "trip" },
        { key: "platform-key", name: "platform-presence" },
        { key: "settings-key", name: "settings" },
      ],
    };

    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(DriverBottomTabBar, {
          navigation: mockNavigation,
          state: mockState,
        }),
      );
    });

    const tripTab = renderer.root.findByProps({ testID: "driver-tab-trip" });
    act(() => {
      tripTab.props.onPress();
    });

    expect(emit).toHaveBeenCalledWith({
      type: "tabPress",
      target: "trip-key",
      canPreventDefault: true,
    });
    expect(navigate).toHaveBeenCalledWith("trip");
  });

  it("applies safe-area insets dynamically for iOS Home Indicator and Android bars", () => {
    let renderer: any;
    act(() => {
      renderer = create(
        React.createElement(DriverBottomTabBar, {
          insets: { bottom: 34, top: 47, left: 0, right: 0 },
          currentRouteName: "index",
        }),
      );
    });

    const container = renderer.root.findByProps({
      testID: "driver-bottom-tab-bar",
    });
    const containerStyle = Array.isArray(container.props.style)
      ? Object.assign({}, ...container.props.style)
      : container.props.style;

    expect(containerStyle.paddingBottom).toBe(34);
  });
});
