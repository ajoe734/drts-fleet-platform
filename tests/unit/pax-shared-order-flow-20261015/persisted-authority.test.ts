import { afterEach, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import {
  createProductionBookingFixture,
  NOW,
  OWNER,
} from "../pax-booking-history-20261009/production-booking-fixture";

afterEach(() => vi.useRealTimers());

it("reads a newly committed order and replacement disclosure through production repositories on a peer that was already running", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const booking = createProductionBookingFixture();
  const created = await booking.service.createRide(OWNER, booking.command);
  const order = structuredClone(booking.state.order!);
  let currentAssignment: Record<string, unknown> | null = null;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (/SELECT record\s+FROM ops.phase1_owned_orders/.test(sql)) {
      expect(values).toEqual([order.orderId]);
      return { rows: [{ record: structuredClone(order) }] };
    }
    if (/FROM ops.passenger_dispatch_disclosure_snapshots/.test(sql)) {
      expect(values).toEqual([order.orderId]);
      return {
        rows: currentAssignment
          ? [{ record: structuredClone(currentAssignment) }]
          : [],
      };
    }
    return { rows: [] };
  });
  const database = { isEnabled: () => true, query };
  const taxiRepository = new MultiTaxiRepository(database as never);
  const repository = new OwnedMobilityRepository(
    database as never,
    taxiRepository,
  );
  const owned = new OwnedMobilityService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    repository,
  );
  const peer = new MultiTaxiService(owned, taxiRepository);
  // No hydration or private cache edits. SQL response rows are the unit-test
  // boundary only; the hosted companion exercises actual committed PG rows.
  expect(owned.listOrders()).toEqual([]);
  expect((await peer.getPassengerRideById(order.orderId, OWNER)).order).toEqual(
    created.ride.order,
  );
  currentAssignment = {
    snapshotId: "snapshot-one",
    orderId: order.orderId,
    assignmentId: "assignment-one",
    assignmentVersion: 1,
    driver: { driverId: "driver-one" },
    eta: { minutes: 5 },
    supersededAt: null,
  };
  order.status = "assigned";
  expect(await peer.getPassengerRideById(order.orderId, OWNER)).toMatchObject({
    order: { status: "assigned" },
    assignment: { assignmentId: "assignment-one" },
  });
  currentAssignment = {
    ...currentAssignment,
    snapshotId: "snapshot-two",
    assignmentId: "assignment-two",
    assignmentVersion: 2,
  };
  order.status = "on_trip";
  const received: unknown[] = [];
  const subscription = peer
    .streamTrustedPassengerEvents(order.orderId, OWNER)
    .subscribe((event) => received.push(event.data));
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(received).toMatchObject([
      {
        eventType: "trip_started",
        data: {
          order: { status: "on_trip" },
          assignment: { assignmentId: "assignment-two", assignmentVersion: 2 },
        },
      },
    ]);
    order.status = "completed";
    await vi.advanceTimersByTimeAsync(3_000);
    expect(received).toHaveLength(2);
    expect(received[1]).toMatchObject({ eventType: "trip_completed" });
    currentAssignment = null;
    expect(
      (await peer.getPassengerRideById(order.orderId, OWNER)).assignment,
    ).toBeNull();
  } finally {
    subscription.unsubscribe();
  }
});
