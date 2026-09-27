import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

      // Formal V0021/V0104 tables are used by PartnerEntryNotificationBindingService.
      // Call putBinding which verifies foreign key from admin.phase1_partner_notification_bindings
      // to admin.phase1_partner_channel_entries (populated by TenantPartnerRepository).
      const binding = await bindingService.putBinding(
        entrySlug,
        {
          notificationType: "webhook",
          endpointUrl: "https://example.com/webhook",
          eventTypes: ["partner.entry.created"],
        },
        null
      );

      expect(binding.entrySlug).toBe(entrySlug);
      expect(binding.notificationType).toBe("webhook");
      expect(binding.endpointUrl).toBe("https://example.com/webhook");
    });
  }
);
