import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NativePassengerSession,
  PassengerClient,
  PassengerNativeAuthClient,
  createNativePassengerFetch,
  type FetchOptions,
  type FetchResponse,
  type NativePassengerTokenPair,
  type PassengerAccount,
} from "@drts/passenger-client";
import type { PassengerRideAuthorityView } from "@drts/contracts";

vi.mock("react-native", () => ({
  View: "View",
  ScrollView: "ScrollView",
  Text: "Text",
  Pressable: "Pressable",
  TextInput: "TextInput",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: <T,>(styles: T) => styles },
}));
import {
  PassengerAccountScreen,
  type PassengerAccountScreenProps,
} from "../../../components/account/passenger-account-screen";
import { PassengerHistoryScreen } from "../../../components/history/passenger-history-screen";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const renderers: any[] = [];
afterEach(async () => {
  await act(() => {
    for (const r of renderers.splice(0)) r.unmount();
  });
});
const origin = "https://native-api.example.invalid";
const tokens = {
  accessToken: "fixture-access",
  refreshToken: "fixture-refresh",
};
const account: PassengerAccount = {
  drtsPassengerId: "fixture-passenger",
  displayName: "示意乘客",
  contactPhone: "+886900000000",
  contactPhoneVerified: false,
  contactConsent: false,
  status: "active",
  createdAt: "2026-10-14T00:00:00Z",
};
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
  handler: (
    url: string,
    options?: FetchOptions,
  ) => Promise<FetchResponse | undefined> = async () => undefined,
  providers = ["phone", "email"],
) {
  let stored: NativePassengerTokenPair | null = { ...tokens };
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
  const fetchFn = async (
    url: string,
    options?: FetchOptions,
  ): Promise<FetchResponse> => {
    calls.push({ url, options });
    const controlled = await handler(url, options);
    if (controlled) return controlled;
    if (url.endsWith("/auth/providers"))
      return reply(200, { data: { providers } });
    if (url.endsWith("/me"))
      return options?.method === "DELETE"
        ? reply(200, { data: { success: true } })
        : reply(200, { data: { account } });
    if (url.endsWith("/auth/otp/request"))
      return reply(200, {
        data: {
          success: true,
          challenge: "fixture-challenge",
          message: "通用回應",
        },
      });
    if (url.endsWith("/auth/otp/verify"))
      return reply(200, {
        data: {
          result:
            JSON.parse(options?.body ?? "{}").provider === "phone"
              ? "verified_contact_phone"
              : "linked",
        },
      });
    if (url.endsWith("/auth/logout"))
      return reply(200, { data: { success: true } });
    if (url.endsWith("/rides?limit=2"))
      return reply(200, { data: { rides: [] } });
    throw new Error(`Unexpected fixture HTTP route: ${url}`);
  };
  const auth = new PassengerNativeAuthClient({ baseUrl: origin, fetchFn });
  const session = new NativePassengerSession(auth, store);
  const passenger = new PassengerClient({
    baseUrl: origin,
    fetchFn: createNativePassengerFetch({ baseUrl: origin, fetchFn, session }),
  });
  return {
    calls,
    store,
    session,
    passenger,
    onSignedOut: vi.fn(),
    onAccountChanged: vi.fn(),
    stored: () => stored,
    clearStored: () => {
      stored = null;
    },
  };
}
async function mountAccount(
  f: ReturnType<typeof fixture>,
  props: Partial<PassengerAccountScreenProps> = {},
) {
  let r: any;
  await act(async () => {
    r = create(
      <PassengerAccountScreen
        passenger={f.passenger}
        session={f.session}
        mode="configured"
        onSignedOut={f.onSignedOut}
        onAccountChanged={f.onAccountChanged}
        {...props}
      />,
    );
  });
  renderers.push(r);
  return r;
}

