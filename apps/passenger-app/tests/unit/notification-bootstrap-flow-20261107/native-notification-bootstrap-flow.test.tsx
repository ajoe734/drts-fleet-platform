import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// SIM boundaries: OS/native SDK/storage and HTTP only. Bootstrap, Application,
// the Firebase adapter, session, push client and lifecycle are actual modules.
// These tests do not prove APNs/FCM delivery or a built native binary.
type Message = { data?: Record<string, string> };
type AlertButton = { text?: string; style?: string; onPress?: () => void };
const external = vi.hoisted(() => ({
  platform: "ios",
  platformVersion: 18 as number | string,
  appId: "com.example.drts.notification.sim",
  appVersion: "0.1.0-notification-sim",
  iosConfigured: true as unknown,
  androidConfigured: true as unknown,
  stored: new Map<string, string>(),
  events: [] as string[],
  iosStatus: -1,
  androidGranted: false,
  remotelyRegistered: false,
  token: "sim-actual-fcm-registration-A",
  initial: null as Message | null,
  initialPromise: null as Promise<Message | null> | null,
  tokenListeners: new Set<(token: string) => void>(),
  openedListeners: new Set<(message: Message) => void>(),
  foregroundListeners: new Set<(message: Message) => void>(),
  appStateListeners: new Set<(state: string) => void>(),
  tokenHistory: [] as Array<(token: string) => void>,
  openedHistory: [] as Array<(message: Message) => void>,
  foregroundHistory: [] as Array<(message: Message) => void>,
  appStateHistory: [] as Array<(state: string) => void>,
  removed: [] as string[],
  alerts: [] as Array<{
    title: string;
    message: string | undefined;
    buttons: AlertButton[];
  }>,
  getMessaging: vi.fn(),
  getToken: vi.fn(),
  hasPermission: vi.fn(),
  requestPermission: vi.fn(),
  checkAndroid: vi.fn(),
  requestAndroid: vi.fn(),
  registerRemote: vi.fn(),
  getInitial: vi.fn(),
  sequence: 0,
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
  Platform: {
    get OS() {
      return external.platform;
    },
    get Version() {
      return external.platformVersion;
    },
    select: <T,>(values: Record<string, T>) =>
      values[external.platform] ?? values.default,
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      POST_NOTIFICATIONS: "android.permission.POST_NOTIFICATIONS",
    },
    RESULTS: {
      GRANTED: "granted",
      DENIED: "denied",
      NEVER_ASK_AGAIN: "never_ask_again",
    },
    check: external.checkAndroid,
    request: external.requestAndroid,
  },
  Alert: {
    alert(title: string, message?: string, buttons: AlertButton[] = []) {
      external.alerts.push({ title, message, buttons });
    },
  },
  AppState: {
    currentState: "active",
    addEventListener(_event: string, listener: (state: string) => void) {
      external.appStateListeners.add(listener);
      external.appStateHistory.push(listener);
      return {
        remove() {
          external.appStateListeners.delete(listener);
        },
      };
    },
  },
}));
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return {
        version: external.appVersion,
        ios: { bundleIdentifier: external.appId },
        android: { package: external.appId },
        extra: {
          passengerNativeNotifications: {
            iosConfigured: external.iosConfigured,
            androidConfigured: external.androidConfigured,
          },
        },
      };
    },
  },
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => external.stored.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    external.events.push(`persist:${key}`);
    external.stored.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    external.events.push(`clear:${key}`);
    external.stored.delete(key);
  },
}));
vi.mock("@react-native-firebase/messaging", () => ({
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
    EPHEMERAL: 3,
  },
  getMessaging: external.getMessaging,
  getToken: external.getToken,
  hasPermission: external.hasPermission,
  requestPermission: external.requestPermission,
  isDeviceRegisteredForRemoteMessages: () => external.remotelyRegistered,
  registerDeviceForRemoteMessages: external.registerRemote,
  getInitialNotification: external.getInitial,
  onTokenRefresh(_messaging: unknown, listener: (token: string) => void) {
    external.tokenListeners.add(listener);
    external.tokenHistory.push(listener);
    return () => {
      external.tokenListeners.delete(listener);
      external.removed.push("token");
    };
  },
  onNotificationOpenedApp(
    _messaging: unknown,
    listener: (message: Message) => void,
  ) {
    external.openedListeners.add(listener);
    external.openedHistory.push(listener);
    return () => {
      external.openedListeners.delete(listener);
      external.removed.push("opened");
    };
  },
  onMessage(_messaging: unknown, listener: (message: Message) => void) {
    external.foregroundListeners.add(listener);
    external.foregroundHistory.push(listener);
    return () => {
      external.foregroundListeners.delete(listener);
      external.removed.push("foreground");
    };
  },
}));
vi.mock("expo-web-browser", () => ({ openAuthSessionAsync: vi.fn() }));
vi.mock("expo-linking", () => ({ openURL: vi.fn(async () => {}) }));
vi.mock("expo-modules-core", () => ({
  uuid: { v4: () => `notification-platform-${++external.sequence}` },
}));
vi.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///notification-sim-cache" } },
  File: vi.fn(),
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: vi.fn(async () => false),
  shareAsync: vi.fn(async () => {}),
}));
vi.mock("react-native-webview", () => ({ WebView: "NativePaymentWebView" }));
vi.mock("react-native-maps", () => ({
  default: "NativeMapView",
  Marker: "NativeMapMarker",
  Polyline: "NativeMapPolyline",
  PROVIDER_GOOGLE: "google",
}));

