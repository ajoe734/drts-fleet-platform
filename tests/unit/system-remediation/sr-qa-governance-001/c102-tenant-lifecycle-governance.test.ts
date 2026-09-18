import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantsService } from "../../../../apps/api/src/modules/platform-admin/tenants.service";

describe("C102: 租戶生命週期、跨租戶治理、配額與功能開通驗收", () => {
  function createService() {
    const auditNotificationService = new AuditNotificationService();
    const service = new TenantsService(auditNotificationService);
    return { auditNotificationService, service };
  }

  it("正常建立新租戶，預設處於 sandbox 階段，並自動指派種子配額與開通模組", () => {
    const { service, auditNotificationService } = createService();

    const created = service.create(
      {
        name: "台積電企業差旅專案",
        code: "tsmc-corp",
      },
      "req-c102-create-tenant",
    );

    expect(created.id).toBeDefined();
    expect(created.name).toBe("台積電企業差旅專案");
    expect(created.code).toBe("tsmc_corp");
    expect(created.status).toBe("active");
    expect(created.rollout.stage).toBe("sandbox");
    expect(created.enabledModules).toContain("enterprise_dispatch");
    expect(created.quotas.activeDrivers).toBe(25);
    expect(created.quotas.monthlyBookings).toBe(500);
    expect(created.quotas.monthlyApiCalls).toBe(10000);

    const auditLogs = auditNotificationService.listAuditLogs();
    const createLog = auditLogs.find(
      (log) =>
        log.actionName === "create_platform_tenant" &&
        log.resourceId === created.id,
    );
    expect(createLog).toBeDefined();
    expect(createLog?.requestId).toBe("req-c102-create-tenant");
  });

  it("拒絕重複的租戶 code，拋出 409 CONFLICT 確保租戶識別唯一性", () => {
    const { service } = createService();

    service.create({
      name: "國泰金控差旅",
      code: "cathay-financial",
    });

    expect(() =>
      service.create({
        name: "國泰金控差旅二部",
        code: "cathay-financial",
      }),
    ).toThrowError(ApiRequestError);
  });

  it("更新租戶配額與功能開通模組，且負數配額或無效模組代碼即時拒絕", () => {
    const { service } = createService();

    const tenant = service.create({
      name: "聯發科接駁",
      code: "mediatek-shuttle",
    });

    // 成功更新配額與模組
    const updated = service.updateSettings(
      tenant.id,
      {
        name: "聯發科接駁旗艦版",
        enabledModules: ["enterprise_dispatch", "billing", "reporting", "webhooks"],
        quotas: {
          activeDrivers: 200,
          monthlyBookings: 50000,
          monthlyApiCalls: 1000000,
        },
      },
      "req-c102-update-settings",
    );

    expect(updated.name).toBe("聯發科接駁旗艦版");
    expect(updated.quotas.activeDrivers).toBe(200);
    expect(updated.quotas.monthlyBookings).toBe(50000);
    expect(updated.quotas.monthlyApiCalls).toBe(1000000);
    expect(updated.enabledModules).toEqual([
      "enterprise_dispatch",
      "billing",
      "reporting",
      "webhooks",
    ]);

    // 負數配額遭拒絕
    expect(() =>
      service.updateSettings(tenant.id, {
        quotas: {
          activeDrivers: -10,
        },
      }),
    ).toThrowError(ApiRequestError);

    // 非法模組名稱遭拒絕
    expect(() =>
      service.updateSettings(tenant.id, {
        enabledModules: ["enterprise_dispatch", "unsupported_crypto_mining_module" as any],
      }),
    ).toThrowError(ApiRequestError);
  });

  it("租戶生命週期晉升嚴格守衛：未通過 sandbox 驗收前禁止晉升至 pilot，未通過切換預備前禁止進入 production", () => {
    const { service } = createService();

    const tenant = service.create({
      name: "富邦金控",
      code: "fubon-corp",
    });

    // 尚未核准 sandbox，直接嘗試跳級 pilot 應失敗
    expect(() =>
      service.setRolloutStage(tenant.id, { stage: "pilot" }),
    ).toThrowError(ApiRequestError);

    // 模擬通過 sandbox
    service.updateOnboarding(tenant.id, {
      rollout: {
        sandboxStatus: "approved",
      },
    });

    // 通過 sandbox 後晉升 pilot 成功
    const pilotTenant = service.setRolloutStage(tenant.id, { stage: "pilot" });
    expect(pilotTenant.rollout.stage).toBe("pilot");

    // 嘗試晉升 production 但未完成 pilot 審查與 rollbackPrepared 前應被拒絕
    expect(() =>
      service.setRolloutStage(tenant.id, { stage: "production" }),
    ).toThrowError(ApiRequestError);

    // 補齊 production 晉升必要條款
    service.updateOnboarding(tenant.id, {
      rollout: {
        pilotStatus: "approved",
        cutoverOwner: "ops-lead-01",
        rollbackOwner: "infra-lead-01",
        rollbackPrepared: true,
      },
      roleDefaults: [
        {
          roleCode: "tenant_admin",
          displayName: "Tenant Administrator",
          required: true,
          invitedAt: "2026-09-01T00:00:00.000Z",
          acknowledgedAt: "2026-09-02T00:00:00.000Z",
        },
      ],
    });

    const prodTenant = service.setRolloutStage(tenant.id, {
      stage: "production",
    });
    expect(prodTenant.rollout.stage).toBe("production");
  });

  it("支援停用租戶、暫停營運與進入 rollback_hold 熔斷鎖定，且 hold 期間嚴禁任何晉升操作", () => {
    const { service, auditNotificationService } = createService();

    const tenant = service.create({
      name: "星宇航空貴賓接送",
      code: "starlux-vip",
    });

    // 暫停營運
    const paused = service.setStatus(tenant.id, "paused", "req-c102-pause");
    expect(paused.status).toBe("paused");

    // 觸發 rollback_hold
    const hold = service.setRollbackHold(tenant.id, "req-c102-hold");
    expect(hold.status).toBe("rollback_hold");

    // 在 rollback_hold 狀態下，嘗試推展階段應遭 409 CONFLICT 拒絕
    expect(() =>
      service.setRolloutStage(tenant.id, { stage: "pilot" }),
    ).toThrowError(ApiRequestError);

    const auditLogs = auditNotificationService.listAuditLogs();
    expect(
      auditLogs.some(
        (log) =>
          log.actionName === "set_tenant_rollback_hold" &&
          log.resourceId === tenant.id,
      ),
    ).toBe(true);
  });

  it("跨租戶治理隔離：各租戶設定獨立維護，更新租戶 A 不污染租戶 B", () => {
    const { service } = createService();

    const tenantA = service.create({
      name: "租戶 A 科技",
      code: "tenant-a-tech",
    });
    const tenantB = service.create({
      name: "租戶 B 銀行",
      code: "tenant-b-bank",
    });

    service.updateSettings(tenantA.id, {
      quotas: {
        activeDrivers: 999,
      },
      enabledModules: ["enterprise_dispatch"],
    });

    const refetchedA = service.get(tenantA.id);
    const refetchedB = service.get(tenantB.id);

    expect(refetchedA.quotas.activeDrivers).toBe(999);
    expect(refetchedA.enabledModules).toEqual(["enterprise_dispatch"]);

    // 租戶 B 保持預設，不受 A 影響
    expect(refetchedB.quotas.activeDrivers).not.toBe(999);
    expect(refetchedB.name).toBe("租戶 B 銀行");
  });
});
