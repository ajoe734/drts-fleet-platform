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
        },
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
        null,
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
      const issueRes =
        await tenantService.issuePlatformPartnerIngressCredential(entrySlug, {
          purpose: "seed",
        });
      await Promise.all(persistSpy.mock.results.map((r) => r.value));

      const apiKey = issueRes.plaintextKey;
      const keyId = issueRes.credential.keyId;

      // 3. Reload service and verify authentication
      const reloadedRepo1 = new TenantPartnerRepository(database);
      const reloadedService1 = new TenantPartnerService(
        new AuditNotificationService(new AuditLogRepository(database)),
        reloadedRepo1,
      );
      await reloadedService1.onModuleInit();

      const auth1 = reloadedService1.authenticatePartnerBootstrap(
        { entrySlug, apiKey },
        "req-1",
      );
      expect(auth1.identity.actorId).toBe(keyId);

      // wait for telemetry write
      await new Promise((r) => setTimeout(r, 100));

      // 4. Revoke key and wait for persistence
      const persistSpy2 = vi.spyOn(reloadedRepo1, "persistChanges");
      await reloadedService1.revokePlatformPartnerIngressCredential(
        entrySlug,
        keyId,
        { revokeReason: "test" },
      );
      await Promise.all(persistSpy2.mock.results.map((r) => r.value));

      // 5. Reload service again and verify authentication fails
      const reloadedRepo2 = new TenantPartnerRepository(database);
      const reloadedService2 = new TenantPartnerService(
        new AuditNotificationService(new AuditLogRepository(database)),
        reloadedRepo2,
      );
      await reloadedService2.onModuleInit();

      try {
        reloadedService2.authenticatePartnerBootstrap(
          { entrySlug, apiKey },
          "req-2",
        );
        expect.fail("Should have thrown PARTNER_API_KEY_REVOKED");
      } catch (e: any) {
        expect(e.code).toBe("PARTNER_API_KEY_REVOKED");
      }

      await reloadedService1.onModuleDestroy();
      await reloadedService2.onModuleDestroy();
    });

    it("should pass real formal-PG interleaving matrix", async () => {
      const originalQuery = database.query.bind(database);
      let hold = false;
      const writes: {
        settled: boolean;
        finish: (failure?: boolean) => void;
      }[] = [];

      vi.spyOn(database, "query").mockImplementation(
        (sql: string, values?: any[]) => {
          if (
            hold &&
            sql.includes("INSERT INTO admin.phase1_partner_ingress_credentials")
          ) {
            return new Promise((resolve, reject) => {
              const item = { settled: false, finish: null as any };
              item.finish = (failure = false) => {
                if (item.settled) return;
                item.settled = true;
                if (failure) {
                  reject(new Error("probe rejected lifecycle write"));
                } else {
                  originalQuery(sql, values).then(resolve).catch(reject);
                }
              };
              writes.push(item);
            });
          }
          return originalQuery(sql, values);
        },
      );

      const turn = () => new Promise((r) => setTimeout(r, 10));

      const runInterleavingScenario = async (
        mode: "external" | "internal",
        mutation: "revoke" | "rotation",
        fail: boolean,
      ) => {
        hold = false;
        writes.length = 0;
        const entrySlug = `pg-interleave-${mode}-${mutation}-${fail}-${Date.now()}`;

        // 1. Create entry
        await tenantService.createPlatformPartnerEntry({
          tenantId: "tenant-demo-001",
          partnerCode: `code_${entrySlug}`,
          partnerType: "bank_partner",
          programId: "prog-1",
          entrySlug,
          displayName: "Interleaving Partner",
          authMode: "partner_api_key",
          eligibilityMode: "none",
          businessDispatchSubtype: "enterprise_dispatch",
        });

        // Wait for persistence to finish
        await turn();
        await turn();

        // 2. Issue seed
        const issueRes =
          await tenantService.issuePlatformPartnerIngressCredential(entrySlug, {
            purpose: "seed",
          });
        await turn();
        await turn();
        const apiKey = issueRes.plaintextKey;
        const keyId = issueRes.credential.keyId;

        // 3. Initiate mutation (hold query)
        hold = true;
        const operation = (
          mutation === "revoke"
            ? tenantService.revokePlatformPartnerIngressCredential(
                entrySlug,
                keyId,
                { revokeReason: "test" },
              )
            : tenantService.issuePlatformPartnerIngressCredential(entrySlug, {
                purpose: "overlap",
                overlapDays: 1,
              })
        ).then(
          () => "fulfilled",
          () => "rejected",
        );

        await turn();

        // 4. Authenticate while held
        let authError = null;
        try {
          if (mode === "external") {
            tenantService.authenticatePartnerBootstrap(
              { entrySlug, apiKey },
              "req-probe",
            );
          } else {
            (
              tenantService as any
            ).authenticatePartnerBootstrapWithResolvedCredential(
              entrySlug,
              "req-probe",
            );
          }
        } catch (e) {
          authError = e;
        }
        expect(authError).toBeNull();

        await turn();

        // 5. Release hold
        const lifecycle = [...writes];
        for (const w of lifecycle) w.finish(fail);

        const outcome = await operation;
        expect(outcome).toBe(fail ? "rejected" : "fulfilled");

        // Wait for telemetry and mutex drain
        for (let n = 0; n < 10; n++) {
          await turn();
          for (const w of writes) w.finish();
          if (
            (tenantService as any).entrySlugMutexes.size === 0 &&
            writes.every((w) => w.settled)
          )
            break;
        }

        // 6. Inspect durable record by reloading
        const reloadedRepo = new TenantPartnerRepository(database);
        const reloadedService = new TenantPartnerService(
          new AuditNotificationService(new AuditLogRepository(database)),
          reloadedRepo,
        );
        await reloadedService.onModuleInit();

        if (fail) {
          // Mutation failed, so key is still active and usable
          const auth = reloadedService.authenticatePartnerBootstrap(
            { entrySlug, apiKey },
            "req-after",
          );
          expect(auth.identity.actorId).toBe(keyId);
        } else if (mutation === "revoke") {
          // Revoked successfully
          try {
            reloadedService.authenticatePartnerBootstrap(
              { entrySlug, apiKey },
              "req-after",
            );
            expect.fail("Should have thrown PARTNER_API_KEY_REVOKED");
          } catch (e: any) {
            expect(e.code).toBe("PARTNER_API_KEY_REVOKED");
          }
        } else {
          // Rotation (overlap), key should still be usable
          const auth = reloadedService.authenticatePartnerBootstrap(
            { entrySlug, apiKey },
            "req-after",
          );
          expect(auth.identity.actorId).toBe(keyId);
        }
        await reloadedService.onModuleDestroy();
      };

      try {
        for (const mode of ["external", "internal"] as const) {
          for (const mutation of ["revoke", "rotation"] as const) {
            for (const fail of [false, true]) {
              await runInterleavingScenario(mode, mutation, fail);
            }
          }
        }
      } finally {
        vi.restoreAllMocks();
      }
    });
  },
);
