import { Inject, Injectable } from "@nestjs/common";
import type {
  PassengerPaymentMethod,
  PaymentMethodResponse,
  PaymentMethodsResponse,
} from "@drts/contracts";
import { ApiRequestError } from "../../../common/api-envelope";
import {
  MAX_BOUND_CARDS_PER_MEMBER,
  PaymentMethodRepository,
} from "./payment-method.repository";
import { type PaymentRuntime } from "./payment-runtime.config";

export { MAX_BOUND_CARDS_PER_MEMBER };
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
    const existing = await this.repository.list?.(passengerId);
    if (
      Array.isArray(existing) &&
      existing.length >= MAX_BOUND_CARDS_PER_MEMBER
    ) {
      await this.repository.bindingOutcome(
        passengerId,
        claim.idempotencyKey,
        "failed",
      );
      throw new ApiRequestError(
        409,
        "card_limit_exceeded",
        "每個會員最多只能綁定 5 張信用卡，請先移除既有卡片後再新增。",
      );
    }
    let result;
    try {
      result = this.runtime.provider.capturePassengerContext
        ? await this.runtime.provider.bind(credential, claim.idempotencyKey, {
            passengerId,
          })
        : await this.runtime.provider.bind(credential, claim.idempotencyKey);
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

  async createBindingSession(
    passengerId: string,
    options?: {
      email?: string;
      phone?: string;
      idempotencyKey?: string;
      returnUrl?: string;
      orderResultUrl?: string;
      bindingAuthAmountTwd?: number;
    },
  ): Promise<{
    provider: "ecpay";
    merchantToken: string;
    tokenExpireDate: string;
    sandbox: boolean;
    serverType: "Stage" | "Prod";
    sdkScriptUrl: string;
    approvedActionOrigins: readonly string[];
  }> {
    if (
      !this.runtime.provider.available ||
      !this.runtime.cipher ||
      typeof this.runtime.provider.createBindingSession !== "function"
    ) {
      throw new ApiRequestError(
        503,
        "payment_unavailable",
        "Payment provider is not configured.",
      );
    }
    const existing = await this.repository.list(passengerId);
    if (existing.length >= MAX_BOUND_CARDS_PER_MEMBER) {
      throw new ApiRequestError(
        409,
        "card_limit_exceeded",
        "每個會員最多只能綁定 5 張信用卡，請先移除既有卡片後再新增。",
      );
    }
    const email = options?.email?.trim() ?? "";
    const phone = options?.phone?.trim() ?? "";
    if (!email && !phone) {
      throw new ApiRequestError(
        400,
        "validation_error",
        "Binding session requires a verified passenger email or phone.",
      );
    }
    try {
      return await this.runtime.provider.createBindingSession(
        passengerId,
        options,
      );
    } catch {
      throw new ApiRequestError(
        503,
        "payment_unavailable",
        "Payment provider did not acknowledge binding session.",
      );
    }
  }

  async verifyNotification(
    body: unknown,
    context?: { passengerId?: string; idempotencyKey?: string },
  ): Promise<{
    verified: true;
    kind: "bind" | "payment";
    rtnCode: number;
    merchantTradeNo: string | null;
    tradeNo: string | null;
    status: "completed" | "failed" | "pending" | "action_required" | "unknown";
    method?: PassengerPaymentMethod;
    card?: {
      last4: string;
      cardType: string;
      expiryMonth: string;
      expiryYear: string;
    };
  }> {
    if (
      !this.runtime.provider.available ||
      typeof this.runtime.provider.verifyNotification !== "function"
    ) {
      throw new ApiRequestError(
        503,
        "payment_unavailable",
        "Payment provider is not configured.",
      );
    }
    const bodyRecord =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : null;
    const bodyKey =
      typeof bodyRecord?.idempotencyKey === "string" &&
      bodyRecord.idempotencyKey.trim()
        ? bodyRecord.idempotencyKey.trim()
        : undefined;
    const headerKey = context?.idempotencyKey?.trim() || undefined;
    if (headerKey && bodyKey && headerKey !== bodyKey) {
      invalid();
    }
    const envelopePayload =
      bodyRecord?.envelope !== undefined ? bodyRecord.envelope : body;
    let result;
    try {
      result = this.runtime.provider.verifyNotification(envelopePayload);
    } catch {
      throw new ApiRequestError(
        400,
        "invalid_signature",
        "Invalid payment provider notification.",
      );
    }
    if (result.kind === "bind" && result.bindResult) {
      let ownerId =
        context?.passengerId?.trim() || result.passengerId?.trim() || "";
      let resolvedClaim: { idempotencyKey: string; methodId: string } | null =
        null;
      const requestedKey =
        headerKey ?? bodyKey ?? result.idempotencyKey ?? undefined;
      const merchantTradeNo = result.merchantTradeNo?.trim() || undefined;

      if (
        !ownerId &&
        result.merchantMemberId &&
        typeof this.runtime.provider.deriveMerchantMemberId === "function" &&
        typeof this.repository.findBindingByMerchantMember === "function"
      ) {
        const matched = await this.repository.findBindingByMerchantMember(
          (pid) =>
            this.runtime.provider.deriveMerchantMemberId!(pid) ===
            result.merchantMemberId,
          requestedKey,
          merchantTradeNo,
        );
        if (matched) {
          ownerId = matched.passengerId;
          resolvedClaim = {
            idempotencyKey: matched.idempotencyKey,
            methodId: matched.methodId,
          };
        }
      }

      if (
        ownerId &&
        typeof this.runtime.provider.deriveMerchantMemberId === "function"
      ) {
        const expectedMemberId =
          this.runtime.provider.deriveMerchantMemberId(ownerId);
        if (
          !result.merchantMemberId ||
          expectedMemberId !== result.merchantMemberId
        ) {
          throw new ApiRequestError(
            400,
            "invalid_credential",
            "Payment notification member identity does not match passenger.",
          );
        }
      }

      let completedMethod: PassengerPaymentMethod | undefined;
      if (ownerId && this.runtime.cipher) {
        const claim =
          resolvedClaim ??
          (typeof this.repository.findActionRequiredBinding === "function"
            ? await this.repository.findActionRequiredBinding(
                ownerId,
                requestedKey,
                merchantTradeNo,
              )
            : null);
        if (claim) {
          if (result.bindResult.status === "completed") {
            const card = result.bindResult.card;
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
            ) {
              throw new ApiRequestError(
                502,
                "payment_provider_invalid",
                "Payment provider returned an invalid result.",
              );
            }
            const now = new Date();
            if (
              Number(card.expiryYear) < now.getUTCFullYear() ||
              (Number(card.expiryYear) === now.getUTCFullYear() &&
                Number(card.expiryMonth) < now.getUTCMonth() + 1)
            ) {
              throw new ApiRequestError(
                400,
                "card_declined",
                "Payment method could not be bound.",
              );
            }
            if (
              result.merchantTradeNo &&
              result.tradeNo &&
              result.authorizedAmountMinor &&
              result.authorizedAmountMinor > 0 &&
              typeof this.runtime.provider.cancelBindingAuthorization ===
                "function"
            ) {
              const cancelled =
                await this.runtime.provider.cancelBindingAuthorization({
                  merchantTradeNo: result.merchantTradeNo,
                  tradeNo: result.tradeNo,
                  amountMinor: result.authorizedAmountMinor,
                });
              if (!cancelled && !this.runtime.provider.sandbox) {
                await this.repository.bindingOutcome(
                  ownerId,
                  claim.idempotencyKey,
                  "pending",
                );
                throw new ApiRequestError(
                  503,
                  "payment_unavailable",
                  "Payment provider did not confirm binding authorization cancellation.",
                );
              }
            }
            completedMethod = await this.repository.completeBinding(
              ownerId,
              claim.idempotencyKey,
              {
                paymentMethodId: claim.methodId,
                drtsPassengerId: ownerId,
                provider: this.runtime.provider.name,
                tokenEnvelope: this.runtime.cipher.encrypt(
                  card.token,
                  ownerId,
                  claim.methodId,
                ),
                last4: card.last4,
                cardType: card.cardType,
                expiryMonth: card.expiryMonth,
                expiryYear: card.expiryYear,
                isDefault: false,
              },
            );
          } else if (result.bindResult.status === "failed") {
            await this.repository.bindingOutcome(
              ownerId,
              claim.idempotencyKey,
              "failed",
              result.bindResult.error,
            );
          }
        }
      }
      const effectiveStatus =
        result.bindResult.status === "completed"
          ? completedMethod
            ? "completed"
            : "unknown"
          : result.bindResult.status;
      return {
        verified: true,
        kind: "bind",
        rtnCode: result.rtnCode,
        merchantTradeNo: result.merchantTradeNo,
        tradeNo: result.tradeNo,
        status: effectiveStatus,
        ...(completedMethod ? { method: completedMethod } : {}),
        ...(completedMethod && result.bindResult.status === "completed"
          ? {
              card: {
                last4: result.bindResult.card.last4,
                cardType: result.bindResult.card.cardType,
                expiryMonth: result.bindResult.card.expiryMonth,
                expiryYear: result.bindResult.card.expiryYear,
              },
            }
          : {}),
      };
    }
    return {
      verified: true,
      kind: result.kind,
      rtnCode: result.rtnCode,
      merchantTradeNo: result.merchantTradeNo,
      tradeNo: result.tradeNo,
      status: result.paymentResult?.status ?? "unknown",
    };
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
    const canonicalId = paymentMethodId(id);
    if (typeof this.runtime.provider.unbind === "function") {
      if (!this.runtime.provider.available || !this.runtime.cipher) {
        throw new ApiRequestError(
          503,
          "payment_unavailable",
          "Payment provider is not configured.",
        );
      }
      if (typeof this.repository.findRemovableToken === "function") {
        const removable = await this.repository.findRemovableToken(
          passengerId,
          canonicalId,
        );
        if (
          removable.tokenEnvelope &&
          (!removable.provider ||
            removable.provider === this.runtime.provider.name)
        ) {
          let token: string;
          try {
            token = this.runtime.cipher.decrypt(
              removable.tokenEnvelope,
              passengerId,
              canonicalId,
            );
          } catch {
            throw new ApiRequestError(
              503,
              "payment_persistence_unavailable",
              "Payment persistence is unavailable.",
            );
          }
          let unbound = false;
          try {
            unbound = await this.runtime.provider.unbind(token, {
              passengerId,
            });
          } catch {
            unbound = false;
          }
          if (!unbound) {
            throw new ApiRequestError(
              503,
              "payment_unavailable",
              "Payment provider did not acknowledge card unbinding.",
            );
          }
        }
      }
    }
    await this.repository.remove(passengerId, canonicalId);
    return { success: true };
  }
}
