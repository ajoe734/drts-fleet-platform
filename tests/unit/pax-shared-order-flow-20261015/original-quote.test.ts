import { afterEach, expect, it, vi } from "vitest";
import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DriverRatingSummary,
  OwnedOrderRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
  QUOTE_ID,
} from "../pax-booking-history-20261009/production-booking-fixture";

afterEach(() => vi.useRealTimers());

async function assignmentDisclosure(
  f: ReturnType<typeof createProductionBookingFixture>,
  order: OwnedOrderRecord,
) {
  // Only registry and SQL response ports are synthetic. Invoke the production
  // assignment disclosure builder, including its original-quote repository read.
  // Full dispatch/assignment transactions are covered by the hosted companion.
  const registry = {
    getVehiclePassengerDisclosureProfile: () => ({ status: "complete" }),
    getDriverPublicRegistrationCredential: () => ({
      status: "verified_active",
      effectiveUntil: "2027-01-01T00:00:00Z",
    }),
    listVehicles: () => [{ vehicleId: "unit-vehicle" }],
    listDrivers: () => [{ driverId: "unit-driver" }],
  };
  const owned = new OwnedMobilityService(
    registry as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    new OwnedMobilityRepository(
      f.database,
      new MultiTaxiRepository(f.database),
    ),
  );
  const builder = owned as unknown as {
    buildPassengerAssignmentAuthority(
      order: OwnedOrderRecord,
      job: DispatchJobRecord,
      assignment: DispatchAssignmentRecord,
      vehicleId: string,
      driverId: string,
      now: string,
      rating: DriverRatingSummary,
    ): Promise<{
      passengerDisclosureSnapshot: PassengerDispatchDisclosureSnapshot;
    }>;
  };
  return (
    await builder.buildPassengerAssignmentAuthority(
      order,
      { dispatchJobId: "unit-dispatch" } as DispatchJobRecord,
      { assignmentId: "unit-assignment" } as DispatchAssignmentRecord,
      "unit-vehicle",
      "unit-driver",
      new Date(NOW).toISOString(),
      {
        displayState: "new_driver",
        averageRating: null,
        ratingCount: 0,
      } as DriverRatingSummary,
    )
  ).passengerDisclosureSnapshot;
}

it("booking authority retains the server-owned original estimate, route, tariff and E19b confirmation instead of a new quote", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = createProductionBookingFixture();
  const query = f.database.query.bind(f.database);
  vi.spyOn(f.database, "query").mockImplementation(async (sql, values) => {
    const s = f.snapshot;
    if (
      sql.includes("FROM passenger.booking_histories") &&
      sql.includes("fare_snapshot_id")
    ) {
      return {
        rows: f.state.history
          ? [
              {
                fare_snapshot_id: QUOTE_ID,
                drts_passenger_id: OWNER,
                passenger_confirmed_at: f.command.passengerConfirmedAt,
              },
            ]
          : [],
        rowCount: 1,
      } as never;
    }
    if (sql.includes("FROM passenger.fare_quote_snapshots")) {
      return {
        rows: [
          {
            fare_snapshot_id: QUOTE_ID,
            drts_passenger_id: OWNER,
            fare_version: s.fareVersion,
            origin_lat: s.origin.lat,
            origin_lng: s.origin.lng,
            destination_lat: s.destination.lat,
            destination_lng: s.destination.lng,
            scheduled_at: s.scheduledAt,
            route: s.route,
            tariff_snapshot: s.tariffSnapshot,
            breakdown: s.breakdown,
            estimated_min: s.estimatedMin,
            estimated_max: s.estimatedMax,
            created_at: s.createdAt,
            expires_at: s.expiresAt,
          },
        ],
        rowCount: 1,
      } as never;
    }
    return query(sql, values);
  });
  const created = await f.service.createRide(OWNER, {
    ...f.command,
    // Extra browser properties never become pricing authority.
    estimatedMin: 1,
    estimatedMax: 1,
  } as typeof f.command);
  expect(created.ride).toHaveProperty("bookingQuote", {
    fareSnapshotId: QUOTE_ID,
    fareVersion: f.snapshot.fareVersion,
    estimatedMin: f.snapshot.estimatedMin,
    estimatedMax: f.snapshot.estimatedMax,
    route: f.snapshot.route,
    tariffSnapshot: f.snapshot.tariffSnapshot,
    breakdown: f.snapshot.breakdown,
    passengerConfirmedAt: f.command.passengerConfirmedAt,
    createdAt: f.snapshot.createdAt,
  });
  vi.setSystemTime(NOW + 3600000); // Expiry forbids new booking, not historical readback.
  const readback = await f.service.getRide(OWNER, created.ride.order.orderId);
  expect(readback).toHaveProperty(
    "bookingQuote",
    (created.ride as unknown as { bookingQuote: unknown }).bookingQuote,
  );
  const assignment = await assignmentDisclosure(f, f.state.order!);
  const view = { ...readback, assignment };
  // This fixture's estimate comes from production estimateFare and the existing
  // synthetic tariff: whole TWD 90–140 must reach both actual presentation mappers.
  expect([f.snapshot.estimatedMin, f.snapshot.estimatedMax]).toEqual([90, 140]);
  expect(mapPassengerRideAuthorityToFixture(view, "unit").routeFareText).toBe(
    "預估 NT$ 90",
  );
  expect(
    mapNativePassengerRideAuthorityToFixture(view, "unit").routeFareText,
  ).toBe("預估 NT$ 90");
  expect(assignment.routeFare).toMatchObject({
    quoteSnapshotId: QUOTE_ID,
    routeSnapshotId: QUOTE_ID,
    estimatedFareMinor: 9000,
    payableFareMinor: null,
    bookingQuote: (created.ride as unknown as { bookingQuote: unknown })
      .bookingQuote,
  });
});

it("legacy quotedFare is already in minor units and keeps its payable amount", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = createProductionBookingFixture();
  const { ride } = await f.service.createRide(OWNER, f.command);
  const assignment = await assignmentDisclosure(f, {
    ...f.state.order!,
    quotedFare: { amountMinor: 9000, currency: "NTD" },
  });
  expect(assignment.routeFare).toMatchObject({
    estimatedFareMinor: 9000,
    payableFareMinor: 9000,
  });
  expect(assignment.routeFare.bookingQuote).toBeUndefined();
  const view = { ...ride, assignment };
  expect(mapPassengerRideAuthorityToFixture(view, "unit").routeFareText).toBe(
    "應付 NT$ 90",
  );
  expect(
    mapNativePassengerRideAuthorityToFixture(view, "unit").routeFareText,
  ).toBe("應付 NT$ 90");
});
