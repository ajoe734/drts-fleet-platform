import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import { createSyntheticPaymentFields } from "./synthetic-fields";

export function assertPaymentFieldsRuntimeConfiguration() {
  if (
    process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "synthetic" &&
    process.env.NODE_ENV === "production"
  )
    throw new Error("synthetic_payment_fields_forbidden");
}

/** No configured contracted provider means unavailable, not an implicit fake. */
export function paymentFieldsForRuntime(): PassengerPaymentFieldsAvailability {
  assertPaymentFieldsRuntimeConfiguration();
  if (process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER !== "synthetic")
    return { status: "unavailable" };
  return {
    status: "ready",
    port: createSyntheticPaymentFields({
      runtime:
        process.env.NODE_ENV === "production" ? "production" : "nonproduction",
      issueSyntheticNonce: () => `synthetic_${crypto.randomUUID()}`,
    }),
  };
}
