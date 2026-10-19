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
import {
  accountSigningFixture,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";
import {
  bookingActor,
  evidence,
  latch,
  settled,
  within,
  type BookingActor,
} from "../pax-booking-history-20261009/native-booking-actions-fixture";

// Original hosted harness, real migrations and production services/repositories.
// The only faults below lose a SQL transport acknowledgement AFTER native SQL.
// No replacement order/auth/fee SQL, fake clock or altered business deadline.
describe.skipIf(!hostedPaymentEnabled)(
  "Bureau original booking command native PostgreSQL",
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
          await within(actor.owned.onModuleDestroy(), "booking actor shutdown");
        }
      } finally {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
      }
    }, 30000);
    afterAll(() => h.close(), 30000);

    async function actor() {
      const value = await bookingActor(h, h.peerDatabase());
      actors.push(value);
      return value;
    }
    async function fixture() {
      const account = await h.authenticatedAccount();
      await h.accounts.updateMe(account.identity, {
        displayName: "Synthetic bureau recovery",
        contactPhone: "0900000000",
        contactConsent: true,
        termsVersion: "qa-terms",
        privacyVersion: "qa-privacy",
        feeAcknowledgementVersion: "qa-fees",
      });
      const method = await h.method(account.owner);
      const fares = await h.fareServices();
      const scheduledAt = new Date(Date.now() + 20 * 60000).toISOString();
      const quote = await fares.fares.quote(account.identity, {
        originLat: 25.08,
        originLng: 121.55,
        destinationLat: 25.1,
        destinationLng: 121.57,
        scheduledAt,
      });
      if (quote.serviceAreaResult !== "serviceable" || !quote.fareSnapshotId)
        throw new Error("Production fare service did not issue an owned quote");
      return {
        ...account,
        actor: await actor(),
        key: `bureau-replay-${randomUUID()}`,
        command: {
          origin: { lat: 25.08, lng: 121.55, address: "Synthetic origin" },
          destination: {
            lat: 25.1,
            lng: 121.57,
            address: "Synthetic destination",
          },
          scheduledAt,
          fareSnapshotId: quote.fareSnapshotId,
          paymentMethodId: method.paymentMethodId,
          passengerConfirmedAt: new Date(Date.now() - 1000).toISOString(),
        },
      };
    }
    async function counts(owner: string) {
      return (
        await h.pool!.query(
          `SELECT
        (SELECT count(*)::int FROM ops.phase1_owned_orders WHERE record->'passenger'->>'passengerId'=$1) AS orders,
        (SELECT count(*)::int FROM passenger.booking_histories WHERE drts_passenger_id=$1) AS histories,
        (SELECT count(*)::int FROM ops.passenger_ride_access_tokens WHERE passenger_subject_ref=$1) AS access,
        (SELECT count(*)::int FROM ops.idempotency_records WHERE actor_id=$1 AND scope=$2 AND status='completed') AS receipts`,
          [owner, `passenger.create-ride:${owner}`],
        )
      ).rows[0];
    }

    it("independent pools contend on the real unique command receipt and return one owned UUID", async () => {
      const f = await fixture();
      const peer = await actor();
      const held = latch(),
        release = latch();
      let holder: number | undefined;
      f.actor.database.leaseObserver = async (sql, client) => {
        if (!sql.includes("INSERT INTO ops.idempotency_records")) return;
        holder = (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]
          .pid;
        held.release();
        await release.promise;
      };
      const first = settled(
        f.actor.booking.createRide(f.owner, f.command, f.key),
      );
      let second: typeof first | undefined;
      let waiter: number | undefined;
      try {
        await within(held.promise, "first native command receipt lock", 2000);
        second = settled(peer.booking.createRide(f.owner, f.command, f.key));
        const deadline = performance.now() + 1500;
        do {
          const active = await h.pool!.query(
            `SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
           WHERE datname=current_database() AND wait_event_type='Lock'
             AND position('ops.idempotency_records' in query)>0`,
          );
          waiter = active.rows.find((row) =>
            row.blockers.includes(holder),
          )?.pid;
          if (waiter) break;
          await new Promise((resolve) => setTimeout(resolve, 10));
        } while (performance.now() < deadline);
        expect(waiter).toBeTypeOf("number");
      } finally {
        release.release();
      }
      const results = await within(
        Promise.all([first, second!]),
        "native command replay results",
      );
      for (const result of results) expect(result.error).toBeUndefined();
      const orderId = results[0]!.value!.ride.order.orderId;
      expect(results[1]!.value!.ride.order.orderId).toBe(orderId);
      expect(await counts(f.owner)).toEqual({
        orders: 1,
        histories: 1,
        access: 1,
        receipts: 1,
      });
      evidence("bureau real command contention", {
        orderId,
        holder,
        waiter,
        counts: await counts(f.owner),
      });
    }, 15000);

    it("changed payload is 409 and a separately authenticated account cannot replay the original command", async () => {
      const f = await fixture();
      const original = await f.actor.controller.createRide(
        f.identity,
        f.key,
        f.command,
      );
      await expect(
        f.actor.controller.createRide(f.identity, f.key, {
          ...f.command,
          origin: { ...f.command.origin, address: "Changed immutable body" },
        }),
      ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
      const other = await h.authenticatedAccount();
      await h.accounts.updateMe(other.identity, {
        contactPhone: "0900000000",
        contactConsent: true,
      });
      const peer = await actor();
      await expect(
        peer.controller.createRide(other.identity, f.key, f.command),
      ).rejects.toMatchObject({ status: 404, code: "FARE_QUOTE_NOT_FOUND" });
      expect(await counts(f.owner)).toEqual({
        orders: 1,
        histories: 1,
        access: 1,
        receipts: 1,
      });
      expect(await counts(other.owner)).toEqual({
        orders: 0,
        histories: 0,
        access: 0,
        receipts: 0,
      });
      evidence("bureau authenticated native isolation", {
        originalOrderId: original.data!.ride.order.orderId,
        differentAccountOrders: 0,
        changedBodyCode: "IDEMPOTENCY_KEY_REUSED",
        differentAccountCode: "FARE_QUOTE_NOT_FOUND",
      });
    }, 15000);

    it("a lost native COMMIT acknowledgement leaves one complete result recoverable by a fresh process actor", async () => {
      const f = await fixture();
      let bookingTransaction = false;
      f.actor.database.leaseObserver = async (sql) => {
        if (sql.includes("INSERT INTO ops.idempotency_records"))
          bookingTransaction = true;
        if (bookingTransaction && sql.trim() === "COMMIT") {
          delete f.actor.database.leaseObserver;
          throw new Error(
            "Synthetic lost acknowledgement after actual native COMMIT",
          );
        }
      };
      await expect(
        f.actor.booking.createRide(f.owner, f.command, f.key),
      ).rejects.toThrow("after actual native COMMIT");
      const original = (
        await h.pool!.query(
          "SELECT order_id FROM passenger.booking_histories WHERE drts_passenger_id=$1",
          [f.owner],
        )
      ).rows[0].order_id;
      const peer = await actor();
      const recovered = await peer.booking.createRide(
        f.owner,
        f.command,
        f.key,
      );
      expect(recovered.ride.order.orderId).toBe(original);
      expect(await counts(f.owner)).toEqual({
        orders: 1,
        histories: 1,
        access: 1,
        receipts: 1,
      });
      evidence("bureau native unknown COMMIT recovery", {
        orderId: original,
        sameUUID: true,
        counts: await counts(f.owner),
      });
    }, 15000);

    it("a native pre-COMMIT transport failure rolls all rows back and the original key can retry", async () => {
      const f = await fixture();
      f.actor.database.leaseObserver = async (sql) => {
        if (!sql.includes("INSERT INTO passenger.booking_histories")) return;
        delete f.actor.database.leaseObserver;
        throw new Error(
          "Synthetic lost acknowledgement after native history INSERT",
        );
      };
      await expect(
        f.actor.booking.createRide(f.owner, f.command, f.key),
      ).rejects.toMatchObject({ code: "PASSENGER_BOOKING_HISTORY_FAILED" });
      expect(await counts(f.owner)).toEqual({
        orders: 0,
        histories: 0,
        access: 0,
        receipts: 0,
      });
      const peer = await actor();
      const recovered = await peer.booking.createRide(
        f.owner,
        f.command,
        f.key,
      );
      expect(await counts(f.owner)).toEqual({
        orders: 1,
        histories: 1,
        access: 1,
        receipts: 1,
      });
      evidence("bureau native rollback and retry", {
        orderId: recovered.ride.order.orderId,
        counts: await counts(f.owner),
      });
    }, 15000);
  },
);
