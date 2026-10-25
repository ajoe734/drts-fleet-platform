import {
  assertEcpayHashMaterial,
  buildEcpayEnvelope,
  deriveEcpayMerchantMemberId,
  deriveEcpayMerchantTradeNo,
  formatEcpayTradeDate,
  normalizeEcpayPhone,
  verifyAndUnwrapEcpayEnvelope,
} from "./ecpay-cipher";
import type {
  MoneyResult,
  PaymentBindResult,
  PaymentCaptureCommand,
  PaymentProviderPort,
  PaymentRefundCommand,
} from "./payment-provider.port";

export const ECPAY_STAGE_BASE_URL = "https://ecpg-stage.ecpay.com.tw";
export const ECPAY_PROD_BASE_URL = "https://ecpg.ecpay.com.tw";
export const ECPAY_STAGE_PAYMENT_BASE_URL =
  "https://ecpayment-stage.ecpay.com.tw";
export const ECPAY_PROD_PAYMENT_BASE_URL = "https://ecpayment.ecpay.com.tw";
export const ECPAY_MIN_TIMEOUT_MS = 30_000;
export const ECPAY_DEFAULT_TIMEOUT_MS = 35_000;
export const ECPAY_MINOR_UNITS_PER_TWD = 100;
export const ECPAY_DEFAULT_BINDING_AUTH_AMOUNT_TWD = 5;
export const ECPAY_MAX_SINGLE_CHARGE_TWD = 200_000;
export const ECPAY_MAX_SINGLE_CHARGE_MINOR =
  ECPAY_MAX_SINGLE_CHARGE_TWD * ECPAY_MINOR_UNITS_PER_TWD;

/**
 * Converts internal minor TWD units (1 TWD = 100 minor units) to whole integer
 * TWD (1 .. 200,000) required by ECPay TotalAmount. Rejects non-whole-TWD
 * amounts without inventing rounding.
 */
export function minorUnitsToWholeTwd(amountMinor: number): number | null {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor % ECPAY_MINOR_UNITS_PER_TWD !== 0
  ) {
    return null;
  }
  const twd = amountMinor / ECPAY_MINOR_UNITS_PER_TWD;
  if (
    !Number.isSafeInteger(twd) ||
    twd < 1 ||
    twd > ECPAY_MAX_SINGLE_CHARGE_TWD
  ) {
    return null;
  }
  return twd;
}

export type EcpayFetchFn = (
  url: string,
  init: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface EcpayProviderOptions {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  sandbox: boolean;
  timeoutMs?: number;
  returnUrl?: string;
  orderResultUrl?: string;
  bindingAuthAmountTwd?: number;
  fetchFn?: EcpayFetchFn;
  now?: () => Date;
}

export interface EcpayBindingSession {
  provider: "ecpay";
  merchantToken: string;
  tokenExpireDate: string;
  sandbox: boolean;
  serverType: "Stage" | "Prod";
  sdkScriptUrl: string;
  approvedActionOrigins: readonly string[];
}

export interface VerifiedEcpayNotification {
  kind: "bind" | "payment";
  rtnCode: number;
  rtnMsg: string;
  merchantTradeNo: string | null;
  tradeNo: string | null;
  merchantMemberId?: string | null;
  passengerId?: string | null;
  idempotencyKey?: string | null;
  authorizedAmountMinor?: number | null;
  bindResult?: PaymentBindResult;
  paymentResult?: MoneyResult;
}

const INVALID_CREDENTIAL_CODES = new Set([
  10100050, // Token invalid or expired
  10100051, // Token not found
  10100250, // BindCardPayToken invalid
  10100251, // BindCardPayToken expired
  10100256, // Member binding token mismatch
]);

const INVALID_METHOD_CODES = new Set([
  10100058, // Card ID invalid
  10100252, // BindCardID not found or unbound
  10100253, // BindCardID does not belong to this MerchantID
  10100254, // BindCardID suspended or revoked
]);

const UNAVAILABLE_CODES = new Set([
  10100001, // System busy / maintenance
  10100002, // Gateway timeout
  99999999, // Upstream bank connection unavailable
]);

const PENDING_CONFIRMATION_CODES = new Set([
  10300066, // 交易結果待確認 (awaiting QueryTrade confirmation; not a terminal decline)
]);

const SHARED_DECLINED_BIND_CARD_IDS = new Set<string>();
const SHARED_CANCELLED_BINDING_AUTH_TRADES = new Set<string>();

function inferCardBrand(cardInfo: Record<string, unknown>): string {
  const explicit =
    typeof cardInfo.CardType === "string" && cardInfo.CardType.trim()
      ? cardInfo.CardType.trim()
      : typeof cardInfo.Brand === "string" && cardInfo.Brand.trim()
        ? cardInfo.Brand.trim()
        : "";
  if (explicit && /^[A-Za-z0-9 _-]{1,40}$/.test(explicit)) {
    return explicit.toUpperCase();
  }
  const card6 =
    typeof cardInfo.Card6No === "string" ? cardInfo.Card6No.trim() : "";
  if (/^4\d{5}$/.test(card6)) return "VISA";
  if (
    /^(5[1-5]\d{4}|2(22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)\d{2})$/.test(
      card6,
    )
  )
    return "MASTERCARD";
  if (/^35\d{4}$/.test(card6)) return "JCB";
  if (/^3[47]\d{4}$/.test(card6)) return "AMEX";
  return "CREDIT";
}

function parseCardExpiry(cardInfo: Record<string, unknown>): {
  expiryMonth: string;
  expiryYear: string;
} | null {
  const rawValidMM =
    typeof cardInfo.CardValidMM === "string" ||
    typeof cardInfo.CardValidMM === "number"
      ? String(cardInfo.CardValidMM).trim()
      : "";
  const rawValidYY =
    typeof cardInfo.CardValidYY === "string" ||
    typeof cardInfo.CardValidYY === "number"
      ? String(cardInfo.CardValidYY).trim()
      : "";
  if (rawValidMM && rawValidYY) {
    const mm = Number(rawValidMM);
    if (Number.isSafeInteger(mm) && mm >= 1 && mm <= 12) {
      const expiryMonth = String(mm).padStart(2, "0");
      if (/^\d{2}$/.test(rawValidYY)) {
        return { expiryMonth, expiryYear: `20${rawValidYY}` };
      }
      if (/^\d{4}$/.test(rawValidYY)) {
        return { expiryMonth, expiryYear: rawValidYY };
      }
    }
  }
  if (
    typeof cardInfo.ExpiryMonth === "string" &&
    typeof cardInfo.ExpiryYear === "string" &&
    /^(0[1-9]|1[0-2])$/.test(cardInfo.ExpiryMonth) &&
    /^\d{4}$/.test(cardInfo.ExpiryYear)
  ) {
    return {
      expiryMonth: cardInfo.ExpiryMonth,
      expiryYear: cardInfo.ExpiryYear,
    };
  }
  const raw =
    typeof cardInfo.ExpireDate === "string"
      ? cardInfo.ExpireDate.trim()
      : typeof cardInfo.CardValidYYMM === "string"
        ? cardInfo.CardValidYYMM.trim()
        : "";
  const slashMatch = /^(\d{2})\/(\d{2}|\d{4})$/.exec(raw);
  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = slashMatch[2]!;
    if (second.length === 4 && first >= 1 && first <= 12) {
      return {
        expiryMonth: String(first).padStart(2, "0"),
        expiryYear: second,
      };
    }
    if (first >= 1 && first <= 12) {
      return {
        expiryMonth: String(first).padStart(2, "0"),
        expiryYear: `20${second}`,
      };
    }
  }
  const yearSlashMatch = /^(\d{4})\/(\d{2})$/.exec(raw);
  if (yearSlashMatch) {
    const mm = Number(yearSlashMatch[2]);
    if (mm >= 1 && mm <= 12) {
      return {
        expiryMonth: String(mm).padStart(2, "0"),
        expiryYear: yearSlashMatch[1]!,
      };
    }
  }
  if (/^\d{4}$/.test(raw)) {
    const a = Number(raw.slice(0, 2));
    const b = Number(raw.slice(2, 4));
    // ECPay YYMM standard (e.g. "3112" -> 2031/12) vs MMYY ("1231" -> 12/2031)
    if (b >= 1 && b <= 12 && (a > 12 || a >= 25)) {
      return {
        expiryMonth: String(b).padStart(2, "0"),
        expiryYear: `20${String(a).padStart(2, "0")}`,
      };
    }
    if (a >= 1 && a <= 12 && b > 12) {
      return {
        expiryMonth: String(a).padStart(2, "0"),
        expiryYear: `20${String(b).padStart(2, "0")}`,
      };
    }
    if (b >= 1 && b <= 12) {
      return {
        expiryMonth: String(b).padStart(2, "0"),
        expiryYear: `20${String(a).padStart(2, "0")}`,
      };
    }
  }
  return null;
}

