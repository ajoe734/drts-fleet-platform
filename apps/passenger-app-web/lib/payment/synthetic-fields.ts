import type { PassengerPaymentFieldsPort } from "../../../../packages/passenger-client/src/payment/fields";

/** Explicit test/nonproduction adapter: no first-party financial-field inputs. */
export function createSyntheticPaymentFields(options: {
  runtime: "production" | "nonproduction";
  issueSyntheticNonce: () => string;
}): PassengerPaymentFieldsPort {
  if (
    options.runtime !== "nonproduction" ||
    process.env.NODE_ENV === "production"
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
      return { providerToken: `pax_${nonce}` };
    },
    dispose() {
      disposed = true;
    },
  };
}