describe("Native account provider and identity parity", () => {
  it.each(["google", "facebook", "line"] as const)(
    "links %s using current session and API-owned transaction without replacing tokens",
    async (provider) => {
      const f = fixture(
        async (url) => {
          if (url.endsWith("/me/identities"))
            return reply(200, {
              data: {
                identities: [
                  {
                    identityId: "id-email",
                    provider: "email",
                    subject: "fixture",
                    drtsPassengerId: account.drtsPassengerId,
                  },
                ],
              },
            });
          if (url.endsWith(`/auth/oauth/${provider}/start`))
            return reply(200, {
              data: {
                authUrl: "https://provider.invalid/authorize",
                transactionId: "fixture-transaction",
                state: "fixture-state",
                expiresAt: "2099-01-01T00:00:00Z",
              },
            });
          if (url.endsWith(`/auth/oauth/${provider}/callback`))
            return reply(200, { data: { result: "linked" } });
          return undefined;
        },
        [provider, "email"],
      );
      const browser = {
        openAuthSession: vi.fn(async () => ({
          type: "success" as const,
          url: "drtspassenger://auth/callback?code=fixture-code&state=fixture-state",
        })),
      };
      const r = await mountAccount(f, {
        oauth: { browser, callbackUri: "drtspassenger://auth/callback" },
      } as Partial<PassengerAccountScreenProps>);
      await press(r, `account-link-${provider}`);
      const start = f.calls.find((c) =>
        c.url.endsWith(`/oauth/${provider}/start`),
      );
      const callback = f.calls.find((c) =>
        c.url.endsWith(`/oauth/${provider}/callback`),
      );
      expect(JSON.parse(start?.options?.body ?? "{}")).toMatchObject({
        purpose: "link",
        provider,
        redirectUri: "drtspassenger://auth/callback",
      });
      expect(start?.options?.headers?.Authorization).toBe(
        `Bearer ${tokens.accessToken}`,
      );
      expect(JSON.parse(callback?.options?.body ?? "{}")).toEqual({
        provider,
        code: "fixture-code",
        state: "fixture-state",
        transactionId: "fixture-transaction",
      });
      expect(callback?.options?.headers?.Authorization).toBe(
        `Bearer ${tokens.accessToken}`,
      );
      expect(f.stored()).toEqual(tokens);
      expect(f.store.write).not.toHaveBeenCalled();
    },
  );
  it("reads actual identities and unlinks the selected identity through the existing own API", async () => {
    let identities = ["one", "two"].map((identityId) => ({
      identityId,
      provider: "email",
      subject: "fixture",
      drtsPassengerId: account.drtsPassengerId,
    }));
    const f = fixture(async (url, options) => {
      if (url.endsWith("/me/identities"))
        return reply(200, { data: { identities } });
      if (url.endsWith("/me/identities/two") && options?.method === "DELETE") {
        identities = identities.filter((i) => i.identityId !== "two");
        return reply(200, { data: { success: true } });
      }
      return undefined;
    });
    const r = await mountAccount(f);
    await press(r, "account-unlink-two");
    expect(
      f.calls.some(
        (c) =>
          c.url.endsWith("/me/identities/two") &&
          c.options?.headers?.Authorization === `Bearer ${tokens.accessToken}`,
      ),
    ).toBe(true);
    expect(
      r.root.findByProps({ testID: "account-unlink-one" }).props.disabled,
    ).toBe(true);
    expect(
      r.root.findAllByProps({ testID: "account-unlink-two" }),
    ).toHaveLength(0);
  });
  it("browser cancellation preserves the signed-in account and sends no callback", async () => {
    const f = fixture(
      async (url) =>
        url.endsWith("/oauth/google/start")
          ? reply(200, {
              data: {
                authUrl: "https://provider.invalid/authorize",
                transactionId: "fixture-transaction",
                state: "state",
              },
            })
          : undefined,
      ["google"],
    );
    const r = await mountAccount(f, {
      oauth: {
        browser: { openAuthSession: async () => ({ type: "cancel" }) },
        callbackUri: "drtspassenger://auth/callback",
      },
    } as Partial<PassengerAccountScreenProps>);
    await press(r, "account-link-google");
    expect(f.calls.some((c) => c.url.endsWith("/callback"))).toBe(false);
    expect(f.stored()).toEqual(tokens);
  });
});
async function mountHistory(
  f: ReturnType<typeof fixture>,
  onOpenRide = vi.fn(),
  mode: "configured" | "demo" = "configured",
) {
  let r: any;
  await act(async () => {
    r = create(
      <PassengerHistoryScreen
        passenger={f.passenger}
        pageSize={2}
        mode={mode}
        onOpenRide={onOpenRide}
      />,
    );
  });
  renderers.push(r);
  return { r, onOpenRide };
}
async function press(r: any, id: string) {
  await act(async () => {
    await r.root.findByProps({ testID: id }).props.onPress();
  });
}
async function enter(r: any, id: string, value: string) {
  await act(() => {
    r.root.findByProps({ testID: id }).props.onChangeText(value);
  });
}
async function toggle(r: any, id: string, value: boolean) {
  await act(() => {
    r.root.findByProps({ testID: id }).props.onValueChange(value);
  });
}
function present(r: any, id: string) {
  return r.root.findAllByProps({ testID: id }).length > 0;
}
function text(r: any, id: string) {
  return r.root.findByProps({ testID: id }).children.join("");
}
function body(f: ReturnType<typeof fixture>, suffix: string, method?: string) {
  return JSON.parse(
    f.calls.find(
      (call) =>
        call.url.endsWith(suffix) &&
        (!method || call.options?.method === method),
    )?.options?.body ?? "{}",
  );
}
function ride(
  id: string,
  status: PassengerRideAuthorityView["order"]["status"] = "completed",
): PassengerRideAuthorityView {
  return {
    order: {
      orderId: id,
      orderNo: `ORDER-${id}`,
      status,
      timingMode: "scheduled",
      requestedPickupAt: "2026-10-14T02:00:00Z",
      pickup: { address: "示意起點" },
      dropoff: { address: "示意終點" },
      cancelableUntil: null,
      cancelledAt: status === "cancelled" ? "2026-10-14T01:00:00Z" : null,
      completedAt: status === "completed" ? "2026-10-14T02:30:00Z" : null,
    },
    assignment: null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      canCancel: false,
      canRate: false,
      canContact: false,
      canReadReceipt: false,
    },
  };
}

