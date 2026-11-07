import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const external = vi.hoisted(() => ({
  read: vi.fn(async () => null),
  write: vi.fn(async () => {}),
  clear: vi.fn(async () => {}),
}));
vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Modal: "Modal",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
  AppState: {
    currentState: "active",
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: external.read,
  setItemAsync: external.write,
  deleteItemAsync: external.clear,
}));
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: vi.fn(async () => ({ type: "cancel" })),
}));
vi.mock("expo-linking", () => ({ openURL: vi.fn(async () => {}) }));
vi.mock("expo-modules-core", () => ({
  uuid: { v4: vi.fn(() => "bootstrap-platform-request") },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///bootstrap-cache" } },
  File: vi.fn(),
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(async () => {}),
}));
import PassengerAppEntry from "../../../app/index";
import { NativePassengerRuntime } from "../../../lib/native-passenger-runtime";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: any[] = [];
async function flush() {
  for (let i = 0; i < 60; ++i) await Promise.resolve();
}
async function mount() {
  let tree: any;
  await act(async () => {
    tree = create(<PassengerAppEntry />);
    await flush();
  });
  mounted.push(tree);
  return tree;
}
async function press(tree: any, id: string) {
  await act(async () => {
    await tree.root.findByProps({ testID: id }).props.onPress();
    await flush();
  });
}
async function enter(tree: any, id: string, value: string) {
  await act(() =>
    tree.root.findByProps({ testID: id }).props.onChangeText(value),
  );
}
function present(tree: any, id: string) {
  return tree.root.findAllByProps({ testID: id }).length > 0;
}
beforeEach(() => {
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "");
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_API_BASE_URL", "");
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", "");
  external.read.mockClear();
  external.write.mockClear();
  external.clear.mockClear();
});
afterEach(async () => {
  await act(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Expo bootstrap with the actual Native Application and Runtime", () => {
  it("renders a missing-configuration state without starting a runtime or external IO", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const start = vi.spyOn(NativePassengerRuntime.prototype, "start");
    const tree = await mount();
    expect(present(tree, "passenger-bootstrap-unavailable")).toBe(true);
    expect(start).not.toHaveBeenCalled();
    expect(external.read).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses the explicit API/callback, restores once, and disposes the same actual runtime on unmount", async () => {
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
    vi.stubEnv(
      "EXPO_PUBLIC_PASSENGER_API_BASE_URL",
      "https://bootstrap.example.invalid",
    );
    vi.stubEnv(
      "EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI",
      "drtspassenger://auth/callback",
    );
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { providers: ["email"] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const start = vi.spyOn(NativePassengerRuntime.prototype, "start");
    const dispose = vi.spyOn(NativePassengerRuntime.prototype, "dispose");
    const tree = await mount();
    expect(present(tree, "app-login")).toBe(true);
    expect(present(tree, "passenger-bootstrap-demo")).toBe(false);
    expect(present(tree, "native-demo-controls")).toBe(false);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://bootstrap.example.invalid/api/passenger-app/auth/providers",
      expect.objectContaining({ method: "GET" }),
    );
    expect(external.read).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    const runtime = start.mock.contexts[0] as
      | NativePassengerRuntime
      | undefined;
    expect(runtime?.options.callbackUri).toBe("drtspassenger://auth/callback");
    expect(runtime?.options.mode).toBe("configured");
    await act(async () => {
      tree.update(<PassengerAppEntry />);
      await flush();
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(external.read).toHaveBeenCalledTimes(1);
    await act(() => tree.unmount());
    mounted.splice(mounted.indexOf(tree), 1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.contexts[0]).toBe(runtime);
  });
  it("connects the actual explicit demo transport to login/home and visible controls without network or SecureStore", async () => {
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "demo");
    const fetch = vi.fn(() => {
      throw new Error("external_network_not_expected");
    });
    vi.stubGlobal("fetch", fetch);
    const tree = await mount();
    expect(present(tree, "passenger-bootstrap-demo")).toBe(true);
    expect(present(tree, "native-demo-controls")).toBe(true);
    expect(present(tree, "app-login")).toBe(true);
    await press(tree, "auth-channel-email");
    await enter(tree, "auth-target", "demo@example.invalid");
    await press(tree, "auth-request-otp");
    await enter(tree, "auth-code", "123456");
    await press(tree, "auth-verify-otp");
    expect(present(tree, "booking-reservation-only")).toBe(true);
    await press(tree, "booking-acknowledge-fees");
    expect(present(tree, "demo-booking-map")).toBe(true);
    expect(present(tree, "app-demo-banner")).toBe(true);
    expect(present(tree, "native-demo-controls")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(external.read).not.toHaveBeenCalled();
    expect(external.write).not.toHaveBeenCalled();
  });
});
