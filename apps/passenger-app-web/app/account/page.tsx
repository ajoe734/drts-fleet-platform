"use client";

import { useEffect, useState } from "react";
import { PassengerClient } from "@drts/passenger-client";
import { PassengerAccount } from "@drts/contracts";
import { PassengerAuthClient } from "../../lib/auth/client";
import { P5Card, P5Btn, P5 } from "../../components/auth/ui";

const baseClient = new PassengerClient({
  baseUrl: "",
  fetchFn: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
});
const client = new PassengerAuthClient(baseClient);

export default function AccountPage() {
  const [account, setAccount] = useState<PassengerAccount | null>(null);
  const [identities, setIdentities] = useState<any[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // OTP State
  const [otpSent, setOtpSent] = useState(false);
  const [otpProvider, setOtpProvider] = useState<"phone" | "email" | null>(
    null,
  );
  const [otpPurpose, setOtpPurpose] = useState<
    "link" | "verify_contact_phone" | null
  >(null);
  const [otpTarget, setOtpTarget] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const fetchData = async () => {
    try {
      const acc = await client.getAccount();
      setAccount(acc);
      setDisplayName(acc.displayName || "");
      setContactPhone(acc.contactPhone || "");

      const idsRes = await client.getIdentities();
      setIdentities(idsRes.identities || []);

      const provsRes = await client.getProviders();
      setProviders(provsRes.providers || []);
    } catch (err) {
      console.error(err);
      window.location.href = "/login";
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const saved = sessionStorage.getItem("otp_account_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const elapsed = Math.floor((Date.now() - parsed.timestamp) / 1000);
        if (elapsed < 60) {
          setOtpSent(true);
          setChallenge(parsed.challenge);
          setOtpProvider(parsed.provider);
          setOtpPurpose(parsed.purpose);
          setOtpTarget(parsed.target);
          setCountdown(60 - elapsed);
        } else {
          sessionStorage.removeItem("otp_account_state");
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleLogout = async () => {
    try {
      await client.logout();
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async () => {
    try {
      await client.updateAccount({ displayName, contactPhone });
      setIsEditing(false);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnlink = async (identityId: string) => {
    if (identities.length <= 1) {
      alert("必須至少保留一種登入方式");
      return;
    }
    try {
      await client.unlinkIdentity({ identityId });
      fetchData();
    } catch (err) {
      console.error(err);
      alert("解除綁定失敗");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await client.deleteAccount();
      window.location.href = "/login";
    } catch (err) {
      console.error(err);
      alert("刪除帳號失敗");
    }
  };

  const handleOAuthBind = async (provider: "google" | "facebook" | "line") => {
    try {
      const res = await client.oauthStart({
        provider,
        redirectUri: window.location.origin + `/auth/callback/${provider}`,
        purpose: "link",
      });
      window.location.href = res.authUrl;
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestOtp = async (
    provider: "phone" | "email",
    purpose: "link" | "verify_contact_phone",
    target: string,
  ) => {
    if (!target) return;
    if (countdown > 0) return;
    setOtpLoading(true);
    setOtpError("");
    try {
      const res = await client.requestOtp({
        target,
        provider,
        purpose,
      });
      if (res.success) {
        setOtpSent(true);
        setChallenge(res.challenge);
        setOtpProvider(provider);
        setOtpPurpose(purpose);
        setOtpTarget(target);
        setCountdown(60);
        sessionStorage.setItem(
          "otp_account_state",
          JSON.stringify({
            challenge: res.challenge,
            provider,
            purpose,
            target,
            timestamp: Date.now(),
          }),
        );
      } else {
        setOtpError(res.message || "發送失敗");
      }
    } catch (err: any) {
      setOtpError(err.message || "發生錯誤");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setOtpLoading(true);
    setOtpError("");
    try {
      await client.login({
        target: otpTarget,
        provider: otpProvider!,
        challenge,
        code,
      });
      // linked or verified_contact_phone
      setOtpSent(false);
      setCode("");
      sessionStorage.removeItem("otp_account_state");
      fetchData();
    } catch {
      setOtpError("驗證碼錯誤或已過期");
    } finally {
      setOtpLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${P5.line}`,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box" as const,
    marginBottom: 8,
  };

  if (loading) return <div style={{ padding: 14 }}>載入中...</div>;
  if (!account) return null;

  if (otpSent) {
    return (
      <div style={{ padding: 14 }}>
        <P5Card title="輸入驗證碼">
          <div style={{ marginBottom: 14, fontSize: 13, color: P5.ink }}>
            已發送驗證碼至 {otpTarget}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="text"
              placeholder="6位數驗證碼"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              style={inputStyle}
            />
            {otpError && (
              <div style={{ color: P5.danger, fontSize: 13 }}>{otpError}</div>
            )}
            <P5Btn
              kind="primary"
              disabled={otpLoading || code.length !== 6}
              onClick={handleVerifyOtp}
            >
              {otpLoading ? "驗證中..." : "驗證"}
            </P5Btn>
            <P5Btn
              kind="ghost"
              disabled={otpLoading || countdown > 0}
              onClick={() =>
                handleRequestOtp(otpProvider!, otpPurpose!, otpTarget)
              }
            >
              {countdown > 0 ? `重送驗證碼 (${countdown}s)` : "重新發送"}
            </P5Btn>
            <P5Btn
              kind="ghost"
              onClick={() => {
                setOtpSent(false);
                setCode("");
                setOtpError("");
                sessionStorage.removeItem("otp_account_state");
              }}
            >
              取消
            </P5Btn>
          </div>
        </P5Card>
      </div>
    );
  }

  const identityProviders = identities.map((i) => i.provider);
  const availableProviders = providers.filter(
    (p) => !identityProviders.includes(p),
  );

  return (
    <div
      style={{ padding: 14, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <P5Card title="個人資料">
        {isEditing ? (
          <div>
            <input
              style={inputStyle}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="姓名"
            />
            <input
              style={inputStyle}
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="聯絡手機"
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <P5Btn kind="primary" onClick={handleUpdateProfile}>
                  儲存
                </P5Btn>
              </div>
              <div style={{ flex: 1 }}>
                <P5Btn onClick={() => setIsEditing(false)}>取消</P5Btn>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: P5.mut }}>姓名</div>
              <div>{account.displayName || "未設定"}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: P5.mut }}>聯絡手機</div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  {account.contactPhone || "未設定"}
                  {account.contactPhone && (
                    <span
                      style={{
                        fontSize: 11,
                        marginLeft: 8,
                        color: account.contactPhoneVerified
                          ? P5.brand
                          : P5.danger,
                      }}
                    >
                      {account.contactPhoneVerified ? "(已驗證)" : "(未驗證)"}
                    </span>
                  )}
                </div>
                {providers.includes("phone") &&
                  account.contactPhone &&
                  !account.contactPhoneVerified && (
                    <button
                      disabled={otpLoading}
                      onClick={() =>
                        handleRequestOtp(
                          "phone",
                          "verify_contact_phone",
                          account.contactPhone!,
                        )
                      }
                      style={{
                        color: P5.brand,
                        background: "none",
                        border: "none",
                        cursor: otpLoading ? "not-allowed" : "pointer",
                        fontSize: 13,
                        opacity: otpLoading ? 0.5 : 1,
                      }}
                    >
                      {otpLoading ? "處理中..." : "去驗證"}
                    </button>
                  )}
              </div>
            </div>
            <P5Btn onClick={() => setIsEditing(true)}>編輯資料</P5Btn>
          </div>
        )}
      </P5Card>

      <P5Card title="登入方式管理">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {identities.map((id) => (
            <div
              key={id.identityId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: `1px solid ${P5.lineSoft}`,
                paddingBottom: 8,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{id.provider}</div>
                <div style={{ fontSize: 12, color: P5.mut }}>{id.subject}</div>
              </div>
              <button
                onClick={() => handleUnlink(id.identityId)}
                style={{
                  background: "none",
                  border: "none",
                  color: identities.length > 1 ? P5.danger : P5.dim,
                  cursor: identities.length > 1 ? "pointer" : "not-allowed",
                }}
                disabled={identities.length <= 1}
              >
                解除綁定
              </button>
            </div>
          ))}

          {availableProviders.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 600 }}>
                新增綁定
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {availableProviders.includes("google") && (
                  <P5Btn onClick={() => handleOAuthBind("google")}>
                    綁定 Google
                  </P5Btn>
                )}
                {availableProviders.includes("facebook") && (
                  <P5Btn onClick={() => handleOAuthBind("facebook")}>
                    綁定 Facebook
                  </P5Btn>
                )}
                {availableProviders.includes("line") && (
                  <P5Btn onClick={() => handleOAuthBind("line")}>
                    綁定 LINE
                  </P5Btn>
                )}

                {availableProviders.includes("phone") && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="link-phone"
                      type="tel"
                      placeholder="綁定手機"
                      style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    />
                    <div style={{ flex: 1 }}>
                      <P5Btn
                        onClick={() => {
                          const v = (
                            document.getElementById(
                              "link-phone",
                            ) as HTMLInputElement
                          ).value;
                          if (v) handleRequestOtp("phone", "link", v);
                        }}
                      >
                        綁定手機
                      </P5Btn>
                    </div>
                  </div>
                )}
                {availableProviders.includes("email") && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      id="link-email"
                      type="email"
                      placeholder="綁定 Email"
                      style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
                    />
                    <div style={{ flex: 1 }}>
                      <P5Btn
                        onClick={() => {
                          const v = (
                            document.getElementById(
                              "link-email",
                            ) as HTMLInputElement
                          ).value;
                          if (v) handleRequestOtp("email", "link", v);
                        }}
                      >
                        綁定 Email
                      </P5Btn>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </P5Card>

      <P5Card title="帳號操作">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <P5Btn onClick={handleLogout}>登出</P5Btn>

          {showDeleteConfirm ? (
            <div
              style={{
                background: P5.warnBg,
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${P5.warnBd}`,
              }}
            >
              <div style={{ color: P5.warn, fontWeight: 600, marginBottom: 8 }}>
                確定要刪除帳號嗎？
              </div>
              <div style={{ fontSize: 13, color: P5.ink, marginBottom: 14 }}>
                刪除後將無法恢復。您的個人資料將被匿名化處理，但為符合法規要求，歷史行程與財務紀錄將會保留。
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <P5Btn kind="primary" danger onClick={handleDeleteAccount}>
                    確認刪除
                  </P5Btn>
                </div>
                <div style={{ flex: 1 }}>
                  <P5Btn onClick={() => setShowDeleteConfirm(false)}>
                    取消
                  </P5Btn>
                </div>
              </div>
            </div>
          ) : (
            <P5Btn danger onClick={() => setShowDeleteConfirm(true)}>
              刪除帳號
            </P5Btn>
          )}
        </div>
      </P5Card>
    </div>
  );
}
