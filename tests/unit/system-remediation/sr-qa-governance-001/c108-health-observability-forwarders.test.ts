import { describe, expect, it, vi } from "vitest";

import type {
  PlatformCode,
  ReportForwarderSyncFailureCommand,
} from "@drts/contracts";
import type {
  ForwarderAdapterHealthSnapshot,
  ForwarderAdapterInterface,
} from "../../../../apps/api/src/modules/forwarder/forwarder-adapter.interface";
import { GRAB_TAIWAN_PLATFORM_CODE } from "../../../../apps/api/src/modules/forwarder/grab-taiwan.adapter";
import { ForwarderService } from "../../../../apps/api/src/modules/forwarder/forwarder.service";
import { OperationalObservabilityService } from "../../../../apps/api/src/modules/operational-observability/operational-observability.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

function createMockAdapter(
  platformCode: PlatformCode = GRAB_TAIWAN_PLATFORM_CODE,
  overrides: Partial<ForwarderAdapterInterface> = {},
): ForwarderAdapterInterface {
  return {
    platformCode,
    capabilitySummary: {
      mode: "hybrid",
      productionStatus: "production_ready",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: ["forwarder.order.received"],
      notes: ["Mock adapter for observability acceptance"],
    },
    accept: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "accept_ok",
    })),
    reject: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "reject_ok",
    })),
    complete: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "complete_ok",
    })),
    heartbeat: vi.fn(async () => ({
      acknowledged: true,
      platformCode,
      checkedAt: new Date().toISOString(),
    })),
    fetchEarnings: vi.fn(async () => ({
      platformCode,
      currency: "TWD",
      totalAmount: 0,
      asOf: new Date().toISOString(),
    })),
    getHealthSnapshot: vi.fn(async (): Promise<ForwarderAdapterHealthSnapshot> => ({
      status: "healthy",
      reason: "none",
      credentialStatus: "valid",
      authStatus: "authenticated",
      webhookStatus: "healthy",
      rateLimitStatus: "ok",
      checkedAt: new Date().toISOString(),
    })),
    ...overrides,
  };
}

function createStubAdapter(
  platformCode: PlatformCode = "UBER_TAIWAN" as PlatformCode,
): ForwarderAdapterInterface {
  return {
    platformCode,
    capabilitySummary: {
      mode: "stub",
      productionStatus: "stub",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: [],
      notes: ["Stub adapter"],
    },
    accept: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "stub_accept",
    })),
    reject: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "stub_reject",
    })),
    complete: vi.fn(async ({ externalOrderId }) => ({
      acknowledged: true,
      platformCode,
      externalOrderId,
      detail: "stub_complete",
    })),
    heartbeat: vi.fn(async () => ({
      acknowledged: true,
      platformCode,
      checkedAt: new Date().toISOString(),
    })),
    fetchEarnings: vi.fn(async () => ({
      platformCode,
      currency: "TWD",
      totalAmount: 0,
      asOf: new Date().toISOString(),
    })),
  };
}