describe("Native account rendered actions through actual account/raw-session clients", () => {
  it("shows loading, then reads the authoritative account with the restored Bearer", async () => {
    const wait = deferred();
    const f = fixture(async (url) => {
      if (url.endsWith("/me")) await wait.promise;
      return undefined;
    });
    const r = await mountAccount(f);
    expect(present(r, "account-loading")).toBe(true);
    expect(present(r, "account-name")).toBe(false);
    expect(f.calls[0]?.options?.headers?.Authorization).toBe(
      `Bearer ${tokens.accessToken}`,
    );
    await act(async () => {
      wait.resolve();
    });
    expect(r.root.findByProps({ testID: "account-name" }).props.value).toBe(
      account.displayName,
    );
    expect(text(r, "account-phone-status")).toContain("未驗證");
    expect(present(r, "account-loading")).toBe(false);
  });
  it("retries account loading after a real SDK HTTP error", async () => {
    let n = 0;
    const f = fixture(async (url) =>
      url.endsWith("/me") && ++n === 1
        ? reply(503, {
            error: { code: "unavailable", message: "資料服務暫時不可用" },
          })
        : undefined,
    );
    const r = await mountAccount(f);
    expect(text(r, "account-error")).toBe("資料服務暫時不可用");
    expect(present(r, "account-name")).toBe(false);
    await press(r, "account-reload");
    expect(present(r, "account-error")).toBe(false);
    expect(present(r, "account-name")).toBe(true);
    expect(n).toBe(2);
  });
  it("saves edited name/phone/contact consent, displaying the server's unverified result", async () => {
    const saved = {
      ...account,
      displayName: "新名稱",
      contactPhone: "+886911111111",
      contactConsent: true,
    };
    const f = fixture(async (url, options) =>
      url.endsWith("/me") && options?.method === "PATCH"
        ? reply(200, { data: { account: saved } })
        : undefined,
    );
    const r = await mountAccount(f);
    await enter(r, "account-name", " 新名稱 ");
    await enter(r, "account-phone", " +886911111111 ");
    await toggle(r, "account-contact-consent", true);
    await press(r, "account-save");
    expect(body(f, "/me", "PATCH")).toEqual({
      displayName: "新名稱",
      contactPhone: "+886911111111",
      contactConsent: true,
    });
    expect(text(r, "account-notice")).toBe("個人資料已儲存。");
    expect(text(r, "account-phone-status")).toContain("未驗證");
    expect(f.onAccountChanged).toHaveBeenLastCalledWith(saved);
  });
  it("retains edits and does not announce save success on a rejected profile update", async () => {
    const f = fixture(async (url, options) =>
      url.endsWith("/me") && options?.method === "PATCH"
        ? reply(400, {
            error: { code: "validation_error", message: "手機格式不正確" },
          })
        : undefined,
    );
    const r = await mountAccount(f);
    await enter(r, "account-phone", "bad-phone");
    await press(r, "account-save");
    expect(text(r, "account-error")).toBe("手機格式不正確");
    expect(r.root.findByProps({ testID: "account-phone" }).props.value).toBe(
      "bad-phone",
    );
    expect(present(r, "account-notice")).toBe(false);
    expect(f.onAccountChanged).toHaveBeenCalledTimes(1);
  });
  it("persists withdrawal of contact consent without stamping unknown policy versions", async () => {
    const f = fixture();
    const r = await mountAccount(f);
    await toggle(r, "account-contact-consent", false);
    await press(r, "account-save");
    expect(body(f, "/me", "PATCH")).toEqual({
      displayName: account.displayName,
      contactPhone: account.contactPhone,
      contactConsent: false,
    });
    expect(present(r, "account-save-policy")).toBe(false);
  });
  it("opens supplied policy documents and records only their supplied versions after explicit consent", async () => {
    const f = fixture();
    const onOpen = vi.fn();
    const r = await mountAccount(f, {
      policy: {
        termsVersion: "fixture-terms-v3",
        privacyVersion: "fixture-privacy-v4",
        onOpen,
      },
    });
    expect(
      r.root.findByProps({ testID: "account-save-policy" }).props.disabled,
    ).toBe(true);
    await press(r, "account-open-terms");
    await press(r, "account-open-privacy");
    expect(onOpen.mock.calls).toEqual([["terms"], ["privacy"]]);
    await toggle(r, "account-policy-consent", true);
    await press(r, "account-save-policy");
    expect(body(f, "/me", "PATCH")).toEqual({
      termsVersion: "fixture-terms-v3",
      privacyVersion: "fixture-privacy-v4",
    });
    expect(text(r, "account-notice")).toContain("同意已記錄");
  });
  it("visibly skips unavailable SMS, while retaining profile and available Email actions", async () => {
    const f = fixture(undefined, ["email"]);
    const r = await mountAccount(f);
    expect(text(r, "account-sms-skipped")).toContain("已略過此外部步驟");
    expect(present(r, "account-request-phone")).toBe(false);
    expect(present(r, "account-request-email")).toBe(true);
    expect(f.calls.some((call) => call.url.includes("/otp/"))).toBe(false);
  });
  it("keeps the profile usable when provider discovery fails and retries that boundary separately", async () => {
    let n = 0;
    const f = fixture(async (url) =>
      url.endsWith("/auth/providers") && ++n === 1
        ? reply(503, { error: { code: "unavailable" } })
        : undefined,
    );
    const r = await mountAccount(f);
    expect(present(r, "account-save")).toBe(true);
    expect(present(r, "account-provider-error")).toBe(true);
    expect(present(r, "account-sms-skipped")).toBe(false);
    await press(r, "account-retry-providers");
    expect(present(r, "account-provider-error")).toBe(false);
    expect(present(r, "account-request-phone")).toBe(true);
    expect(n).toBe(2);
  });
  it.each(["phone", "email"] as const)(
    "uses the authenticated %s proof purpose and rereads account without replacing the session",
    async (provider) => {
      let verified = false;
      const after =
        provider === "phone"
          ? { ...account, contactPhoneVerified: true }
          : { ...account, verifiedEmail: "member@example.invalid" };
      const f = fixture(async (url) => {
        if (url.endsWith("/auth/otp/verify")) verified = true;
        if (url.endsWith("/me") && verified)
          return reply(200, { data: { account: after } });
        return undefined;
      });
      const r = await mountAccount(f);
      if (provider === "email")
        await enter(r, "account-email", " member@example.invalid ");
      await press(r, `account-request-${provider}`);
      expect(body(f, "/auth/otp/request")).toEqual({
        provider,
        purpose: provider === "phone" ? "verify_contact_phone" : "link",
        target:
          provider === "phone"
            ? account.contactPhone
            : "member@example.invalid",
      });
      expect(
        f.calls.find((call) => call.url.endsWith("/auth/otp/request"))?.options
          ?.headers?.Authorization,
      ).toBe(`Bearer ${tokens.accessToken}`);
      await enter(r, "account-code", "123456");
      await press(r, "account-verify");
      expect(body(f, "/auth/otp/verify")).toEqual({
        provider,
        target:
          provider === "phone"
            ? account.contactPhone
            : "member@example.invalid",
        challenge: "fixture-challenge",
        code: "123456",
      });
      expect(
        f.calls.find((call) => call.url.endsWith("/auth/otp/verify"))?.options
          ?.headers?.Authorization,
      ).toBe(`Bearer ${tokens.accessToken}`);
      expect(f.store.write).not.toHaveBeenCalled();
      expect(f.stored()).toEqual(tokens);
      expect(f.onAccountChanged).toHaveBeenLastCalledWith(after);
      expect(present(r, "account-proof")).toBe(false);
    },
  );
  it("retains a failed OTP challenge for a real verification retry", async () => {
    let n = 0;
    const f = fixture(async (url) =>
      url.endsWith("/auth/otp/verify") && ++n === 1
        ? reply(400, { error: { code: "invalid_code" } })
        : undefined,
    );
    const r = await mountAccount(f);
    await press(r, "account-request-phone");
    await enter(r, "account-code", "999999");
    await press(r, "account-verify");
    expect(text(r, "account-error")).toContain("驗證碼不正確");
    expect(present(r, "account-proof")).toBe(true);
    await enter(r, "account-code", "123456");
    await press(r, "account-verify");
    expect(n).toBe(2);
    expect(present(r, "account-proof")).toBe(false);
  });
  it("rereads after successful OTP but a me outage, without trying to reuse a consumed challenge", async () => {
    let proved = false;
    let afterReads = 0;
    const f = fixture(async (url) => {
      if (url.endsWith("/auth/otp/verify")) proved = true;
      if (url.endsWith("/me") && proved && ++afterReads === 1)
        return reply(503, { error: { code: "unavailable" } });
      return undefined;
    });
    const r = await mountAccount(f);
    await press(r, "account-request-phone");
    await enter(r, "account-code", "123456");
    await press(r, "account-verify");
    expect(text(r, "account-notice")).toContain("驗證已完成");
    expect(present(r, "account-proof")).toBe(false);
    await press(r, "account-reload");
    expect(afterReads).toBe(2);
    expect(
      f.calls.filter((call) => call.url.endsWith("/auth/otp/verify")),
    ).toHaveLength(1);
  });
  it("labels controlled demo OTP explicitly without inventing SMS availability", async () => {
    const f = fixture();
    const r = await mountAccount(f, { mode: "demo", demoOtpHint: "123456" });
    expect(text(r, "account-demo-banner")).toContain("並非正式帳號");
    await press(r, "account-request-phone");
    expect(text(r, "account-notice")).toContain("未寄送真實簡訊");
    expect(text(r, "account-demo-code")).toBe("示意驗證碼：123456");
  });
  it("requires the rendered delete confirmation and allows keeping the account", async () => {
    const f = fixture();
    const r = await mountAccount(f);
    await press(r, "account-open-delete");
    expect(present(r, "account-delete-confirmation")).toBe(true);
    expect(f.calls.some((call) => call.options?.method === "DELETE")).toBe(
      false,
    );
    await press(r, "account-cancel-delete");
    expect(present(r, "account-delete-confirmation")).toBe(false);
    expect(f.store.clear).not.toHaveBeenCalled();
  });
  it("awaits actual deletion then local storage cleanup before signed-out navigation", async () => {
    const started = deferred();
    const release = deferred();
    const f = fixture();
    f.store.clear.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      f.clearStored();
    });
    const r = await mountAccount(f);
    await press(r, "account-open-delete");
    let operation!: Promise<void>;
    await act(async () => {
      operation = r.root
        .findByProps({ testID: "account-confirm-delete" })
        .props.onPress();
      await started.promise;
    });
    expect(f.calls.find((call) => call.options?.method === "DELETE")?.url).toBe(
      `${origin}/api/passenger-app/me`,
    );
    expect(f.onSignedOut).not.toHaveBeenCalled();
    expect(present(r, "account-save")).toBe(false);
    await act(async () => {
      release.resolve();
      await operation;
    });
    expect(f.stored()).toBeNull();
    expect(await f.session.snapshot()).toBeNull();
    expect(f.onSignedOut).toHaveBeenCalledExactlyOnceWith({
      reason: "deleted",
      message: "帳號已刪除，本機登入資料已清除。",
    });
    expect(f.calls.some((call) => call.url.endsWith("/auth/logout"))).toBe(
      false,
    );
  });
  it.each([409, 503])(
    "preserves the session and account when delete returns HTTP %s",
    async (status) => {
      const f = fixture(async (url, options) =>
        url.endsWith("/me") && options?.method === "DELETE"
          ? reply(status, {
              error: {
                code: status === 409 ? "pending_payment_block" : "unavailable",
                message: "刪除暫時不可用",
              },
            })
          : undefined,
      );
      const r = await mountAccount(f);
      await press(r, "account-open-delete");
      await press(r, "account-confirm-delete");
      expect(present(r, "account-error")).toBe(true);
      expect(f.stored()).toEqual(tokens);
      expect(f.store.clear).not.toHaveBeenCalled();
      expect(f.onSignedOut).not.toHaveBeenCalled();
      expect(present(r, "account-save")).toBe(true);
    },
  );
  it("does not clear locally when the API does not confirm account deletion", async () => {
    const f = fixture(async (url, options) =>
      url.endsWith("/me") && options?.method === "DELETE"
        ? reply(200, { data: { success: false } })
        : undefined,
    );
    const r = await mountAccount(f);
    await press(r, "account-open-delete");
    await press(r, "account-confirm-delete");
    expect(text(r, "account-error")).toContain("尚未確認");
    expect(f.store.clear).not.toHaveBeenCalled();
    expect(f.onSignedOut).not.toHaveBeenCalled();
  });
  it("retries storage cleanup after acknowledged deletion without deleting the account twice", async () => {
    const f = fixture();
    f.store.clear.mockRejectedValueOnce(new Error("storage unavailable"));
    const r = await mountAccount(f);
    await press(r, "account-open-delete");
    await press(r, "account-confirm-delete");
    expect(text(r, "account-notice")).toContain(
      "帳號已刪除；本機登入資料尚未清除",
    );
    expect(f.onSignedOut).not.toHaveBeenCalled();
    expect(present(r, "account-save")).toBe(false);
    await press(r, "account-retry-cleanup");
    expect(
      f.calls.filter((call) => call.options?.method === "DELETE"),
    ).toHaveLength(1);
    expect(f.store.clear).toHaveBeenCalledTimes(2);
    expect(f.onSignedOut).toHaveBeenCalledTimes(1);
    expect(f.stored()).toBeNull();
  });
  it("posts the actual raw refresh-token logout command and clears local session", async () => {
    const f = fixture();
    const r = await mountAccount(f);
    await press(r, "account-logout");
    expect(body(f, "/auth/logout")).toEqual({
      refreshToken: tokens.refreshToken,
    });
    expect(
      f.calls.find((call) => call.url.endsWith("/auth/logout"))?.options
        ?.headers?.Authorization,
    ).toBeUndefined();
    expect(f.stored()).toBeNull();
    expect(f.onSignedOut).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "logout",
        remoteRevocation: "confirmed",
      }),
    );
    expect(present(r, "account-save")).toBe(false);
  });
  it("reports unconfirmed remote logout while acknowledging successful local cleanup", async () => {
    const f = fixture(async (url) =>
      url.endsWith("/auth/logout")
        ? reply(503, { error: { code: "unavailable" } })
        : undefined,
    );
    const r = await mountAccount(f);
    await press(r, "account-logout");
    expect(text(r, "account-notice")).toBe(
      "已清除本機登入；服務端撤銷尚未確認。",
    );
    expect(f.stored()).toBeNull();
    expect(f.onSignedOut).toHaveBeenCalledWith(
      expect.objectContaining({ remoteRevocation: "unconfirmed" }),
    );
  });
  it("keeps signed-out navigation pending when local logout cleanup fails", async () => {
    const f = fixture();
    f.store.clear.mockRejectedValueOnce(new Error("storage unavailable"));
    const r = await mountAccount(f);
    await press(r, "account-logout");
    expect(present(r, "account-error")).toBe(true);
    expect(f.onSignedOut).not.toHaveBeenCalled();
    expect(f.stored()).toEqual(tokens);
    await press(r, "account-logout");
    expect(f.stored()).toBeNull();
    expect(f.onSignedOut).toHaveBeenCalledTimes(1);
  });
});

