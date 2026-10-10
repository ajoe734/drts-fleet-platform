"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { PassengerClient } from "../../../../../packages/passenger-client/src";
import { P5Card, P5Btn, P5 } from "../../../../components/p5-ui";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const provider = params.provider as "google" | "facebook" | "line";

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [consentRequired, setConsentRequired] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentError, setConsentError] = useState("");
  
  const client = useRef(new PassengerClient({
    baseUrl: "",
    fetchFn: (...args) => fetch(...args),
  })).current;

  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    // We would normally also need transactionId, but it's typically stored in a cookie/session or state.
    // For this UI implementation, we'll assume it's passed or available. Let's pass a placeholder if not present.
    const transactionId = searchParams.get("transactionId") || "";

    if (errorParam) {
      setError(`認證失敗: ${errorParam}`);
      setLoading(false);
      return;
    }

    if (code && state && provider) {
      processed.current = true;
      const snakeCommand = {
        provider,
        code,
        state,
        transaction_id: transactionId,
      };

      // client.oauthCallback is not explicitly typed in client yet, let's just make a manual request for now
      // or we can add it to client.ts if we want. Let's just use native fetch to the BFF
      fetch(`/api/passenger-app/auth/oauth/callback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snakeCommand),
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("認證失敗");
          }
          const data = await res.json();
          // data.data for wrapper
          const payload = data.data || data;
          if (payload.result === "logged_in") {
            try {
              const acc = await client.getAccount();
              if (!acc.termsVersion) {
                 setConsentRequired(true);
                 setLoading(false);
              } else {
                 router.push("/");
              }
            } catch {
              router.push("/");
            }
          } else if (payload.result === "linked") {
            router.push("/account");
          } else {
            router.push("/");
          }
        })
        .catch((err) => {
          setError(err.message || "認證過程發生錯誤");
          setLoading(false);
        });
    } else {
      setError("缺少認證參數");
      setLoading(false);
    }
  }, [searchParams, provider, router]);

  
  const handleConsentSubmit = async () => {
    if (!consentChecked) {
      setConsentError("請勾選同意條款與隱私權政策");
      return;
    }
    setLoading(true);
    setConsentError("");
    try {
      await client.updateAccount({ termsVersion: "v1.0", privacyVersion: "v1.0" });
      router.push("/");
    } catch {
      setConsentError("儲存失敗，請重試");
      setLoading(false);
    }
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

  return (
    <div style={{ padding: 14 }}>
      <P5Card title="第三方登入">
        {loading ? (
          <div style={{ textAlign: "center", padding: 20, color: P5.mut }}>
            正在驗證中，請稍候...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ color: P5.danger, textAlign: "center" }}>{error}</div>
            <P5Btn onClick={() => router.push("/login")}>返回登入頁</P5Btn>
          </div>
        )}
      </P5Card>
    </div>
  );
}
