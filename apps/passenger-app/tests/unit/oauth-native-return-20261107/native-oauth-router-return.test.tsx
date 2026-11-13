import React from "react";
import { act, create } from "react-test-renderer";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import * as ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only OS/native modules, storage and HTTP are simulated. The installed Router
// and WebBrowser functions below execute unchanged, including both URL listeners.
const external = vi.hoisted(() => ({
  urls: new Set<(event: { url: string }) => unknown>(),
  appStates: new Set<(state: string) => void>(),
  initialURL: null as string | null,
  stored: "",
  events: [] as string[],
  browserCalls: [] as string[],
  browserResults: [] as unknown[],
  sdkBrowser: null as
    | null
    | ((url: string, callback: string) => Promise<unknown>),
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android", Version: 34 },
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
    addEventListener(type: string, listener: (state: string) => void) {
      if (type !== "change")
        throw new Error(`unexpected_appstate_event:${type}`);
      external.appStates.add(listener);
      return { remove: () => external.appStates.delete(listener) };
    },
  },
}));
vi.mock("expo-router", () => ({ Stack: "ExpoStack" }));
vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("react-native-maps", () => ({
  default: "NativeMapView",
  Marker: "NativeMapMarker",
  Polyline: "NativeMapPolyline",
  PROVIDER_GOOGLE: "google",
}));
vi.mock("react-native-webview", () => ({ WebView: "WebView" }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => external.stored || null,
  setItemAsync: async (key: string, value: string) => {
    external.events.push(`persist:${key}`);
    external.stored = value;
  },
  deleteItemAsync: async () => {
    external.stored = "";
  },
}));
vi.mock("expo-web-browser", () => ({
  async openAuthSessionAsync(url: string, callback: string) {
    if (!external.sdkBrowser) throw new Error("actual_sdk_not_loaded");
    const result = await external.sdkBrowser(url, callback);
    external.browserResults.push(result);
    return result;
  },
}));
vi.mock("expo-linking", () => ({ openURL: async () => {} }));
vi.mock("expo-modules-core", () => ({
  uuid: { v4: () => "sim-oauth-request" },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///oauth-return-sim" } },
  File: vi.fn(),
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
}));

import PassengerAppEntry from "../../../app/index";
import PassengerRootLayout from "../../../app/_layout";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const APP = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const BASE = "https://native-oauth-return.example.invalid";
const CALLBACK = "drtspassenger://auth/callback";
const TRANSACTION = "1616ef70-a87d-4280-97c0-a8e174ac83d8";
const AUTH_URL =
  "https://provider.example.invalid/authorize?state=api-state&code_challenge=api-owned-pkce";
const PAIR = {
  accessToken: "sim-native-oauth-access",
  refreshToken: "sim-native-oauth-refresh",
};

interface TestNode {
  props: Record<string, unknown>;
  findByProps(props: Record<string, unknown>): TestNode;
  findAllByProps(props: Record<string, unknown>): TestNode[];
}
interface Renderer {
  root: TestNode;
  unmount(): void;
}
interface NavigationState {
  routes: Array<{ name: string; state?: NavigationState }>;
}
interface LinkingOptions {
  config: { screens: Record<string, unknown> };
  getInitialURL(): string | null | Promise<string | null>;
  subscribe(listener: (url: string) => void): () => void;
  getStateFromPath(value: string, config: unknown): NavigationState | undefined;
  getActionFromState(state: NavigationState, config: unknown): unknown;
}
interface Navigation {
  getRootState(): { routeNames: string[] };
  dispatch(action: unknown): void;
  resetRoot(state: NavigationState): void;
}
interface Sdk {
  linking: LinkingOptions;
  useLinking(
    ref: { current: Navigation },
    options: LinkingOptions,
    onUnhandled: (path: unknown) => void,
  ): unknown;
  extractPath(prefixes: string[], url: string): string;
  loaded: Set<string>;
}
type CjsModule = { exports: unknown };
type CjsWrapper = (
  module: CjsModule,
  exports: unknown,
  require: (specifier: string) => unknown,
  filename: string,
  dirname: string,
) => void;
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null)
    throw new Error("expected_sdk_module_exports");
  return value as Record<string, unknown>;
}