function parseBoundCard(
  data: Record<string, unknown>,
): PaymentBindResult | null {
  const cardInfo =
    data.CardInfo &&
    typeof data.CardInfo === "object" &&
    !Array.isArray(data.CardInfo)
      ? (data.CardInfo as Record<string, unknown>)
      : data;
  const token =
    typeof cardInfo.BindCardID === "string" && cardInfo.BindCardID.trim()
      ? cardInfo.BindCardID.trim()
      : typeof data.BindCardID === "string" && data.BindCardID.trim()
        ? data.BindCardID.trim()
        : "";
  const last4 =
    typeof cardInfo.Card4No === "string" && /^\d{4}$/.test(cardInfo.Card4No)
      ? cardInfo.Card4No
      : typeof data.Card4No === "string" && /^\d{4}$/.test(data.Card4No)
        ? data.Card4No
        : "";
  if (!token || !last4 || /^[0-9 -]+$/.test(token)) {
    return null;
  }
  const expiry = parseCardExpiry(cardInfo);
  if (!expiry) {
    return null;
  }
  return {
    status: "completed",
    card: {
      token,
      last4,
      cardType: inferCardBrand(cardInfo),
      expiryMonth: expiry.expiryMonth,
      expiryYear: expiry.expiryYear,
    },
  };
}

export class EcpayPaymentProvider implements PaymentProviderPort {
  readonly name = "ecpay";
  readonly available = true;
  readonly capturePassengerContext = true;
  readonly sandbox: boolean;
  readonly baseUrl: string;
  readonly paymentBaseUrl: string;
  readonly sdkScriptUrl: string;
  readonly serverType: "Stage" | "Prod";
  readonly timeoutMs: number;
  readonly bindingAuthAmountTwd: number;
  readonly approvedActionOrigins: readonly string[];

  private readonly merchantId: string;
  private readonly hashKey: string;
  private readonly hashIv: string;
  private readonly returnUrl: string;
  private readonly orderResultUrl: string;
  private readonly fetchFn: EcpayFetchFn;
  private readonly now: () => Date;

  private readonly bindings = new Map<
    string,
    {
      credential: string;
      passengerId: string;
      memberId: string;
      merchantTradeNo: string;
      result: PaymentBindResult;
    }
  >();
  private readonly pendingBindingsByTradeNo = new Map<
    string,
    { passengerId: string; memberId: string; idempotencyKey: string }
  >();
  private readonly cancelledBindingAuthTrades = new Set<string>();
  private readonly captures = new Map<
    string,
    { command: PaymentCaptureCommand; result: MoneyResult }
  >();
  private readonly refundCommands = new Map<
    string,
    { merchantTradeNo: string; tradeNo: string; amountMinor: number }
  >();
  private readonly refunds = new Map<
    string,
    { command: PaymentRefundCommand; result: MoneyResult }
  >();
  /**
   * Per official ECPay specification ("交易失敗請勿對該 BindCardID 進行再次授權"),
   * a BindCardID that fails CreatePaymentWithCardID authorization must not be
   * automatically re-authorized.
   */
  private readonly declinedBindCardIds = new Set<string>();

