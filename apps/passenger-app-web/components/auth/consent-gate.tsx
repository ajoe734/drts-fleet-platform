"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PassengerAccount } from "@drts/passenger-client";
import type { PassengerAuthClient } from "../../lib/auth/client";
import { clearOtpState } from "../../lib/auth/otp-state";
import { t } from "../../lib/auth/translations";
import { AuthScreen, AuthAlert, P5Btn, P5 } from "./ui";
import { isDemoMode } from "../../lib/demo/store";
import { DEMO_T } from "../../lib/demo/translations";
import { useReviewDemo } from "../review-demo/review-context";
import { t as reviewText } from "../review-demo/translations";

function legalConfig(review: boolean) {
  if (isDemoMode())
    return {
      termsUrl: "/demo/terms",
      privacyUrl: "/demo/privacy",
      termsVersion: "demo-terms-v1",
      privacyVersion: "demo-privacy-v1",
      ready: true,
      demo: true,
    };
  if (review)
    return {
      termsUrl: "/review/terms",
      privacyUrl: "/review/terms",
      termsVersion: "review-terms-v1",
      privacyVersion: "review-privacy-v1",
      ready: true,
      demo: false,
    };
  const termsUrl = process.env.NEXT_PUBLIC_TERMS_URL ?? "";
  const privacyUrl = process.env.NEXT_PUBLIC_PRIVACY_URL ?? "";
  const termsVersion = process.env.NEXT_PUBLIC_TERMS_VERSION ?? "";
  const privacyVersion = process.env.NEXT_PUBLIC_PRIVACY_VERSION ?? "";
  const safeUrl = (url: string) => {
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  };
  return {
    demo: false,
    termsUrl,
    privacyUrl,
    termsVersion,
    privacyVersion,
    ready:
      !!termsVersion &&
      !!privacyVersion &&
      safeUrl(termsUrl) &&
      safeUrl(privacyUrl),
  };
}
export function ConsentGate({
  client,
  onAccepted,
  onRefused,
}: {
  client: PassengerAuthClient;
  onAccepted: () => void;
  onRefused: () => void;
}) {
  const review = useReviewDemo();
  const [account, setAccount] = useState<PassengerAccount | null>(null);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const config = legalConfig(review);
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const result = await client.getAccount();
      setAccount(result);
      if (
        config.ready &&
        result.termsVersion === config.termsVersion &&
        result.privacyVersion === config.privacyVersion
      )
        onAccepted();
    } catch {
      setAccount(null);
      setError(t("consentReadFailed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [
    client,
    config.ready,
    config.termsVersion,
    config.privacyVersion,
    onAccepted,
  ]);
  useEffect(() => {
    void load();
  }, [load]);
  const submit = async () => {
    if (busy.current || !checked || !config.ready || !account) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const current = await client.getAccount();
      if (current.drtsPassengerId !== account.drtsPassengerId)
        throw new Error("Session changed");
      const response = await client.updateAccount({
        termsVersion: config.termsVersion,
        privacyVersion: config.privacyVersion,
      });
      if (
        response.account.termsVersion !== config.termsVersion ||
        response.account.privacyVersion !== config.privacyVersion ||
        response.account.drtsPassengerId !== account.drtsPassengerId
      )
        throw new Error("Consent not persisted");
      onAccepted();
    } catch {
      setError(t("consentWriteFailed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const refuse = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await client.logout();
      clearOtpState();
      onRefused();
    } catch {
      setError(t("failed"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <AuthScreen title={t("firstLogin")}>
      {config.demo && <AuthAlert kind="warn">{DEMO_T.consentNotice}</AuthAlert>}
      {review && (
        <AuthAlert kind="warn">{reviewText.ordinaryConsentNotice}</AuthAlert>
      )}
      <div style={{ fontSize: 16, fontWeight: 700 }}>{t("consentHeading")}</div>
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.6 }}>
        {t("consentIntro")}
      </div>
      {!config.ready && (
        <AuthAlert kind="warn">{t("legalUnavailable")}</AuthAlert>
      )}
      {error && <AuthAlert>{error}</AuthAlert>}
      {!account && (
        <P5Btn disabled={pending} onClick={load}>
          {pending ? t("load") : t("retry")}
        </P5Btn>
      )}
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          fontSize: 14,
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={pending || !account || !config.ready}
          onChange={(event) => setChecked(event.target.checked)}
          style={{ marginTop: 4 }}
        />
        <span>
          {t("consent")}{" "}
          {config.ready ? (
            <a
              href={config.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: P5.brand, textDecoration: "underline" }}
            >
              {t("terms")}
            </a>
          ) : (
            t("terms")
          )}{" "}
          {t("and")}{" "}
          {config.ready ? (
            <a
              href={config.privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: P5.brand, textDecoration: "underline" }}
            >
              {t("privacy")}
            </a>
          ) : (
            t("privacy")
          )}
        </span>
      </label>
      <P5Btn
        kind="primary"
        icon="check"
        disabled={pending || !checked || !account || !config.ready}
        onClick={submit}
      >
        {t("continue")}
      </P5Btn>
      <P5Btn kind="ghost" disabled={pending} onClick={refuse}>
        {t("refuse")}
      </P5Btn>
    </AuthScreen>
  );
}