describe("C108: health、告警、通道與積壓可觀測性驗收", () => {
  function setupForwarderService(adapters: ForwarderAdapterInterface[] = []) {
    const auditNotificationService = new AuditNotificationService();
    const regulatoryRegistryService = {
      listDrivers: vi.fn(() => []),
      listLatestDriverLocations: vi.fn(() => []),
    };
    const ownedMobilityService = {
      cancelForwarderTasks: vi.fn(() => []),
      registerForwarderSource: vi.fn(),
      listDriverTasks: vi.fn(() => []),
      listOrders: vi.fn(() => []),
      listDispatchJobs: vi.fn(() => []),
    };
    const forwarderRepository = {
      loadState: vi.fn(async () => ({
        forwardedOrders: [],
        adapterHealth: [],
      })),
      persistChanges: vi.fn(async () => undefined),
    };

    const service = new ForwarderService(
      regulatoryRegistryService as never,
      auditNotificationService as never,
      adapters,
      forwarderRepository as never,
      ownedMobilityService as never,
    );

    return {
      service,
      auditNotificationService,
      regulatoryRegistryService,
      ownedMobilityService,
    };
  }

  it("1. 健康度查詢：列出註冊轉發器 adapter，正確反映 stub 與 production_ready 狀態", async () => {
    const liveAdapter = createMockAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    const stubAdapter = createStubAdapter("UBER_TAIWAN" as PlatformCode);

    const { service } = setupForwarderService([liveAdapter, stubAdapter]);
    await service.onModuleInit();

    const healthList = service.listAdapterHealth();
    expect(healthList).toHaveLength(2);

    const grabHealth = healthList.find(
      (h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE,
    );
    expect(grabHealth).toBeDefined();
    expect(grabHealth?.status).toBe("healthy");
    expect(grabHealth?.credentialStatus).toBe("valid");
    expect(grabHealth?.capabilitySummary.productionStatus).toBe(
      "production_ready",
    );

    const uberHealth = healthList.find(
      (h) => h.platformCode === ("UBER_TAIWAN" as PlatformCode),
    );
    expect(uberHealth).toBeDefined();
    expect(uberHealth?.status).toBe("healthy");
    expect(uberHealth?.reason).toBe("stub");
    expect(uberHealth?.credentialStatus).toBe("stub");
    expect(uberHealth?.capabilitySummary.productionStatus).toBe("stub");
  });

  it("2. 實際故障注入：透過 reportSyncFailure 注入 retryable 與 fatal 錯誤，驗證健康狀態降級與下線", async () => {
    const liveAdapter = createMockAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    const { service, auditNotificationService } = setupForwarderService([
      liveAdapter,
    ]);
    await service.onModuleInit();

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-fault-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    // 2.1 注入 retryable 故障 -> adapter 降級 (degraded)
    const retryableFailure: ReportForwarderSyncFailureCommand = {
      errorCode: "UPSTREAM_TIMEOUT",
      errorMessage: "Gateway timeout communicating with Grab backend",
      retryable: true,
      nativeStatus: "504_GATEWAY_TIMEOUT",
    };

    const failedOrder = service.reportSyncFailure(
      order.mirrorOrderId,
      retryableFailure,
      "req-c108-retryable-fault",
    );

    expect(failedOrder.status).toBe("sync_failed");
    expect(failedOrder.lastSyncError?.code).toBe("UPSTREAM_TIMEOUT");
    expect(failedOrder.lastSyncError?.retryable).toBe(true);
    expect(failedOrder.manualFallback.required).toBe(true);

    const degradedHealth = service
      .listAdapterHealth()
      .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
    expect(degradedHealth?.status).toBe("degraded");
    expect(degradedHealth?.lastError).toContain("UPSTREAM_TIMEOUT");

    // 驗證審計紀錄
    const syncFailureAudit = auditNotificationService
      .listAuditLogs()
      .find(
        (log) =>
          log.actionName === "mark_forwarder_sync_failed" &&
          log.resourceId === order.mirrorOrderId,
      );
    expect(syncFailureAudit).toBeDefined();
    expect(syncFailureAudit?.newValuesSummary?.errorCode).toBe(
      "UPSTREAM_TIMEOUT",
    );

    // 2.2 注入 non-retryable 故障 -> adapter 下線 (down)
    const fatalFailure: ReportForwarderSyncFailureCommand = {
      errorCode: "PLATFORM_REJECTED_UNRECOVERABLE",
      errorMessage: "Partner platform permanently rejected contract",
      retryable: false,
    };

    service.reportSyncFailure(
      order.mirrorOrderId,
      fatalFailure,
      "req-c108-fatal-fault",
    );

    const downHealth = service
      .listAdapterHealth()
      .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
    expect(downHealth?.status).toBe("down");
    expect(downHealth?.lastError).toContain("PLATFORM_REJECTED_UNRECOVERABLE");
  });

  it("3. 細緻錯誤訊號分類：區分 429 速率限制、Webhook 簽章失敗、授權失效與憑證過期", async () => {
    const liveAdapter = createMockAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    const { service } = setupForwarderService([liveAdapter]);
    await service.onModuleInit();

    const order = service.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-order-signal-001",
      payload: { serviceBucket: "standard_taxi" },
    });

    // 3.1 速率限制 (429)
    service.reportSyncFailure(order.mirrorOrderId, {
      errorCode: "RATE_LIMIT_EXCEEDED",
      errorMessage: "HTTP 429 rate limit reached on dispatch dispatch api",
      retryable: true,
    });
    let health = service
      .listAdapterHealth()
      .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
    expect(health?.reason).toBe("rate_limit");
    expect(health?.rateLimitStatus).toBe("limited");
    expect(health?.lastRateLimitAt).toBeDefined();

    // 3.2 Webhook 簽章失敗
    service.reportSyncFailure(order.mirrorOrderId, {
      errorCode: "WEBHOOK_SIGNATURE_INVALID",
      errorMessage: "webhook signature verification failed",
      retryable: true,
    });
    health = service
      .listAdapterHealth()
      .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
    expect(health?.reason).toBe("webhook");
    expect(health?.webhookStatus).toBe("failing");

    // 3.3 憑證過期 (credential expired)
    service.reportSyncFailure(order.mirrorOrderId, {
      errorCode: "CREDENTIAL_EXPIRED",
      errorMessage: "Client certificate expired for external partner secret",
      retryable: false,
    });
    health = service
      .listAdapterHealth()
      .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
    expect(health?.reason).toBe("credential");
    expect(health?.credentialStatus).toBe("expired");

    // 3.4 授權失效需重新認證 (401 / reauth)
    service.reportSyncFailure(order.mirrorOrderId, {
      errorCode: "AUTH_TOKEN_EXPIRED",
      errorMessage: "OAuth token 401 reauth required from upstream IDP",
      retryable: true,
    });
    health = service
      .listAdapterHealth()
      .find((h) => h.platformCode === GRAB_TAIWAN_PLATFORM_CODE);
    expect(health?.reason).toBe("auth");
    expect(health?.authStatus).toBe("reauth_required");
    expect(health?.lastAuthFailureAt).toBeDefined();
  });

  it("4. 可觀測性真值與積壓區分：明確區分 0 積壓與未知 (unknown) 狀態", async () => {
    const liveAdapter = createMockAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    const { service: forwarderService } = setupForwarderService([liveAdapter]);
    await forwarderService.onModuleInit();

    const callcenterService = {
      listCallSessions: vi.fn(() => []),
    };
    const regulatoryRegistryService = {
      listDrivers: vi.fn(() => []),
      listLatestDriverLocations: vi.fn(() => []),
    };
    const reportingFilingService = {
      listReportJobs: vi.fn(() => []),
    };
    const tenantPartnerService = {
      listPartnerEligibilityReviewQueue: vi.fn(() => []),
      summarizeWebhookDeliveryHealth: vi.fn(() => ({
        failedDeliveriesLastHour: 0,
        pendingDeliveries: 0,
      })),
    };
    const ownedMobilityService = {
      listOrders: vi.fn(() => []),
      listDispatchJobs: vi.fn(() => []),
    };

    const observabilityService = new OperationalObservabilityService(
      ownedMobilityService as never,
      callcenterService as never,
      regulatoryRegistryService as never,
      forwarderService as never,
      reportingFilingService as never,
      tenantPartnerService as never,
    );

    // 4.1 在無訂單或無積壓時，積壓指標明確回傳 0，而落後分鐘數為 null（非 0 分鐘落後）
    const snapshot = await observabilityService.getSnapshot();

    expect(snapshot.forwarderOps.totalForwardedOrders).toBe(0);
    expect(snapshot.forwarderOps.syncFailedOrders).toBe(0);
    expect(snapshot.forwarderOps.acceptPendingOrders).toBe(0);
    expect(snapshot.forwarderOps.manualFallbackQueue).toBe(0);
    expect(snapshot.forwarderOps.oldestSyncFailedLagMinutes).toBeNull();
    expect(snapshot.forwarderOps.oldestAcceptPendingLagMinutes).toBeNull();

    // 4.2 未配置或缺少外部數據源時，providerHealth.status 明確為 unknown，不誤標為 healthy
    expect(snapshot.mapGeofence.providerHealth.status).toBe("unknown");
    expect(snapshot.mapGeofence.providerHealth.quota.status).toBe("unknown");
  });

  it("5. 告警衍生與角色路由：轉發器故障觸發 adapter_degradation 告警，導向 ops 與 platform 角色", async () => {
    const liveAdapter = createMockAdapter(GRAB_TAIWAN_PLATFORM_CODE);
    const { service: forwarderService } = setupForwarderService([liveAdapter]);
    await forwarderService.onModuleInit();

    // 注入故障使其降級
    const order = forwarderService.ingestExternalOrder({
      platformCode: GRAB_TAIWAN_PLATFORM_CODE,
      externalOrderId: "grab-alert-test-001",
      payload: { serviceBucket: "standard_taxi" },
    });
    forwarderService.reportSyncFailure(order.mirrorOrderId, {
      errorCode: "DOWNSTREAM_503",
      errorMessage: "Service unavailable",
      retryable: true,
    });

    const callcenterService = { listCallSessions: vi.fn(() => []) };
    const regulatoryRegistryService = {
      listDrivers: vi.fn(() => []),
      listLatestDriverLocations: vi.fn(() => []),
    };
    const reportingFilingService = { listReportJobs: vi.fn(() => []) };
    const tenantPartnerService = {
      listPartnerEligibilityReviewQueue: vi.fn(() => []),
      summarizeWebhookDeliveryHealth: vi.fn(() => ({
        failedDeliveriesLastHour: 0,
        pendingDeliveries: 0,
      })),
    };
    const ownedMobilityService = {
      listOrders: vi.fn(() => []),
      listDispatchJobs: vi.fn(() => []),
    };

    const observabilityService = new OperationalObservabilityService(
      ownedMobilityService as never,
      callcenterService as never,
      regulatoryRegistryService as never,
      forwarderService as never,
      reportingFilingService as never,
      tenantPartnerService as never,
    );

    const snapshot = await observabilityService.getSnapshot();

    const adapterDegradationAlert = snapshot.alerts.find(
      (a) => a.key === "adapter_degradation",
    );
    expect(adapterDegradationAlert).toBeDefined();
    expect(adapterDegradationAlert?.state).toBe("warning");
    expect(adapterDegradationAlert?.measuredValue).toBe(1);
    expect(adapterDegradationAlert?.routes).toEqual(["ops", "platform"]);

    // 驗證 ops 角色視圖中包含該告警
    const opsView = snapshot.roleViews.find((r) => r.route === "ops");
    expect(opsView?.alertKeys).toContain("adapter_degradation");
  });
});
