import {
  createSmsPortFromEnv,
  type SmsSendResult,
  type TwilioHttpTransport,
  TwilioSmsAdapter,
} from "./twilio-sms.adapter";

export {
  classifyTwilioError,
  createSmsPortFromEnv,
  formatTaiwanOtpBody,
  isValidTwilioSender,
  maskTaiwanPhone,
  parseTwilioDeliveryReport,
  TwilioSmsAdapter,
  twilioSmsConfigFromEnv,
  type SmsDeliveryStatus,
  type SmsFailureCategory,
  type SmsSendResult,
  type TwilioDeliveryReport,
  type TwilioHttpResponse,
  type TwilioHttpTransport,
  type TwilioSmsConfig,
} from "./twilio-sms.adapter";

export const SMS_PORT = Symbol("PASSENGER_SMS_PORT");

export interface SmsPort {
  availability(): "available" | "not_configured";
  sendOtp(
    target: string,
    code: string,
    expiresAt: string,
  ): Promise<{
    status: "sent" | "not_configured" | "failed";
  }>;
}

/**
 * Default SMS_PORT binding in PassengerAppModule.
 * Remains "not_configured" unless the complete Twilio credential set
 * (TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, TWILIO_FROM_NUMBER)
 * is present and valid; legacy SMS_PROVIDER_* or partial credentials never enable it.
 */
export class UnconfiguredSmsPort implements SmsPort {
  private readonly adapter: TwilioSmsAdapter;

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    transport?: TwilioHttpTransport,
    now?: () => number,
  ) {
    this.adapter = createSmsPortFromEnv(env, transport, now);
  }

  availability(): "available" | "not_configured" {
    return this.adapter.availability();
  }

  async sendOtp(
    target?: string,
    code?: string,
    expiresAt?: string,
  ): Promise<SmsSendResult> {
    if (!target || !code || !expiresAt) {
      return { status: "not_configured" };
    }
    return this.adapter.sendOtp(target, code, expiresAt);
  }
}
