import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import {
  hostedPaymentEnabled,
  PaymentPostgresHarness,
  accountSigningFixture,
} from "./payment-postgres-harness";

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA passenger fare quote production PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      await h.reset();
    }, 30000);
    afterEach(() => vi.unstubAllEnvs());
    afterAll(() => h.close(), 30000);
    function command(hour = 6, minute = 0) {
      const date = new Date(Date.now() + 2 * 86400000);
      date.setUTCHours(hour, minute, 0, 0);
      return {
        originLat: 25.08,
        originLng: 121.55,
        destinationLat: 25.1,
        destinationLng: 121.57,
        scheduledAt: date.toISOString(),
      };
    }
    const snapshots = () =>
      h
        .pool!.query(
          "SELECT * FROM passenger.fare_quote_snapshots ORDER BY fare_snapshot_id",
        )
        .then((r) => r.rows);
    async function fixture() {
      return {
        ...(await h.authenticatedAccount()),
        ...(await h.fareServices()),
      };
    }

    it("full formal seed is approved ordinary-day tariff and has no effective version before its start", async () => {
      const f = await fixture();
      const tariff = await f.repository.publishedTariff(
        new Date().toISOString(),
      );
      expect(tariff).toMatchObject({
        version: "taipei-20230401",
        baseFare: 85,
        baseDistanceMeters: 1250,
        distanceRate: 5,
        distanceIncrementMeters: 200,
        delayRate: 5,
        delayIncrementSeconds: 60,
        nightSurchargeAmount: 20,
        distanceRounding: "ceil",
        delayRounding: "floor",
        nightApplication: "pickup",
      });
      expect(
        await f.repository.publishedTariff("2023-03-31T15:59:59.000Z"),
      ).toBeNull();
      expect((await f.fares.fares()).currentVersion).toMatchObject({
        baseFare: 85,
        nightSurcharge: 20,
        nightSurchargeUnit: "TWD_per_trip",
      });
    });

    it.each([
      { distance: 1250, duration: 59, hour: 6, minute: 0, min: 85, max: 85 },
      { distance: 1251, duration: 60, hour: 6, minute: 0, min: 90, max: 95 },
      { distance: 1450, duration: 119, hour: 6, minute: 0, min: 90, max: 95 },
      { distance: 1451, duration: 120, hour: 6, minute: 0, min: 95, max: 105 },
      { distance: 1250, duration: 120, hour: 14, minute: 59, min: 85, max: 95 },
      { distance: 1250, duration: 59, hour: 15, minute: 0, min: 105, max: 105 },
      { distance: 1250, duration: 59, hour: 22, minute: 0, min: 85, max: 85 },
    ])(
      "actual account-to-Geo-to-persisted-area pipeline prices $distance m / $duration s at UTC $hour:$minute",
      async (input) => {
        const f = await fixture();
        f.geo.route.mockResolvedValueOnce({
          provider: "qa-captured-geo",
          distanceMeters: input.distance,
          durationSeconds: input.duration,
          encodedPolyline: "qa-polyline",
          generatedAt: new Date().toISOString(),
        });
        const body = command(input.hour, input.minute);
        const quote = await f.fares.quote(f.identity, body);
        if (quote.serviceAreaResult !== "serviceable")
          throw new Error(
            "Fixture endpoints were not covered by the real catalog.",
          );
        expect(quote).toMatchObject({
          serviceAreaResult: "serviceable",
          estimatedMin: input.min,
          estimatedMax: input.max,
          fareVersion: "taipei-20230401",
          isGuaranteed: false,
        });
        expect(f.geo.route).toHaveBeenCalledWith(
          expect.objectContaining({ requestedByActorId: f.owner }),
        );
        const row = (await snapshots())[0]!;
        expect(row.drts_passenger_id).toBe(f.owner);
        expect(row.route.distanceMeters).toBe(input.distance);
        expect(row.estimated_min).toBe(String(input.min));
        expect(row.estimated_max).toBe(String(input.max));
        expect(row.expires_at.getTime() - row.created_at.getTime()).toBe(
          900000,
        );
        expect(row.tariff_snapshot.baseFare).toBe(85);
        expect(
          row.service_area_evaluation.stops.every(
            (stop: { serviceAreaCodes: string[] }) =>
              stop.serviceAreaCodes.includes("TAIPEI_CORE"),
          ),
        ).toBe(true);
        const restart = new PassengerFareRepository(h.peerDatabase());
        expect(
          await restart.findOwnedSnapshot(quote.fareSnapshotId!, f.owner),
        ).toMatchObject({
          fareSnapshotId: quote.fareSnapshotId,
          estimatedMin: input.min,
          estimatedMax: input.max,
          route: row.route,
        });
        expect(
          await restart.findOwnedSnapshot(
            quote.fareSnapshotId!,
            await h.account(),
          ),
        ).toBeNull();
        expect(
          await restart.findOwnedSnapshot(randomUUID(), f.owner),
        ).toBeNull();
      },
    );

    it.each([
      {
        point: { originLat: 0, originLng: 0 },
        reason: "outside every active default",
      },
      {
        point: { originLat: 25.0478, originLng: 121.517 },
        reason: "persisted pickup deny policy",
      },
      {
        point: { originLat: 25.0338, originLng: 121.5645 },
        reason: "persisted manual-review policy",
      },
    ])(
      "$reason returns genuine not-serviceable without route IO or quote writes",
      async ({ point }) => {
        const f = await fixture();
        const result = await f.fares.quote(f.identity, {
          ...command(),
          ...point,
        });
        expect(result.serviceAreaResult).toBe("not_serviceable");
        expect(f.geo.route).not.toHaveBeenCalled();
        expect(await snapshots()).toHaveLength(0);
        expect(
          (await f.areaRepository.loadState()).serviceAreas.length,
        ).toBeGreaterThan(0);
        expect(
          (await f.areaRepository.loadState()).stopPolicies.length,
        ).toBeGreaterThan(0);
      },
    );

    it("revoked, missing and suspended account authority cannot produce a persisted quote", async () => {
      const f = await fixture();
      await h.accounts.logout(f.session.refreshToken);
      await expect(f.fares.quote(f.identity, command())).rejects.toMatchObject({
        code: "unauthorized",
      });
      const active = await h.authenticatedAccount();
      await h.pool!.query(
        "UPDATE passenger.accounts SET status='suspended' WHERE drts_passenger_id=$1",
        [active.owner],
      );
      await expect(
        f.fares.quote(active.identity, command()),
      ).rejects.toMatchObject({ code: "unauthorized" });
      await expect(f.fares.quote(null, command())).rejects.toMatchObject({
        code: "unauthorized",
      });
      expect(await snapshots()).toHaveLength(0);
    });

    it("unavailable route metrics and a real snapshot constraint failure leave no fabricated quote", async () => {
      const f = await fixture();
      f.geo.route.mockResolvedValueOnce({
        provider: "qa-captured-geo",
        distanceMeters: -1,
        durationSeconds: 60,
        encodedPolyline: "qa",
        generatedAt: new Date().toISOString(),
      });
      await expect(f.fares.quote(f.identity, command())).rejects.toMatchObject({
        code: "unavailable",
      });
      expect(await snapshots()).toHaveLength(0);
      await h.pool!.query(
        "ALTER TABLE passenger.fare_quote_snapshots ADD CONSTRAINT qa_quote_failure CHECK(false) NOT VALID",
      );
      await expect(f.fares.quote(f.identity, command())).rejects.toMatchObject({
        code: "unavailable",
      });
      expect(await snapshots()).toHaveLength(0);
    });

    it("captured quote bytes remain unchanged when a later publication fixture changes future selection", async () => {
      const f = await fixture();
      await f.fares.quote(f.identity, command());
      const before = await snapshots();
      const tariff = (await f.repository.publishedTariff(
        command().scheduledAt,
      ))!;
      const effective = new Date(Date.now() + 86400000).toISOString();
      await h.pool!.query(
        "UPDATE passenger.fare_versions SET effective_until=$1 WHERE version=$2",
        [effective, tariff.version],
      );
      // Captured publication boundary fixture; no filing/management acceptance.
      await h.pool!.query(
        `INSERT INTO passenger.fare_versions
      (version,status,effective_at,base_fare,base_distance_meters,distance_rate,distance_increment_meters,delay_rate,delay_increment_seconds,night_surcharge_amount,night_window_start,night_window_end,additional_fees,distance_rounding,delay_rounding,total_rounding,total_increment,night_application,source_reference)
      VALUES ('qa-captured-later-version','published',$1,90,1250,5,200,5,60,20,'23:00','06:00','{}','ceil','floor','floor',5,'pickup','QA publication fixture; no real approval')`,
        [effective],
      );
      expect(
        (await f.repository.publishedTariff(command().scheduledAt))!.version,
      ).toBe("qa-captured-later-version");
      expect(await snapshots()).toEqual(before);
      expect(
        (await f.repository.findOwnedSnapshot(
          before[0]!.fare_snapshot_id,
          f.owner,
        ))!.tariffSnapshot.baseFare,
      ).toBe(85);
    });

    it("booking rejects an actually expired owned snapshot before creating an order", async () => {
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      const f = await fixture();
      const body = command();
      const result = await f.fares.quote(f.identity, body);
      if (result.serviceAreaResult !== "serviceable")
        throw new Error("Fixture quote was not serviceable.");
      const captured = (await f.repository.findOwnedSnapshot(
        result.fareSnapshotId!,
        f.owner,
      ))!;
      const expiredId = randomUUID();
      await f.repository.insertSnapshot({
        ...captured,
        fareSnapshotId: expiredId,
        createdAt: new Date(Date.now() - 960000).toISOString(),
        expiresAt: new Date(Date.now() - 60000).toISOString(),
      });
      await h.accounts.updateMe(f.identity, { contactPhone: "0900000000" });
      const services = await h.receiptServices();
      await expect(
        services.booking.createRide(f.owner, {
          origin: { lat: body.originLat, lng: body.originLng },
          destination: { lat: body.destinationLat, lng: body.destinationLng },
          fareSnapshotId: expiredId,
          scheduledAt: body.scheduledAt,
          passengerConfirmedAt: new Date().toISOString(),
          paymentMethodId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "FARE_QUOTE_EXPIRED" });
      expect(
        (await h.pool!.query("SELECT * FROM passenger.booking_histories")).rows,
      ).toHaveLength(0);
    });
  },
);
