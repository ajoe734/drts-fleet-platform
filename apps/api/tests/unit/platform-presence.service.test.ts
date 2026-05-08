import { describe, expect, it, vi } from "vitest";

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
      "可使用 POST /api/platform-presence/online 或 /api/platform-presence/offline 更新單一平台的綁定、上下線與重新驗證狀態。",
    ]);
    expect(summary.adapterStatuses).toEqual([
      expect.objectContaining({
        platformCode: "grab_taiwan",
        status: "degraded",
        blockingReason: "平台連線異常，接單可能延遲",
        lastSyncAt: "2026-05-08T05:00:00Z",
      }),
    ]);
  });
});
