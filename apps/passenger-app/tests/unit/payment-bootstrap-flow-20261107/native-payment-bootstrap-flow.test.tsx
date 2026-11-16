import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SIM boundaries only: real bootstrap, Runtime, Application and SDK clients run.
// No device, provider delivery, or browser process is exercised by this file.
const external = vi.hoisted(() => ({
  stored: "",
  writes: [] as Array<{ accessToken: string; refreshToken: string }>,
  events: [] as string[],
  injections: [] as string[],
  browser: vi.fn(),
  sequence: 0,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "web", Version: 0 },
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
  getItemAsync: async () => external.stored || null,
  setItemAsync: async (_key: string, value: string) => {
    const pair = JSON.parse(value) as {
      accessToken: string;
      refreshToken: string;
    };
    external.writes.push(pair);
    external.events.push(`persist:${pair.accessToken}`);
    external.stored = value;
  },
  deleteItemAsync: async () => {
    external.stored = "";
  },
}));
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: external.browser,
}));
vi.mock("expo-linking", () => ({ openURL: vi.fn(async () => {}) }));
vi.mock("expo-modules-core", () => ({
  uuid: { v4: () => `payment-platform-${++external.sequence}` },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///payment-bootstrap-cache" } },
  File: vi.fn(),
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(async () => {}),
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: {} } }));
vi.mock("react-native-maps", () => ({
  default: "NativeMapView",
  Marker: "NativeMapMarker",
  PROVIDER_GOOGLE: "google",
}));
vi.mock("react-native-webview", async () => {
  const react = await import("react");
  return {
    WebView: react.forwardRef<unknown, Record<string, unknown>>(
      function MockNativePaymentWebView(props, ref) {
        react.useImperativeHandle(ref, () => ({
          injectJavaScript(script: string) {
            external.injections.push(script);
          },
        }));
        return react.createElement("MockNativePaymentWebView", props);
      },
    ),
  };
});
import { createNativePassengerBootstrap } from "../../../lib/bootstrap";
import { NativePassengerApplication } from "../../../components/application/native-passenger-application";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const BASE = "https://native-payment-bootstrap.example.invalid";
const CALLBACK = "drtspassenger://auth/callback";
const METHODS = "/api/passenger-app/payment-methods";
const SESSION = `${METHODS}?binding_session=1`;
const CHANNEL = "drts-native-ecpay-fields";
const PAIR_A = {
  accessToken: "sim-native-payment-access-A",
  refreshToken: "sim-native-payment-refresh-A",
};
const PAIR_B = {
  accessToken: "sim-native-payment-access-B",
  refreshToken: "sim-native-payment-refresh-B",
};
const ACCOUNT = {
  drtsPassengerId: "sim-native-payment-owner",
  displayName: "付款測試乘客",
  contactPhone: "+886900000000",
  contactPhoneVerified: true,
  feeAcknowledgementVersion: "sim-payment-fee",
  status: "active" as const,
  createdAt: "2026-11-07T00:00:00Z",
};
function method(id: string, last4 = "4242") {
  return {
    payment_method_id: id,
    last4,
    card_type: "VISA",
    expiry_month: "12",
    expiry_year: "2099",
    is_default: true,
  };
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
interface HttpCall {
  url: string;
  path: string;
  method: string;
  authorization: string | null;
  body?: string;
}
function httpBoundary() {
  const state = {
    methods: [] as ReturnType<typeof method>[],
    bindResult: {
      status: "action_required",
      next_action_url: "https://payment.ecpay.com.tw/sim-action-required",
    } as Record<string, unknown>,
    rejectSessionOnce: false,
    merchantSequence: 0,
    unexpected: [] as string[],
  };
  const calls: HttpCall[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const call: HttpCall = {
      url,
      path,
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    };
    calls.push(call);
    external.events.push(
      `http:${call.method}:${path}:${call.authorization ?? "none"}`,
    );
    if (url.startsWith(`${BASE}/`) && call.method === "GET") {
      if (path === "/api/passenger-app/me")
        return response({ data: { account: ACCOUNT } });
      if (path === "/api/passenger-app/fares")
        return response({
          data: {
            currentVersion: {
              version: "sim-payment-fee",
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
          },
        });
      if (path === "/api/passenger-app/settings")
        return response({
          data: { minLeadTimeMinutes: 30, requireSmsVerification: false },
        });
      if (path === METHODS)
        return response({ data: { methods: state.methods } });
      if (path === SESSION) {
        if (state.rejectSessionOnce) {
          state.rejectSessionOnce = false;
          return response({ error: { code: "unauthorized" } }, 401);
        }
        return response({
          data: {
            provider: "ecpay",
            merchantToken: `sim-merchant-binding-${++state.merchantSequence}`,
            tokenExpireDate: "2099/12/31 23:59:59",
            sandbox: false,
            serverType: "Prod",
            sdkScriptUrl: "https://ecpg.ecpay.com.tw/Scripts/sdk-1.0.0.js",
            approvedActionOrigins: [
              "https://ecpg.ecpay.com.tw",
              "https://payment.ecpay.com.tw",
            ],
          },
        });
      }
    }
    if (url.startsWith(`${BASE}/`) && call.method === "POST") {
      if (path === METHODS) return response({ data: state.bindResult });
      if (path === "/api/passenger-app/auth/refresh")
        return response({ data: PAIR_B });
    }
    state.unexpected.push(`${call.method} ${url}`);
    throw new Error(`Unexpected HTTP boundary: ${call.method} ${url}`);
  });
  return {
    state,
    calls,
    fetch,
    gets: () => calls.filter((c) => c.path === METHODS && c.method === "GET"),
    binds: () => calls.filter((c) => c.path === METHODS && c.method === "POST"),
    sessions: () =>
      calls.filter((c) => c.path === SESSION && c.method === "GET"),
  };
}
interface ReactTestInstance {
  type: unknown;
  props: Record<string, unknown>;
  findByProps(props: Record<string, unknown>): ReactTestInstance;
  findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
  findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
}
interface Renderer {
  root: ReactTestInstance;
  unmount(): void;
}
type PaymentWebViewInstance = ReactTestInstance & {
  props: {
    testID: string;
    source: { html: string };
    onMessage(event: { nativeEvent: { data: string } }): void;
  };
};
const mounted: Renderer[] = [];
async function flush() {
  for (let i = 0; i < 80; ++i) await Promise.resolve();
}
async function configured(f: ReturnType<typeof httpBoundary>) {
  vi.stubGlobal("fetch", f.fetch);
  const { runtime } = createNativePassengerBootstrap({
    mode: "configured",
    baseUrl: BASE,
    callbackUri: CALLBACK,
  });
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <NativePassengerApplication runtime={runtime} />,
    ) as unknown as Renderer;
    await flush();
  });
  mounted.push(tree);
  expect(runtime.options.mode).toBe("configured");
  expect(runtime.getSnapshot().phase).toBe("active");
  expect(
    f.calls.some(
      (c) =>
        c.path === "/api/passenger-app/me" &&
        c.authorization === `Bearer ${PAIR_A.accessToken}`,
    ),
  ).toBe(true);
  return { tree, runtime };
}
function present(tree: Renderer, id: string) {
  return tree.root.findAllByProps({ testID: id }).length > 0;
}
async function press(tree: Renderer, id: string) {
  await act(async () => {
    await (
      tree.root.findByProps({ testID: id }).props as {
        onPress(): void | Promise<void>;
      }
    ).onPress();
    await flush();
  });
}
function webview(tree: Renderer) {
  const nodes = tree.root.findAll(
    (node) => node.type === "MockNativePaymentWebView",
  );
  expect(
    nodes,
    "configured payment add must mount the actual hosted renderer",
  ).toHaveLength(1);
  return nodes[0]! as PaymentWebViewInstance;
}
async function send(
  node: ReturnType<typeof webview>,
  message: Record<string, unknown>,
) {
  await act(async () => {
    node.props.onMessage({
      nativeEvent: { data: JSON.stringify({ channel: CHANNEL, ...message }) },
    });
    await flush();
  });
}
async function openFields(tree: Renderer) {
  await press(tree, "app-nav-payment");
  await press(tree, "payment-add");
  const view = webview(tree);
  expect(view.props.testID).toBe("native-ecpay-webview");
  expect(tree.root.findByProps({ testID: "payment-bind" }).props.disabled).toBe(
    true,
  );
  expect(view.props.source.html).toContain(
    "https://ecpg.ecpay.com.tw/Scripts/sdk-1.0.0.js",
  );
  expect(view.props.source.html).toContain("sim-merchant-binding-");
  await send(view, { type: "ready" });
  expect(tree.root.findByProps({ testID: "payment-bind" }).props.disabled).toBe(
    false,
  );
  return view;
}
async function beginCollection(tree: Renderer) {
  const before = external.injections.length;
  let pending!: Promise<void>;
  await act(async () => {
    pending = (
      tree.root.findByProps({ testID: "payment-bind" }).props as {
        onPress(): Promise<void>;
      }
    ).onPress();
    await flush();
  });
  expect(external.injections).toHaveLength(before + 1);
  const script = external.injections[before]!;
  expect(script).toContain("__drtsEcpayFields.collect(");
  const captured = /collect\((["'])([^"']+)\1\)/.exec(script);
  expect(captured).not.toBeNull();
  return { pending, requestId: captured![2]! };
}
async function collect(tree: Renderer, token: string) {
  const view = webview(tree);
  const operation = await beginCollection(tree);
  await send(view, {
    type: "credential",
    requestId: operation.requestId,
    providerToken: token,
  });
  await act(async () => {
    await operation.pending;
    await flush();
  });
}
beforeEach(() => {
  external.stored = JSON.stringify(PAIR_A);
  external.writes.length = 0;
  external.events.length = 0;
  external.injections.length = 0;
  external.sequence = 0;
  external.browser.mockReset();
  external.browser.mockResolvedValue({
    type: "success",
    url: `${CALLBACK}?payment_return=1`,
  });
});
afterEach(async () => {
  await act(async () => {
    for (const tree of mounted.splice(0)) tree.unmount();
    await flush();
  });
  vi.unstubAllGlobals();
});

describe("configured Native payment bootstrap with actual SDK and external SIM boundaries", () => {
  it("collects an opaque hosted credential through the configured caller and confirms browser return only through authenticated SDK GET", async () => {
    const f = httpBoundary();
    const { tree } = await configured(f);
    await openFields(tree);
    expect(f.sessions()).toHaveLength(1);
    expect(f.sessions()[0]?.authorization).toBe(`Bearer ${PAIR_A.accessToken}`);
    expect(f.binds()).toHaveLength(0);
    await collect(tree, "sim-opaque-binding-token-A");
    expect(f.binds()).toHaveLength(1);
    expect(JSON.parse(f.binds()[0]!.body!)).toEqual({
      providerToken: "sim-opaque-binding-token-A",
    });
    expect(f.binds()[0]?.authorization).toBe(`Bearer ${PAIR_A.accessToken}`);
    expect(present(tree, "payment-success")).toBe(false);
    expect(external.browser).not.toHaveBeenCalled();
    const before = f.gets().length;
    for (const type of ["opened", "locked"]) {
      external.browser.mockResolvedValueOnce({ type });
      await press(tree, "payment-verify");
      expect(f.gets()).toHaveLength(before);
      expect(present(tree, "payment-success")).toBe(false);
    }
    await press(tree, "payment-verify");
    expect(external.browser).toHaveBeenLastCalledWith(
      f.state.bindResult.next_action_url,
      CALLBACK,
    );
    expect(f.gets()).toHaveLength(before + 1);
    expect(present(tree, "payment-pending")).toBe(true);
    expect(present(tree, "payment-success")).toBe(false);
    f.state.methods = [method("sim-confirmed-card-A")];
    expect(present(tree, "payment-success")).toBe(false);
    await press(tree, "payment-verify");
    expect(f.gets()).toHaveLength(before + 2);
    expect(f.gets().at(-1)?.authorization).toBe(`Bearer ${PAIR_A.accessToken}`);
    expect(present(tree, "payment-method-sim-confirmed-card-A")).toBe(true);
    expect(present(tree, "payment-success")).toBe(true);
    expect(present(tree, "payment-pending")).toBe(false);
    expect(f.binds()).toHaveLength(1);
    expect(f.state.unexpected).toEqual([]);
  });

  it("reconciles browser close after backend completion and resolves a later pending bind without a repeated POST", async () => {
    const f = httpBoundary();
    const { tree } = await configured(f);
    await openFields(tree);
    await collect(tree, "sim-opaque-binding-token-cancel");
    const beforeCancel = f.gets().length;
    f.state.methods = [method("sim-confirmed-after-close", "1111")];
    external.browser.mockResolvedValueOnce({ type: "cancel" });
    expect(present(tree, "payment-success")).toBe(false);
    await press(tree, "payment-verify");
    expect(f.gets()).toHaveLength(beforeCancel + 1);
    expect(present(tree, "payment-success")).toBe(true);
    expect(present(tree, "payment-method-sim-confirmed-after-close")).toBe(
      true,
    );
    expect(f.binds()).toHaveLength(1);
    f.state.bindResult = { status: "pending" };
    await press(tree, "payment-add");
    const view = webview(tree);
    await send(view, { type: "ready" });
    await collect(tree, "sim-opaque-binding-token-pending");
    expect(f.binds()).toHaveLength(2);
    expect(present(tree, "payment-success")).toBe(false);
    expect(present(tree, "payment-pending")).toBe(true);
    expect(
      tree.root.findByProps({ testID: "payment-bind" }).props.disabled,
    ).toBe(true);
    await press(tree, "payment-bind");
    expect(f.binds()).toHaveLength(2);
    await press(tree, "payment-refresh");
    expect(present(tree, "payment-pending")).toBe(true);
    expect(present(tree, "payment-success")).toBe(false);
    f.state.methods = [
      { ...method("sim-confirmed-after-close", "1111"), is_default: false },
      method("sim-later-materialized-card", "2222"),
    ];
    await press(tree, "payment-refresh");
    expect(present(tree, "payment-method-sim-later-materialized-card")).toBe(
      true,
    );
    expect(present(tree, "payment-success")).toBe(true);
    expect(present(tree, "payment-pending")).toBe(false);
    expect(f.binds()).toHaveLength(2);
    expect(f.state.unexpected).toEqual([]);
  });

  it("refreshes the real binding-session request and rejects detached bridge work after actual runtime client replacement", async () => {
    const f = httpBoundary();
    const { tree, runtime } = await configured(f);
    expect(typeof runtime.payment.getBindingSession).toBe("function");
    f.state.rejectSessionOnce = true;
    const session = await runtime.payment.getBindingSession();
    expect(session.provider).toBe("ecpay");
    expect(f.sessions()).toHaveLength(2);
    expect(f.sessions().map((c) => c.authorization)).toEqual([
      `Bearer ${PAIR_A.accessToken}`,
      `Bearer ${PAIR_B.accessToken}`,
    ]);
    const refresh = f.calls.filter(
      (c) => c.path === "/api/passenger-app/auth/refresh",
    );
    expect(refresh).toHaveLength(1);
    expect(JSON.parse(refresh[0]!.body!)).toEqual({
      refreshToken: PAIR_A.refreshToken,
    });
    expect(refresh[0]?.authorization).toBeNull();
    expect(external.writes).toEqual([PAIR_B]);
    expect(JSON.parse(external.stored)).toEqual(PAIR_B);
    expect(
      external.events.indexOf(`persist:${PAIR_B.accessToken}`),
    ).toBeLessThan(
      external.events.indexOf(
        `http:GET:${SESSION}:Bearer ${PAIR_B.accessToken}`,
      ),
    );
    const oldView = await openFields(tree);
    // Save the external callback while mounted; a renderer node cannot be read
    // after its owning component is unmounted by the identity change.
    const oldOnMessage = oldView.props.onMessage as (event: {
      nativeEvent: { data: string };
    }) => void;
    const detached = await beginCollection(tree);
    expect(f.binds()).toHaveLength(0);
    const oldClient = runtime.payment;
    const identityVersion = runtime.getSnapshot().identityVersion;
    await act(async () => {
      await runtime.authenticate(ACCOUNT, identityVersion);
      await flush();
    });
    expect(runtime.payment).not.toBe(oldClient);
    expect(runtime.getSnapshot().identityVersion).toBe(identityVersion + 1);
    await act(async () => {
      oldOnMessage({
        nativeEvent: {
          data: JSON.stringify({
            channel: CHANNEL,
            type: "credential",
            requestId: detached.requestId,
            providerToken: "sim-stale-opaque-token-must-not-post",
          }),
        },
      });
      await flush();
    });
    await detached.pending;
    expect(f.binds()).toHaveLength(0);
    const beforeOldRequest = f.calls.length;
    // Runtime's old-epoch guard rejects before HTTP. The shared payment SDK
    // intentionally wraps transport failures in its existing public API error.
    await expect(oldClient.getBindingSession()).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    });
    expect(f.calls).toHaveLength(beforeOldRequest);
    f.state.bindResult = { status: "pending" };
    await openFields(tree);
    await collect(tree, "sim-current-opaque-token");
    expect(f.binds()).toHaveLength(1);
    expect(JSON.parse(f.binds()[0]!.body!)).toEqual({
      providerToken: "sim-current-opaque-token",
    });
    expect(f.binds()[0]?.authorization).toBe(`Bearer ${PAIR_B.accessToken}`);
    expect(present(tree, "payment-success")).toBe(false);
    expect(present(tree, "payment-pending")).toBe(true);
    expect(f.state.unexpected).toEqual([]);
  });
});
