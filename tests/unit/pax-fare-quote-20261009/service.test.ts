import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassengerFareController } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.controller";
import { PassengerFareService } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.service";
import type { FareQuoteSnapshot } from "../../../apps/api/src/modules/passenger-app/fare/fare.types";
import { PassengerAccountService } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.service";
import { PassengerJwtService } from "../../../apps/api/src/common/auth/passenger-jwt.service";
import { GeoService } from "../../../apps/api/src/modules/geo/geo.service";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import { MemoryPassengerStore } from "../pax-account-session-20261009/memory-store";
import { publishedTariff, tariff } from "./fixture";

const now = "2026-10-10T00:00:00.000Z";
const body = {
  originLat: 25.04,
  originLng: 121.55,
  destinationLat: 25.05,
  destinationLng: 121.58,
  scheduledAt: "2026-10-11T04:00:00.000Z",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  vi.stubEnv("JWT_SECRET", "unit-only-passenger-fare-key");
  vi.stubEnv("JWT_PRIVATE_KEY", "");
  vi.stubEnv("JWT_PUBLIC_KEY", "");
  vi.stubEnv("JWT_KEY_RING_JSON", "");
  vi.stubEnv("JWT_ALGORITHM", "HS256");
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  vi.stubEnv("APP_ENV", "test");
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("GEO_PROVIDER_MODE", "mock");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function fixture(areas = new ServiceAreaService()) {
  const accountStore = new MemoryPassengerStore();
  const accounts = new PassengerAccountService(
    accountStore,
    new PassengerJwtService(),
  );
  const account = await accounts.findOrCreateByIdentity(
    "google",
    "fare-unit-subject",
  );
  const session = await accounts.issueSession(account.drtsPassengerId);
  const identity = await accounts.authenticateAccessToken(session.accessToken);
  const snapshots: FareQuoteSnapshot[] = [];
  // Only storage and the external geo provider are mocked; engine, account/session,
  // route normalization, area evaluation and controller envelopes execute production code.
  const store = {
    publishedTariff: vi.fn(async () => structuredClone(tariff)),
    insertSnapshot: vi.fn(async (s: FareQuoteSnapshot) => {
      snapshots.push(structuredClone(s));
    }),
    findOwnedSnapshot: vi.fn(async () => null),
  };
  const provider = {
    route: vi.fn(async () => ({
      provider: "unit-stub",
      distanceMeters: 3250,
      durationSeconds: 800,
      encodedPolyline: "unit-polyline",
      generatedAt: now,
    })),
  };
  const service = new PassengerFareService(
    store,
    accounts,
    new GeoService(provider as never),
    areas,
  );
  return {
    accounts,
    accountStore,
    areas,
    account,
    session,
    identity,
    store,
    provider,
    service,
    controller: new PassengerFareController(service),
    snapshots,
  };
}

describe("production quote and public fares flow (external/storage boundaries stubbed)", () => {
  it("creates an owned route/time/version snapshot with fifteen-minute expiry and a range", async () => {
    const f = await fixture();
    const response = await f.controller.estimateQuote(
      f.identity,
      body,
      "fare-request-id",
    );
    expect(response).toMatchObject({
      meta: { requestId: "fare-request-id" },
      data: {
        serviceAreaResult: "serviceable",
        estimatedMin: 135,
        estimatedMax: 205,
        fareVersion: tariff.version,
        expiresAt: "2026-10-10T00:15:00.000Z",
        isGuaranteed: false,
        route: { distanceMeters: 3250, durationSeconds: 800 },
        serviceAreaEvaluation: { decision: "serviceable" },
      },
    });
    expect(f.store.publishedTariff).toHaveBeenCalledWith(body.scheduledAt);
    expect(f.provider.route).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: { lat: 25.04, lng: 121.55 },
        destination: { lat: 25.05, lng: 121.58 },
        requestedByActorId: f.account.drtsPassengerId,
      }),
    );
    expect(f.snapshots).toHaveLength(1);
    expect(f.snapshots[0]).toMatchObject({
      drtsPassengerId: f.account.drtsPassengerId,
      scheduledAt: body.scheduledAt,
      tariffSnapshot: tariff,
      createdAt: now,
      expiresAt: "2026-10-10T00:15:00.000Z",
    });
    expect(f.snapshots[0]!.fareSnapshotId).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.data).not.toHaveProperty("drtsPassengerId");
  });
  it("supports the canonical snake_case wire keys and normalizes equivalent timestamp offsets", async () => {
    const f = await fixture();
    const result = await f.service.quote(f.identity, {
      origin_lat: 25.04,
      origin_lng: 121.55,
      destination_lat: 25.05,
      destination_lng: 121.58,
      scheduled_at: "2026-10-11T12:00:00+08:00",
    });
    expect(result.serviceAreaResult).toBe("serviceable");
    expect(f.snapshots[0]?.scheduledAt).toBe(body.scheduledAt);
  });
  it.each([
    { originLat: 24.1, originLng: 120.8 },
    { destinationLat: 24.1, destinationLng: 120.8 },
    { originLat: 25.0478, originLng: 121.517 },
    { originLat: 25.0338, originLng: 121.5645 },
  ])(
    "rejects outside coverage, deny and manual-review stops without route calls or snapshots: %j",
    async (point) => {
      const f = await fixture();
      expect(
        await f.service.quote(f.identity, { ...body, ...point }),
      ).toMatchObject({
        serviceAreaResult: "not_serviceable",
        isGuaranteed: false,
      });
      expect(f.provider.route).not.toHaveBeenCalled();
      expect(f.store.publishedTariff).not.toHaveBeenCalled();
      expect(f.store.insertSnapshot).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    [],
    {},
    { ...body, originLat: "25.04" },
    { ...body, originLng: null },
    { ...body, destinationLat: 91 },
    { ...body, destinationLng: -181 },
    { ...body, originLat: NaN },
    { ...body, scheduledAt: now },
    { ...body, scheduledAt: "2026-10-11" },
    { ...body, scheduledAt: "invalid" },
    { ...body, scheduledAt: "2027-02-30T12:00:00Z" },
    { ...body, scheduledAt: "2027-10-11T24:00:00Z" },
    { ...body, drtsPassengerId: "other" },
    { ...body, origin_lat: 25.04 },
    { ...body, estimatedMin: 1 },
  ])(
    "rejects malformed, ambiguous, past or caller-supplied authority input: %j",
    async (command) => {
      const f = await fixture();
      await expect(f.service.quote(f.identity, command)).rejects.toMatchObject({
        code: "validation_error",
      });
      expect(f.store.insertSnapshot).not.toHaveBeenCalled();
      expect(f.provider.route).not.toHaveBeenCalled();
    },
  );
  it("requires the actual live passenger account/session and rejects logout", async () => {
    const f = await fixture();
    await expect(f.service.quote(null, body)).rejects.toMatchObject({
      code: "unauthorized",
    });
    await expect(
      f.service.quote({ ...f.identity!, realm: "tenant" } as never, body),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await f.accounts.logout(f.session.refreshToken);
    await expect(f.service.quote(f.identity, body)).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
  });
  it("rejects suspended accounts using the live account authority", async () => {
    const f = await fixture();
    f.accountStore.accounts.get(f.account.drtsPassengerId)!.status =
      "suspended";
    await expect(f.service.quote(f.identity, body)).rejects.toMatchObject({
      code: "unauthorized",
    });
    expect(f.provider.route).not.toHaveBeenCalled();
  });
  it("requires affirmative coverage even when the shared evaluator has no active reservation areas", async () => {
    // Stub only persisted catalogue loading, then run the real evaluator. Avoid
    // retiring shared seed objects, which would contaminate subsequent tests.
    const persisted = new ServiceAreaService()
      .listServiceAreas()
      .map((area) => ({ ...area, status: "retired", effectiveUntil: now }));
    const areas = new ServiceAreaService({
      loadState: async () => ({ serviceAreas: persisted, stopPolicies: [] }),
    } as never);
    await areas.onModuleInit();
    const f = await fixture(areas);
    const result = await f.service.quote(f.identity, body);
    expect(result).toMatchObject({
      serviceAreaResult: "not_serviceable",
      serviceAreaEvaluation: {
        decision: "not_serviceable",
        reasonCodes: expect.arrayContaining(["SERVICE_AREA_COVERAGE_REQUIRED"]),
      },
    });
    expect(f.provider.route).not.toHaveBeenCalled();
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
  });
  it("returns only the public effective version with a fixed per-trip TWD night fee", async () => {
    const f = await fixture();
    expect((await f.controller.fares()).data).toEqual({
      currentVersion: {
        version: tariff.version,
        effectiveAt: tariff.effectiveAt,
        baseFare: 85,
        baseDistanceMeters: 1250,
        distanceRate: 5,
        distanceIncrementMeters: 200,
        delayRate: 5,
        delayIncrementSeconds: 60,
        nightSurcharge: 20,
        nightSurchargeUnit: "TWD_per_trip",
        nightApplication: "pickup",
        nightSurchargeWindowStart: "23:00",
        nightSurchargeWindowEnd: "06:00",
        additionalFees: {},
      },
    });
    expect(f.store.publishedTariff).toHaveBeenCalledWith(now);
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
  });
  it("quotes published ordinary-day rules and snapshots the fixed fee across both pickup boundaries", async () => {
    const f = await fixture();
    f.store.publishedTariff.mockResolvedValue(structuredClone(publishedTariff));
    const fares = (await f.controller.fares()).data;
    expect(fares.currentVersion).toMatchObject({
      version: "taipei-20230401",
      effectiveAt: "2023-03-31T16:00:00.000Z",
      delayIncrementSeconds: 60,
      nightSurcharge: 20,
      nightSurchargeUnit: "TWD_per_trip",
    });
    for (const [scheduledAt, min, max, fee] of [
      ["2026-10-11T14:59:00Z", 135, 200, 0],
      ["2026-10-11T15:00:00Z", 155, 220, 20],
      ["2026-10-11T21:59:00Z", 155, 220, 20],
      ["2026-10-11T22:00:00Z", 135, 200, 0],
    ] as const) {
      const result = await f.controller.estimateQuote(f.identity, {
        ...body,
        scheduledAt,
      });
      expect(result.data).toMatchObject({
        estimatedMin: min,
        estimatedMax: max,
        fareVersion: publishedTariff.version,
        isGuaranteed: false,
        breakdown: { nightSurchargeAmount: fee, additionalFees: {} },
      });
      expect(f.snapshots.at(-1)).toMatchObject({
        estimatedMin: min,
        estimatedMax: max,
        scheduledAt: new Date(scheduledAt).toISOString(),
        tariffSnapshot: { nightSurchargeAmount: 20, delayIncrementSeconds: 60 },
        breakdown: { nightSurchargeAmount: fee },
      });
    }
  });
  it("fails unavailable without a finalized effective tariff, for both public fares and quotes", async () => {
    const f = await fixture();
    f.store.publishedTariff.mockResolvedValue(null as never);
    await expect(f.service.fares()).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(f.service.quote(f.identity, body)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(f.provider.route).not.toHaveBeenCalled();
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
  });
  it("never returns a quote after route or storage failure", async () => {
    const f = await fixture();
    f.provider.route.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(f.service.quote(f.identity, body)).rejects.toThrow();
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
    f.store.insertSnapshot.mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    await expect(f.service.quote(f.identity, body)).rejects.toThrow(
      "storage unavailable",
    );
    expect(f.snapshots).toHaveLength(0);
  });
  it("rejects invalid provider metrics without persisting a quote", async () => {
    const f = await fixture();
    f.provider.route.mockResolvedValueOnce({
      provider: "unit-stub",
      distanceMeters: -1,
      durationSeconds: 800,
      encodedPolyline: "unit-polyline",
      generatedAt: now,
    });
    await expect(f.service.quote(f.identity, body)).rejects.toMatchObject({
      code: "unavailable",
    });
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
  });
  it("does not persist a reservation that becomes past while awaiting the route", async () => {
    const f = await fixture();
    f.provider.route.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date(body.scheduledAt));
      return {
        provider: "unit-stub",
        distanceMeters: 3250,
        durationSeconds: 800,
        encodedPolyline: null as never,
        generatedAt: now,
      };
    });
    await expect(f.service.quote(f.identity, body)).rejects.toMatchObject({
      code: "validation_error",
    });
    expect(f.store.insertSnapshot).not.toHaveBeenCalled();
  });
});
