"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { P5Card, P5Btn, P5 } from "../../../../components/p5-ui";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const provider = params.provider as "google" | "facebook" | "line";

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    // We would normally also need transactionId, but it's typically stored in a cookie/session or state.
    // For this UI implementation, we'll assume it's passed or available. Let's pass a placeholder if not present.
    const transactionId = searchParams.get("transactionId") || "placeholder";

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
            router.push("/");
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
