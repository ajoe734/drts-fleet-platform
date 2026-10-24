/** Hosted fields belong to the contracted PSP. This boundary accepts opaque
 * one-use credentials and provider tokens only; never card input fields.
 *
 * Adapter requirements: bind keys are scoped to one credential and passenger;
 * capture keys identify one order for its entire lifetime. Replays (including
 * after unknown acknowledgement) must never create another successful charge.
 * Readback must report the original operation, not infer success from a timeout.
 * A definitive failed capture may be retried under the same order key; adapters
 * that cannot provide this guarantee must remain unavailable.
 * Refund keys identify the single full refund of an order; readRefund must
 * resolve that original operation after a lost acknowledgement. Core never
 * re-presents an unknown refund as another money request.
 */
export interface ProviderCard {
  token: string;
  last4: string;
  cardType: string;
  expiryMonth: string;
  expiryYear: string;
}

export type BindResult =
  | { status: "completed"; card: ProviderCard }
  | { status: "action_required"; nextActionUrl: string }
  | { status: "pending" }
  | { status: "failed"; error: "card_declined" | "invalid_credential" };

export type PaymentBindResult = BindResult;

export interface PaymentBindContext {
  passengerId?: string;
}

/** An unacknowledged request is unknown, not declined and not captured. */
export type MoneyResult =
  | { status: "completed"; providerRef: string }
  | { status: "pending" }
  | { status: "unknown" }
  | {
      status: "failed";
      error: "card_declined" | "unavailable" | "invalid_method";
      retryable: boolean;
    };

export interface CaptureCommand {
  idempotencyKey: string;
  token: string;
  amountMinor: number;
  currency: "TWD";
  /** Durable attempt metadata for an explicitly selected external simulator.
   * It is not part of the PSP operation identity or a request to charge twice.
   */
  attemptCount?: number;
}

export type PaymentCaptureCommand = CaptureCommand;

export interface RefundCommand {
  idempotencyKey: string;
  captureRef: string;
  amountMinor: number;
  currency: "TWD";
}

export type PaymentRefundCommand = RefundCommand;

export interface PaymentProviderPort {
  readonly name: string;
  readonly available: boolean;
  readonly captureAttemptMetadata?: boolean;
  bind(
    credential: string,
    idempotencyKey: string,
    context?: PaymentBindContext,
  ): Promise<BindResult>;
  createBindingSession?(
    passengerId: string,
    options?: {
      idempotencyKey?: string;
      returnUrl?: string;
      orderResultUrl?: string;
    },
  ): Promise<{
    provider: "ecpay";
    merchantToken: string;
    tokenExpireDate: string;
    sandbox: boolean;
    serverType: "Stage" | "Prod";
    sdkScriptUrl: string;
    approvedActionOrigins: readonly string[];
  }>;
  verifyNotification?(envelope: unknown): {
    kind: "bind" | "payment";
    rtnCode: number;
    rtnMsg: string;
    merchantTradeNo: string | null;
    tradeNo: string | null;
    bindResult?: BindResult;
    paymentResult?: MoneyResult;
  };
  capture(command: CaptureCommand): Promise<MoneyResult>;
  readCapture(idempotencyKey: string): Promise<MoneyResult>;
  refund(command: RefundCommand): Promise<MoneyResult>;
  readRefund(idempotencyKey: string): Promise<MoneyResult>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

/** All missing/partial/uncontracted providers fail closed without network I/O. */
export class UnconfiguredPaymentProvider implements PaymentProviderPort {
  readonly name = "unconfigured";
  readonly available = false;
  async bind(): Promise<BindResult> {
    return { status: "pending" };
  }
  async capture(): Promise<MoneyResult> {
    return { status: "failed", error: "unavailable", retryable: true };
  }
  async readCapture(): Promise<MoneyResult> {
    return { status: "unknown" };
  }
  async refund(): Promise<MoneyResult> {
    return { status: "failed", error: "unavailable", retryable: true };
  }
  async readRefund(): Promise<MoneyResult> {
    return { status: "unknown" };
  }
}
