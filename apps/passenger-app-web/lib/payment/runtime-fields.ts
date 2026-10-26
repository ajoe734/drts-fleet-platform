import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";
import {
  createEcpayHostedFieldsPort,
  type EcpaySdkGlobal,
} from "../../components/payment/ecpay-hosted-fields";
import { createSyntheticPaymentFields } from "./synthetic-fields";

export function assertPaymentFieldsRuntimeConfiguration(reviewDemo = false) {
  if (
    process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "synthetic" &&
    process.env.NODE_ENV === "production" &&
    !reviewDemo
  )
    throw new Error("synthetic_payment_fields_forbidden");
}

export function isEcpayHostedFieldsRuntime(
  options: { reviewDemo?: boolean; serverProvider?: string } = {},
): boolean {
  assertPaymentFieldsRuntimeConfiguration(options.reviewDemo);
  if (options.reviewDemo) return false;
  const configured =
    process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER?.trim() ?? "";
  if (configured === "synthetic" || configured === "disabled") {
    return false;
  }
  if (options.serverProvider && options.serverProvider !== "ecpay") {
    return false;
  }
  return configured === "ecpay" || configured === "";
}

/** No configured contracted provider means unavailable, not an implicit fake. */
export function paymentFieldsForRuntime(
  options: {
    reviewDemo?: boolean;
    captureResult?: "success" | "retry_once";
    ecpaySdk?: EcpaySdkGlobal;
    serverProvider?: string;
  } = {},
): PassengerPaymentFieldsAvailability {
  assertPaymentFieldsRuntimeConfiguration(options.reviewDemo);
  if (!options.reviewDemo) {
    const configured =
      process.env.NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER?.trim() ?? "";
    if (
      configured === "ecpay" ||
      (configured === "" && options.serverProvider === "ecpay")
    ) {
      const sdk =
        options.ecpaySdk ??
        (typeof window !== "undefined" ? window.ECPay : undefined);
      if (!sdk) return { status: "unavailable" };
      return {
        status: "ready",
        port: createEcpayHostedFieldsPort({
          getSdk: () =>
            options.ecpaySdk ??
            (typeof window !== "undefined" ? window.ECPay : undefined),
        }),
      };
    }
    if (configured !== "synthetic") return { status: "unavailable" };
  }
  return {
    status: "ready",
    port: createSyntheticPaymentFields({
      runtime: options.reviewDemo
        ? "review"
        : process.env.NODE_ENV === "production"
          ? "production"
          : "nonproduction",
      captureResult: options.captureResult ?? "success",
      issueSyntheticNonce: () => `synthetic_${crypto.randomUUID()}`,
    }),
  };
}
