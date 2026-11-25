// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PortalAccountSecurityPanel,
  PortalForgotPasswordForm,
  PortalInvitationPasswordForm,
  PortalPasswordLoginForm,
  PortalResetPasswordForm,
  PortalTotpSetupPanel,
} from "../../src/portal-auth";
import type { PortalAuthMessages } from "../../src/portal-auth.types";

const messages: PortalAuthMessages = {
  emailLabel: "Email",
  passwordLabel: "Password",
  signIn: "Sign in",
  signInWithGoogle: "Sign in with Google",
  forgotPassword: "Forgot password?",
  verificationToggleShow: "Use a verification code",
  verificationToggleHide: "Hide verification code",
  useAuthenticatorCode: "Authenticator app code",
  useRecoveryCode: "Use a recovery code",
  totpCodeLabel: "Authenticator code",
  totpCodeHint: "6-digit code from your authenticator app",
  recoveryCodeLabel: "Recovery code",
  recoveryCodeHint: "One of your one-time recovery codes",
  newPasswordLabel: "New password",
  confirmPasswordLabel: "Confirm password",
  passwordHint: "At least 8 characters",
  savePassword: "Save password",
  forgotTitle: "Forgot password",
  forgotDescription:
    "Enter your email and we will send a reset link if an account exists.",
  requestReset: "Send reset link",
  forgotAccepted: "If an account exists, a reset email has been sent.",
  resetTitle: "Reset password",
  resetDescription: "Choose a new password.",
  passwordMismatch: "Passwords do not match.",
  passwordSaved: "Your password has been saved.",
  busy: "Working...",
  genericError: "Something went wrong. Please try again.",
  backToLogin: "Back to login",
  totpEnrollTitle: "Set up two-factor authentication",
  totpEnrollDescription: "Use an authenticator app to generate codes.",
  startTotpEnrollment: "Start setup",
  manualSecretLabel: "Manual setup key",
  manualSecretHint: "Enter this text manually if you cannot scan a code.",
  otpauthUriLabel: "Setup link",
  otpauthUriHint: "Some authenticator apps can open this link directly.",
  confirmTotpCodeLabel: "Enter the 6-digit code",
  confirmTotp: "Confirm",
  totpConfirmed: "Two-factor authentication is now enabled.",
  recoveryCodesTitle: "Your recovery codes",
  recoveryCodesNotice: "Save these now. They will not be shown again.",
  copy: "Copy",
  copied: "Copied.",
  copyFailed: "Could not copy automatically; please copy manually.",
  download: "Download",
  dismissRecoveryCodes: "I have saved these codes",
  regenerateRecoveryCodes: "Regenerate recovery codes",
  sessionsTitle: "Active sessions",
  sessionsEmpty: "No active sessions.",
  currentSessionBadge: "This device",
  sessionRealmLabel: "Realm",
  sessionAuthTimeLabel: "Signed in",
  sessionMethodsLabel: "Method",
  revokeSession: "Sign out this device",
  revokeAllSessions: "Sign out of all devices",
  sessionRevoked: "Session signed out.",
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  delete (window as unknown as { location?: unknown }).location;
  (
    window as unknown as {
      location: { assign: (url: string) => void; reload: () => void };
    }
  ).location = {
    assign: vi.fn(),
    reload: vi.fn(),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PortalPasswordLoginForm", () => {
  it("submits email and password, and navigates to successHref on success", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValueOnce(jsonResponse({ authenticated: true }));

    render(
      <PortalPasswordLoginForm
        messages={messages}
        endpoint="/api/auth/tenant/password-login"
        forgotPasswordHref="/forgot-password"
        successHref="/"
      />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/auth/tenant/password-login");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: "user@example.com",
      password: "correct-password",
    });
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith("/"),
    );
  });

  it("reveals the verification section and preserves the password after a 401", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValueOnce(
      jsonResponse(
        {
          error: {
            code: "AUTHENTICATION_FAILED",
            message:
              "The email or password is incorrect, or the account is not available.",
          },
        },
        false,
        401,
      ),
    );

    render(
      <PortalPasswordLoginForm
        messages={messages}
        endpoint="/api/auth/tenant/password-login"
        forgotPasswordHref="/forgot-password"
        successHref="/"
      />,
    );

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(passwordInput, { target: { value: "my-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await screen.findByRole("alert");
    expect(passwordInput.value).toBe("my-password");
    expect(screen.getByLabelText("Authenticator code")).toBeTruthy();
  });

  it("sends totpCode when the authenticator option is used, and recoveryCode when switched", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValue(jsonResponse({ authenticated: true }));

    render(
      <PortalPasswordLoginForm
        messages={messages}
        endpoint="/api/auth/tenant/password-login"
        forgotPasswordHref="/forgot-password"
        successHref="/"
      />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "pw" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use a verification code" }),
    );
    fireEvent.change(screen.getByLabelText("Authenticator code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      email: "user@example.com",
      password: "pw",
      totpCode: "123456",
    });

    fireEvent.click(screen.getByRole("radio", { name: "Use a recovery code" }));
    fireEvent.change(screen.getByLabelText("Recovery code"), {
      target: { value: "AAAA-BBBB" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string),
    ).toEqual({
      email: "user@example.com",
      password: "pw",
      recoveryCode: "AAAA-BBBB",
    });
  });
});

