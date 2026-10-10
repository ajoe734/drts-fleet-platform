// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "../../../apps/passenger-app-web/app/login/page";
import AccountPage from "../../../apps/passenger-app-web/app/account/page";
import CallbackPage from "../../../apps/passenger-app-web/app/auth/callback/[provider]/page";
import { AUTH_COPY as C } from "../../../packages/passenger-client/src/auth/copy";
import { installBoundary, secondUuid, passengerId, uuid } from "./boundary";

const navigation = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  provider: "google",
  query: "code=test-code&state=test-state",
  redirect: vi.fn(),
}));
vi.mock(
  "../../../apps/passenger-app-web/node_modules/next/navigation.js",
  () => ({
    useRouter: () => navigation.router,
    useParams: () => ({ provider: navigation.provider }),
    useSearchParams: () => new URLSearchParams(navigation.query),
  }),
);
vi.mock("../../../apps/passenger-app-web/lib/auth/navigation", () => ({
  navigateToProvider: (url: string) => navigation.redirect(url),
}));
let boundary: ReturnType<typeof installBoundary>;
const origin = window.location.origin;
const calls = (path: string, method?: string) =>
  boundary.state.upstream.filter(
    (c) => c.path === path && (!method || c.method === method),
  );
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name, exact: true }));
const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
async function loginOtp(provider: "phone" | "email" = "phone") {
  render(<LoginPage />);
  await screen.findByLabelText(provider === "phone" ? C.phone : C.email);
  change(
    provider === "phone" ? C.phone : C.email,
    provider === "phone" ? "0900000000" : "pax@example.test",
  );
  click(C.login[provider]);
  await screen.findByLabelText(C.code);
}
async function verify(label = C.verifyLogin) {
  change(C.code, "123456");
  click(label);
}
async function account() {
  render(<AccountPage />);
  await screen.findByText("姓名: Tester");
}
async function callback(
  provider = "google",
  purpose: "login" | "link" = "login",
) {
  await boundary.client.oauthStart({
    provider: provider as "google",
    purpose,
    redirectUri: `${origin}/auth/callback/${provider}`,
  });
  navigation.provider = provider;
  render(<CallbackPage />);
}

