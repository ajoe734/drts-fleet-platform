// SR-QA-DISPATCH-001 -- C041 (multi-platform driver presence / busy state
// and recovery to assignable status) acceptance regression.
//
// The `PlatformPresenceService` module (apps/api/src/modules/platform-presence)
// correctly tracks per-platform online/offline status. This file verifies
// that real behavior (positive case), then demonstrates -- with real code,
// not a fabricated example -- that `OwnedMobilityService`'s dispatch
// candidate eligibility never consults platform-presence state at all
// (negative/gap case), matching the capability audit note verbatim:
//   C041: "presence、driver page 與 platform earnings 模組已有" (module
//   exists) / gap: "他平臺接單、斷線與過期 heartbeat 不會重複派車" (accepting
//   on another platform, disconnects, and expired heartbeats must not cause
//   double dispatch).
// Per the task brief, this is reported as a genuine product gap (tracked as
// a canonical follow-up subtask) rather than patched inside this
// verification-only task's write_scopes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PlatformPresenceService } from "../../../../apps/api/src/modules/platform-presence/platform-presence.service";
import { buildOwnedMobilityServiceForTest } from "./test-support";

describe("SR-QA-DISPATCH-001 / C041: platform presence online/offline tracking", () => {
  it("Positive: setOnline/setOffline persists independent status per platform for the same driver", async () => {
    const service = new PlatformPresenceService();

    await service.setOnline("driver-1", "uber" as never);
    await service.setOnline("driver-1", "line-taxi" as never);
    await service.setOffline("driver-1", "uber" as never);

    const statuses = await service.listForDriver("driver-1");
    const byPlatform = new Map(statuses.map((s) => [s.platformCode, s.status]));
    expect(byPlatform.get("uber")).toBe("offline");
    expect(byPlatform.get("line-taxi")).toBe("online");
  });

  it("Positive: read-back via summary() reflects the same persisted per-platform state (write-then-read)", async () => {
    const service = new PlatformPresenceService();
    await service.setOnline("driver-2", "uber" as never);

    const summary = await service.summary("driver-2");
    expect(summary.driverId).toBe("driver-2");
    expect(
      summary.presences.find((p) => p.platformCode === "uber")?.status,
    ).toBe("online");
  });

  it("Negative: token nearing expiry (<72h) is flagged reauthRequired; a token far from expiry is not", async () => {
    const service = new PlatformPresenceService();
    const soon = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1h
    const far = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(); // 30d

    const soonRecord = await service.setOnline(
      "driver-3",
      "uber" as never,
      soon,
    );
    const farRecord = await service.setOnline("driver-4", "uber" as never, far);

    expect(soonRecord.reauthRequired).toBe(true);
    expect(farRecord.reauthRequired).toBe(false);
  });
});

describe("SR-QA-DISPATCH-001 / C041: multi-platform busy state is NOT wired into dispatch eligibility (gap regression)", () => {
  it("Demonstrates: a driver marked offline on every platform still appears as an eligible dispatch candidate", async () => {
    const presence = new PlatformPresenceService();
    await presence.setOffline("driver-busy-elsewhere", "uber" as never);
    await presence.setOffline("driver-busy-elsewhere", "line-taxi" as never);

    const allOffline = (
      await presence.listForDriver("driver-busy-elsewhere")
    ).every((record) => record.status === "offline");
    expect(allOffline).toBe(true);

    // The owned-mobility candidate source is the regulatory registry alone;
    // it has no dependency on `PlatformPresenceService` and therefore cannot
    // see -- let alone react to -- the offline state just proven above.
    const { service } = buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-busy-elsewhere",
          vehicleId: "vehicle-busy-elsewhere",
          etaMinutes: 5,
          operatingArea: "taipei",
          serviceBuckets: ["standard_taxi"],
        },
      ],
    });
    const order = await service.createPassengerOrder({
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Taipei 101" },
      passenger: { name: "SR-QA-DISPATCH-001", phone: "0912345678" },
    } as never);
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const job = service
      .listDispatchJobs()
      .find((j) => j.orderId === order.orderId)!;

    const candidates = await service.listDispatchCandidates(job.dispatchJobId);
    // This is the gap: production dispatch has no mechanism today that
    // would exclude "driver-busy-elsewhere" here even though presence
    // tracking independently reports them offline on every platform.
    expect(candidates.some((c) => c.driverId === "driver-busy-elsewhere")).toBe(
      true,
    );
  });

  it("Structural: owned-mobility.service.ts has zero references to platform-presence", () => {
    const source = readFileSync(
      new URL(
        "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service.ts",
        import.meta.url,
      ),
      "utf8",
    );
    // Intentional tripwire: if this starts failing because the dispatch
    // eligibility path now consults platform presence, C041's gap in
    // docs/04-uat/system-remediation-20260906/SR-QA-DISPATCH-001.md should
    // be marked resolved, not silently accepted by loosening this test.
    expect(/platform[-_]?presence/i.test(source)).toBe(false);
  });
});
