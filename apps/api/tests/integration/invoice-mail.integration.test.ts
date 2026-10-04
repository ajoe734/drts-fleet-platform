import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { TenantInvoiceRecord } from "@drts/contracts";
import { DatabaseService } from "../../src/common/db";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { BillingSettlementRepository } from "../../src/modules/billing-settlement/billing-settlement.repository";
import { TenantInvoiceMailService } from "../../src/modules/billing-settlement/tenant-invoice-mail.service";
import { NotificationDeliveryService } from "../../src/modules/notification-delivery/notification-delivery.service";
import { PostgresMailOutbox } from "../../src/modules/notification-delivery/postgres-mail-outbox";
import type { MailTransport } from "../../src/modules/notification-delivery/notification-delivery.types";

// Hosted CI only: the integration job applies the canonical migrations first.
// No schema clones, mocked repository, real SMTP, or local DB startup.
afterEach(() => vi.unstubAllEnvs());
it("persists tenant-scoped invoice mail and deduplicates across independent PostgreSQL clients", async () => {
  expect(process.env.DATABASE_URL).toBeTruthy();
  vi.stubEnv("NOTIFICATION_FROM_EMAIL", "invoices@drts.demo.tw");
  vi.stubEnv("TENANT_INVOICE_PORTAL_ORIGIN", "https://tenant.demo.tw");
  const tenantId = `invoice-mail-${randomUUID()}`;
  const invoiceId = `invoice-${randomUUID()}`;
  const db = new DatabaseService();
  const db2 = new DatabaseService();
  const invoice: TenantInvoiceRecord = {
    invoiceId,
    tenantId,
    status: "issued",
    periodStart: "2026-09-01T00:00:00Z",
    periodEnd: "2026-09-30T23:59:59Z",
    amount: { currency: "TWD", amountMinor: 10000 },
    artifactUrl: null,
    lines: [],
    pricingVersionSnapshot: "v1",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
  };
  const identity: BootstrapRequestIdentity = {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "ci-invoice-owner",
    realm: "tenant",
    tenantId,
    scopes: ["tenant:billing:read", "tenant:billing:write"],
    roleFamilies: [],
    roles: [],
    requestId: null,
  };
  const send = vi
    .fn<MailTransport["send"]>()
    .mockResolvedValue({
      provider: "ci-transport-double",
      response: "250 accepted",
      providerMessageId: "ci-provider-1",
      acceptedAt: new Date().toISOString(),
    });
  const delivery1 = new NotificationDeliveryService(
    new PostgresMailOutbox(db),
    { provider: "ci-transport-double", send },
  );
  const delivery2 = new NotificationDeliveryService(
    new PostgresMailOutbox(db2),
    { provider: "ci-transport-double", send },
  );
  const service1 = new TenantInvoiceMailService(
    new BillingSettlementRepository(db),
    delivery1,
  );
  const service2 = new TenantInvoiceMailService(
    new BillingSettlementRepository(db2),
    delivery2,
  );
  try {
    // Setup only: use the official tables already created by migrations.
    await db.query(
      `INSERT INTO billing.phase1_tenant_invoices
      (invoice_id, tenant_id, status, period_start, period_end, created_at, updated_at, record)
      VALUES ($1, $2, $3, $4, $5, $6, $6, $7::jsonb)`,
      [
        invoiceId,
        tenantId,
        invoice.status,
        invoice.periodStart,
        invoice.periodEnd,
        invoice.createdAt,
        JSON.stringify(invoice),
      ],
    );
    await db.query(
      `INSERT INTO billing.phase1_tenant_billing_profiles (tenant_id, updated_at, record)
      VALUES ($1, now(), $2::jsonb)`,
      [tenantId, JSON.stringify({ tenantId, email: "billing@tenant.demo.tw" })],
    );
    const results = await Promise.all([
      service1.send(tenantId, invoiceId, "operation-0001", identity),
      service2.send(tenantId, invoiceId, "operation-0001", identity),
    ]);
    expect(results[0]!.deliveryId).toBe(results[1]!.deliveryId);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await service2.list(tenantId, invoiceId, identity)).toMatchObject([
      { status: "sent", attempts: [{ outcome: "sent" }] },
    ]);
    expect(
      (
        await db.query<{ count: string }>(
          "SELECT count(*) FROM ops.phase1_notification_mail_deliveries WHERE tenant_id = $1",
          [tenantId],
        )
      ).rows[0]!.count,
    ).toBe("1");
    const otherTenant = `other-${randomUUID()}`;
    await expect(
      service2.list(otherTenant, invoiceId, {
        ...identity,
        tenantId: otherTenant,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service2.send(otherTenant, invoiceId, "operation-0002", identity),
    ).rejects.toMatchObject({ status: 403 });
    // Fresh profile read from another client, without restarting either service.
    await db.query(
      `UPDATE billing.phase1_tenant_billing_profiles SET record = $2::jsonb WHERE tenant_id = $1`,
      [
        tenantId,
        JSON.stringify({ tenantId, email: "new-billing@tenant.demo.tw" }),
      ],
    );
    await expect(
      service2.send(tenantId, invoiceId, "operation-0001", identity),
    ).rejects.toMatchObject({ status: 409 });
    await service2.send(tenantId, invoiceId, "operation-0002", identity);
    expect(send.mock.calls[1]![0].recipientEmail).toBe(
      "new-billing@tenant.demo.tw",
    );
  } finally {
    // Delete only this test's uniquely named records, never shared fixtures.
    try {
      await db.query(
        "DELETE FROM ops.phase1_notification_mail_deliveries WHERE tenant_id = $1",
        [tenantId],
      );
      await db.query(
        "DELETE FROM billing.phase1_tenant_invoices WHERE tenant_id = $1",
        [tenantId],
      );
      await db.query(
        "DELETE FROM billing.phase1_tenant_billing_profiles WHERE tenant_id = $1",
        [tenantId],
      );
    } finally {
      await Promise.all([db.onModuleDestroy(), db2.onModuleDestroy()]);
    }
  }
});
