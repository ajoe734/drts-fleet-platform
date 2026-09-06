import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import {
  createMailpitSmtpTransportFromEnv,
  MailpitSmtpTransport,
} from "../../../../apps/api/src/modules/notification-delivery/smtp-mail.transport";
import type { TransportMessage } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

const message: TransportMessage = {
  deliveryId: "delivery-smtp-001",
  messageId: "<055cd733-4bce-4885-b609-6338f222ca02@notification.drts.invalid>",
  tenantId: "tenant-smtp-001",
  idempotencyKey: "smtp-receiver-001",
  recipientEmail: "recipient@example.test",
  fromEmail: "notifications@example.test",
  subject: "真實郵件驗證",
  body: "第一行\n.\n最後一行 😀",
};

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function receiver(
  options: {
    finalResponse?: string | null;
    rcptResponse?: string;
    dataResponse?: string;
    closeBeforeAck?: boolean;
    greeting?: string;
    onConnect?: (socket: Socket) => void;
  } = {},
) {
  const commands: string[] = [];
  const bodies: string[] = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.setEncoding("utf8");
    socket.write(options.greeting ?? "220 controlled-receiver ESMTP ready\r\n");
    options.onConnect?.(socket);
    let buffer = "";
    let readingData = false;
    let body: string[] = [];
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (readingData) {
          if (line !== ".") {
            body.push(line);
            continue;
          }
          bodies.push(body.join("\r\n"));
          body = [];
          readingData = false;
          if (options.closeBeforeAck) socket.destroy();
          else if (options.finalResponse !== null) {
            socket.write(
              options.finalResponse ??
                "250 2.0.0 Ok: queued as receiver-message-001\r\n",
            );
          }
          continue;
        }
        commands.push(line);
        if (line.startsWith("EHLO "))
          socket.write("250-controlled-receiver\r\n250 SIZE 10000000\r\n");
        else if (line.startsWith("MAIL FROM:"))
          socket.write("250 sender accepted\r\n");
        else if (line.startsWith("RCPT TO:"))
          socket.write(options.rcptResponse ?? "250 recipient accepted\r\n");
        else if (line === "DATA") {
          const response =
            options.dataResponse ?? "354 End data with <CRLF>.<CRLF>\r\n";
          readingData = response.startsWith("354");
          socket.write(response);
        } else if (line === "QUIT") socket.end("221 bye\r\n");
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Receiver TCP port unavailable");
  return { port: address.port, commands, bodies };
}

