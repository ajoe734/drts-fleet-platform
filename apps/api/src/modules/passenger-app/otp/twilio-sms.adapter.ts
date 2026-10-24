import type { SmsPort } from "./sms.port";

export type SmsFailureCategory =
  | "temporary_failure"
  | "invalid_number"
  | "credential_error";

export type SmsDeliveryStatus =
  | "accepted"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "canceled";

export interface SmsSendResult {
  status: "sent" | "not_configured" | "failed";
  provider?: "twilio";
  messageSid?: string;
  deliveryStatus?: SmsDeliveryStatus;
  failureCategory?: SmsFailureCategory;
  providerErrorCode?: number;
  httpStatus?: number;
  maskedTarget?: string;
}

export interface TwilioDeliveryReport {
  provider: "twilio";
  messageSid: string;
  deliveryStatus: SmsDeliveryStatus;
  terminal: boolean;
  delivered: boolean;
  maskedTarget: string | null;
  providerErrorCode: number | null;
  failureCategory: SmsFailureCategory | null;
}

export interface TwilioSmsConfig {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  from: string;
  baseUrl: string;
  timeoutMs: number;
  statusCallbackUrl?: string;
}

export interface TwilioHttpResponse {
  status: number;
  text(): Promise<string>;
}

export type TwilioHttpTransport = (
  url: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<TwilioHttpResponse>;

const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const API_KEY_SID_PATTERN = /^SK[0-9a-fA-F]{32}$/;
const API_KEY_SECRET_PATTERN = /^[A-Za-z0-9]{20,64}$/;
const E164_PHONE_PATTERN = /^\+[1-9][0-9]{6,14}$/;
const TAIWAN_MOBILE_E164_PATTERN = /^\+886(9[0-9]{2})[0-9]{3}([0-9]{3})$/;
const ALPHANUMERIC_SENDER_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9 ]{1,11}$/;
const MESSAGE_SID_PATTERN = /^SM[0-9a-fA-F]{32}$/;
const OTP_CODE_PATTERN = /^[0-9]{6}$/;

const INVALID_NUMBER_ERROR_CODES = new Set([
  21211, // Invalid 'To' Phone Number
  21408, // Permission to send an SMS has not been enabled for the region
  21604, // 'To' phone number is required to send an SMS
  21608, // The number is unverified (trial account restriction)
  21610, // Attempt to send to unsubscribed recipient
  21612, // The 'To' phone number is not currently reachable via SMS
  21614, // 'To' number is not a valid mobile number
]);

const CREDENTIAL_ERROR_CODES = new Set([
  20003, // Authentication Error / Permission Denied (including Trust Hub KYC block)
  20005, // Account not active
  21212, // Invalid 'From' Phone Number
  21606, // The 'From' phone number provided is not a valid message-capable Twilio phone number
]);

const ACCEPTED_DELIVERY_STATUSES = new Set<SmsDeliveryStatus>([
  "accepted",
  "queued",
  "sending",
  "sent",
  "delivered",
]);

const ALL_DELIVERY_STATUSES = new Set<SmsDeliveryStatus>([
  "accepted",
  "queued",
  "sending",
  "sent",
  "delivered",
  "undelivered",
  "failed",
  "canceled",
]);

const TERMINAL_DELIVERY_STATUSES = new Set<SmsDeliveryStatus>([
  "delivered",
  "undelivered",
  "failed",
  "canceled",
]);

export function isValidTwilioSender(from: string): boolean {
  const trimmed = from.trim();
  if (!trimmed) return false;
  return (
    E164_PHONE_PATTERN.test(trimmed) || ALPHANUMERIC_SENDER_PATTERN.test(trimmed)
  );
}

