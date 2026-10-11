import type { BindPaymentMethodCommand } from "@drts/contracts";

/** Provider-owned hosted fields expose only an opaque, one-use credential. */
export interface PassengerPaymentFieldsPort {
  readonly kind: "hosted" | "synthetic";
  collectCredential(): Promise<BindPaymentMethodCommand>;
  dispose(): void;
}

/** Missing contracted fields is unavailable, never a manufactured binding. */
export type PassengerPaymentFieldsAvailability =
  | { status: "ready"; port: PassengerPaymentFieldsPort }
  | { status: "unavailable" };
