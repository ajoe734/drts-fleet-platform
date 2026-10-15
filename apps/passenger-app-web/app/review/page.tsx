"use client";
import { t } from "../../components/review-demo/translations";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PassengerClient } from "@drts/passenger-client";
import { stopDemo, isDemoMode } from "../../lib/demo/store";
import {
  useReviewDemo,
  useReviewOpsUrl,
} from "../../components/review-demo/review-context";

const client = new PassengerClient({
  baseUrl: "",
  fetchFn: (url, init) => fetch(url, init),
});

export default function ReviewEntry() {
  const enabled = useReviewDemo();
  const opsUrl = useReviewOpsUrl();
  const [target, setTarget] = useState("0900000001");
  const [proof, setProof] = useState<{ challenge: string; code: string }>();
  const [accountId, setAccountId] = useState<string>();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    if (enabled)
      void client
        .getAccount()
        .then((a) => setAccountId(a.drtsPassengerId))
        .catch(() => setAccountId(undefined));
  }, [enabled]);
  async function run(operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch {
      setError(t.operationFailed);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main style={{ padding: 18 }}>
      <h1>{t.entryTitle}</h1>
      <p>{t.sharedOrderIntro}</p>
      <p>{t.simulationNotice}</p>
      {!enabled && <p role="status">{t.disabled}</p>}
      <button
        onClick={() => {
          if (isDemoMode()) stopDemo();
          window.location.assign("/review");
        }}
      >
        {t.enterShared}
      </button>
      {error && <p role="alert">{error}</p>}
      {enabled && (
        <section>
          <h2>{t.passengerAccount}</h2>
          {accountId ? (
            <>
              <p>
                {t.signedIn}{" "}
                <output data-testid="review-passenger-id">{accountId}</output>
              </p>
              <Link href="/account/payment-methods">{t.bindStep}</Link>
              <br />
              <Link href="/">{t.bookStep}</Link>
              <br />
              <Link href="/rides">{t.historyStep}</Link>
              <br />
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await client.logout();
                    setAccountId(undefined);
                    setProof(undefined);
                  })
                }
              >
                {t.logout}
              </button>
            </>
          ) : (
            <>
              <label>
                {t.phoneRange}
                <input
                  aria-label={t.phoneLabel}
                  value={target}
                  disabled={busy || !!proof}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </label>
              <p>{t.smsInboxNotice}</p>
              <label>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                {t.consent} <Link href="/review/terms">{t.termsLink}</Link>
              </label>
              {!proof ? (
                <button
                  disabled={busy || !agreed}
                  onClick={() =>
                    void run(async () => {
                      const response = await fetch(
                        "/api/passenger-app/review-demo/otp",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ target }),
                        },
                      );
                      if (!response.ok) throw new Error("otp_unavailable");
                      const result = await response.json();
                      setProof({
                        challenge: result.data.challenge,
                        code: result.data.code,
                      });
                    })
                  }
                >
                  {t.requestSms}
                </button>
              ) : (
                <>
                  <p>
                    {t.smsCode}
                    <output>{proof.code}</output>
                    {t.codeExpiry}
                  </p>
                  <button
                    disabled={busy || !agreed}
                    onClick={() =>
                      void run(async () => {
                        await client.login({
                          provider: "phone",
                          target,
                          ...proof,
                        });
                        // Real profile/consent writer; no localStorage account substitute.
                        await client.updateAccount({
                          displayName: "審查演練乘客",
                          contactPhone: target,
                          termsVersion: "review-terms-v1",
                          privacyVersion: "review-privacy-v1",
                        });
                        setAccountId(
                          (await client.getAccount()).drtsPassengerId,
                        );
                        setProof(undefined);
                      })
                    }
                  >
                    {t.login}
                  </button>
                  <button disabled={busy} onClick={() => setProof(undefined)}>
                    {t.requestAgain}
                  </button>
                </>
              )}
            </>
          )}
        </section>
      )}
      <h2>{t.stepsTitle}</h2>
      {enabled && (
        <p>
          <a href="/review-driver/onboarding" target="_blank" rel="noreferrer">
            {t.driverWindow}
          </a>{" "}
          ·{" "}
          {opsUrl && (
            <a href={opsUrl} target="_blank" rel="noreferrer">
              {t.opsWindow}
            </a>
          )}
        </p>
      )}
      <ol>
        <li>{t.copyOrderStep}</li>
        <li>{t.dispatchStep}</li>
        <li>{t.driverStep}</li>
        <li>{t.updatesStep}</li>
        <li>{t.journeysStep}</li>
      </ol>
      <Link href="/demo">{t.localDemo}</Link>
    </main>
  );
}
