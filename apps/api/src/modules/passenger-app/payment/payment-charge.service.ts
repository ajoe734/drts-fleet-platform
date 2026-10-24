import { Inject, Injectable, Optional } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { ApiRequestError } from "../../../common/api-envelope";
import {
  OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT,
  type OwnedMobilityMultiTaxiTripCompletedEvent,
} from "../../owned-mobility/owned-mobility-events";
import { PAYMENT_RUNTIME } from "./payment-method.service";
import { paymentMethodId } from "./payment-method.service";
import type { PaymentRuntime } from "./payment-runtime.config";
import {
  PAYMENT_CAPTURE_POLICY,
  captureDisposition,
  validatePaymentCapturePolicy,
  type PaymentCapturePolicy,
} from "./payment-capture.policy";
import {
  PaymentChargeRepository,
  type PaymentChargeSession,
  type StoredCharge,
} from "./payment-charge.repository";
import type { MoneyResult } from "./payment-provider.port";

@Injectable()
export class PaymentChargeService {
  private readonly policy: PaymentCapturePolicy | null;

  constructor(
    private readonly repository: PaymentChargeRepository,
    @Inject(PAYMENT_RUNTIME) private readonly runtime: PaymentRuntime,
    @Optional()
    @Inject(PAYMENT_CAPTURE_POLICY)
    policy?: PaymentCapturePolicy | null,
  ) {
    // No invented financial schedule. Missing policy leaves durable obligations
    // unpaid and never presents money; explicit malformed policy fails startup.
    this.policy = policy == null ? null : validatePaymentCapturePolicy(policy);
  }

  @OnEvent(OWNED_MOBILITY_MULTI_TAXI_TRIP_COMPLETED_EVENT, {
    async: true,
    suppressErrors: false,
  })
  async onTripCompleted(
    event: OwnedMobilityMultiTaxiTripCompletedEvent,
  ): Promise<void> {
    if (!event) {
      throw new ApiRequestError(
        400,
        "payment_completion_invalid",
        "Completed trip payment fields are invalid.",
      );
    }
    // Only formal V0113 UUID orders can belong to a first-party account.
    // Legacy guest demo IDs must not acquire a new listener failure.
    if (
      typeof event.orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        event.orderId,
      )
    )
      return;
    const orderId = paymentMethodId(event.orderId);
    await this.repository.withOrder(orderId, async (session) => {
      const charge = await session.initialize({ ...event, orderId });
      if (charge) await this.execute(session, charge, new Date());
    });
  }

  isCaptureConfigured(): boolean {
    return (
      this.policy !== null &&
      this.runtime.provider.available &&
      this.runtime.cipher !== null
    );
  }

  isRecoveryNoticeConfigured(): boolean {
    return this.repository.isRecoveryNoticeConfigured();
  }

  async processRecoveryNotice(orderId: string): Promise<void> {
    if (!this.isRecoveryNoticeConfigured()) return;
    await this.repository.withOrder(paymentMethodId(orderId), (session) =>
      session.enqueueRecoveryNotice(),
    );
  }

  async beginManualRecovery(
    orderId: string,
    paymentId: string,
  ): Promise<boolean> {
    return this.repository.withOrder(
      paymentMethodId(orderId),
      async (session) => {
        const charge = await session.load();
        if (!charge) return false;
        if (
          charge.paymentId !== paymentId ||
          !["failed", "manual_recovery"].includes(charge.status)
        ) {
          throw new ApiRequestError(
            409,
            "payment_state_conflict",
            "Payment cannot enter manual recovery.",
          );
        }
        if (charge.status !== "manual_recovery") {
          const claim = await session.begin(charge, "settle");
          await session.finish(claim, {
            status: "manual_recovery",
            error: charge.lastError ?? "unknown",
            nextOperation: null,
            retryAt: null,
            requestRecoveryNotice: true,
          });
        }
        return true;
      },
    );
  }

  /** Existing durable state, not another completion payload, owns retries. The
   * future hosted drain and Ops adapter use the same one-order executor.
   */
  async processOrder(orderId: string, now = new Date()): Promise<void> {
    if (!Number.isFinite(now.getTime()))
      throw new Error("payment_clock_invalid");
    await this.repository.withOrder(
      paymentMethodId(orderId),
      async (session) => {
        const charge = await session.load();
        if (charge) await this.execute(session, charge, now);
      },
    );
  }

  private async execute(
    session: PaymentChargeSession,
    charge: StoredCharge,
    now: Date,
  ): Promise<void> {
    const policy = this.policy;
    if (
      !policy ||
      !this.runtime.provider.available ||
      !this.runtime.cipher ||
      !["not_selected", "failed"].includes(charge.status) ||
      (charge.retryAt && Date.parse(charge.retryAt) > now.getTime())
    )
      return;
    const operation = charge.nextOperation;
    if (!operation) return;
    // A crash leaves nextOperation=readback even if the initial COMMIT response
    // was lost. Never re-present that operation as another capture.
    const exhausted =
      operation === "readback"
        ? charge.readbackCount >= policy.unknownReadbackDelaysMs.length
        : charge.attemptCount >= 1 + policy.retryDelaysMs.length;
    const claim = await session.begin(charge, exhausted ? "settle" : operation);
    let result: MoneyResult =
      exhausted && operation === "capture"
        ? { status: "failed", error: "unavailable", retryable: false }
        : { status: "unknown" };
    if (!exhausted) {
      try {
        if (claim.provider !== this.runtime.provider.name) {
          // Never ask another PSP to acknowledge this provider's operation.
          result =
            operation === "readback"
              ? { status: "unknown" }
              : { status: "failed", error: "invalid_method", retryable: false };
        } else if (operation === "readback") {
          // Reading an old operation does not require a still-active card.
          result = await this.runtime.provider.readCapture(claim.key);
        } else if (
          !claim.methodActive ||
          !claim.tokenEnvelope ||
          claim.provider !== this.runtime.provider.name
        ) {
          result = {
            status: "failed",
            error: "invalid_method",
            retryable: false,
          };
        } else {
          const token = this.runtime.cipher.decrypt(
            claim.tokenEnvelope,
            claim.passengerId,
            claim.methodId,
          );
          result = await this.runtime.provider.capture({
            idempotencyKey: claim.key,
            token,
            amountMinor: claim.amountMinor,
            currency: "TWD",
            ...(this.runtime.provider.capturePassengerContext
              ? { passengerId: claim.passengerId }
              : {}),
            ...(this.runtime.provider.captureAttemptMetadata
              ? { attemptCount: claim.attemptCount }
              : {}),
          });
        }
      } catch {
        // Thrown exceptions (including raw PSP/crypto messages) are unknown;
        // never exposed, logged, or treated as definitive decline.
        result = { status: "unknown" };
      }
    }
    let decision;
    try {
      decision = captureDisposition(policy, {
        result,
        attemptCount: claim.attemptCount,
        readbackCount: claim.readbackCount,
        now,
      });
    } catch {
      // Malformed/accepted responses cannot assert captured. Preserve original
      // operation for bounded readback, just like a lost acknowledgement.
      decision = captureDisposition(policy, {
        result: { status: "unknown" },
        attemptCount: claim.attemptCount,
        readbackCount: claim.readbackCount,
        now,
      });
    }
    await session.finish(claim, decision);
  }
}
