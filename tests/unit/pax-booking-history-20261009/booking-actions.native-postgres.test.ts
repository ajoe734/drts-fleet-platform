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
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import {
  assignedRide,
  blockedBy,
  bookedRide,
  bookingActor,
  completeRide,
  evidence,
  latch,
  observeTransactions,
  requireProof,
  settled,
  snapshot,
  startRide,
  within,
  type BookingActor,
} from "./native-booking-actions-fixture";

describe.skipIf(!hostedPaymentEnabled)(
  "PAX Book native cancellation and driver actors",
  () => {
    const h = new PaymentPostgresHarness();
    const actors: BookingActor[] = [];
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      vi.stubEnv("SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES", "15");
      vi.stubEnv("MULTI_TAXI_DEFAULT_AUTHORIZATION_ID", "");
      await h.reset();
    }, 30000);
    afterEach(async () => {
      try {
        for (const actor of actors.splice(0)) {
          delete actor.database.leaseObserver;
          delete actor.bookings.ownerObserved;
          await within(actor.owned.onModuleDestroy(), "actor shutdown");
        }
      } finally {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
    }, 30000);
    afterAll(() => h.close(), 30000);
    const track = (actor: BookingActor) => {
      actors.push(actor);
      return actor;
    };
    async function fixture() {
      const f = await bookedRide(h);
      track(f.actor);
      expect(await f.actor.bookings.getBookingHistoryOwner(f.orderId)).toBe(
        f.owner,
      );
      return f;
    }
    async function peer() {
      return track(await bookingActor(h, h.peerDatabase()));
    }
    async function refuse(
      f: Awaited<ReturnType<typeof fixture>>,
      actor: BookingActor,
      label: string,
    ) {
      const before = await snapshot(h, f.orderId);
      const memory = structuredClone(actor.owned.listOrders());
      const effects = actor.effects();
      const statements = observeTransactions(actor);
      await expect(
        actor.controller.cancelRide(
          f.identity,
          f.orderId,
          `book-deny-${label}`,
        ),
      ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
      const after = await snapshot(h, f.orderId);
      expect(after).toEqual(before);
      expect(actor.owned.listOrders()).toEqual(memory);
      expect(actor.effects()).toEqual(effects);
      expect(
        statements.filter((s) => /^(INSERT|UPDATE|DELETE)$/.test(s.verb)),
      ).toEqual([]);
      expect(statements.some((s) => s.verb === "COMMIT")).toBe(false);
      evidence(label, {
        before,
        after,
        effectsBefore: effects,
        effectsAfter: actor.effects(),
        statements,
      });
      delete actor.database.leaseObserver;
      return statements;
    }

    it.each(["ready", "assigned"] as const)(
      "lawful short-lead %s cancellation commits and releases only its resources",
      async (status) => {
        const f = await fixture();
        const assignment =
          status === "assigned"
            ? await assignedRide(f.actor, f.orderId)
            : undefined;
        const before = await snapshot(h, f.orderId);
        if (assignment) {
          expect(before.dispatch_resource_reservations).toHaveLength(2);
          expect(
            before.dispatch_resource_reservations.every(
              (r) => r.status === "held",
            ),
          ).toBe(true);
        }
        const statements = observeTransactions(f.actor);
        await expect(
          f.actor.controller.cancelRide(
            f.identity,
            f.orderId,
            "book-lawful-cancel",
          ),
        ).resolves.toMatchObject({ data: { success: true } });
        const after = await snapshot(h, f.orderId);
        expect(after.phase1_owned_orders[0]).toMatchObject({
          status: "cancelled",
          record: { cancelReason: "passenger_requested" },
        });
        expect(
          after.consumer_notification_outbox.filter(
            (r) => r.event_type === "trip_cancelled",
          ),
        ).toHaveLength(1);
        expect(statements.some((s) => s.verb === "COMMIT")).toBe(true);
        if (assignment) {
          expect(after.phase1_driver_tasks[0]).toMatchObject({
            status: "cancelled",
          });
          expect(after.phase1_dispatch_assignments[0]).toMatchObject({
            status: "cancelled",
          });
          expect(after.phase1_dispatch_jobs[0]).toMatchObject({
            status: "closed",
          });
          expect(after.dispatch_resource_reservations).toHaveLength(2);
          for (const reservation of after.dispatch_resource_reservations) {
            expect(reservation).toMatchObject({
              assignment_id: assignment.assignmentId,
              status: "released",
            });
            const previous = before.dispatch_resource_reservations.find(
              (r) => r.resource_type === reservation.resource_type,
            );
            expect(Number(reservation.version)).toBeGreaterThan(
              Number(previous!.version),
            );
          }
          expect(f.actor.effects().cancelled).toBe(1);
        }
        const fresh = await peer();
        expect(
          (await fresh.booking.getRide(f.owner, f.orderId)).order.status,
        ).toBe("cancelled");
        evidence(`lawful ${status}`, {
          before,
          after,
          effects: f.actor.effects(),
          statements,
        });
      },
    );

    // Representative native proof complements the original 28 source controls;
    // no new Cartesian/count gate. Driver progression itself is production code.
    it.each(["on_trip", "proof_pending"] as const)(
      "real %s transition after cancellation BEGIN fences stale cache, then synchronized refusal",
      async (status) => {
        const f = await fixture();
        if (status === "proof_pending") await requireProof(f.actor, f.orderId);
        const driver = await peer();
        const assignment = await assignedRide(driver, f.orderId);
        const cancellation = await peer(); // Hydrate while still assigned.
        const entered = latch();
        const release = latch();
        const statements = observeTransactions(cancellation);
        const observe = cancellation.database.leaseObserver!;
        cancellation.database.leaseObserver = async (sql, client) => {
          await observe(sql, client);
          if (sql.trim() === "BEGIN") {
            entered.release();
            await within(release.promise, "cancel BEGIN gate");
          }
        };
        const cancelled = settled(
          cancellation.controller.cancelRide(
            f.identity,
            f.orderId,
            "book-after-begin",
          ),
        );
        try {
          await within(
            Promise.race([
              entered.promise,
              cancelled.then(() => {
                throw new Error("Cancellation never reached BEGIN.");
              }),
            ]),
            "real BEGIN observation",
          );
          await startRide(driver, assignment.taskId);
          if (status === "proof_pending")
            await expect(
              completeRide(driver, assignment.taskId),
            ).rejects.toMatchObject({ code: "MIN_PHOTO_COUNT_NOT_MET" });
          const before = await snapshot(h, f.orderId); // AFTER actual driver commit.
          expect(before.phase1_owned_orders[0].status).toBe(status);
          expect(before.phase1_driver_tasks[0].status).toBe(status);
          expect(
            before.dispatch_resource_reservations.every(
              (r) => r.status === "occupied",
            ),
          ).toBe(true);
          const effects = [cancellation.effects(), driver.effects()];
          const memory = structuredClone(cancellation.owned.listOrders());
          expect(memory.find((o) => o.orderId === f.orderId)?.status).toBe(
            "assigned",
          );
          release.release();
          expect(
            (await within(cancelled, "stale cancellation settles")).error,
          ).toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
          const after = await snapshot(h, f.orderId);
          expect(after).toEqual(before);
          expect(cancellation.owned.listOrders()).toEqual(memory);
          expect([cancellation.effects(), driver.effects()]).toEqual(effects);
          expect(
            statements.filter((s) => /^(INSERT|UPDATE|DELETE)$/.test(s.verb)),
          ).toEqual([]);
          expect(statements.some((s) => s.verb === "ROLLBACK")).toBe(true);
          expect(statements.some((s) => s.verb === "COMMIT")).toBe(false);
          evidence(`after BEGIN ${status}`, {
            before,
            after,
            statements,
            effects,
          });
          const synchronized = await peer();
          await refuse(f, synchronized, `synchronized ${status}`);
        } finally {
          release.release();
          delete cancellation.database.leaseObserver;
          await within(cancelled, "BEGIN gate cleanup");
        }
      },
      30000,
    );

    it("native driver completion holds assignment lock against account cancellation and commits proof_pending before refusal baseline", async () => {
      const f = await fixture();
      await requireProof(f.actor, f.orderId);
      const driver = await peer();
      const assignment = await assignedRide(driver, f.orderId);
      const cancellation = await peer(); // Real assigned cache, before trip starts.
      await startRide(driver, assignment.taskId);
      const held = latch();
      const releaseDriver = latch();
      const acquired = latch();
      const releaseCancel = latch();
      let holder = 0;
      const driverStatements = observeTransactions(driver);
      const driverObserve = driver.database.leaseObserver!;
      driver.database.leaseObserver = async (sql, client) => {
        await driverObserve(sql, client);
        if (
          sql.includes("phase1_dispatch_assignments") &&
          sql.includes("FOR UPDATE")
        ) {
          holder = (await client.query("SELECT pg_backend_pid() AS pid"))
            .rows[0].pid;
          held.release();
          await within(releaseDriver.promise, "driver lock release", 2500);
        }
      };
      const cancelStatements = observeTransactions(cancellation);
      const cancelObserve = cancellation.database.leaseObserver!;
      cancellation.database.leaseObserver = async (sql, client) => {
        await cancelObserve(sql, client);
        if (
          sql.includes("phase1_dispatch_assignments") &&
          sql.includes("FOR UPDATE")
        ) {
          acquired.release();
          await within(releaseCancel.promise, "post-driver baseline");
        }
      };
      const completed = settled(completeRide(driver, assignment.taskId));
      let cancelled: ReturnType<typeof settled> | undefined;
      try {
        await within(
          Promise.race([
            held.promise,
            completed.then(() => {
              throw new Error("Driver never acquired assignment lock.");
            }),
          ]),
          "driver holder",
          1500,
        );
        cancelled = settled(
          cancellation.controller.cancelRide(
            f.identity,
            f.orderId,
            "book-contending-cancel",
          ),
        );
        expect(await blockedBy(h, holder)).not.toBe(holder);
        releaseDriver.release();
        expect(
          (await within(completed, "driver completion commit")).error,
        ).toMatchObject({ code: "MIN_PHOTO_COUNT_NOT_MET" });
        await within(
          acquired.promise,
          "cancellation acquired real driver lock",
        );
        const before = await snapshot(h, f.orderId);
        expect(before.phase1_owned_orders[0].status).toBe("proof_pending");
        expect(before.phase1_driver_tasks[0].status).toBe("proof_pending");
        const effects = [driver.effects(), cancellation.effects()];
        const memory = structuredClone(cancellation.owned.listOrders());
        releaseCancel.release();
        expect(
          (await within(cancelled, "contending refusal")).error,
        ).toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
        const after = await snapshot(h, f.orderId);
        expect(after).toEqual(before);
        expect(cancellation.owned.listOrders()).toEqual(memory);
        expect([driver.effects(), cancellation.effects()]).toEqual(effects);
        expect(
          cancelStatements.filter((s) =>
            /^(INSERT|UPDATE|DELETE)$/.test(s.verb),
          ),
        ).toEqual([]);
        expect(cancelStatements.some((s) => s.verb === "ROLLBACK")).toBe(true);
        evidence("driver contention committed baseline", {
          before,
          after,
          driverStatements,
          cancelStatements,
          effects,
        });
      } finally {
        releaseDriver.release();
        releaseCancel.release();
        delete driver.database.leaseObserver;
        delete cancellation.database.leaseObserver;
        await within(completed, "driver cleanup");
        if (cancelled) await within(cancelled, "waiter cleanup");
      }
    }, 30000);

    it.each(["completed", "cancelled"] as const)(
      "genuine terminal %s refuses stale and synchronized account cancellation",
      async (status) => {
        const f = await fixture();
        const stale = await peer();
        if (status === "completed") {
          const assignment = await assignedRide(f.actor, f.orderId);
          await startRide(f.actor, assignment.taskId);
          await completeRide(f.actor, assignment.taskId);
          // Await the legitimate background completion drain before taking baseline.
          await within(
            f.actor.owned.onModuleDestroy(),
            "terminal driver effect drain",
          );
        } else {
          await f.actor.controller.cancelRide(
            f.identity,
            f.orderId,
            "book-terminal-cancel",
          );
        }
        expect(
          (await snapshot(h, f.orderId)).phase1_owned_orders[0].status,
        ).toBe(status);
        const statements = await refuse(f, stale, `stale terminal ${status}`);
        expect(statements.some((s) => s.verb === "ROLLBACK")).toBe(true);
        await refuse(f, await peer(), `synchronized terminal ${status}`);
      },
      30000,
    );
  },
);