export function maskTaiwanPhone(phone: string): string {
  const trimmed = phone.trim();
  const twMatch = TAIWAN_MOBILE_E164_PATTERN.exec(trimmed);
  if (twMatch) {
    return `+886 ${twMatch[1]}-***-${twMatch[2]}`;
  }
  if (E164_PHONE_PATTERN.test(trimmed) && trimmed.length >= 8) {
    const prefix = trimmed.slice(0, 4);
    const suffix = trimmed.slice(-3);
    return `${prefix}-***-${suffix}`;
  }
  return "***";
}

export function formatTaiwanOtpBody(
  code: string,
  expiresAt: string,
  nowMs: number = Date.now(),
): string {
  if (!OTP_CODE_PATTERN.test(code)) {
    throw new Error("invalid_otp_code_format");
  }
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    throw new Error("expired_or_invalid_otp_window");
  }
  const minutes = Math.min(
    60,
    Math.max(1, Math.ceil((expiresAtMs - nowMs) / 60_000)),
  );
  return `[智行叫車] 您的驗證碼是 ${code}，${minutes} 分鐘內有效。請勿提供給他人。`;
}

export function classifyTwilioError(
  httpStatus: number | null,
  providerErrorCode: number | null,
): SmsFailureCategory {
  if (
    providerErrorCode !== null &&
    CREDENTIAL_ERROR_CODES.has(providerErrorCode)
  ) {
    return "credential_error";
  }
  if (
    providerErrorCode !== null &&
    INVALID_NUMBER_ERROR_CODES.has(providerErrorCode)
  ) {
    return "invalid_number";
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return "credential_error";
  }
  if (
    httpStatus === null ||
    httpStatus === 408 ||
    httpStatus === 429 ||
    httpStatus >= 500
  ) {
    return "temporary_failure";
  }
  if (providerErrorCode === 20429 || (providerErrorCode !== null && providerErrorCode >= 30001 && providerErrorCode <= 30008)) {
    return "temporary_failure";
  }
  if (httpStatus === 400 || httpStatus === 404 || httpStatus === 422) {
    return "invalid_number";
  }
  return "temporary_failure";
}

export function parseTwilioDeliveryReport(
  payload: Record<string, unknown>,
): TwilioDeliveryReport {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("twilio_delivery_report_invalid_payload");
  }
  const rawSid = payload.MessageSid ?? payload.SmsSid ?? payload.sid;
  const rawStatus =
    payload.MessageStatus ?? payload.SmsStatus ?? payload.status;
  if (typeof rawSid !== "string" || !MESSAGE_SID_PATTERN.test(rawSid.trim())) {
    throw new Error("twilio_delivery_report_invalid_sid");
  }
  if (typeof rawStatus !== "string") {
    throw new Error("twilio_delivery_report_invalid_status");
  }
  const normalizedStatus = rawStatus.trim().toLowerCase() as SmsDeliveryStatus;
  if (!ALL_DELIVERY_STATUSES.has(normalizedStatus)) {
    throw new Error("twilio_delivery_report_invalid_status");
  }
  const rawTo = payload.To ?? payload.to;
  const maskedTarget =
    typeof rawTo === "string" && rawTo.trim()
      ? maskTaiwanPhone(rawTo.trim())
      : null;

  const rawErrorCode = payload.ErrorCode ?? payload.error_code;
  let providerErrorCode: number | null = null;
  if (typeof rawErrorCode === "number" && Number.isInteger(rawErrorCode)) {
    providerErrorCode = rawErrorCode;
  } else if (
    typeof rawErrorCode === "string" &&
    /^[0-9]{4,6}$/.test(rawErrorCode.trim())
  ) {
    providerErrorCode = Number(rawErrorCode.trim());
  }

  const isFailedStatus =
    normalizedStatus === "failed" ||
    normalizedStatus === "undelivered" ||
    normalizedStatus === "canceled";
  const failureCategory =
    isFailedStatus || providerErrorCode !== null
      ? classifyTwilioError(null, providerErrorCode)
      : null;

  return {
    provider: "twilio",
    messageSid: rawSid.trim(),
    deliveryStatus: normalizedStatus,
    terminal: TERMINAL_DELIVERY_STATUSES.has(normalizedStatus),
    delivered: normalizedStatus === "delivered",
    maskedTarget,
    providerErrorCode,
    failureCategory,
  };
}

