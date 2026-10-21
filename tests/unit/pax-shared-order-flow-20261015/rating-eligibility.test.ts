import { afterEach, expect, it, vi } from "vitest";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { PassengerRideSseEventEnvelope } from "@drts/contracts";
import { mapPassengerRideAuthorityToFixture } from "../../../apps/passenger-app-web/lib/ride/passenger-live";
import { mapNativePassengerRideAuthorityToFixture } from "../../../packages/passenger-client/src/ride/native-presentation";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

afterEach(() => vi.useRealTimers());

async function fixture(age: number, paymentStatus: string | null) {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const f = createProductionBookingFixture();
  await f.service.createRide(OWNER, f.command);
  const order = { ...f.state.order!, status: "completed" };
  const completedAt = new Date(NOW - age).toISOString();
  const database = {
    isEnabled: () => true,
    query: async (sql: string) => {
      if (/FROM ops.phase1_owned_orders/.test(sql))
        return { rows: [{ record: order }] };
      if (sql.includes("FROM ops.passenger_dispatch_disclosure_snapshots"))
        return {
          rows: [
            {
              record: {
                orderId: order.orderId,
                assignmentId: "assigned-trip",
                assignmentVersion: 1,
                driver: { driverId: "assigned-driver" },
                eta: {
                  minutes: null,
                  calculatedAt: null,
                  locationFreshness: "missing",
                },
                supersededAt: null,
              },
            },
          ],
        };
      if (sql.includes("FROM ops.phase1_driver_tasks"))
        return {
          rows: [
            { completed_at: completedAt, database_now: new Date(Date.now()) },
          ],
        };
      if (sql.includes("FROM billing.multi_taxi_passenger_payments"))
        return {
          rows: paymentStatus
            ? [{ status: paymentStatus, amount_minor: 125, currency: "NTD" }]
            : [],
        };
      return { rows: [] };
    },
  };
  const repository = new MultiTaxiRepository(database as never);
  const owned = new OwnedMobilityService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    new OwnedMobilityRepository(database as never, repository),
  );
  return {
    service: new MultiTaxiService(owned, repository),
    repository,
    order,
    completedAt,
  };
}

it.each([
  ["unpaid", 1000, null, "PASSENGER_RATING_PAYMENT_REQUIRED"],
  ["failed", 1000, "failed", "PASSENGER_RATING_PAYMENT_REQUIRED"],
  ["expired", 86400001, "captured", "PASSENGER_RATING_WINDOW_CLOSED"],
  ["future completion", -1, "captured", "PASSENGER_RATING_WINDOW_CLOSED"],
] as const)(
  "first-party %s hides rating and rejects at the service admission boundary",
  async (_label, age, payment, code) => {
    const f = await fixture(age, payment);
    // Only the persistence boundary is replaced in this service-admission test;
    // the hosted PG companion exercises the actual writer and transaction rules.
    const persist = vi
      .spyOn(f.repository, "persistPassengerRating")
      .mockImplementation(async (rating) => ({
        rating,
        summary: {
          driverId: rating.driverId,
          displayState: "rated",
          averageRating: rating.score,
          ratingCount: 1,
          lastRatedAt: rating.submittedAt,
          aggregateVersion: 1,
          calculatedAt: rating.submittedAt,
        },
      }));
    await expect(
      f.service.submitTrustedPassengerRating(
        f.order.orderId,
        { score: 5 },
        OWNER,
        { execute: async () => {} },
      ),
    ).rejects.toMatchObject({ code });
    expect(
      (await f.service.getPassengerRideById(f.order.orderId, OWNER)).actions
        .canRate,
    ).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  },
);

it.each([0, 86400000])(
  "paid completion at age %d ms keeps the existing inclusive 24h boundary and actual completion time",
  async (age) => {
    const f = await fixture(age, "captured");
    expect(
      await f.service.getPassengerRideById(f.order.orderId, OWNER),
    ).toMatchObject({
      order: { completedAt: f.completedAt },
      actions: { canRate: true },
    });
  },
);

it("the live stream keeps the inclusive 24h boundary and closes Web/Native rating entry on the next poll after expiry", async () => {
  const f = await fixture(86400000 - 3000, "captured");
  const events: PassengerRideSseEventEnvelope[] = [];
  const web: boolean[] = [];
  const native: boolean[] = [];
  // Actual timer, authority reads, repository window calculation, event choice
  // and deduplication run together. Only database rows/clock are a fixture.
  const subscription = f.service
    .streamTrustedPassengerEvents(f.order.orderId, OWNER)
    .subscribe(({ data }) => {
      const event = data as PassengerRideSseEventEnvelope;
      events.push(event);
      web.push(mapPassengerRideAuthorityToFixture(event.data, "unit").canRate!);
      native.push(
        mapNativePassengerRideAuthorityToFixture(event.data, "unit").canRate!,
      );
    });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(web).toEqual([true]);
    expect(native).toEqual([true]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(
      (await f.service.getPassengerRideById(f.order.orderId, OWNER)).actions
        .canRate,
    ).toBe(true);
    expect(events).toHaveLength(1); // Unchanged legal boundary is deduplicated.
    await vi.advanceTimersByTimeAsync(1);
    expect(
      (await f.service.getPassengerRideById(f.order.orderId, OWNER)).actions
        .canRate,
    ).toBe(false);
    await vi.advanceTimersByTimeAsync(2999);
    expect(web).toEqual([true, false]);
    expect(native).toEqual([true, false]);
    expect(events.map((event) => event.eventType)).toEqual([
      "trip_completed",
      "trip_completed",
    ]);
    expect(events[1]!.eventVersion).toBeGreaterThan(events[0]!.eventVersion);
    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toHaveLength(2); // Expired authority does not flood the stream.
  } finally {
    subscription.unsubscribe();
  }
});
