import { describe, expect, it, vi } from "vitest";
import { PLATFORM_CODE_REGISTRY } from "@drts/contracts";

import { PlatformPresenceService } from "../../src/modules/platform-presence/platform-presence.service";

describe("PlatformPresenceService", () => {
  it("returns Traditional Chinese summary notes and adapter health status", async () => {
    const forwarderService = {
      listAdapterHealth: vi.fn(() => [
        {
          platformCode: "grab_taiwan",
          status: "degraded",
          reason: "credential_expiring",
          credentialStatus: "expiring",
          authStatus: "authenticated",
          webhookStatus: "healthy",
          rateLimitStatus: "ok",
          lastError: null,
          lastCheckedAt: "2026-05-08T05:00:00Z",
          capabilitySummary: {
            mode: "hybrid",
            productionStatus: "production_ready",
            supportsInboundWebhook: true,
            supportsOutboundActions: true,
            supportedWebhookEvents: ["forwarder.order.received"],
            notes: [],
          },
        },
      ]),
    };

    const service = new PlatformPresenceService(
      undefined,
      forwarderService as never,
    );

    await service.setOnline(
      "driver-001",
      "grab_taiwan",
      "2026-05-10T05:00:00Z",
    );

    const summary = await service.summary("driver-001");

    expect(summary.notes).toEqual([
      "平台狀態會優先使用資料庫同步；若目前環境未啟用資料庫，會改用目前執行個體的暫存資料。",
      "可使用 POST /api/platform-presence/online、/offline、/unbind 更新單一平台的綁定、上下線與重新驗證狀態。",
    ]);
    expect(summary.adapterStatuses).toHaveLength(
      Object.keys(PLATFORM_CODE_REGISTRY).length,
    );
    expect(summary.adapterStatuses).toContainEqual(
      expect.objectContaining({
        platformCode: "grab_taiwan",
        status: "degraded",
        blockingReason: "平台連線異常，接單可能延遲",
        lastSyncAt: "2026-05-08T05:00:00Z",
      }),
    );
    expect(summary.presences).toHaveLength(
      Object.keys(PLATFORM_CODE_REGISTRY).length,
    );
    expect(summary.presences).toContainEqual(
      expect.objectContaining({
        platformCode: "grab_taiwan",
        authMechanism: "external_browser_oauth",
        driverSelfServiceBinding: true,
        autoAcceptAllowed: false,
        availableActions: expect.arrayContaining([
          expect.objectContaining({
            action: "view_platform_presence",
            enabled: true,
          }),
          expect.objectContaining({
            action: "unbind_platform_account",
            enabled: false,
            disabledReasonCode: "adapter_down",
            requiresReason: true,
          }),
        ]),
      }),
    );
    expect(summary.presences).toContainEqual(
      expect.objectContaining({
        platformCode: "uber",
        status: "offline",
        accountId: null,
        authMechanism: "external_browser_oauth",
        driverSelfServiceBinding: true,
        availableActions: expect.arrayContaining([
          expect.objectContaining({
            action: "bind_platform_account",
            enabled: true,
            riskLevel: "medium",
          }),
        ]),
      }),
    );
  });

  it("clears account binding state on unbind while keeping offline toggle separate", async () => {
    const service = new PlatformPresenceService();

    await service.setOnline(
      "driver-001",
      "uber",
      "acct-001",
      "2026-06-10T05:00:00Z",
    );

    const offlineRecord = await service.setOffline("driver-001", "uber");
    expect(offlineRecord.accountId).toBe("acct-001");
    expect(offlineRecord.availableActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "unbind_platform_account" }),
      ]),
    );

    const unboundRecord = await service.unbind(
      "driver-001",
      "uber",
      "driver requested removal",
    );
    expect(unboundRecord.accountId).toBeNull();
    expect(unboundRecord.tokenExpiresAt).toBeNull();
    expect(unboundRecord.reauthRequired).toBe(false);
    expect(unboundRecord.availableActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "bind_platform_account" }),
      ]),
    );
    expect(unboundRecord.availableActions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "unbind_platform_account" }),
      ]),
    );
  });
});
