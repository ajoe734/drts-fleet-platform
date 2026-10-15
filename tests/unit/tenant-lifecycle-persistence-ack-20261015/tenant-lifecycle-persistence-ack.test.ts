import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminRepository } from "../../../apps/api/src/modules/platform-admin/platform-admin.repository";
import { TenantsController } from "../../../apps/api/src/modules/platform-admin/tenants.controller";
import { TenantsService } from "../../../apps/api/src/modules/platform-admin/tenants.service";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<
  T = { rows: unknown[]; rowCount: number },
>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createRealRepoHarness() {
  const queryCalls: Array<{ sql: string; params: unknown[] }> = [];
  let nextQueryImpl: (
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number }> = async () => ({
    rows: [],
    rowCount: 1,
  });

  const databaseService: Pick<DatabaseService, "isEnabled" | "query"> = {
    isEnabled: () => true,
    query: vi.fn((sql: string, params: unknown[] = []) => {
      queryCalls.push({ sql, params });
      return nextQueryImpl(sql, params);
    }) as unknown as DatabaseService["query"],
  };

  const repository = new PlatformAdminRepository(
    databaseService as DatabaseService,
  );
  const reportSpy = vi.spyOn(repository, "reportPersistenceFailure");
  const persistSpy = vi.spyOn(repository, "persistChanges");
  const auditNotificationService = new AuditNotificationService();
  const service = new TenantsService(auditNotificationService, repository);
  const controller = new TenantsController(service);

  return {
    databaseService,
    repository,
    reportSpy,
    persistSpy,
    auditNotificationService,
    service,
    controller,
    queryCalls,
    setNextQueryImpl(
      fn: (
        sql: string,
        params: unknown[],
      ) => Promise<{ rows: unknown[]; rowCount: number }>,
    ) {
      nextQueryImpl = fn;
    },
  };
}

const originalDrtsEnv = process.env.DRTS_ENV;

afterEach(() => {
  if (originalDrtsEnv === undefined) {
    delete process.env.DRTS_ENV;
  } else {
    process.env.DRTS_ENV = originalDrtsEnv;
  }
  vi.restoreAllMocks();
});

