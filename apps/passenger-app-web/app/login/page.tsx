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
        window.location.href = "/";
      } else {
        setError("驗證失敗");
      }
    } catch {
      setError("驗證碼錯誤或已過期");
    } finally {
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
            <P5Btn kind="primary" onClick={handleVerifyOtp}>
              {loading ? "驗證中..." : "驗證並登入"}
            </P5Btn>
            <P5Btn kind="ghost" onClick={() => handleRequestOtp(providerUsed)}>
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
                <P5Btn kind="primary" onClick={() => handleRequestOtp("phone")}>
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
                <P5Btn kind="primary" onClick={() => handleRequestOtp("email")}>
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
              <P5Btn onClick={() => handleOAuth("google")}>
                使用 Google 登入
              </P5Btn>
            )}
            {providers.includes("facebook") && (
              <P5Btn onClick={() => handleOAuth("facebook")}>
                使用 Facebook 登入
              </P5Btn>
            )}
            {providers.includes("line") && (
              <P5Btn onClick={() => handleOAuth("line")}>使用 LINE 登入</P5Btn>
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