/**
 * Resolves Twilio SMS configuration using an all-or-nothing rule.
 * Never reads TWILIO_AUTH_TOKEN; only API Key SID + Secret are accepted.
 */
export function twilioSmsConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TwilioSmsConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const apiKeySid = env.TWILIO_API_KEY_SID?.trim() ?? "";
  const apiKeySecret = env.TWILIO_API_KEY_SECRET?.trim() ?? "";
  const from = env.TWILIO_FROM_NUMBER?.trim() ?? "";

  if (!accountSid || !apiKeySid || !apiKeySecret || !from) {
    return null;
  }
  if (
    env.PASSENGER_OTP_PEPPER !== undefined &&
    env.PASSENGER_OTP_PEPPER.trim().length < 32
  ) {
    return null;
  }
  if (
    !ACCOUNT_SID_PATTERN.test(accountSid) ||
    !API_KEY_SID_PATTERN.test(apiKeySid) ||
    !API_KEY_SECRET_PATTERN.test(apiKeySecret) ||
    !isValidTwilioSender(from)
  ) {
    return null;
  }

  let timeoutMs = 10_000;
  if (env.TWILIO_HTTP_TIMEOUT_MS !== undefined) {
    const parsedTimeout = Number(env.TWILIO_HTTP_TIMEOUT_MS);
    if (
      !Number.isSafeInteger(parsedTimeout) ||
      parsedTimeout < 500 ||
      parsedTimeout > 30_000
    ) {
      return null;
    }
    timeoutMs = parsedTimeout;
  }

  let statusCallbackUrl: string | undefined;
  if (env.TWILIO_STATUS_CALLBACK_URL?.trim()) {
    try {
      const parsed = new URL(env.TWILIO_STATUS_CALLBACK_URL.trim());
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
        return null;
      }
      statusCallbackUrl = parsed.toString();
    } catch {
      return null;
    }
  }

  return Object.freeze({
    accountSid,
    apiKeySid,
    apiKeySecret,
    from,
    baseUrl: "https://api.twilio.com",
    timeoutMs,
    ...(statusCallbackUrl ? { statusCallbackUrl } : {}),
  });
}

const defaultTransport: TwilioHttpTransport = async (url, init) => {
  const response = await fetch(url, init);
  return {
    status: response.status,
    text: () => response.text(),
  };
};

export class TwilioSmsAdapter implements SmsPort {
  private readonly config: TwilioSmsConfig | null;
  private readonly transport: TwilioHttpTransport;
  private readonly now: () => number;

  constructor(
    config: TwilioSmsConfig | null,
    transport: TwilioHttpTransport = defaultTransport,
    now: () => number = () => Date.now(),
  ) {
    this.config =
      config &&
      ACCOUNT_SID_PATTERN.test(config.accountSid) &&
      API_KEY_SID_PATTERN.test(config.apiKeySid) &&
      API_KEY_SECRET_PATTERN.test(config.apiKeySecret) &&
      isValidTwilioSender(config.from)
        ? Object.freeze({ ...config })
        : null;
    this.transport = transport;
    this.now = now;
  }

  availability(): "available" | "not_configured" {
    return this.config ? "available" : "not_configured";
  }