/** Transpile syntax only; native resolution selects useLinking.native.js.
 * React Navigation's three used exports come from their actual installed files,
 * avoiding loading the unrelated native UI barrel in a Node unit environment.
 */
function actualSdk(): Sdk {
  const appRequire = createRequire(path.join(APP, "package.json"));
  const routerPackage = appRequire.resolve("expo-router/package.json");
  const routerRoot = path.dirname(routerPackage);
  const browserRoot = path.dirname(
    appRequire.resolve("expo-web-browser/package.json"),
  );
  const nativePackage = createRequire(routerPackage).resolve(
    "@react-navigation/native/package.json",
  );
  const coreRoot = path.dirname(
    createRequire(nativePackage).resolve("@react-navigation/core/package.json"),
  );
  const modules = new Map<string, CjsModule>();
  const loaded = new Set<string>();
  const nativeExports: Record<string, unknown> = {};
  const linking = {
    addEventListener(
      type: string,
      listener: (event: { url: string }) => unknown,
    ) {
      if (type !== "url") throw new Error(`unexpected_linking_event:${type}`);
      external.urls.add(listener);
      return { remove: () => external.urls.delete(listener) };
    },
    getInitialURL: async () => external.initialURL,
    getLinkingURL: () => external.initialURL,
    createURL: (route: string) => `drtspassenger://${route}`,
    openURL: async () => {},
  };
  const appState = {
    currentState: "active",
    addEventListener(type: string, listener: (state: string) => void) {
      if (type !== "change")
        throw new Error(`unexpected_appstate_event:${type}`);
      external.appStates.add(listener);
      return { remove: () => external.appStates.delete(listener) };
    },
  };
  const nativeBrowser = {
    async openBrowserAsync(url: string) {
      external.browserCalls.push(url);
      return { type: "opened" };
    },
  };
  const rn = {
    Platform: { OS: "android" },
    Linking: linking,
    AppState: appState,
    processColor: (color: unknown) => color,
  };
  const expoCore = {
    Platform: rn.Platform,
    UnavailabilityError: class extends Error {},
    requireNativeModule(name: string) {
      if (name !== "ExpoWebBrowser")
        throw new Error(`unexpected_native:${name}`);
      return nativeBrowser;
    },
  };
  function load(filename: string): unknown {
    const cached = modules.get(filename);
    if (cached) return cached.exports;
    const module: CjsModule = { exports: {} };
    modules.set(filename, module);
    loaded.add(filename);
    if (filename.endsWith(".json")) {
      module.exports = JSON.parse(readFileSync(filename, "utf8")) as unknown;
      return module.exports;
    }
    const nativeRequire = createRequire(filename);
    function localRequire(specifier: string): unknown {
      if (specifier === "react") return React;
      if (specifier === "react-native") return rn;
      if (specifier === "expo-linking") return linking;
      if (specifier === "expo-modules-core") return expoCore;
      if (specifier === "@react-navigation/native") return nativeExports;
      if (!specifier.startsWith(".")) return nativeRequire(specifier);
      const base = path.resolve(path.dirname(filename), specifier);
      const choices = [
        base,
        `${base}.android.js`,
        `${base}.native.js`,
        `${base}.js`,
        `${base}.ts`,
      ];
      const found = choices.find((candidate) => existsSync(candidate));
      if (!found) return load(nativeRequire.resolve(specifier));
      return load(found);
    }
    const result = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
        allowJs: true,
      },
    });
    const run = new Script(
      `(function(module,exports,require,__filename,__dirname){\n${result.outputText}\n})`,
      { filename },
    ).runInThisContext() as CjsWrapper;
    run(module, module.exports, localRequire, filename, path.dirname(filename));
    return module.exports;
  }
  for (const name of [
    "getActionFromState",
    "validatePathConfig",
    "useNavigationIndependentTree",
  ]) {
    Object.assign(
      nativeExports,
      record(load(path.join(coreRoot, "lib/module", `${name}.js`))),
    );
  }
  const webBrowser = record(load(path.join(browserRoot, "src/WebBrowser.ts")));
  external.sdkBrowser = webBrowser.openAuthSessionAsync as NonNullable<
    typeof external.sdkBrowser
  >;
  const routeFiles = readdirSync(path.join(APP, "app")).filter((name) =>
    /\.[tj]sx?$/.test(name),
  );
  const context = Object.assign(
    (key: string) => {
      if (key === "./index.tsx") return { default: PassengerAppEntry };
      if (key === "./_layout.tsx") return { default: PassengerRootLayout };
      return load(path.join(APP, "app", key.slice(2)));
    },
    { keys: () => routeFiles.map((name) => `./${name}`) },
  );
  const getRoutes = record(load(path.join(routerRoot, "build/getRoutes.js")))
    .getRoutes as (context: unknown, options: unknown) => unknown;
  const routes = getRoutes(context, {
    platform: "android",
    importMode: "sync",
    ignoreEntryPoints: true,
  });
  const getLinkingConfig = record(
    load(path.join(routerRoot, "build/getLinkingConfig.js")),
  ).getLinkingConfig as (...args: unknown[]) => LinkingOptions;
  const options = getLinkingConfig(routes, context, () => ({ segments: [] }), {
    metaOnly: true,
  });
  const useLinking = record(
    load(path.join(routerRoot, "build/fork/useLinking.native.js")),
  ).useLinking as Sdk["useLinking"];
  const extractPath = record(
    load(path.join(routerRoot, "build/fork/extractPathFromURL.js")),
  ).extractExpoPathFromURL as Sdk["extractPath"];
  return { linking: options, useLinking, extractPath, loaded };
}

