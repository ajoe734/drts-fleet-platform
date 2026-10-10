"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AuthProvider,
  PassengerAccount,
  PassengerLoginIdentity,
} from "@drts/contracts";
import { client, PassengerAuthError } from "../../lib/auth/client";
import { useOtp, clearOtpState } from "../../lib/auth/use-otp";
import { consentPolicy } from "../../lib/auth/policy";
import { navigateToProvider } from "../../lib/auth/navigation";
import { AUTH_COPY as C } from "../../../../packages/passenger-client/src/auth/copy";
import {
  authErrorCopy,
  consentDecision,
} from "../../../../packages/passenger-client/src/auth/state";
import { P5Card, P5Btn, P5 } from "../../components/auth/ui";
import { OtpPanel, inputStyle } from "../../components/auth/otp";
import { ConsentGate } from "../../components/auth/consent";

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<PassengerAccount | null>(null);
  const [identities, setIdentities] = useState<PassengerLoginIdentity[]>([]);
  const [providers, setProviders] = useState<AuthProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [targets, setTargets] = useState({ phone: "", email: "" });
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "delete" | "logout" | PassengerLoginIdentity | null
  >(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const otp = useOtp(
    account ? `account:${account.drtsPassengerId}` : "account:pending",
    account ? providers : [],
  );
  const load = async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const acc = await client.getAccount();
      const [ids, configured] = await Promise.all([
        client.getIdentities(),
        client.getProviders(),
      ]);
      if (current !== generation.current) return;
      setAccount(acc);
      setIdentities(ids.identities);
      setProviders(configured.providers);
      setName(acc.displayName ?? "");
      setPhone(acc.contactPhone ?? "");
    } catch (err) {
      if (current !== generation.current) return;
      setError(authErrorCopy(err));
      if (err instanceof PassengerAuthError && err.status === 401) {
        clearOtpState();
        setAccount(null);
        router.replace("/login");
      }
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, []);
  const action = async (
    operation: () => Promise<unknown>,
    onSuccess: () => Promise<void> | void,
  ) => {
    if (busy.current || otp.pending || !account) return;
    busy.current = true;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await operation();
      await onSuccess();
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  const oauth = (provider: "google" | "facebook" | "line") => {
    if (
      !providers.includes(provider) ||
      identities.some((id) => id.provider === provider)
    )
      return;
    void action(
      async () => {
        const res = await client.oauthStart({
          provider,
          purpose: "link",
          redirectUri: `${window.location.origin}/auth/callback/${provider}`,
        });
        navigateToProvider(res.authUrl);
      },
      () => {},
    );
  };
  const logout = async () => {
    if (busy.current || otp.pending) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await client.logout();
      router.replace("/login");
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      clearOtpState();
      setAccount(null);
      setConfirmation(null);
      setPending(false);
      busy.current = false;
    }
  };
  const leaveConsent = async () => {
    try {
      await client.logout();
    } catch {
      // The BFF clears cookies on failed logout as well.
    } finally {
      clearOtpState();
      router.replace("/login");
    }
  };
  if (loading)
    return (
      <div style={{ padding: 14 }} role="status">
        {C.loadingAccount}
      </div>
    );
  if (!account)
    return (
      <div style={{ padding: 14 }}>
        <P5Card title={C.accountTitle}>
          <p role="alert">{error || C.accountFailed}</p>
          <P5Btn onClick={() => void load()}>{C.retry}</P5Btn>
          <P5Btn kind="ghost" onClick={() => router.replace("/login")}>
            {C.backLogin}
          </P5Btn>
        </P5Card>
      </div>
    );
  if (consentDecision(account, consentPolicy()) !== "accepted")
    return (
      <div style={{ padding: 14 }}>
        <ConsentGate
          onComplete={() => void load()}
          onExit={() => void leaveConsent()}
        />
      </div>
    );
  if (otp.active)
    return (
      <div style={{ padding: 14 }}>
        <OtpPanel otp={otp} onSuccess={load} />
      </div>
    );
  const disabled = pending || otp.pending;
  return (
    <div
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <P5Card title={C.profile}>
        {editing ? (
          <>
            <label>
              {C.name}
              <input
                aria-label={C.name}
                value={name}
                disabled={disabled}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label>
              {C.contactPhone}
              <input
                aria-label={C.contactPhone}
                type="tel"
                value={phone}
                disabled={disabled}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
              />
            </label>
            <P5Btn
              kind="primary"
              disabled={disabled}
              onClick={() =>
                void action(
                  () =>
                    client.updateAccount({
                      displayName: name,
                      ...(phone !== (account.contactPhone ?? "")
                        ? { contactPhone: phone }
                        : {}),
                    }),
                  async () => {
                    setEditing(false);
                    await load();
                    setNotice(C.saved);
                  },
                )
              }
            >
              {C.save}
            </P5Btn>
            <P5Btn
              kind="ghost"
              disabled={disabled}
              onClick={() => {
                setName(account.displayName ?? "");
                setPhone(account.contactPhone ?? "");
                setEditing(false);
              }}
            >
              {C.cancel}
            </P5Btn>
          </>
        ) : (
          <>
            <div
              style={{
                padding: "8px 0",
                borderBottom: `1px solid ${P5.lineSoft}`,
              }}
            >
              {C.name}: {account.displayName}
            </div>
            <div
              style={{
                padding: "8px 0",
                borderBottom: `1px solid ${P5.lineSoft}`,
              }}
            >
              {C.contactPhone}: {account.contactPhone} (
              {account.contactPhoneVerified ? C.verified : C.unverified})
            </div>
            <P5Btn
              kind="ghost"
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              {C.edit}
            </P5Btn>
            {providers.includes("phone") &&
              !account.contactPhoneVerified &&
              account.contactPhone && (
                <P5Btn
                  disabled={
                    disabled ||
                    otp.countdownFor({
                      provider: "phone",
                      purpose: "verify_contact_phone",
                      target: account.contactPhone,
                    }) > 0
                  }
                  onClick={() =>
                    void otp.request({
                      provider: "phone",
                      purpose: "verify_contact_phone",
                      target: account.contactPhone!,
                    })
                  }
                >
                  {C.verifyContact}
                </P5Btn>
              )}
          </>
        )}
      </P5Card>
      <P5Card title={C.identities}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {identities.map((identity) => (
            <div
              key={identity.identityId}
              style={{
                borderBottom: `1px solid ${P5.lineSoft}`,
                paddingBottom: 8,
              }}
            >
              <span>
                {identity.provider}: {identity.subject}
              </span>
              <P5Btn
                kind="ghost"
                danger
                disabled={disabled || identities.length <= 1}
                onClick={() => setConfirmation(identity)}
              >
                {C.unlink}
              </P5Btn>
            </div>
          ))}
          {identities.length <= 1 && <p>{C.lastIdentity}</p>}
          {(["phone", "email"] as const)
            .filter(
              (provider) =>
                providers.includes(provider) &&
                !identities.some((id) => id.provider === provider),
            )
            .map((provider) => {
              const command = {
                provider,
                purpose: "link" as const,
                target: targets[provider],
              };
              const countdown = otp.countdownFor(command);
              return (
                <div key={provider}>
                  <label>
                    {C.link[provider]}
                    <input
                      aria-label={C.link[provider]}
                      type={provider === "phone" ? "tel" : "email"}
                      value={targets[provider]}
                      disabled={disabled}
                      onChange={(e) =>
                        setTargets({ ...targets, [provider]: e.target.value })
                      }
                      style={inputStyle}
                    />
                  </label>
                  <P5Btn
                    disabled={
                      disabled || !targets[provider].trim() || countdown > 0
                    }
                    onClick={() => void otp.request(command)}
                  >
                    {C.link[provider]}
                  </P5Btn>
                  {countdown > 0 && (
                    <p role="status">{C.cooldown(countdown)}</p>
                  )}
                </div>
              );
            })}
          {(["google", "facebook", "line"] as const)
            .filter(
              (provider) =>
                providers.includes(provider) &&
                !identities.some((id) => id.provider === provider),
            )
            .map((provider) => (
              <P5Btn
                key={provider}
                disabled={disabled}
                onClick={() => oauth(provider)}
              >
                {C.link[provider]}
              </P5Btn>
            ))}
        </div>
      </P5Card>
      {(error || otp.error) && (
        <p role="alert" style={{ color: P5.danger }}>
          {error || otp.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {confirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            confirmation === "delete"
              ? C.deleteConfirm
              : confirmation === "logout"
                ? C.logoutConfirm
                : C.unlinkConfirm
          }
        >
          <P5Card
            title={
              confirmation === "delete"
                ? C.deleteConfirm
                : confirmation === "logout"
                  ? C.logoutConfirm
                  : C.unlinkConfirm
            }
          >
            {confirmation === "delete" && <p>{C.retention}</p>}
            <P5Btn
              kind="primary"
              danger={confirmation !== "logout"}
              disabled={disabled}
              onClick={() => {
                if (confirmation === "logout") void logout();
                else if (confirmation === "delete")
                  void action(
                    () => client.deleteAccount(),
                    () => {
                      clearOtpState();
                      setAccount(null);
                      router.replace("/login");
                    },
                  );
                else if (identities.length > 1)
                  void action(
                    () =>
                      client.unlinkIdentity({
                        identityId: confirmation.identityId,
                      }),
                    async () => {
                      setConfirmation(null);
                      await load();
                    },
                  );
              }}
            >
              {confirmation === "delete"
                ? C.confirmDelete
                : confirmation === "logout"
                  ? C.confirmLogout
                  : C.confirmUnlink}
            </P5Btn>
            <P5Btn
              disabled={disabled}
              kind="ghost"
              onClick={() => setConfirmation(null)}
            >
              {C.cancel}
            </P5Btn>
          </P5Card>
        </div>
      )}
      <P5Btn disabled={disabled} onClick={() => setConfirmation("logout")}>
        {C.logout}
      </P5Btn>
      <P5Btn
        disabled={disabled}
        danger
        kind="ghost"
        onClick={() => setConfirmation("delete")}
      >
        {C.delete}
      </P5Btn>
    </div>
  );
}
