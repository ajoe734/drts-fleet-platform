import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { PlatformAdminService } from "../../../../apps/api/src/modules/platform-admin/platform-admin.service";
import type { PlatformAdapter } from "@drts/contracts";

describe("C104 & C105: 平台轉接器登錄、生命週期、樂觀鎖與憑證到期真值驗收", () => {
  async function createService() {
    const auditNotificationService = new AuditNotificationService();
    const service = new PlatformAdminService(auditNotificationService);
    await service.onModuleInit();
    return { auditNotificationService, service };
  }

  it("C104: 查詢轉接器真列表，驗證包含有效轉接器且非 404，回讀結構具備 revision 與健康狀態", async () => {
    const { service } = await createService();

    const adapters = service.listPlatformAdapters();
    expect(adapters.length).toBeGreaterThan(0);

    const first = adapters[0]!;
    expect(first.id).toBeDefined();
    expect(first.platformCode).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.config).toBeDefined();
    expect(first.revision).toBeGreaterThanOrEqual(1);

    const fetched = service.getPlatformAdapter(first.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(first.id);
    expect(fetched?.revision).toBe(first.revision);
  });

  it("C104: 註冊新平台轉接器，具備初始 revision 與完整配置，並能正確回讀", async () => {
    const { service } = await createService();

    const newAdapter: PlatformAdapter = {
      id: "adapter-custom-fleet-01",
      platformCode: "taiwan_smart_taxi" as any,
      name: "台灣智慧計程車轉接器",
      description: "自建智慧車隊轉接協議",
      version: "1.0.0",
      environment: "SANDBOX" as any,
      rolloutStage: "SANDBOX" as any,
      adapterType: "EXTERNAL_REST" as any,
      isForwarded: true,
      rolloutStatus: "NOT_STARTED" as any,
      credentialStatus: "VALID" as any,
      revision: 1,
      config: {
        isEnabled: true,
      },
      healthStatus: {
        status: "HEALTHY",
        lastCheckTimestamp: new Date().toISOString(),
        message: null,
      },
      policies: {
        serviceBuckets: ["standard_taxi"],
        maxCandidates: 10,
        acceptTimeoutSeconds: 30,
        manualFallbackThresholdSeconds: 60,
        financeAuthorityMode: "SHADOW" as any,
      },
      featureFlags: {
        enableInstantDispatch: true,
      },
      supportedActions: [
        {
          name: "dispatch_request",
          description: "Dispatch order to partner fleet",
        },
      ],
      webhookStatus: {
        url: "https://api.smarttaxi.example.tw/webhook",
        isEnabled: true,
        lastEventTimestamp: null,
        lastStatus: "UNKNOWN",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const registered = service.registerPlatformAdapter(newAdapter);
    expect(registered.id).toBe("adapter-custom-fleet-01");
    expect(registered.name).toBe("台灣智慧計程車轉接器");

    const refetched = service.getPlatformAdapter("adapter-custom-fleet-01");
    expect(refetched).toBeDefined();
    expect(refetched?.config.isEnabled).toBe(true);
  });

  it("C104: 編輯轉接器配置與停用，驗證版本號遞增與樂觀鎖 (expectedRevision) 衝突防護", async () => {
    const { service } = await createService();
    const adapter = service.listPlatformAdapters()[0]!;
    const initialRevision = adapter.revision ?? 1;

    // 正常更新：切換 isEnabled 並附帶理由
    const updated = await service.updatePlatformAdapter(
      adapter.id,
      {
        config: {
          isEnabled: !adapter.config.isEnabled,
        },
        reason: "定期系統維護與安全金鑰檢驗",
        ...(adapter.revision !== undefined
          ? { expectedRevision: adapter.revision }
          : {}),
      },
      "req-c104-edit",
      "admin-sec-01",
    );

    expect(updated).toBeDefined();
    expect(updated?.config.isEnabled).toBe(!adapter.config.isEnabled);
    expect(updated?.revision).toBe(initialRevision + 1);
    expect(updated?.lastMutationAudit?.reason).toBe(
      "定期系統維護與安全金鑰檢驗",
    );

    // 樂觀鎖衝突防護：若傳入過期的 expectedRevision，應拒絕覆寫並拋出 409 CONFLICT
    await expect(
      service.updatePlatformAdapter(
        adapter.id,
        {
          expectedRevision: initialRevision, // 過期版本
          config: { isEnabled: true },
        },
        "req-c104-conflict",
      ),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("C105: 憑證到期提醒狀態機驗證 (4-state)：依據真實到期時間計算，禁止前端靜態假數據", async () => {
    const { service } = await createService();
    const adapterId = service.listPlatformAdapters()[0]!.id;
    const now = Date.now();

    // 1. 正常期限 (> 30 天) -> ok
    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "cred-ref-001",
        expiresAt: new Date(now + 60 * 86400000).toISOString(),
      },
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("ok");

    // 2. 即將到期 (< 14 天) -> warning
    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "cred-ref-002",
        expiresAt: new Date(now + 5 * 86400000).toISOString(),
      },
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("warning");

    // 3. 已過期 (< 0 天) -> expired
    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "cred-ref-003",
        expiresAt: new Date(now - 2 * 86400000).toISOString(),
      },
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("expired");

    // 4. 無到期資訊 (null) -> unknown (絕不偽造為 ok 或固定 6 天後)
    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: null,
    });
    expect(
      service.getPlatformAdapterCredentialExpiryWarning(adapterId).state,
    ).toBe("unknown");
  });

  it("C105: 到期時間格式損毀或無效字串時誠實歸類為 unknown，絕不冒充確定有效或到期", async () => {
    const { service } = await createService();
    const adapterId = service.listPlatformAdapters()[0]!.id;

    await service.updatePlatformAdapter(adapterId, {
      credentialExpiry: {
        reference: "cred-corrupt",
        expiresAt: "invalid-iso-date-string-not-a-timestamp",
      },
    });

    const warning = service.getPlatformAdapterCredentialExpiryWarning(adapterId);
    expect(warning.state).toBe("unknown");
  });
});
