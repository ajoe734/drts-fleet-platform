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

    it("real formal-PG lifecycle reload authentication assertions", async () => {
      const entrySlug = `pg-lifecycle-${Date.now()}`;

      // 1. Create entry and wait for persistence
      const persistSpy = vi.spyOn(tenantRepository, "persistChanges");
      await tenantService.createPlatformPartnerEntry({
        tenantId: "tenant-demo-001",
        partnerCode: `code_${entrySlug}`,
        partnerType: "bank_partner",
        programId: "prog-1",
        entrySlug,
        displayName: "PG Lifecycle Partner",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        businessDispatchSubtype: "enterprise_dispatch",
      });
      await Promise.all(persistSpy.mock.results.map((r) => r.value));

      // 2. Issue seed key and wait for persistence
      persistSpy.mockClear();
      const issueRes = await tenantService.issuePlatformPartnerIngressCredential(entrySlug, { purpose: "seed" });
      await Promise.all(persistSpy.mock.results.map((r) => r.value));

      const apiKey = issueRes.plaintextKey;
      const keyId = issueRes.credential.keyId;

      // 3. Reload service and verify authentication
      const reloadedRepo1 = new TenantPartnerRepository(database);
      const reloadedService1 = new TenantPartnerService(new AuditNotificationService(new AuditLogRepository(database)), reloadedRepo1);
      await reloadedService1.onModuleInit();

      const auth1 = reloadedService1.authenticatePartnerBootstrap({ entrySlug, apiKey }, "req-1");
      expect(auth1.identity.actorId).toBe(keyId);
      
      // wait for telemetry write
      await new Promise(r => setTimeout(r, 100));

      // 4. Revoke key and wait for persistence
      const persistSpy2 = vi.spyOn(reloadedRepo1, "persistChanges");
      await reloadedService1.revokePlatformPartnerIngressCredential(entrySlug, keyId, { revokeReason: "test" });
      await Promise.all(persistSpy2.mock.results.map((r) => r.value));

      // 5. Reload service again and verify authentication fails
      const reloadedRepo2 = new TenantPartnerRepository(database);
      const reloadedService2 = new TenantPartnerService(new AuditNotificationService(new AuditLogRepository(database)), reloadedRepo2);
      await reloadedService2.onModuleInit();

      try {
        reloadedService2.authenticatePartnerBootstrap({ entrySlug, apiKey }, "req-2");
        expect.fail("Should have thrown PARTNER_API_KEY_REVOKED");
      } catch (e: any) {
        expect(e.code).toBe("PARTNER_API_KEY_REVOKED");
      }

      await reloadedService1.onModuleDestroy();
      await reloadedService2.onModuleDestroy();
    });
  }
);