describe("Native history rendered actions through actual owned list/detail SDK", () => {
  it("distinguishes loading from an authoritative empty history", async () => {
    const wait = deferred();
    const f = fixture(async (url) => {
      if (url.includes("/rides?")) await wait.promise;
      return undefined;
    });
    const { r } = await mountHistory(f);
    expect(present(r, "history-loading")).toBe(true);
    expect(present(r, "history-empty")).toBe(false);
    await act(async () => {
      wait.resolve();
    });
    expect(text(r, "history-empty")).toBe("目前沒有乘車紀錄。");
    expect(f.calls[0]?.options?.headers?.Authorization).toBe(
      `Bearer ${tokens.accessToken}`,
    );
  });
  it("passes the opaque next cursor to the real SDK and appends unique owned rides", async () => {
    const one = ride("one");
    const two = ride("two", "cancelled");
    const opaque = "cursor+/=雪";
    const f = fixture(async (url) =>
      url.includes("/rides?")
        ? reply(200, {
            data: url.includes("cursor=")
              ? { rides: [one, two] }
              : { rides: [one], next_cursor: opaque },
          })
        : undefined,
    );
    const { r } = await mountHistory(f);
    expect(present(r, "history-row-one")).toBe(true);
    await press(r, "history-more");
    expect(f.calls.at(-1)?.url).toBe(
      `${origin}/api/passenger-app/rides?limit=2&cursor=${encodeURIComponent(opaque)}`,
    );
    expect(r.root.findAllByProps({ testID: "history-row-one" })).toHaveLength(
      1,
    );
    expect(present(r, "history-row-two")).toBe(true);
    expect(present(r, "history-more")).toBe(false);
  });
  it("retains existing history and cursor when loading more fails, then retries", async () => {
    let n = 0;
    const f = fixture(async (url) =>
      url.includes("/rides?")
        ? url.includes("cursor=")
          ? ++n === 1
            ? reply(503, { error: { code: "unavailable" } })
            : reply(200, { data: { rides: [ride("two")] } })
          : reply(200, { data: { rides: [ride("one")], next_cursor: "next" } })
        : undefined,
    );
    const { r } = await mountHistory(f);
    await press(r, "history-more");
    expect(present(r, "history-error")).toBe(true);
    expect(present(r, "history-row-one")).toBe(true);
    expect(present(r, "history-more")).toBe(true);
    await press(r, "history-more");
    expect(present(r, "history-row-two")).toBe(true);
    expect(present(r, "history-error")).toBe(false);
    expect(n).toBe(2);
  });
  it("rereads selected own-ride detail before handing it to navigation", async () => {
    const old = ride("one", "assigned");
    const current = ride("one", "completed");
    const f = fixture(async (url) =>
      url.includes("/rides?")
        ? reply(200, { data: { rides: [old] } })
        : url.endsWith("/rides/one")
          ? reply(200, { data: { ride: current } })
          : undefined,
    );
    const { r, onOpenRide } = await mountHistory(f);
    await press(r, "history-open-one");
    expect(f.calls.at(-1)?.url).toBe(`${origin}/api/passenger-app/rides/one`);
    expect(f.calls.at(-1)?.options?.headers?.Authorization).toBe(
      `Bearer ${tokens.accessToken}`,
    );
    expect(onOpenRide).toHaveBeenCalledExactlyOnceWith(current);
  });
  it("keeps the list and shows unavailable detail without inventing a successful navigation", async () => {
    const f = fixture(async (url) =>
      url.includes("/rides?")
        ? reply(200, { data: { rides: [ride("one")] } })
        : url.endsWith("/rides/one")
          ? reply(404, { error: { code: "not_found" } })
          : undefined,
    );
    const { r, onOpenRide } = await mountHistory(f);
    await press(r, "history-open-one");
    expect(text(r, "history-error")).toContain("這筆行程目前無法讀取");
    expect(present(r, "history-row-one")).toBe(true);
    expect(onOpenRide).not.toHaveBeenCalled();
  });
  it("retries the first history request after an outage", async () => {
    let n = 0;
    const f = fixture(async (url) =>
      url.includes("/rides?") && ++n === 1
        ? reply(503, { error: { code: "unavailable" } })
        : undefined,
    );
    const { r } = await mountHistory(f);
    expect(present(r, "history-error")).toBe(true);
    expect(present(r, "history-empty")).toBe(false);
    await press(r, "history-refresh");
    expect(present(r, "history-error")).toBe(false);
    expect(present(r, "history-empty")).toBe(true);
    expect(n).toBe(2);
  });
  it("changes the existing status filter without an old cursor and can return to all rides", async () => {
    const f = fixture(async (url) =>
      url.includes("/rides?")
        ? reply(200, { data: { rides: [ride("one")], next_cursor: "next" } })
        : undefined,
    );
    const { r } = await mountHistory(f);
    await press(r, "history-filter-completed");
    expect(f.calls.at(-1)?.url).toBe(
      `${origin}/api/passenger-app/rides?limit=2&status=completed`,
    );
    await press(r, "history-filter-all");
    expect(f.calls.at(-1)?.url).toBe(
      `${origin}/api/passenger-app/rides?limit=2`,
    );
    expect(
      r.root.findByProps({ testID: "history-filter-all" }).props
        .accessibilityState.selected,
    ).toBe(true);
  });
  it("labels demo history and leaves configured mode free of fixture claims", async () => {
    const f = fixture();
    const { r } = await mountHistory(f, vi.fn(), "demo");
    expect(text(r, "history-demo-banner")).toContain("並非真實乘車紀錄");
    const normal = await mountHistory(f);
    expect(present(normal.r, "history-demo-banner")).toBe(false);
  });
});