const mounted: Renderer[] = [];
async function flush() {
  for (let i = 0; i < 80; ++i) await Promise.resolve();
}
async function emitURL(url: string) {
  await Promise.all([...external.urls].map((listener) => listener({ url })));
}
function resume() {
  for (const listener of [...external.appStates]) listener("active");
}
interface HttpCall {
  path: string;
  method: string;
  authorization: string | null;
  body: string | undefined;
}
function httpBoundary() {
  const calls: HttpCall[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = {
      path: `${url.pathname}${url.search}`,
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    external.events.push(`http:${call.method}:${call.path}`);
    const reply = (data: unknown) =>
      new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    if (url.origin !== BASE) throw new Error(`unexpected_origin:${url.origin}`);
    if (call.path === "/api/passenger-app/auth/providers")
      return reply({ providers: ["google"] });
    if (call.path === "/api/passenger-app/auth/oauth/google/start")
      return reply({
        auth_url: AUTH_URL,
        transaction_id: TRANSACTION,
        state: "api-state",
        expires_at: "2099-01-01T00:00:00Z",
      });
    if (call.path === "/api/passenger-app/auth/oauth/google/callback")
      return reply({ result: "logged_in", ...PAIR });
    if (call.path === "/api/passenger-app/me")
      return reply({
        account: {
          drts_passenger_id: "sim-oauth-owner",
          display_name: "OAuth 測試乘客",
          contact_phone_verified: true,
          status: "active",
          created_at: "2026-11-07T00:00:00Z",
        },
      });
    if (call.path === "/api/passenger-app/settings")
      return reply({ minLeadTimeMinutes: 30, requireSmsVerification: false });
    if (call.path === "/api/passenger-app/fares")
      return reply({
        currentVersion: {
          version: "sim-oauth-fare",
          effectiveAt: "2023-04-01T00:00:00Z",
          baseFare: 85,
          baseDistanceMeters: 1250,
          distanceRate: 5,
          distanceIncrementMeters: 200,
          delayRate: 5,
          delayIncrementSeconds: 60,
          nightSurcharge: 20,
          nightSurchargeWindowStart: "23:00",
          nightSurchargeWindowEnd: "06:00",
          additionalFees: {},
        },
      });
    if (call.path === "/api/passenger-app/payment-methods")
      return reply({ methods: [] });
    if (url.pathname === "/api/passenger-app/rides")
      return reply({ rides: [], next_cursor: null });
    throw new Error(`unexpected_http:${call.method}:${call.path}`);
  });
  return { calls, fetch };
}
function RouterObserver({ sdk, actions }: { sdk: Sdk; actions: unknown[] }) {
  const navigation = React.useRef<Navigation>({
    getRootState: () => ({
      routeNames: Object.keys(sdk.linking.config.screens),
    }),
    dispatch: (action) => actions.push(action),
    resetRoot: (state) => actions.push({ type: "RESET", payload: state }),
  });
  sdk.useLinking(navigation, sdk.linking, () => {});
  return null;
}
async function mount(sdk: Sdk, f: ReturnType<typeof httpBoundary>) {
  vi.stubGlobal("fetch", f.fetch);
  const actions: unknown[] = [];
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <>
        <RouterObserver sdk={sdk} actions={actions} />
        <PassengerAppEntry />
      </>,
    ) as unknown as Renderer;
    await flush();
  });
  mounted.push(tree);
  return { tree, actions };
}
function present(tree: Renderer, id: string) {
  return tree.root.findAllByProps({ testID: id }).length > 0;
}
function onPress(tree: Renderer, id: string) {
  return (
    tree.root.findByProps({ testID: id }).props as {
      onPress(): void | Promise<void>;
    }
  ).onPress;
}
async function begin(tree: Renderer) {
  let pending!: void | Promise<void>;
  await act(async () => {
    pending = onPress(tree, "auth-oauth-google")();
    await flush();
  });
  expect(external.browserCalls.at(-1)).toBe(AUTH_URL);
  // One URL listener belongs to Router and the other to the real WebBrowser.
  expect(external.urls.size).toBe(2);
  return { pending };
}
async function returned(url: string, pending: void | Promise<void>) {
  await act(async () => {
    await emitURL(url);
    await flush();
    resume();
    await pending;
    await flush();
  });
}
beforeEach(() => {
  external.urls.clear();
  external.appStates.clear();
  external.initialURL = null;
  external.stored = "";
  external.events.length = 0;
  external.browserCalls.length = 0;
  external.browserResults.length = 0;
  external.sdkBrowser = null;
  vi.stubGlobal("window", {});
  vi.stubGlobal("expo", undefined);
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_API_BASE_URL", BASE);
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", CALLBACK);
});
afterEach(async () => {
  await act(async () => {
    resume();
    await flush();
    for (const renderer of mounted.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("actual native OAuth browser return and Expo Router event ownership", () => {
  it("keeps one Android return out of page routing while the actual configured login persists tokens and reads owned history", async () => {
    const sdk = actualSdk();
    const f = httpBoundary();
    const { tree, actions } = await mount(sdk, f);
    expect(present(tree, "app-login")).toBe(true);
    const { pending } = await begin(tree);
    const url = `${CALLBACK}?code=returned%20code&state=api-state&transactionId=untrusted-query`;
    await returned(url, pending);
    expect(external.browserResults).toEqual([{ type: "success", url }]);
    expect(
      JSON.parse(
        f.calls.find((call) => call.path.endsWith("/oauth/google/start"))
          ?.body ?? "{}",
      ),
    ).toEqual({ provider: "google", redirectUri: CALLBACK, purpose: "login" });
    expect(
      JSON.parse(
        f.calls.find((call) => call.path.endsWith("/oauth/google/callback"))
          ?.body ?? "{}",
      ),
    ).toEqual({
      provider: "google",
      code: "returned code",
      state: "api-state",
      transactionId: TRANSACTION,
    });
    expect(JSON.parse(external.stored)).toEqual(PAIR);
    expect(
      external.events.indexOf("persist:drts.passenger.session.v1"),
    ).toBeLessThan(external.events.indexOf("http:GET:/api/passenger-app/me"));
    expect(
      f.calls.find((call) => call.path === "/api/passenger-app/me")
        ?.authorization,
    ).toBe(`Bearer ${PAIR.accessToken}`);
    expect(present(tree, "native-passenger-application")).toBe(true);
    await act(async () => {
      await onPress(tree, "app-nav-history")();
      await flush();
    });
    expect(
      f.calls.find((call) => call.path.startsWith("/api/passenger-app/rides?"))
        ?.authorization,
    ).toBe(`Bearer ${PAIR.accessToken}`);
    expect(present(tree, "history-empty")).toBe(true);
    expect(
      [...sdk.loaded].some((filename) =>
        filename.endsWith("/build/fork/useLinking.native.js"),
      ),
    ).toBe(true);
    // Baseline reports NAVIGATE to generated +not-found here, not an import error.
    expect(
      actions,
      "OAuth callback must not dispatch a Router page action",
    ).toEqual([]);
    expect(external.urls.size).toBe(1);
  });

  it("keeps cancellation and provider-error returns on login without inventing callback authority or an account", async () => {
    const sdk = actualSdk();
    const f = httpBoundary();
    const { tree, actions } = await mount(sdk, f);
    const cancelled = await begin(tree);
    await act(async () => {
      resume();
      await cancelled.pending;
      await flush();
    });
    expect(external.browserResults).toEqual([{ type: "dismiss" }]);
    expect(present(tree, "app-login")).toBe(true);
    const failed = await begin(tree);
    const url = `${CALLBACK}?error=access_denied&state=api-state`;
    await returned(url, failed.pending);
    expect(external.browserResults.at(-1)).toEqual({ type: "success", url });
    expect(present(tree, "auth-error")).toBe(true);
    expect(present(tree, "app-login")).toBe(true);
    expect(external.stored).toBe("");
    expect(
      f.calls.filter(
        (call) =>
          call.path.endsWith("/oauth/google/callback") ||
          call.path === "/api/passenger-app/me",
      ),
    ).toEqual([]);
    expect(
      actions,
      "provider refusal must not dispatch a Router page action",
    ).toEqual([]);
  });

  it("preserves real Router parsing and forwards unrelated, initial, demo and unconfigured events literally", async () => {
    const sdk = actualSdk();
    const controls = [
      "drtspassenger:///",
      `${CALLBACK}-other?code=one&state=api-state`,
      "another-app://auth/callback?code=one&state=api-state#kept",
    ];
    const seen: string[] = [];
    const unsubscribe = sdk.linking.subscribe((url) => seen.push(url));
    for (const url of controls) await emitURL(url);
    expect(seen).toEqual(controls);
    const raw = `${CALLBACK}?code=cold-code&state=cold-state`;
    const state = sdk.linking.getStateFromPath(
      sdk.extractPath([], raw),
      sdk.linking.config,
    );
    expect(JSON.stringify(state)).toContain("+not-found");
    expect(sdk.linking.getActionFromState(state!, sdk.linking.config)).toEqual(
      expect.objectContaining({ type: "NAVIGATE" }),
    );
    external.initialURL = raw;
    expect(await sdk.linking.getInitialURL()).toBe(raw);
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "demo");
    await emitURL(raw);
    expect(seen.at(-1)).toBe(raw);
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", "");
    await emitURL(raw);
    expect(seen.at(-1)).toBe(raw);
    unsubscribe();
    expect(external.urls.size).toBe(0);
    expect(external.browserCalls).toEqual([]);
    expect(external.stored).toBe("");
  });
});
