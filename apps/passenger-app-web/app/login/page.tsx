"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthProvider } from "@drts/passenger-client";
import { createAuthClient } from "../../lib/auth/client";
import { redirectToProvider } from "../../lib/auth/navigation";
import { authError } from "../../lib/auth/otp-state";
import { providerLabel, t } from "../../lib/auth/translations";
import { AuthScreen, AuthAlert, P5Btn, P5 } from "../../components/auth/ui";
import { OtpFlow } from "../../components/auth/otp-flow";
import { ConsentGate } from "../../components/auth/consent-gate";

export default function LoginPage() {
  const router = useRouter();
  const [client] = useState(createAuthClient);
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<"phone" | "email" | null>(null);
  const [consent, setConsent] = useState(false);
  const [redirecting, setRedirecting] = useState<AuthProvider | null>(null);
  const busy = useRef(false);
  const load = useCallback(async () => {
    setError("");
    setLoaded(false);
    try {
      setProviders((await client.getProviders()).providers);
      setLoaded(true);
    } catch {
      setError(t("failed"));
    }
  }, [client]);
  useEffect(() => {
    void load();
  }, [load]);
  const accepted = useCallback(() => router.push("/"), [router]);
  const oauth = async (provider: "google" | "facebook" | "line") => {
    if (busy.current || !providers.includes(provider)) return;
    busy.current = true;
    setError("");
    setRedirecting(provider);
    try {
      const response = await client.oauthStart({
        provider,
        redirectUri: `${window.location.origin}/auth/callback/${provider}`,
        purpose: "login",
      });
      redirectToProvider(response.authUrl);
    } catch (err) {
      setError(authError(err));
      setRedirecting(null);
    } finally {
      busy.current = false;
    }
  };
  if (consent)
    return (
      <ConsentGate
        client={client}
        onAccepted={accepted}
        onRefused={() => {
          setConsent(false);
          setMethod(null);
        }}
      />
    );
  if (method)
    return (
      <OtpFlow
        key={method}
        client={client}
        provider={method}
        purpose="login"
        onBack={() => setMethod(null)}
        onSuccess={() => setConsent(true)}
      />
    );
  if (redirecting)
    return (
      <AuthScreen title={t("oauth")}>
        <div
          role="status"
          style={{ color: P5.mut, textAlign: "center", margin: "auto 0" }}
        >
          {t("redirect")} {providerLabel(redirecting)}...
        </div>
      </AuthScreen>
    );
  return (
    <AuthScreen title={t("login")} entry>
      {!loaded ? (
        <>
          <div role="status">{t("load")}</div>
          {error && (
            <>
              <AuthAlert>{error}</AuthAlert>
              <P5Btn onClick={load}>{t("retry")}</P5Btn>
            </>
          )}
        </>
      ) : providers.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            color: P5.mut,
            fontSize: 15,
            margin: "auto 0",
          }}
        >
          {t("unavailable")}
        </div>
      ) : (
        <>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            {t("welcome")}
          </div>
          {providers.includes("phone") && (
            <P5Btn
              kind="primary"
              icon="phone"
              onClick={() => setMethod("phone")}
            >
              {t("phoneLogin")}
            </P5Btn>
          )}
          {providers.includes("email") && (
            <P5Btn icon="doc" onClick={() => setMethod("email")}>
              {t("emailLogin")}
            </P5Btn>
          )}
          {providers.some((provider) =>
            ["google", "facebook", "line"].includes(provider),
          ) && (
            <div
              style={{
                margin: "16px 0",
                textAlign: "center",
                fontSize: 13,
                color: P5.mut,
              }}
            >
              {t("social")}
            </div>
          )}
          {(["google", "facebook", "line"] as const)
            .filter((provider) => providers.includes(provider))
            .map((provider) => (
              <P5Btn key={provider} onClick={() => oauth(provider)}>
                {providerLabel(provider)}
              </P5Btn>
            ))}
          {error && <AuthAlert>{error}</AuthAlert>}
        </>
      )}
    </AuthScreen>
  );
}