beforeEach(() => {
  navigation.router.replace.mockReset();
  navigation.redirect.mockReset();
  navigation.provider = "google";
  navigation.query = "code=test-code&state=test-state";
  sessionStorage.clear();
  boundary = installBoundary(origin);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe.each(["phone", "email"] as const)(
  "%s OTP components through actual BFF",
  (provider) => {
    it("logs in with a token-free response and checks both consent versions", async () => {
      await loginOtp(provider);
      await verify();
      await waitFor(() =>
        expect(navigation.router.replace).toHaveBeenCalledWith("/"),
      );
      const request = calls("auth/otp/request")[0]!;
      const verifyCall = calls("auth/otp/verify")[0]!;
      expect(request.body).toMatchObject({ provider, purpose: "login" });
      expect(verifyCall.body).toEqual({
        provider,
        target: request.body!.target,
        challenge: expect.any(String),
        code: "123456",
      });
      expect(boundary.state.cookies.has("pax_session")).toBe(true);
    });
    it("keeps invalid-code failure visible and prevents navigation", async () => {
      boundary.state.verifyError = { code: "invalid_code", status: 400 };
      await loginOtp(provider);
      await verify();
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        C.invalidCode,
      );
      expect(screen.getByText(C.attempts(1))).toBeDefined();
      expect(navigation.router.replace).not.toHaveBeenCalled();
    });
    it("hides a disabled provider and cannot submit its command", async () => {
      boundary.state.providers = boundary.state.providers.filter(
        (p) => p !== provider,
      );
      render(<LoginPage />);
      await screen.findByRole("button", { name: C.login.google });
      expect(
        screen.queryByRole("button", { name: C.login[provider] }),
      ).toBeNull();
      expect(calls("auth/otp/request")).toHaveLength(0);
    });
    it("shows request errors and rate-limit cooldown", async () => {
      boundary.state.requestError = { code: "too_many_requests", status: 429 };
      render(<LoginPage />);
      await screen.findByLabelText(provider === "phone" ? C.phone : C.email);
      change(
        provider === "phone" ? C.phone : C.email,
        provider === "phone" ? "0900000000" : "pax@example.test",
      );
      click(C.login[provider]);
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        C.rateLimit,
      );
      expect(
        (
          screen.getByRole("button", {
            name: C.login[provider],
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
    });
  },
);

describe.each(["google", "facebook", "line"] as const)(
  "%s OAuth components through actual BFF",
  (provider) => {
    it("starts login, restores the same transaction and handles callback", async () => {
      render(<LoginPage />);
      await screen.findByRole("button", { name: C.login[provider] });
      click(C.login[provider]);
      await waitFor(() =>
        expect(navigation.redirect).toHaveBeenCalledWith(
          "https://provider.invalid/authorize?state=test-state",
        ),
      );
      expect(calls(`auth/oauth/${provider}/start`)[0]!.body).toEqual({
        provider,
        purpose: "login",
        redirectUri: `${origin}/auth/callback/${provider}`,
      });
      cleanup();
      navigation.provider = provider;
      render(<CallbackPage />);
      await waitFor(() =>
        expect(navigation.router.replace).toHaveBeenCalledWith("/"),
      );
      expect(calls(`auth/oauth/${provider}/callback`)[0]!.body).toEqual({
        provider,
        code: "test-code",
        state: "test-state",
        transactionId: uuid,
      });
      expect(
        boundary.state.browser.find((c) => c.path.endsWith("/callback"))!.body,
      ).not.toHaveProperty("transactionId");
      expect(boundary.state.cookies.has("pax_oauth_txn")).toBe(false);
    });
    it("surfaces a disabled-during-start or provider start failure", async () => {
      boundary.state.startError = { code: "unsupported_provider", status: 400 };
      render(<LoginPage />);
      await screen.findByRole("button", { name: C.login[provider] });
      click(C.login[provider]);
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        C.unsupported,
      );
      expect(navigation.redirect).not.toHaveBeenCalled();
    });
    it("hides a provider disabled in configuration", async () => {
      boundary.state.providers = boundary.state.providers.filter(
        (p) => p !== provider,
      );
      render(<LoginPage />);
      await screen.findByLabelText(C.phone);
      expect(
        screen.queryByRole("button", { name: C.login[provider] }),
      ).toBeNull();
      expect(calls(`auth/oauth/${provider}/start`)).toHaveLength(0);
    });
    it("handles callback rejection without granting access", async () => {
      boundary.state.callbackError = { code: "invalid_grant", status: 400 };
      await callback(provider);
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        C.invalidGrant,
      );
      expect(navigation.router.replace).not.toHaveBeenCalled();
      expect(boundary.state.cookies.has("pax_oauth_txn")).toBe(false);
    });
    it("starts an account-bound link and returns to account", async () => {
      boundary = installBoundary(origin, true);
      await account();
      click(C.link[provider]);
      await waitFor(() => expect(navigation.redirect).toHaveBeenCalled());
      expect(calls(`auth/oauth/${provider}/start`)[0]!.body?.purpose).toBe(
        "link",
      );
      expect(
        calls(`auth/oauth/${provider}/start`)[0]!.headers.get("authorization"),
      ).toMatch(/^Bearer /);
      cleanup();
      navigation.provider = provider;
      render(<CallbackPage />);
      await waitFor(() =>
        expect(navigation.router.replace).toHaveBeenCalledWith("/account"),
      );
      expect(
        calls(`auth/oauth/${provider}/callback`)[0]!.headers.get(
          "authorization",
        ),
      ).toMatch(/^Bearer /);
    });
  },
);

it("handles no providers and provider-list failure/retry", async () => {
  boundary.state.providers = [];
  render(<LoginPage />);
  expect(await screen.findByText(C.providersEmpty)).toBeDefined();
  cleanup();
  boundary.state.hold = (call) =>
    call.path === "auth/providers"
      ? Promise.resolve(
          Response.json({ error: { code: "unavailable" } }, { status: 503 }),
        )
      : null;
  render(<LoginPage />);
  await screen.findByText(C.providersFailed);
  boundary.state.hold = null;
  click(C.retry);
  expect(await screen.findByText(C.providersEmpty)).toBeDefined();
});

it("uses real disabled controls and preserves 60/1/0s cooldown through return and remount", async () => {
  vi.useFakeTimers();
  render(<LoginPage />);
  await act(async () => {});
  change(C.phone, "0900000000");
  click(C.login.phone);
  await act(async () => {});
  const resend = screen.getByRole("button", {
    name: C.cooldown(60),
  }) as HTMLButtonElement;
  expect(resend.disabled).toBe(true);
  fireEvent.click(resend);
  expect(calls("auth/otp/request")).toHaveLength(1);
  click(C.back);
  click(C.login.phone);
  expect(calls("auth/otp/request")).toHaveLength(1);
  expect(
    (screen.getByRole("button", { name: C.login.phone }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  cleanup();
  render(<LoginPage />);
  await act(async () => {});
  change(C.phone, "0900000000");
  expect(
    (screen.getByRole("button", { name: C.login.phone }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(59000);
  });
  expect(screen.getByText(C.cooldown(1))).toBeDefined();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(
    (screen.getByRole("button", { name: C.login.phone }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  click(C.login.phone);
  await act(async () => {});
  change(C.code, "123456");
  click(C.verifyLogin);
  await act(async () => {});
  expect(calls("auth/otp/request")).toHaveLength(2);
  expect(calls("auth/otp/verify")[0]!.body?.challenge).toBe(
    calls("auth/otp/request").length.toString().padStart(43, "A"),
  );
});

it("keeps OTP target bound to the issued challenge and rolls it over on resend", async () => {
  vi.useFakeTimers();
  render(<LoginPage />);
  await act(async () => {});
  change(C.phone, "0900000000");
  click(C.login.phone);
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  click(C.resend);
  await act(async () => {});
  await verify();
  await act(async () => {});
  expect(calls("auth/otp/request")).toHaveLength(2);
  expect(calls("auth/otp/verify")[0]!.body?.challenge).toBe(
    "2".padStart(43, "A"),
  );
  expect(calls("auth/otp/verify")[0]!.body?.target).toBe("0900000000");
});

it("blocks expired OTP and stops after five generic invalid responses", async () => {
  vi.useFakeTimers();
  boundary.state.verifyError = { code: "invalid_code", status: 400 };
  render(<LoginPage />);
  await act(async () => {});
  change(C.phone, "0900000000");
  click(C.login.phone);
  await act(async () => {});
  change(C.code, "000000");
  for (let n = 0; n < 5; n++) {
    click(C.verifyLogin);
    await act(async () => {});
  }
  expect(
    (screen.getByRole("button", { name: C.verifyLogin }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.getByText(C.locked)).toBeDefined();
  click(C.verifyLogin);
  expect(calls("auth/otp/verify")).toHaveLength(5);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  click(C.resend);
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300000);
  });
  expect(screen.getByText(C.expired)).toBeDefined();
  expect(
    (screen.getByRole("button", { name: C.verifyLogin }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it.each(["challenge_locked", "challenge_expired"])(
  "preserves formal %s errors without another verify",
  async (code) => {
    boundary.state.verifyError = { code, status: 400 };
    await loginOtp();
    await verify();
    await screen.findByRole("alert");
    expect(
      (screen.getByRole("button", { name: C.verifyLogin }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  },
);

it("guards duplicate requests and verifies while upstream is pending", async () => {
  let release: ((value: Response) => void) | undefined;
  boundary.state.hold = (call) =>
    call.path === "auth/otp/request"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : null;
  render(<LoginPage />);
  await screen.findByLabelText(C.phone);
  change(C.phone, "0900000000");
  click(C.login.phone);
  click(C.login.phone);
  await waitFor(() => expect(calls("auth/otp/request")).toHaveLength(1));
  expect(
    (screen.getByRole("button", { name: C.login.phone }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  boundary.state.challenges.set("A".repeat(43), {
    provider: "phone",
    purpose: "login",
    target: "0900000000",
  });
  await act(async () =>
    release!(
      Response.json({ data: { success: true, challenge: "A".repeat(43) } }),
    ),
  );
  boundary.state.hold = (call) =>
    call.path === "auth/otp/verify"
      ? new Promise<Response>((resolve) => {
          release = resolve;
        })
      : null;
  change(C.code, "123456");
  click(C.verifyLogin);
  await waitFor(() => expect(calls("auth/otp/verify")).toHaveLength(1));
  fireEvent.click(screen.getByRole("button", { name: C.loading }));
  expect(calls("auth/otp/verify")).toHaveLength(1);
  await act(async () =>
    release!(
      Response.json({
        data: {
          result: "logged_in",
          access_token: "access",
          refresh_token: "refresh",
        },
      }),
    ),
  );
  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/"),
  );
});

describe.each(["otp", "oauth"] as const)("%s first-use consent", (mode) => {
  const authenticate = async () => {
    if (mode === "otp") {
      await loginOtp();
      await verify();
    } else await callback();
  };
  it.each(["new", "terms-only", "privacy-only", "outdated"])(
    "gates %s account, rejects unchecked consent and persists both configured versions",
    async (kind) => {
      boundary.state.account.termsVersion =
        kind === "privacy-only" || kind === "new"
          ? undefined
          : kind === "outdated"
            ? "old"
            : "terms-test";
      boundary.state.account.privacyVersion =
        kind === "terms-only" || kind === "new" ? undefined : "privacy-test";
      await authenticate();
      const box = await screen.findByLabelText(C.consentCheckbox);
      expect(navigation.router.replace).not.toHaveBeenCalled();
      expect(
        (
          screen.getByRole("button", {
            name: C.consentContinue,
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      click(C.consentContinue);
      expect(calls("me", "PATCH")).toHaveLength(0);
      expect(
        screen.getByRole("link", { name: C.terms }).getAttribute("href"),
      ).toBe("https://content.invalid/terms");
      fireEvent.click(box);
      click(C.consentContinue);
      await waitFor(() =>
        expect(navigation.router.replace).toHaveBeenCalledWith("/"),
      );
      expect(calls("me", "PATCH")[0]!.body).toEqual({
        termsVersion: "terms-test",
        privacyVersion: "privacy-test",
      });
    },
  );
  it("keeps account-read and consent-write errors recoverable without bypass", async () => {
    delete boundary.state.account.termsVersion;
    delete boundary.state.account.privacyVersion;
    boundary.state.readError = { code: "unavailable", status: 503 };
    await authenticate();
    await screen.findByText(C.consentReadFailed);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    boundary.state.readError = null;
    click(C.retry);
    await screen.findByLabelText(C.consentCheckbox);
    boundary.state.updateError = { code: "unavailable", status: 503 };
    fireEvent.click(screen.getByLabelText(C.consentCheckbox));
    click(C.consentContinue);
    await screen.findByText(C.consentSaveFailed);
    expect(navigation.router.replace).not.toHaveBeenCalled();
    boundary.state.updateError = null;
    click(C.consentContinue);
    await waitFor(() =>
      expect(navigation.router.replace).toHaveBeenCalledWith("/"),
    );
  });
  it("does not fabricate versions or links when legal content is unconfigured", async () => {
    vi.stubEnv("NEXT_PUBLIC_PASSENGER_TERMS_VERSION", "");
    vi.stubEnv("NEXT_PUBLIC_TERMS_URL", "javascript:alert(1)");
    await authenticate();
    await screen.findByText(C.consentPending);
    expect(screen.queryByRole("link", { name: C.terms })).toBeNull();
    expect(
      screen.queryByRole("button", { name: C.consentContinue }),
    ).toBeNull();
    expect(navigation.router.replace).not.toHaveBeenCalled();
    expect(calls("me", "PATCH")).toHaveLength(0);
  });
});

it("handles declined, missing and unknown callback parameters", async () => {
  await boundary.client.oauthStart({
    provider: "google",
    purpose: "login",
    redirectUri: `${origin}/auth/callback/google`,
  });
  navigation.query = "error=access_denied&state=test-state";
  render(<CallbackPage />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.denied,
  );
  expect(calls("auth/oauth/google/callback")).toHaveLength(0);
  expect(boundary.state.cookies.has("pax_oauth_txn")).toBe(false);
  cleanup();
  navigation.query = "code=test-code";
  render(<CallbackPage />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.callbackMissing,
  );
  cleanup();
  navigation.query = "code=test-code&state=test-state";
  navigation.provider = "github";
  render(<CallbackPage />);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.callbackMissing,
  );
});

it("renders each disabled account capability according to configured providers", async () => {
  boundary = installBoundary(origin, true);
  boundary.state.providers = [];
  await account();
  expect(screen.queryByRole("button", { name: C.verifyContact })).toBeNull();
  for (const provider of [
    "phone",
    "email",
    "google",
    "facebook",
    "line",
  ] as const)
    expect(screen.queryByRole("button", { name: C.link[provider] })).toBeNull();
});

it.each(["phone", "email"] as const)(
  "links %s with a session-bound OTP command and reloads identities",
  async (provider) => {
    boundary = installBoundary(origin, true);
    if (provider === "phone") boundary.state.identities[0]!.provider = "email";
    await account();
    change(
      C.link[provider],
      provider === "phone" ? "0900000001" : "pax@example.test",
    );
    click(C.link[provider]);
    await screen.findByLabelText(C.code);
    await verify(C.verify);
    await screen.findByText(/0900000001|pax@example.test/);
    expect(calls("auth/otp/request")[0]!.body?.purpose).toBe("link");
    expect(calls("auth/otp/request")[0]!.headers.get("authorization")).toMatch(
      /^Bearer /,
    );
    expect(calls("auth/otp/verify")[0]!.headers.get("authorization")).toMatch(
      /^Bearer /,
    );
    expect(boundary.state.identities).toHaveLength(2);
  },
);

it("shows link conflict and verifies the persisted contact phone", async () => {
  boundary = installBoundary(origin, true);
  await account();
  change(C.link.email, "pax@example.test");
  click(C.link.email);
  await screen.findByLabelText(C.code);
  boundary.state.verifyError = { code: "conflict", status: 409 };
  await verify(C.verify);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.conflict,
  );
  click(C.back);
  boundary.state.verifyError = null;
  click(C.verifyContact);
  await screen.findByLabelText(C.code);
  await verify(C.verify);
  await screen.findByText(/已驗證/);
  expect(calls("auth/otp/request")[1]!.body).toEqual({
    provider: "phone",
    purpose: "verify_contact_phone",
    target: "0900000000",
  });
});

it("updates profile/contact and keeps API errors visible", async () => {
  boundary = installBoundary(origin, true);
  boundary.state.account.contactPhoneVerified = true;
  await account();
  click(C.edit);
  change(C.name, "Updated");
  change(C.contactPhone, "0900000001");
  boundary.state.updateError = { code: "validation_error", status: 400 };
  click(C.save);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.invalidInput,
  );
  boundary.state.updateError = null;
  click(C.save);
  await screen.findByText("姓名: Updated");
  expect(calls("me", "PATCH")[1]!.body).toEqual({
    displayName: "Updated",
    contactPhone: "0900000001",
  });
  expect(boundary.state.account.contactPhoneVerified).toBe(false);
  click(C.verifyContact);
  await screen.findByLabelText(C.code);
  expect(calls("auth/otp/request")[0]!.body?.target).toBe("0900000001");
});

it("requires unlink confirmation, prevents last identity, and preserves server rejection", async () => {
  boundary = installBoundary(origin, true);
  await account();
  expect(
    (screen.getByRole("button", { name: C.unlink }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  cleanup();
  boundary.state.identities.push({
    identityId: secondUuid,
    drtsPassengerId: passengerId,
    provider: "google",
    subject: "google-subject",
  });
  await account();
  fireEvent.click(screen.getAllByRole("button", { name: C.unlink })[0]!);
  click(C.cancel);
  expect(calls(`me/identities/${uuid}`, "DELETE")).toHaveLength(0);
  fireEvent.click(screen.getAllByRole("button", { name: C.unlink })[0]!);
  boundary.state.unlinkError = { code: "last_identity_error", status: 409 };
  click(C.confirmUnlink);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.lastIdentity,
  );
  boundary.state.unlinkError = null;
  click(C.confirmUnlink);
  await screen.findByText(C.lastIdentity);
  expect(boundary.state.identities).toHaveLength(1);
  expect(
    (screen.getByRole("button", { name: C.unlink }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("deletes only after retention notice and confirmation; cancel and payment failure preserve account", async () => {
  boundary = installBoundary(origin, true);
  await account();
  click(C.delete);
  await screen.findByText(C.retention);
  click(C.cancel);
  expect(calls("me", "DELETE")).toHaveLength(0);
  click(C.delete);
  boundary.state.deleteError = { code: "pending_payment_block", status: 409 };
  click(C.confirmDelete);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.pendingPayment,
  );
  expect(boundary.state.cookies.has("pax_session")).toBe(true);
  boundary.state.deleteError = null;
  click(C.confirmDelete);
  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/login"),
  );
  expect(calls("me", "DELETE")[1]!.body).toBeUndefined();
  expect(boundary.state.cookies.has("pax_session")).toBe(false);
});

it.each([false, true])(
  "logout confirmation/cancel clears browser and OTP state on failure=%s",
  async (failure) => {
    boundary = installBoundary(origin, true);
    await account();
    sessionStorage.setItem("pax:otp:login", "{}");
    click(C.logout);
    click(C.cancel);
    expect(calls("auth/logout")).toHaveLength(0);
    click(C.logout);
    if (failure)
      boundary.state.logoutError = { code: "unavailable", status: 503 };
    click(C.confirmLogout);
    await waitFor(() =>
      expect(boundary.state.cookies.has("pax_session")).toBe(false),
    );
    expect(sessionStorage.getItem("pax:otp:login")).toBeNull();
    expect(calls("auth/logout")[0]!.body).toEqual({
      refreshToken: "refresh-one",
    });
    if (failure)
      expect(await screen.findByRole("alert")).toHaveProperty(
        "textContent",
        C.unavailable,
      );
    else expect(navigation.router.replace).toHaveBeenCalledWith("/login");
  },
);

it("does not mistake identities-load failure for logout, and retries the actual BFF route", async () => {
  boundary = installBoundary(origin, true);
  boundary.state.identitiesError = { code: "unavailable", status: 503 };
  render(<AccountPage />);
  await screen.findByRole("alert");
  expect(navigation.router.replace).not.toHaveBeenCalled();
  boundary.state.identitiesError = null;
  click(C.retry);
  await screen.findByText("姓名: Tester");
});

it.each(["phone", "email"] as const)(
  "keeps %s link rejection recoverable and guards return cooldown",
  async (provider) => {
    boundary = installBoundary(origin, true);
    if (provider === "phone") boundary.state.identities[0]!.provider = "email";
    await account();
    change(
      C.link[provider],
      provider === "phone" ? "0900000001" : "pax@example.test",
    );
    click(C.link[provider]);
    await screen.findByLabelText(C.code);
    boundary.state.verifyError = { code: "conflict", status: 409 };
    await verify(C.verify);
    await screen.findByText(C.conflict);
    click(C.back);
    expect(
      (
        screen.getByRole("button", {
          name: C.link[provider],
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    click(C.link[provider]);
    expect(calls("auth/otp/request")).toHaveLength(1);
  },
);

it("does not reuse another account's pending contact challenge after account switch", async () => {
  boundary = installBoundary(origin, true);
  await account();
  click(C.verifyContact);
  await screen.findByLabelText(C.code);
  click(C.back);
  cleanup();
  boundary.state.account.drtsPassengerId = `drts_passenger_${secondUuid}`;
  await account();
  click(C.verifyContact);
  await screen.findByLabelText(C.code);
  expect(calls("auth/otp/request")).toHaveLength(2);
  expect(calls("auth/otp/request")[1]!.body).toEqual({
    provider: "phone",
    purpose: "verify_contact_phone",
    target: "0900000000",
  });
});

it("handles contact-verification failure and prevents duplicate pending sends", async () => {
  boundary = installBoundary(origin, true);
  await account();
  click(C.verifyContact);
  click(C.verifyContact);
  await screen.findByLabelText(C.code);
  expect(calls("auth/otp/request")).toHaveLength(1);
  boundary.state.verifyError = { code: "invalid_code", status: 400 };
  await verify(C.verify);
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    C.invalidCode,
  );
  expect(boundary.state.account.contactPhoneVerified).toBe(false);
});

it("redirects expired account sessions only after genuine 401/refresh failure", async () => {
  boundary = installBoundary(origin, true);
  boundary.state.readError = { code: "unauthorized", status: 401 };
  render(<AccountPage />);
  await waitFor(() =>
    expect(navigation.router.replace).toHaveBeenCalledWith("/login"),
  );
  expect(boundary.state.cookies.has("pax_session")).toBe(false);
});
