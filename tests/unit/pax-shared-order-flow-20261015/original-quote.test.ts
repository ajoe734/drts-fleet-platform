import { afterEach, expect, it, vi } from "vitest";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
  QUOTE_ID,
} from "../pax-booking-history-20261009/production-booking-fixture";

afterEach(() => vi.useRealTimers());

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
});
