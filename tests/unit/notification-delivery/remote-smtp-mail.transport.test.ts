import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import net, { type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { inspect } from "node:util";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { FileMailOutbox } from "../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryModule } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.module";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import type { TransportMessage } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { RemoteSmtpMailTransport } from "../../../apps/api/src/modules/notification-delivery/remote-smtp-mail.transport";
import {
  createMailTransportFromEnv,
  createMailpitSmtpTransportFromEnv,
} from "../../../apps/api/src/modules/notification-delivery/smtp-mail.transport";

const env = {
  DRTS_ENV: "development",
  REMOTE_SMTP_HOST: "localhost",
  REMOTE_SMTP_PORT: "587",
  REMOTE_SMTP_USERNAME: "test-smtp-user-private",
  REMOTE_SMTP_PASSWORD: "test-smtp-password-private",
  REMOTE_SMTP_FROM_EMAIL: "sender@example.test",
  REMOTE_SMTP_RECIPIENT_ALLOWLIST: "allowed@example.test, approved.test",
};
const message: TransportMessage = {
  deliveryId: "delivery-test",
  messageId: "<delivery-test@notification.drts.invalid>",
  tenantId: "tenant-test",
  idempotencyKey: "mail-test",
  recipientEmail: "allowed@example.test",
  fromEmail: "sender@example.test",
  subject: "TLS 郵件",
  body: "A private invitation body",
};

let directory: string;
let cert: Buffer;
let key: Buffer;
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), "remote-smtp-unit-"));
  const certPath = join(directory, "cert.pem");
  const keyPath = join(directory, "key.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "2",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-subj",
      "/CN=localhost",
      "-addext",
      "subjectAltName=DNS:localhost",
    ],
    { stdio: "ignore" },
  );
  cert = readFileSync(certPath);
  key = readFileSync(keyPath);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

/** In-process unit fixture only: random loopback port, destroyed after each test.
 * The only client substitutions are connection destination and trust of this test
 * CA. The production adapter, AUTH, SMTP state machine and TLS verification run.
 */
async function receiver(
  options: {
    implicit?: boolean;
    starttls?: "reject" | "absent" | "disconnect";
    trust?: boolean;
    mismatch?: boolean;
    authFailure?: boolean;
    finalReply?: string | null;
  } = {},
) {
  const commands: Array<{ line: string; encrypted: boolean }> = [];
  const bodies: string[] = [];
  const authenticated: boolean[] = [];
  const sockets = new Set<Socket>();
  const attach = (socket: Socket, encrypted: boolean, greeting: boolean) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    socket.on("close", () => sockets.delete(socket));
    if (greeting) socket.write("220 fixture ESMTP ready\r\n");
    let buffer = "";
    let inData = false;
    let body: string[] = [];
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (inData) {
          if (line !== ".") {
            body.push(line);
            continue;
          }
          inData = false;
          bodies.push(body.join("\r\n"));
          body = [];
          if (options.finalReply === null) socket.destroy();
          else
            socket.write(
              options.finalReply ??
                "250 2.0.0 queued as provider-queue-001\r\n",
            );
          continue;
        }
        commands.push({ line, encrypted });
        if (line.startsWith("EHLO")) {
          socket.write(
            `250-fixture\r\n${!encrypted && options.starttls !== "absent" ? "250-STARTTLS\r\n" : ""}250 AUTH PLAIN\r\n`,
          );
        } else if (line === "STARTTLS") {
          if (options.starttls === "reject" || options.starttls === "absent") {
            socket.write("454 TLS unavailable\r\n");
          } else if (options.starttls === "disconnect") socket.destroy();
          else {
            socket.removeListener("data", onData);
            socket.write("220 Begin TLS\r\n");
            const secured = new tls.TLSSocket(socket, {
              isServer: true,
              secureContext: tls.createSecureContext({ key, cert }),
            });
            attach(secured, true, false);
          }
        } else if (line.startsWith("AUTH PLAIN ")) {
          const valid =
            encrypted &&
            Buffer.from(line.slice(11), "base64").toString() ===
              `\0${env.REMOTE_SMTP_USERNAME}\0${env.REMOTE_SMTP_PASSWORD}`;
          authenticated.push(valid);
          socket.write(
            valid && !options.authFailure
              ? "235 Authenticated\r\n"
              : `535 Rejected ${env.REMOTE_SMTP_USERNAME} ${env.REMOTE_SMTP_PASSWORD}\r\n`,
          );
        } else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO"))
          socket.write("250 OK\r\n");
        else if (line === "DATA") {
          inData = true;
          socket.write("354 Send data\r\n");
        } else if (line === "QUIT") socket.end("221 Bye\r\n");
      }
    };
    socket.on("data", onData);
  };
  const server = options.implicit
    ? tls.createServer({ key, cert }, (socket) => attach(socket, true, true))
    : net.createServer((socket) => attach(socket, false, true));
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  );
  const address = server.address() as net.AddressInfo;
  const connectNet = net.connect;
  const connectTls = tls.connect;
  vi.spyOn(net, "connect").mockImplementation(((
    settings: net.NetConnectOpts,
    callback?: () => void,
  ) =>
    connectNet(
      { ...settings, host: "127.0.0.1", port: address.port },
      callback,
    )) as typeof net.connect);
  vi.spyOn(tls, "connect").mockImplementation(((
    settings: tls.ConnectionOptions,
    callback?: () => void,
  ) => {
    expect(settings.rejectUnauthorized).toBe(true);
    expect(settings.minVersion).toBe("TLSv1.2");
    return connectTls(
      {
        ...settings,
        ...(settings.socket ? {} : { host: "127.0.0.1", port: address.port }),
        ...(options.trust === false ? {} : { ca: cert }),
        ...(options.mismatch ? { servername: "other.example.test" } : {}),
      },
      callback,
    );
  }) as typeof tls.connect);
  return { commands, bodies, authenticated };
}

