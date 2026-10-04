import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { TenantInvoiceMailService } from "../../../apps/api/src/modules/billing-settlement/tenant-invoice-mail.service";
import { TenantInvoiceMailController } from "../../../apps/api/src/modules/billing-settlement/tenant-invoice-mail.controller";
import { NotificationDeliveryService } from "../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { FileMailOutbox } from "../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import {
  DeliveryTransportError,
  type MailTransport,
} from "../../../apps/api/src/modules/notification-delivery/notification-delivery.types";

const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "tenant_admin",
  actorId: "billing-owner",
  realm: "tenant",
  tenantId: "tenant-a",
  roleFamilies: [],
  roles: [],
  scopes: ["tenant:billing:read", "tenant:billing:write"],
  requestId: null,
};
const folders: string[] = [];
const invoice = {
  invoiceId: "invoice-a",
  tenantId: "tenant-a",
  status: "issued",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  artifactUrl: "https://private.invalid/download?signature=secret-do-not-mail",
  amount: { currency: "TWD", amountMinor: 10000 },
  lines: [],
  pricingVersionSnapshot: "v1",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "invoice-mail-"));
  folders.push(directory);
  const state = {
    invoice: { ...invoice },
    profile: { tenantId: "tenant-a", email: "billing@tenant.demo.tw" } as {
      tenantId: string;
      email: string;
    } | null,
  };
  const query = vi.fn(async (_sql: string, params: unknown[]) => ({
    rows:
      params[0] === state.invoice.tenantId &&
      params[1] === state.invoice.invoiceId
        ? [structuredClone(state)]
        : [],
  }));
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    query,
  } as unknown as DatabaseService);
  const send = vi.fn<MailTransport["send"]>().mockResolvedValue({
    provider: "test-boundary",
    response: "250 accepted secret-provider-content",
    providerMessageId: "provider-1",
    acceptedAt: "2026-10-04T10:00:00Z",
  });
  let now = new Date("2026-10-04T10:00:00Z");
  const delivery = new NotificationDeliveryService(
    new FileMailOutbox(directory),
    { provider: "test-boundary", send },
    { now: () => now, retryDelayMs: 1000 },
  );
  const service = new TenantInvoiceMailService(repository, delivery);
  return {
    directory,
    state,
    query,
    repository,
    send,
    delivery,
    service,
    advance: () => {
      now = new Date(now.getTime() + 2000);
    },
    now: () => now,
  };
}

