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
        entered: Promise<void>;
        finish: (failure?: boolean) => Promise<void>;
      }[] = [];

      vi.spyOn(database, "query").mockImplementation(
        (sql: string, values?: any[]) => {
          if (
            hold &&
            sql.includes("INSERT INTO admin.phase1_partner_ingress_credentials")
          ) {
            return new Promise((resolve, reject) => {
              let signalEntered!: () => void;
              const entered = new Promise<void>((r) => {
                signalEntered = r;
              });
              const item = { settled: false, entered, finish: null as any };
              item.finish = async (failure = false) => {
                if (item.settled) return;
                try {
                  if (failure) {
                    reject(new Error("probe rejected lifecycle write"));
                  } else {
                    const result = await originalQuery(sql, values);
                    resolve(result);
                  }
                } catch (e) {
                  reject(e);
                } finally {
                  item.settled = true;
                }
              };
              writes.push(item);
              signalEntered();
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

        // Wait for persistence to finish by awaiting mutexes
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
        let operationResult: any;
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
          (res) => {
            operationResult = res;
            return "fulfilled";
          },
          () => "rejected",
        );

        // Snapshot lifecycle queries before auth via an explicit query-entered signal
        const expectedWrites = mutation === "revoke" ? 1 : 2;
        const startPoll = Date.now();
        while (writes.length < expectedWrites) {
          if (Date.now() - startPoll > 2000)
            throw new Error("timeout waiting for lifecycle writes");
          await turn();
        }
        await Promise.all(writes.map((w) => w.entered));

        // 4. Authenticate while held
        let authError = null;
        let heldAuthResult: any = null;
        try {
          if (mode === "external") {
            heldAuthResult = tenantService.authenticatePartnerBootstrap(
              { entrySlug, apiKey },
              "req-probe",
            );
          } else {
            heldAuthResult = (
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
        expect(heldAuthResult?.identity.actorId).toBe(keyId);

        // Assert telemetry hasn't joined lifecycle writes (telemetry is usage, not credentials)
        await turn();
        expect(writes.length).toBe(expectedWrites);

        // 5. Release hold
        const lifecycle = [...writes];
        // Stop intercepting new writes BEFORE releasing lifecycle snapshot
        hold = false;

        for (const w of lifecycle) await w.finish(fail);

        const outcome = await operation;
        expect(outcome).toBe(fail ? "rejected" : "fulfilled");

        // Wait for telemetry and mutex drain
        const drainStart = Date.now();
        while (true) {
          if (Date.now() - drainStart > 2000)
            throw new Error("timeout waiting for drain");
          await turn();
          if (
            (tenantService as any).entrySlugMutexes.size === 0 &&
            writes.every((w) => w.settled)
          ) {
            break;
          }
        }

        // Inspect durable record directly
        const durableRows = (
          await database.query(
            "SELECT * FROM admin.phase1_partner_ingress_credentials WHERE entry_slug = $1",
            [entrySlug],
          )
        ).rows;
        const seedRow = durableRows.find((r) => r.key_id === keyId);
        const seedRecord =
          typeof seedRow.record === "string"
            ? JSON.parse(seedRow.record)
            : seedRow.record;

        if (!fail && mutation === "rotation") {
          expect(seedRecord.status).toBe("overlap_active");
          expect(seedRecord.overlapEndsAt).toBeDefined();
          expect(seedRecord.supersededByKeyId).toBe(
            operationResult.credential.keyId,
          );
          const newRow = durableRows.find(
            (r) => r.key_id === operationResult.credential.keyId,
          );
          expect(newRow).toBeDefined();
          const newRecord =
            typeof newRow.record === "string"
              ? JSON.parse(newRow.record)
              : newRow.record;
          expect(newRecord.status).toBe("active");
        } else if (!fail && mutation === "revoke") {
          expect(seedRecord.status).toBe("revoked");
          expect(seedRow.revoked_at).not.toBeNull();
        } else {
          expect(seedRecord.status).toBe("active");
          expect(seedRecord.overlapEndsAt == null).toBe(true);
          if (fail && mutation === "rotation") {
            expect(durableRows.length).toBe(1); // No phantom writes
          }
        }

        // 6. Inspect durable record by reloading
        let reloadedService: any;
        try {
          const reloadedRepo = new TenantPartnerRepository(database);
          reloadedService = new TenantPartnerService(
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

            if (mutation === "rotation") {
              const keys =
                reloadedService.listPlatformPartnerIngressCredentials(
                  entrySlug,
                );
              expect(keys.length).toBe(1);
              expect(keys[0].keyId).toBe(keyId);
            }
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

            const newAuth = reloadedService.authenticatePartnerBootstrap(
              { entrySlug, apiKey: operationResult.plaintextKey },
              "req-after-new",
            );
            expect(newAuth.identity.actorId).toBe(
              operationResult.credential.keyId,
            );
          }
        } finally {
          try {
            if (reloadedService) {
              const reloadDrainStart = Date.now();
              while (reloadedService.entrySlugMutexes.size > 0) {
                if (Date.now() - reloadDrainStart > 2000) {
                  // eslint-disable-next-line no-unsafe-finally
                  throw new Error("timeout waiting for reload drain");
                }
                await turn();
              }
            }
          } finally {
            if (reloadedService) await reloadedService.onModuleDestroy();
          }
        }
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
        hold = false;
        for (const w of writes) await w.finish();
        const promises = [...(tenantService as any).entrySlugMutexes.values()];
        if (promises.length > 0) await Promise.all(promises);
        vi.restoreAllMocks();
      }
    });

    it("diagnostic: should drain correctly even on assertion failure", async () => {
      const entrySlug = `pg-failure-${Date.now()}`;

      await tenantService.createPlatformPartnerEntry({
        tenantId: "tenant-demo-001",
        partnerCode: `code_${entrySlug}`,
        partnerType: "bank_partner",
        programId: "prog-1",
        entrySlug,
        displayName: "PG Failure Partner",
        authMode: "partner_api_key",
        eligibilityMode: "none",
        businessDispatchSubtype: "enterprise_dispatch",
      });
      await new Promise((r) => setTimeout(r, 20));

      const issueRes =
        await tenantService.issuePlatformPartnerIngressCredential(entrySlug, {
          purpose: "seed",
        });
      await new Promise((r) => setTimeout(r, 20));
      const apiKey = issueRes.plaintextKey;

      const originalQuery = database.query.bind(database);
      let holdTelemetry = false;
      const heldTelemetry: {
        resolveHold: () => void;
        queryPromise: Promise<any>;
      }[] = [];

      let queryEnteredResolve!: () => void;
      const queryEnteredPromise = new Promise<void>((r) => {
        queryEnteredResolve = r;
      });

      vi.spyOn(database, "query").mockImplementation(
        (sql: string, values?: any[]) => {
          if (
            holdTelemetry &&
            sql.includes("INSERT INTO admin.phase1_partner_ingress_credentials")
          ) {
            let resolveHold!: () => void;
            const holdPromise = new Promise<void>((r) => {
              resolveHold = r;
            });
            const queryPromise = holdPromise.then(() =>
              originalQuery(sql, values),
            );
            heldTelemetry.push({ resolveHold, queryPromise });
            queryEnteredResolve();
            return queryPromise;
          }
          return originalQuery(sql, values);
        },
      );

      let reloadedService: any;
      let caughtAssertionError = false;

      try {
        try {
          const reloadedRepo = new TenantPartnerRepository(database);
          reloadedService = new TenantPartnerService(
            new AuditNotificationService(new AuditLogRepository(database)),
            reloadedRepo,
          );
          await reloadedService.onModuleInit();

          holdTelemetry = true;
          reloadedService.authenticatePartnerBootstrap(
            { entrySlug, apiKey },
            "req-after",
          );

          await Promise.race([
            queryEnteredPromise,
            new Promise((_, rej) =>
              setTimeout(
                () => rej(new Error("Timeout waiting for query entry")),
                2000,
              ),
            ),
          ]);
          expect(heldTelemetry.length).toBeGreaterThan(0);

          if (reloadedService.entrySlugMutexes.size > 0) {
            throw new Error("injected post-reload identity assertion failure");
          }
        } finally {
          holdTelemetry = false;
          try {
            if (reloadedService) {
              const reloadDrainStart = Date.now();
              // Release telemetry BEFORE the bounded drain completes
              heldTelemetry.forEach((h) => h.resolveHold());

              while (reloadedService.entrySlugMutexes.size > 0) {
                if (Date.now() - reloadDrainStart > 2000) {
                  // eslint-disable-next-line no-unsafe-finally
                  throw new Error("timeout waiting for reload drain");
                }
                await new Promise((r) => setTimeout(r, 10));
              }
            }
          } finally {
            if (reloadedService) await reloadedService.onModuleDestroy();
          }
        }
      } catch (e: any) {
        if (e.message === "injected post-reload identity assertion failure") {
          caughtAssertionError = true;
        } else {
          throw e;
        }
      } finally {
        // Await actual completion of all released telemetry queries
        await Promise.allSettled(heldTelemetry.map((h) => h.queryPromise));
        if (reloadedService) {
          expect(reloadedService.entrySlugMutexes.size).toBe(0);
        }
        vi.restoreAllMocks();
      }

      expect(caughtAssertionError).toBe(true);
    });
  },
);
