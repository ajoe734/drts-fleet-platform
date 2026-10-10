"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthProvider } from "@drts/contracts";
import { client } from "../../lib/auth/client";
import { useOtp, clearOtpState } from "../../lib/auth/use-otp";
import { navigateToProvider } from "../../lib/auth/navigation";
import { AUTH_COPY as C } from "../../../../packages/passenger-client/src/auth/copy";
import { authErrorCopy } from "../../../../packages/passenger-client/src/auth/state";
import { P5Card, P5Btn, P5 } from "../../components/auth/ui";
import { OtpPanel, inputStyle } from "../../components/auth/otp";
import { ConsentGate } from "../../components/auth/consent";

export default function LoginPage() {
  const router = useRouter();
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [providerState, setProviderState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [targets, setTargets] = useState({ phone: "", email: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const busy = useRef(false);
  const otp = useOtp("login", providers);
  const load = async () => {
    setProviderState("loading");
    try {
      setProviders((await client.getProviders()).providers);
      setProviderState("ready");
    } catch {
      setProviderState("error");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const oauth = async (provider: "google" | "facebook" | "line") => {
    if (busy.current || otp.pending || !providers.includes(provider)) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const response = await client.oauthStart({
        provider,
        purpose: "login",
        redirectUri: `${window.location.origin}/auth/callback/${provider}`,
      });
      navigateToProvider(response.authUrl);
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const exit = async () => {
    try {
      await client.logout();
    } catch {
      // The BFF clears cookies on failed logout as well.
    } finally {
      clearOtpState();
      setAuthenticated(false);
      router.replace("/login");
    }
  };
  if (authenticated)
    return (
      <div style={{ padding: 14 }}>
        <ConsentGate
          onComplete={() => router.replace("/")}
          onExit={() => void exit()}
        />
      </div>
    );
  if (otp.active)
    return (
      <div style={{ padding: 14 }}>
        <OtpPanel
          otp={otp}
          onSuccess={() => {
            clearOtpState();
            setAuthenticated(true);
          }}
        />
      </div>
    );
  return (
    <div style={{ padding: 14 }}>
      <P5Card title={C.loginTitle}>
        {providerState === "loading" && <p role="status">{C.loading}</p>}
        {providerState === "error" && (
          <>
            <p role="alert">{C.providersFailed}</p>
            <P5Btn onClick={() => void load()}>{C.retry}</P5Btn>
          </>
        )}
        {providerState === "ready" && providers.length === 0 && (
          <p role="status">{C.providersEmpty}</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(["phone", "email"] as const)
            .filter((provider) => providers.includes(provider))
            .map((provider) => {
              const command = {
                provider,
                purpose: "login" as const,
                target: targets[provider],
              };
              const cooldown = otp.countdownFor(command);
              return (
                <div
                  key={provider}
                  style={{
                    borderBottom: `1px solid ${P5.lineSoft}`,
                    paddingBottom: 14,
                  }}
                >
                  <label>
                    {provider === "phone" ? C.phone : C.email}
                    <input
                      aria-label={provider === "phone" ? C.phone : C.email}
                      type={provider === "phone" ? "tel" : "email"}
                      disabled={pending || otp.pending}
                      value={targets[provider]}
                      onChange={(e) =>
                        setTargets({ ...targets, [provider]: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </label>
                  <P5Btn
                    kind="primary"
                    disabled={
                      pending ||
                      otp.pending ||
                      !targets[provider].trim() ||
                      cooldown > 0
                    }
                    onClick={() => void otp.request(command)}
                  >
                    {C.login[provider]}
                  </P5Btn>
                  {cooldown > 0 && <p role="status">{C.cooldown(cooldown)}</p>}
                </div>
              );
            })}
          {(["google", "facebook", "line"] as const)
            .filter((provider) => providers.includes(provider))
            .map((provider) => (
              <P5Btn
                key={provider}
                disabled={pending || otp.pending}
                onClick={() => void oauth(provider)}
              >
                {C.login[provider]}
              </P5Btn>
            ))}
          {(error || otp.error) && (
            <p role="alert" style={{ color: P5.danger }}>
              {error || otp.error}
            </p>
          )}
          <p style={{ fontSize: 11, color: P5.mut, textAlign: "center" }}>
            {C.consentHint}
          </p>
        </div>
      </P5Card>
    </div>
  );
}
