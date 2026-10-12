import { Inject, Injectable } from "@nestjs/common";
import type { RefundPassengerRideResponse } from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PAYMENT_RUNTIME, paymentMethodId } from "./payment-method.service";
import type { PaymentRuntime } from "./payment-runtime.config";
import type { MoneyResult } from "./payment-provider.port";
import { PaymentRefundRepository } from "./payment-refund.repository";

@Injectable()
export class PaymentRefundService {
  constructor(
    private readonly repository: PaymentRefundRepository,
    @Inject(PAYMENT_RUNTIME) private readonly runtime: PaymentRuntime,
  ) {}

  async refund(
    identity: RequestIdentity | null,
    orderId: string,
    body: unknown,
  ): Promise<RefundPassengerRideResponse> {
    if (
      !identity ||
      identity.realm !== "platform" ||
      identity.actorType !== "platform_admin" ||
      !identity.actorId ||
      identity.tenantId !== null ||
      !identity.scopes.includes("billing:write")
    )
      throw new ApiRequestError(
        403,
        "forbidden",
        "Platform billing authority is required.",
      );
    const id = paymentMethodId(orderId);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((field) => field !== "reason")
    )
      throw new ApiRequestError(
        400,
        "invalid_request",
        "Only a reason is accepted for a full ride refund.",
      );
    const reason = (body as Record<string, unknown>).reason;
    if (
      typeof reason !== "string" ||
      !reason.trim() ||
      reason.length > 500 ||
      Array.from(reason).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      )
    )
      throw new ApiRequestError(
        400,
        "invalid_request",
        "A valid refund reason is required.",
      );
    return this.repository.withRefundOrder(id, async (session) => {
      const charge = await session.load();
      if (!charge)
        throw new ApiRequestError(
          404,
          "not_found",
          "Passenger payment was not found.",
        );
      const prior = await session.loadRefund();
      if (prior && prior.reason !== reason.trim())
        throw new ApiRequestError(
          409,
          "invalid_state",
          "Refund request does not match the original operation.",
        );
      if (
        prior?.state === "completed" &&
        charge.status === "refunded" &&
        prior.providerRef
      )
        return { success: true, refundId: prior.key };
      if (charge.status !== "captured" || prior?.state === "failed")
        throw new ApiRequestError(
          409,
          "invalid_state",
          "Payment is not eligible for a refund.",
        );
      if (
        !this.runtime.provider.available ||
        charge.provider !== this.runtime.provider.name
      )
        throw new ApiRequestError(
          503,
          "payment_provider_unavailable",
          "The original payment provider is unavailable.",
        );
      const claim = await session.beginRefund(
        charge,
        identity.actorId!,
        reason.trim(),
      );
      let result: MoneyResult;
      try {
        result =
          claim.operation === "readback"
            ? await this.runtime.provider.readRefund(claim.refund.key)
            : await this.runtime.provider.refund({
                idempotencyKey: claim.refund.key,
                captureRef: claim.charge.providerCaptureRef!,
                amountMinor: claim.charge.amountMinor,
                currency: "TWD",
              });
      } catch {
        result = { status: "unknown" };
      }
      // Whitelist the PSP result; raw fields/errors must never become receipts.
      const validRef =
        result?.status === "completed" &&
        typeof result.providerRef === "string" &&
        !!result.providerRef.trim() &&
        result.providerRef.length <= 255 &&
        !Array.from(result.providerRef).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        );
      const failed =
        result?.status === "failed" &&
        ["card_declined", "unavailable", "invalid_method"].includes(
          result.error,
        ) &&
        typeof result.retryable === "boolean";
      await session.finishRefund(claim, {
        state: validRef ? "completed" : failed ? "failed" : "unknown",
        providerRef:
          validRef && result.status === "completed" ? result.providerRef : null,
        error: failed && result.status === "failed" ? result.error : null,
      });
      if (!validRef)
        throw new ApiRequestError(
          failed ? 409 : 503,
          failed ? "payment_refund_failed" : "payment_processing_pending",
          failed
            ? "The refund did not complete."
            : "Refund acknowledgement is pending readback.",
        );
      return { success: true, refundId: claim.refund.key };
    });
  }
}
