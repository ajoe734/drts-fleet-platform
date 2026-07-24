import { Inject, Injectable } from "@nestjs/common";

import type { PassengerPaymentStatus } from "@drts/contracts";

export const PAYMENT_RECOVERY_ACTIONS = [
  "retry_capture",
  "begin_manual_recovery",
] as const;

export type PaymentRecoveryAction = (typeof PAYMENT_RECOVERY_ACTIONS)[number];

export type PaymentRecoverySubject = {
  paymentId: string;
  orderId: string;
  status: PassengerPaymentStatus;
  amountMinor: number | null;
  currency: string;
  attemptCount: number;
};

export type PaymentRecoveryResult = {
  status: "accepted" | "completed";
};

export interface PaymentRecoveryPort {
  isAvailable(action: PaymentRecoveryAction): boolean;
  recover(
    action: PaymentRecoveryAction,
    payment: PaymentRecoverySubject,
    context: {
      actorId: string;
      idempotencyKey: string;
      requestId?: string;
      reason?: string;
    },
  ): Promise<PaymentRecoveryResult>;
}

export const PAYMENT_RECOVERY_PORT = Symbol("PAYMENT_RECOVERY_PORT");

@Injectable()
export class UnavailablePaymentRecoveryPort implements PaymentRecoveryPort {
  isAvailable() {
    return false;
  }

  async recover(): Promise<PaymentRecoveryResult> {
    throw new Error("Payment recovery adapter is not provisioned.");
  }
}

export const InjectPaymentRecoveryPort = () => Inject(PAYMENT_RECOVERY_PORT);
