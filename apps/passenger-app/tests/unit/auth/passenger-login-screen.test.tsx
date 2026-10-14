import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PassengerClient,
  PassengerNativeAuthClient,
  NativePassengerSession,
  createNativePassengerFetch,
  type FetchOptions,
  type FetchResponse,
  type AuthProvider,
  type NativePassengerTokenPair,
} from "@drts/passenger-client";

vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
import {
  PassengerLoginScreen,
  type PassengerOAuthBrowserPort,
} from "../../../components/auth/passenger-login-screen";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const renderers: any[] = [];
afterEach(async () => {
  await act(() => {
    for (const renderer of renderers.splice(0)) renderer.unmount();
  });
});
const origin = "https://api.example.invalid";
const callbackUri = "drtspassenger://auth/callback";
const tokens = {
  accessToken: "mock-native-access",
  refreshToken: "mock-native-refresh",
};
const account = {
  drts_passenger_id: "mock-account",
  display_name: "示意乘客",
  contact_phone_verified: false,
  status: "active",
  created_at: "2026-10-14T00:00:00Z",
};
const transactionId = "ccb5e731-eb28-4a5b-968a-0c735cd57770";
const authUrl =
  "https://provider.example.invalid/authorize?state=api-state&code_challenge=api-owned-pkce";
function reply(status: number, data: unknown): FetchResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  providers: AuthProvider[],
  handler: (
    url: string,
    options?: FetchOptions,
  ) => Promise<FetchResponse | undefined> = async () => undefined,
) {
  let stored: NativePassengerTokenPair | null = null;
  const calls: Array<{ url: string; options: FetchOptions | undefined }> = [];
  const store = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: NativePassengerTokenPair) => {
      stored = { ...value };
    }),
    clear: vi.fn(async () => {
      stored = null;
    }),
  };
  const fetchFn = async (url: string, options?: FetchOptions) => {
    calls.push({ url, options });
    const controlled = await handler(url, options);
    if (controlled) return controlled;
    if (url.endsWith("/auth/providers"))
      return reply(200, { data: { providers } });
    if (url.endsWith("/auth/otp/request"))
      return reply(200, {
        data: {
          success: true,
          challenge: "mock-challenge",
          message: "通用回應",
        },
      });
    if (url.endsWith("/auth/otp/verify"))
      return reply(200, {
        data: {
          result: "logged_in",
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        },
      });
    if (url.endsWith("/auth/oauth/google/start"))
      return reply(200, {
        data: {
          auth_url: authUrl,
          transaction_id: transactionId,
          state: "api-state",
          expires_at: "2026-10-14T01:00:00Z",
        },
      });
    if (url.endsWith("/auth/oauth/google/callback"))
      return reply(200, {
        data: {
          result: "logged_in",
          drts_passenger_id: "mock-account",
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        },
      });
    if (url.endsWith("/me")) return reply(200, { data: { account } });
    throw new Error("Unexpected fixture HTTP route");
  };
  const auth = new PassengerNativeAuthClient({ baseUrl: origin, fetchFn });
  const session = new NativePassengerSession(auth, store);
  const passenger = new PassengerClient({
    baseUrl: origin,
    fetchFn: createNativePassengerFetch({ baseUrl: origin, fetchFn, session }),
  });
  const openAuthSession = vi.fn<PassengerOAuthBrowserPort["openAuthSession"]>(
    async () => ({ type: "cancel" }),
  );
  const browser: PassengerOAuthBrowserPort = { openAuthSession };
  const onAuthenticated = vi.fn();
  return {
    auth,
    session,
    passenger,
    store,
    browser,
    openAuthSession,
    onAuthenticated,
    calls,
    stored: () => stored,
    persist: (value: NativePassengerTokenPair) => {
      stored = { ...value };
    },
  };
}
async function mount(
  f: ReturnType<typeof fixture>,
  mode: "configured" | "demo" = "configured",
) {
  let renderer: any;
  await act(async () => {
    renderer = create(
      <PassengerLoginScreen
        auth={f.auth}
        session={f.session}
        passenger={f.passenger}
        browser={f.browser}
        callbackUri={callbackUri}
        mode={mode}
        demoOtpHint="123456"
        onAuthenticated={f.onAuthenticated}
      />,
    );
  });
  renderers.push(renderer);
  return renderer;
}
async function press(renderer: any, id: string) {
  await act(async () => {
    await renderer.root.findByProps({ testID: id }).props.onPress();
  });
}
async function enter(renderer: any, id: string, value: string) {
  await act(() => {
    renderer.root.findByProps({ testID: id }).props.onChangeText(value);
  });
}
function present(renderer: any, id: string) {
  return renderer.root.findAllByProps({ testID: id }).length > 0;
}
function text(renderer: any, id: string) {
  return renderer.root.findByProps({ testID: id }).children.join("");
}

