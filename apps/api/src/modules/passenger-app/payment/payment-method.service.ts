import { Inject, Injectable } from "@nestjs/common";
import type {
  PaymentMethodResponse,
  PaymentMethodsResponse,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import { PaymentMethodRepository } from "./payment-method.repository";
import { type PaymentRuntime } from "./payment-runtime.config";

export const PAYMENT_RUNTIME = Symbol("PAYMENT_RUNTIME");

function invalid(): never {
  throw new ApiRequestError(
    400,
    "validation_error",
    "Invalid payment command.",
  );
}
export function paymentMethodId(raw: unknown): string {
  if (
    typeof raw !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  )
    invalid();
  return raw.toLowerCase();
}

@Injectable()
export class PaymentMethodService {
  constructor(
    private readonly repository: PaymentMethodRepository,
    @Inject(PAYMENT_RUNTIME) private readonly runtime: PaymentRuntime,
  ) {}

  async list(passengerId: string): Promise<PaymentMethodsResponse> {
    return { methods: await this.repository.list(passengerId) };
  }

  async getReceiptDisplay(
    passengerId: string,
    tokenRef: unknown,
  ): Promise<string | null> {
    // Legacy/non-passenger orders can have no bound method. They must keep
    // reporting missing receipt facts rather than inventing a payment label.
    if (
      !passengerId ||
      typeof tokenRef !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        tokenRef,
      )
    )
      return null;
    return this.repository.findReceiptDisplay(
      passengerId,
      paymentMethodId(tokenRef),
    );
  }

  async bind(
    passengerId: string,
    body: unknown,
  ): Promise<PaymentMethodResponse> {
    if (!body || typeof body !== "object" || Array.isArray(body)) invalid();
    const fields = Object.keys(body);
    const field = fields[0];
    if (
      fields.length !== 1 ||
      !field ||
      !["providerToken", "provider_token"].includes(field)
    )
      invalid();
    const credential: unknown = (body as Record<string, unknown>)[field];
    // Opaque PSP credential only. Unknown fields never reach the adapter or
    // persistence. Numeric/card-shaped input is not a supported credential.
    if (
      typeof credential !== "string" ||
      credential.length < 16 ||
      credential.length > 2048 ||
      !/^[A-Za-z0-9_.:-]+$/.test(credential) ||
      /^[0-9 -]+$/.test(credential)
    )
      invalid();
    if (!this.runtime.provider.available || !this.runtime.cipher)
      throw new ApiRequestError(
        503,
        "payment_unavailable",
        "Payment provider is not configured.",
      );
    const claim = await this.repository.claimBinding(
      passengerId,
      this.runtime.provider.name,
      credential,
    );
    if (claim.completed)
      return { status: "completed", method: claim.completed };
    let result;
    try {
      result = await this.runtime.provider.bind(
        credential,
        claim.idempotencyKey,
      );
    } catch {
      // Retain the committed pending claim for the same owner's replay. Do not
      // erase it and do not expose provider exceptions/credentials in errors.
      throw new ApiRequestError(
        503,
        "payment_unavailable",
        "Payment provider did not acknowledge binding.",
      );
    }
    if (
      !result ||
      !["completed", "failed", "pending", "action_required"].includes(
        result.status,
      )
    )
      throw new ApiRequestError(
        502,
        "payment_provider_invalid",
        "Payment provider returned an invalid result.",
      );
    if (result.status === "failed") {
      if (!["card_declined", "invalid_credential"].includes(result.error))
        throw new ApiRequestError(
          502,
          "payment_provider_invalid",
          "Payment provider returned an invalid result.",
        );
      await this.repository.bindingOutcome(
        passengerId,
        claim.idempotencyKey,
        "failed",
        result.error,
      );
      throw new ApiRequestError(
        400,
        result.error,
        "Payment method could not be bound.",
      );
    }
    if (result.status === "pending" || result.status === "action_required") {
      if (result.status === "action_required") {
        if (
          typeof result.nextActionUrl !== "string" ||
          result.nextActionUrl.length > 2048
        )
          throw new ApiRequestError(
            502,
            "payment_provider_invalid",
            "Payment provider returned an invalid result.",
          );
        let target: URL;
        try {
          target = new URL(result.nextActionUrl);
        } catch {
          invalid();
        }
        if (
          target.protocol !== "https:" ||
          target.username ||
          target.password ||
          target.hash
        )
          invalid();
      }
      await this.repository.bindingOutcome(
        passengerId,
        claim.idempotencyKey,
        result.status,
      );
      return result.status === "pending"
        ? { status: "pending" }
        : { status: "action_required", nextActionUrl: result.nextActionUrl };
    }
    const card = result.card;
    if (
      !card ||
      typeof card.token !== "string" ||
      !card.token ||
      card.token.length > 4096 ||
      /^[0-9 -]+$/.test(card.token) ||
      typeof card.last4 !== "string" ||
      typeof card.cardType !== "string" ||
      typeof card.expiryMonth !== "string" ||
      typeof card.expiryYear !== "string" ||
      !/^[0-9]{4}$/.test(card.last4) ||
      !/^[A-Za-z0-9 _-]{1,40}$/.test(card.cardType) ||
      !/^(0[1-9]|1[0-2])$/.test(card.expiryMonth) ||
      !/^[0-9]{4}$/.test(card.expiryYear)
    )
      throw new ApiRequestError(
        502,
        "payment_provider_invalid",
        "Payment provider returned an invalid result.",
      );
    const now = new Date();
    if (
      Number(card.expiryYear) < now.getUTCFullYear() ||
      (Number(card.expiryYear) === now.getUTCFullYear() &&
        Number(card.expiryMonth) < now.getUTCMonth() + 1)
    )
      throw new ApiRequestError(
        400,
        "card_declined",
        "Payment method could not be bound.",
      );
    const method = await this.repository.completeBinding(
      passengerId,
      claim.idempotencyKey,
      {
        paymentMethodId: claim.methodId,
        drtsPassengerId: passengerId,
        provider: this.runtime.provider.name,
        tokenEnvelope: this.runtime.cipher.encrypt(
          card.token,
          passengerId,
          claim.methodId,
        ),
        last4: card.last4,
        cardType: card.cardType,
        expiryMonth: card.expiryMonth,
        expiryYear: card.expiryYear,
        isDefault: false,
      },
    );
    return { status: "completed", method };
  }

  async setDefault(
    passengerId: string,
    id: unknown,
  ): Promise<PaymentMethodResponse> {
    return {
      status: "completed",
      method: await this.repository.setDefault(
        passengerId,
        paymentMethodId(id),
      ),
    };
  }
  async remove(
    passengerId: string,
    id: unknown,
  ): Promise<{ success: boolean }> {
    await this.repository.remove(passengerId, paymentMethodId(id));
    return { success: true };
  }
}
