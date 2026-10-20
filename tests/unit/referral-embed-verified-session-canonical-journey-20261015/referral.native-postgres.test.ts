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
  PaymentPostgresHarness,
  hostedPaymentEnabled,
} from "../pax-qa-20261009/payment-postgres-harness";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { domainFixture } from "./domain-fixture";

// Uses the existing GitHub-hosted disposable DB/migration harness. Never opens
// PG, HTTP, or a product runtime on this VM. Auth is separately covered by the
// canonical issuer/guard suite; these cases exercise real storage arbitration.
describe.skipIf(!hostedPaymentEnabled)(
  "Referral R6 native quote/order atomicity",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterEach(() => vi.restoreAllMocks());
    afterAll(() => h.close(), 30000);

    async function actor() {
      const f = await domainFixture();
      const database = h.peerDatabase();
      const repo = new OwnedMobilityRepository(database);
      Reflect.set(f.service, "ownedMobilityRepository", repo);
      Reflect.set(
        f.service,
        "referralFareRepository",
        new PassengerFareRepository(database),
      );
      const who = await f.identity();
      return { ...f, database, repo, who };
    }
    async function counts(quoteId: string) {
      return (
        await h.pool!.query(
          `SELECT q.consumed_by_order_id, q.consumed_at,
      (SELECT count(*)::int FROM ops.phase1_owned_orders o WHERE o.order_id=q.consumed_by_order_id) AS orders,
      (SELECT count(*)::int FROM mobility.phase1_order_partner_notification_routes r WHERE r.order_id=q.consumed_by_order_id) AS routes
      FROM ops.phase1_referral_fare_quote_snapshots q WHERE q.quote_id=$1`,
          [quoteId],
        )
      ).rows[0];
    }
    it("migrates the owned quote and commits one real order/notification route, with a durable expired-quote replay", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const first = await f.service.createReferralPassengerBooking(
        command,
        f.who,
      );
      expect(await counts(command.quoteId)).toMatchObject({
        consumed_by_order_id: first.orderId,
        orders: 1,
        routes: 1,
      });
      await h.pool!.query(
        `UPDATE ops.phase1_referral_fare_quote_snapshots SET expires_at=clock_timestamp()-interval '1 second', created_at=clock_timestamp()-interval '1 hour',
      record=jsonb_set(record,'{expiresAt}',to_jsonb((clock_timestamp()-interval '1 second')::text)) WHERE quote_id=$1`,
        [command.quoteId],
      );
      expect(
        await f.service.createReferralPassengerBooking(command, f.who),
      ).toMatchObject({ orderId: first.orderId, replayed: true });
    });
    it("independent API instances racing one quote/key return the same durable UUID", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      // Separate service/cache/repository/pool, same real entry/link/consent rail.
      const peer = await domainFixture();
      Reflect.set(peer.service, "tenantPartnerService", f.partner);
      Reflect.set(peer.service, "partnerUserIdentityLinkRepository", f.links);
      Reflect.set(
        peer.service,
        "ownedMobilityRepository",
        new OwnedMobilityRepository(h.peerDatabase()),
      );
      const outcomes = await Promise.allSettled([
        f.service.createReferralPassengerBooking(command, f.who),
        peer.service.createReferralPassengerBooking(command, f.who),
      ]);
      const successes = outcomes.filter(
        (
          r,
        ): r is PromiseFulfilledResult<
          Awaited<ReturnType<typeof f.service.createReferralPassengerBooking>>
        > => r.status === "fulfilled",
      );
      expect(successes).toHaveLength(2);
      expect(new Set(successes.map((r) => r.value.orderId)).size).toBe(1);
      expect(await counts(command.quoteId)).toMatchObject({
        orders: 1,
        routes: 1,
      });
    });
    it.each(["same-key-different-quotes", "different-keys-same-quote"])(
      "native arbitration rejects the changed contender without orphan order/route/trace: %s",
      async (mode) => {
        const f = await actor(),
          firstCommand = await f.command(f.who);
        const secondCommand =
          mode === "same-key-different-quotes"
            ? {
                ...(await f.command(f.who)),
                idempotencyKey: firstCommand.idempotencyKey,
              }
            : {
                ...firstCommand,
                idempotencyKey: firstCommand.idempotencyKey + "-other",
              };
        const peer = await domainFixture();
        Reflect.set(peer.service, "tenantPartnerService", f.partner);
        Reflect.set(peer.service, "partnerUserIdentityLinkRepository", f.links);
        Reflect.set(
          peer.service,
          "ownedMobilityRepository",
          new OwnedMobilityRepository(h.peerDatabase()),
        );
        const results = await Promise.allSettled([
          f.service.createReferralPassengerBooking(firstCommand, f.who),
          peer.service.createReferralPassengerBooking(secondCommand, f.who),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const denied = results.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        )!;
        expect(denied.reason).toMatchObject({
          code:
            mode === "same-key-different-quotes"
              ? "IDEMPOTENCY_KEY_REUSED"
              : "FARE_QUOTE_ALREADY_CONSUMED",
        });
        const actual = await h.pool!.query(
          `SELECT
      (SELECT count(*)::int FROM ops.phase1_owned_orders WHERE record->'passenger'->>'passengerId'=$1) AS orders,
      (SELECT count(*)::int FROM mobility.phase1_order_partner_notification_routes WHERE drts_passenger_id=$1) AS routes,
      (SELECT count(*)::int FROM ops.phase1_dispatch_trace_logs t WHERE NOT EXISTS(SELECT 1 FROM ops.phase1_owned_orders o WHERE o.order_id=t.order_id)) AS orphan_traces,
      (SELECT count(*)::int FROM ops.phase1_referral_fare_quote_snapshots WHERE drts_passenger_id=$1 AND consumed_by_order_id IS NOT NULL) AS consumed`,
          [f.who.drtsPassengerId],
        );
        expect(actual.rows[0]).toEqual({
          orders: 1,
          routes: 1,
          orphan_traces: 0,
          consumed: 1,
        });
      },
    );
    it("rolls back a real quote claim and order when route persistence fails before COMMIT", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      vi.spyOn(f.repo, "writeOrderPartnerNotificationRoute").mockRejectedValue(
        new Error("controlled route storage transport failure"),
      );
      await expect(
        f.service.createReferralPassengerBooking(command, f.who),
      ).rejects.toThrow("controlled route storage transport failure");
      expect(await counts(command.quoteId)).toMatchObject({
        consumed_by_order_id: null,
        consumed_at: null,
        orders: 0,
        routes: 0,
      });
      expect(
        (
          await h.pool!.query(
            "SELECT count(*)::int AS n FROM ops.phase1_owned_orders WHERE record->'referralPassengerLifecycle'->'bookingIntent'->>'quoteId'=$1",
            [command.quoteId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect(f.service.listOrders()).toHaveLength(0);
    });
    it("recovers a lost native COMMIT response only after native order/quote/route readback", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const connect = f.database.connect.bind(f.database);
      vi.spyOn(f.database, "connect").mockImplementation(async () => {
        const client = await connect(),
          query = client.query.bind(client);
        let lose = true;
        client.query = (async (...args: any[]) => {
          const value = await (query as any)(...args);
          if (lose && args[0] === "COMMIT") {
            lose = false;
            throw new Error("controlled native COMMIT ACK loss");
          }
          return value;
        }) as typeof client.query;
        return client;
      });
      const first = await f.service.createReferralPassengerBooking(
        command,
        f.who,
      );
      expect(first.replayed).toBe(true);
      expect(await counts(command.quoteId)).toMatchObject({
        consumed_by_order_id: first.orderId,
        orders: 1,
        routes: 1,
      });
    });
  },
);