beforeEach(() => {
  vi.stubEnv("NOTIFICATION_FROM_EMAIL", "invoices@drts.demo.tw");
  vi.stubEnv("TENANT_INVOICE_PORTAL_ORIGIN", "https://tenant.demo.tw");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    folders.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("C079 invoice mail through production service, repository and durable outbox", () => {
  it("sends the persisted billing recipient a stable authenticated link, not a bearer artifact", async () => {
    const ctx = await setup();
    const receipt = await ctx.service.send(
      "tenant-a",
      "invoice-a",
      "request-0001",
      identity,
    );
    expect(receipt.status).toBe("sent");
    expect(ctx.query).toHaveBeenCalledWith(
      expect.stringContaining("i.tenant_id = $1 AND i.invoice_id = $2"),
      ["tenant-a", "invoice-a"],
    );
    expect(ctx.send).toHaveBeenCalledTimes(1);
    expect(ctx.send.mock.calls[0]![0]).toMatchObject({
      recipientEmail: "billing@tenant.demo.tw",
      fromEmail: "invoices@drts.demo.tw",
    });
    expect(ctx.send.mock.calls[0]![0].body).toContain(
      "https://tenant.demo.tw/invoices?invoiceId=invoice-a",
    );
    expect(ctx.send.mock.calls[0]![0].body).not.toContain("signature=");
    const history = await ctx.service.list("tenant-a", "invoice-a", identity);
    expect(history[0]).toEqual(receipt);
    expect(JSON.stringify(history)).not.toMatch(
      /billing@|secret-provider|recipientEmail|messageId|idempotencyKey|signature=/,
    );
  });

  it("deduplicates concurrent same-key sends and survives service/outbox restart", async () => {
    const ctx = await setup();
    const results = await Promise.all([
      ctx.service.send("tenant-a", "invoice-a", "request-0001", identity),
      ctx.service.send("tenant-a", "invoice-a", "request-0001", identity),
    ]);
    expect(results[0]!.deliveryId).toBe(results[1]!.deliveryId);
    expect(ctx.send).toHaveBeenCalledTimes(1);
    const restarted = new TenantInvoiceMailService(
      ctx.repository,
      new NotificationDeliveryService(new FileMailOutbox(ctx.directory), {
        provider: "test-boundary",
        send: ctx.send,
      }),
    );
    expect(
      (await restarted.send("tenant-a", "invoice-a", "request-0001", identity))
        .deliveryId,
    ).toBe(results[0]!.deliveryId);
    expect(ctx.send).toHaveBeenCalledTimes(1);
    await restarted.send("tenant-a", "invoice-a", "request-0002", identity);
    expect(ctx.send).toHaveBeenCalledTimes(2);
  });

  it("records transient failure then the existing drain retries after restart", async () => {
    const ctx = await setup();
    ctx.send.mockRejectedValueOnce(
      new DeliveryTransportError("smtp_timeout", true),
    );
    const failed = await ctx.service.send(
      "tenant-a",
      "invoice-a",
      "request-0001",
      identity,
    );
    expect(failed).toMatchObject({
      status: "failed",
      nextAttemptAt: "2026-10-04T10:00:01.000Z",
      attempts: [
        expect.objectContaining({ errorCode: "smtp_timeout", retryable: true }),
      ],
    });
    ctx.advance();
    const restarted = new NotificationDeliveryService(
      new FileMailOutbox(ctx.directory),
      { provider: "test-boundary", send: ctx.send },
      { now: ctx.now },
    );
    await restarted.drain();
    expect(
      (await ctx.service.list("tenant-a", "invoice-a", identity))[0],
    ).toMatchObject({ status: "sent", nextAttemptAt: null });
    expect(ctx.send).toHaveBeenCalledTimes(2);
  });

  it("leaves permanent failure visible and requires a new key for deliberate resend", async () => {
    const ctx = await setup();
    ctx.send.mockRejectedValueOnce(
      new DeliveryTransportError("recipient_rejected", false),
    );
    const failed = await ctx.service.send(
      "tenant-a",
      "invoice-a",
      "request-0001",
      identity,
    );
    expect(failed).toMatchObject({ status: "failed", nextAttemptAt: null });
    await ctx.service.send("tenant-a", "invoice-a", "request-0001", identity);
    await ctx.delivery.drain();
    expect(ctx.send).toHaveBeenCalledTimes(1);
    expect(
      (
        await ctx.service.send(
          "tenant-a",
          "invoice-a",
          "request-0002",
          identity,
        )
      ).status,
    ).toBe("sent");
  });

  it.each([
    null,
    { ...identity, tenantId: "tenant-b" },
    { ...identity, realm: "partner" },
    { ...identity, scopes: ["tenant:billing:read"] },
    { ...identity, scopes: ["*"] },
  ])(
    "rejects unauthorized sender before database or outbox access: %j",
    async (caller) => {
      const ctx = await setup();
      await expect(
        ctx.service.send(
          "tenant-a",
          "invoice-a",
          "request-0001",
          caller as BootstrapRequestIdentity | null,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(ctx.query).not.toHaveBeenCalled();
      expect(ctx.send).not.toHaveBeenCalled();
    },
  );

  it("enforces reader scope, invoice ownership and namespace isolation", async () => {
    const ctx = await setup();
    await ctx.service.send("tenant-a", "invoice-a", "request-0001", identity);
    await expect(
      ctx.service.list("tenant-a", "invoice-a", {
        ...identity,
        scopes: ["tenant:billing:write"],
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      ctx.service.list("tenant-b", "invoice-a", {
        ...identity,
        tenantId: "tenant-b",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await ctx.delivery.enqueue({
      tenantId: "tenant-a",
      idempotencyKey: "tenant-invitation:secret",
      recipientEmail: "a@b.tw",
      fromEmail: "c@d.tw",
      subject: "private",
      body: "token",
    });
    expect(
      await ctx.service.list("tenant-a", "invoice-a", identity),
    ).toHaveLength(1);
  });

  it.each([
    null,
    { tenantId: "tenant-a", email: "billing@tenant.example.com" },
    { tenantId: "tenant-b", email: "billing@tenant.demo.tw" },
    { tenantId: "tenant-a", email: "a@b.tw\r\nBcc: victim@c.tw" },
  ])(
    "rejects missing/default/mismatched/invalid profile %j",
    async (profile) => {
      const ctx = await setup();
      ctx.state.profile = profile;
      await expect(
        ctx.service.send("tenant-a", "invoice-a", "request-0001", identity),
      ).rejects.toMatchObject({ status: 409 });
      expect(ctx.send).not.toHaveBeenCalled();
    },
  );

  it("reads the current persisted profile and refuses conflicting same-key mail snapshots", async () => {
    const ctx = await setup();
    await ctx.service.send("tenant-a", "invoice-a", "request-0001", identity);
    ctx.state.profile!.email = "new-billing@tenant.demo.tw";
    await expect(
      ctx.service.send("tenant-a", "invoice-a", "request-0001", identity),
    ).rejects.toMatchObject({ status: 409 });
    await ctx.service.send("tenant-a", "invoice-a", "request-0002", identity);
    expect(ctx.send.mock.calls[1]![0].recipientEmail).toBe(
      "new-billing@tenant.demo.tw",
    );
  });

  it.each([
    "",
    "http://tenant.demo.tw",
    "https://user:password@tenant.demo.tw",
    "https://tenant.demo.tw/path",
    "https://tenant.demo.tw?evil=yes",
  ])('rejects invalid portal origin "%s"', async (origin) => {
    const ctx = await setup();
    vi.stubEnv("TENANT_INVOICE_PORTAL_ORIGIN", origin);
    await expect(
      ctx.service.send("tenant-a", "invoice-a", "request-0001", identity),
    ).rejects.toMatchObject({ status: 503 });
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("never treats missing transport, outbox or billing authority as successful delivery", async () => {
    const ctx = await setup();
    const noTransport = new TenantInvoiceMailService(
      ctx.repository,
      new NotificationDeliveryService(new FileMailOutbox(ctx.directory)),
    );
    expect(
      await noTransport.send("tenant-a", "invoice-a", "request-0001", identity),
    ).toMatchObject({
      status: "failed",
      attempts: [
        expect.objectContaining({ errorCode: "provider_unavailable" }),
      ],
    });
    await expect(
      new TenantInvoiceMailService(ctx.repository).send(
        "tenant-a",
        "invoice-a",
        "request-0002",
        identity,
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      new TenantInvoiceMailService(
        new BillingSettlementRepository(),
        ctx.delivery,
      ).send("tenant-a", "invoice-a", "request-0002", identity),
    ).rejects.toMatchObject({ status: 503 });
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("retains a real queued delivery after dispatch persistence failure", async () => {
    const ctx = await setup();
    vi.spyOn(ctx.delivery, "dispatch").mockRejectedValueOnce(
      new Error("persistence failed"),
    );
    const result = await ctx.service.send(
      "tenant-a",
      "invoice-a",
      "request-0001",
      identity,
    );
    expect(result.status).toBe("queued");
    expect(result.sentAt).toBeNull();
    expect(
      (await ctx.service.list("tenant-a", "invoice-a", identity))[0]!
        .deliveryId,
    ).toBe(result.deliveryId);
  });

  it("rejects unissued invoice and missing key without enqueue", async () => {
    const ctx = await setup();
    await expect(
      ctx.service.send("tenant-a", "invoice-a", undefined, identity),
    ).rejects.toMatchObject({ status: 400 });
    ctx.state.invoice.status = "draft";
    await expect(
      ctx.service.send("tenant-a", "invoice-a", "request-0001", identity),
    ).rejects.toMatchObject({ status: 409 });
    expect(ctx.send).not.toHaveBeenCalled();
  });

  it("wires controller identity/header to production service and safe response envelope", async () => {
    const ctx = await setup();
    const controller = new TenantInvoiceMailController(ctx.service);
    const result = await controller.send(
      "invoice-a",
      identity,
      "tenant-a",
      "request-0001",
      "request-trace",
    );
    expect(result.data).toMatchObject({ status: "sent" });
    expect(
      (await controller.list("invoice-a", identity, "tenant-a")).data,
    ).toHaveLength(1);
    await expect(
      controller.send("invoice-a", identity, "tenant-b", "request-0002"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
