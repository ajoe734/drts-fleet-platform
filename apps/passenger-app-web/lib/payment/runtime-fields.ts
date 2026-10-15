import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import { createSyntheticPaymentFields } from "./synthetic-fields";

export function assertPaymentFieldsRuntimeConfiguration(reviewDemo = false) {
  if (
    process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "synthetic" &&
    process.env.NODE_ENV === "production" &&
    !reviewDemo
  )
    throw new Error("synthetic_payment_fields_forbidden");
}

/** No configured contracted provider means unavailable, not an implicit fake. */
export function paymentFieldsForRuntime(
  options: {
    reviewDemo?: boolean;
    captureResult?: "success" | "retry_once";
  } = {},
): PassengerPaymentFieldsAvailability {
  assertPaymentFieldsRuntimeConfiguration(options.reviewDemo);
  if (
    !options.reviewDemo &&
    process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER !== "synthetic"
  )
    return { status: "unavailable" };
  return {
    status: "ready",
    port: createSyntheticPaymentFields({
      runtime: options.reviewDemo
        ? "review"
        : process.env.NODE_ENV === "production"
          ? "production"
          : "nonproduction",
      captureResult: options.captureResult,
      issueSyntheticNonce: () => `synthetic_${crypto.randomUUID()}`,
    }),
  };
}