  async sendOtp(
    target: string,
    code: string,
    expiresAt: string,
  ): Promise<SmsSendResult> {
    if (!this.config) {
      return { status: "not_configured" };
    }
    const normalizedTarget = typeof target === "string" ? target.trim() : "";
    const maskedTarget = maskTaiwanPhone(normalizedTarget);
    if (!E164_PHONE_PATTERN.test(normalizedTarget)) {
      return {
        status: "failed",
        provider: "twilio",
        failureCategory: "invalid_number",
        maskedTarget,
      };
    }

    let bodyText: string;
    try {
      bodyText = formatTaiwanOtpBody(code, expiresAt, this.now());
    } catch {
      return {
        status: "failed",
        provider: "twilio",
        failureCategory: "temporary_failure",
        maskedTarget,
      };
    }

    const params = new URLSearchParams({
      To: normalizedTarget,
      From: this.config.from,
      Body: bodyText,
    });
    if (this.config.statusCallbackUrl) {
      params.set("StatusCallback", this.config.statusCallbackUrl);
    }

    const basicCredentials = Buffer.from(
      `${this.config.apiKeySid}:${this.config.apiKeySecret}`,
      "utf8",
    ).toString("base64");
    const endpoint = `${this.config.baseUrl.replace(/\/+$/, "")}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: TwilioHttpResponse;
    try {
      response = await this.transport(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicCredentials}`,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          Accept: "application/json",
        },
        body: params.toString(),
        signal: controller.signal,
      });
    } catch {
      // Timeout, AbortError, DNS or socket failure -> temporary_failure.
      // Never echo underlying error text, headers, or OTP payload.
      return {
        status: "failed",
        provider: "twilio",
        failureCategory: "temporary_failure",
        maskedTarget,
      };
    } finally {
      clearTimeout(timer);
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      const raw = await response.text();
      const json: unknown = raw ? JSON.parse(raw) : null;
      if (json && typeof json === "object" && !Array.isArray(json)) {
        parsed = json as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }

    const rawCode = parsed?.code ?? parsed?.error_code;
    const providerErrorCode =
      typeof rawCode === "number" && Number.isInteger(rawCode)
        ? rawCode
        : typeof rawCode === "string" && /^[0-9]{4,6}$/.test(rawCode.trim())
          ? Number(rawCode.trim())
          : null;

    if (response.status >= 200 && response.status < 300 && parsed) {
      const sid = typeof parsed.sid === "string" ? parsed.sid.trim() : "";
      const rawStatus =
        typeof parsed.status === "string"
          ? (parsed.status.trim().toLowerCase() as SmsDeliveryStatus)
          : undefined;
      if (
        MESSAGE_SID_PATTERN.test(sid) &&
        rawStatus &&
        ACCEPTED_DELIVERY_STATUSES.has(rawStatus) &&
        providerErrorCode === null
      ) {
        return {
          status: "sent",
          provider: "twilio",
          messageSid: sid,
          deliveryStatus: rawStatus,
          httpStatus: response.status,
          maskedTarget,
        };
      }
      return {
        status: "failed",
        provider: "twilio",
        ...(MESSAGE_SID_PATTERN.test(sid) ? { messageSid: sid } : {}),
        ...(rawStatus && ALL_DELIVERY_STATUSES.has(rawStatus)
          ? { deliveryStatus: rawStatus }
          : {}),
        failureCategory: classifyTwilioError(
          response.status,
          providerErrorCode,
        ),
        ...(providerErrorCode !== null ? { providerErrorCode } : {}),
        httpStatus: response.status,
        maskedTarget,
      };
    }

    return {
      status: "failed",
      provider: "twilio",
      failureCategory: classifyTwilioError(response.status, providerErrorCode),
      ...(providerErrorCode !== null ? { providerErrorCode } : {}),
      httpStatus: response.status,
      maskedTarget,
    };
  }

  parseDeliveryReport(payload: Record<string, unknown>): TwilioDeliveryReport {
    return parseTwilioDeliveryReport(payload);
  }
}

export function createSmsPortFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  transport: TwilioHttpTransport = defaultTransport,
  now: () => number = () => Date.now(),
): TwilioSmsAdapter {
  return new TwilioSmsAdapter(twilioSmsConfigFromEnv(env), transport, now);
}
