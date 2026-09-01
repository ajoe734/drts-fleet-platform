import React from "react";
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { passthrough } = vi.hoisted(() => ({
  passthrough: (name: string) => (props: Record<string, unknown>) =>
    React.createElement(name, props, props.children as never),
}));

vi.mock("expo-router", () => {
  const Tabs = Object.assign(passthrough("Tabs"), {
    Screen: (props: Record<string, unknown>) =>
      React.createElement("TabsScreen", props),
  });
  const Stack = Object.assign(passthrough("Stack"), {
    Screen: (props: Record<string, unknown>) =>
      React.createElement("StackScreen", props),
  });
  return { Tabs, Stack };
});

vi.mock("@expo/vector-icons", () => ({ Ionicons: passthrough("Ionicons") }));

import DriverTabsLayout from "../../app/(tabs)/_layout";
import WorkspaceStackLayout, {
  unstable_settings as workspaceUnstableSettings,
} from "../../app/(tabs)/index/_layout";
import JobsStackLayout from "../../app/(tabs)/jobs/_layout";
import TripStackLayout from "../../app/(tabs)/trip/_layout";
import PlatformPresenceStackLayout from "../../app/(tabs)/platform-presence/_layout";
import SettingsStackLayout from "../../app/(tabs)/settings/_layout";

function renderShallow(element: React.ReactElement) {
  let renderer: any;
  act(() => {
    renderer = create(element);
  });
  return renderer;
}

function tabScreens(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "TabsScreen")
    .map((node: any) => [node.props.name, node.props.options?.title]);
}

function stackScreenNames(renderer: any) {
  return renderer.root
    .findAll((node: any) => node.type === "StackScreen")
    .map((node: any) => node.props.name);
}

describe("driver tab shell", () => {
  it("declares the five driver tabs exactly once in the tab navigator", () => {
    const renderer = renderShallow(React.createElement(DriverTabsLayout));

    expect(tabScreens(renderer)).toEqual([
      ["index", "工作台"],
      ["jobs", "任務"],
      ["trip", "行程"],
      ["platform-presence", "平台"],
      ["settings", "設定"],
    ]);
  });

  it("registers exactly one safety request route, so the retired duplicate cannot be reached", () => {
    const renderer = renderShallow(React.createElement(WorkspaceStackLayout));

    expect(stackScreenNames(renderer)).not.toContain("incident");
    expect(
      stackScreenNames(renderer).filter((name: string) => name === "sos"),
    ).toHaveLength(1);
  });

  it("starts the workspace tab's own stack at onboarding", () => {
    expect(workspaceUnstableSettings.initialRouteName).toBe("onboarding");
  });

  it("keeps every workspace sub-screen nested inside the workspace tab's stack", () => {
    const renderer = renderShallow(React.createElement(WorkspaceStackLayout));

    expect(stackScreenNames(renderer)).toEqual([
      "index",
      "onboarding",
      "sos",
      "earnings",
      "shift",
    ]);
  });

  it.each([
    ["jobs", JobsStackLayout, ["index"]],
    ["trip", TripStackLayout, ["index"]],
    ["platform-presence", PlatformPresenceStackLayout, ["index"]],
    ["settings", SettingsStackLayout, ["index"]],
  ])(
    "keeps the %s tab's screens nested inside its own stack, so the tab bar stays visible for sub-screens",
    (_label, Layout, expectedScreens) => {
      const renderer = renderShallow(React.createElement(Layout as any));

      expect(stackScreenNames(renderer)).toEqual(expectedScreens);
    },
  );

  it("renders a sub-screen route (a non-tab-button screen) as part of a tab's own stack rather than a standalone route, so it cannot silently drop the tab bar", () => {
    const renderer = renderShallow(React.createElement(WorkspaceStackLayout));
    const subScreenNames = ["sos", "earnings", "shift"];

    const registeredNames = stackScreenNames(renderer);
    for (const name of subScreenNames) {
      expect(registeredNames).toContain(name);
    }

    // Every one of these sub-screens is declared inside the same Stack as
    // the "index" tab-root screen, which the (tabs) layout wires up under
    // the tab name "index" (see the first test above). That means any of
    // these routes always renders beneath the driver Tabs navigator with
    // the workspace tab marked active, never as a bare top-level route.
  });
});
