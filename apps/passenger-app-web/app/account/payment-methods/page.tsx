"use client";
import { isDemoMode } from "../../../lib/demo/store";
import { demoPaymentFields } from "../../../lib/demo/payment-fields";
import { useEffect, useState } from "react";
import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import { PaymentMethodsScreen } from "../../../components/payment/payment-methods-screen";
import {
  paymentFieldsForRuntime,
  assertPaymentFieldsRuntimeConfiguration,
} from "../../../lib/payment/runtime-fields";

export default function PaymentMethodsPage() {
  assertPaymentFieldsRuntimeConfiguration();
  const [fields, setFields] = useState<PassengerPaymentFieldsAvailability>({
    status: "unavailable",
  });
  useEffect(() => {
    const owned = isDemoMode()
      ? demoPaymentFields()
      : paymentFieldsForRuntime();
    setFields(owned);
    return () => {
      if (owned.status === "ready") owned.port.dispose();
    };
  }, []);
  // Actual contracted origins must be explicitly configured; none is inferred.
  const approvedActionOrigins = (
    process.env.NEXT_PUBLIC_PAYMENT_3DS_ORIGINS ?? ""
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return (
    <PaymentMethodsScreen
      fields={fields}
      approvedActionOrigins={approvedActionOrigins}
    />
  );
}
