import type {
  BindPaymentMethodCommand,
  PassengerPaymentMethod,
  PaymentMethodResponse,
  PaymentMethodsResponse,
  RemovePaymentMethodResponse,
} from "@drts/contracts";
import type { FetchFn, FetchResponse } from "../client.js";
import { PassengerApiError } from "../auth/errors.js";

function invalidResponse(): never {
  // Do not include a PSP response, credential, or arbitrary upstream message.
  throw new PassengerApiError(
    502,
    "invalid_payment_response",
    "付款資料暫時無法確認",
  );
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalidResponse();
  return value as Record<string, unknown>;
}
function field(
  value: Record<string, unknown>,
  camel: string,
  snake: string,
): unknown {
  const a = value[camel];
  const b = value[snake];
  if (a !== undefined && b !== undefined && a !== b) invalidResponse();
  return a ?? b;
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) invalidResponse();
  return value;
}
export function decodePassengerPaymentMethod(
  value: unknown,
): PassengerPaymentMethod {
  const data = record(value);
  const paymentMethodId = text(
    field(data, "paymentMethodId", "payment_method_id"),
  );
  const last4 = text(data.last4);
  const cardType = text(field(data, "cardType", "card_type"));
  const expiryMonth = text(field(data, "expiryMonth", "expiry_month"));
  const expiryYear = text(field(data, "expiryYear", "expiry_year"));
  const isDefault = field(data, "isDefault", "is_default");
  if (
    !/^\d{4}$/.test(last4) ||
    !/^(0?[1-9]|1[0-2])$/.test(expiryMonth) ||
    !/^\d{4}$/.test(expiryYear) ||
    typeof isDefault !== "boolean"
  )
    invalidResponse();
  return {
    paymentMethodId,
    last4,
    cardType,
    expiryMonth,
    expiryYear,
    isDefault,
  };
}
function decodeMethodResponse(value: unknown): PaymentMethodResponse {
  const data = record(value);
  if (data.status === "pending") return { status: "pending" };
  if (data.status === "action_required") {
    return {
      status: "action_required",
      nextActionUrl: text(field(data, "nextActionUrl", "next_action_url")),
    };
  }
  if (data.status === "completed")
    return {
      status: "completed",
      method: decodePassengerPaymentMethod(data.method),
    };
  return invalidResponse();
}

/** Portable transport. The browser supplies its BFF fetch; no PSP/JWT/storage access. */
export class PassengerPaymentClient {
  constructor(
    private readonly options: { baseUrl: string; fetchFn: FetchFn },
  ) {}
  private async request(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: FetchResponse;
    try {
      response = await this.options.fetchFn(
        `${this.options.baseUrl}/api/passenger-app${path}`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
    } catch {
      throw new PassengerApiError(
        503,
        "unavailable",
        "付款結果暫時無法確認，請勿重複綁定",
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) return invalidResponse();
      throw new PassengerApiError(
        response.status,
        "unavailable",
        "付款服務暫時無法確認",
      );
    }
    if (!response.ok) {
      const envelope =
        payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : {};
      const error =
        envelope.error && typeof envelope.error === "object"
          ? (envelope.error as Record<string, unknown>)
          : {};
      const code =
        typeof envelope.error === "string"
          ? envelope.error
          : typeof error.code === "string"
            ? error.code
            : "unavailable";
      // Keep status/code for lawful UI recovery, not upstream sensitive text/details.
      throw new PassengerApiError(
        response.status,
        code,
        "付款操作未完成，請確認狀態或聯絡客服",
        {},
        error.retryable === true,
      );
    }
    const envelope = record(payload);
    if (!("data" in envelope)) return invalidResponse();
    return envelope.data;
  }
  async getMethods(): Promise<PaymentMethodsResponse> {
    const data = record(await this.request("/payment-methods", "GET"));
    if (!Array.isArray(data.methods)) return invalidResponse();
    const methods = data.methods.map(decodePassengerPaymentMethod);
    if (
      new Set(methods.map((method) => method.paymentMethodId)).size !==
        methods.length ||
      methods.filter((method) => method.isDefault).length > 1
    )
      return invalidResponse();
    return { methods };
  }
  async bindMethod(
    command: BindPaymentMethodCommand,
  ): Promise<PaymentMethodResponse> {
    if (
      typeof command.providerToken !== "string" ||
      command.providerToken.trim().length === 0
    ) {
      throw new PassengerApiError(
        400,
        "invalid_payment_credential",
        "尚未取得一次性付款憑證",
      );
    }
    // Only this formal opaque field can reach our BFF; never spread provider data.
    return decodeMethodResponse(
      await this.request("/payment-methods", "POST", {
        providerToken: command.providerToken,
      }),
    );
  }
  async setDefault(paymentMethodId: string): Promise<PaymentMethodResponse> {
    return decodeMethodResponse(
      await this.request(
        `/payment-methods/${this.segment(paymentMethodId)}/default`,
        "PUT",
        { paymentMethodId },
      ),
    );
  }
  async removeMethod(
    paymentMethodId: string,
  ): Promise<RemovePaymentMethodResponse> {
    const data = record(
      await this.request(
        `/payment-methods/${this.segment(paymentMethodId)}`,
        "DELETE",
      ),
    );
    if (typeof data.success !== "boolean") return invalidResponse();
    return { success: data.success };
  }
  private segment(id: string): string {
    if (typeof id !== "string" || id.trim().length === 0)
      throw new PassengerApiError(
        400,
        "invalid_payment_method",
        "請選擇付款方式",
      );
    return encodeURIComponent(id);
  }
}
