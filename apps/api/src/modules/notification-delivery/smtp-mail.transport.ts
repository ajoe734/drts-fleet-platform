import { createConnection } from "node:net";

import {
  DeliveryTransportError,
  type MailTransport,
  type ProviderAcknowledgement,
  type TransportMessage,
} from "./notification-delivery.types";

export interface MailpitSmtpOptions {
  port: number;
  host?: "127.0.0.1" | "::1";
  timeoutMs?: number;
}

const MAILBOX =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_LINE_BYTES = 8192;

function encodeSubject(subject: string): string {
  const words: string[] = [];
  let chunk = "";
  for (const character of subject) {
    if (Buffer.byteLength(chunk + character, "utf8") > 42) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
  return words.join("\r\n ");
}

function serializeMessage(message: TransportMessage): string {
  if (
    !MAILBOX.test(message.fromEmail) ||
    message.fromEmail.length > 254 ||
    !MAILBOX.test(message.recipientEmail) ||
    message.recipientEmail.length > 254 ||
    /[\r\n\0]/.test(message.subject) ||
    !/^<[A-Za-z0-9._-]+@[A-Za-z0-9.-]+>$/.test(message.messageId)
  ) {
    throw new DeliveryTransportError("SMTP_MESSAGE_INVALID", false);
  }
  const encodedBody = Buffer.from(message.body, "utf8").toString("base64");
  const body = encodedBody.match(/.{1,76}/g)?.join("\r\n") ?? "";
  return [
    `From: <${message.fromEmail}>`,
    `To: <${message.recipientEmail}>`,
    `Message-ID: ${message.messageId}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
    ".",
    "",
  ].join("\r\n");
}

/** Explicitly configured local Mailpit only; remote/provider SMTP needs its own secured adapter. */
export class MailpitSmtpTransport implements MailTransport {
  readonly provider = "mailpit-smtp";
  private readonly host: "127.0.0.1" | "::1";
  private readonly timeoutMs: number;

  constructor(private readonly options: MailpitSmtpOptions) {
    this.host = options.host ?? "127.0.0.1";
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (
      !Number.isInteger(options.port) ||
      options.port < 1 ||
      options.port > 65535 ||
      !["127.0.0.1", "::1"].includes(this.host) ||
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs < 1 ||
      this.timeoutMs > 60000
    ) {
      throw new DeliveryTransportError("SMTP_CONFIGURATION_INVALID", false);
    }
  }

  async send(message: TransportMessage): Promise<ProviderAcknowledgement> {
    const payload = serializeMessage(message);
    return new Promise((resolve, reject) => {
      const socket = createConnection({
        host: this.host,
        port: this.options.port,
      });
      let settled = false;
      let buffer = "";
      let responseBytes = 0;
      let responseLines: string[] = [];
      let responseCode: number | undefined;
      let step = 0;
      const fail = (code: string, retryable: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        socket.destroy();
        reject(new DeliveryTransportError(code, retryable));
      };
      // A total deadline also bounds servers that trickle bytes without completing a reply.
      const deadline = setTimeout(
        () => fail("SMTP_TIMEOUT", true),
        this.timeoutMs,
      );
      const acceptResponse = (code: number, response: string) => {
        const expected = [220, 250, 250, 250, 354, 250][step];
        if (code !== expected && !(step === 3 && code === 251)) {
          fail(`SMTP_REPLY_${code}`, code >= 400 && code < 500);
          return;
        }
        switch (step++) {
          case 0:
            socket.write("EHLO notification.drts.invalid\r\n");
            break;
          case 1:
            socket.write(`MAIL FROM:<${message.fromEmail}>\r\n`);
            break;
          case 2:
            socket.write(`RCPT TO:<${message.recipientEmail}>\r\n`);
            break;
          case 3:
            socket.write("DATA\r\n");
            break;
          case 4:
            socket.write(payload);
            break;
          case 5: {
            settled = true;
            clearTimeout(deadline);
            // Only this final DATA response acknowledges acceptance of the message itself.
            const queuedId = /\bqueued as\s+<?([A-Za-z0-9._@-]+)>?/i.exec(
              response,
            )?.[1];
            socket.end("QUIT\r\n");
            socket.destroy();
            resolve({
              provider: this.provider,
              response,
              providerMessageId: queuedId ?? null,
              acceptedAt: new Date().toISOString(),
            });
            break;
          }
        }
      };
      socket.setEncoding("utf8");
      socket.on("error", () => fail("SMTP_CONNECTION_ERROR", true));
      socket.on("close", () => fail("SMTP_DISCONNECTED_BEFORE_ACK", true));
      socket.on("data", (data: string) => {
        if (settled) return;
        responseBytes += Buffer.byteLength(data, "utf8");
        if (responseBytes > MAX_RESPONSE_BYTES) {
          fail("SMTP_RESPONSE_TOO_LARGE", false);
          return;
        }
        buffer += data;
        while (!settled) {
          const end = buffer.indexOf("\r\n");
          if (end < 0) {
            if (buffer.length > MAX_LINE_BYTES)
              fail("SMTP_RESPONSE_TOO_LARGE", false);
            return;
          }
          if (end > MAX_LINE_BYTES) {
            fail("SMTP_RESPONSE_TOO_LARGE", false);
            return;
          }
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const match = /^(\d{3})([ -])(.*)$/.exec(line);
          if (!match) {
            fail("SMTP_REPLY_INVALID", false);
            return;
          }
          const code = Number(match[1]);
          if (responseCode !== undefined && responseCode !== code) {
            fail("SMTP_REPLY_INVALID", false);
            return;
          }
          responseCode = code;
          responseLines.push(line);
          if (match[2] === " ") {
            const response = responseLines.join("\r\n");
            responseLines = [];
            responseCode = undefined;
            acceptResponse(code, response);
          }
        }
      });
    });
  }
}

export function createMailpitSmtpTransportFromEnv(
  env: NodeJS.ProcessEnv,
): MailpitSmtpTransport | null {
  const port = env.MAILPIT_SMTP_PORT?.trim();
  if (!port) return null;
  if (!/^\d+$/.test(port))
    throw new DeliveryTransportError("SMTP_CONFIGURATION_INVALID", false);
  return new MailpitSmtpTransport({ port: Number(port) });
}
