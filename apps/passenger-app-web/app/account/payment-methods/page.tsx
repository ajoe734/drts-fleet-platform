"use client";
import { t } from "../../../components/review-demo/translations";

import { isDemoMode } from "../../../lib/demo/store";
import { demoPaymentFields } from "../../../lib/demo/payment-fields";
import { useEffect, useState } from "react";
import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import { PaymentMethodsScreen } from "../../../components/payment/payment-methods-screen";
import { useReviewDemo } from "../../../components/review-demo/review-context";
import {
  paymentFieldsForRuntime,
  assertPaymentFieldsRuntimeConfiguration,
} from "../../../lib/payment/runtime-fields";

export default function PaymentMethodsPage() {
  const review = useReviewDemo();
  const [captureResult, setCaptureResult] = useState<"success" | "retry_once">(
    "success",
  );
  assertPaymentFieldsRuntimeConfiguration(review);
  const [fields, setFields] = useState<PassengerPaymentFieldsAvailability>({
    status: "unavailable",
  });
  useEffect(() => {
    const owned = isDemoMode()
      ? demoPaymentFields()
      : paymentFieldsForRuntime({ reviewDemo: review, captureResult });
    setFields(owned);
    return () => {
      if (owned.status === "ready") owned.port.dispose();
    };
  }, [review, captureResult]);
  // Actual contracted origins must be explicitly configured; none is inferred.
  const approvedActionOrigins = (
    process.env.NEXT_PUBLIC_PAYMENT_3DS_ORIGINS ?? ""
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    <>
      {review && (
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
        approvedActionOrigins={approvedActionOrigins}
      />
    </>
  );
}
