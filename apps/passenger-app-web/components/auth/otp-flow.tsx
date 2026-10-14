"use client";
import { useEffect, useRef, useState } from "react";
import { PassengerApiError } from "@drts/passenger-client";
import type { PassengerAuthClient } from "../../lib/auth/client";
import {
  normalizeTarget,
  otpKey,
  readOtp,
  saveOtp,
  authError,
  type OtpProvider,
  type OtpPurpose,
  type OtpState,
} from "../../lib/auth/otp-state";
import { t } from "../../lib/auth/translations";
import { AuthScreen, AuthAlert, P5Btn, P5, inputStyle } from "./ui";

export function OtpFlow({
  client,
  provider,
  purpose,
  subject = "anonymous",
  initialTarget = "",
  onBack,
  onSuccess,
}: {
  client: PassengerAuthClient;
  provider: OtpProvider;
  purpose: OtpPurpose;
  subject?: string;
  initialTarget?: string;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const key = otpKey(provider, purpose, subject);
  const [record, setRecord] = useState<OtpState | null>(() => readOtp(key));
  const [target, setTarget] = useState(
    () => initialTarget || readOtp(key)?.target || "",
  );
  const [sent, setSent] = useState(() => !!readOtp(key));
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const live = useRef(true);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  useEffect(() => {
    live.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live.current = false;
      clearInterval(timer);
    };
  }, []);
  const normalized = normalizeTarget(provider, target);
  const current =
    record?.target === normalized &&
    record.subject === subject &&
    record.purpose === purpose
      ? record
      : null;
  const countdown = current
    ? Math.max(0, Math.ceil((current.resendAt - now) / 1000))
    : 0;
  const expired = !!current && current.expiresAt <= now;
  const locked = !!current && current.attempts >= 5;
  const validTarget =
    provider === "phone"
      ? /^(09\d{8}|\+?[1-9]\d{7,14})$/.test(normalized)
      : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  const setSaved = (next: OtpState) => {
    setRecord(next);
    saveOtp(key, next);
  };
  const checkSubject = async () => {
    if (purpose === "login") return;
    const account = await client.getAccount();
    if (
      account.drtsPassengerId !== subject ||
      (purpose === "verify_contact_phone" &&
        normalizeTarget("phone", account.contactPhone ?? "") !== normalized)
    )
      throw new PassengerApiError(401, "unauthorized", "Session changed");
  };
  const request = async () => {
    if (
      pendingRef.current ||
      !validTarget ||
      (current && current.resendAt > Date.now())
    )
      return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await checkSubject();
      const result = await client.requestOtp({
        target: normalized,
        provider,
        purpose,
      });
      if (!live.current) return;
      if (!result.success || !result.challenge)
        throw new Error("Invalid challenge");
      setSaved({
        provider,
        purpose,
        target: normalized,
        challenge: result.challenge,
        resendAt: Date.now() + 60000,
        expiresAt: Date.now() + 300000,
        attempts: 0,
        subject,
      });
      setNow(Date.now());
      setCode("");
      setSent(true);
    } catch (err) {
      if (live.current) {
        setError(authError(err));
        if (
          err instanceof PassengerApiError &&
          err.code === "too_many_requests"
        ) {
          setSaved({
            provider,
            purpose,
            target: normalized,
            challenge: current?.challenge ?? "",
            resendAt: Date.now() + 60000,
            expiresAt: current?.expiresAt ?? 0,
            attempts: current?.attempts ?? 0,
            subject,
          });
          setNow(Date.now());
        }
      }
    } finally {
      pendingRef.current = false;
      if (live.current) setPending(false);
    }
  };
  const verify = async () => {
    if (
      pendingRef.current ||
      !current ||
      !/^\d{6}$/.test(code) ||
      current.expiresAt <= Date.now() ||
      current.attempts >= 5
    )
      return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await checkSubject();
      const result = await client.login({
        target: current.target,
        provider,
        code,
        challenge: current.challenge,
      });
      const expected =
        purpose === "login"
          ? "logged_in"
          : purpose === "link"
            ? "linked"
            : "verified_contact_phone";
      if (result.result !== expected) throw new Error("Unexpected OTP result");
      if (!live.current) return;
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* The consumed challenge cannot replay on the server. */
      }
      onSuccess();
    } catch (err) {
      if (live.current) {
        if (
          err instanceof PassengerApiError &&
          ["invalid_code", "challenge_locked"].includes(err.code)
        ) {
          const attempts =
            err.code === "challenge_locked" ? 5 : current.attempts + 1;
          setSaved({ ...current, attempts });
          setError(attempts >= 5 ? t("locked") : t("invalid"));
        } else setError(authError(err));
      }
    } finally {
      pendingRef.current = false;
      if (live.current) setPending(false);
    }
  };
  return (
    <AuthScreen
      title={
        sent
          ? t("codeTitle")
          : purpose === "verify_contact_phone"
            ? t("verifyPhone")
            : provider === "phone"
              ? t("phoneLogin")
              : t("emailLogin")
      }
    >
      {!sent ? (
        <>
          <label style={{ fontSize: 15, fontWeight: 700 }} htmlFor="otp-target">
            {provider === "phone" ? t("phonePrompt") : t("emailPrompt")}
          </label>
          <input
            id="otp-target"
            type={provider === "phone" ? "tel" : "email"}
            style={inputStyle}
            value={target}
            disabled={pending || purpose === "verify_contact_phone"}
            onChange={(event) => {
              setTarget(event.target.value);
              setRecord(
                readOtp(key, normalizeTarget(provider, event.target.value)),
              );
              setError("");
            }}
          />
          {error && <AuthAlert>{error}</AuthAlert>}
          <P5Btn
            kind="primary"
            disabled={pending || !validTarget || countdown > 0}
            onClick={request}
          >
            {countdown > 0 ? `${t("resend")} (${countdown}s)` : t("request")}
          </P5Btn>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15 }}>
            {t("codeSent")}{" "}
            <span
              style={{
                fontFamily: provider === "phone" ? P5.mono : "inherit",
                fontWeight: 700,
              }}
            >
              {current?.target}
            </span>
          </div>
          {(expired || locked || error) && (
            <AuthAlert kind={expired ? "warn" : "danger"}>
              {expired ? t("expired") : locked ? t("locked") : error}
              {!expired && current && current.attempts > 0 && !locked && (
                <div>
                  {t("attempts")}: {5 - current.attempts}
                </div>
              )}
            </AuthAlert>
          )}
          <div
            role="group"
            aria-label={t("codeLabel")}
            style={{ display: "flex", gap: 8 }}
          >
            {Array.from({ length: 6 }, (_, index) => (
              <input
                key={index}
                aria-label={`${t("codeLabel")} ${index + 1}`}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={6}
                value={code[index] ?? ""}
                disabled={pending || expired || locked}
                style={{
                  flex: 1,
                  minWidth: 0,
                  width: 0,
                  height: 50,
                  background: P5.surface,
                  border: `1px solid ${expired ? P5.warnBd : error ? P5.dangerBd : P5.line}`,
                  borderRadius: 8,
                  textAlign: "center",
                  fontSize: 24,
                  fontFamily: P5.mono,
                }}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, "");
                  setCode((previous) =>
                    digits.length > 1
                      ? digits.slice(0, 6)
                      : `${previous.slice(0, index)}${digits}${previous.slice(index + 1)}`,
                  );
                  if (digits.length === 1)
                    (
                      event.target.nextElementSibling as HTMLInputElement | null
                    )?.focus();
                }}
              />
            ))}
          </div>
          <P5Btn
            kind="ghost"
            disabled={pending || countdown > 0}
            onClick={request}
          >
            {countdown > 0 ? `${t("resend")} (${countdown}s)` : t("resend")}
          </P5Btn>
          <P5Btn
            kind="primary"
            disabled={pending || !/^\d{6}$/.test(code) || expired || locked}
            onClick={verify}
          >
            {t("verify")}
          </P5Btn>
        </>
      )}
      <P5Btn
        kind="ghost"
        disabled={pending}
        onClick={() => {
          if (pendingRef.current) return;
          if (sent) {
            setSent(false);
            setCode("");
            setError("");
          } else onBack();
        }}
      >
        {t("back")}
      </P5Btn>
    </AuthScreen>
  );
}