describe("PortalForgotPasswordForm", () => {
  it("shows the same accepted message regardless of the response body", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValueOnce(jsonResponse({ accepted: true }));

    render(
      <PortalForgotPasswordForm
        messages={messages}
        endpoint="/api/auth/tenant/password-reset/request"
      />,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      messages.forgotAccepted,
    );
  });
});

describe("PortalResetPasswordForm", () => {
  it("blocks submission locally when the two passwords do not match", async () => {
    const fetchMock = vi.mocked(fetch);
    render(
      <PortalResetPasswordForm
        messages={messages}
        endpoint="/api/auth/tenant/password-reset/confirm"
        token="tok"
        successHref="/login"
      />,
    );

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      messages.passwordMismatch,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the saved message after a successful confirm", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValueOnce(
      jsonResponse({ password_reset: true, revoked_session_count: 2 }),
    );

    render(
      <PortalResetPasswordForm
        messages={messages}
        endpoint="/api/auth/tenant/password-reset/confirm"
        token="tok"
        successHref="/login"
      />,
    );
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    expect(await screen.findByText(messages.passwordSaved)).toBeTruthy();
    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      token: "tok",
      password: "new-password-1",
    });
  });
});

describe("PortalInvitationPasswordForm", () => {
  it("accepts the invitation with a password, then chains into password-login", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockReturnValueOnce(
        jsonResponse({ accepted: { user: { principalId: "p1" } } }),
      )
      .mockReturnValueOnce(jsonResponse({ authenticated: true }));

    render(
      <PortalInvitationPasswordForm
        messages={messages}
        endpoint="/api/auth/tenant/invitation/accept-with-password"
        loginEndpoint="/api/auth/tenant/password-login"
        token="invite-token"
        successHref="/"
      />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "/api/auth/tenant/invitation/accept-with-password",
    );
    expect(
      JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string),
    ).toEqual({
      invitationToken: "invite-token",
      password: "new-password-1",
    });
    expect(fetchMock.mock.calls[1]![0]).toBe("/api/auth/tenant/password-login");
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith("/"),
    );
  });

  it("does not call password-login when the accept step itself fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValueOnce(
      jsonResponse(
        { error: { code: "TENANT_INVITATION_ACCEPTANCE_DENIED" } },
        false,
        403,
      ),
    );

    render(
      <PortalInvitationPasswordForm
        messages={messages}
        endpoint="/api/auth/tenant/invitation/accept-with-password"
        loginEndpoint="/api/auth/tenant/password-login"
        token="invite-token"
        successHref="/"
      />,
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "new-password-1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    await screen.findByRole("alert");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("PortalTotpSetupPanel", () => {
  it("shows the manual secret and otpauth URI as selectable text, then the recovery codes once confirmed", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockReturnValueOnce(
        jsonResponse({
          otpauth_uri: "otpauth://totp/DRTS:user@example.com?secret=ABC",
          secret: "ABC123",
        }),
      )
      .mockReturnValueOnce(
        jsonResponse({ recovery_codes: ["code-1", "code-2"] }),
      );

    render(
      <PortalTotpSetupPanel
        messages={messages}
        enrollEndpoint="/api/auth/tenant/mfa/totp/enroll"
        confirmEndpoint="/api/auth/tenant/mfa/totp/confirm"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start setup" }));
    await screen.findByLabelText("Manual setup key");
    expect(
      (screen.getByLabelText("Manual setup key") as HTMLInputElement).value,
    ).toBe("ABC123");
    expect(
      (screen.getByLabelText("Setup link") as HTMLInputElement).value,
    ).toContain("otpauth://");

    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("code-1")).toBeTruthy();
    expect(screen.getByText("code-2")).toBeTruthy();
  });
});

