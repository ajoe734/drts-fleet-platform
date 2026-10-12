// @vitest-environment jsdom
import {
  render as renderComponent,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import LoginPage from "../../../apps/passenger-app-web/app/login/page";
import AccountPage from "../../../apps/passenger-app-web/app/account/page";
import CallbackPage from "../../../apps/passenger-app-web/app/auth/callback/[provider]/page";
import { createFixture, origin } from "./fixture";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  provider: "google",
  query: new URLSearchParams(),
  external: vi.fn(),
}));
// pnpm can install different Next peer instances for root tests and the app.
// Mount the app's actual contexts instead of mocking only the root module.
const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const { PathParamsContext, SearchParamsContext } = appRequire(
  "next/dist/shared/lib/hooks-client-context.shared-runtime",
) as typeof import("next/dist/shared/lib/hooks-client-context.shared-runtime");
const router: AppRouterInstance = {
  bfcacheId: "auth-ui-unit-segment",
  push: navigation.push,
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
function render(ui: ReactElement) {
  return renderComponent(
    <AppRouterContext.Provider value={router}>
      <PathParamsContext.Provider value={{ provider: navigation.provider }}>
        <SearchParamsContext.Provider value={navigation.query}>
          {ui}
        </SearchParamsContext.Provider>
      </PathParamsContext.Provider>
    </AppRouterContext.Provider>,
  );
}
vi.mock("../../../apps/passenger-app-web/lib/auth/navigation", () => ({
  redirectToProvider: navigation.external,
}));
let f: ReturnType<typeof createFixture>;
beforeEach(() => {
  sessionStorage.clear();
  navigation.push.mockClear();
  navigation.external.mockClear();
  navigation.provider = "google";
  navigation.query = new URLSearchParams();
  f = createFixture();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));
async function enterOtp(provider: "phone" | "email") {
  await screen.findByRole("button", {
    name: provider === "phone" ? "手機號碼登入" : "Email 登入",
  });
  click(provider === "phone" ? "手機號碼登入" : "Email 登入");
  fireEvent.change(
    screen.getByLabelText(
      provider === "phone" ? "請輸入您的手機號碼" : "請輸入您的 Email",
    ),
    {
      target: {
        value: provider === "phone" ? "0912345678" : "pax@example.test",
      },
    },
  );
  click("取得驗證碼");
  await screen.findByRole("group", { name: "6 位數驗證碼" });
}
const fillCode = (code: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: "6 位數驗證碼 1" }), {
    target: { value: code },
  });
async function finishOtp() {
  fillCode(f.codes.at(-1)!);
  click("驗證");
  await screen.findByText("歡迎加入，請同意服務條款");
}
async function signedIn() {
  const account = await f.signIn();
  render(<AccountPage />);
  await screen.findByRole("button", { name: "登入方式管理" });
  return account;
}

