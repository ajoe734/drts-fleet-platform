"use client";

import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";

import type {
  PortalAccountSecurityPanelProps,
  PortalAuthBaseProps,
  PortalAuthMessages,
  PortalForgotPasswordFormProps,
  PortalInvitationPasswordFormProps,
  PortalPasswordLoginFormProps,
  PortalResetPasswordFormProps,
  PortalTotpSetupPanelProps,
} from "./portal-auth.types";

/**
 * PWD-LOGIN-009: shared, host-agnostic password/TOTP/account-security client
 * components (SA/SD §9). Each host app supplies its own BFF endpoint paths
 * and zh-TW/en copy; these components never read or set cookies themselves,
 * so the four portals' sessions stay isolated per host.
 *
 * apps/api wraps every JSON response (success and error) in a global
 * snake_case transform, so fields read from a fetch response body below use
 * snake_case even though the TS types elsewhere in the repo are camelCase.
 */

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

async function postJson(
  url: string,
  body: JsonRecord,
  csrfToken?: string,
): Promise<{ ok: boolean; status: number; data: JsonRecord | null }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data: record(data) };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

async function getJson(
  url: string,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function errorMessage(data: JsonRecord | null, fallback: string): string {
  const error = record(data?.error);
  const text = error?.message ?? data?.message;
  return typeof text === "string" && text.trim() ? text : fallback;
}

/** Label + accessible description, wired with htmlFor/id/aria-describedby so
 * the description never becomes part of the field's accessible name. */
function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}) {
  const inputId = useId();
  const hintId = useId();
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label htmlFor={inputId} style={{ fontSize: 13, fontWeight: 600 }}>
        {label}
      </label>
      {children({ inputId, describedBy: hint ? hintId : undefined })}
      {hint ? (
        <p id={hintId} style={{ fontSize: 12, margin: 0, opacity: 0.75 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" aria-live="polite" style={{ color: "#b91c1c", fontSize: 13 }}>
      {message}
    </div>
  );
}

const fieldInputStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #D0D5DD",
  fontSize: 14,
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 16px",
  borderRadius: 6,
  border: "none",
  fontWeight: 700,
  cursor: "pointer",
};

type VerificationMode = "none" | "totp" | "recovery";

/** The password-login + optional-MFA progressive-disclosure block (SA/SD §7, §9).
 * apps/api collapses "wrong password" and "MFA required" into the same 401
 * (see apps/api/src/modules/auth/auth.controller.ts `denyPasswordLogin()`), so
 * this cannot rely on a server signal to decide whether to show the code
 * field. It starts collapsed and auto-expands on any login failure without
 * clearing the password the user already typed. */
export function PortalPasswordLoginForm(props: PortalPasswordLoginFormProps) {
  const { messages: m, endpoint, forgotPasswordHref, successHref, csrfToken, children } = props;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationMode, setVerificationMode] = useState<VerificationMode>("totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body: JsonRecord = { email, password };
    if (verificationOpen && code.trim()) {
      if (verificationMode === "totp") body.totpCode = code.trim();
      else body.recoveryCode = code.trim();
    }
    const result = await postJson(endpoint, body, csrfToken);
    setBusy(false);
    if (result.ok) {
      window.location.assign(successHref);
      return;
    }
    setVerificationOpen(true);
    setError(errorMessage(result.data, m.genericError));
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
      <Field label={m.emailLabel}>
        {({ inputId }) => (
          <input
            id={inputId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldInputStyle}
          />
        )}
      </Field>
      <Field label={m.passwordLabel}>
        {({ inputId }) => (
          <input
            id={inputId}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={fieldInputStyle}
          />
        )}
      </Field>

      <button
        type="button"
        aria-expanded={verificationOpen}
        onClick={() => setVerificationOpen((open) => !open)}
        style={{ justifySelf: "start", background: "none", border: "none", padding: 0, textDecoration: "underline", cursor: "pointer", fontSize: 13 }}
      >
        {verificationOpen ? m.verificationToggleHide : m.verificationToggleShow}
      </button>

      {verificationOpen ? (
        <div style={{ display: "grid", gap: 10, paddingLeft: 4, borderLeft: "2px solid #E4E7EC" }}>
          <div role="group" style={{ display: "flex", gap: 12, fontSize: 13 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="verification-mode"
                checked={verificationMode === "totp"}
                onChange={() => setVerificationMode("totp")}
              />
              {m.useAuthenticatorCode}
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="radio"
                name="verification-mode"
                checked={verificationMode === "recovery"}
                onChange={() => setVerificationMode("recovery")}
              />
              {m.useRecoveryCode}
            </label>
          </div>
          <Field
            label={verificationMode === "totp" ? m.totpCodeLabel : m.recoveryCodeLabel}
            hint={verificationMode === "totp" ? m.totpCodeHint : m.recoveryCodeHint}
          >
            {({ inputId, describedBy }) => (
              <input
                id={inputId}
                type="text"
                inputMode={verificationMode === "totp" ? "numeric" : "text"}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                aria-describedby={describedBy}
                style={fieldInputStyle}
              />
            )}
          </Field>
        </div>
      ) : null}

      <ErrorNotice message={error} />

      <button type="submit" disabled={busy} style={primaryButtonStyle}>
        {busy ? m.busy : m.signIn}
      </button>

      {children}

      <a href={forgotPasswordHref} style={{ fontSize: 13 }}>
        {m.forgotPassword}
      </a>
    </form>
  );
}

function NewPasswordFields({
  m,
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  m: PortalAuthMessages;
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
}) {
  return (
    <>
      <Field label={m.newPasswordLabel} hint={m.passwordHint}>
        {({ inputId, describedBy }) => (
          <input
            id={inputId}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            aria-describedby={describedBy}
            style={fieldInputStyle}
          />
        )}
      </Field>
      <Field label={m.confirmPasswordLabel}>
        {({ inputId }) => (
          <input
            id={inputId}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => onConfirm(e.target.value)}
            style={fieldInputStyle}
          />
        )}
      </Field>
    </>
  );
}

/** Invitation accept-with-password (SA/SD §5). The accept endpoint issues no
 * session, so a successful accept immediately chains into password-login. */
export function PortalInvitationPasswordForm(props: PortalInvitationPasswordFormProps) {
  const { messages: m, endpoint, loginEndpoint, token, successHref } = props;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError(m.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    const accept = await postJson(endpoint, { invitationToken: token, password });
    if (!accept.ok) {
      setBusy(false);
      setError(errorMessage(accept.data, m.genericError));
      return;
    }
    const login = await postJson(loginEndpoint, { email, password });
    setBusy(false);
    if (login.ok) {
      window.location.assign(successHref);
      return;
    }
    setError(errorMessage(login.data, m.genericError));
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
      <Field label={m.emailLabel}>
        {({ inputId }) => (
          <input
            id={inputId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldInputStyle}
          />
        )}
      </Field>
      <NewPasswordFields m={m} password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      <ErrorNotice message={error} />
      <button type="submit" disabled={busy} style={primaryButtonStyle}>
        {busy ? m.busy : m.savePassword}
      </button>
    </form>
  );
}

/** Reset-password confirm (SA/SD §6): new password + the email-delivered token. */
export function PortalResetPasswordForm(props: PortalResetPasswordFormProps) {
  const { messages: m, endpoint, token, successHref } = props;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirm) {
      setError(m.passwordMismatch);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await postJson(endpoint, { token, password });
    setBusy(false);
    if (result.ok) {
      setDone(true);
      return;
    }
    setError(errorMessage(result.data, m.genericError));
  }

  if (done) {
    return (
      <div role="status" style={{ display: "grid", gap: 12 }}>
        <p>{m.passwordSaved}</p>
        <a href={successHref}>{m.backToLogin}</a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
      <NewPasswordFields m={m} password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
      <ErrorNotice message={error} />
      <button type="submit" disabled={busy} style={primaryButtonStyle}>
        {busy ? m.busy : m.savePassword}
      </button>
    </form>
  );
}

/** Forgot-password request (SA/SD §6): always shows the same accepted copy,
 * regardless of whether the account exists, matching the backend's design. */
export function PortalForgotPasswordForm(props: PortalForgotPasswordFormProps) {
  const { messages: m, endpoint, csrfToken } = props;
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    await postJson(endpoint, { email }, csrfToken);
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return <p role="status">{m.forgotAccepted}</p>;
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 16 }}>
      <p>{m.forgotDescription}</p>
      <Field label={m.emailLabel}>
        {({ inputId }) => (
          <input
            id={inputId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldInputStyle}
          />
        )}
      </Field>
      <button type="submit" disabled={busy} style={primaryButtonStyle}>
        {busy ? m.busy : m.requestReset}
      </button>
    </form>
  );
}

