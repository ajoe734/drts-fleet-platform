import {
  DeliveryTransportError,
  type MailTransport,
} from "../notification-delivery/notification-delivery.types";
import { createMailTransportFromEnv } from "../notification-delivery/smtp-mail.transport";
import {
  createSmsPortFromEnv,
  type TwilioSmsAdapter,
} from "../passenger-app/otp/twilio-sms.adapter";
import type { DriverOnboardingChannel } from "./driver-onboarding-outbox.repository";

export const DRIVER_ONBOARDING_TRANSPORT = Symbol(
  "DRIVER_ONBOARDING_TRANSPORT",
);

export interface DriverOnboardingPayload {
  recipient: string;
  registrationCode: string;
  activationToken: string;
  expiresAt: string;
}

type SendOutcome =
  | { status: "accepted" }
  | { status: "delivered" }
  | { status: "failed"; reasonCode: string; retryable: boolean }
  | { status: "uncertain"; reasonCode: "acknowledgement_unknown" };

export interface DriverOnboardingTransport {
  send(
    channel: DriverOnboardingChannel,
    deliveryId: string,
    payload: DriverOnboardingPayload,
  ): Promise<SendOutcome>;
}

const DEFAULT_FROM = "driver-onboarding@notification.drts.invalid";
const ACTIVATION_URL = "https://api.smarttransport.tw/driver-activate";
const expiryFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  dateStyle: "short",
  timeStyle: "short",
  hourCycle: "h23",
});

function messageParts(payload: DriverOnboardingPayload) {
  const link = new URL(ACTIVATION_URL);
  // A fragment lets installed App Links redeem directly while keeping the
  // credential out of HTTP requests and ordinary mail link scanners.
  link.hash = new URLSearchParams({
    token: payload.activationToken,
  }).toString();
  return {
    link: link.toString(),
    expiresAt: expiryFormatter.format(new Date(payload.expiresAt)),
  };
}

function unavailable(): SendOutcome {
  return {
    status: "failed",
    reasonCode: "transport_unavailable",
    retryable: false,
  };
}

function acknowledgementUnknown(): SendOutcome {
  return { status: "uncertain", reasonCode: "acknowledgement_unknown" };
}

export class PlatformDriverOnboardingTransport implements DriverOnboardingTransport {
  constructor(
    private readonly mail: MailTransport | null,
    private readonly sms: Pick<TwilioSmsAdapter, "sendDriverOnboarding">,
    private readonly fromEmail: string,
  ) {}

  send(
    channel: DriverOnboardingChannel,
    deliveryId: string,
    payload: DriverOnboardingPayload,
  ): Promise<SendOutcome> {
    const message = messageParts(payload);
    if (channel === "sms") {
      return this.sendSms(
        payload.recipient,
        `DRTS 司機資格已核可。啟用 App ${message.link}\n手動驗證碼 ${payload.registrationCode}，限用一次，有效至 ${message.expiresAt}（台灣時間）。`,
      );
    }
    return this.sendEmail(
      deliveryId,
      payload.recipient,
      [
        "您的 DRTS 司機資格已核可。",
        "",
        "點選下方連結開啟 DRTS Driver App，即可完成裝置驗證。",
        message.link,
        "",
        `若需手動驗證，請在 App 輸入建檔手機及驗證碼 ${payload.registrationCode}，限用一次。`,
        `有效至 ${message.expiresAt}（台灣時間）。`,
      ].join("\n"),
    );
  }

  private async sendEmail(
    deliveryId: string,
    recipientEmail: string,
    body: string,
  ): Promise<SendOutcome> {
    if (!this.mail?.sendPlatform) return unavailable();
    try {
      const acknowledgement = await this.mail.sendPlatform({
        tenantId: null,
        deliveryId,
        idempotencyKey: deliveryId,
        messageId: `<${deliveryId}@notification.drts.invalid>`,
        recipientEmail,
        fromEmail: this.fromEmail,
        subject: "啟用 DRTS 司機 App",
        body,
      });
      return acknowledgement?.provider === this.mail.provider &&
        Boolean(acknowledgement.response?.trim()) &&
        Number.isFinite(Date.parse(acknowledgement.acceptedAt))
        ? { status: "accepted" }
        : acknowledgementUnknown();
    } catch (error) {
      if (error instanceof DeliveryTransportError) {
        if (/^SMTP_REPLY_4[0-9]{2}$/.test(error.code)) {
          return {
            status: "failed",
            reasonCode: "provider_rejected",
            retryable: true,
          };
        }
        if (
          /^SMTP_REPLY_5[0-9]{2}$/.test(error.code) ||
          [
            "SMTP_MESSAGE_INVALID",
            "SMTP_RECIPIENT_ALLOWLIST_REQUIRED",
            "SMTP_RECIPIENT_NOT_ALLOWLISTED",
            "SMTP_AUTH_FAILED",
            "SMTP_TLS_FAILED",
          ].includes(error.code)
        ) {
          return {
            status: "failed",
            reasonCode: "provider_rejected",
            retryable: false,
          };
        }
      }
      return acknowledgementUnknown();
    }
  }

  private async sendSms(recipient: string, body: string): Promise<SendOutcome> {
    const result = await this.sms.sendDriverOnboarding(recipient, body);
    if (result.status === "not_configured") return unavailable();
    if (result.status === "sent") {
      return {
        status:
          result.deliveryStatus === "delivered" ? "delivered" : "accepted",
      };
    }
    if (result.httpStatus === 429) {
      return {
        status: "failed",
        reasonCode: "provider_rejected",
        retryable: true,
      };
    }
    if (
      result.failureCategory === "invalid_number" ||
      result.failureCategory === "credential_error" ||
      ["failed", "undelivered", "canceled"].includes(
        result.deliveryStatus ?? "",
      ) ||
      (result.httpStatus !== undefined &&
        result.httpStatus >= 400 &&
        result.httpStatus < 500 &&
        result.httpStatus !== 408)
    ) {
      return {
        status: "failed",
        reasonCode: "provider_rejected",
        retryable: false,
      };
    }
    return acknowledgementUnknown();
  }
}

export function createDriverOnboardingTransport(
  env: NodeJS.ProcessEnv,
): DriverOnboardingTransport {
  return new PlatformDriverOnboardingTransport(
    env.DRIVER_ONBOARDING_NOTIFICATIONS_ENABLED === "true"
      ? createMailTransportFromEnv(env)
      : null,
    createSmsPortFromEnv({ ...env, PASSENGER_OTP_PEPPER: undefined }),
    env.REMOTE_SMTP_FROM_EMAIL?.trim() ||
      env.NOTIFICATION_FROM_EMAIL?.trim() ||
      DEFAULT_FROM,
  );
}