describe("TENANT-LIFECYCLE-PERSISTENCE-ACK-20261015: canonical write ACK, failure rollback, and guard preservation", () => {
  describe("tenant-lifecycle_eight-mutators-nine-controllers-canonical-ack", () => {
    it("keeps all 9 controller handlers and 8 service mutators pending while repository SQL write is deferred, and never wraps a Promise inside envelope.data", async () => {
      const harness = createRealRepoHarness();
      const { controller, service, auditNotificationService } = harness;

      // 1. create
      const createWriteDeferred = createDeferred();
      harness.setNextQueryImpl(() => createWriteDeferred.promise);

      let createResolved = false;
      const createPromise = Promise.resolve(
        controller.create(
          {
            name: "Deferred Corp",
            code: "deferred_corp",
            enabledModules: ["enterprise_dispatch", "billing"],
            quotas: {
              activeDrivers: 40,
              monthlyBookings: 800,
              monthlyApiCalls: 20000,
            },
          },
          "req-ack-create",
        ),
      ).then((res) => {
        createResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(createResolved).toBe(false);
      // Uncommitted tenant must not appear in list/get or audit logs while write is pending
      expect(service.list().some((t) => t.code === "deferred_corp")).toBe(
        false,
      );
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-ack-create"),
      ).toBe(false);

      createWriteDeferred.resolve({ rows: [], rowCount: 1 });
      const createEnvelope = await createPromise;
      expect(createResolved).toBe(true);
      expect(createEnvelope.data).not.toBeInstanceOf(Promise);
      expect(
        typeof (createEnvelope.data as unknown as { then?: unknown })?.then,
      ).not.toBe("function");
      const tenantId = createEnvelope.data.id;
      expect(tenantId).toBe("tenant-deferred-corp");
      expect(service.get(tenantId).name).toBe("Deferred Corp");
      expect(
        auditNotificationService
          .listAuditLogs()
          .some(
            (l) =>
              l.actionName === "create_platform_tenant" &&
              l.requestId === "req-ack-create",
          ),
      ).toBe(true);

      // 2. updateSettings
      const settingsDeferred = createDeferred();
      harness.setNextQueryImpl(() => settingsDeferred.promise);
      let settingsResolved = false;
      const settingsPromise = Promise.resolve(
        controller.updateSettings(
          tenantId,
          {
            name: "Deferred Corp Updated",
            enabledModules: ["enterprise_dispatch", "billing", "reporting"],
            quotas: { activeDrivers: 90 },
          },
          "req-ack-settings",
        ),
      ).then((res) => {
        settingsResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(settingsResolved).toBe(false);
      expect(service.get(tenantId).name).toBe("Deferred Corp");
      expect(service.get(tenantId).quotas.activeDrivers).toBe(40);
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-ack-settings"),
      ).toBe(false);

      settingsDeferred.resolve({ rows: [], rowCount: 1 });
      const settingsEnvelope = await settingsPromise;
      expect(settingsEnvelope.data).not.toBeInstanceOf(Promise);
      expect(settingsEnvelope.data.name).toBe("Deferred Corp Updated");
      expect(settingsEnvelope.data.quotas.activeDrivers).toBe(90);

      // 3. updateOnboarding
      const onboardingDeferred = createDeferred();
      harness.setNextQueryImpl(() => onboardingDeferred.promise);
      let onboardingResolved = false;
      const onboardingPromise = Promise.resolve(
        controller.updateOnboarding(
          tenantId,
          {
            rollout: {
              sandboxStatus: "approved",
              cutoverOwner: "Cutover Lead",
              rollbackOwner: "Rollback Lead",
              rollbackPrepared: true,
            },
          },
          "req-ack-onboarding",
        ),
      ).then((res) => {
        onboardingResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(onboardingResolved).toBe(false);
      expect(service.get(tenantId).rollout.sandboxStatus).toBe("ready");

      onboardingDeferred.resolve({ rows: [], rowCount: 1 });
      const onboardingEnvelope = await onboardingPromise;
      expect(onboardingEnvelope.data).not.toBeInstanceOf(Promise);
      expect(onboardingEnvelope.data.rollout.sandboxStatus).toBe("approved");

      // 4. inviteRole
      const inviteDeferred = createDeferred();
      harness.setNextQueryImpl(() => inviteDeferred.promise);
      let inviteResolved = false;
      const invitePromise = Promise.resolve(
        controller.inviteRole(
          tenantId,
          { roleCode: "tenant_admin", inviteeEmail: "admin@deferred.example" },
          "req-ack-invite",
        ),
      ).then((res) => {
        inviteResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(inviteResolved).toBe(false);
      expect(
        service
          .get(tenantId)
          .bootstrapDefaults.roleDefaults.find(
            (r) => r.roleCode === "tenant_admin",
          )?.invitedAt,
      ).toBeNull();

      inviteDeferred.resolve({ rows: [], rowCount: 1 });
      const inviteEnvelope = await invitePromise;
      expect(inviteEnvelope.data).not.toBeInstanceOf(Promise);
      expect(
        inviteEnvelope.data.bootstrapDefaults.roleDefaults.find(
          (r) => r.roleCode === "tenant_admin",
        )?.invitedAt,
      ).toEqual(expect.any(String));

      // 5. acknowledgeRole
      const ackDeferred = createDeferred();
      harness.setNextQueryImpl(() => ackDeferred.promise);
      let ackResolved = false;
      const ackPromise = Promise.resolve(
        controller.acknowledgeRole(
          tenantId,
          { roleCode: "tenant_admin" },
          "req-ack-role",
        ),
      ).then((res) => {
        ackResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(ackResolved).toBe(false);
      expect(
        service
          .get(tenantId)
          .bootstrapDefaults.roleDefaults.find(
            (r) => r.roleCode === "tenant_admin",
          )?.acknowledgedAt,
      ).toBeNull();

      ackDeferred.resolve({ rows: [], rowCount: 1 });
      const ackEnvelope = await ackPromise;
      expect(ackEnvelope.data).not.toBeInstanceOf(Promise);
      expect(
        ackEnvelope.data.bootstrapDefaults.roleDefaults.find(
          (r) => r.roleCode === "tenant_admin",
        )?.acknowledgedAt,
      ).toEqual(expect.any(String));

      // 6. setRolloutStage
      const stageDeferred = createDeferred();
      harness.setNextQueryImpl(() => stageDeferred.promise);
      let stageResolved = false;
      const stagePromise = Promise.resolve(
        controller.setRolloutStage(
          tenantId,
          { stage: "pilot", notes: "Pilot approved" },
          "req-ack-stage",
        ),
      ).then((res) => {
        stageResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(stageResolved).toBe(false);
      expect(service.get(tenantId).rollout.stage).toBe("sandbox");

      stageDeferred.resolve({ rows: [], rowCount: 1 });
      const stageEnvelope = await stagePromise;
      expect(stageEnvelope.data).not.toBeInstanceOf(Promise);
      expect(stageEnvelope.data.rollout.stage).toBe("pilot");

      // 7. suspend (setStatus -> paused)
      const suspendDeferred = createDeferred();
      harness.setNextQueryImpl(() => suspendDeferred.promise);
      let suspendResolved = false;
      const suspendPromise = Promise.resolve(
        controller.suspend(tenantId, "req-ack-suspend"),
      ).then((res) => {
        suspendResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(suspendResolved).toBe(false);
      expect(service.get(tenantId).status).toBe("active");

      suspendDeferred.resolve({ rows: [], rowCount: 1 });
      const suspendEnvelope = await suspendPromise;
      expect(suspendEnvelope.data).not.toBeInstanceOf(Promise);
      expect(suspendEnvelope.data.status).toBe("paused");

      // 8. activate (setStatus -> active)
      const activateDeferred = createDeferred();
      harness.setNextQueryImpl(() => activateDeferred.promise);
      let activateResolved = false;
      const activatePromise = Promise.resolve(
        controller.activate(tenantId, "req-ack-activate"),
      ).then((res) => {
        activateResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(activateResolved).toBe(false);
      expect(service.get(tenantId).status).toBe("paused");

      activateDeferred.resolve({ rows: [], rowCount: 1 });
      const activateEnvelope = await activatePromise;
      expect(activateEnvelope.data).not.toBeInstanceOf(Promise);
      expect(activateEnvelope.data.status).toBe("active");

      // 9. rollbackHold (setRollbackHold)
      const holdDeferred = createDeferred();
      harness.setNextQueryImpl(() => holdDeferred.promise);
      let holdResolved = false;
      const holdPromise = Promise.resolve(
        controller.rollbackHold(tenantId, "req-ack-hold"),
      ).then((res) => {
        holdResolved = true;
        return res;
      });

      await Promise.resolve();
      expect(holdResolved).toBe(false);
      expect(service.get(tenantId).status).toBe("active");

      holdDeferred.resolve({ rows: [], rowCount: 1 });
      const holdEnvelope = await holdPromise;
      expect(holdEnvelope.data).not.toBeInstanceOf(Promise);
      expect(holdEnvelope.data.status).toBe("rollback_hold");
      expect(holdEnvelope.data.rollout.productionStatus).toBe("blocked");
    });

    it("qualifies startup helper awaits in onModuleInit while preserving non-fatal startup semantics", async () => {
      const harness = createRealRepoHarness();
      const { service, repository, reportSpy } = harness;

      // Case 1: Empty persisted tenants triggers awaited module init bootstrap write
      const bootstrapDeferred = createDeferred();
      vi.spyOn(repository, "loadState").mockResolvedValueOnce({
        platformTenants: [],
        publicInfoVersions: [],
        placardVersions: [],
        platformAdapters: [],
      });
      harness.setNextQueryImpl(() => bootstrapDeferred.promise);

      let initDone = false;
      const initPromise = service.onModuleInit().then(() => {
        initDone = true;
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(initDone).toBe(false);

      bootstrapDeferred.reject(new Error("bootstrap write transient failure"));
      await expect(initPromise).resolves.toBeUndefined();
      expect(initDone).toBe(true);
      expect(reportSpy).toHaveBeenCalledWith(
        expect.any(Error),
        "module init bootstrap",
      );

      // Case 2: Strict auth sanitize triggers awaited module init strict auth sanitize write
      process.env.DRTS_ENV = "production";
      const sanitizeDeferred = createDeferred();
      const demoTenant = service.get("tenant-demo-001");
      vi.spyOn(repository, "loadState").mockResolvedValueOnce({
        platformTenants: [demoTenant],
        publicInfoVersions: [],
        placardVersions: [],
        platformAdapters: [],
      });
      harness.setNextQueryImpl(() => sanitizeDeferred.promise);

      let sanitizeDone = false;
      const sanitizePromise = service.onModuleInit().then(() => {
        sanitizeDone = true;
      });

      await Promise.resolve();
      await Promise.resolve();
      expect(sanitizeDone).toBe(false);

      sanitizeDeferred.reject(new Error("sanitize write transient failure"));
      await expect(sanitizePromise).resolves.toBeUndefined();
      expect(sanitizeDone).toBe(true);
      expect(reportSpy).toHaveBeenCalledWith(
        expect.any(Error),
        "module init strict auth sanitize",
      );
    });
  });

  describe("tenant-lifecycle_failure-cache-audit-and-readback", () => {
    it("propagates repository rejection across all 8 mutators / 9 controller actions, preserves prior state & audit, does not clobber sibling tenants, and succeeds on retry", async () => {
      const harness = createRealRepoHarness();
      const { controller, service, auditNotificationService, reportSpy } =
        harness;

      // Seed a sibling tenant to verify isolation
      const sibling = await service.create(
        {
          name: "Sibling Stable Tenant",
          code: "sibling_stable",
          quotas: { activeDrivers: 77 },
        },
        "req-seed-sibling",
      );

      // 1. Failed create does not pollute cache or audit, and allows retry with same code
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_create");
      });

      await expect(
        controller.create(
          {
            name: "Retryable Corp",
            code: "retryable_corp",
            quotas: { activeDrivers: 55 },
          },
          "req-fail-create",
        ),
      ).rejects.toThrow("pg_write_rejected_create");

      expect(reportSpy).toHaveBeenCalledWith(
        expect.any(Error),
        "create tenant",
      );
      expect(service.list().some((t) => t.code === "retryable_corp")).toBe(
        false,
      );
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-create"),
      ).toBe(false);

      // Restore healthy DB and retry create with the exact same code
      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      const createdEnv = await controller.create(
        {
          name: "Retryable Corp",
          code: "retryable_corp",
          quotas: { activeDrivers: 55 },
        },
        "req-retry-create",
      );
      const tenantId = createdEnv.data.id;
      expect(service.get(tenantId).quotas.activeDrivers).toBe(55);

      // 2. Failed updateSettings (name, quotas, enabledModules) rolls back cleanly
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_settings");
      });

      await expect(
        controller.updateSettings(
          tenantId,
          {
            name: "Corrupted Name",
            enabledModules: ["enterprise_dispatch", "webhooks"],
            quotas: {
              activeDrivers: 999,
              monthlyBookings: 99999,
              monthlyApiCalls: 999999,
            },
          },
          "req-fail-settings",
        ),
      ).rejects.toThrow("pg_write_rejected_settings");

      const afterFailedSettings = service.get(tenantId);
      expect(afterFailedSettings.name).toBe("Retryable Corp");
      expect(afterFailedSettings.enabledModules).toEqual([
        "enterprise_dispatch",
      ]);
      expect(afterFailedSettings.quotas.activeDrivers).toBe(55);
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-settings"),
      ).toBe(false);

      // Retry updateSettings succeeds
      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      const updatedSettingsEnv = await controller.updateSettings(
        tenantId,
        {
          name: "Retryable Corp V2",
          enabledModules: ["enterprise_dispatch", "billing"],
          quotas: { activeDrivers: 120 },
        },
        "req-retry-settings",
      );
      expect(updatedSettingsEnv.data.name).toBe("Retryable Corp V2");
      expect(service.get(tenantId).quotas.activeDrivers).toBe(120);

      // 3. Failed updateOnboarding preserves prior onboarding/rollout state
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_onboarding");
      });

      await expect(
        controller.updateOnboarding(
          tenantId,
          {
            billingBaseline: {
              invoiceTitle: "Should Not Persist",
              contactName: "Ghost",
              email: "ghost@retryable.example",
            },
            rollout: {
              sandboxStatus: "approved",
              cutoverOwner: "Ghost Owner",
            },
          },
          "req-fail-onboarding",
        ),
      ).rejects.toThrow("pg_write_rejected_onboarding");

      expect(
        service.get(tenantId).bootstrapDefaults.billingBaseline.invoiceTitle,
      ).toBe("Retryable Corp");
      expect(service.get(tenantId).rollout.sandboxStatus).toBe("ready");
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-onboarding"),
      ).toBe(false);

      // Retry updateOnboarding succeeds
      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      await controller.updateOnboarding(
        tenantId,
        {
          rollout: {
            sandboxStatus: "approved",
            cutoverOwner: "Real Cutover",
            rollbackOwner: "Real Rollback",
            rollbackPrepared: true,
          },
        },
        "req-retry-onboarding",
      );
      expect(service.get(tenantId).rollout.sandboxStatus).toBe("approved");

      // 4. Failed inviteRole preserves null invitedAt and no audit
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_invite");
      });

      await expect(
        controller.inviteRole(
          tenantId,
          { roleCode: "tenant_admin" },
          "req-fail-invite",
        ),
      ).rejects.toThrow("pg_write_rejected_invite");

      expect(
        service
          .get(tenantId)
          .bootstrapDefaults.roleDefaults.find(
            (r) => r.roleCode === "tenant_admin",
          )?.invitedAt,
      ).toBeNull();
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-invite"),
      ).toBe(false);

      // Retry inviteRole succeeds
      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      await controller.inviteRole(
        tenantId,
        { roleCode: "tenant_admin" },
        "req-retry-invite",
      );
      expect(
        service
          .get(tenantId)
          .bootstrapDefaults.roleDefaults.find(
            (r) => r.roleCode === "tenant_admin",
          )?.invitedAt,
      ).toEqual(expect.any(String));

      // 5. Failed acknowledgeRole preserves null acknowledgedAt and no audit
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_ack");
      });

      await expect(
        controller.acknowledgeRole(
          tenantId,
          { roleCode: "tenant_admin" },
          "req-fail-ack",
        ),
      ).rejects.toThrow("pg_write_rejected_ack");

      expect(
        service
          .get(tenantId)
          .bootstrapDefaults.roleDefaults.find(
            (r) => r.roleCode === "tenant_admin",
          )?.acknowledgedAt,
      ).toBeNull();
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-ack"),
      ).toBe(false);

      // Retry acknowledgeRole succeeds
      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      await controller.acknowledgeRole(
        tenantId,
        { roleCode: "tenant_admin" },
        "req-retry-ack",
      );
      expect(
        service
          .get(tenantId)
          .bootstrapDefaults.roleDefaults.find(
            (r) => r.roleCode === "tenant_admin",
          )?.acknowledgedAt,
      ).toEqual(expect.any(String));

      // 6. Failed setRolloutStage preserves sandbox stage and no success audit
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_stage");
      });

      await expect(
        controller.setRolloutStage(
          tenantId,
          { stage: "pilot", notes: "Should fail" },
          "req-fail-stage",
        ),
      ).rejects.toThrow("pg_write_rejected_stage");

      expect(service.get(tenantId).rollout.stage).toBe("sandbox");
      expect(service.get(tenantId).rollout.pilotStatus).toBe("pending");
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-stage"),
      ).toBe(false);

      // Retry setRolloutStage succeeds
      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      await controller.setRolloutStage(
        tenantId,
        { stage: "pilot", notes: "Pilot live" },
        "req-retry-stage",
      );
      expect(service.get(tenantId).rollout.stage).toBe("pilot");

      // 7. Failed suspend / activate (setStatus) preserves prior status and no audit
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_suspend");
      });

      await expect(
        controller.suspend(tenantId, "req-fail-suspend"),
      ).rejects.toThrow("pg_write_rejected_suspend");

      expect(service.get(tenantId).status).toBe("active");
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-suspend"),
      ).toBe(false);

      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      await controller.suspend(tenantId, "req-retry-suspend");
      expect(service.get(tenantId).status).toBe("paused");

      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_activate");
      });
      await expect(
        controller.activate(tenantId, "req-fail-activate"),
      ).rejects.toThrow("pg_write_rejected_activate");
      expect(service.get(tenantId).status).toBe("paused");

      harness.setNextQueryImpl(async () => ({ rows: [], rowCount: 1 }));
      await controller.activate(tenantId, "req-retry-activate");
      expect(service.get(tenantId).status).toBe("active");

      // 8. Failed rollbackHold preserves active status & prior productionStatus
      harness.setNextQueryImpl(async () => {
        throw new Error("pg_write_rejected_hold");
      });

      await expect(
        controller.rollbackHold(tenantId, "req-fail-hold"),
      ).rejects.toThrow("pg_write_rejected_hold");

      expect(service.get(tenantId).status).toBe("active");
      expect(service.get(tenantId).rollout.productionStatus).toBe("pending");
      expect(
        auditNotificationService
          .listAuditLogs()
          .some((l) => l.requestId === "req-fail-hold"),
      ).toBe(false);

      // Verify sibling tenant was never clobbered by any failure or retry
      const siblingReadback = service.get(sibling.id);
      expect(siblingReadback.name).toBe("Sibling Stable Tenant");
      expect(siblingReadback.quotas.activeDrivers).toBe(77);
      expect(siblingReadback.status).toBe("active");
    });
  });

  describe("tenant-lifecycle_original-guards-isolation-and-noDB", () => {
    it("enforces validation and promotion guards before calling repository persistence, and supports noDB mode", async () => {
      const harness = createRealRepoHarness();
      const { service, persistSpy, auditNotificationService } = harness;

      const created = await service.create({
        name: "Guard Check Tenant",
        code: "guard_check",
      });
      persistSpy.mockClear();

      // Duplicate code rejected before persistence
      await expect(
        service.create({ name: "Duplicate", code: "guard-check" }),
      ).rejects.toThrow(ApiRequestError);
      expect(persistSpy).not.toHaveBeenCalled();

      // Negative quota rejected before persistence
      await expect(
        service.updateSettings(created.id, {
          quotas: { activeDrivers: -1 },
        }),
      ).rejects.toThrow(ApiRequestError);
      expect(persistSpy).not.toHaveBeenCalled();

      // Invalid module rejected before persistence
      await expect(
        service.updateSettings(created.id, {
          enabledModules: ["invalid_module" as never],
        }),
      ).rejects.toThrow(ApiRequestError);
      expect(persistSpy).not.toHaveBeenCalled();

      // Uninvited role ack rejected before persistence
      await expect(
        service.acknowledgeRole(created.id, { roleCode: "tenant_admin" }),
      ).rejects.toThrow(ApiRequestError);
      expect(persistSpy).not.toHaveBeenCalled();

      // Promotion gate blocked records reject_platform_tenant_rollout audit and does not persist
      await expect(
        service.setRolloutStage(
          created.id,
          { stage: "pilot" },
          "req-blocked-stage",
        ),
      ).rejects.toThrow(ApiRequestError);
      expect(persistSpy).not.toHaveBeenCalled();
      expect(
        auditNotificationService
          .listAuditLogs()
          .some(
            (l) =>
              l.actionName === "reject_platform_tenant_rollout" &&
              l.requestId === "req-blocked-stage",
          ),
      ).toBe(true);

      // Supported noDB mode works without repository
      const noDbAudit = new AuditNotificationService();
      const noDbService = new TenantsService(noDbAudit);
      const noDbTenant = await noDbService.create({
        name: "NoDB Tenant",
        code: "nodb_tenant",
      });
      const noDbUpdated = await noDbService.updateSettings(noDbTenant.id, {
        quotas: { monthlyBookings: 2500 },
      });
      expect(noDbUpdated.quotas.monthlyBookings).toBe(2500);
      expect(noDbService.get(noDbTenant.id).quotas.monthlyBookings).toBe(2500);
    });
  });
});