type Enrollment = { otpauthUri: string; secret: string };

/** TOTP enroll + confirm (SA/SD §7). No QR image is rendered: the manual
 * secret and the raw otpauth URI are shown as selectable text, which is both
 * the accessible fallback SA/SD requires and avoids adding an npm dependency
 * outside this task's write_scopes. */
export function PortalTotpSetupPanel(props: PortalTotpSetupPanelProps) {
  const { messages: m, enrollEndpoint, confirmEndpoint, csrfToken, onEnrolled } = props;
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function startEnrollment() {
    setBusy(true);
    setError(null);
    const result = await postJson(enrollEndpoint, {}, csrfToken);
    setBusy(false);
    const otpauthUri = result.data?.otpauth_uri;
    const secret = result.data?.secret;
    if (!result.ok || typeof otpauthUri !== "string" || typeof secret !== "string") {
      setError(errorMessage(result.data, m.genericError));
      return;
    }
    setEnrollment({ otpauthUri, secret });
  }

  async function confirmEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await postJson(confirmEndpoint, { code }, csrfToken);
    setBusy(false);
    const codes = result.data?.recovery_codes;
    if (!result.ok || !Array.isArray(codes)) {
      setError(errorMessage(result.data, m.genericError));
      return;
    }
    setRecoveryCodes(codes.filter((entry): entry is string => typeof entry === "string"));
    onEnrolled?.();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(m.copied);
    } catch {
      setCopyStatus(m.copyFailed);
    }
  }

  function download(text: string, filename: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (recoveryCodes) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h2>{m.recoveryCodesTitle}</h2>
        <p role="alert">{m.recoveryCodesNotice}</p>
        <ul style={{ fontFamily: "monospace", fontSize: 14 }}>
          {recoveryCodes.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => copy(recoveryCodes.join("\n"))} style={primaryButtonStyle}>
            {m.copy}
          </button>
          <button
            type="button"
            onClick={() => download(recoveryCodes.join("\n"), "drts-recovery-codes.txt")}
            style={primaryButtonStyle}
          >
            {m.download}
          </button>
        </div>
        {copyStatus ? <p role="status">{copyStatus}</p> : null}
        <button type="button" onClick={() => setRecoveryCodes(null)} style={{ justifySelf: "start" }}>
          {m.dismissRecoveryCodes}
        </button>
      </div>
    );
  }

  if (!enrollment) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <h2>{m.totpEnrollTitle}</h2>
        <p>{m.totpEnrollDescription}</p>
        <ErrorNotice message={error} />
        <button type="button" disabled={busy} onClick={startEnrollment} style={primaryButtonStyle}>
          {busy ? m.busy : m.startTotpEnrollment}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={confirmEnrollment} style={{ display: "grid", gap: 16 }}>
      <h2>{m.totpEnrollTitle}</h2>
      <Field label={m.manualSecretLabel} hint={m.manualSecretHint}>
        {({ inputId, describedBy }) => (
          <input id={inputId} type="text" readOnly value={enrollment.secret} aria-describedby={describedBy} style={fieldInputStyle} />
        )}
      </Field>
      <Field label={m.otpauthUriLabel} hint={m.otpauthUriHint}>
        {({ inputId, describedBy }) => (
          <input id={inputId} type="text" readOnly value={enrollment.otpauthUri} aria-describedby={describedBy} style={fieldInputStyle} />
        )}
      </Field>
      <Field label={m.confirmTotpCodeLabel}>
        {({ inputId }) => (
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={fieldInputStyle}
          />
        )}
      </Field>
      <ErrorNotice message={error} />
      <button type="submit" disabled={busy} style={primaryButtonStyle}>
        {busy ? m.busy : m.confirmTotp}
      </button>
    </form>
  );
}

