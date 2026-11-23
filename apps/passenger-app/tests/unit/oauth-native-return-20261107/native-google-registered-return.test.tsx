import React from "react";
import { act, create } from "react-test-renderer";
import * as crypto from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";
import * as ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  Platform: { OS: "ios", Version: "18.0" },
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
  uuid: { v4: () => "sim-google-oauth-request" },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///google-oauth-return-sim" } },
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
const BASE = "https://api.smarttransport.tw";
const WEB_CALLBACK = "https://ride.smarttransport.tw/auth/callback/google";
const NATIVE_CALLBACK = "drtspassenger://auth/callback";
const ALT_NATIVE_CALLBACK = "drtspassenger://oauth/callback";
const GOOGLE_CLIENT_ID = "pax-google-web-client";
const GOOGLE_CLIENT_SECRET = "pax-google-web-secret";

interface StoredOAuthTransaction {
  transactionId: string;
  provider: string;
  purpose: string;
  stateHash: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  redirectUri: string;
  drtsPassengerId: string | null;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
}

function loadActualOAuthModules() {
  const repoRoot = path.resolve(APP, "../..");
  const apiRequire = createRequire(
    path.join(repoRoot, "apps/api/package.json"),
  );
  const nest = apiRequire("@nestjs/common");
  function loadTs(relPath: string, deps: Record<string, unknown>) {
    const src = readFileSync(path.join(repoRoot, relPath), "utf8");
    const out: Record<string, unknown> = {};
    const compiled = ts.transpileModule(src, {
      compilerOptions: {
        experimentalDecorators: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    new Function("exports", "require", compiled)(out, (id: string) => {
      if (!(id in deps)) throw new Error(`Missing dep ${id} for ${relPath}`);
      return deps[id];
    });
    return out;
  }
  const googleEndpoints = {
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    jwks: "https://www.googleapis.com/oauth2/v3/certs",
  };
  const config = loadTs(
    "apps/api/src/modules/passenger-app/oauth/oauth-provider.config.ts",
    {
      "../../auth/oidc-id-token-verifier": {
        GOOGLE_OIDC_ENDPOINTS: googleEndpoints,
        GOOGLE_OIDC_ISSUER: ["https://accounts.google.com"],
        LINE_OIDC_ENDPOINTS: {},
        LINE_OIDC_ISSUER: "https://access.line.me",
      },
      "./facebook-oauth": {},
    },
  );
  class StubVerifier {
    async verify(token: string, expectedNonce: string) {
      const payload = JSON.parse(
        Buffer.from(token, "base64url").toString("utf8"),
      ) as { nonce: string; sub: string; name: string; email: string };
      if (payload.nonce !== expectedNonce) throw new Error("nonce_mismatch");
      return { ...payload, email_verified: true };
    }
  }
  const serviceMod = loadTs(
    "apps/api/src/modules/passenger-app/oauth/passenger-oauth.service.ts",
    {
      "node:crypto": crypto,
      "@nestjs/common": nest,
      "../../../common/api-envelope": {
        ApiRequestError: class extends Error {
          constructor(
            readonly status: number,
            readonly code: string,
            message: string,
          ) {
            super(message);
          }
        },
      },
      "../../auth/oidc-id-token-verifier": {
        OidcIdTokenVerifier: StubVerifier,
      },
      "../account/passenger-account.service": {
        PassengerAccountService: class {},
      },
      "./oauth-provider.config": config,
      "./oauth-transaction.repository": {
        PassengerOAuthTransactionRepository: class {},
      },
      "./facebook-oauth": {},
    },
  );
  const webReturnMod = loadTs(
    "apps/passenger-app-web/app/auth/native-oauth-return.ts",
    {},
  );
  return {
    googleEndpoints,
    PassengerOAuthService: serviceMod.PassengerOAuthService as new (
      transactions: {
        insert(record: StoredOAuthTransaction): Promise<void>;
        claim(
          transactionId: string,
          now: string,
        ): Promise<StoredOAuthTransaction | null>;
      },
      accounts: unknown,
    ) => {
      start(
        provider: "google",
        rawCommand: unknown,
        identity: null,
      ): Promise<{
        authUrl: string;
        transactionId: string;
        expiresAt: string;
        state: string;
      }>;
      callback(
        provider: "google",
        rawCommand: unknown,
        identity: null,
      ): Promise<unknown>;
    },
    buildNativePassengerOAuthReturnUrl:
      webReturnMod.buildNativePassengerOAuthReturnUrl as (
        provider: string | undefined,
        search: { get(name: string): string | null },
      ) => string | null,
  };
}

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
  return { linking: options, useLinking };
}

class MemoryOAuthTransactionStore {
  rows = new Map<string, StoredOAuthTransaction>();
  async insert(record: StoredOAuthTransaction) {
    this.rows.set(record.transactionId, structuredClone(record));
  }
  async claim(transactionId: string, now: string) {
    const row = this.rows.get(transactionId);
    if (!row || row.consumedAt || Date.parse(row.expiresAt) <= Date.parse(now))
      return null;
    row.consumedAt = now;
    return structuredClone(row);
  }
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

describe("Native PassengerAppEntry with real PassengerOAuthService Google HTTPS redirect bridge", () => {
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
    vi.stubEnv("JWT_SECRET", "unit-only-native-google-session-key");
    vi.stubEnv("JWT_KEY_RING_JSON", "");
    vi.stubEnv("JWT_PRIVATE_KEY", "");
    vi.stubEnv("JWT_PUBLIC_KEY", "");
    vi.stubEnv("JWT_ALGORITHM", "HS256");
    vi.stubEnv("JWT_ALGORITHMS", "HS256");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", GOOGLE_CLIENT_ID);
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", GOOGLE_CLIENT_SECRET);
    vi.stubEnv(
      "OAUTH_REDIRECT_ALLOWLIST",
      [NATIVE_CALLBACK, WEB_CALLBACK].join(","),
    );
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_API_BASE_URL", BASE);
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", NATIVE_CALLBACK);
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

  it("completes Google Web-client HTTPS callback -> drtspassenger://auth/callback return into the same mobile session and rejects mismatched state returns before calling /callback", async () => {
    const sdk = actualSdk();
    const {
      googleEndpoints,
      PassengerOAuthService,
      buildNativePassengerOAuthReturnUrl,
    } = loadActualOAuthModules();
    const oauthStore = new MemoryOAuthTransactionStore();
    const accounts = {
      async findOrCreateByIdentity() {
        return { drtsPassengerId: "google-native-passenger-id" };
      },
      async issueSession() {
        return {
          accessToken: "sim-google-native-access-token",
          refreshToken: "sim-google-native-refresh-token",
        };
      },
    };
    const oauthService = new PassengerOAuthService(oauthStore, accounts);
    const tokenExchanges: Array<Record<string, string>> = [];
    const callbackCalls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr === googleEndpoints.token) {
          const params = new URLSearchParams(String(init?.body ?? ""));
          const record = Object.fromEntries(params.entries());
          tokenExchanges.push(record);
          const txn = [...oauthStore.rows.values()].find(
            (r) => r.codeVerifier === record.code_verifier,
          );
          if (!txn || record.redirect_uri !== WEB_CALLBACK) {
            return new Response(JSON.stringify({ error: "invalid_grant" }), {
              status: 400,
            });
          }
          const idToken = Buffer.from(
            JSON.stringify({
              sub: "google-native-pax-1",
              name: "Google 原生乘客",
              email: "google.native@example.test",
              nonce: txn.nonce,
            }),
          ).toString("base64url");
          return new Response(JSON.stringify({ id_token: idToken }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const url = new URL(urlStr);
        const reply = (data: unknown) =>
          new Response(JSON.stringify({ data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        if (url.pathname === "/api/passenger-app/auth/providers")
          return reply({ providers: ["google"] });
        if (url.pathname === "/api/passenger-app/auth/oauth/google/start") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return reply(await oauthService.start("google", body, null));
        }
        if (url.pathname === "/api/passenger-app/auth/oauth/google/callback") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          callbackCalls.push(body.transactionId);
          return reply(await oauthService.callback("google", body, null));
        }
        if (url.pathname === "/api/passenger-app/me") {
          const bearer = new Headers(init?.headers).get("Authorization");
          if (bearer !== "Bearer sim-google-native-access-token") {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
              status: 401,
            });
          }
          return reply({
            account: {
              drts_passenger_id: "google-native-passenger-id",
              display_name: "Google 原生乘客",
              contact_phone_verified: true,
              status: "active",
              created_at: "2026-11-23T00:00:00Z",
            },
          });
        }
        if (url.pathname === "/api/passenger-app/settings")
          return reply({
            minLeadTimeMinutes: 30,
            requireSmsVerification: false,
          });
        if (url.pathname === "/api/passenger-app/fares")
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
        if (url.pathname === "/api/passenger-app/payment-methods")
          return reply({ methods: [] });
        if (url.pathname === "/api/passenger-app/rides")
          return reply({ rides: [], next_cursor: null });
        throw new Error(`unexpected_http:${url.pathname}`);
      }),
    );

    const actions: unknown[] = [];
    function RouterObserver() {
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

    let tree!: Renderer;
    await act(async () => {
      tree = create(
        <>
          <RouterObserver />
          <PassengerAppEntry />
        </>,
      ) as unknown as Renderer;
      await flush();
    });
    mounted.push(tree);
    expect(present(tree, "app-login")).toBe(true);

    // 1. Mismatched state return is rejected locally without burning the active server transaction
    let firstPending!: void | Promise<void>;
    await act(async () => {
      firstPending = onPress(tree, "auth-oauth-google")();
      await flush();
    });
    const firstAuthUrl = new URL(external.browserCalls.at(-1)!);
    expect(firstAuthUrl.origin).toBe("https://accounts.google.com");
    expect(firstAuthUrl.searchParams.get("redirect_uri")).toBe(WEB_CALLBACK);
    const firstTxnId = [...oauthStore.rows.keys()][0]!;

    const mismatchedReturnUrl = `${NATIVE_CALLBACK}?code=wrong-code&state=drtspassenger.unrelated_session_state_token_12345`;
    await act(async () => {
      await emitURL(mismatchedReturnUrl);
      await flush();
      resume();
      await firstPending;
      await flush();
    });
    expect(present(tree, "auth-error")).toBe(true);
    expect(present(tree, "app-login")).toBe(true);
    expect(callbackCalls).toEqual([]);
    expect(oauthStore.rows.get(firstTxnId)?.consumedAt).toBeNull();

    // 2. Normal Google sign-in via HTTPS callback bridge returns to same native session
    let secondPending!: void | Promise<void>;
    await act(async () => {
      secondPending = onPress(tree, "auth-oauth-google")();
      await flush();
    });
    const secondAuthUrl = new URL(external.browserCalls.at(-1)!);
    const issuedState = secondAuthUrl.searchParams.get("state")!;
    expect(secondAuthUrl.searchParams.get("redirect_uri")).toBe(WEB_CALLBACK);
    expect(issuedState).toMatch(/^drtspassenger\.[A-Za-z0-9_-]{16,}$/);

    const bridgedUrl = buildNativePassengerOAuthReturnUrl(
      "google",
      new URLSearchParams({
        code: "google-verified-code-20261123",
        state: issuedState,
      }),
    )!;
    expect(bridgedUrl).toBe(
      `${NATIVE_CALLBACK}?code=google-verified-code-20261123&state=${encodeURIComponent(issuedState)}`,
    );

    await act(async () => {
      await emitURL(bridgedUrl);
      await flush();
      resume();
      await secondPending;
      await flush();
    });

    expect(tokenExchanges).toHaveLength(1);
    expect(tokenExchanges[0]?.redirect_uri).toBe(WEB_CALLBACK);
    expect(present(tree, "native-passenger-application")).toBe(true);
    expect(JSON.parse(external.stored)).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(actions).toEqual([]);
  });

  it("completes Google Web-client HTTPS callback -> drtspassenger://oauth/callback return into the same mobile session when configured with alternate allowlisted callback URI", async () => {
    vi.stubEnv(
      "OAUTH_REDIRECT_ALLOWLIST",
      [ALT_NATIVE_CALLBACK, WEB_CALLBACK].join(","),
    );
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", ALT_NATIVE_CALLBACK);
    const sdk = actualSdk();
    const {
      googleEndpoints,
      PassengerOAuthService,
      buildNativePassengerOAuthReturnUrl,
    } = loadActualOAuthModules();
    const oauthStore = new MemoryOAuthTransactionStore();
    const accounts = {
      async findOrCreateByIdentity() {
        return { drtsPassengerId: "google-alt-native-passenger-id" };
      },
      async issueSession() {
        return {
          accessToken: "sim-google-alt-native-access-token",
          refreshToken: "sim-google-alt-native-refresh-token",
        };
      },
    };
    const oauthService = new PassengerOAuthService(oauthStore, accounts);
    const tokenExchanges: Array<Record<string, string>> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr === googleEndpoints.token) {
          const params = new URLSearchParams(String(init?.body ?? ""));
          const record = Object.fromEntries(params.entries());
          tokenExchanges.push(record);
          const txn = [...oauthStore.rows.values()].find(
            (r) => r.codeVerifier === record.code_verifier,
          );
          if (!txn || record.redirect_uri !== WEB_CALLBACK) {
            return new Response(JSON.stringify({ error: "invalid_grant" }), {
              status: 400,
            });
          }
          const idToken = Buffer.from(
            JSON.stringify({
              sub: "google-alt-native-pax-1",
              name: "Google 替代回呼乘客",
              email: "google.alt.native@example.test",
              nonce: txn.nonce,
            }),
          ).toString("base64url");
          return new Response(JSON.stringify({ id_token: idToken }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        const url = new URL(urlStr);
        const reply = (data: unknown) =>
          new Response(JSON.stringify({ data }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        if (url.pathname === "/api/passenger-app/auth/providers")
          return reply({ providers: ["google"] });
        if (url.pathname === "/api/passenger-app/auth/oauth/google/start") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return reply(await oauthService.start("google", body, null));
        }
        if (url.pathname === "/api/passenger-app/auth/oauth/google/callback") {
          const body = JSON.parse(String(init?.body ?? "{}"));
          return reply(await oauthService.callback("google", body, null));
        }
        if (url.pathname === "/api/passenger-app/me") {
          const bearer = new Headers(init?.headers).get("Authorization");
          if (bearer !== "Bearer sim-google-alt-native-access-token") {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
              status: 401,
            });
          }
          return reply({
            account: {
              drts_passenger_id: "google-alt-native-passenger-id",
              display_name: "Google 替代回呼乘客",
              contact_phone_verified: true,
              status: "active",
              created_at: "2026-11-23T00:00:00Z",
            },
          });
        }
        if (url.pathname === "/api/passenger-app/settings")
          return reply({
            minLeadTimeMinutes: 30,
            requireSmsVerification: false,
          });
        if (url.pathname === "/api/passenger-app/fares")
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
        if (url.pathname === "/api/passenger-app/payment-methods")
          return reply({ methods: [] });
        if (url.pathname === "/api/passenger-app/rides")
          return reply({ rides: [], next_cursor: null });
        throw new Error(`unexpected_http:${url.pathname}`);
      }),
    );

    const actions: unknown[] = [];
    function RouterObserver() {
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

    let tree!: Renderer;
    await act(async () => {
      tree = create(
        <>
          <RouterObserver />
          <PassengerAppEntry />
        </>,
      ) as unknown as Renderer;
      await flush();
    });
    mounted.push(tree);
    expect(present(tree, "app-login")).toBe(true);

    let pending!: void | Promise<void>;
    await act(async () => {
      pending = onPress(tree, "auth-oauth-google")();
      await flush();
    });
    const authUrl = new URL(external.browserCalls.at(-1)!);
    const issuedState = authUrl.searchParams.get("state")!;
    expect(authUrl.searchParams.get("redirect_uri")).toBe(WEB_CALLBACK);

    const bridgedUrl = buildNativePassengerOAuthReturnUrl(
      "google",
      new URLSearchParams({
        code: "google-alt-verified-code-20261123",
        state: issuedState,
      }),
    )!;
    expect(bridgedUrl).toBe(
      `${ALT_NATIVE_CALLBACK}?code=google-alt-verified-code-20261123&state=${encodeURIComponent(issuedState)}`,
    );

    await act(async () => {
      await emitURL(bridgedUrl);
      await flush();
      resume();
      await pending;
      await flush();
    });

    expect(external.browserResults.at(-1)).toEqual({
      type: "success",
      url: bridgedUrl,
    });
    expect(tokenExchanges).toHaveLength(1);
    expect(tokenExchanges[0]?.redirect_uri).toBe(WEB_CALLBACK);
    expect(present(tree, "native-passenger-application")).toBe(true);
    expect(JSON.parse(external.stored)).toEqual({
      accessToken: "sim-google-alt-native-access-token",
      refreshToken: "sim-google-alt-native-refresh-token",
    });
    expect(actions).toEqual([]);
  });

  it("rejects unsupported native callback URIs before launching the system browser or calling /oauth/google/start", async () => {
    vi.stubEnv(
      "EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI",
      "drtspassenger://account/payment-methods",
    );
    actualSdk();
    const startCalls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/api/passenger-app/auth/providers") {
          return new Response(
            JSON.stringify({ data: { providers: ["google"] } }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        startCalls.push(url.pathname);
        throw new Error(`unexpected_http:${url.pathname}`);
      }),
    );

    let tree!: Renderer;
    await act(async () => {
      tree = create(<PassengerAppEntry />) as unknown as Renderer;
      await flush();
    });
    mounted.push(tree);
    expect(present(tree, "app-login")).toBe(true);

    await act(async () => {
      await onPress(tree, "auth-oauth-google")();
      await flush();
    });
    expect(present(tree, "auth-error")).toBe(true);
    expect(startCalls).toEqual([]);
    expect(external.browserCalls).toEqual([]);
  });
});