describe("PortalAccountSecurityPanel", () => {
  it("lists sessions, marks the current one, and only offers revoke on the others", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockReturnValueOnce(
      jsonResponse([
        {
          session_id: "s1",
          realm: "tenant",
          auth_time: "2026-11-14T00:00:00Z",
          auth_methods: ["pwd", "otp"],
          is_current: true,
        },
        {
          session_id: "s2",
          realm: "tenant",
          auth_time: "2026-11-10T00:00:00Z",
          auth_methods: ["pwd"],
          is_current: false,
        },
      ]),
    );

    render(
      <PortalAccountSecurityPanel
        messages={messages}
        sessionsEndpoint="/api/auth/sessions"
        sessionRevokeBase="/api/auth/sessions"
        logoutAllEndpoint="/api/auth/logout-all"
        totpSetupHref="/account/security/totp"
      />,
    );

    await screen.findByText(/This device/);
    const revokeButtons = screen.getAllByRole("button", {
      name: "Sign out this device",
    });
    expect(revokeButtons).toHaveLength(1);
  });

  it("reports a failed session read, sign-out or sign-out-everywhere instead of claiming success", async () => {
    const fetchMock = vi.mocked(fetch);
    const list = [
      { session_id: "s1", realm: "agency", is_current: true },
      { session_id: "s2", realm: "agency", is_current: false },
    ];
    const denied = (message: string, status: number) =>
      jsonResponse({ error: { code: "DENIED", message } }, false, status);
    fetchMock
      .mockReturnValueOnce(jsonResponse({ data: list }))
      .mockReturnValueOnce(denied("This session is not yours.", 403))
      .mockReturnValueOnce(denied("Sign-out is unavailable.", 503));

    render(
      <PortalAccountSecurityPanel
        messages={messages}
        sessionsEndpoint="/api/auth/sessions"
        sessionRevokeBase="/api/auth/sessions"
        logoutAllEndpoint="/api/auth/logout-all"
        totpSetupHref="/account/security/totp"
      />,
    );

    await screen.findByText(/This device/);
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out this device" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This session is not yours.",
    );
    expect(screen.queryByText(messages.sessionRevoked)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: messages.revokeAllSessions }),
    );
    expect(await screen.findByText("Sign-out is unavailable.")).toBeTruthy();
  });

  it("does not present an unreadable session list as an empty one", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      jsonResponse(
        { error: { message: "Sessions are unavailable." } },
        false,
        503,
      ),
    );
    render(
      <PortalAccountSecurityPanel
        messages={messages}
        sessionsEndpoint="/api/auth/sessions"
        sessionRevokeBase="/api/auth/sessions"
        logoutAllEndpoint="/api/auth/logout-all"
        totpSetupHref="/account/security/totp"
      />,
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sessions are unavailable.",
    );
    expect(screen.queryByText(messages.sessionsEmpty)).toBeNull();
  });

  it("regenerates one-time recovery codes from the account-security panel, shows them once, and surfaces step-up/MFA errors", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockReturnValueOnce(
        jsonResponse({
          data: [
            {
              session_id: "s1",
              realm: "agency",
              auth_time: "2026-11-23T00:00:00Z",
              auth_methods: ["pwd", "otp"],
              is_current: true,
            },
          ],
        }),
      )
      .mockReturnValueOnce(
        jsonResponse({
          data: { recovery_codes: ["REGEN-0001", "REGEN-0002"] },
        }),
      )
      .mockReturnValueOnce(
        jsonResponse(
          {
            error: {
              code: "MFA_REQUIRED",
              message:
                "Trusted multi-factor authentication is required for this action.",
            },
          },
          false,
          403,
        ),
      );

    render(
      <PortalAccountSecurityPanel
        messages={messages}
        csrfToken="agency-csrf-tok"
        sessionsEndpoint="/api/auth/sessions"
        sessionRevokeBase="/api/auth/sessions"
        logoutAllEndpoint="/api/auth/logout-all"
        totpSetupHref="/account/security/totp"
        totpRegenerateRecoveryCodesEndpoint="/api/auth/agency/mfa/totp/recovery-codes/regenerate"
      />,
    );

    await screen.findByText(/This device/);
    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate recovery codes" }),
    );

    expect(await screen.findByText("REGEN-0001")).toBeTruthy();
    expect(screen.getByText("REGEN-0002")).toBeTruthy();
    expect(screen.getByText(messages.recoveryCodesNotice)).toBeTruthy();

    const [regenUrl, regenInit] = fetchMock.mock.calls[1]!;
    expect(regenUrl).toBe(
      "/api/auth/agency/mfa/totp/recovery-codes/regenerate",
    );
    expect((regenInit as RequestInit).method).toBe("POST");
    expect(
      (regenInit as RequestInit).headers as Record<string, string>,
    ).toMatchObject({
      "x-csrf-token": "agency-csrf-tok",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "I have saved these codes" }),
    );
    expect(screen.queryByText("REGEN-0001")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Regenerate recovery codes" }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Trusted multi-factor authentication is required for this action.",
    );
  });
});
