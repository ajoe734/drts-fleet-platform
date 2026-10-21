import { createTransport, type Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import {
  DeliveryTransportError,
  type MailTransport,
  type ProviderAcknowledgement,
  type OutgoingMailMessage,
  type TransportMessage,
  type PlatformTransportMessage,
} from "./notification-delivery.types";

const DOMAIN =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const LOCAL_PART =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i;
const REQUIRED = [
  "REMOTE_SMTP_HOST",
  "REMOTE_SMTP_PORT",
  "REMOTE_SMTP_USERNAME",
  "REMOTE_SMTP_PASSWORD",
  "REMOTE_SMTP_FROM_EMAIL",
] as const;

function mailbox(value: string): boolean {
  const parts = value.split("@");
  return (
    parts.length === 2 &&
    value.length <= 254 &&
    parts[0]!.length <= 64 &&
    LOCAL_PART.test(parts[0]!) &&
    DOMAIN.test(parts[1]!)
  );
}

function invalidConfiguration(): never {
  throw new DeliveryTransportError("SMTP_CONFIGURATION_INVALID", false);
}

const QUEUED_AS_PATTERN = /\bqueued (?:as|id[=:]?)\s*<?([A-Za-z0-9._@-]+)>?/i;
/** Gmail's SMTP relay final reply carries no "queued as" token, e.g.
 * "250 2.0.0 OK  1696150000 d9-...si1234567plh.100 - gsmtp". */
const GSMTP_OK_PATTERN = /\bOK\s+\d+\s+([A-Za-z0-9._-]+)\s+-\s+gsmtp\b/i;

/** Recognizes the classic "queued as <id>" reply and Gmail's SMTP relay reply.
 * An unrecognized reply format (or a candidate that echoes a redacted secret)
 * keeps providerMessageId null rather than guessing. Exported standalone so
 * both formats are directly unit-testable without a transport/network fixture. */
export function extractProviderMessageId(
  response: string,
  isSafe: (candidate: string) => boolean,
): string | null {
  const candidate =
    QUEUED_AS_PATTERN.exec(response)?.[1] ??
    GSMTP_OK_PATTERN.exec(response)?.[1];
  return candidate && isSafe(candidate) ? candidate : null;
}

/** Credentials are read only from the runtime environment (Secret Manager in dev).
 * No URL, provider preset, logger, TLS override or arbitrary mail options are accepted.
 */
export class RemoteSmtpMailTransport implements MailTransport {
  readonly provider = "remote-smtp";
  #mailer: Transporter<SMTPTransport.SentMessageInfo>;
  #from: string;
  #production: boolean;
  #allowlist: string[];
  #redactions: string[];

  constructor(
    env: NodeJS.ProcessEnv = process.env,
    createMailer: typeof createTransport = createTransport,
  ) {
    if (REQUIRED.some((key) => !env[key]?.trim())) invalidConfiguration();
    const host = env.REMOTE_SMTP_HOST!.trim();
    const port = env.REMOTE_SMTP_PORT!.trim();
    const user = env.REMOTE_SMTP_USERNAME!;
    const pass = env.REMOTE_SMTP_PASSWORD!;
    this.#from = env.REMOTE_SMTP_FROM_EMAIL!.trim();
    this.#production = env.DRTS_ENV === "production";
    if (
      !DOMAIN.test(host) ||
      !["465", "587"].includes(port) ||
      !mailbox(this.#from) ||
      /[\r\n\0]/.test(user + pass)
    )
      invalidConfiguration();

    this.#allowlist = env.REMOTE_SMTP_RECIPIENT_ALLOWLIST?.trim()
      ? env.REMOTE_SMTP_RECIPIENT_ALLOWLIST.split(",").map((entry) =>
          entry.trim().toLowerCase(),
        )
      : [];
    if (
      this.#allowlist.some((entry) => !(mailbox(entry) || DOMAIN.test(entry)))
    )
      invalidConfiguration();

    // Even a hostile provider echoing AUTH material must not persist it in receipts.
    this.#redactions = [
      ...new Set([
        user,
        pass,
        Buffer.from(user).toString("base64"),
        Buffer.from(pass).toString("base64"),
        Buffer.from(`\0${user}\0${pass}`).toString("base64"),
      ]),
    ].sort((a, b) => b.length - a.length);
    this.#mailer = createMailer({
      host,
      port: Number(port),
      secure: port === "465",
      requireTLS: true,
      ignoreTLS: false,
      opportunisticTLS: false,
      tls: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        servername: host,
      },
      auth: { user, pass },
      forceAuth: true,
      // LOGIN and PLAIN use TLS; pin PLAIN so credential redaction has no
      // challenge-dependent hashes to retain. Supported by the target providers.
      authMethod: "PLAIN",
      name: "notification.drts.invalid",
      logger: false,
      debug: false,
      transactionLog: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      pool: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      dnsTimeout: 10_000,
    });
  }

  #redact(value: string): string {
    for (const secret of this.#redactions)
      value = value.split(secret).join("[redacted]");
    return Array.from(value, (character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127 ? " " : character;
    })
      .join("")
      .slice(0, 2048);
  }

  #extractProviderMessageId(response: string): string | null {
    return extractProviderMessageId(
      response,
      (candidate) => this.#redact(candidate) === candidate,
    );
  }

  send(message: TransportMessage): Promise<ProviderAcknowledgement> {
    return this.sendMessage(message);
  }
  sendPlatform(
    message: PlatformTransportMessage,
  ): Promise<ProviderAcknowledgement> {
    return this.sendMessage(message);
  }
  private async sendMessage(
    message: OutgoingMailMessage,
  ): Promise<ProviderAcknowledgement> {
    if (
      !mailbox(message.recipientEmail) ||
      !mailbox(message.fromEmail) ||
      /[\r\n\0]/.test(message.subject) ||
      !/^<[A-Za-z0-9._-]+@[A-Za-z0-9.-]+>$/.test(message.messageId)
    ) {
      throw new DeliveryTransportError("SMTP_MESSAGE_INVALID", false);
    }
    if (!this.#production) {
      if (!this.#allowlist.length)
        throw new DeliveryTransportError(
          "SMTP_RECIPIENT_ALLOWLIST_REQUIRED",
          false,
        );
      const recipient = message.recipientEmail.toLowerCase();
      const domain = recipient.split("@")[1]!;
      if (
        !this.#allowlist.some(
          (entry) => entry === recipient || entry === domain,
        )
      ) {
        throw new DeliveryTransportError(
          "SMTP_RECIPIENT_NOT_ALLOWLISTED",
          false,
        );
      }
    }
    try {
      const info = await this.#mailer.sendMail({
        // Use the configured, provider-verified sender for both envelope and MIME.
        from: this.#from,
        to: message.recipientEmail,
        envelope: { from: this.#from, to: [message.recipientEmail] },
        subject: message.subject,
        text: message.body,
        messageId: message.messageId,
      });
      if (
        !/^250[ -]/.test(info.response) ||
        info.accepted.length !== 1 ||
        info.rejected.length
      ) {
        throw new DeliveryTransportError("SMTP_ACKNOWLEDGEMENT_INVALID", false);
      }
      // Only the final DATA acknowledgement is evidence. messageId is our
      // RFC Message-ID and must never masquerade as a provider queue ID.
      const response = this.#redact(info.response);
      return {
        provider: this.provider,
        response,
        providerMessageId: this.#extractProviderMessageId(info.response),
        acceptedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof DeliveryTransportError) throw error;
      // Never expose the library error, response, command, stack or cause.
      const failure = error as {
        code?: unknown;
        responseCode?: unknown;
      } | null;
      if (failure?.code === "ETLS")
        throw new DeliveryTransportError("SMTP_TLS_FAILED", false);
      if (failure?.code === "EAUTH")
        throw new DeliveryTransportError("SMTP_AUTH_FAILED", false);
      const code = failure?.responseCode;
      if (
        typeof code === "number" &&
        Number.isInteger(code) &&
        code >= 400 &&
        code <= 599
      ) {
        throw new DeliveryTransportError(`SMTP_REPLY_${code}`, code < 500);
      }
      throw new DeliveryTransportError("SMTP_CONNECTION_FAILED", true);
    }
  }
}

export function createRemoteSmtpTransportFromEnv(
  env: NodeJS.ProcessEnv,
): RemoteSmtpMailTransport | null {
  const configured = [...REQUIRED, "REMOTE_SMTP_RECIPIENT_ALLOWLIST"].some(
    (key) => env[key] !== undefined,
  );
  if (!configured) return null;
  if (env.MAILPIT_SMTP_PORT?.trim()) invalidConfiguration();
  return new RemoteSmtpMailTransport(env);
}
