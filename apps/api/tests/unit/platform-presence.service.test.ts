import { describe, expect, it, vi } from "vitest";

import { PlatformPresenceService } from "../../src/modules/platform-presence/platform-presence.service";

describe("PlatformPresenceService", () => {
  it("returns no developer notes and reports adapter health status", async () => {
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

    // The driver app shows this summary; no storage or endpoint notes.
    expect(summary.notes).toEqual([]);
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
