"use client";

import { useEffect, useState } from "react";
import { PassengerClient } from "@drts/passenger-client";
import { P5Card, P5Btn, P5 } from "../../components/p5-ui";

const client = new PassengerClient({
  baseUrl: "",
  fetchFn: (...args) => fetch(...args),
});

export default function LoginPage() {
  const [providers, setProviders] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [providerUsed, setProviderUsed] = useState<"phone" | "email">("phone");
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState("");

  useEffect(() => {
    client
      .getProviders()
      .then((res) => {
        setProviders(res.providers || []);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleRequestOtp = async (provider: "phone" | "email") => {
    setLoading(true);
    setError("");
    try {
      const target = provider === "phone" ? phone : email;
      const res = await client.requestOtp({
        target,
        provider,
        purpose: "login",
      });
      if (res.success) {
        setOtpSent(true);
        setChallenge(res.challenge);
        setProviderUsed(provider);
        setCountdown(60);
      } else {
        setError(res.message || "發送失敗");
      }
    } catch (err: any) {
      setError(err.message || "發生錯誤");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setLoading(true);
    setError("");
    try {
      const target = providerUsed === "phone" ? phone : email;
      const res = await client.login({
        target,
        provider: providerUsed,
        challenge,
        code,
      });
      if (res.result === "logged_in") {
        try {
          const acc = await client.getAccount();
          if (!acc.termsVersion) {
            setConsentRequired(true);
          } else {
            window.location.href = "/";
          }
        } catch {
          window.location.href = "/";
        }
      } else {
        setError("驗證失敗");
      }
    } catch (err: any) {
      if (err.message && err.message.includes("429")) {
         setError("嘗試次數過多，請稍後重試");
      } else {
         setError("驗證碼錯誤或已過期");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConsentSubmit = async () => {
    if (!consentChecked) {
      setConsentError("請勾選同意條款與隱私權政策");
      return;
    }
    setLoading(true);
    setConsentError("");
    try {
      await client.updateAccount({ termsVersion: "v1.0", privacyVersion: "v1.0" });
      window.location.href = "/";
    } catch {
      setConsentError("儲存失敗，請重試");
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "facebook" | "line") => {
    try {
      const res = await client.oauthStart({
        provider,
        redirectUri: window.location.origin + `/auth/callback/${provider}`,
        purpose: "login",
      });
      window.location.href = res.authUrl;
    } catch {
      setError("發生錯誤");
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
  };

  if (consentRequired) {
    return (
      <div style={{ padding: 14 }}>
        <P5Card title="服務條款與隱私權政策">
          <div style={{ marginBottom: 14, fontSize: 13, color: P5.ink }}>
            歡迎使用智行叫車。請先閱讀並同意我們的服務條款與隱私權政策。
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <input 
              type="checkbox" 
              id="consent" 
              checked={consentChecked} 
              onChange={(e) => setConsentChecked(e.target.checked)} 
              disabled={loading}
            />
            <label htmlFor="consent" style={{ fontSize: 13, color: P5.ink, cursor: "pointer" }}>
              我同意
              <a href="/terms" target="_blank" style={{ color: P5.brand, textDecoration: "none", margin: "0 4px" }}>服務條款</a>
              與
              <a href="/privacy" target="_blank" style={{ color: P5.brand, textDecoration: "none", margin: "0 4px" }}>隱私權政策</a>
            </label>
          </div>
          {consentError && (
            <div style={{ color: P5.danger, fontSize: 13, marginBottom: 14 }}>{consentError}</div>
          )}
          <P5Btn kind="primary" disabled={loading} onClick={handleConsentSubmit}>
            {loading ? "處理中..." : "同意並繼續"}
          </P5Btn>
        </P5Card>
      </div>
    );
  }

  if (otpSent) {
    return (
      <div style={{ padding: 14 }}>
        <P5Card title="輸入驗證碼">
          <div style={{ marginBottom: 14, fontSize: 13, color: P5.ink }}>
            已發送驗證碼至 {providerUsed === "phone" ? phone : email}
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
            {error && (
              <div style={{ color: P5.danger, fontSize: 13 }}>{error}</div>
            )}
            <P5Btn kind="primary" disabled={loading || code.length !== 6} onClick={handleVerifyOtp}>
              {loading ? "驗證中..." : "驗證並登入"}
            </P5Btn>
            <P5Btn kind="ghost" disabled={loading || countdown > 0} onClick={() => handleRequestOtp(providerUsed)}>
              {countdown > 0 ? `重送驗證碼 (${countdown}s)` : "重新發送"}
            </P5Btn>
            <P5Btn
              kind="ghost"
              onClick={() => {
                setOtpSent(false);
                setCode("");
                setError("");
              }}
            >
              返回
            </P5Btn>
          </div>
        </P5Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 14 }}>
      <P5Card title="登入或註冊">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {providers.includes("phone") && (
            <div
              style={{
                borderBottom: `1px solid ${P5.lineSoft}`,
                paddingBottom: 14,
              }}
            >
              <input
                type="tel"
                placeholder="手機號碼"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={inputStyle}
              />
              <div style={{ marginTop: 8 }}>
                <P5Btn kind="primary" disabled={loading || !phone} onClick={() => handleRequestOtp("phone")}>
                  使用手機登入
                </P5Btn>
              </div>
            </div>
          )}
          {providers.includes("email") && (
            <div
              style={{
                borderBottom: `1px solid ${P5.lineSoft}`,
                paddingBottom: 14,
              }}
            >
              <input
                type="email"
                placeholder="電子郵件"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
              <div style={{ marginTop: 8 }}>
                <P5Btn kind="primary" disabled={loading || !email} onClick={() => handleRequestOtp("email")}>
                  使用 Email 登入
                </P5Btn>
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginTop: 14,
            }}
          >
            {providers.includes("google") && (
              <P5Btn disabled={loading} onClick={() => handleOAuth("google")}>
                使用 Google 登入
              </P5Btn>
            )}
            {providers.includes("facebook") && (
              <P5Btn disabled={loading} onClick={() => handleOAuth("facebook")}>
                使用 Facebook 登入
              </P5Btn>
            )}
            {providers.includes("line") && (
              <P5Btn disabled={loading} onClick={() => handleOAuth("line")}>使用 LINE 登入</P5Btn>
            )}
          </div>
          {error && (
            <div style={{ color: P5.danger, fontSize: 13, marginTop: 8 }}>
              {error}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              color: P5.mut,
              textAlign: "center",
              marginTop: 14,
            }}
          >
            登入或註冊即表示您同意
            <a
              href="/terms"
              target="_blank"
              style={{ color: P5.brand, textDecoration: "none", marginLeft: 4 }}
            >
              服務條款
            </a>
            與
            <a
              href="/privacy"
              target="_blank"
              style={{ color: P5.brand, textDecoration: "none", marginLeft: 4 }}
            >
              隱私權政策
            </a>
          </div>
        </div>
      </P5Card>
    </div>
  );
}
