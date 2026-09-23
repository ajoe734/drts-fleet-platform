import { afterEach, describe, expect, it, vi } from "vitest";

import { ServiceAreaService } from "../../../../apps/api/src/modules/service-area/service-area.service";

describe("C106: retiring a boundary in the same instant it became effective", () => {
  const context = {
    actorId: "geo_admin_01",
    actorType: "platform_admin" as const,
    reason: "same-instant retirement regression",
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not reject the retirement when effectiveFrom and now coincide", async () => {
    // Freeze the clock so create, publish and retire share one millisecond --
    // the case a fast CI runner produced by accident and failed on.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00.000Z"));
    const service = new ServiceAreaService();

    const { record: draft } = await service.createServiceArea(
      {
        areaCode: "same_instant",
        displayName: "Same-instant retirement",
        geometry: {
          type: "circle",
          center: { lat: 25.026, lng: 121.543 },
          radiusMeters: 500,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      context,
    );
    const { record: active } = await service.publishServiceArea(
      draft.serviceAreaId,
      {},
      context,
    );
    expect(active.effectiveFrom).toBe("2026-09-22T00:00:00.000Z");

    const { record: retired } = await service.retireServiceArea(
      active.serviceAreaId,
      {},
      context,
    );

    expect(retired.status).toBe("retired");
    expect(retired.effectiveUntil).toBe("2026-09-22T00:00:00.001Z");
  });

  it("still uses the real clock once time has moved on", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T00:00:00.000Z"));
    const service = new ServiceAreaService();
    const { record: draft } = await service.createServiceArea(
      {
        areaCode: "later_retirement",
        displayName: "Later retirement",
        geometry: {
          type: "circle",
          center: { lat: 25.03, lng: 121.55 },
          radiusMeters: 500,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      context,
    );
    const { record: active } = await service.publishServiceArea(
      draft.serviceAreaId,
      {},
      context,
    );
    vi.setSystemTime(new Date("2026-09-22T01:00:00.000Z"));

    const { record: retired } = await service.retireServiceArea(
      active.serviceAreaId,
      {},
      context,
    );

    expect(retired.effectiveUntil).toBe("2026-09-22T01:00:00.000Z");
  });

  it("still rejects an explicit end before the start", async () => {
    const service = new ServiceAreaService();
    const { record: draft } = await service.createServiceArea(
      {
        areaCode: "explicit_bad_end",
        displayName: "Explicit bad end",
        geometry: {
          type: "circle",
          center: { lat: 25.04, lng: 121.56 },
          radiusMeters: 500,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      context,
    );
    const { record: active } = await service.publishServiceArea(
      draft.serviceAreaId,
      {},
      context,
    );

    await expect(
      service.retireServiceArea(
        active.serviceAreaId,
        { effectiveUntil: "2000-01-01T00:00:00.000Z" },
        context,
      ),
    ).rejects.toMatchObject({ code: "INVALID_EFFECTIVE_WINDOW" });
  });
});