describe("Mailpit SMTP transport with real loopback TCP receiver", () => {
  it("sends MIME bytes and resolves only with the receiver's DATA acknowledgement", async () => {
    const target = await receiver();
    const transport = new MailpitSmtpTransport({ port: target.port });
    const receipt = await transport.send(message);
    expect(receipt).toMatchObject({
      provider: "mailpit-smtp",
      providerMessageId: "receiver-message-001",
      response: "250 2.0.0 Ok: queued as receiver-message-001",
    });
    expect(Number.isFinite(Date.parse(receipt.acceptedAt))).toBe(true);
    expect(target.commands.slice(0, 4)).toEqual([
      "EHLO notification.drts.invalid",
      "MAIL FROM:<notifications@example.test>",
      "RCPT TO:<recipient@example.test>",
      "DATA",
    ]);
    expect(target.bodies).toHaveLength(1);
    const [headers, encodedBody] = target.bodies[0]!.split("\r\n\r\n");
    expect(headers).toContain(`Message-ID: ${message.messageId}`);
    expect(headers).toContain(
      `Subject: =?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`,
    );
    expect(headers).toContain("Content-Transfer-Encoding: base64");
    expect(Buffer.from(encodedBody!, "base64").toString("utf8")).toBe(
      message.body,
    );
  });

  it("preserves a multiline final acknowledgement without inventing a provider ID", async () => {
    const target = await receiver({
      finalResponse: "250-message accepted\r\n250 processing queued\r\n",
    });
    const receipt = await new MailpitSmtpTransport({ port: target.port }).send(
      message,
    );
    expect(receipt.response).toBe(
      "250-message accepted\r\n250 processing queued",
    );
    expect(receipt.providerMessageId).toBeNull();
  });

  it("accepts fragmented replies and folds long Unicode MIME headers and body safely", async () => {
    const target = await receiver({
      greeting: "2",
      onConnect: (socket) => {
        const timer = setTimeout(
          () => socket.write("20 controlled receiver\r\n"),
          10,
        );
        cleanups.push(() => clearTimeout(timer));
      },
    });
    const subject = "繁體中文😀".repeat(60);
    const body = "郵件內容\n.\n😀".repeat(80);
    await new MailpitSmtpTransport({ port: target.port }).send({
      ...message,
      subject,
      body,
    });
    const [headers, encodedBody] = target.bodies[0]!.split("\r\n\r\n");
    const subjectWords = [...headers!.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)];
    expect(subjectWords.length).toBeGreaterThan(1);
    expect(
      subjectWords
        .map((word) => Buffer.from(word[1]!, "base64").toString("utf8"))
        .join(""),
    ).toBe(subject);
    expect(encodedBody!.split("\r\n").every((line) => line.length <= 76)).toBe(
      true,
    );
    expect(Buffer.from(encodedBody!, "base64").toString("utf8")).toBe(body);
  });

  it("reports a refused TCP connection as retryable without a provider acknowledgement", async () => {
    const server = createServer();
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Receiver TCP port unavailable");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await expect(
      new MailpitSmtpTransport({ port: address.port }).send(message),
    ).rejects.toMatchObject({ code: "SMTP_CONNECTION_ERROR", retryable: true });
  });

  it.each([
    ["451 temporary storage failure\r\n", "SMTP_REPLY_451", true],
    ["550 message rejected\r\n", "SMTP_REPLY_550", false],
  ])(
    "rejects the final DATA response %s",
    async (finalResponse, code, retryable) => {
      const target = await receiver({ finalResponse });
      await expect(
        new MailpitSmtpTransport({ port: target.port }).send(message),
      ).rejects.toMatchObject({ code, retryable });
      expect(target.bodies).toHaveLength(1);
    },
  );

  it("does not treat RCPT acceptance or completed writes as message acceptance", async () => {
    const target = await receiver({ closeBeforeAck: true });
    await expect(
      new MailpitSmtpTransport({ port: target.port }).send(message),
    ).rejects.toMatchObject({
      code: "SMTP_DISCONNECTED_BEFORE_ACK",
      retryable: true,
    });
    expect(target.commands).toContain("RCPT TO:<recipient@example.test>");
    expect(target.bodies).toHaveLength(1);
  });

  it("rejects a refused recipient without sending DATA", async () => {
    const target = await receiver({
      rcptResponse: "550 no such recipient\r\n",
    });
    await expect(
      new MailpitSmtpTransport({ port: target.port }).send(message),
    ).rejects.toMatchObject({ code: "SMTP_REPLY_550", retryable: false });
    expect(target.commands).not.toContain("DATA");
    expect(target.bodies).toHaveLength(0);
  });

  it("times out if DATA has no acknowledgement", async () => {
    const target = await receiver({ finalResponse: null });
    await expect(
      new MailpitSmtpTransport({ port: target.port, timeoutMs: 100 }).send(
        message,
      ),
    ).rejects.toMatchObject({ code: "SMTP_TIMEOUT", retryable: true });
    expect(target.bodies).toHaveLength(1);
  });

  it("bounds the entire operation when the receiver trickles an unfinished response", async () => {
    const target = await receiver({
      greeting: "220-",
      onConnect: (socket) => {
        const timer = setInterval(() => socket.write("x"), 5);
        socket.on("close", () => clearInterval(timer));
        cleanups.push(() => clearInterval(timer));
      },
    });
    await expect(
      new MailpitSmtpTransport({ port: target.port, timeoutMs: 80 }).send(
        message,
      ),
    ).rejects.toMatchObject({ code: "SMTP_TIMEOUT", retryable: true });
    expect(target.commands).toHaveLength(0);
  });

  it("rejects mismatched reply codes inside a multiline response", async () => {
    const target = await receiver({
      greeting: "220-first line\r\n250 invalid final code\r\n",
    });
    await expect(
      new MailpitSmtpTransport({ port: target.port }).send(message),
    ).rejects.toMatchObject({ code: "SMTP_REPLY_INVALID", retryable: false });
  });

  it("bounds incoming reply size", async () => {
    const target = await receiver({ greeting: `220 ${"x".repeat(9000)}\r\n` });
    await expect(
      new MailpitSmtpTransport({ port: target.port }).send(message),
    ).rejects.toMatchObject({
      code: "SMTP_RESPONSE_TOO_LARGE",
      retryable: false,
    });
  });

  it.each([
    {
      recipientEmail:
        "recipient@example.test\r\nRCPT TO:<attacker@example.test>",
    },
    { fromEmail: "notifications@example.test>\r\nDATA" },
    { subject: "Subject\r\nBcc: attacker@example.test" },
    { messageId: "<id@example.test>\r\nBcc: attacker@example.test" },
  ])(
    "rejects header or SMTP command injection before connecting: %j",
    async (changed) => {
      const target = await receiver();
      await expect(
        new MailpitSmtpTransport({ port: target.port }).send({
          ...message,
          ...changed,
        }),
      ).rejects.toMatchObject({
        code: "SMTP_MESSAGE_INVALID",
        retryable: false,
      });
      expect(target.commands).toHaveLength(0);
      expect(target.bodies).toHaveLength(0);
    },
  );

  it("requires an explicit local provider port and rejects malformed configuration", () => {
    expect(createMailpitSmtpTransportFromEnv({})).toBeNull();
    expect(
      createMailpitSmtpTransportFromEnv({ MAILPIT_SMTP_PORT: " " }),
    ).toBeNull();
    expect(
      createMailpitSmtpTransportFromEnv({ MAILPIT_SMTP_PORT: "1025" })
        ?.provider,
    ).toBe("mailpit-smtp");
    for (const port of ["garbage", "-1", "0", "65536", "1025example"]) {
      expect(() =>
        createMailpitSmtpTransportFromEnv({ MAILPIT_SMTP_PORT: port }),
      ).toThrow("SMTP_CONFIGURATION_INVALID");
    }
    expect(
      () =>
        new MailpitSmtpTransport({
          port: 1025,
          host: "remote.example.test" as "127.0.0.1",
        }),
    ).toThrow("SMTP_CONFIGURATION_INVALID");
  });
});
