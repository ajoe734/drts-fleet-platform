import type { PassengerPaymentFieldsPort } from "../../../../packages/passenger-client/src/payment/fields";

/** Explicit test/nonproduction adapter: no first-party financial-field inputs. */
export function createSyntheticPaymentFields(options: {
  runtime: "production" | "nonproduction" | "review";
  issueSyntheticNonce: () => string;
  captureResult?: "success" | "retry_once";
}): PassengerPaymentFieldsPort {
  if (
    options.runtime !== "review" &&
    (options.runtime !== "nonproduction" ||
      process.env.NODE_ENV === "production")
  ) {
    throw new Error("synthetic_payment_fields_forbidden");
  }
  let disposed = false;
  return {
    kind: "synthetic",
    async collectCredential() {
      if (disposed) throw new Error("payment_fields_unavailable");
      const nonce = options.issueSyntheticNonce();
      if (!/^synthetic_[a-zA-Z0-9_-]+$/.test(nonce))
        throw new Error("synthetic_payment_fields_invalid");
      // The existing fake provider accepts letters, underscores and hyphens.
      // Escape underscores before digits so UUID nonces retain their uniqueness.
      const encodedNonce = nonce
        .slice("synthetic_".length)
        .replace(/_/g, "__")
        .replace(
          /[0-9]/g,
          (digit) => `_${String.fromCharCode(97 + Number(digit))}`,
        );
      return {
        providerToken: `synthetic_credential_${options.runtime === "review" && options.captureResult === "retry_once" ? "review_retry_" : ""}${encodedNonce}`,
      };
    },
    dispose() {
      disposed = true;
    },
  };
}