describe("Native login rendered actions with real shared clients and injected external boundaries", () => {
  it("renders only API-configured providers and has no demo marker in configured mode", async () => {
    const f = fixture(["email", "google"]);
    const r = await mount(f);
    expect(present(r, "auth-channel-email")).toBe(true);
    expect(present(r, "auth-channel-phone")).toBe(false);
    expect(present(r, "auth-oauth-google")).toBe(true);
    expect(present(r, "auth-oauth-facebook")).toBe(false);
    expect(present(r, "auth-oauth-line")).toBe(false);
    expect(present(r, "auth-demo-banner")).toBe(false);
    expect(
      r.root.findByProps({ testID: "auth-oauth-google" }).props
        .accessibilityLabel,
    ).toBe("Google 登入");
    expect(f.calls).toHaveLength(1);
  });

  it.each(["phone", "email"] as const)(
    "runs the rendered %s OTP request/challenge/verify, awaits store then calls actual me",
    async (provider) => {
      const started = deferred();
      const release = deferred();
      const f = fixture([provider], async (url, options) => {
        if (url.endsWith("/me")) {
          expect(f.stored()).toEqual(tokens);
          expect(options?.headers?.Authorization).toBe(
            `Bearer ${tokens.accessToken}`,
          );
        }
        return undefined;
      });
      f.store.write.mockImplementationOnce(async (value) => {
        started.resolve();
        await release.promise;
        f.persist(value);
      });
      const r = await mount(f);
      const target =
        provider === "phone" ? "+886900000000" : "demo@example.invalid";
      await enter(r, "auth-target", ` ${target} `);
      await press(r, "auth-request-otp");
      const request = f.calls.find((call) =>
        call.url.endsWith("/auth/otp/request"),
      );
      expect(JSON.parse(request?.options?.body ?? "{}")).toEqual({
        target,
        provider,
        purpose: "login",
      });
      expect(present(r, "auth-challenge")).toBe(true);
      expect(present(r, "auth-demo-otp-hint")).toBe(false);
      await enter(r, "auth-code", "123456");
      let operation!: Promise<void>;
      await act(async () => {
        operation = r.root
          .findByProps({ testID: "auth-verify-otp" })
          .props.onPress();
        await started.promise;
      });
      expect(f.calls.some((call) => call.url.endsWith("/me"))).toBe(false);
      expect(present(r, "auth-loading")).toBe(true);
      expect(
        r.root.findByProps({ testID: "auth-verify-otp" }).props.disabled,
      ).toBe(true);
      expect(text(r, "auth-progress")).toContain("儲存登入狀態");
      await act(async () => {
        release.resolve();
        await operation;
      });
      const verify = f.calls.find((call) =>
        call.url.endsWith("/auth/otp/verify"),
      );
      expect(JSON.parse(verify?.options?.body ?? "{}")).toEqual({
        target,
        provider,
        challenge: "mock-challenge",
        code: "123456",
      });
      expect(f.onAuthenticated).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ drtsPassengerId: "mock-account" }),
      );
      expect(text(r, "auth-info")).toBe("登入成功。");
      expect(present(r, "auth-loading")).toBe(false);
    },
  );

  it("keeps the actual OTP challenge and shows API verification failure for retry", async () => {
    const f = fixture(["email"], async (url) =>
      url.endsWith("/auth/otp/verify")
        ? reply(400, { error: { code: "invalid_code" } })
        : undefined,
    );
    const r = await mount(f);
    await enter(r, "auth-target", "demo@example.invalid");
    await press(r, "auth-request-otp");
    await enter(r, "auth-code", "999999");
    await press(r, "auth-verify-otp");
    expect(text(r, "auth-error")).toBe("驗證碼不正確，請重新輸入。");
    expect(present(r, "auth-challenge")).toBe(true);
    expect(f.store.write).not.toHaveBeenCalled();
    expect(f.onAuthenticated).not.toHaveBeenCalled();
    expect(f.calls.some((call) => call.url.endsWith("/me"))).toBe(false);
  });

  it("opens the API-owned PKCE authUrl and posts the original transactionId before reading account", async () => {
    const f = fixture(["google"]);
    f.openAuthSession.mockResolvedValueOnce({
      type: "success",
      url: `${callbackUri}?code=returned%20code&state=api-state`,
    });
    const r = await mount(f);
    await press(r, "auth-oauth-google");
    const start = f.calls.find((call) =>
      call.url.endsWith("/auth/oauth/google/start"),
    );
    expect(JSON.parse(start?.options?.body ?? "{}")).toEqual({
      provider: "google",
      redirectUri: callbackUri,
      purpose: "login",
    });
    expect(f.openAuthSession).toHaveBeenCalledExactlyOnceWith(
      authUrl,
      callbackUri,
    );
    const callback = f.calls.find((call) =>
      call.url.endsWith("/auth/oauth/google/callback"),
    );
    expect(JSON.parse(callback?.options?.body ?? "{}")).toEqual({
      provider: "google",
      code: "returned code",
      state: "api-state",
      transactionId,
    });
    expect(f.stored()).toEqual(tokens);
    const me = f.calls.find((call) => call.url.endsWith("/me"));
    expect(me?.options?.headers?.Authorization).toBe(
      `Bearer ${tokens.accessToken}`,
    );
    expect(f.onAuthenticated).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ drtsPassengerId: "mock-account" }),
    );
  });

  it.each(["cancel", "dismiss"] as const)(
    "shows system-browser %s without a callback or fabricated login",
    async (type) => {
      const pending = deferred();
      const f = fixture(["google"]);
      f.openAuthSession.mockImplementationOnce(async () => {
        await pending.promise;
        return { type };
      });
      const r = await mount(f);
      let operation!: Promise<void>;
      await act(async () => {
        operation = r.root
          .findByProps({ testID: "auth-oauth-google" })
          .props.onPress();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(present(r, "auth-loading")).toBe(true);
      await act(async () => {
        pending.resolve();
        await operation;
      });
      expect(text(r, "auth-info")).toBe("已取消第三方登入。");
      expect(
        f.calls.some(
          (call) => call.url.endsWith("/callback") || call.url.endsWith("/me"),
        ),
      ).toBe(false);
      expect(f.store.write).not.toHaveBeenCalled();
      expect(f.onAuthenticated).not.toHaveBeenCalled();
      expect(present(r, "auth-loading")).toBe(false);
    },
  );

  it("labels external demo explicitly and supplies a fixture hint without inventing provider availability", async () => {
    const f = fixture(["phone", "email", "google", "facebook", "line"]);
    const r = await mount(f, "demo");
    expect(text(r, "auth-demo-banner")).toContain("不是正式帳號或真實訊息");
    expect(
      r.root.findByProps({ testID: "auth-oauth-google" }).props
        .accessibilityLabel,
    ).toBe("模擬Google 登入");
    expect(
      r.root.findByProps({ testID: "auth-request-otp" }).props
        .accessibilityLabel,
    ).toBe("模擬取得驗證碼");
    await enter(r, "auth-target", "demo@example.invalid");
    await press(r, "auth-request-otp");
    expect(text(r, "auth-demo-otp-hint")).toBe("示意驗證碼：123456");
    expect(f.store.write).not.toHaveBeenCalled();
  });

  it("retries actual provider loading after a boundary failure", async () => {
    let attempts = 0;
    const f = fixture(["email"], async (url) => {
      if (url.endsWith("/auth/providers") && ++attempts === 1)
        return reply(503, { error: { code: "storage_unavailable" } });
      return undefined;
    });
    const r = await mount(f);
    expect(text(r, "auth-error")).toBe("無法讀取登入方式，請重試。");
    expect(present(r, "auth-channel-email")).toBe(false);
    await press(r, "auth-reload-providers");
    expect(present(r, "auth-error")).toBe(false);
    expect(present(r, "auth-channel-email")).toBe(true);
    expect(attempts).toBe(2);
  });

  it("retries actual me after tokens persisted and an account-read outage without verifying OTP again", async () => {
    let me = 0;
    const f = fixture(["email"], async (url) =>
      url.endsWith("/me") && ++me === 1
        ? reply(503, { error: { code: "storage_unavailable" } })
        : undefined,
    );
    const r = await mount(f);
    await enter(r, "auth-target", "demo@example.invalid");
    await press(r, "auth-request-otp");
    await enter(r, "auth-code", "123456");
    await press(r, "auth-verify-otp");
    expect(present(r, "auth-error")).toBe(true);
    expect(present(r, "auth-retry-account")).toBe(true);
    expect(f.stored()).toEqual(tokens);
    expect(f.onAuthenticated).not.toHaveBeenCalled();
    await press(r, "auth-retry-account");
    expect(f.onAuthenticated).toHaveBeenCalledTimes(1);
    expect(
      f.calls.filter((call) => call.url.endsWith("/auth/otp/verify")),
    ).toHaveLength(1);
    expect(me).toBe(2);
    expect(present(r, "auth-error")).toBe(false);
  });
});
