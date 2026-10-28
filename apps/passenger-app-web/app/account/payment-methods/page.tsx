"use client";
import { t } from "../../../components/review-demo/translations";

import { isDemoMode } from "../../../lib/demo/store";
import { demoPaymentFields } from "../../../lib/demo/payment-fields";
import { useEffect, useState } from "react";
import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import { ECPAY_ACTION_ORIGINS } from "../../../components/payment/ecpay-csp";
import { EcpayHostedFields } from "../../../components/payment/ecpay-hosted-fields";
import { PaymentMethodsScreen } from "../../../components/payment/payment-methods-screen";
import {
  useReviewDemo,
  useTrialMode,
} from "../../../components/review-demo/review-context";
import { trialT } from "../../../components/trial/translations";
import {
  paymentFieldsForRuntime,
  assertPaymentFieldsRuntimeConfiguration,
  isEcpayHostedFieldsRuntime,
} from "../../../lib/payment/runtime-fields";

export default function PaymentMethodsPage() {
  const review = useReviewDemo();
  const trial = useTrialMode();
  const [captureResult, setCaptureResult] = useState<"success" | "retry_once">(
    "success",
  );
  assertPaymentFieldsRuntimeConfiguration(review);
  const useEcpayHosted =
    !isDemoMode() && isEcpayHostedFieldsRuntime({ reviewDemo: review });
  const [fields, setFields] = useState<PassengerPaymentFieldsAvailability>({
    status: "unavailable",
  });
  const [sessionOrigins, setSessionOrigins] =
    useState<readonly string[]>(ECPAY_ACTION_ORIGINS);
  useEffect(() => {
    if (useEcpayHosted) {
      setFields({ status: "unavailable" });
      return;
    }
    const owned = isDemoMode()
      ? demoPaymentFields()
      : paymentFieldsForRuntime({ reviewDemo: review, captureResult });
    setFields(owned);
    return () => {
      if (owned.status === "ready") owned.port.dispose();
    };
  }, [review, captureResult, useEcpayHosted]);
  // Actual contracted origins must be explicitly configured; none is inferred.
  const configuredActionOrigins = (
    process.env.NEXT_PUBLIC_PAYMENT_3DS_ORIGINS ?? ""
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const approvedActionOrigins =
    configuredActionOrigins.length > 0
      ? configuredActionOrigins
      : useEcpayHosted
        ? sessionOrigins
        : [];
  return (
    <>
      {trial && (
        <p style={{ margin: "12px 14px 0", fontSize: 14 }}>
          {trialT.paymentNotice}
        </p>
      )}
      {review && !trial && (
        <label>
          {t.pspScenario}
          <select
            aria-label={t.pspLabel}
            value={captureResult}
            onChange={(event) =>
              setCaptureResult(event.target.value as "success" | "retry_once")
            }
          >
            <option value="success">{t.captureSuccess}</option>
            <option value="retry_once">{t.captureRetry}</option>
          </select>
          <p>{t.captureNotice}</p>
        </label>
      )}
      <PaymentMethodsScreen
        fields={fields}
        hostedFieldsView={
          useEcpayHosted ? (
            <EcpayHostedFields
              onReady={setFields}
              onSessionLoaded={(session) =>
                setSessionOrigins(
                  session.approvedActionOrigins ?? ECPAY_ACTION_ORIGINS,
                )
              }
            />
          ) : undefined
        }
        approvedActionOrigins={approvedActionOrigins}
      />
    </>
  );
}
