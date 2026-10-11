"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { createAuthClient } from "../../../../lib/auth/client";
import { t } from "../../../../lib/auth/translations";
import {
  AuthScreen,
  AuthAlert,
  P5Btn,
  P5,
} from "../../../../components/auth/ui";
import { ConsentGate } from "../../../../components/auth/consent-gate";
import { PassengerApiError } from "@drts/passenger-client";

function OAuthCallbackContent() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const [client] = useState(createAuthClient);
  const processed = useRef(false);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const accepted = useCallback(() => router.push("/"), [router]);
  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const provider = params.provider;
    const state = search.get("state");
    if (
      (provider !== "google" &&
        provider !== "facebook" &&
        provider !== "line") ||
      !state
    ) {
      setError(t("oauthFailed"));
      setPending(false);
      return;
    }
    const code = search.get("code");
    const refusal = search.get("error");
    // Always consume/clear BFF binding, including provider refusal. Query transactionId is ignored.
    void client
      .oauthCallback(provider, {
        state,
        ...(code ? { code } : {}),
        ...(refusal ? { error: refusal } : {}),
      })
      .then((result) => {
        if (result.result === "linked") router.push("/account");
        else if (result.result === "logged_in") setConsent(true);
        else throw new Error("Invalid callback result");
      })
      .catch((err) => {
        const isConflict =
          err instanceof PassengerApiError && err.code === "conflict";
        setConflict(isConflict);
        setError(
          isConflict
            ? t("conflict")
            : refusal === "access_denied"
              ? t("denied")
              : t("oauthFailed"),
        );
      })
      .finally(() => setPending(false));
  }, [client, params.provider, router, search]);
  if (consent)
    return (
      <ConsentGate
        client={client}
        onAccepted={accepted}
        onRefused={() => router.push("/login")}
      />
    );
  return (
    <AuthScreen title={conflict ? t("linkFailed") : t("oauth")}>
      {pending ? (
        <div
          role="status"
          style={{ color: P5.mut, margin: "auto 0", textAlign: "center" }}
        >
          {t("oauthProcessing")}
        </div>
      ) : error ? (
        <>
          <AuthAlert
            kind={search.get("error") === "access_denied" ? "warn" : "danger"}
          >
            {error}
          </AuthAlert>
          <P5Btn
            kind="primary"
            onClick={() => router.push(conflict ? "/account" : "/login")}
          >
            {t("back")}
          </P5Btn>
        </>
      ) : (
        <div role="status">{t("oauthSuccess")}</div>
      )}
    </AuthScreen>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <AuthScreen title={t("oauth")}>
          <div role="status">{t("oauthProcessing")}</div>
        </AuthScreen>
      }
    >
      <OAuthCallbackContent />
    </Suspense>
  );
}
