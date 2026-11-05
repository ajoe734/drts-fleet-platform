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

/** One of the review backend's synthetic phones (0900000000–0900000099)
 * not yet tried by this start. */
function trialPhone(tried: ReadonlySet<string>) {
  for (;;) {
    const suffix = Math.floor(Math.random() * 100);
    const phone = `09000000${String(suffix).padStart(2, "0")}`;
    if (!tried.has(phone)) return phone;
  }
}

/** Phones signed in before giving up on one start. */
const TRIAL_SIGN_IN_ATTEMPTS = 5;

/** False only when the API says booking would refuse this account (an earlier
 * test charge left unsettled). An unanswered check keeps the account; booking
 * still enforces the same rule.
 */
async function trialAccountCanBook() {
  try {
    const response = await passengerFetch(
      "/api/passenger-app/review-demo/trial/readiness",
      { cache: "no-store" },
    );
    if (!response.ok) return true;
    const body = (await response.json()) as {
      data?: { can_book?: unknown };
    };
    return body.data?.can_book !== false;
  } catch {
    return true;
  }
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
      const tried = new Set<string>();
      for (;;) {
        if (tried.size === TRIAL_SIGN_IN_ATTEMPTS)
          throw new Error("trial_account_unavailable");
        clearOtpState();
        const target = trialPhone(tried);
        tried.add(target);
        const sms = await requestReviewLoginSms(target);
        if (!sms.challenge || !/^\d{6}$/.test(sms.code))
          throw new Error("trial_sms_unavailable");
        const result = await client.login({
          target,
          provider: "phone",
          code: sms.code,
          challenge: sms.challenge,
        });
        if (result.result !== "logged_in")
          throw new Error("trial_login_failed");
        if (await trialAccountCanBook()) break;
      }
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
