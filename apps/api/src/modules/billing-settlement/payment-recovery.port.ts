import { Inject, Injectable } from "@nestjs/common";
import { PaymentChargeService } from "../passenger-app/payment/payment-charge.service";

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
  /** The passenger core already wrote both authorities and attempt counters. */
  passengerLedgerManaged?: true;
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

/**
 * `retry_capture` would re-present a failed charge to a real card/PSP
 * processor; no such processor is integrated anywhere in this repository
 * (confirmed by inventory in docs/04-uat/audit-recovery-providers-20261002.md),
 * so it stays unavailable pending SR-LIVE-FINANCE-001's authorized sandbox.
 *
 * `begin_manual_recovery` has no external side effect: it only records that
 * an operator is taking the failed payment outside the automated system for
 * manual reconciliation. `BillingSettlementRepository
 * .completeMultiTaxiPaymentRecoveryCommand` already persists that as
 * `multi_taxi_passenger_payments.status = 'manual_recovery'` regardless of
 * which port is wired, so accepting it here does not fabricate a provider
 * outcome -- it only confirms the handoff the caller asked for.
 */
@Injectable()
export class PlatformManualPaymentRecoveryPort implements PaymentRecoveryPort {
  isAvailable(action: PaymentRecoveryAction): boolean {
    return action === "begin_manual_recovery";
  }

  async recover(action: PaymentRecoveryAction): Promise<PaymentRecoveryResult> {
    if (action !== "begin_manual_recovery") {
      throw new Error("Payment recovery adapter is not provisioned.");
    }
    return { status: "accepted" };
  }
}

/** First-party manual recovery goes through the same fenced charge writer and
 * durable notice as automatic exhaustion. Legacy guest/partner payments keep
 * their existing internal manual handoff; neither path invents a PSP capture.
 */
@Injectable()
export class PassengerCoreManualPaymentRecoveryPort implements PaymentRecoveryPort {
  constructor(private readonly passengerPayments: PaymentChargeService) {}

  isAvailable(action: PaymentRecoveryAction): boolean {
    return action === "begin_manual_recovery";
  }

  async recover(
    action: PaymentRecoveryAction,
    payment: PaymentRecoverySubject,
  ): Promise<PaymentRecoveryResult> {
    if (action !== "begin_manual_recovery")
      throw new Error("Payment recovery adapter is not provisioned.");
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
      uuid.test(payment.orderId) &&
      (await this.passengerPayments.beginManualRecovery(
        payment.orderId,
        payment.paymentId,
      ))
    ) {
      return { status: "accepted", passengerLedgerManaged: true };
    }
    return { status: "accepted" };
  }
}

export const InjectPaymentRecoveryPort = () => Inject(PAYMENT_RECOVERY_PORT);
