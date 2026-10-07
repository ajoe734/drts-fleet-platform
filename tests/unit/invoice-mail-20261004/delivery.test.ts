import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { InvoiceMailService } from "../../../apps/api/src/modules/billing-settlement/invoice-mail.service";
import { InvoiceMailController } from "../../../apps/api/src/modules/billing-settlement/invoice-mail.controller";
import { FileMailOutbox } from "../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import {
  DeliveryTransportError,
  type MailTransport,
  type TransportMessage,
} from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";
import { financeIdentity } from "./fixtures";

const tenantId = financeIdentity.tenantId!;
const invoiceId = "invoice-mail-test";
const config = {
  fromEmail: "billing@example.test",
  portalOrigin: "https://tenant.example.test",
};

describe("invoice mail producer with the real durable outbox and delivery core", () => {
  let directory: string;
  let clock: number;
  let invoice: TenantInvoiceRecord | null;
  let profile: TenantBillingProfile | null;
  let query: ReturnType<typeof vi.fn>;
  let repository: BillingSettlementRepository;
  const now = () => new Date(clock);

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "invoice-mail-"));
    clock = Date.parse("2026-10-04T10:00:00Z");
    invoice = {
      invoiceId,
      tenantId,
      status: "issued",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      amount: { amountMinor: 12300, currency: "TWD" },
      artifactUrl: "https://secret.example.test/signed?token=do-not-mail",
      pricingVersionSnapshot: "v1",
      lines: [],
      createdAt: now().toISOString(),
      updatedAt: now().toISOString(),
    };
    profile = {
      tenantId,
      invoiceTitle: "Test billing",
      email: "finance@example.test",
      taxId: null,
      address: null,
      contactName: null,
      updatedAt: now().toISOString(),
    };
    // Only the database I/O is doubled. These tests call the actual production
    // repository parsing and tenant checks; PostgreSQL semantics need hosted PG.
    query = vi.fn(async (sql: string, values: unknown[]) => {
      if (values[0] !== tenantId) return { rows: [] };
      const record = sql.includes("phase1_tenant_invoices")
        ? values[1] === invoiceId
          ? invoice
          : null
        : profile;
      return { rows: record ? [{ record: structuredClone(record) }] : [] };
    });
    repository = new BillingSettlementRepository({
      isEnabled: () => true,
      query,
    } as unknown as DatabaseService);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  function transport() {
    return {
      provider: "test",
      send: vi.fn(async (message: TransportMessage) => {
        void message;
        return {
          provider: "test",
          response: "250 secret-recipient finance@example.test",
          providerMessageId: "secret-provider-id",
          acceptedAt: now().toISOString(),
        };
      }),
    };
  }
  function runtime(
    provider: MailTransport | null,
    options: { maxAttempts?: number; portalOrigin?: string } = {},
  ) {
    const outbox = new FileMailOutbox(directory);
    const delivery = new NotificationDeliveryService(outbox, provider, {
      now,
      retryDelayMs: 1000,
      leaseMs: 1000,
      maxAttempts: options.maxAttempts ?? 5,
    });
    const mail = new InvoiceMailService(repository, outbox, delivery, {
      ...config,
      portalOrigin: options.portalOrigin ?? config.portalOrigin,
    });
    return {
      mail,
      delivery,
      outbox,
      controller: new InvoiceMailController(mail),
    };
  }

  it("sends only to the stored billing recipient, with a login-protected link and safe readback", async () => {
    const provider = transport();
    const { controller } = runtime(provider);
    expect(
      (await controller.read(invoiceId, financeIdentity)).data.status,
    ).toBe("not_requested");
    const view = (await controller.send(invoiceId, {}, financeIdentity)).data;
    expect(view).toMatchObject({ invoiceId, status: "sent", canSend: true });
    expect(provider.send).toHaveBeenCalledOnce();
    expect(provider.send.mock.calls[0]![0]).toMatchObject({
      recipientEmail: profile!.email,
      tenantId,
      idempotencyKey: expect.stringMatching(
        /^tenant-invoice-mail:v2:[a-f0-9]{64}:default$/,
      ),
    });
    expect(provider.send.mock.calls[0]![0].body).toContain(
      `https://tenant.example.test/invoices?invoiceId=${invoiceId}`,
    );
    expect(provider.send.mock.calls[0]![0].body).not.toContain("token=");
    expect(JSON.stringify(view)).not.toMatch(
      /secret-|finance@|subject|recipient|messageId|response/,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("tenant_id = $1 AND invoice_id = $2"),
      [tenantId, invoiceId],
    );
  });

  it("concurrent requests and fresh processes reuse the same durable invoice key", async () => {
    const provider = transport();
    const [a, b] = await Promise.all([
      runtime(provider).mail.send(tenantId, invoiceId),
      runtime(provider).mail.send(tenantId, invoiceId),
    ]);
    expect(a.deliveryId).toBe(b.deliveryId);
    expect(provider.send).toHaveBeenCalledOnce();
    profile!.email = "changed@example.test";
    const restarted = runtime(provider);
    expect(await restarted.mail.send(tenantId, invoiceId)).toMatchObject({
      deliveryId: a.deliveryId,
      status: "sent",
    });
    expect(
      (await restarted.mail.read(tenantId, invoiceId)).attempts,
    ).toHaveLength(1);
    expect(provider.send).toHaveBeenCalledOnce();
  });

  it("persists failure/backoff and recovers using the existing drain after restart", async () => {
    const unavailable = runtime(null);
    const failed = await unavailable.mail.send(tenantId, invoiceId);
    expect(failed).toMatchObject({
      status: "failed",
      nextAttemptAt: "2026-10-04T10:00:01.000Z",
      attempts: [{ errorCode: "provider_unavailable" }],
    });
    expect(
      (await unavailable.mail.send(tenantId, invoiceId)).attempts,
    ).toHaveLength(1);
    profile!.email = "changed@example.test";
    clock += 1000;
    const provider = transport();
    const restarted = runtime(provider);
    await restarted.delivery.drain();
    const read = await restarted.mail.read(tenantId, invoiceId);
    expect(read).toMatchObject({
      deliveryId: failed.deliveryId,
      status: "sent",
      nextAttemptAt: null,
    });
    expect(read.attempts).toHaveLength(2);
    expect(provider.send.mock.calls[0]![0].recipientEmail).toBe(
      "finance@example.test",
    );
  });

  it("does not bypass terminal failure with repeated send requests", async () => {
    const provider = transport();
    provider.send.mockRejectedValue(
      new DeliveryTransportError("recipient_rejected", false),
    );
    const { mail } = runtime(provider);
    const first = await mail.send(tenantId, invoiceId);
    expect(first).toMatchObject({ status: "failed", nextAttemptAt: null });
    clock += 100000;
    expect(await mail.send(tenantId, invoiceId)).toEqual(first);
    expect(provider.send).toHaveBeenCalledOnce();
  });

  it("stops a retryable operation at its attempt limit without allowing same-key bypass", async () => {
    const { mail, delivery } = runtime(null, { maxAttempts: 2 });
    const first = await mail.send(tenantId, invoiceId, "operation-exhaust");
    clock += 1000;
    await delivery.drain();
    clock += 10000;
    const exhausted = await mail.send(tenantId, invoiceId, "operation-exhaust");
    expect(exhausted.deliveryId).toBe(first.deliveryId);
    expect(exhausted).toMatchObject({ status: "failed", nextAttemptAt: null });
    expect(exhausted.attempts).toHaveLength(2);
  });

  it("allows an intentional new send while preserving each operation's recipient and safe failure history", async () => {
    const provider = transport();
    provider.send.mockRejectedValueOnce(
      new DeliveryTransportError("recipient_rejected", false),
    );
    const { mail } = runtime(provider);
    const first = await mail.send(tenantId, invoiceId, "operation-first");
    profile!.email = "corrected@example.test";
    clock += 1000;
    const retry = await mail.send(tenantId, invoiceId, "operation-first");
    expect(retry.deliveryId).toBe(first.deliveryId);
    expect(provider.send).toHaveBeenCalledOnce();
    const second = await mail.send(tenantId, invoiceId, "operation-second");
    expect(second.deliveryId).not.toBe(first.deliveryId);
    expect(provider.send).toHaveBeenCalledTimes(2);
    expect(provider.send.mock.calls[1]![0].recipientEmail).toBe(
      "corrected@example.test",
    );
    const read = await runtime(provider).mail.read(tenantId, invoiceId);
    expect(read.deliveries.map((entry) => entry.status)).toEqual([
      "sent",
      "failed",
    ]);
    expect(read.deliveries[1]!.attempts[0]!.errorCode).toBe(
      "recipient_rejected",
    );
    expect(JSON.stringify(read)).not.toContain("@example.test");
    await expect(
      mail.send(tenantId, invoiceId, "bad key"),
    ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(provider.send).toHaveBeenCalledTimes(2);
  });

  it("leaves an uncertain lease recoverable if receipt persistence fails after provider acceptance", async () => {
    const provider = transport();
    const outbox = new FileMailOutbox(directory);
    let transactions = 0;
    const faultingOutbox = {
      transaction: async <T>(
        op: Parameters<FileMailOutbox["transaction"]>[0],
      ) => {
        transactions += 1;
        if (transactions === 4) throw new Error("storage offline");
        return outbox.transaction(op) as Promise<T>;
      },
    };
    const delivery = new NotificationDeliveryService(faultingOutbox, provider, {
      now,
      leaseMs: 1000,
    });
    const mail = new InvoiceMailService(
      repository,
      faultingOutbox,
      delivery,
      config,
    );
    await expect(mail.send(tenantId, invoiceId)).rejects.toMatchObject({
      code: "INVOICE_MAIL_UNAVAILABLE",
    });
    const fresh = runtime(provider);
    expect(await fresh.mail.read(tenantId, invoiceId)).toMatchObject({
      status: "queued",
      attempts: [{ outcome: "started" }],
    });
    clock += 1001;
    await fresh.delivery.drain();
    const recovered = await fresh.mail.read(tenantId, invoiceId);
    expect(recovered.status).toBe("sent");
    expect(recovered.attempts.map((a) => a.outcome)).toEqual([
      "uncertain",
      "sent",
    ]);
    // SMTP cannot guarantee exactly-once when provider acceptance and DB commit
    // straddle a crash. Retain one delivery and the same provider Message-ID.
    expect(provider.send.mock.calls[0]![0].messageId).toBe(
      provider.send.mock.calls[1]![0].messageId,
    );
  });

  it("rejects cross-tenant and missing invoices before reading or writing mail", async () => {
    const provider = transport();
    const { mail } = runtime(provider);
    await expect(mail.send("another-tenant", invoiceId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(mail.read(tenantId, "missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    invoice!.tenantId = "another-tenant"; // corrupt JSON cannot override SQL ownership
    await expect(mail.send(tenantId, invoiceId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it.each([null, "", "recipient@example.test\r\nBcc: attacker@example.test"])(
    "rejects an absent/invalid authoritative billing recipient: %s",
    async (email) => {
      profile = email === null ? null : { ...profile!, email };
      const provider = transport();
      await expect(
        runtime(provider).mail.send(tenantId, invoiceId),
      ).rejects.toMatchObject({ code: "INVOICE_BILLING_RECIPIENT_REQUIRED" });
      expect(provider.send).not.toHaveBeenCalled();
    },
  );

  it("fails closed for draft invoices, insecure portal config and absent durable storage", async () => {
    const provider = transport();
    invoice!.status = "draft";
    await expect(
      runtime(provider).mail.send(tenantId, invoiceId),
    ).rejects.toMatchObject({ code: "INVOICE_NOT_ISSUED" });
    invoice!.status = "issued";
    await expect(
      runtime(provider, {
        portalOrigin: "http://tenant.example.test",
      }).mail.send(tenantId, invoiceId),
    ).rejects.toMatchObject({ code: "INVOICE_MAIL_CONFIG_UNAVAILABLE" });
    await expect(
      new InvoiceMailService(repository, null, null, config).send(
        tenantId,
        invoiceId,
      ),
    ).rejects.toMatchObject({ code: "INVOICE_MAIL_UNAVAILABLE" });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("read-only finance can read but cannot send; callers cannot override recipient or tenant", async () => {
    const provider = transport();
    const { controller } = runtime(provider);
    const readOnly = { ...financeIdentity, scopes: ["tenant:billing:read"] };
    expect((await controller.read(invoiceId, readOnly)).data.canSend).toBe(
      false,
    );
    await expect(
      controller.send(invoiceId, {}, readOnly),
    ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
    await expect(
      controller.send(
        invoiceId,
        { recipientEmail: "attacker@example.test" },
        financeIdentity,
      ),
    ).rejects.toMatchObject({ code: "INVOICE_MAIL_BODY_NOT_ALLOWED" });
    await expect(
      controller.send(invoiceId, {}, financeIdentity, "another-tenant"),
    ).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH" });
    for (const identity of [
      null,
      { ...financeIdentity, tenantId: null },
      { ...financeIdentity, realm: "partner" as const },
      { ...financeIdentity, realm: "platform" as const },
    ]) {
      await expect(controller.read(invoiceId, identity)).rejects.toMatchObject({
        code: "INVOICE_ACCESS_DENIED",
      });
      await expect(
        controller.send(invoiceId, {}, identity),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
    }
    expect(provider.send).not.toHaveBeenCalled();
  });
});
