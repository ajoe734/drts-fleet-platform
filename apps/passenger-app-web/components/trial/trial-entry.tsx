"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PassengerPaymentClient } from "@drts/passenger-client";
import { createAuthClient } from "../../lib/auth/client";
import { clearOtpState } from "../../lib/auth/otp-state";
import { paymentFieldsForRuntime } from "../../lib/payment/runtime-fields";
import { passengerFetch } from "../../lib/runtime-fetch";
import { setTrialMode } from "../../lib/trial/store";
import { AuthAlert, AuthScreen, P5, P5Btn } from "../auth/ui";
import { ConsentGate } from "../auth/consent-gate";
import { requestReviewLoginSms } from "../review-demo/login-sms";
import {
  useReviewDemo,
  useReviewDemoPending,
} from "../review-demo/review-context";
import { trialT } from "./translations";

/** One of the review backend's synthetic phones (0900000000–0900000099). */
function trialPhone() {
  const suffix = Math.floor(Math.random() * 100);
  return `09000000${String(suffix).padStart(2, "0")}`;
}

/**
 * Signs the visitor in with a synthetic phone through the normal OTP login,
 * shows the test terms, binds a test card when the account has none, and
 * opens booking. Every step uses the ordinary passenger APIs.
 */
export function TrialEntry() {
  const router = useRouter();
  const review = useReviewDemo();
  const reviewPending = useReviewDemoPending();
  const [client] = useState(createAuthClient);
  const [paymentClient] = useState(
    () => new PassengerPaymentClient({ baseUrl: "", fetchFn: passengerFetch }),
  );
  const [step, setStep] = useState<"intro" | "signing" | "consent" | "binding">(
    "intro",
  );
  const [error, setError] = useState("");
  const busy = useRef(false);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setStep("signing");
    try {
      clearOtpState();
      const target = trialPhone();
      const sms = await requestReviewLoginSms(target);
      if (!sms.challenge || !/^\d{6}$/.test(sms.code))
        throw new Error("trial_sms_unavailable");
      const result = await client.login({
        target,
        provider: "phone",
        code: sms.code,
        challenge: sms.challenge,
      });
      if (result.result !== "logged_in") throw new Error("trial_login_failed");
      setTrialMode(true);
      setStep("consent");
    } catch {
      setError(trialT.failed);
      setStep("intro");
    } finally {
      busy.current = false;
    }
  };

  const bindTestCard = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setStep("binding");
    try {
      const { methods } = await paymentClient.getMethods();
      if (methods.length === 0) {
        const fields = paymentFieldsForRuntime({
          reviewDemo: true,
          captureResult: "success",
        });
        if (fields.status !== "ready")
          throw new Error("trial_card_unavailable");
        try {
          const command = await fields.port.collectCredential();
          const bound = await paymentClient.bindMethod(command);
          if (bound.status !== "completed")
            throw new Error("trial_card_not_bound");
        } finally {
          fields.port.dispose();
        }
      }
      router.push("/");
    } catch {
      setError(trialT.failed);
      setStep("intro");
    } finally {
      busy.current = false;
    }
  }, [paymentClient, router]);

  if (step === "consent")
    return (
      <ConsentGate
        client={client}
        onAccepted={() => void bindTestCard()}
        onRefused={() => {
          setTrialMode(false);
          setStep("intro");
        }}
      />
    );

  const unavailable = !reviewPending && !review;
  return (
    <AuthScreen title={trialT.title} entry>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>{trialT.intro}</p>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{trialT.stepsTitle}</div>
      <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.8, fontSize: 15 }}>
        {trialT.steps.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      {error && <AuthAlert>{error}</AuthAlert>}
      {unavailable && <AuthAlert kind="warn">{trialT.failed}</AuthAlert>}
      {step === "signing" || step === "binding" ? (
        <div role="status" style={{ color: P5.mut, textAlign: "center" }}>
          {step === "signing" ? trialT.starting : trialT.binding}
        </div>
      ) : (
        <P5Btn
          kind="primary"
          disabled={reviewPending || unavailable}
          onClick={() => void start()}
        >
          {trialT.start}
        </P5Btn>
      )}
      <Link
        href="/trial/terms"
        style={{ color: P5.brand, fontSize: 14, textAlign: "center" }}
      >
        {trialT.termsLink}
      </Link>
    </AuthScreen>
  );
}
