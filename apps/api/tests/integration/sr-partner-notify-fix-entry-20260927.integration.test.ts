import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DatabaseService } from "../../src/common/db";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { AuditLogRepository } from "../../src/modules/audit-notification/audit-log.repository";
import { TenantPartnerRepository } from "../../src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";
import { PartnerEntryNotificationBindingRepository } from "../../src/modules/tenant-partner/partner-entry-notification-binding.repository";
import { PartnerEntryNotificationBindingService } from "../../src/modules/tenant-partner/partner-entry-notification-binding.service";

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)(
  "SR-PARTNER-NOTIFY-FIX-ENTRY-20260927: TenantPartnerService real PG integration",
  () => {
    let database: DatabaseService;
    let tenantRepository: TenantPartnerRepository;
    let tenantService: TenantPartnerService;
    let bindingRepo: PartnerEntryNotificationBindingRepository;
    let bindingService: PartnerEntryNotificationBindingService;

    beforeAll(async () => {
      database = new DatabaseService();
      const auditService = new AuditNotificationService(
        new AuditLogRepository(database),
      );
      tenantRepository = new TenantPartnerRepository(database);
      tenantService = new TenantPartnerService(auditService, tenantRepository);
      await tenantService.onModuleInit();

      bindingRepo = new PartnerEntryNotificationBindingRepository(database);
      bindingService = new PartnerEntryNotificationBindingService(
        bindingRepo,
        tenantService,
      );
    });

    afterAll(async () => {
      if (database) {
        await database.onModuleDestroy();
      }
    });

    it("real formal-PG create then immediate binding succeeds", async () => {
      const entrySlug = `pg-durable-${Date.now()}`;

      const persistSpy = vi.spyOn(tenantRepository, "persistChanges");

      const endpoint = await tenantService.createWebhookEndpoint(
        "tenant-demo-001",
        {
          url: "https://example.com/webhook",
          secret: "test_secret_for_webhook_binding",
          events: ["passenger.assignment_disclosure_ready.v1"],
        }
      );

      // Wait for the fire-and-forget persistChanges promise to resolve
      const promises = persistSpy.mock.results.map((r) => r.value);
      await Promise.all(promises);

      const entry = await tenantService.createPlatformPartnerEntry({
        tenantId: "tenant-demo-001",
        partnerCode: "pg_durable",
        partnerType: "bank_partner",
        programId: "prog-1",
        entrySlug,
        displayName: "PG Durable Partner",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        businessDispatchSubtype: "enterprise_dispatch",
      });

      expect(entry.entrySlug).toBe(entrySlug);

      const binding = await bindingService.putBinding(
        entrySlug,
        {
          webhookId: endpoint.webhookId,
          eventTypes: ["assignment_disclosure_ready"],
          expectedVersion: 0,
        },
        null
      );

      expect(binding.entrySlug).toBe(entrySlug);
      expect(binding.webhookId).toBe(endpoint.webhookId);
      expect(binding.eventTypes).toContain("assignment_disclosure_ready");
    });
  }
);