  constructor(options: EcpayProviderOptions) {
    const merchantId = options.merchantId?.trim();
    if (!merchantId || !/^[A-Za-z0-9_-]{1,20}$/.test(merchantId)) {
      throw new Error("ECPay MerchantID is invalid.");
    }
    assertEcpayHashMaterial(options.hashKey, options.hashIv);
    if (typeof options.sandbox !== "boolean") {
      throw new Error("ECPay sandbox flag must be a boolean.");
    }
    const timeoutMs = options.timeoutMs ?? ECPAY_DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < ECPAY_MIN_TIMEOUT_MS) {
      throw new Error(
        `ECPay HTTP timeout must be at least ${ECPAY_MIN_TIMEOUT_MS}ms per official specification.`,
      );
    }
    const bindingAuthAmountTwd =
      options.bindingAuthAmountTwd ?? ECPAY_DEFAULT_BINDING_AUTH_AMOUNT_TWD;
    if (
      !Number.isSafeInteger(bindingAuthAmountTwd) ||
      bindingAuthAmountTwd < 1 ||
      bindingAuthAmountTwd > ECPAY_MAX_SINGLE_CHARGE_TWD
    ) {
      throw new Error(
        "ECPay bindingAuthAmountTwd must be a positive integer (1..200000 TWD).",
      );
    }
    this.merchantId = merchantId;
    this.hashKey = options.hashKey;
    this.hashIv = options.hashIv;
    this.sandbox = options.sandbox;
    this.timeoutMs = timeoutMs;
    this.bindingAuthAmountTwd = bindingAuthAmountTwd;
    this.baseUrl = options.sandbox ? ECPAY_STAGE_BASE_URL : ECPAY_PROD_BASE_URL;
    this.paymentBaseUrl = options.sandbox
      ? ECPAY_STAGE_PAYMENT_BASE_URL
      : ECPAY_PROD_PAYMENT_BASE_URL;
    this.sdkScriptUrl = `${this.baseUrl}/Scripts/sdk-1.0.0.js`;
    this.serverType = options.sandbox ? "Stage" : "Prod";
    this.approvedActionOrigins = Object.freeze(
      options.sandbox
        ? [ECPAY_STAGE_BASE_URL, "https://payment-stage.ecpay.com.tw"]
        : [ECPAY_PROD_BASE_URL, "https://payment.ecpay.com.tw"],
    );
    this.returnUrl =
      options.returnUrl?.trim() ||
      "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/callback";
    this.orderResultUrl =
      options.orderResultUrl?.trim() ||
      "https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/order-result";
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.now = options.now ?? (() => new Date());
  }

  private markBindCardDeclined(bindCardId: string): void {
    this.declinedBindCardIds.add(bindCardId);
    SHARED_DECLINED_BIND_CARD_IDS.add(`${this.merchantId}:${bindCardId}`);
  }

  isBindCardIdDeclined(bindCardId: string): boolean {
    return (
      this.declinedBindCardIds.has(bindCardId) ||
      SHARED_DECLINED_BIND_CARD_IDS.has(`${this.merchantId}:${bindCardId}`)
    );
  }

  deriveMerchantMemberId(passengerId: string): string {
    return deriveEcpayMerchantMemberId(passengerId, this.merchantId);
  }

  private async postEncrypted(
    url: string,
    innerData: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const nowDate = this.now();
    const nowSeconds = Math.floor(nowDate.getTime() / 1000);
    const envelope = buildEcpayEnvelope({
      merchantId: this.merchantId,
      hashKey: this.hashKey,
      hashIv: this.hashIv,
      data: innerData,
      timestamp: nowSeconds,
    });
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`ECPay HTTP error: ${response.status}`);
    }
    const rawBody = await response.json();
    const unwrapped = verifyAndUnwrapEcpayEnvelope({
      envelope: rawBody,
      merchantId: this.merchantId,
      hashKey: this.hashKey,
      hashIv: this.hashIv,
      nowSeconds,
    });
    if (unwrapped.transCode !== 1) {
      throw new Error("ECPay transport layer reported non-success TransCode.");
    }
    return unwrapped.data;
  }

  /**
   * Step 1 of PM-02 Card Binding:
   * Requests a temporary merchant verification token (`GetTokenbyBindingCard`)
   * so the frontend ECPay WEB JS SDK can render the hosted card fields.
   */
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
  ): Promise<EcpayBindingSession> {
    const nowDate = this.now();
    const memberId = deriveEcpayMerchantMemberId(passengerId, this.merchantId);
    const email = options?.email?.trim() ?? "";
    const rawPhone = options?.phone?.trim() ?? "";
    const phone = rawPhone ? normalizeEcpayPhone(rawPhone) : "";
    if (!email && !phone) {
      throw new Error(
        "ECPay GetTokenbyBindingCard requires at least one of ConsumerInfo.Email or ConsumerInfo.Phone.",
      );
    }
    const authAmount =
      options?.bindingAuthAmountTwd ?? this.bindingAuthAmountTwd;
    if (
      !Number.isSafeInteger(authAmount) ||
      authAmount < 1 ||
      authAmount > ECPAY_MAX_SINGLE_CHARGE_TWD
    ) {
      throw new Error("ECPay binding authorization amount is invalid.");
    }
    const seed =
      options?.idempotencyKey ?? `${passengerId}:${nowDate.getTime()}`;
    const tradeNo = deriveEcpayMerchantTradeNo(`bind_token:${seed}`);
    const data = await this.postEncrypted(
      `${this.baseUrl}/Merchant/GetTokenbyBindingCard`,
      {
        PlatformID: "",
        MerchantID: this.merchantId,
        ConsumerInfo: {
          MerchantMemberID: memberId,
          ...(email ? { Email: email } : {}),
          ...(phone ? { Phone: phone } : {}),
        },
        OrderInfo: {
          MerchantTradeDate: formatEcpayTradeDate(nowDate),
          MerchantTradeNo: tradeNo,
          TotalAmount: authAmount,
          TradeDesc: "DRTS會員信用卡綁定",
          ItemName: "信用卡綁定驗證",
          ReturnURL: options?.returnUrl ?? this.returnUrl,
        },
        OrderResultURL: options?.orderResultUrl ?? this.orderResultUrl,
      },
    );
    const rtnCode = Number(data.RtnCode);
    const token = typeof data.Token === "string" ? data.Token.trim() : "";
    const tokenExpireDate =
      typeof data.TokenExpireDate === "string"
        ? data.TokenExpireDate.trim()
        : "";
    if (rtnCode !== 1 || !token) {
      throw new Error(
        "ECPay GetTokenbyBindingCard did not return a valid token.",
      );
    }
    return {
      provider: "ecpay",
      merchantToken: token,
      tokenExpireDate,
      sandbox: this.sandbox,
      serverType: this.serverType,
      sdkScriptUrl: this.sdkScriptUrl,
      approvedActionOrigins: this.approvedActionOrigins,
    };
  }

  /**
   * Cancels the verification authorization (`DoAction` with `Action: "N"`)
   * created during `GetTokenbyBindingCard` after a binding succeeds.
   */
  async cancelBindingAuthorization(params: {
    merchantTradeNo: string;
    tradeNo: string;
    amountMinor: number;
  }): Promise<boolean> {
    const merchantTradeNo = params.merchantTradeNo?.trim() ?? "";
    const tradeNo = params.tradeNo?.trim() ?? "";
    const totalAmountTwd = minorUnitsToWholeTwd(params.amountMinor);
    if (!merchantTradeNo || !tradeNo || totalAmountTwd === null) {
      return false;
    }
    const key = `${merchantTradeNo}:${tradeNo}`;
    const sharedKey = `${this.merchantId}:${key}`;
    if (
      this.cancelledBindingAuthTrades.has(key) ||
      SHARED_CANCELLED_BINDING_AUTH_TRADES.has(sharedKey)
    ) {
      return true;
    }
    try {
      const data = await this.postEncrypted(
        `${this.paymentBaseUrl}/1.0.0/Credit/DoAction`,
        {
          MerchantID: this.merchantId,
          PlatformID: "",
          MerchantTradeNo: merchantTradeNo,
          TradeNo: tradeNo,
          Action: "N",
          TotalAmount: totalAmountTwd,
        },
      );
      if (Number(data.RtnCode) === 1) {
        this.cancelledBindingAuthTrades.add(key);
        SHARED_CANCELLED_BINDING_AUTH_TRADES.add(sharedKey);
        return true;
      }
      // If another instance already cancelled the authorization, verify via CreditDetail/QueryTrade.
      const detail = await this.postEncrypted(
        `${this.paymentBaseUrl}/1.0.0/CreditDetail/QueryTrade`,
        {
          MerchantID: this.merchantId,
          PlatformID: "",
          MerchantTradeNo: merchantTradeNo,
          TradeNo: tradeNo,
          CreditAmount: totalAmountTwd,
        },
      );
      const rtnValue =
        detail.RtnValue &&
        typeof detail.RtnValue === "object" &&
        !Array.isArray(detail.RtnValue)
          ? (detail.RtnValue as Record<string, unknown>)
          : null;
      const status = String(rtnValue?.Status ?? rtnValue?.status ?? "")
        .trim()
        .toUpperCase();
      if (["CANCELLED", "UNAUTHORIZED", "VOIDED"].includes(status)) {
        this.cancelledBindingAuthTrades.add(key);
        SHARED_CANCELLED_BINDING_AUTH_TRADES.add(sharedKey);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Step 3 of PM-02 Card Binding:
   * Exchanges `BindCardPayToken` (collected by ECPay WEB JS SDK in the browser)
   * via `CreateBindCard`. Returns `action_required` when 3DS redirect is needed,
   * or `completed` with `BindCardID` and masked metadata.
   */
  async bind(
    credential: string,
    idempotencyKey: string,
    context?: {
      passengerId?: string;
      returnUrl?: string;
      orderResultUrl?: string;
    },
  ): Promise<PaymentBindResult> {
    const passengerId = context?.passengerId?.trim();
    if (!passengerId || passengerId.startsWith("pax:bind:")) {
      throw new Error(
        "ECPay CreateBindCard requires a formally validated passengerId in context.",
      );
    }
    const existing = this.bindings.get(idempotencyKey);
    if (existing) {
      if (
        existing.credential !== credential ||
        existing.passengerId !== passengerId
      ) {
        throw new Error("ECPay binding idempotency conflict.");
      }
      return structuredClone(existing.result);
    }

    const memberId = deriveEcpayMerchantMemberId(passengerId, this.merchantId);
    const derivedTradeNo = deriveEcpayMerchantTradeNo(idempotencyKey);
    this.pendingBindingsByTradeNo.set(derivedTradeNo, {
      passengerId,
      memberId,
      idempotencyKey,
    });
    const data = await this.postEncrypted(
      `${this.baseUrl}/Merchant/CreateBindCard`,
      {
        PlatformID: "",
        MerchantID: this.merchantId,
        BindCardPayToken: credential,
        MerchantMemberID: memberId,
        OrderResultURL: context?.orderResultUrl ?? this.orderResultUrl,
        ReturnURL: context?.returnUrl ?? this.returnUrl,
      },
    );

    const rtnCode = Number(data.RtnCode);
    const orderInfo =
      data.OrderInfo &&
      typeof data.OrderInfo === "object" &&
      !Array.isArray(data.OrderInfo)
        ? (data.OrderInfo as Record<string, unknown>)
        : null;
    const responseTradeNo =
      typeof orderInfo?.MerchantTradeNo === "string" &&
      orderInfo.MerchantTradeNo.trim()
        ? orderInfo.MerchantTradeNo.trim()
        : typeof data.MerchantTradeNo === "string" &&
            data.MerchantTradeNo.trim()
          ? data.MerchantTradeNo.trim()
          : derivedTradeNo;
    if (responseTradeNo !== derivedTradeNo) {
      this.pendingBindingsByTradeNo.set(responseTradeNo, {
        passengerId,
        memberId,
        idempotencyKey,
      });
    }

    const threeDInfo =
      data.ThreeDInfo &&
      typeof data.ThreeDInfo === "object" &&
      !Array.isArray(data.ThreeDInfo)
        ? (data.ThreeDInfo as Record<string, unknown>)
        : null;
    const threeDUrl =
      typeof threeDInfo?.ThreeDURL === "string"
        ? threeDInfo.ThreeDURL.trim()
        : typeof data.ThreeDURL === "string"
          ? data.ThreeDURL.trim()
          : "";

    let result: PaymentBindResult;
    if (rtnCode === 1 && threeDUrl) {
      result = {
        status: "action_required",
        nextActionUrl: threeDUrl,
      };
    } else if (rtnCode === 1) {
      const bound = parseBoundCard(data);
      if (!bound) {
        throw new Error("ECPay CreateBindCard response lacked valid CardInfo.");
      }
      const merchantTradeNo =
        typeof orderInfo?.MerchantTradeNo === "string"
          ? orderInfo.MerchantTradeNo.trim()
          : typeof data.MerchantTradeNo === "string"
            ? data.MerchantTradeNo.trim()
            : "";
      const tradeNo =
        typeof orderInfo?.TradeNo === "string" ||
        typeof orderInfo?.TradeNo === "number"
          ? String(orderInfo.TradeNo).trim()
          : typeof data.TradeNo === "string" || typeof data.TradeNo === "number"
            ? String(data.TradeNo).trim()
            : "";
      const rawTotalAmount = orderInfo?.TotalAmount ?? data.TotalAmount;
      const authAmountTwd =
        rawTotalAmount !== undefined &&
        Number.isSafeInteger(Number(rawTotalAmount)) &&
        Number(rawTotalAmount) > 0
          ? Number(rawTotalAmount)
          : this.bindingAuthAmountTwd;
      if (merchantTradeNo && tradeNo && authAmountTwd > 0) {
        const cancelled = await this.cancelBindingAuthorization({
          merchantTradeNo,
          tradeNo,
          amountMinor: authAmountTwd * ECPAY_MINOR_UNITS_PER_TWD,
        });
        // Per official ECPay specification (https://developers.ecpay.com.tw/35642/),
        // Stage (sandbox=true) does not perform real bank settlement and does not
        // provide /1.0.0/Credit/DoAction. Require confirmed DoAction(N) in Production
        // (sandbox=false), while allowing Stage bindings to complete if Stage rejects
        // or omits Credit/DoAction.
        if (!cancelled && !this.sandbox) {
          throw new Error(
            "ECPay binding authorization cancellation was not confirmed.",
          );
        }
      }
      result = bound;
    } else if (INVALID_CREDENTIAL_CODES.has(rtnCode)) {
      result = { status: "failed", error: "invalid_credential" };
    } else {
      result = { status: "failed", error: "card_declined" };
    }

    this.bindings.set(idempotencyKey, {
      credential,
      passengerId,
      memberId,
      merchantTradeNo: responseTradeNo,
      result: structuredClone(result),
    });
    return result;
  }

  /**
   * Unbinds a previously bound credit card (`BindCardID`) on ECPay via
   * `/Merchant/DeleteMemberBindCard` (https://developers.ecpay.com.tw/35608/)
   * so that removing a card locally also frees the slot in ECPay's 5-card
   * per-member limit.
   */
  async unbind(
    token: string,
    _context?: { passengerId?: string },
  ): Promise<boolean> {
    const bindCardId = typeof token === "string" ? token.trim() : "";
    if (!bindCardId || /^[0-9 -]+$/.test(bindCardId)) {
      return false;
    }
    try {
      const data = await this.postEncrypted(
        `${this.baseUrl}/Merchant/DeleteMemberBindCard`,
        {
          PlatformID: "",
          MerchantID: this.merchantId,
          BindCardID: bindCardId,
        },
      );
      const rtnCode = Number(data.RtnCode);
      if (rtnCode === 1 || rtnCode === 10100252) {
        for (const [key, entry] of this.bindings.entries()) {
          if (
            entry.result.status === "completed" &&
            entry.result.card.token === bindCardId
          ) {
            this.bindings.delete(key);
          }
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Verifies an incoming ECPay Server-to-Server ReturnURL or client OrderResultURL
   * notification envelope (MerchantID, Timestamp window, AES-128-CBC ciphertext).
   */
  verifyNotification(envelope: unknown): VerifiedEcpayNotification {
    const nowSeconds = Math.floor(this.now().getTime() / 1000);
    const unwrapped = verifyAndUnwrapEcpayEnvelope({
      envelope,
      merchantId: this.merchantId,
      hashKey: this.hashKey,
      hashIv: this.hashIv,
      nowSeconds,
    });
    if (unwrapped.transCode !== 1) {
      throw new Error(
        "ECPay notification transport layer reported non-success TransCode.",
      );
    }
    const data = unwrapped.data;
    const rtnCode = Number(data.RtnCode);
    if (!Number.isSafeInteger(rtnCode)) {
      throw new Error("ECPay notification RtnCode is missing.");
    }
    const rtnMsg = typeof data.RtnMsg === "string" ? data.RtnMsg : "";
    const orderInfo =
      data.OrderInfo &&
      typeof data.OrderInfo === "object" &&
      !Array.isArray(data.OrderInfo)
        ? (data.OrderInfo as Record<string, unknown>)
        : null;
    const cardInfo =
      data.CardInfo &&
      typeof data.CardInfo === "object" &&
      !Array.isArray(data.CardInfo)
        ? (data.CardInfo as Record<string, unknown>)
        : null;
    const merchantTradeNo =
      typeof orderInfo?.MerchantTradeNo === "string" &&
      orderInfo.MerchantTradeNo.trim()
        ? orderInfo.MerchantTradeNo.trim()
        : typeof data.MerchantTradeNo === "string" &&
            data.MerchantTradeNo.trim()
          ? data.MerchantTradeNo.trim()
          : null;
    const tradeNo =
      typeof orderInfo?.TradeNo === "string" ||
      typeof orderInfo?.TradeNo === "number"
        ? String(orderInfo.TradeNo).trim()
        : typeof data.TradeNo === "string" || typeof data.TradeNo === "number"
          ? String(data.TradeNo).trim()
          : null;
    const rawTotalAmount = orderInfo?.TotalAmount ?? data.TotalAmount;
    const authorizedAmountMinor =
      rawTotalAmount !== undefined &&
      Number.isSafeInteger(Number(rawTotalAmount)) &&
      Number(rawTotalAmount) > 0
        ? Number(rawTotalAmount) * ECPAY_MINOR_UNITS_PER_TWD
        : this.bindingAuthAmountTwd > 0
          ? this.bindingAuthAmountTwd * ECPAY_MINOR_UNITS_PER_TWD
          : null;

    const consumerInfo =
      data.ConsumerInfo &&
      typeof data.ConsumerInfo === "object" &&
      !Array.isArray(data.ConsumerInfo)
        ? (data.ConsumerInfo as Record<string, unknown>)
        : null;
    const merchantMemberId =
      typeof data.MerchantMemberID === "string" && data.MerchantMemberID.trim()
        ? data.MerchantMemberID.trim()
        : typeof consumerInfo?.MerchantMemberID === "string" &&
            consumerInfo.MerchantMemberID.trim()
          ? consumerInfo.MerchantMemberID.trim()
          : null;

    const bound = parseBoundCard(data);
    const hasBindCardId =
      (typeof data.BindCardID === "string" &&
        data.BindCardID.trim().length > 0) ||
      (typeof cardInfo?.BindCardID === "string" &&
        cardInfo.BindCardID.trim().length > 0);
    const isKnownBindTrade = Boolean(
      merchantTradeNo && this.pendingBindingsByTradeNo.has(merchantTradeNo),
    );
    const hasPaymentTradeFields =
      orderInfo?.TradeStatus !== undefined ||
      data.TradeStatus !== undefined ||
      data.SimulatePaid !== undefined ||
      orderInfo?.SimulatePaid !== undefined;
    const isBindNotification =
      bound !== null ||
      hasBindCardId ||
      isKnownBindTrade ||
      data.BindCardPayToken !== undefined ||
      (!hasPaymentTradeFields &&
        (data.BindCardID !== undefined ||
          cardInfo?.BindCardID !== undefined ||
          (merchantMemberId !== null && rtnCode !== 1)));

    if (isBindNotification) {
      const bindResult: PaymentBindResult =
        rtnCode === 1 && bound
          ? bound
          : INVALID_CREDENTIAL_CODES.has(rtnCode)
            ? { status: "failed", error: "invalid_credential" }
            : { status: "failed", error: "card_declined" };

      let pendingBinding = merchantTradeNo
        ? this.pendingBindingsByTradeNo.get(merchantTradeNo)
        : undefined;
      if (
        pendingBinding &&
        merchantMemberId &&
        pendingBinding.memberId !== merchantMemberId
      ) {
        pendingBinding = undefined;
      }

      if (!pendingBinding && merchantMemberId) {
        const pendingForMember: Array<{
          key: string;
          passengerId: string;
          memberId: string;
        }> = [];
        for (const [key, entry] of this.bindings.entries()) {
          if (
            entry.memberId === merchantMemberId &&
            (entry.result.status === "action_required" ||
              entry.result.status === "pending")
          ) {
            pendingForMember.push({
              key,
              passengerId: entry.passengerId,
              memberId: entry.memberId,
            });
          }
        }
        // Only correlate when unambiguous (single pending operation for this member).
        if (pendingForMember.length === 1) {
          const unique = pendingForMember[0]!;
          pendingBinding = {
            passengerId: unique.passengerId,
            memberId: unique.memberId,
            idempotencyKey: unique.key,
          };
        }
      }

      if (pendingBinding) {
        const existingEntry = this.bindings.get(pendingBinding.idempotencyKey);
        if (existingEntry) {
          existingEntry.result = structuredClone(bindResult);
        }
      }

      return {
        kind: "bind",
        rtnCode,
        rtnMsg,
        merchantTradeNo,
        tradeNo,
        ...(merchantMemberId ? { merchantMemberId } : {}),
        ...(pendingBinding?.passengerId
          ? { passengerId: pendingBinding.passengerId }
          : {}),
        ...(pendingBinding?.idempotencyKey
          ? { idempotencyKey: pendingBinding.idempotencyKey }
          : {}),
        ...(authorizedAmountMinor !== null ? { authorizedAmountMinor } : {}),
        bindResult,
      };
    }

    const simulatePaid = Number(
      data.SimulatePaid ?? orderInfo?.SimulatePaid ?? 0,
    );
    const rawTradeStatus = orderInfo?.TradeStatus ?? data.TradeStatus;
    const tradeStatus =
      rawTradeStatus !== undefined &&
      rawTradeStatus !== null &&
      String(rawTradeStatus).trim() !== ""
        ? Number(rawTradeStatus)
        : rtnCode === 1
          ? 1
          : 0;

    let paymentResult: MoneyResult;
    if (simulatePaid === 1 && !this.sandbox) {
      paymentResult = {
        status: "failed",
        error: "invalid_method",
        retryable: false,
      };
    } else if (
      rtnCode === 1 &&
      tradeStatus === 1 &&
      merchantTradeNo &&
      tradeNo
    ) {
      paymentResult = {
        status: "completed",
        providerRef: `${merchantTradeNo}:${tradeNo}`,
      };
      for (const [key, entry] of this.captures.entries()) {
        if (
          deriveEcpayMerchantTradeNo(key) === merchantTradeNo &&
          (authorizedAmountMinor === null ||
            entry.command.amountMinor === authorizedAmountMinor)
        ) {
          entry.result = structuredClone(paymentResult);
        }
      }
    } else if (
      PENDING_CONFIRMATION_CODES.has(rtnCode) ||
      (rtnCode === 1 && tradeStatus === 0)
    ) {
      paymentResult = { status: "pending" };
    } else if (INVALID_METHOD_CODES.has(rtnCode)) {
      paymentResult = {
        status: "failed",
        error: "invalid_method",
        retryable: false,
      };
    } else {
      paymentResult = {
        status: "failed",
        error: "card_declined",
        retryable: false,
      };
    }

    return {
      kind: "payment",
      rtnCode,
      rtnMsg,
      merchantTradeNo,
      tradeNo,
      ...(authorizedAmountMinor !== null ? { authorizedAmountMinor } : {}),
      paymentResult,
    };
  }

  /**
   * Trip Completion Charge:
   * Calls `CreatePaymentWithCardID` with `Need3D=0`, unique `MerchantTradeNo`,
   * `ConsumerInfo.MerchantMemberID`, and `TotalAmount` in integer TWD (1 .. 200,000),
   * converted from internal minor TWD units (`1 TWD = 100 minor units`).
   * Enforces the official ECPay rule: never re-authorize a BindCardID after failure.
   */
  async capture(command: PaymentCaptureCommand): Promise<MoneyResult> {
    const existing = this.captures.get(command.idempotencyKey);
    if (existing) {
      if (
        existing.command.token !== command.token ||
        existing.command.amountMinor !== command.amountMinor ||
        existing.command.currency !== command.currency ||
        existing.command.passengerId !== command.passengerId
      ) {
        throw new Error("ECPay capture idempotency conflict.");
      }
      return structuredClone(existing.result);
    }

    if (
      command.currency !== "TWD" ||
      typeof command.token !== "string" ||
      !command.token.trim() ||
      /^[0-9 -]+$/.test(command.token)
    ) {
      return { status: "failed", error: "invalid_method", retryable: false };
    }

    const passengerId = command.passengerId?.trim();
    if (!passengerId || passengerId.startsWith("pax:")) {
      return { status: "failed", error: "invalid_method", retryable: false };
    }
    let merchantMemberId: string;
    try {
      merchantMemberId = deriveEcpayMerchantMemberId(
        passengerId,
        this.merchantId,
      );
    } catch {
      return { status: "failed", error: "invalid_method", retryable: false };
    }

    const amountTwd = minorUnitsToWholeTwd(command.amountMinor);
    if (amountTwd === null) {
      return { status: "failed", error: "card_declined", retryable: false };
    }

    const bindCardId = command.token.trim();
    if (this.isBindCardIdDeclined(bindCardId)) {
      return { status: "failed", error: "card_declined", retryable: false };
    }

    const merchantTradeNo = deriveEcpayMerchantTradeNo(command.idempotencyKey);
    const nowDate = this.now();
    let data: Record<string, unknown>;
    try {
      data = await this.postEncrypted(
        `${this.baseUrl}/Merchant/CreatePaymentWithCardID`,
        {
          PlatformID: "",
          MerchantID: this.merchantId,
          BindCardID: bindCardId,
          Need3D: 0,
          ConsumerInfo: {
            MerchantMemberID: merchantMemberId,
          },
          OrderInfo: {
            MerchantTradeDate: formatEcpayTradeDate(nowDate),
            MerchantTradeNo: merchantTradeNo,
            TotalAmount: amountTwd,
            TradeDesc: "DRTS計程車乘車費用",
            ItemName: "計程車車資",
            ReturnURL: this.returnUrl,
          },
        },
      );
    } catch {
      return { status: "unknown" };
    }

    const rtnCode = Number(data.RtnCode);
    const orderInfo =
      data.OrderInfo &&
      typeof data.OrderInfo === "object" &&
      !Array.isArray(data.OrderInfo)
        ? (data.OrderInfo as Record<string, unknown>)
        : data;
    const tradeNo =
      typeof orderInfo.TradeNo === "string" ||
      typeof orderInfo.TradeNo === "number"
        ? String(orderInfo.TradeNo).trim()
        : "";

    if (PENDING_CONFIRMATION_CODES.has(rtnCode)) {
      // Official ECPay 10300066 ("交易結果待確認"): do not mark BindCardID as
      // declined and do not cache a terminal result so readCapture queries QueryTrade.
      return { status: "pending" };
    }

    let result: MoneyResult;
    if (rtnCode === 1 && tradeNo) {
      result = {
        status: "completed",
        providerRef: `${merchantTradeNo}:${tradeNo}`,
      };
    } else if (UNAVAILABLE_CODES.has(rtnCode)) {
      this.markBindCardDeclined(bindCardId);
      result = { status: "failed", error: "unavailable", retryable: false };
    } else if (INVALID_METHOD_CODES.has(rtnCode)) {
      this.markBindCardDeclined(bindCardId);
      result = { status: "failed", error: "invalid_method", retryable: false };
    } else {
      this.markBindCardDeclined(bindCardId);
      result = { status: "failed", error: "card_declined", retryable: false };
    }

    this.captures.set(command.idempotencyKey, {
      command: structuredClone(command),
      result: structuredClone(result),
    });
    return result;
  }

  async readCapture(idempotencyKey: string): Promise<MoneyResult> {
    const cached = this.captures.get(idempotencyKey);
    if (cached) {
      return structuredClone(cached.result);
    }
    const merchantTradeNo = deriveEcpayMerchantTradeNo(idempotencyKey);
    try {
      const data = await this.postEncrypted(
        `${this.paymentBaseUrl}/1.0.0/Cashier/QueryTrade`,
        {
          MerchantID: this.merchantId,
          MerchantTradeNo: merchantTradeNo,
        },
      );
      const rtnCode = Number(data.RtnCode);
      const orderInfo =
        data.OrderInfo &&
        typeof data.OrderInfo === "object" &&
        !Array.isArray(data.OrderInfo)
          ? (data.OrderInfo as Record<string, unknown>)
          : data;
      const tradeNo =
        typeof orderInfo.TradeNo === "string" ||
        typeof orderInfo.TradeNo === "number"
          ? String(orderInfo.TradeNo).trim()
          : "";
      const rawTradeStatus = orderInfo.TradeStatus ?? data.TradeStatus;
      if (
        rawTradeStatus === undefined ||
        rawTradeStatus === null ||
        String(rawTradeStatus).trim() === ""
      ) {
        return { status: "unknown" };
      }
      const tradeStatus = Number(rawTradeStatus);
      if (!Number.isSafeInteger(tradeStatus)) {
        return { status: "unknown" };
      }
      if (rtnCode === 1 && tradeStatus === 1 && tradeNo) {
        return {
          status: "completed",
          providerRef: `${merchantTradeNo}:${tradeNo}`,
        };
      }
      if (tradeStatus === 0) {
        return { status: "pending" };
      }
      if (rtnCode !== 1 && UNAVAILABLE_CODES.has(rtnCode)) {
        return { status: "unknown" };
      }
      return { status: "failed", error: "card_declined", retryable: false };
    } catch {
      return { status: "unknown" };
    }
  }

  private parseCreditLifecycle(
    queryData: Record<string, unknown>,
    expectedAmountTwd: number | null,
  ): {
    closeState:
      | "CLOSED"
      | "AUTHORIZED"
      | "PENDING_CLOSE"
      | "REFUNDED"
      | "FAILED"
      | null;
    tradeNo: string;
  } {
    const queryOrderInfo =
      queryData.OrderInfo &&
      typeof queryData.OrderInfo === "object" &&
      !Array.isArray(queryData.OrderInfo)
        ? (queryData.OrderInfo as Record<string, unknown>)
        : null;
    const queryCardInfo =
      queryData.CardInfo &&
      typeof queryData.CardInfo === "object" &&
      !Array.isArray(queryData.CardInfo)
        ? (queryData.CardInfo as Record<string, unknown>)
        : null;
    const rtnValue =
      queryData.RtnValue &&
      typeof queryData.RtnValue === "object" &&
      !Array.isArray(queryData.RtnValue)
        ? (queryData.RtnValue as Record<string, unknown>)
        : null;

    const tradeNo =
      typeof rtnValue?.TradeNo === "string" ||
      typeof rtnValue?.TradeNo === "number"
        ? String(rtnValue.TradeNo).trim()
        : typeof rtnValue?.credit_id === "string" ||
            typeof rtnValue?.credit_id === "number"
          ? String(rtnValue.credit_id).trim()
          : typeof queryOrderInfo?.TradeNo === "string" ||
              typeof queryOrderInfo?.TradeNo === "number"
            ? String(queryOrderInfo.TradeNo).trim()
            : typeof queryData.TradeNo === "string" ||
                typeof queryData.TradeNo === "number"
              ? String(queryData.TradeNo).trim()
              : "";

    if (rtnValue) {
      const rtnStatus = String(rtnValue.Status ?? rtnValue.status ?? "")
        .trim()
        .toUpperCase();
      const closeDataRaw = rtnValue.CloseData ?? rtnValue.close_data;
      const closeEntries = Array.isArray(closeDataRaw)
        ? (closeDataRaw as Array<Record<string, unknown>>)
        : [];
      const baseAmount = Number(rtnValue.amount ?? rtnValue.Amount ?? NaN);

      for (const entry of closeEntries) {
        if (!entry || typeof entry !== "object") continue;
        const entryStatus = String(entry.status ?? entry.Status ?? "")
          .trim()
          .toUpperCase();
        const entryAmount = Number(entry.amount ?? entry.Amount ?? baseAmount);
        if (
          [
            "REFUNDED",
            "CANCELLED",
            "UNAUTHORIZED",
            "BACK",
            "VOIDED",
            "R",
            "N",
          ].includes(entryStatus) &&
          Number.isSafeInteger(entryAmount) &&
          entryAmount > 0 &&
          (expectedAmountTwd === null || entryAmount >= expectedAmountTwd)
        ) {
          return { closeState: "REFUNDED", tradeNo };
        }
        if (["FAILED", "REFUND_FAILED"].includes(entryStatus)) {
          return { closeState: "FAILED", tradeNo };
        }
        if (
          [
            "TOBECLOSED",
            "PENDING_CLOSE",
            "PENDING",
            "CLOSING",
            "要關帳",
            "2",
          ].includes(entryStatus)
        ) {
          return { closeState: "PENDING_CLOSE", tradeNo };
        }
        if (["CLOSED", "已關帳", "1"].includes(entryStatus)) {
          return { closeState: "CLOSED", tradeNo };
        }
      }

      if (
        ["CANCELLED", "UNAUTHORIZED", "REFUNDED", "VOIDED"].includes(
          rtnStatus,
        ) &&
        Number.isSafeInteger(baseAmount) &&
        baseAmount > 0 &&
        (expectedAmountTwd === null || baseAmount >= expectedAmountTwd)
      ) {
        return { closeState: "REFUNDED", tradeNo };
      }
      if (["FAILED", "REFUND_FAILED"].includes(rtnStatus)) {
        return { closeState: "FAILED", tradeNo };
      }
      if (
        [
          "TOBECLOSED",
          "PENDING_CLOSE",
          "PENDING",
          "CLOSING",
          "要關帳",
          "2",
        ].includes(rtnStatus)
      ) {
        return { closeState: "PENDING_CLOSE", tradeNo };
      }
      if (["CLOSED", "已關帳", "1"].includes(rtnStatus)) {
        return { closeState: "CLOSED", tradeNo };
      }
      if (["AUTHORIZED", "UNCLOSED", "已授權", "0"].includes(rtnStatus)) {
        return { closeState: "AUTHORIZED", tradeNo };
      }
    }

    const rawCloseStatus =
      queryCardInfo?.CloseStatus ??
      queryOrderInfo?.CloseStatus ??
      queryData.CloseStatus ??
      queryOrderInfo?.TradeState ??
      queryData.TradeState;
    const rawRefundStatus =
      queryOrderInfo?.RefundStatus ??
      queryCardInfo?.RefundStatus ??
      queryData.RefundStatus ??
      queryOrderInfo?.CancelStatus ??
      queryCardInfo?.CancelStatus ??
      queryData.CancelStatus ??
      queryOrderInfo?.BackStatus ??
      queryCardInfo?.BackStatus ??
      queryData.BackStatus;
    const refundAmount = Number(
      queryOrderInfo?.RefundAmount ??
        queryCardInfo?.RefundAmount ??
        queryData.RefundAmount ??
        queryOrderInfo?.TotalAmount ??
        queryData.TotalAmount ??
        0,
    );

    if (rawRefundStatus !== undefined && Number(rawRefundStatus) === -1) {
      return { closeState: "FAILED", tradeNo };
    }
    if (
      rawRefundStatus !== undefined &&
      Number(rawRefundStatus) === 1 &&
      Number.isSafeInteger(refundAmount) &&
      refundAmount > 0 &&
      (expectedAmountTwd === null || refundAmount >= expectedAmountTwd)
    ) {
      return { closeState: "REFUNDED", tradeNo };
    }

    if (rawCloseStatus === undefined || rawCloseStatus === null) {
      return { closeState: null, tradeNo };
    }
    const normalized = String(rawCloseStatus).trim().toUpperCase();
    if (
      ["REFUNDED", "CANCELLED", "VOIDED"].includes(normalized) &&
      Number.isSafeInteger(refundAmount) &&
      refundAmount > 0 &&
      (expectedAmountTwd === null || refundAmount >= expectedAmountTwd)
    ) {
      return { closeState: "REFUNDED", tradeNo };
    }
    if (normalized === "REFUND_FAILED") {
      return { closeState: "FAILED", tradeNo };
    }
    if (
      ["E", "PENDING_CLOSE", "CLOSING", "TOBECLOSED", "2"].includes(normalized)
    ) {
      return { closeState: "PENDING_CLOSE", tradeNo };
    }
    if (["N", "AUTHORIZED", "UNCLOSED", "0"].includes(normalized)) {
      return { closeState: "AUTHORIZED", tradeNo };
    }
    if (["R", "CLOSED", "1"].includes(normalized)) {
      return { closeState: "CLOSED", tradeNo };
    }
    return { closeState: null, tradeNo };
  }

  /**
   * Credit Card Refund (`CreditDetail/QueryTrade` detail check followed by
   * state-appropriate `Credit/DoAction`: `N` for authorized/unclosed, `E` then
   * `N` for pending-close full refund, `R` for closed). Never defaults missing
   * close state to `Action: "R"`.
   */
  async refund(command: PaymentRefundCommand): Promise<MoneyResult> {
    const existing = this.refunds.get(command.idempotencyKey);
    if (existing) {
      if (
        existing.command.captureRef !== command.captureRef ||
        existing.command.amountMinor !== command.amountMinor ||
        existing.command.currency !== command.currency
      ) {
        throw new Error("ECPay refund idempotency conflict.");
      }
      return structuredClone(existing.result);
    }

    const amountTwd = minorUnitsToWholeTwd(command.amountMinor);
    if (
      command.currency !== "TWD" ||
      typeof command.captureRef !== "string" ||
      !command.captureRef.trim() ||
      amountTwd === null
    ) {
      return { status: "failed", error: "invalid_method", retryable: false };
    }

    const parts = command.captureRef.trim().split(":");
    const merchantTradeNo =
      parts.length >= 2 && parts[0]
        ? parts[0]
        : command.idempotencyKey.startsWith("pax:refund:")
          ? deriveEcpayMerchantTradeNo(
              `pax:capture:${command.idempotencyKey.slice("pax:refund:".length)}`,
            )
          : deriveEcpayMerchantTradeNo(command.idempotencyKey);
    const tradeNo =
      parts.length >= 2 ? parts.slice(1).join(":") : command.captureRef.trim();

    this.refundCommands.set(command.idempotencyKey, {
      merchantTradeNo,
      tradeNo,
      amountMinor: command.amountMinor,
    });

    let closeState:
      | "CLOSED"
      | "AUTHORIZED"
      | "PENDING_CLOSE"
      | "REFUNDED"
      | "FAILED"
      | null = null;
    try {
      const queryData = await this.postEncrypted(
        `${this.paymentBaseUrl}/1.0.0/CreditDetail/QueryTrade`,
        {
          MerchantID: this.merchantId,
          PlatformID: "",
          MerchantTradeNo: merchantTradeNo,
          TradeNo: tradeNo,
          CreditAmount: amountTwd,
        },
      );
      const hasRtnValue =
        queryData.RtnValue !== undefined &&
        queryData.RtnValue !== null &&
        typeof queryData.RtnValue === "object";
      const queryRtnCode =
        queryData.RtnCode !== undefined
          ? Number(queryData.RtnCode)
          : hasRtnValue &&
              (queryData.RtnMsg === "" || queryData.RtnMsg === undefined)
            ? 1
            : NaN;
      if (queryRtnCode !== 1) {
        if (UNAVAILABLE_CODES.has(queryRtnCode)) {
          return { status: "failed", error: "unavailable", retryable: true };
        }
        return { status: "failed", error: "invalid_method", retryable: false };
      }
      const parsed = this.parseCreditLifecycle(queryData, amountTwd);
      closeState = parsed.closeState;
      if (closeState === "REFUNDED") {
        const alreadyDone: MoneyResult = {
          status: "completed",
          providerRef: `ecpay_refund:${merchantTradeNo}:${tradeNo}`,
        };
        this.refunds.set(command.idempotencyKey, {
          command: structuredClone(command),
          result: structuredClone(alreadyDone),
        });
        return alreadyDone;
      }
      if (closeState === "FAILED") {
        return { status: "failed", error: "card_declined", retryable: false };
      }
      if (closeState === null) {
        // Never assume CLOSED / Action: "R" when close state is absent.
        return { status: "unknown" };
      }
    } catch {
      return { status: "unknown" };
    }

    const actions: Array<"E" | "N" | "R"> =
      closeState === "PENDING_CLOSE"
        ? ["E", "N"]
        : closeState === "AUTHORIZED"
          ? ["N"]
          : ["R"];

    let lastData: Record<string, unknown> = {};
    try {
      for (const action of actions) {
        lastData = await this.postEncrypted(
          `${this.paymentBaseUrl}/1.0.0/Credit/DoAction`,
          {
            MerchantID: this.merchantId,
            PlatformID: "",
            MerchantTradeNo: merchantTradeNo,
            TradeNo: tradeNo,
            Action: action,
            TotalAmount: amountTwd,
          },
        );
        if (Number(lastData.RtnCode) !== 1) {
          break;
        }
      }
    } catch {
      return { status: "unknown" };
    }

    const rtnCode = Number(lastData.RtnCode);
    let result: MoneyResult;
    if (rtnCode === 1) {
      result = {
        status: "completed",
        providerRef: `ecpay_refund:${merchantTradeNo}:${tradeNo}`,
      };
    } else if (UNAVAILABLE_CODES.has(rtnCode)) {
      result = { status: "failed", error: "unavailable", retryable: true };
    } else if (INVALID_METHOD_CODES.has(rtnCode)) {
      result = { status: "failed", error: "invalid_method", retryable: false };
    } else {
      result = { status: "failed", error: "card_declined", retryable: false };
    }

    this.refunds.set(command.idempotencyKey, {
      command: structuredClone(command),
      result: structuredClone(result),
    });
    return result;
  }

  async readRefund(idempotencyKey: string): Promise<MoneyResult> {
    const cached = this.refunds.get(idempotencyKey);
    if (cached) {
      return structuredClone(cached.result);
    }
    const recorded = this.refundCommands.get(idempotencyKey);
    const expectedAmountTwd = recorded
      ? minorUnitsToWholeTwd(recorded.amountMinor)
      : null;
    const merchantTradeNo =
      recorded?.merchantTradeNo ??
      (idempotencyKey.startsWith("pax:refund:")
        ? deriveEcpayMerchantTradeNo(
            `pax:capture:${idempotencyKey.slice("pax:refund:".length)}`,
          )
        : deriveEcpayMerchantTradeNo(idempotencyKey));
    try {
      const data = await this.postEncrypted(
        `${this.paymentBaseUrl}/1.0.0/CreditDetail/QueryTrade`,
        {
          MerchantID: this.merchantId,
          PlatformID: "",
          MerchantTradeNo: merchantTradeNo,
          ...(recorded?.tradeNo ? { TradeNo: recorded.tradeNo } : {}),
          ...(expectedAmountTwd !== null
            ? { CreditAmount: expectedAmountTwd }
            : {}),
        },
      );
      const hasRtnValue =
        data.RtnValue !== undefined &&
        data.RtnValue !== null &&
        typeof data.RtnValue === "object";
      const rtnCode =
        data.RtnCode !== undefined
          ? Number(data.RtnCode)
          : hasRtnValue && (data.RtnMsg === "" || data.RtnMsg === undefined)
            ? 1
            : NaN;
      if (rtnCode !== 1) {
        return { status: "unknown" };
      }
      const parsed = this.parseCreditLifecycle(data, expectedAmountTwd);
      const tradeNo = parsed.tradeNo || (recorded?.tradeNo ?? "");
      if (parsed.closeState === "REFUNDED" && tradeNo) {
        return {
          status: "completed",
          providerRef: `ecpay_refund:${merchantTradeNo}:${tradeNo}`,
        };
      }
      if (parsed.closeState === "FAILED") {
        return { status: "failed", error: "card_declined", retryable: false };
      }
      return { status: "unknown" };
    } catch {
      return { status: "unknown" };
    }
  }
}
