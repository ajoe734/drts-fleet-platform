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

describe("PlatformPresenceService.findDispatchBlockingPresence", () => {
  const now = new Date("2026-11-26T12:00:00.000Z");
  const stale = "2026-11-26T11:00:00.000Z";

  // Nothing in the product writes accountId today; a bound account is set
  // here directly on the in-memory record, as a real binding would be.
  async function bindAccount(
    service: PlatformPresenceService,
    driverId: string,
    platformCode: string,
  ) {
    const record = (await service.listForDriver(driverId)).find(
      (entry) => entry.platformCode === platformCode,
    )!;
    record.accountId = `${platformCode}-account`;
    return record;
  }

  it("does not block fleet dispatch on rows without a bound account", async () => {
    // Rows the driver app's old bind form and on/off toggles left behind.
    const service = new PlatformPresenceService();
    await service.setOffline("driver-offline", "uber");
    expect(
      await service.findDispatchBlockingPresence("driver-offline", now),
    ).toBeNull();

    await service.setOnline("driver-stale", "uber");
    (await service.listForDriver("driver-stale"))[0]!.lastHeartbeatAt = stale;
    await service.setOffline("driver-stale", "line-taxi");
    expect(
      await service.findDispatchBlockingPresence("driver-stale", now),
    ).toBeNull();
  });

  it("still blocks on a bound account that is offline or has gone stale", async () => {
    const service = new PlatformPresenceService();
    await service.setOnline("driver-bound", "uber");
    const record = await bindAccount(service, "driver-bound", "uber");
    record.lastHeartbeatAt = stale;
    // An unbound row next to it neither blocks nor unblocks.
    await service.setOffline("driver-bound", "line-taxi");
    expect(
      await service.findDispatchBlockingPresence("driver-bound", now),
    ).toEqual({ platformCode: "uber", reason: "heartbeat_expired" });

    await service.setOffline("driver-bound", "uber");
    expect(
      await service.findDispatchBlockingPresence("driver-bound", now),
    ).toEqual({ platformCode: "uber", reason: "offline" });

    // Going back online keeps the account and a fresh heartbeat.
    await service.setOnline("driver-bound", "uber");
    expect(
      await service.findDispatchBlockingPresence("driver-bound", new Date()),
    ).toBeNull();
  });

  it("still blocks while the driver is reported busy on another platform", async () => {
    const service = new PlatformPresenceService();
    await service.setBusy("driver-busy", "uber");
    expect(
      await service.findDispatchBlockingPresence("driver-busy", now),
    ).toEqual({ platformCode: "uber", reason: "busy" });
  });
});