// Only existing imports: an absent new adapter cannot turn the baseline into an import-error RED.
import { createNativePassengerBootstrap } from "../../../lib/bootstrap";
import { readNativePassengerBootstrapConfig } from "../../../lib/config";
import { NativePassengerApplication } from "../../../components/application/native-passenger-application";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const BASE = "https://native-notification-bootstrap.example.invalid";
const CALLBACK = "drtspassenger://auth/callback";
const CONSENT = "sim-public-notification-consent-20261107";
const SESSION_KEY = "drts.passenger.session.v1";
const ACK_KEY = "drts.passenger.push.v1";
const DEVICES = "/api/passenger-app/push-devices";
const PAIR_A = {
  accessToken: "sim-notification-owner-access-A",
  refreshToken: "sim-notification-owner-refresh-A",
};
const PAIR_B = {
  accessToken: "sim-notification-owner-access-B",
  refreshToken: "sim-notification-owner-refresh-B",
};
const ACCOUNT_A = {
  drtsPassengerId: "sim-notification-owner-A",
  displayName: "通知示意甲",
  contactPhone: "+886900000000",
  contactPhoneVerified: true,
  feeAcknowledgementVersion: "sim-notification-fare",
  status: "active" as const,
  createdAt: "2026-11-07T00:00:00Z",
};
const ACCOUNT_B = {
  ...ACCOUNT_A,
  drtsPassengerId: "sim-notification-owner-B",
  displayName: "通知示意乙",
};
function snake(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snake);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      snake(entry),
    ]),
  );
}
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function success(data: unknown) {
  return response({ data: snake(data) });
}
function ownedRide(orderId: string) {
  return {
    order: {
      orderId,
      orderNo: `SIM-${orderId}`,
      status: "created",
      timingMode: "scheduled",
      requestedPickupAt: "2099-11-07T12:00:00Z",
      pickup: { address: "示意起點" },
      dropoff: { address: "示意終點" },
      completedAt: null,
      cancelledAt: null,
      cancelableUntil: null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: true,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}
interface HttpCall {
  path: string;
  method: string;
  authorization: string | null;
  body?: string;
}
function httpBoundary() {
  const state = {
    deviceSequence: 0,
    unregisterSuccess: true,
    unexpected: [] as string[],
  };
  const calls: HttpCall[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    const call: HttpCall = {
      path,
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("Authorization"),
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
    };
    calls.push(call);
    external.events.push(
      `http:${call.method}:${path}:${call.authorization ?? "none"}`,
    );
    if (url.startsWith(`${BASE}/`)) {
      if (call.method === "GET") {
        if (path === "/api/passenger-app/me")
          return success({
            account:
              call.authorization === `Bearer ${PAIR_B.accessToken}`
                ? ACCOUNT_B
                : ACCOUNT_A,
          });
        if (path === "/api/passenger-app/auth/providers")
          return success({ providers: ["email"] });
        if (path === "/api/passenger-app/me/identities")
          return success({ identities: [] });
        if (path === "/api/passenger-app/settings")
          return success({
            minLeadTimeMinutes: 30,
            requireSmsVerification: false,
          });
        if (path === "/api/passenger-app/fares")
          return success({
            currentVersion: {
              version: "sim-notification-fare",
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
        if (path === "/api/passenger-app/payment-methods")
          return success({ methods: [] });
        if (path.startsWith("/api/passenger-app/rides/")) {
          const id = decodeURIComponent(
            path.slice("/api/passenger-app/rides/".length),
          );
          if (id.startsWith("sim-owned-"))
            return success({ ride: ownedRide(id) });
          return response({ error: { code: "ride_not_found" } }, 404);
        }
      }
      if (call.method === "POST" && path === DEVICES)
        return success({ deviceId: `sim-device-${++state.deviceSequence}` });
      if (call.method === "DELETE" && path.startsWith(`${DEVICES}/`))
        return success({ success: state.unregisterSuccess });
      if (call.method === "POST" && path === "/api/passenger-app/auth/logout")
        return success({ success: true });
    }
    state.unexpected.push(`${call.method} ${url}`);
    throw new Error(`Unexpected HTTP boundary: ${call.method} ${url}`);
  });
  return {
    state,
    calls,
    fetch,
    posts: () => calls.filter((c) => c.path === DEVICES && c.method === "POST"),
    deletes: () =>
      calls.filter(
        (c) => c.path.startsWith(`${DEVICES}/`) && c.method === "DELETE",
      ),
    rides: () =>
      calls.filter(
        (c) =>
          c.path.startsWith("/api/passenger-app/rides/") && c.method === "GET",
      ),
    logouts: () =>
      calls.filter(
        (c) =>
          c.path === "/api/passenger-app/auth/logout" && c.method === "POST",
      ),
  };
}
// Native XHR is an external boundary; no live SSE server or timer transport is started.
class NativeRequest {
  readyState = 1;
  status = 0;
  responseText = "";
  response: unknown = null;
  responseType = "";
  onreadystatechange: (() => void) | null = null;
  onprogress: (() => void) | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open() {}
  setRequestHeader() {}
  getResponseHeader() {
    return "text/event-stream";
  }
  send() {}
  abort() {
    this.onabort?.();
  }
}
interface ReactTestInstance {
  type: unknown;
  props: Record<string, unknown>;
  findByProps(props: Record<string, unknown>): ReactTestInstance;
  findAllByProps(props: Record<string, unknown>): ReactTestInstance[];
}
interface Renderer {
  root: ReactTestInstance;
  unmount(): void;
}
const mounted: Renderer[] = [];
async function flush() {
  for (let index = 0; index < 120; ++index) await Promise.resolve();
  // Wait for the actual lazy SDK module boundary, not an assumed microtask count.
  await vi.dynamicImportSettled();
  for (let index = 0; index < 120; ++index) await Promise.resolve();
}
async function nativeWork(work: () => void | Promise<void>) {
  await act(async () => {
    await work();
    await flush();
  });
}
async function configured(f: ReturnType<typeof httpBoundary>) {
  vi.stubGlobal("fetch", f.fetch);
  const beforeLoad = external.getMessaging.mock.calls.length;
  const config = readNativePassengerBootstrapConfig();
  const { runtime } = createNativePassengerBootstrap(config);
  expect(runtime.options.mode).toBe("configured");
  expect(
    external.getMessaging.mock.calls.length,
    "native Firebase must remain lazy before lifecycle IO",
  ).toBe(beforeLoad);
  let tree!: Renderer;
  await act(async () => {
    tree = create(
      <NativePassengerApplication runtime={runtime} />,
    ) as unknown as Renderer;
    await flush();
  });
  mounted.push(tree);
  expect(runtime.getSnapshot().phase).toBe("active");
  expect(
    f.calls.some(
      (call) =>
        call.path === "/api/passenger-app/me" &&
        call.authorization === `Bearer ${PAIR_A.accessToken}`,
    ),
  ).toBe(true);
  return { tree, runtime };
}
function present(tree: Renderer, id: string) {
  return tree.root.findAllByProps({ testID: id }).length > 0;
}
function requireConfiguredNotifications(tree: Renderer) {
  expect(
    present(tree, "app-enable-notifications"),
    "configured native notifications must expose the existing enable action",
  ).toBe(true);
  expect(present(tree, "app-push-skipped")).toBe(false);
}
async function press(tree: Renderer, id: string) {
  await nativeWork(async () => {
    await (
      tree.root.findByProps({ testID: id }).props as {
        onPress(): void | Promise<void>;
      }
    ).onPress();
  });
}
async function unmount(tree: Renderer) {
  mounted.splice(mounted.indexOf(tree), 1);
  await nativeWork(() => tree.unmount());
}
function ack() {
  return JSON.parse(external.stored.get(ACK_KEY) ?? "null") as unknown;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function alertView(index = external.alerts.length - 1) {
  const alert = external.alerts[index]!;
  expect(alert.title).toBe("乘車通知");
  expect(alert.message).toBe("請查看最新乘車資訊");
  expect(alert.buttons.map((button) => button.text)).toEqual([
    "稍後",
    "查看行程",
  ]);
  return alert.buttons[1]!.onPress!;
}
function resetNative() {
  external.platform = "ios";
  external.platformVersion = 18;
  external.appId = "com.example.drts.notification.sim";
  external.appVersion = "0.1.0-notification-sim";
  external.iosConfigured = true;
  external.androidConfigured = true;
  external.iosStatus = -1;
  external.androidGranted = false;
  external.remotelyRegistered = false;
  external.token = "sim-actual-fcm-registration-A";
  external.initial = null;
  external.initialPromise = null;
  external.stored.clear();
  external.stored.set(SESSION_KEY, JSON.stringify(PAIR_A));
  for (const values of [
    external.events,
    external.tokenHistory,
    external.openedHistory,
    external.foregroundHistory,
    external.appStateHistory,
    external.removed,
    external.alerts,
  ])
    values.length = 0;
  external.tokenListeners.clear();
  external.openedListeners.clear();
  external.foregroundListeners.clear();
  external.appStateListeners.clear();
  external.sequence = 0;
  external.getMessaging
    .mockReset()
    .mockImplementation(() => ({ name: "sim-native-messaging" }));
  external.getToken.mockReset().mockImplementation(async () => {
    external.events.push("sdk:getToken");
    return external.token;
  });
  external.hasPermission
    .mockReset()
    .mockImplementation(async () => external.iosStatus);
  external.requestPermission.mockReset().mockImplementation(async () => {
    external.iosStatus = 1;
    return external.iosStatus;
  });
  external.registerRemote.mockReset().mockImplementation(async () => {
    external.events.push("sdk:registerRemote");
    external.remotelyRegistered = true;
  });
  external.getInitial
    .mockReset()
    .mockImplementation(async () =>
      external.initialPromise
        ? await external.initialPromise
        : external.initial,
    );
  external.checkAndroid
    .mockReset()
    .mockImplementation(async () => external.androidGranted);
  external.requestAndroid.mockReset().mockImplementation(async () => {
    external.androidGranted = true;
    return "granted";
  });
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_MODE", "configured");
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_API_BASE_URL", BASE);
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_OAUTH_CALLBACK_URI", CALLBACK);
  vi.stubEnv("EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION", CONSENT);
  vi.stubGlobal("XMLHttpRequest", NativeRequest);
}
beforeEach(resetNative);
afterEach(async () => {
  await nativeWork(() => {
    for (const tree of mounted.splice(0)) tree.unmount();
  });
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("configured native notifications with actual bootstrap, owner clients and external SIM boundaries", () => {
  it("requests iOS permission only from the existing action, persists real device acknowledgements, rotates the token and unregisters before rendered logout clears auth", async () => {
    const f = httpBoundary();
    const { tree, runtime } = await configured(f);
    requireConfiguredNotifications(tree);
    expect(external.requestPermission).not.toHaveBeenCalled();
    expect(external.getToken).not.toHaveBeenCalled();
    expect(f.posts()).toHaveLength(0);
    expect(runtime.getSnapshot().pushMessage).toBe("可選擇開啟行程通知。");
    await press(tree, "app-enable-notifications");
    expect(external.requestPermission).toHaveBeenCalledTimes(1);
    expect(external.requestAndroid).not.toHaveBeenCalled();
    expect(external.registerRemote).toHaveBeenCalledTimes(1);
    expect(external.events.indexOf("sdk:registerRemote")).toBeLessThan(
      external.events.indexOf("sdk:getToken"),
    );
    expect(f.posts()).toHaveLength(1);
    expect(f.posts()[0]?.authorization).toBe(`Bearer ${PAIR_A.accessToken}`);
    expect(JSON.parse(f.posts()[0]!.body!)).toEqual({
      platform: "ios",
      provider: "fcm_v1",
      appId: external.appId,
      appVersion: external.appVersion,
      token: external.token,
      notificationConsentVersion: CONSENT,
    });
    expect(ack()).toEqual({
      deviceId: "sim-device-1",
      accountId: ACCOUNT_A.drtsPassengerId,
      appId: external.appId,
    });
    expect([...external.stored.values()].join(" ")).not.toContain(
      external.token,
    );
    external.token = "sim-actual-fcm-registration-rotated";
    await nativeWork(() => {
      for (const listener of [...external.tokenListeners])
        listener(external.token);
    });
    expect(f.posts()).toHaveLength(2);
    expect(JSON.parse(f.posts()[1]!.body!)).toEqual({
      platform: "ios",
      provider: "fcm_v1",
      appId: external.appId,
      appVersion: external.appVersion,
      token: external.token,
      notificationConsentVersion: CONSENT,
      previousDeviceId: "sim-device-1",
    });
    expect(ack()).toEqual({
      deviceId: "sim-device-2",
      accountId: ACCOUNT_A.drtsPassengerId,
      appId: external.appId,
    });
    await press(tree, "app-nav-account");
    await press(tree, "account-logout");
    expect(f.deletes()).toHaveLength(1);
    expect(f.deletes()[0]?.path).toBe(`${DEVICES}/sim-device-2`);
    expect(f.deletes()[0]?.authorization).toBe(`Bearer ${PAIR_A.accessToken}`);
    expect(f.logouts()).toHaveLength(1);
    const unregister = external.events.indexOf(
      `http:DELETE:${DEVICES}/sim-device-2:Bearer ${PAIR_A.accessToken}`,
    );
    const logout = external.events.indexOf(
      "http:POST:/api/passenger-app/auth/logout:none",
    );
    expect(unregister).toBeGreaterThanOrEqual(0);
    expect(logout).toBeGreaterThan(unregister);
    expect(external.events.indexOf(`clear:${SESSION_KEY}`)).toBeGreaterThan(
      logout,
    );
    expect(external.stored.has(ACK_KEY)).toBe(false);
    expect(external.stored.has(SESSION_KEY)).toBe(false);
    expect(runtime.getSnapshot().phase).toBe("signed_out");
    expect(present(tree, "app-login")).toBe(true);
    expect(
      external.tokenListeners.size +
        external.openedListeners.size +
        external.foregroundListeners.size +
        external.appStateListeners.size,
    ).toBe(0);
    expect(external.removed).toEqual(["token", "opened", "foreground"]);
    expect(f.state.unexpected).toEqual([]);
  });

  it("uses Android33 permission and resolves cold, background and explicit foreground opens only through an authenticated owned ride read", async () => {
    external.platform = "android";
    external.platformVersion = 33;
    external.initial = {
      data: {
        ride_ref: "sim-owned-cold",
        orderId: "must-not-replace-ride-ref",
      },
    };
    const f = httpBoundary();
    const { tree, runtime } = await configured(f);
    requireConfiguredNotifications(tree);
    expect(external.getInitial).toHaveBeenCalledTimes(1);
    expect(
      f
        .rides()
        .some(
          (call) =>
            call.path === "/api/passenger-app/rides/sim-owned-cold" &&
            call.authorization === `Bearer ${PAIR_A.accessToken}`,
        ),
    ).toBe(true);
    expect(runtime.getSnapshot().route).toEqual({
      kind: "ride",
      orderId: "sim-owned-cold",
    });
    expect(present(tree, "native-p5-screen")).toBe(true);
    expect(external.requestPermission).not.toHaveBeenCalled();
    expect(external.requestAndroid).not.toHaveBeenCalled();
    expect(f.posts()).toHaveLength(0);
    await press(tree, "app-enable-notifications");
    expect(external.checkAndroid).toHaveBeenCalledWith(
      "android.permission.POST_NOTIFICATIONS",
    );
    expect(external.requestAndroid).toHaveBeenCalledWith(
      "android.permission.POST_NOTIFICATIONS",
    );
    expect(external.requestPermission).not.toHaveBeenCalled();
    expect(external.registerRemote).not.toHaveBeenCalled();
    expect(f.posts()).toHaveLength(1);
    expect(JSON.parse(f.posts()[0]!.body!)).toMatchObject({
      platform: "android",
      provider: "fcm_v1",
      token: external.token,
    });
    await press(tree, "app-nav-home");
    const beforeForeground = f.rides().length;
    await nativeWork(() => {
      for (const listener of [...external.foregroundListeners])
        listener({ data: { ride_ref: "sim-owned-foreground" } });
    });
    expect(f.rides()).toHaveLength(beforeForeground);
    expect(runtime.getSnapshot().route).toEqual({ kind: "home" });
    const viewForeground = alertView();
    external.alerts.at(-1)!.buttons[0]!.onPress?.();
    expect(f.rides()).toHaveLength(beforeForeground);
    await nativeWork(viewForeground);
    expect(
      f
        .rides()
        .slice(beforeForeground)
        .every(
          (call) =>
            call.path === "/api/passenger-app/rides/sim-owned-foreground" &&
            call.authorization === `Bearer ${PAIR_A.accessToken}`,
        ),
    ).toBe(true);
    expect(f.rides().length).toBeGreaterThan(beforeForeground);
    expect(runtime.getSnapshot().route).toEqual({
      kind: "ride",
      orderId: "sim-owned-foreground",
    });
    await press(tree, "app-nav-home");
    await nativeWork(() => {
      for (const listener of [...external.openedListeners])
        listener({ data: { ride_ref: "sim-owned-background" } });
    });
    expect(runtime.getSnapshot().route).toEqual({
      kind: "ride",
      orderId: "sim-owned-background",
    });
    await press(tree, "app-nav-home");
    await nativeWork(() => {
      for (const listener of [...external.foregroundListeners])
        listener({ data: { ride_ref: "sim-foreign-404" } });
    });
    await nativeWork(alertView());
    expect(f.rides().at(-1)).toMatchObject({
      path: "/api/passenger-app/rides/sim-foreign-404",
      authorization: `Bearer ${PAIR_A.accessToken}`,
    });
    expect(runtime.getSnapshot().route).toEqual({ kind: "home" });
    expect(present(tree, "native-p5-screen")).toBe(false);
    const beforeMalformed = f.rides().length;
    await nativeWork(() => {
      for (const listener of [...external.openedListeners])
        listener({ data: { orderId: "sim-owned-forged-key" } });
    });
    expect(f.rides()).toHaveLength(beforeMalformed);
    external.androidGranted = false;
    await nativeWork(() => {
      for (const listener of [...external.appStateListeners])
        listener("active");
    });
    expect(f.deletes()).toHaveLength(1);
    expect(external.stored.has(ACK_KEY)).toBe(false);
    expect(f.posts()).toHaveLength(1);
    expect(external.getInitial).toHaveBeenCalledTimes(1);
    expect(f.state.unexpected).toEqual([]);
  });

  it("drops delayed initial, SDK and Alert work across identity replacement, logout and unmount while preserving an unconfirmed device revocation", async () => {
    external.iosStatus = 1;
    const initial = deferred<Message | null>();
    external.initialPromise = initial.promise;
    const f = httpBoundary();
    const { tree, runtime } = await configured(f);
    requireConfiguredNotifications(tree);
    expect(f.posts()).toHaveLength(1);
    const oldToken = external.tokenHistory[0]!;
    const oldOpen = external.openedHistory[0]!;
    const oldMessage = external.foregroundHistory[0]!;
    const oldAppState = external.appStateHistory[0]!;
    await nativeWork(() =>
      oldMessage({ data: { ride_ref: "sim-owned-old-alert" } }),
    );
    const oldAlert = alertView();
    const oldVersion = runtime.getSnapshot().identityVersion;
    await nativeWork(async () => {
      await runtime.session.adopt(PAIR_B);
      await runtime.authenticate(ACCOUNT_B, oldVersion);
    });
    expect(runtime.getSnapshot().identityVersion).toBe(oldVersion + 1);
    expect(runtime.getSnapshot().account?.drtsPassengerId).toBe(
      ACCOUNT_B.drtsPassengerId,
    );
    expect(f.deletes()[0]?.authorization).toBe(`Bearer ${PAIR_A.accessToken}`);
    expect(f.posts().at(-1)?.authorization).toBe(
      `Bearer ${PAIR_B.accessToken}`,
    );
    expect(ack()).toEqual({
      deviceId: "sim-device-2",
      accountId: ACCOUNT_B.drtsPassengerId,
      appId: external.appId,
    });
    const afterReplacement = f.calls.length;
    await nativeWork(() => {
      initial.resolve({ data: { ride_ref: "sim-owned-late-initial" } });
      oldToken("sim-stale-old-token");
      oldOpen({ data: { ride_ref: "sim-owned-stale-open" } });
      oldMessage({ data: { ride_ref: "sim-owned-stale-message" } });
      oldAppState("active");
      oldAlert();
    });
    expect(f.calls).toHaveLength(afterReplacement);
    expect(runtime.getSnapshot().route).toEqual({ kind: "home" });
    expect(external.getInitial).toHaveBeenCalledTimes(1);
    const currentToken = external.tokenHistory.at(-1)!;
    const currentOpen = external.openedHistory.at(-1)!;
    const currentMessage = external.foregroundHistory.at(-1)!;
    await nativeWork(() =>
      currentMessage({ data: { ride_ref: "sim-owned-current-alert" } }),
    );
    const currentAlert = alertView();
    f.state.unregisterSuccess = false;
    await press(tree, "app-nav-account");
    await press(tree, "account-logout");
    expect(runtime.getSnapshot().phase).toBe("signed_out");
    expect(runtime.getSnapshot().message).toContain("推播裝置註銷尚未確認。");
    expect(runtime.getSnapshot().message).not.toContain("推播裝置已註銷。");
    expect(ack()).toEqual({
      deviceId: "sim-device-2",
      accountId: ACCOUNT_B.drtsPassengerId,
      appId: external.appId,
    });
    expect(external.stored.has(SESSION_KEY)).toBe(false);
    const afterLogout = f.calls.length;
    await nativeWork(() => {
      currentToken("sim-late-token");
      currentOpen({ data: { ride_ref: "sim-owned-after-logout" } });
      currentMessage({ data: { ride_ref: "sim-owned-after-logout" } });
      currentAlert();
    });
    expect(f.calls).toHaveLength(afterLogout);
    await unmount(tree);
    await nativeWork(() => {
      currentOpen({ data: { ride_ref: "sim-owned-after-unmount" } });
      currentAlert();
    });
    expect(f.calls).toHaveLength(afterLogout);
    expect(
      external.tokenListeners.size +
        external.openedListeners.size +
        external.foregroundListeners.size +
        external.appStateListeners.size,
    ).toBe(0);
    expect(f.state.unexpected).toEqual([]);

    // A real native permission promise can resolve after logout; it must not
    // restart an old lifecycle or reattach its SDK listeners to the next session.
    resetNative();
    const waitingPermission = deferred<number>();
    external.requestPermission.mockImplementationOnce(
      () => waitingPermission.promise,
    );
    const late = httpBoundary();
    const next = await configured(late);
    requireConfiguredNotifications(next.tree);
    let permissionRequest!: Promise<void>;
    await nativeWork(() => {
      permissionRequest = (
        next.tree.root.findByProps({ testID: "app-enable-notifications" })
          .props as { onPress(): Promise<void> }
      ).onPress();
    });
    await press(next.tree, "app-nav-account");
    await press(next.tree, "account-logout");
    const beforePermissionResolves = late.calls.length;
    await nativeWork(async () => {
      waitingPermission.resolve(1);
      await permissionRequest;
    });
    expect(next.runtime.getSnapshot().phase).toBe("signed_out");
    expect(late.calls).toHaveLength(beforePermissionResolves);
    expect(late.posts()).toHaveLength(0);
    expect(
      external.tokenListeners.size +
        external.openedListeners.size +
        external.foregroundListeners.size +
        external.appStateListeners.size,
    ).toBe(0);
    expect(late.state.unexpected).toEqual([]);
  });

  it("keeps missing native metadata unavailable without SDK IO and presents honest default Firebase load failure for a fully configured caller", async () => {
    const variants = [
      "native-absent",
      "native-not-boolean",
      "consent-absent",
      "platform-unsupported",
      "app-id-absent",
      "app-version-absent",
    ];
    for (const variant of variants) {
      external.platform = variant === "platform-unsupported" ? "web" : "ios";
      external.iosConfigured =
        variant === "native-absent"
          ? false
          : variant === "native-not-boolean"
            ? "true"
            : true;
      external.appId =
        variant === "app-id-absent" ? "" : "com.example.drts.notification.sim";
      external.appVersion =
        variant === "app-version-absent" ? "" : "0.1.0-notification-sim";
      vi.stubEnv(
        "EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION",
        variant === "consent-absent" ? "   " : CONSENT,
      );
      const f = httpBoundary();
      const { tree, runtime } = await configured(f);
      expect(
        runtime.options.notifications?.status,
        "missing actual native configuration must be unavailable",
      ).toBe("unavailable");
      expect(present(tree, "app-push-skipped")).toBe(true);
      expect(present(tree, "app-enable-notifications")).toBe(false);
      expect(external.getMessaging).not.toHaveBeenCalled();
      expect(external.getToken).not.toHaveBeenCalled();
      expect(f.posts()).toHaveLength(0);
      expect(f.state.unexpected).toEqual([]);
      await unmount(tree);
    }
    external.platform = "ios";
    external.iosConfigured = true;
    external.appId = "com.example.drts.notification.sim";
    external.appVersion = "0.1.0-notification-sim";
    vi.stubEnv("EXPO_PUBLIC_PASSENGER_NOTIFICATION_CONSENT_VERSION", CONSENT);
    external.getMessaging.mockImplementation(() => {
      throw new Error("sim-native-Firebase-bridge-not-installed");
    });
    const f = httpBoundary();
    const { tree, runtime } = await configured(f);
    requireConfiguredNotifications(tree);
    expect(external.getMessaging).toHaveBeenCalled();
    expect(runtime.getSnapshot().pushMessage).toBe(
      "推播裝置設定尚未完成，請重試。",
    );
    expect(runtime.getSnapshot().pushMessage).not.toContain("推播裝置已登錄");
    expect(external.getToken).not.toHaveBeenCalled();
    expect(f.posts()).toHaveLength(0);
    expect(external.stored.has(ACK_KEY)).toBe(false);
    await press(tree, "app-enable-notifications");
    expect(runtime.getSnapshot().pushMessage).toBe(
      "推播裝置設定尚未完成，請重試。",
    );
    expect(f.posts()).toHaveLength(0);
    expect(f.state.unexpected).toEqual([]);
  });
});
