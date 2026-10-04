import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getIamTenantRoleScopes,
  type TenantBillingProfile,
} from "@drts/contracts";
import { DatabaseService } from "../../src/common/db";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import {
  BillingSettlementRepository,
  type StoredTenantInvoiceRecord,
} from "../../src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { InvoiceMailController } from "../../src/modules/billing-settlement/invoice-mail.controller";
import { InvoiceMailService } from "../../src/modules/billing-settlement/invoice-mail.service";
import { NotificationDeliveryService } from "../../src/modules/notification-delivery/notification-delivery.service";
import { PostgresMailOutbox } from "../../src/modules/notification-delivery/postgres-mail-outbox";
import type {
  MailTransport,
  TransportMessage,
} from "../../src/modules/notification-delivery/notification-delivery.types";

// ci-integ.yml applies the real migrations before test:integration. Never create
// substitute tables here. Only the external mail provider is mocked; no SMTP.
describe.skipIf(!process.env.DATABASE_URL)(
  "invoice mail with migrated PostgreSQL",
  () => {
    const databases: DatabaseService[] = [];
    let tenantId: string;
    let invoice: StoredTenantInvoiceRecord;
    let profile: TenantBillingProfile;
    let identity: BootstrapRequestIdentity;
    let clock: number;
    const now = () => new Date(clock);

    function runtime(provider: MailTransport | null) {
      const database = new DatabaseService();
      databases.push(database);
      const repository = new BillingSettlementRepository(database);
      const outbox = new PostgresMailOutbox(database);
      const delivery = new NotificationDeliveryService(outbox, provider, {
        now,
        retryDelayMs: 1000,
        leaseMs: 1000,
      });
      const mail = new InvoiceMailService(repository, outbox, delivery, {
        fromEmail: "billing@example.test",
        portalOrigin: "https://tenant.example.test",
      });
      const billing = new BillingSettlementController(
        new BillingSettlementService(
          new AuditNotificationService(),
          repository,
        ),
      );
      return {
        database,
        repository,
        delivery,
        mail,
        billing,
        controller: new InvoiceMailController(mail),
      };
    }

    function transport() {
      return {
        provider: "invoice-mail-test",
        send: vi.fn(async (message: TransportMessage) => {
          void message;
          return {
            provider: "invoice-mail-test",
            response: "250 accepted private@example.test",
            providerMessageId: "private-provider-reference",
            acceptedAt: now().toISOString(),
          };
        }),
      };
    }

    beforeEach(async () => {
      tenantId = `invoice-mail-${randomUUID()}`;
      clock = Date.now();
      identity = {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: randomUUID(),
        realm: "tenant",
        tenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_finance_admin"],
        scopes: [...getIamTenantRoleScopes("tenant_finance_admin")!],
        requestId: null,
      };
      // Generate a valid stored record with the production issuer, then persist
      // this fixture through the production repository under a unique tenant.
      const issuer = new BillingSettlementService(
        new AuditNotificationService(),
      );
      invoice = {
        ...(await issuer.generateTenantInvoice("tenant-demo-001", {
          tenantId: "tenant-demo-001",
          periodStart: "2026-03-01T00:00:00Z",
          periodEnd: "2026-03-31T23:59:59Z",
        })),
        tenantId,
      };
      profile = {
        tenantId,
        invoiceTitle: "Invoice mail PG test",
        email: "finance@example.test",
        taxId: null,
        address: null,
        contactName: null,
        updatedAt: now().toISOString(),
      };
      await runtime(null).repository.persistChanges({
        tenantInvoices: [invoice],
        tenantBillingProfiles: [profile],
      });
    });

    afterEach(async () => {
      try {
        const database = databases[0];
        if (database) {
          // Test-owned rows only; never truncate a shared database.
          await database.query(
            "DELETE FROM ops.phase1_notification_mail_deliveries WHERE tenant_id = $1",
            [tenantId],
          );
          await database.query(
            "DELETE FROM billing.phase1_tenant_invoices WHERE tenant_id = $1",
            [tenantId],
          );
          await database.query(
            "DELETE FROM billing.phase1_tenant_billing_profiles WHERE tenant_id = $1",
            [tenantId],
          );
        }
      } finally {
        await Promise.all(
          databases.splice(0).map((database) => database.onModuleDestroy()),
        );
      }
    });

    it("two independent pools send once, retain the first recipient and read safe durable receipts", async () => {
      const provider = transport();
      const a = runtime(provider);
      const b = runtime(provider);
      const [first, second] = await Promise.all([
        a.controller.send(invoice.invoiceId, {}, identity),
        b.controller.send(invoice.invoiceId, {}, identity),
      ]);
      expect(first.data.deliveryId).toBe(second.data.deliveryId);
      expect(provider.send).toHaveBeenCalledOnce();
      await b.repository.persistChanges({
        tenantBillingProfiles: [{ ...profile, email: "changed@example.test" }],
      });
      const fresh = runtime(provider);
      const receipt = (
        await fresh.controller.send(invoice.invoiceId, {}, identity)
      ).data;
      expect(receipt).toMatchObject({
        status: "sent",
        deliveryId: first.data.deliveryId,
      });
      expect(receipt.attempts).toHaveLength(1);
      expect(JSON.stringify(receipt)).not.toMatch(
        /private|finance@|recipient|subject|response/,
      );
      expect(provider.send).toHaveBeenCalledOnce();
      expect(provider.send.mock.calls[0]![0].recipientEmail).toBe(
        profile.email,
      );
      const rows = await fresh.database.query(
        "SELECT delivery_id FROM ops.phase1_notification_mail_deliveries WHERE tenant_id = $1",
        [tenantId],
      );
      expect(rows.rows).toHaveLength(1);
    });

    it("retains failure and backoff across pools and recovers through the existing dispatcher", async () => {
      const failed = await runtime(null).mail.send(tenantId, invoice.invoiceId);
      expect(failed).toMatchObject({
        status: "failed",
        attempts: [{ errorCode: "provider_unavailable" }],
      });
      const provider = transport();
      const fresh = runtime(provider);
      expect(
        (await fresh.mail.send(tenantId, invoice.invoiceId)).attempts,
      ).toHaveLength(1);
      expect(provider.send).not.toHaveBeenCalled();
      clock += 1000;
      await fresh.delivery.dispatch(tenantId, failed.deliveryId!);
      const receipt = await runtime(provider).mail.read(
        tenantId,
        invoice.invoiceId,
      );
      expect(receipt).toMatchObject({
        deliveryId: failed.deliveryId,
        status: "sent",
        nextAttemptAt: null,
      });
      expect(receipt.attempts.map((attempt) => attempt.outcome)).toEqual([
        "failed",
        "sent",
      ]);
    });

    it("fresh invoice links read shared records and reject unauthorized recipients and tenants", async () => {
      const provider = transport();
      const fresh = runtime(provider);
      expect(
        (
          await fresh.billing.listTenantInvoices(undefined, undefined, identity)
        ).data.items.map((item) => item.invoiceId),
      ).toEqual([invoice.invoiceId]);
      expect(
        (
          await fresh.billing.getTenantInvoice(
            invoice.invoiceId,
            undefined,
            undefined,
            identity,
          )
        ).data.invoiceId,
      ).toBe(invoice.invoiceId);
      await expect(
        fresh.controller.send(
          invoice.invoiceId,
          {},
          { ...identity, tenantId: randomUUID() },
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        fresh.controller.send(
          invoice.invoiceId,
          { recipientEmail: "attacker@example.test" },
          identity,
        ),
      ).rejects.toMatchObject({ code: "INVOICE_MAIL_BODY_NOT_ALLOWED" });
      await expect(
        fresh.controller.send(
          invoice.invoiceId,
          {},
          { ...identity, scopes: ["tenant:billing:read"] },
        ),
      ).rejects.toMatchObject({ code: "INVOICE_ACCESS_DENIED" });
      await fresh.database.query(
        "DELETE FROM billing.phase1_tenant_invoices WHERE tenant_id = $1",
        [tenantId],
      );
      expect(
        (await fresh.billing.listTenantInvoices(undefined, undefined, identity))
          .data.items,
      ).toEqual([]);
      await expect(
        fresh.billing.getTenantInvoice(
          invoice.invoiceId,
          undefined,
          undefined,
          identity,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(provider.send).not.toHaveBeenCalled();
    });
  },
);
