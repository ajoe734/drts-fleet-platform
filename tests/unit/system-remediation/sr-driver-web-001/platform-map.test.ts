import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const app = resolve(__dirname, "../../../../apps/driver-app");
const requireApp = createRequire(resolve(app, "package.json"));
const React = requireApp("react");

// Execute the real platform entry and navigation model, stubbing only host APIs.
// Any attempted native-map import on web throws before a render can succeed.
function loadMap(platform: "web" | "ios" | "android") {
  const openURL = vi.fn(async () => undefined);
  const nativeImports = vi.fn();
  const load = (file: string): any => {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(resolve(app, file), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
    }).outputText;
    runInNewContext(code, {
      module,
      exports: module.exports,
      require: (id: string) => {
        if (id === "react") return React;
        if (id === "react-native")
          return {
            Platform: { OS: platform },
            Alert: { alert: vi.fn() },
            Linking: { canOpenURL: async () => true, openURL },
            StyleSheet: { create: (styles: unknown) => styles },
            View: "View",
            Text: "Text",
            Pressable: "Pressable",
          };
        if (id === "react-native-maps") {
          nativeImports();
          if (platform === "web") throw new Error("Native map loaded on web");
          return {
            __esModule: true,
            default: "MapView",
            Marker: "Marker",
            PROVIDER_GOOGLE: "google",
          };
        }
        if (id === "@/components/canvas-primitives")
          return { driverCanvasTheme: {} };
        if (id === "@/lib/driver-navigation")
          return load("lib/driver-navigation.ts");
        throw new Error(`Unexpected dependency: ${id}`);
      },
    });
    return module.exports;
  };
  const component = load(
    `components/driver-trip-map${platform === "web" ? ".web" : ""}.tsx`,
  ).default;
  return { component, nativeImports, openURL };
}

function flatten(node: any): any[] {
  if (node == null) return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (React.isValidElement(node)) {
    if (typeof node.type === "function") return flatten(node.type(node.props));
    return [node, ...flatten(node.props.children)];
  }
  return [node];
}

const props = {
  task: {
    taskId: "unit-task-map",
    sourcePlatform: null,
    routeProvided: true,
    waypoints: [],
  },
  order: {
    pickup: { address: "Pickup", lat: 25.0478, lng: 121.517 },
    dropoff: { address: "Dropoff", lat: 25.0697, lng: 121.5525 },
  },
  driverLocation: null,
  nativeMapAvailable: true,
};

describe("SR-DRIVER-WEB-001 platform map boundary", () => {
  it("renders coordinate handoff on web even when native availability is requested", async () => {
    const { component, nativeImports, openURL } = loadMap("web");
    const nodes = flatten(component(props));
    expect(nativeImports).not.toHaveBeenCalled();
    expect(nodes.some((node) => node.type === "MapView")).toBe(false);
    expect(
      nodes.filter((node) => typeof node === "string").join(" "),
    ).toContain("25.047800, 121.517000");
    const google = nodes.find(
      (node) =>
        node.props?.accessibilityLabel === "Google navigation to pickup",
    );
    google.props.onPress();
    await vi.waitFor(() =>
      expect(openURL).toHaveBeenCalledWith(expect.stringContaining("25.0478")),
    );
  });

  it("keeps forwarded route authority and suppresses navigation without coordinates", () => {
    const { component } = loadMap("web");
    const nodes = flatten(
      component({
        ...props,
        order: null,
        sourcePlatformOffline: true,
        task: {
          ...props.task,
          sourcePlatform: "grab",
          routeIntent: "platform_polyline_locked",
        },
      }),
    );
    const text = nodes.filter((node) => typeof node === "string").join(" ");
    expect(text).toContain("來源平台路線鎖定");
    expect(text).toContain("來源平台離線");
    expect(nodes.filter((node) => node.type === "Pressable")).toHaveLength(0);
  });

  for (const platform of ["ios", "android"] as const) {
    it(`retains Google native map and synced markers on ${platform}`, () => {
      const { component, nativeImports } = loadMap(platform);
      const nodes = flatten(component(props));
      expect(nativeImports).toHaveBeenCalledOnce();
      expect(nodes.find((node) => node.type === "MapView").props.provider).toBe(
        "google",
      );
      expect(
        nodes
          .filter((node) => node.type === "Marker")
          .map((node) => node.props.coordinate),
      ).toEqual([
        { latitude: 25.0478, longitude: 121.517 },
        { latitude: 25.0697, longitude: 121.5525 },
      ]);
    });
  }
});
