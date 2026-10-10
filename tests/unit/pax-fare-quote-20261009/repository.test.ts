import { describe, expect, it, vi } from "vitest";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import type { FareQuoteSnapshot } from "../../../apps/api/src/modules/passenger-app/fare/fare.types";
import { estimateFare } from "../../../apps/api/src/modules/passenger-app/fare/fare.engine";
import { ServiceAreaService } from "../../../apps/api/src/modules/service-area/service-area.service";
import { tariff } from "./fixture";

const at = "2026-10-10T00:00:00.000Z";
const row = {
  version: tariff.version,
  effective_at: new Date(tariff.effectiveAt),
  effective_until: null,
  base_fare: 85,
  base_distance_meters: 1250,
  distance_rate: 5,
  distance_increment_meters: 200,
  delay_rate: 5,
  delay_increment_seconds: 80,
  night_surcharge_bps: 2000,
  night_window_start: "23:00",
  night_window_end: "06:00",
  additional_fees: {},
  distance_rounding: "ceil",
  delay_rounding: "ceil",
  total_rounding: "ceil",
  total_increment: 1,
  night_application: "pickup",
  source_reference: tariff.sourceReference,
};

// Pool-only stub. Calls production repository SQL; does not emulate or certify PostgreSQL semantics.
function fixture(rows: object[] = []) {
  const query = vi
    .fn<
      (sql: string, values: readonly unknown[]) => Promise<{ rows: object[] }>
    >()
    .mockResolvedValue({ rows });
  return { query, repository: new PassengerFareRepository({ query } as never) };
}
function snapshot(): FareQuoteSnapshot {
  const origin = { lat: 25.04, lng: 121.55 },
    destination = { lat: 25.05, lng: 121.58 };
  const scheduledAt = "2026-10-11T04:00:00.000Z";
  const route = {
    provider: "unit-stub",
    distanceMeters: 3250,
    durationSeconds: 800,
    encodedPolyline: null,
    generatedAt: at,
  };
  return {
    ...estimateFare(tariff, { ...route, scheduledAt }),
    fareSnapshotId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    drtsPassengerId: "drts_passenger_unit",
    origin,
    destination,
    scheduledAt,
    route,
    tariffSnapshot: tariff,
    serviceAreaEvaluation: new ServiceAreaService().evaluate({
      serviceProductType: "taxi_reservation",
      pickup: origin,
      dropoff: destination,
      requestedAt: scheduledAt,
    }),
    createdAt: at,
    expiresAt: "2026-10-10T00:15:00.000Z",
  };
}

describe("production fare repository at the pool boundary; PG acceptance pending", () => {
  it("maps every tariff column and binds the effective timestamp with publication/half-open filters", async () => {
    const f = fixture([row]);
    expect(await f.repository.publishedTariff(at)).toEqual(tariff);
    const [sql, args] = f.query.mock.calls[0]!;
    expect(args).toEqual([at]);
    expect(sql).toContain(
      "status = 'published' AND effective_at <= $1::timestamptz",
    );
    expect(sql).toContain("effective_until > $1::timestamptz");
    expect(sql).toContain("LIMIT 2");
  });
  it("returns no tariff when none applies, and fails closed on ambiguity/corrupt rules", async () => {
    expect(await fixture().repository.publishedTariff(at)).toBeNull();
    await expect(
      fixture([row, row]).repository.publishedTariff(at),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      fixture([
        { ...row, distance_increment_meters: 0 },
      ]).repository.publishedTariff(at),
    ).rejects.toMatchObject({ code: "unavailable" });
    await expect(
      fixture([
        { ...row, additional_fees: { fee: -1 } },
      ]).repository.publishedTariff(at),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("writes the owned route/time/range/version and approved rules with sixteen bound parameters", async () => {
    const f = fixture(),
      s = snapshot();
    await f.repository.insertSnapshot(s);
    const [sql, args] = f.query.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO passenger.fare_quote_snapshots");
    expect(args).toEqual([
      s.fareSnapshotId,
      s.drtsPassengerId,
      s.fareVersion,
      s.origin.lat,
      s.origin.lng,
      s.destination.lat,
      s.destination.lng,
      s.scheduledAt,
      JSON.stringify(s.route),
      JSON.stringify(s.tariffSnapshot),
      JSON.stringify(s.breakdown),
      JSON.stringify(s.serviceAreaEvaluation),
      s.estimatedMin,
      s.estimatedMax,
      s.createdAt,
      s.expiresAt,
    ]);
    expect(sql).not.toContain(s.drtsPassengerId);
  });
  it("uses both snapshot and passenger identity for downstream booking reads; invalid/foreign IDs return null", async () => {
    const f = fixture();
    expect(
      await f.repository.findOwnedSnapshot("not-uuid", "passenger"),
    ).toBeNull();
    expect(f.query).not.toHaveBeenCalled();
    const s = snapshot();
    expect(
      await f.repository.findOwnedSnapshot(
        s.fareSnapshotId,
        "foreign-passenger",
      ),
    ).toBeNull();
    expect(f.query.mock.calls[0]?.[0]).toContain(
      "fare_snapshot_id = $1 AND drts_passenger_id = $2",
    );
    expect(f.query.mock.calls[0]?.[1]).toEqual([
      s.fareSnapshotId,
      "foreign-passenger",
    ]);
  });
  it("maps a persisted snapshot including pg bigint strings without losing owned route/rules", async () => {
    const s = snapshot();
    const r = {
      fare_snapshot_id: s.fareSnapshotId,
      drts_passenger_id: s.drtsPassengerId,
      fare_version: s.fareVersion,
      origin_lat: s.origin.lat,
      origin_lng: s.origin.lng,
      destination_lat: s.destination.lat,
      destination_lng: s.destination.lng,
      scheduled_at: new Date(s.scheduledAt),
      route: s.route,
      tariff_snapshot: s.tariffSnapshot,
      breakdown: s.breakdown,
      service_area_evaluation: s.serviceAreaEvaluation,
      estimated_min: String(s.estimatedMin),
      estimated_max: String(s.estimatedMax),
      created_at: new Date(s.createdAt),
      expires_at: new Date(s.expiresAt),
    };
    expect(
      await fixture([r]).repository.findOwnedSnapshot(
        s.fareSnapshotId,
        s.drtsPassengerId,
      ),
    ).toEqual(s);
  });
  it("storage outages fail unavailable, without an in-memory fallback", async () => {
    const f = fixture();
    f.query.mockRejectedValue(new Error("DATABASE_URL not configured"));
    await expect(f.repository.publishedTariff(at)).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(f.repository.insertSnapshot(snapshot())).rejects.toMatchObject(
      { code: "unavailable" },
    );
    await expect(
      f.repository.findOwnedSnapshot(snapshot().fareSnapshotId, "passenger"),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});