type SessionSummary = {
  sessionId: string;
  realm: string;
  authTime: string | null;
  authMethods: string[];
  isCurrent: boolean;
};

function readSessions(value: unknown): SessionSummary[] {
  if (!Array.isArray(value)) return [];
  const sessions: SessionSummary[] = [];
  for (const entry of value) {
    const row = record(entry);
    if (!row || typeof row.session_id !== "string") continue;
    sessions.push({
      sessionId: row.session_id,
      realm: typeof row.realm === "string" ? row.realm : "",
      authTime: typeof row.auth_time === "string" ? row.auth_time : null,
      authMethods: Array.isArray(row.auth_methods)
        ? row.auth_methods.filter((m): m is string => typeof m === "string")
        : [],
      isCurrent: row.is_current === true,
    });
  }
  return sessions;
}

/** Self-service session inventory + logout-all (SA/SD §9). Does not include
 * "add a password" / "change password without a reset token" / "regenerate
 * recovery codes": no apps/api endpoint exists for any of those yet. */
export function PortalAccountSecurityPanel(props: PortalAccountSecurityPanelProps) {
  const { messages: m, sessionsEndpoint, sessionRevokeBase, logoutAllEndpoint, totpSetupHref, csrfToken } = props;
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function load() {
    const result = await getJson(sessionsEndpoint);
    setSessions(readSessions(result.data));
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(sessionId: string) {
    await postJson(`${sessionRevokeBase}/${encodeURIComponent(sessionId)}/revoke`, {}, csrfToken);
    setStatus(m.sessionRevoked);
    await load();
  }

  async function revokeAll() {
    await postJson(logoutAllEndpoint, {}, csrfToken);
    window.location.reload();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section style={{ display: "grid", gap: 8 }}>
        <a href={totpSetupHref} style={primaryButtonStyle}>
          {m.totpEnrollTitle}
        </a>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2>{m.sessionsTitle}</h2>
        {status ? <p role="status">{status}</p> : null}
        {sessions === null ? null : sessions.length === 0 ? (
          <p>{m.sessionsEmpty}</p>
        ) : (
          <ul style={{ display: "grid", gap: 10, listStyle: "none", padding: 0 }}>
            {sessions.map((session) => (
              <li
                key={session.sessionId}
                style={{ border: "1px solid #E4E7EC", borderRadius: 8, padding: 12, display: "grid", gap: 4 }}
              >
                <div>
                  {m.sessionRealmLabel}: {session.realm}
                  {session.isCurrent ? ` · ${m.currentSessionBadge}` : ""}
                </div>
                {session.authTime ? (
                  <div>
                    {m.sessionAuthTimeLabel}: {session.authTime}
                  </div>
                ) : null}
                {session.authMethods.length > 0 ? (
                  <div>
                    {m.sessionMethodsLabel}: {session.authMethods.join(", ")}
                  </div>
                ) : null}
                {!session.isCurrent ? (
                  <button type="button" onClick={() => revoke(session.sessionId)} style={{ justifySelf: "start" }}>
                    {m.revokeSession}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={revokeAll} style={primaryButtonStyle}>
          {m.revokeAllSessions}
        </button>
      </section>
    </div>
  );
}

export type { PortalAuthBaseProps };
