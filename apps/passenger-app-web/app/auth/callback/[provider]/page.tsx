"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { client } from "../../../../lib/auth/client";
import { clearOtpState } from "../../../../lib/auth/use-otp";
import { AUTH_COPY as C } from "../../../../../../packages/passenger-client/src/auth/copy";
import { authErrorCopy } from "../../../../../../packages/passenger-client/src/auth/state";
import { P5Card, P5Btn, P5 } from "../../../../components/auth/ui";
import { ConsentGate } from "../../../../components/auth/consent";

export default function OAuthCallbackPage() {
  const params = useParams<{ provider: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const processed = useRef(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const provider = params.provider;
  const state = search.get("state");
  const code = search.get("code");
  const denied = search.get("error");
  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    if (
      (provider !== "google" &&
        provider !== "facebook" &&
        provider !== "line") ||
      !state ||
      (!code && !denied)
    ) {
      setError(C.callbackMissing);
      setLoading(false);
      return;
    }
    void client
      .oauthCallback(provider, {
        state,
        ...(code ? { code } : {}),
        ...(denied ? { error: denied } : {}),
      })
      .then((result) => {
        clearOtpState();
        if (result.result === "logged_in") setAuthenticated(true);
        else if (result.result === "linked") router.replace("/account");
        else {
          setError(C.invalidGrant);
          setLoading(false);
        }
      })
      .catch((err) => {
        setError(authErrorCopy(err));
        setLoading(false);
      });
  }, [provider, state, code, denied, router]);
  const exit = async () => {
    try {
      await client.logout();
    } finally {
      clearOtpState();
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
  return (
    <div style={{ padding: 14 }}>
      <P5Card title={C.callbackTitle}>
        {loading ? (
          <p role="status">{C.callbackLoading}</p>
        ) : (
          <>
            <p role="alert" style={{ color: P5.danger }}>
              {error}
            </p>
            <P5Btn onClick={() => router.replace("/login")}>
              {C.backLogin}
            </P5Btn>
          </>
        )}
      </P5Card>
    </div>
  );
}
