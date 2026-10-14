"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PassengerApiError,
  type PassengerAccount,
  type PassengerLoginIdentity,
  type AuthProvider,
} from "@drts/passenger-client";
import { createAuthClient } from "../../lib/auth/client";
import { redirectToProvider } from "../../lib/auth/navigation";
import {
  clearOtpState,
  authError,
  type OtpProvider,
  type OtpPurpose,
} from "../../lib/auth/otp-state";
import { t, providerLabel } from "../../lib/auth/translations";
import {
  AuthScreen,
  AuthAlert,
  P5Btn,
  P5Card,
  P5Icon,
  P5,
  inputStyle,
} from "../../components/auth/ui";
import { OtpFlow } from "../../components/auth/otp-flow";

type Screen = "account" | "identities" | "logout" | "delete" | "deleted";
export default function AccountPage() {
  const router = useRouter();
  const [client] = useState(createAuthClient);
  const [account, setAccount] = useState<PassengerAccount | null>(null);
  const [identities, setIdentities] = useState<PassengerLoginIdentity[]>([]);
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [screen, setScreen] = useState<Screen>("account");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState<{
    provider: OtpProvider;
    purpose: OtpPurpose;
  } | null>(null);
  const [redirecting, setRedirecting] = useState<string | null>(null);
  const load = useCallback(async () => {
    const result = await client.getAccount();
    const [ids, enabled] = await Promise.all([
      client.getIdentities(),
      client.getProviders(),
    ]);
    setAccount(result);
    setIdentities(ids.identities);
    setProviders(enabled.providers);
    setName(result.displayName ?? "");
    setPhone(result.contactPhone ?? "");
  }, [client]);
  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      setError("");
      try {
        await action();
      } catch (err) {
        setError(authError(err));
        if (err instanceof PassengerApiError && err.status === 401) {
          clearOtpState();
          setOtp(null);
          router.push("/login");
        }
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [router],
  );
  useEffect(() => {
    void run(load);
  }, [run, load]);
  const checkSubject = async () => {
    const current = await client.getAccount();
    if (current.drtsPassengerId !== account?.drtsPassengerId) {
      clearOtpState();
      throw new PassengerApiError(401, "unauthorized", "Session changed");
    }
  };
  const linkOAuth = (provider: "google" | "facebook" | "line") =>
    run(async () => {
      if (
        !providers.includes(provider) ||
        identities.some((identity) => identity.provider === provider)
      )
        return;
      await checkSubject();
      setRedirecting(providerLabel(provider));
      try {
        const response = await client.oauthStart({
          provider,
          redirectUri: `${window.location.origin}/auth/callback/${provider}`,
          purpose: "link",
        });
        redirectToProvider(response.authUrl);
      } catch (err) {
        setRedirecting(null);
        throw err;
      }
    });
  const title =
    screen === "identities"
      ? t("manage")
      : screen === "logout"
        ? t("logoutTitle")
        : screen === "delete"
          ? t("delete")
          : screen === "deleted"
            ? t("deleted")
            : t("account");
  if (otp && account)
    return (
      <OtpFlow
        key={`${account.drtsPassengerId}.${otp.provider}.${otp.purpose}`}
        client={client}
        provider={otp.provider}
        purpose={otp.purpose}
        subject={account.drtsPassengerId}
        initialTarget={
          otp.purpose === "verify_contact_phone"
            ? (account.contactPhone ?? "")
            : ""
        }
        onBack={() => setOtp(null)}
        onSuccess={() => {
          setOtp(null);
          void run(load);
        }}
      />
    );
  if (redirecting)
    return (
      <AuthScreen title={t("oauth")}>
        <div role="status">
          {t("redirect")} {redirecting}...
        </div>
      </AuthScreen>
    );
  if (!account && screen !== "deleted")
    return (
      <AuthScreen title={title}>
        {error ? (
          <>
            <AuthAlert>{error}</AuthAlert>
            <P5Btn disabled={pending} onClick={() => run(load)}>
              {t("retry")}
            </P5Btn>
          </>
        ) : (
          <div role="status">{t("load")}</div>
        )}
      </AuthScreen>
    );
  if (screen === "deleted")
    return (
      <AuthScreen title={title}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            background: P5.okBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: P5.ok,
            margin: "16px auto",
          }}
        >
          <P5Icon name="check" size={32} />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}>
          {t("deletedSuccess")}
        </div>
        <P5Btn kind="primary" onClick={() => router.push("/")}>
          {t("home")}
        </P5Btn>
      </AuthScreen>
    );
  if (screen === "logout" || screen === "delete")
    return (
      <AuthScreen title={title}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: screen === "delete" ? P5.danger : P5.ink,
          }}
        >
          {screen === "delete" ? t("deletePrompt") : t("logoutPrompt")}
        </div>
        {screen === "delete" && (
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <p>{t("deleteWarning")}</p>
            <p style={{ color: P5.mut }}>{t("retained")}</p>
          </div>
        )}
        {error && <AuthAlert>{error}</AuthAlert>}
        {error === t("debt") && (
          <P5Btn onClick={() => router.push("/account/payment-methods")}>
            {t("payments")}
          </P5Btn>
        )}
        <div style={{ flex: 1 }} />
        <P5Btn
          kind="ghost"
          disabled={pending}
          onClick={() => {
            setScreen("account");
            setError("");
          }}
        >
          {t("cancel")}
        </P5Btn>
        <P5Btn
          kind="primary"
          danger
          disabled={pending}
          onClick={() =>
            run(async () => {
              if (screen === "logout") {
                await client.logout();
                clearOtpState();
                router.push("/login");
              } else {
                await checkSubject();
                const result = await client.deleteAccount();
                if (!result.success) throw new Error("Deletion failed");
                clearOtpState();
                setAccount(null);
                setScreen("deleted");
              }
            })
          }
        >
          {screen === "delete" ? t("deleteConfirm") : t("logout")}
        </P5Btn>
      </AuthScreen>
    );
  const boundProviders = identities.map((identity) => identity.provider);
  return (
    <AuthScreen title={title} account>
      {error && (
        <div style={{ margin: "0 14px" }}>
          <AuthAlert kind={error === t("lastIdentity") ? "warn" : "danger"}>
            {error}
          </AuthAlert>
        </div>
      )}
      {screen === "identities" ? (
        <>
          <P5Card title={t("bound")}>
            {identities.map((identity) => (
              <div
                key={identity.identityId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: `1px solid ${P5.line}`,
                }}
              >
                <span>{providerLabel(identity.provider)}</span>
                <button
                  type="button"
                  style={{
                    background: "transparent",
                    color: P5.danger,
                    border: `1px solid ${P5.dangerBd}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontFamily: "inherit",
                  }}
                  disabled={pending}
                  onClick={() => {
                    if (identities.length <= 1) {
                      setError(t("lastIdentity"));
                      return;
                    }
                    void run(async () => {
                      await checkSubject();
                      await client.unlinkIdentity({
                        identityId: identity.identityId,
                      });
                      await load();
                    });
                  }}
                >
                  {t("unlink")}
                </button>
              </div>
            ))}
          </P5Card>
          <P5Card title={t("add")}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: 8,
              }}
            >
              {providers
                .filter((provider) => !boundProviders.includes(provider))
                .map((provider) => (
                  <P5Btn
                    key={provider}
                    disabled={pending}
                    onClick={() => {
                      if (provider === "phone" || provider === "email")
                        setOtp({ provider, purpose: "link" });
                      else void linkOAuth(provider);
                    }}
                  >
                    {t("link")} {providerLabel(provider)}
                  </P5Btn>
                ))}
            </div>
          </P5Card>
          <div style={{ margin: "0 14px" }}>
            <P5Btn
              disabled={pending}
              onClick={() => {
                setError("");
                setScreen("account");
              }}
            >
              {t("back")}
            </P5Btn>
          </div>
        </>
      ) : (
        <>
          <P5Card title={t("profile")}>
            {editing ? (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <label htmlFor="profile-name">{t("name")}</label>
                <input
                  id="profile-name"
                  style={inputStyle}
                  value={name}
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
                <label htmlFor="profile-phone">{t("contactPhone")}</label>
                <input
                  id="profile-phone"
                  type="tel"
                  style={inputStyle}
                  value={phone}
                  disabled={pending}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <P5Btn
                  kind="primary"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      await checkSubject();
                      await client.updateAccount({
                        displayName: name,
                        contactPhone: phone,
                      });
                      clearOtpState();
                      await load();
                      setEditing(false);
                    })
                  }
                >
                  {t("save")}
                </P5Btn>
                <P5Btn
                  disabled={pending}
                  onClick={() => {
                    setEditing(false);
                    setName(account!.displayName ?? "");
                    setPhone(account!.contactPhone ?? "");
                  }}
                >
                  {t("cancel")}
                </P5Btn>
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                    borderBottom: `1px solid ${P5.line}`,
                  }}
                >
                  <span style={{ color: P5.mut }}>{t("name")}</span>
                  <span>{account!.displayName || t("unset")}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 0",
                  }}
                >
                  <span style={{ color: P5.mut }}>{t("contactPhone")}</span>
                  <span style={{ fontFamily: P5.mono }}>
                    {account!.contactPhone || t("unset")}{" "}
                    <span
                      style={{
                        fontSize: 12,
                        color: account!.contactPhoneVerified ? P5.ok : P5.warn,
                      }}
                    >
                      {account!.contactPhoneVerified
                        ? t("verified")
                        : t("unverified")}
                    </span>
                  </span>
                </div>
                {providers.includes("phone") &&
                  account!.contactPhone &&
                  !account!.contactPhoneVerified && (
                    <P5Btn
                      disabled={pending}
                      onClick={() =>
                        setOtp({
                          provider: "phone",
                          purpose: "verify_contact_phone",
                        })
                      }
                    >
                      {t("verifyPhone")}
                    </P5Btn>
                  )}
                <P5Btn disabled={pending} onClick={() => setEditing(true)}>
                  {t("edit")}
                </P5Btn>
              </>
            )}
          </P5Card>
          <div
            style={{
              margin: "0 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <P5Btn onClick={() => router.push("/account/payment-methods")}>
              {t("payments")}
            </P5Btn>
            <P5Btn icon="clock" onClick={() => router.push("/rides")}>
              {t("history")}
            </P5Btn>
            <P5Btn
              icon="shield"
              disabled={pending}
              onClick={() => {
                setError("");
                setScreen("identities");
              }}
            >
              {t("manage")}
            </P5Btn>
          </div>
          <div
            style={{
              margin: "auto 14px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <P5Btn
              kind="ghost"
              danger
              disabled={pending}
              onClick={() => {
                setError("");
                setScreen("logout");
              }}
            >
              {t("logout")}
            </P5Btn>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError("");
                setScreen("delete");
              }}
              style={{
                background: "transparent",
                border: "none",
                color: P5.mut,
                textDecoration: "underline",
                fontSize: 12,
              }}
            >
              {t("delete")}
            </button>
          </div>
        </>
      )}
    </AuthScreen>
  );
}
