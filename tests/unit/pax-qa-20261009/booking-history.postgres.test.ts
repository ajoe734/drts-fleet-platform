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
import { PaymentMethodRepository } from "../../../apps/api/src/modules/passenger-app/payment/payment-method.repository";
import {
  accountSigningFixture,
  DiagnosedDatabaseService,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "./payment-postgres-harness";

describe.skipIf(!hostedPaymentEnabled)(
  "PAX QA native passenger booking and history PostgreSQL",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(async () => {
      accountSigningFixture();
      vi.stubEnv("REQUIRE_SMS_VERIFICATION", "false");
      await h.reset();
    }, 30000);
    afterEach(() => vi.unstubAllEnvs());
    afterAll(() => h.close(), 30000);

    async function fixture() {
      const account = await h.authenticatedAccount();
      await h.accounts.updateMe(account.identity, {
        displayName: "Native booking QA",
        contactPhone: "0900000000",
        contactConsent: true,
        termsVersion: "qa-terms",
        privacyVersion: "qa-privacy",
        feeAcknowledgementVersion: "qa-fees",
      });
      const method = await h.method(account.owner);
      const fares = await h.fareServices();
      const services = await h.bookingServices();
      const scheduledAt = new Date(Date.now() + 2 * 86400000).toISOString();
      const quote = await fares.fares.quote(account.identity, {
        originLat: 25.08,
        originLng: 121.55,
        destinationLat: 25.1,
        destinationLng: 121.57,
        scheduledAt,
      });
      if (quote.serviceAreaResult !== "serviceable" || !quote.fareSnapshotId)
        throw new Error(
          "Production fare service did not create an owned serviceable quote.",
        );
      const command = {
        origin: { lat: 25.08, lng: 121.55, address: "QA origin" },
        destination: { lat: 25.1, lng: 121.57, address: "QA destination" },
        scheduledAt,
        fareSnapshotId: quote.fareSnapshotId,
        paymentMethodId: method.paymentMethodId,
        passengerConfirmedAt: new Date(Date.now() - 1000).toISOString(),
      };
      return { ...account, ...services, method, quote, command };
    }

    // Peer pool observations only. All business INSERTs are production methods.
    async function state() {
      const [orders, tokens, histories] = await Promise.all([
        h.pool!.query(
          "SELECT order_id,record FROM ops.phase1_owned_orders WHERE runtime_profile_code='multi_taxi_direct' ORDER BY order_id",
        ),
        h.pool!.query(
          "SELECT * FROM ops.passenger_ride_access_tokens ORDER BY order_id",
        ),
        h.pool!.query(
          "SELECT *,created_at::text AS native_created_at FROM passenger.booking_histories ORDER BY created_at DESC,order_id DESC",
        ),
      ]);
      return {
        orders: orders.rows,
        tokens: tokens.rows,
        histories: histories.rows,
      };
    }
    function latch() {
      let release!: () => void;
      const promise = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { promise, release };
    }
    async function blockedBy(holder: number, queryFragment: string) {
      const deadline = performance.now() + 1500;
      do {
        const result = await h.pool!.query(
          `SELECT pid,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity
         WHERE datname=current_database() AND pid<>pg_backend_pid()
           AND wait_event_type='Lock' AND position($1 in query)>0`,
          [queryFragment],
        );
        const row = result.rows.find((r) => r.blockers.includes(holder));
        if (row) {
          process.stdout.write(
            `PAX QA booking native row contention ${JSON.stringify({ holder, waiter: row.pid, queryFragment })}\n`,
          );
          return row.pid as number;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      } while (performance.now() < deadline);
      throw new Error(
        "Actual production booking/payment client did not contend on the expected row.",
      );
    }

    it("successful production creation commits own order, token, quote and confirmation before publication and fresh hydration", async () => {
      const f = await fixture();
      const result = await f.booking.createRide(
        f.owner,
        f.command,
        "qa-native-success",
      );
      const persisted = await state();
      expect(persisted.orders).toHaveLength(1);
      expect(persisted.tokens).toHaveLength(1);
      expect(persisted.histories).toHaveLength(1);
      const orderId = result.ride.order.orderId;
      expect(persisted.orders[0]).toMatchObject({
        order_id: orderId,
        record: {
          passenger: {
            passengerId: f.owner,
            name: "Native booking QA",
            phone: "0900000000",
          },
          paymentMethodTokenRef: f.method.paymentMethodId,
          timingMode: "scheduled",
          reservationWindowStart: f.command.scheduledAt,
        },
      });
      expect(persisted.tokens[0]).toMatchObject({
        order_id: orderId,
        passenger_subject_ref: f.owner,
        revoked_at: null,
      });
      expect(persisted.tokens[0].token_digest).toMatch(/^[0-9a-f]{64}$/);
      expect(persisted.tokens[0].scopes).toContain("ride:read");
      expect(persisted.histories[0]).toMatchObject({
        order_id: orderId,
        drts_passenger_id: f.owner,
        fare_snapshot_id: f.quote.fareSnapshotId,
      });
      expect(persisted.histories[0].passenger_confirmed_at.toISOString()).toBe(
        f.command.passengerConfirmedAt,
      );
      expect(f.published).toHaveBeenCalledTimes(1);
      const fresh = await h.bookingServices(h.peerDatabase());
      expect(await fresh.booking.getRide(f.owner, orderId)).toEqual(
        result.ride,
      );
      expect((await fresh.booking.getRideList(f.owner, 10)).rides).toEqual([
        result.ride,
      ]);
      expect(await fresh.repository.getBookingHistoryOwner(orderId)).toBe(
        f.owner,
      );
    });

    it("native history cursor pages genuine own bookings without duplicates or omissions and excludes another owner", async () => {
      const f = await fixture();
      const ownIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const result = await f.booking.createRide(
          f.owner,
          f.command,
          `qa-native-page-${i}`,
        );
        ownIds.push(result.ride.order.orderId);
      }
      const other = await fixture();
      const foreign = await other.booking.createRide(
        other.owner,
        other.command,
        "qa-native-other",
      );
      const expected = (await state()).histories.filter(
        (r) => r.drts_passenger_id === f.owner,
      );
      const fresh = await h.bookingServices(h.peerDatabase());
      const first = await fresh.booking.getRideList(f.owner, 2);
      expect(first.rides.map((r) => r.order.orderId)).toEqual(
        expected.slice(0, 2).map((r) => r.order_id),
      );
      expect(first.nextCursor).toBeTypeOf("string");
      const cursor = JSON.parse(
        Buffer.from(first.nextCursor!, "base64").toString("utf8"),
      );
      expect(cursor).toEqual({
        createdAt: expected[1].native_created_at,
        orderId: expected[1].order_id,
      });
      const second = await fresh.booking.getRideList(
        f.owner,
        2,
        first.nextCursor,
      );
      expect(second.rides.map((r) => r.order.orderId)).toEqual(
        expected.slice(2).map((r) => r.order_id),
      );
      expect(second.nextCursor).toBeUndefined();
      const all = [...first.rides, ...second.rides].map((r) => r.order.orderId);
      expect(new Set(all).size).toBe(3);
      expect([...all].sort()).toEqual(ownIds.sort());
      expect(all).not.toContain(foreign.ride.order.orderId);
      expect(
        (await fresh.booking.getRideList(other.owner, 2)).rides.map(
          (r) => r.order.orderId,
        ),
      ).toEqual([foreign.ride.order.orderId]);
    });

    it("native history write failure rolls back order, token and publication then real caller retry commits", async () => {
      const f = await fixture();
      await h.pool!.query(
        `ALTER TABLE passenger.booking_histories ADD CONSTRAINT qa_booking_history_failure CHECK (drts_passenger_id <> '${f.owner}')`,
      );
      await expect(
        f.booking.createRide(f.owner, f.command, "qa-native-rollback"),
      ).rejects.toMatchObject({ code: "PASSENGER_BOOKING_HISTORY_FAILED" });
      expect(await state()).toEqual({ orders: [], tokens: [], histories: [] });
      expect(f.owned.listOrders()).toEqual([]);
      expect(f.published).not.toHaveBeenCalled();
      const fresh = await h.bookingServices(h.peerDatabase());
      expect((await fresh.booking.getRideList(f.owner, 10)).rides).toEqual([]);
      await h.pool!.query(
        "ALTER TABLE passenger.booking_histories DROP CONSTRAINT qa_booking_history_failure",
      );
      const result = await f.booking.createRide(
        f.owner,
        f.command,
        "qa-native-recovery",
      );
      const persisted = await state();
      expect(persisted.orders.map((r) => r.order_id)).toEqual([
        result.ride.order.orderId,
      ]);
      expect(persisted.tokens.map((r) => r.order_id)).toEqual([
        result.ride.order.orderId,
      ]);
      expect(persisted.histories.map((r) => r.order_id)).toEqual([
        result.ride.order.orderId,
      ]);
      expect(f.published).toHaveBeenCalledTimes(1);
    });

    it("existing commit account fence blocks real card removal until durable booking makes removal reject", async () => {
      const f = await fixture();
      const peer = h.peerDatabase();
      const removal = new PaymentMethodRepository(peer);
      const database = h.database as DiagnosedDatabaseService;
      const acquired = latch();
      const release = latch();
      let holder!: number;
      database.leaseObserver = async (sql, client) => {
        if (
          sql.includes("FROM passenger.psp_tokens") &&
          sql.includes("FOR UPDATE")
        ) {
          holder = (await client.query("SELECT pg_backend_pid() AS pid"))
            .rows[0].pid;
          acquired.release();
          await release.promise;
        }
      };
      const booking = f.booking.createRide(
        f.owner,
        f.command,
        "qa-native-account-lock",
      );
      // Attach rejection handlers immediately; cleanup always settles both clients.
      const booked = booking.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      let removed: Promise<unknown> | undefined;
      try {
        await Promise.race([
          acquired.promise,
          booked.then(() => {
            throw new Error("Booking did not reach its native card fence.");
          }),
        ]);
        removed = removal.remove(f.owner, f.method.paymentMethodId).then(
          () => null,
          (error) => error,
        );
        const waiter = await blockedBy(
          holder,
          "SELECT status FROM passenger.accounts",
        );
        expect(waiter).not.toBe(holder);
        expect(await state()).toEqual({
          orders: [],
          tokens: [],
          histories: [],
        });
        expect(f.published).not.toHaveBeenCalled();
        release.release();
        const result = await booking;
        expect(await removed).toMatchObject({ code: "pending_payment_block" });
        expect((await state()).histories.map((r) => r.order_id)).toEqual([
          result.ride.order.orderId,
        ]);
        expect(
          (await h.methodService.list(f.owner)).methods.map(
            (m) => m.paymentMethodId,
          ),
        ).toContain(f.method.paymentMethodId);
      } finally {
        release.release();
        delete database.leaseObserver;
        await booked;
        await removed;
      }
    });

    it("existing commit card row fence waits on a native read-only fixture lease before any order or token writes", async () => {
      const f = await fixture();
      // Explicit observation fixture, not claimed as a second business writer.
      const control = await h.pool!.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await control.query("BEGIN");
        await control.query(
          "SELECT payment_method_id FROM passenger.psp_tokens WHERE payment_method_id=$1 FOR UPDATE",
          [f.method.paymentMethodId],
        );
        const holder = (await control.query("SELECT pg_backend_pid() AS pid"))
          .rows[0].pid;
        const booking = f.booking.createRide(
          f.owner,
          f.command,
          "qa-native-card-lock",
        );
        pending = booking.then(
          (value) => value,
          (error) => error,
        );
        expect(
          await blockedBy(
            holder,
            "SELECT payment_method_id FROM passenger.psp_tokens",
          ),
        ).not.toBe(holder);
        expect(await state()).toEqual({
          orders: [],
          tokens: [],
          histories: [],
        });
        expect(f.published).not.toHaveBeenCalled();
        await control.query("COMMIT");
        const result = await booking;
        expect((await state()).histories.map((r) => r.order_id)).toEqual([
          result.ride.order.orderId,
        ]);
        expect(f.published).toHaveBeenCalledTimes(1);
      } finally {
        await control.query("ROLLBACK");
        control.release();
        await pending;
      }
    });
  },
);