// Every UI request executes the shared PassengerClient, actual Next BFF and real OTP/account producers.
// Storage/mail/SMS and the OAuth upstream/provider HTTP boundary are injected; no browser or API server.
describe("login capabilities and actual OTP components", () => {
  it.each(["phone", "email", "google", "facebook", "line"] as const)(
    "hides disabled %s while displaying enabled methods",
    async (disabled) => {
      f.enabled = f.enabled.filter((provider) => provider !== disabled);
      render(<LoginPage />);
      await screen.findByText("歡迎使用智行叫車");
      expect(
        screen.queryByRole("button", {
          name:
            disabled === "phone"
              ? "手機號碼登入"
              : disabled === "email"
                ? "Email 登入"
                : disabled === "line"
                  ? "LINE"
                  : disabled === "google"
                    ? "Google"
                    : "Facebook",
        }),
      ).toBeNull();
    },
  );
  it("shows the canonical no-provider screen", async () => {
    f.enabled = [];
    render(<LoginPage />);
    await screen.findByText("系統維護中，目前未開放任何登入方式。");
  });
  it.each(["phone", "email"] as const)(
    "%s completes the real challenge and persists both consent versions",
    async (provider) => {
      render(<LoginPage />);
      await enterOtp(provider);
      // login() first reads the session account; hold the subsequent consent
      // read so a visible heading cannot stand in for interactive readiness.
      const read = f.holdNextAccountRead(1);
      try {
        await finishOtp();
        await read.started;
        expect(
          (screen.getByRole("checkbox") as HTMLInputElement).disabled,
        ).toBe(true);
        expect((button("繼續") as HTMLButtonElement).disabled).toBe(true);
      } finally {
        await act(async () => read.release());
      }
      await waitFor(() =>
        expect(
          (screen.getByRole("checkbox") as HTMLInputElement).disabled,
        ).toBe(false),
      );
      fireEvent.click(screen.getByRole("checkbox"));
      await waitFor(() =>
        expect((button("繼續") as HTMLButtonElement).disabled).toBe(false),
      );
      click("繼續");
      await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/"));
      const account = await f.client.getAccount();
      expect(account).toMatchObject({
        termsVersion: "terms-2026",
        privacyVersion: "privacy-2026",
      });
      const verify = f.calls.find((call) => call.path === "auth/otp/verify")!;
      expect(verify.body).toMatchObject({
        provider,
        challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      });
      expect(verify.body).not.toHaveProperty("transactionId");
    },
  );
  it.each(["phone", "email"] as const)(
    "%s invalid_code retains attempts and permits correction",
    async (provider) => {
      render(<LoginPage />);
      await enterOtp(provider);
      fillCode("not-a-code");
      expect((button("驗證") as HTMLButtonElement).disabled).toBe(true);
      fillCode(f.codes.at(-1) === "000000" ? "999999" : "000000");
      click("驗證");
      await screen.findByText("驗證碼錯誤");
      expect(screen.getByText(/本次操作剩餘嘗試次數/).textContent).toContain(
        "4",
      );
      fillCode(f.codes.at(-1)!);
      click("驗證");
      await screen.findByText("歡迎加入，請同意服務條款");
    },
  );
  it("enforces actual disabled controls at 60/1/0 seconds and preserves cooldown through back/re-entry", async () => {
    render(<LoginPage />);
    await enterOtp("phone");
    vi.useFakeTimers();
    const requests = () =>
      f.calls.filter((call) => call.path === "auth/otp/request").length;
    expect(
      (button(/重新發送驗證碼 \(60s\)/) as HTMLButtonElement).disabled,
    ).toBe(true);
    click("返回");
    expect(
      (button(/重新發送驗證碼 \(60s\)/) as HTMLButtonElement).disabled,
    ).toBe(true);
    click("返回");
    click("手機號碼登入");
    expect(
      (button(/重新發送驗證碼 \(60s\)/) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(59000);
    });
    expect(
      (button(/重新發送驗證碼 \(1s\)/) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect((button("重新發送驗證碼") as HTMLButtonElement).disabled).toBe(
      false,
    );
    const old = f.calls.find((call) => call.path === "auth/otp/request");
    await act(async () => {
      click("重新發送驗證碼");
      for (let i = 0; i < 60; i++) await Promise.resolve();
    });
    expect(requests()).toBe(2);
    expect(f.codes).toHaveLength(2);
    expect(old).toBeDefined();
  });
  it("preserves per-target cooldown when a contact input is edited and then restored", async () => {
    render(<LoginPage />);
    await enterOtp("phone");
    click("返回");
    const input = screen.getByLabelText("請輸入您的手機號碼");
    fireEvent.change(input, { target: { value: "0987654321" } });
    expect((button("取得驗證碼") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(input, { target: { value: "0912345678" } });
    expect((button(/重新發送驗證碼/) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each(["phone", "email"] as const)(
    "%s expiry disables verify and offers a fresh challenge",
    async (provider) => {
      render(<LoginPage />);
      await enterOtp(provider);
      fillCode(f.codes.at(-1)!);
      vi.useFakeTimers();
      click("返回");
      click("返回");
      click(provider === "phone" ? "手機號碼登入" : "Email 登入");
      fillCode(f.codes.at(-1)!);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(301000);
      });
      expect(screen.getByText("驗證碼已過期，請重新發送")).toBeDefined();
      expect((button("驗證") as HTMLButtonElement).disabled).toBe(true);
      expect((button("重新發送驗證碼") as HTMLButtonElement).disabled).toBe(
        false,
      );
    },
  );
  it.each(["challenge_locked", "too_many_requests", "not_configured"])(
    "renders formal %s without losing the actual error code",
    async (code) => {
      render(<LoginPage />);
      await enterOtp("phone");
      f.otpError = code;
      fillCode(f.codes.at(-1)!);
      click("驗證");
      await screen.findByRole("alert");
      expect(navigation.push).not.toHaveBeenCalled();
      if (code === "challenge_locked")
        expect((button("驗證") as HTMLButtonElement).disabled).toBe(true);
    },
  );
  it("guards a duplicate pending OTP request at the actual button", async () => {
    render(<LoginPage />);
    await screen.findByRole("button", { name: "手機號碼登入" });
    click("手機號碼登入");
    fireEvent.change(screen.getByLabelText("請輸入您的手機號碼"), {
      target: { value: "0912345678" },
    });
    click("取得驗證碼");
    click("取得驗證碼");
    await screen.findByRole("group", { name: "6 位數驗證碼" });
    expect(
      f.calls.filter((call) => call.path === "auth/otp/request"),
    ).toHaveLength(1);
  });
  it.each(["google", "facebook", "line"] as const)(
    "%s login start uses real transport and renders redirect progress",
    async (provider) => {
      render(<LoginPage />);
      await screen.findByText("歡迎使用智行叫車");
      click(
        provider === "line"
          ? "LINE"
          : provider === "google"
            ? "Google"
            : "Facebook",
      );
      await waitFor(() => expect(navigation.external).toHaveBeenCalledOnce());
      expect(f.calls.at(-1)).toMatchObject({
        path: `auth/oauth/${provider}/start`,
        body: {
          provider,
          purpose: "login",
          redirectUri: expect.stringContaining(`/auth/callback/${provider}`),
        },
      });
    },
  );
  it.each(["google", "facebook", "line"] as const)(
    "%s start failure recovers to the entry screen",
    async (provider) => {
      f.oauthError = "unavailable";
      render(<LoginPage />);
      await screen.findByText("歡迎使用智行叫車");
      click(
        provider === "line"
          ? "LINE"
          : provider === "google"
            ? "Google"
            : "Facebook",
      );
      await screen.findByRole("alert");
      expect(navigation.external).not.toHaveBeenCalled();
    },
  );
});

describe("callback and recoverable consent", () => {
  async function callback(
    provider: "google" | "facebook" | "line",
    purpose: "login" | "link" = "login",
    error?: string,
  ) {
    const start = await f.client.oauthStart({
      provider,
      purpose,
      redirectUri: `${origin}/auth/callback/${provider}`,
    });
    navigation.provider = provider;
    navigation.query = new URLSearchParams({
      state: start.state,
      ...(error ? { error } : { code: "provider-code" }),
      transactionId: "untrusted-query-id",
    });
    render(<CallbackPage />);
  }
  it.each(["google", "facebook", "line"] as const)(
    "%s callback succeeds via binding and requires explicit consent",
    async (provider) => {
      await callback(provider);
      await screen.findByText("歡迎加入，請同意服務條款");
      expect(navigation.push).not.toHaveBeenCalled();
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
    },
  );
  it.each(["google", "facebook", "line"] as const)(
    "%s cancellation clears the transaction and displays canonical refusal",
    async (provider) => {
      await callback(provider, "login", "access_denied");
      await screen.findByText("您已取消社群帳號授權");
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
    },
  );
  it.each(["google", "facebook", "line"] as const)(
    "%s callback failure remains recoverable",
    async (provider) => {
      const start = await f.client.oauthStart({
        provider,
        purpose: "login",
        redirectUri: `${origin}/auth/callback/${provider}`,
      });
      f.oauthError = "invalid_grant";
      navigation.provider = provider;
      navigation.query = new URLSearchParams({
        state: start.state,
        code: "code",
      });
      render(<CallbackPage />);
      await screen.findByText("第三方登入失敗，請重試或選擇其他登入方式");
      expect(f.jar.has("pax_oauth_txn")).toBe(false);
    },
  );
  it("keeps an account-read failure in consent and allows retry", async () => {
    await callback("google");
    f.accountReadError = true;
    await screen.findByText("無法讀取同意紀錄，請重試");
    expect(navigation.push).not.toHaveBeenCalled();
    f.accountReadError = false;
    click("重試");
    await waitFor(() =>
      expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
        false,
      ),
    );
  });
  it("keeps a refused consent out of home and revokes the actual session", async () => {
    await callback("google");
    await screen.findByText("歡迎加入，請同意服務條款");
    click("不同意並登出");
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/login"));
    expect(f.jar.has("pax_session")).toBe(false);
  });
  it("write failure stays recoverable and retries the real PATCH", async () => {
    await callback("google");
    await screen.findByText("歡迎加入，請同意服務條款");
    await waitFor(() =>
      expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole("checkbox"));
    f.accountWriteError = true;
    click("繼續");
    await screen.findByText("儲存失敗，請重試");
    expect(navigation.push).not.toHaveBeenCalled();
    f.accountWriteError = false;
    click("繼續");
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/"));
  });
  it("missing legal configuration blocks consent and never invents URLs/versions", async () => {
    vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "");
    await callback("google");
    await screen.findByText("服務條款與隱私權政策目前無法使用，請稍後重試。");
    expect((button("繼續") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it.each(["terms-only", "both", "old-version"])(
    "%s existing account compares both configured consent versions",
    async (state) => {
      const account = await f.accounts.findOrCreateByIdentity(
        "google",
        "google-new",
      );
      const stored = f.accountStore.accounts.get(account.drtsPassengerId)!;
      stored.termsVersion = state === "old-version" ? "old" : "terms-2026";
      if (state !== "terms-only") stored.privacyVersion = "privacy-2026";
      await callback("google");
      if (state === "both")
        await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/"));
      else {
        await screen.findByText("歡迎加入，請同意服務條款");
        expect(navigation.push).not.toHaveBeenCalled();
      }
    },
  );
});

describe("real account controls and mutations", () => {
  it("edits the profile through the real client/BFF/controller", async () => {
    await signedIn();
    click("編輯資料");
    fireEvent.change(screen.getByLabelText("顯示名稱"), {
      target: { value: "Passenger" },
    });
    fireEvent.change(screen.getByLabelText("聯絡手機"), {
      target: { value: "0912345678" },
    });
    click("儲存");
    await screen.findByText("Passenger");
    expect(await f.client.getAccount()).toMatchObject({
      displayName: "Passenger",
      contactPhone: "0912345678",
      contactPhoneVerified: false,
    });
  });
  it("blocks last-identity unlink and preserves the server identity", async () => {
    await signedIn();
    click("登入方式管理");
    click("解除綁定");
    await screen.findByText("無法解除綁定。您的帳號必須至少保留一種登入方式。");
    expect(f.calls.filter((call) => call.method === "DELETE")).toHaveLength(0);
  });
  it("unlinks a real additional identity and refreshes the list", async () => {
    await f.signIn();
    const token = f.jar.get("pax_session")!;
    await f.accounts.linkIdentity(
      await f.accounts.authenticateAccessToken(token),
      "email",
      "extra@example.test",
    );
    render(<AccountPage />);
    await screen.findByRole("button", { name: "登入方式管理" });
    click("登入方式管理");
    const buttons = screen.getAllByRole("button", { name: "解除綁定" });
    fireEvent.click(buttons[1]!);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "解除綁定" })).toHaveLength(
        1,
      ),
    );
  });
  it.each(["phone", "email"] as const)(
    "links %s via real challenge producer and linked result",
    async (provider) => {
      await signedIn();
      click("登入方式管理");
      click(provider === "phone" ? "綁定 手機號碼" : "綁定 Email");
      fireEvent.change(
        screen.getByLabelText(
          provider === "phone" ? "請輸入您的手機號碼" : "請輸入您的 Email",
        ),
        {
          target: {
            value: provider === "phone" ? "0912345678" : "extra@example.test",
          },
        },
      );
      click("取得驗證碼");
      await screen.findByRole("group", { name: "6 位數驗證碼" });
      fillCode(f.codes.at(-1)!);
      click("驗證");
      await waitFor(async () =>
        expect(
          (await f.client.getIdentities()).identities.map(
            (identity) => identity.provider,
          ),
        ).toContain(provider),
      );
    },
  );
  it("verifies contact phone and refreshes actual verification state", async () => {
    const account = await f.signIn();
    f.accountStore.accounts.get(account.drtsPassengerId)!.contactPhone =
      "0912345678";
    render(<AccountPage />);
    await screen.findByRole("button", { name: "驗證聯絡手機" });
    click("驗證聯絡手機");
    click("取得驗證碼");
    await screen.findByRole("group", { name: "6 位數驗證碼" });
    fillCode(f.codes.at(-1)!);
    click("驗證");
    await screen.findByText("(已驗證)");
    expect((await f.client.getAccount()).contactPhoneVerified).toBe(true);
  });
  it("hides unavailable contact verification", async () => {
    const account = await f.signIn();
    f.enabled = ["email", "google"];
    f.accountStore.accounts.get(account.drtsPassengerId)!.contactPhone =
      "0912345678";
    render(<AccountPage />);
    await screen.findByRole("button", { name: "編輯資料" });
    expect(screen.queryByRole("button", { name: "驗證聯絡手機" })).toBeNull();
    click("登入方式管理");
    expect(screen.queryByRole("button", { name: "綁定 手機號碼" })).toBeNull();
  });
  it.each(["google", "facebook", "line"] as const)(
    "%s account linking sends authenticated purpose and callback returns to account",
    async (provider) => {
      await f.signIn("email");
      render(<AccountPage />);
      await screen.findByRole("button", { name: "登入方式管理" });
      click("登入方式管理");
      click(
        `綁定 ${provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "LINE"}`,
      );
      await waitFor(() => expect(navigation.external).toHaveBeenCalledOnce());
      const call = f.calls.find(
        (call) => call.path === `auth/oauth/${provider}/start`,
      )!;
      expect(call.body.purpose).toBe("link");
      expect(call.headers.get("authorization")).toMatch(/^Bearer /);
      cleanup();
      navigation.provider = provider;
      navigation.query = new URLSearchParams({
        code: "code",
        state: JSON.parse(f.jar.get("pax_oauth_txn")!).state,
      });
      render(<CallbackPage />);
      await waitFor(() =>
        expect(navigation.push).toHaveBeenCalledWith("/account"),
      );
    },
  );
  it("delete cancel sends no mutation; failure preserves confirmation; success clears session and shows A-15", async () => {
    await signedIn();
    click("刪除帳號");
    await screen.findByText(/依法定年限保留/);
    click("取消");
    expect(f.calls.filter((call) => call.method === "DELETE")).toHaveLength(0);
    click("刪除帳號");
    f.deleteError = true;
    click("確定刪除帳號");
    await screen.findByText("您有尚未結清的款項，請先結清後再執行刪除帳號。");
    expect(f.jar.has("pax_session")).toBe(true);
    f.deleteError = false;
    click("確定刪除帳號");
    await screen.findByText("帳號已成功刪除");
    expect(f.jar.has("pax_session")).toBe(false);
    expect(f.calls.find((call) => call.method === "DELETE")!.body).toEqual({});
  });
  it("logout requires confirmation and revokes session", async () => {
    await signedIn();
    click("登出");
    await screen.findByText("確定要登出嗎？");
    click("取消");
    expect(f.calls.filter((call) => call.path === "auth/logout")).toHaveLength(
      0,
    );
    click("登出");
    click("登出");
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/login"));
    expect(f.jar.has("pax_refresh")).toBe(false);
  });
});

describe("F4/F6 additional component failure and session regressions", () => {
  it.each(["phone", "email"] as const)(
    "%s five formal invalid attempts exhaust the actual control",
    async (provider) => {
      render(<LoginPage />);
      await enterOtp(provider);
      for (let count = 0; count < 5; count++) {
        fillCode(f.codes.at(-1) === "000000" ? "999999" : "000000");
        click("驗證");
        await waitFor(() =>
          expect((button("驗證") as HTMLButtonElement).disabled).toBe(
            count === 4,
          ),
        );
        if (count < 4)
          await screen.findByText(
            new RegExp(`本次操作剩餘嘗試次數.*${4 - count}`),
          );
      }
      await screen.findByText("錯誤次數已達上限，請重新發送驗證碼");
      const count = f.calls.filter(
        (call) => call.path === "auth/otp/verify",
      ).length;
      click("驗證");
      expect(
        f.calls.filter((call) => call.path === "auth/otp/verify"),
      ).toHaveLength(count);
    },
  );
  it.each(["phone", "email", "google", "facebook", "line"] as const)(
    "account hides newly disabled %s binding",
    async (disabled) => {
      await f.signIn(disabled === "google" ? "email" : "google");
      f.enabled = f.enabled.filter((provider) => provider !== disabled);
      render(<AccountPage />);
      await screen.findByRole("button", { name: "登入方式管理" });
      click("登入方式管理");
      const labels = {
        phone: "手機號碼",
        email: "Email",
        google: "Google",
        facebook: "Facebook",
        line: "LINE",
      };
      expect(
        screen.queryByRole("button", { name: `綁定 ${labels[disabled]}` }),
      ).toBeNull();
    },
  );
  it.each(["google", "facebook", "line"] as const)(
    "%s account link failure surfaces an actionable error",
    async (provider) => {
      await f.signIn("email");
      f.oauthError = "conflict";
      render(<AccountPage />);
      await screen.findByRole("button", { name: "登入方式管理" });
      click("登入方式管理");
      click(
        `綁定 ${provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "LINE"}`,
      );
      await screen.findByText("此身分已綁定於其他智行叫車帳戶。");
      expect(navigation.external).not.toHaveBeenCalled();
    },
  );
  it("a contact-phone edit after challenge prevents verification of the obsolete target", async () => {
    const account = await f.signIn();
    f.accountStore.accounts.get(account.drtsPassengerId)!.contactPhone =
      "0912345678";
    render(<AccountPage />);
    await screen.findByRole("button", { name: "驗證聯絡手機" });
    click("驗證聯絡手機");
    click("取得驗證碼");
    await screen.findByRole("group", { name: "6 位數驗證碼" });
    f.accountStore.accounts.get(account.drtsPassengerId)!.contactPhone =
      "0987654321";
    fillCode(f.codes.at(-1)!);
    click("驗證");
    await screen.findByText("登入狀態或聯絡手機已變更，請重新操作。");
    expect(f.calls.some((call) => call.path === "auth/otp/verify")).toBe(false);
  });
  it("switching accounts while OTP link is displayed prevents sending the old proof", async () => {
    await signedIn();
    click("登入方式管理");
    click("綁定 Email");
    fireEvent.change(screen.getByLabelText("請輸入您的 Email"), {
      target: { value: "link@example.test" },
    });
    click("取得驗證碼");
    await screen.findByRole("group", { name: "6 位數驗證碼" });
    await f.signIn("line", "other-account");
    fillCode(f.codes.at(-1)!);
    click("驗證");
    await screen.findByText("登入狀態或聯絡手機已變更，請重新操作。");
    expect(f.calls.some((call) => call.path === "auth/otp/verify")).toBe(false);
  });
  it("duplicate verify clicks consume exactly one formal challenge", async () => {
    render(<LoginPage />);
    await enterOtp("email");
    fillCode(f.codes.at(-1)!);
    click("驗證");
    click("驗證");
    await screen.findByText("歡迎加入，請同意服務條款");
    expect(
      f.calls.filter((call) => call.path === "auth/otp/verify"),
    ).toHaveLength(1);
  });
});