describe("remote SMTP security and provider evidence", () => {
  it.each(["587", "465"])(
    "authenticates and captures the DATA acceptance on port %s",
    async (port) => {
      const target = await receiver({ implicit: port === "465" });
      const transport = createMailTransportFromEnv({
        ...env,
        REMOTE_SMTP_PORT: port,
      })!;
      const service = new NotificationDeliveryService(
        new FileMailOutbox(join(directory, `ack-${port}`)),
        transport,
      );
      const queued = await service.enqueue(message);
      const result = await service.dispatch(
        message.tenantId,
        queued.deliveryId,
      );
      expect(result?.status).toBe("sent");
      expect(result?.attempts[0]?.acknowledgement).toMatchObject({
        provider: "remote-smtp",
        response: "250 2.0.0 queued as provider-queue-001",
        providerMessageId: "provider-queue-001",
      });
      expect(target.authenticated).toEqual([true]);
      expect(
        target.commands
          .filter(({ line }) => /^(AUTH|MAIL|RCPT|DATA)/.test(line))
          .every(({ encrypted }) => encrypted),
      ).toBe(true);
      expect(target.bodies).toHaveLength(1);
      expect(target.bodies[0]).toContain("From: sender@example.test");
      expect(target.bodies[0]).toContain("To: allowed@example.test");
      expect(target.bodies[0]).toContain(message.body);
    },
  );

  it.each(["reject", "absent", "disconnect"] as const)(
    "sends no AUTH or content when STARTTLS is %s",
    async (starttls) => {
      const target = await receiver({ starttls });
      await expect(
        new RemoteSmtpMailTransport(env).send(message),
      ).rejects.toThrow(/^SMTP_/);
      expect(
        target.commands.some(({ line }) => /^(AUTH|MAIL|RCPT|DATA)/.test(line)),
      ).toBe(false);
      expect(target.bodies).toEqual([]);
    },
  );

  it.each(["587", "465"])(
    "rejects untrusted certificates on port %s before AUTH",
    async (port) => {
      const target = await receiver({ implicit: port === "465", trust: false });
      await expect(
        new RemoteSmtpMailTransport({ ...env, REMOTE_SMTP_PORT: port }).send(
          message,
        ),
      ).rejects.toThrow(/^SMTP_/);
      expect(target.authenticated).toEqual([]);
      expect(target.bodies).toEqual([]);
    },
  );

  it("rejects a trusted certificate for a different hostname", async () => {
    const target = await receiver({ mismatch: true });
    await expect(
      new RemoteSmtpMailTransport(env).send(message),
    ).rejects.toThrow(/^SMTP_/);
    expect(target.authenticated).toEqual([]);
  });

  it("does not invent acknowledgement after a lost DATA response", async () => {
    await receiver({ finalReply: null });
    await expect(
      new RemoteSmtpMailTransport(env).send(message),
    ).rejects.toThrow(/^SMTP_/);
  });

  it("retains provider responses without substituting our Message-ID for a queue ID", async () => {
    await receiver({ finalReply: "250 2.0.0 Message accepted\r\n" });
    expect(await new RemoteSmtpMailTransport(env).send(message)).toMatchObject({
      response: "250 2.0.0 Message accepted",
      providerMessageId: null,
    });
  });

  it.each([false, true])(
    "never exposes credentials in logs, errors, inspection or persisted provider evidence (AUTH failure=%s)",
    async (authFailure) => {
      const outputs = ["log", "info", "warn", "error", "debug", "trace"].map(
        (method) =>
          vi
            .spyOn(console, method as "log")
            .mockImplementation(() => undefined),
      );
      const secrets = [
        env.REMOTE_SMTP_USERNAME,
        env.REMOTE_SMTP_PASSWORD,
        Buffer.from(env.REMOTE_SMTP_USERNAME).toString("base64"),
        Buffer.from(env.REMOTE_SMTP_PASSWORD).toString("base64"),
        Buffer.from(
          `\0${env.REMOTE_SMTP_USERNAME}\0${env.REMOTE_SMTP_PASSWORD}`,
        ).toString("base64"),
      ];
      await receiver({
        authFailure,
        finalReply: `250 queued as ${env.REMOTE_SMTP_PASSWORD} ${secrets.join(" ")}\r\n`,
      });
      const transport = new RemoteSmtpMailTransport(env);
      const outbox = new FileMailOutbox(
        join(directory, `redaction-${authFailure}`),
      );
      const service = new NotificationDeliveryService(outbox, transport);
      const queued = await service.enqueue(message);
      const result = await service.dispatch(
        message.tenantId,
        queued.deliveryId,
      );
      expect(result?.status).toBe(authFailure ? "failed" : "sent");
      if (authFailure)
        expect(result?.attempts[0]?.errorCode).toBe("SMTP_AUTH_FAILED");
      else
        expect(
          result?.attempts[0]?.acknowledgement?.providerMessageId,
        ).toBeNull();
      const stored = await outbox.transaction((state) => JSON.stringify(state));
      let surfacedError = "";
      if (authFailure) {
        try {
          await transport.send(message);
        } catch (error) {
          surfacedError = inspect(error, { showHidden: true });
        }
        expect(surfacedError).toContain("SMTP_AUTH_FAILED");
      }
      const captured =
        JSON.stringify(outputs.map((spy) => spy.mock.calls)) +
        stored +
        surfacedError +
        inspect(transport, { showHidden: true });
      for (const secret of secrets) expect(captured).not.toContain(secret);
      expect(outputs.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    },
  );
});

describe("recipient boundary and environment selection", () => {
  it.each([
    "someone@example.test",
    "allowed@example.test.evil",
    "allowed@sub.approved.test",
    "allowed+tag@example.test",
  ])(
    "records an auditable permanent rejection for %s without connecting",
    async (recipientEmail) => {
      const connect = vi.spyOn(net, "connect");
      const outbox = new FileMailOutbox(join(directory, recipientEmail));
      const service = new NotificationDeliveryService(
        outbox,
        new RemoteSmtpMailTransport(env),
      );
      const queued = await service.enqueue({ ...message, recipientEmail });
      const receipt = await service.dispatch(
        message.tenantId,
        queued.deliveryId,
      );
      expect(receipt).toMatchObject({
        status: "failed",
        nextAttemptAt: null,
        attempts: [
          {
            errorCode: "SMTP_RECIPIENT_NOT_ALLOWLISTED",
            retryable: false,
            acknowledgement: null,
          },
        ],
      });
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", "  "])(
    "denies all recipients for an unset/empty allowlist (%s)",
    async (allowlist) => {
      await expect(
        new RemoteSmtpMailTransport({
          ...env,
          REMOTE_SMTP_RECIPIENT_ALLOWLIST: allowlist,
        }).send(message),
      ).rejects.toMatchObject({
        code: "SMTP_RECIPIENT_ALLOWLIST_REQUIRED",
        retryable: false,
      });
    },
  );

  it.each([undefined, "staging", "Production"])(
    "treats DRTS_ENV=%s as non-production",
    async (drtsEnv) => {
      await expect(
        new RemoteSmtpMailTransport({ ...env, DRTS_ENV: drtsEnv }).send({
          ...message,
          recipientEmail: "other@example.test",
        }),
      ).rejects.toMatchObject({ code: "SMTP_RECIPIENT_NOT_ALLOWLISTED" });
    },
  );

  it.each(["ALLOWED@EXAMPLE.TEST", "person@approved.test"])(
    "allows exact addresses and exact domains (%s)",
    async (recipientEmail) => {
      await receiver();
      expect(
        (
          await new RemoteSmtpMailTransport(env).send({
            ...message,
            recipientEmail,
          })
        ).provider,
      ).toBe("remote-smtp");
    },
  );

  it("allows production recipients without a whitelist", async () => {
    await receiver();
    const transport = new RemoteSmtpMailTransport({
      ...env,
      DRTS_ENV: "production",
      REMOTE_SMTP_RECIPIENT_ALLOWLIST: undefined,
    });
    expect(
      (
        await transport.send({
          ...message,
          recipientEmail: "other@example.test",
        })
      ).provider,
    ).toBe("remote-smtp");
  });

  it.each([
    "a@example.test,second@evil.test",
    "Name <allowed@example.test>",
    "allowed@example.test\r\nBcc: evil@example.test",
  ])("rejects recipient injection (%s)", async (recipientEmail) => {
    await expect(
      new RemoteSmtpMailTransport(env).send({ ...message, recipientEmail }),
    ).rejects.toMatchObject({ code: "SMTP_MESSAGE_INVALID" });
  });

  it.each([
    "*",
    "*.example.test",
    "@example.test",
    "Name <a@example.test>",
    "a@example.test,",
  ])("fails startup for malformed allowlists (%s)", (allowlist) => {
    expect(() =>
      createMailTransportFromEnv({
        ...env,
        REMOTE_SMTP_RECIPIENT_ALLOWLIST: allowlist,
      }),
    ).toThrow("SMTP_CONFIGURATION_INVALID");
  });

  it.each(["HOST", "PORT", "USERNAME", "PASSWORD", "FROM_EMAIL"])(
    "fails module bootstrap when remote %s is absent or empty",
    (setting) => {
      for (const value of [undefined, "", " "]) {
        expect(() =>
          NotificationDeliveryModule.fromEnvironment({
            ...env,
            [`REMOTE_SMTP_${setting}`]: value,
            NOTIFICATION_OUTBOX_DIRECTORY: directory,
          }),
        ).toThrow("SMTP_CONFIGURATION_INVALID");
      }
    },
  );

  it.each(["25", "2525", "465.0", "587junk"])(
    "rejects unsupported or ambiguous ports (%s)",
    (port) => {
      expect(() =>
        createMailTransportFromEnv({ ...env, REMOTE_SMTP_PORT: port }),
      ).toThrow("SMTP_CONFIGURATION_INVALID");
    },
  );

  it("preserves disabled/local behavior and rejects ambiguous simultaneous transports", () => {
    expect(createMailTransportFromEnv({})).toBeNull();
    expect(
      createMailTransportFromEnv({ MAILPIT_SMTP_PORT: "1025" })?.provider,
    ).toBe("mailpit-smtp");
    expect(createMailpitSmtpTransportFromEnv(env)?.provider).toBe(
      "remote-smtp",
    );
    expect(() =>
      createMailTransportFromEnv({ ...env, MAILPIT_SMTP_PORT: "1025" }),
    ).toThrow("SMTP_CONFIGURATION_INVALID");
    expect(() => createMailTransportFromEnv({ REMOTE_SMTP_HOST: "" })).toThrow(
      "SMTP_CONFIGURATION_INVALID",
    );
  });
});
