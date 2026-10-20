import type { PassengerPaymentFieldsAvailability } from "@drts/passenger-client";

/** A local demonstration action: no card details or PSP credentials are collected. */
export function demoPaymentFields(): PassengerPaymentFieldsAvailability {
  let disposed = false;
  return {
    status: "ready",
    port: {
      kind: "synthetic",
      async collectCredential() {
        if (disposed) throw new Error("payment_fields_unavailable");
        return { providerToken: `demo_card_${crypto.randomUUID()}` };
      },
      dispose() {
        disposed = true;
      },
    },
  };
}
