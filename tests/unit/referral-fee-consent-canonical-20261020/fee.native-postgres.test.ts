import type { CreateReferralPassengerBookingCommand } from "@drts/contracts";
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
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
} from "@drts/contracts";
import {
  PaymentPostgresHarness,
  hostedPaymentEnabled,
} from "../pax-qa-20261009/payment-postgres-harness";
import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
const agree = {
  disclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
  acknowledged: true as const,
};

// This VM never opens PG. GitHub's existing owned native harness applies every
// production migration and verifies the exact filename/version/checksum ledger.
describe.skipIf(!hostedPaymentEnabled)(
  "E19 native PostgreSQL fee acknowledgement and atomic order",
  () => {
    const h = new PaymentPostgresHarness();
    beforeAll(() => h.open(), 240000);
    beforeEach(() => h.reset(), 30000);
    afterEach(() => vi.restoreAllMocks());
    afterAll(() => h.close(), 30000);
    async function actor() {
      const f = await domainFixture(),
        database = h.peerDatabase(),
        repo = new OwnedMobilityRepository(database);
      await new TenantPartnerRepository(database).persistChanges({
        partnerEntries: [f.entry],
      });
      Reflect.set(f.service, "ownedMobilityRepository", repo);
      Reflect.set(
        f.service,
        "referralFareRepository",
        new PassengerFareRepository(database),
      );
      const who = await f.identity();
      const peer = f.newService();
      Reflect.set(
        peer,
        "ownedMobilityRepository",
        new OwnedMobilityRepository(h.peerDatabase()),
      );
      return { ...f, database, repo, who, peer };
    }
    async function counts(quoteId: string) {
      const row = await h.pool!.query(
        `SELECT
     (SELECT count(*)::int FROM ops.phase1_referral_order_fee_confirmations WHERE quote_id=$1) AS fees,
     (SELECT count(*)::int FROM ops.phase1_owned_orders WHERE record->'referralPassengerLifecycle'->'quote'->>'quoteId'=$1) AS orders,
     (SELECT consumed_by_order_id FROM ops.phase1_referral_fare_quote_snapshots WHERE quote_id=$1) AS consumed`,
        [quoteId],
      );
      return row.rows[0];
    }
    it("migrates the real owner/version unique contract and does not mistake privacy consent for fee consent", async () => {
      const f = await actor();
      expect(
        (await f.service.getReferralFeeStatus(f.who)).acknowledgedAt,
      ).toBeNull();
      const constraint = await h.pool!.query(
        `SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid='ops.phase1_referral_passenger_fee_acknowledgements'::regclass AND contype='p'`,
      );
      expect(constraint.rows[0].n).toBe(1);
      const quote = await f.service.quoteReferralPassengerFare(f.route, f.who);
      await expect(
        f.service.createReferralPassengerBooking(
          {
            ...f.route,
            quoteId: quote.quoteId,
            feeConfirmed: true,
            feeDisclosureVersion: PASSENGER_FEE_DISCLOSURE_VERSION,
          },
          f.who,
        ),
      ).rejects.toMatchObject({ code: "FEE_DISCLOSURE_REQUIRED" });
      expect(await counts(quote.quoteId)).toEqual({
        fees: 0,
        orders: 0,
        consumed: null,
      });
    });
    it("arbitrates first acknowledgement across separate pools and retains the winner's original server timestamp", async () => {
      const f = await actor();
      const [a, b] = await Promise.all([
        f.service.acknowledgeReferralFees(agree, f.who),
        f.peer.acknowledgeReferralFees(agree, f.who),
      ]);
      expect(a).toEqual(b);
      expect(await f.peer.getReferralFeeStatus(f.who)).toEqual(a);
      const rows = await h.pool!.query(
        "SELECT acknowledged_at,record FROM ops.phase1_referral_passenger_fee_acknowledgements",
      );
      expect(rows.rows).toHaveLength(1);
      expect(new Date(rows.rows[0].acknowledged_at).toISOString()).toBe(
        a.acknowledgedAt,
      );
      expect(rows.rows[0].record.contentHash).toBe(PASSENGER_FEE_CONTENT_HASH);
    });
    it("commits one fee snapshot/order/route for two actual same-key database callers", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const [a, b] = await Promise.all([
        f.service.createReferralPassengerBooking(command, f.who),
        f.peer.createReferralPassengerBooking(command, f.who),
      ]);
      expect(a.orderId).toBe(b.orderId);
      expect(a.feeConfirmation).toEqual(b.feeConfirmation);
      expect(await counts(command.quoteId)).toEqual({
        fees: 1,
        orders: 1,
        consumed: a.orderId,
      });
      const rows = await h.pool!.query(
        "SELECT record FROM ops.phase1_referral_order_fee_confirmations WHERE order_id=$1",
        [a.orderId],
      );
      expect(rows.rows[0].record).toEqual(a.feeConfirmation);
      const route = await h.pool!.query(
        "SELECT order_id FROM mobility.phase1_order_partner_notification_routes WHERE order_id=$1",
        [a.orderId],
      );
      expect(route.rows).toHaveLength(1);
    });
    it("allows only one actual different-key consumption of one quote", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const results = await Promise.allSettled([
        f.service.createReferralPassengerBooking(command, f.who),
        f.peer.createReferralPassengerBooking(
          { ...command, idempotencyKey: command.idempotencyKey + "-other" },
          f.who,
        ),
      ]);
      expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const failed = results.find(
        (x): x is PromiseRejectedResult => x.status === "rejected",
      )!;
      expect(failed.reason).toMatchObject({
        code: "FARE_QUOTE_ALREADY_CONSUMED",
      });
      expect(await counts(command.quoteId)).toMatchObject({
        fees: 1,
        orders: 1,
      });
    });
    it.each(["fee", "route"] as const)(
      "rolls back actual SQL constraints/faults at %s without losing the independent first agreement",
      async (where) => {
        const f = await actor(),
          command = await f.command(f.who);
        const table =
          where === "fee"
            ? "ops.phase1_referral_order_fee_confirmations"
            : "mobility.phase1_order_partner_notification_routes";
        await h.pool!.query(
          `CREATE FUNCTION public.e19_qa_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled native fee transaction failure'; END $$`,
        );
        await h.pool!.query(
          "CREATE TRIGGER e19_qa_reject BEFORE INSERT ON " +
            table +
            " FOR EACH ROW EXECUTE FUNCTION public.e19_qa_reject()",
        );
        await expect(
          f.service.createReferralPassengerBooking(command, f.who),
        ).rejects.toBeDefined();
        expect(await counts(command.quoteId)).toEqual({
          fees: 0,
          orders: 0,
          consumed: null,
        });
        expect(
          (await f.service.getReferralFeeStatus(f.who)).acknowledgedAt,
        ).toBeTruthy();
        expect(f.service.listOrders()).toHaveLength(0);
      },
    );
    it("recovers a committed native order after loss of the original transaction result", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const normal = f.repo.withTransaction.bind(f.repo);
      vi.spyOn(f.repo, "withTransaction").mockImplementation(async (work) => {
        await normal(work);
        throw new Error("controlled post-COMMIT response loss");
      });
      const ack = await f.service.createReferralPassengerBooking(
        command,
        f.who,
      );
      const replay = await f.peer.createReferralPassengerBooking(
        command,
        f.who,
      );
      expect(replay).toMatchObject({
        orderId: ack.orderId,
        replayed: true,
        feeConfirmation: ack.feeConfirmation,
      });
      expect(await counts(command.quoteId)).toEqual({
        fees: 1,
        orders: 1,
        consumed: ack.orderId,
      });
    });
    it("reads the same durable fee confirmation after service replacement and rejects another fee choice", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const ack = await f.service.createReferralPassengerBooking(
        command,
        f.who,
      );
      const history = await f.peer.listReferralPassengerHistory(f.who);
      expect(
        history.items.find((i) => i.orderId === ack.orderId)?.feeConfirmation,
      ).toEqual(ack.feeConfirmation);
      await expect(
        f.peer.createReferralPassengerBooking(
          { ...command, feeConfirmed: false },
          f.who,
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
      const other = await f.identity("another-native-fee-owner");
      expect(
        (await f.peer.getReferralFeeStatus(other)).acknowledgedAt,
      ).toBeNull();
    });
    it("replays an actual persisted pre-fee command after expiry without upgrading body or backfilling agreement", async () => {
      const f = await actor(),
        command = await f.command(f.who);
      const ack = await f.service.createReferralPassengerBooking(
        command,
        f.who,
      );
      // Only this disposable hosted case DB models a pre-V0129 row. No shared
      // runtime/order or held journal is ever edited by this fixture.
      const stored = (
        await h.pool!.query(
          "SELECT record FROM ops.phase1_owned_orders WHERE order_id=$1",
          [ack.orderId],
        )
      ).rows[0].record;
      delete stored.referralPassengerLifecycle.feeConfirmation;
      delete stored.referralPassengerLifecycle.bookingIntent.feeConfirmed;
      delete stored.referralPassengerLifecycle.bookingIntent
        .feeDisclosureVersion;
      delete stored.referralPassengerLifecycle.quote.feeDisclosureVersion;
      delete stored.referralPassengerLifecycle.quote.feeContentHash;
      await h.pool!.query(
        "DELETE FROM ops.phase1_referral_order_fee_confirmations WHERE order_id=$1",
        [ack.orderId],
      );
      await h.pool!.query(
        "DELETE FROM ops.phase1_referral_passenger_fee_acknowledgements WHERE drts_passenger_id=$1",
        [f.who.drtsPassengerId],
      );
      await h.pool!.query(
        "UPDATE ops.phase1_owned_orders SET record=$2::jsonb WHERE order_id=$1",
        [ack.orderId, JSON.stringify(stored)],
      );
      const original: CreateReferralPassengerBookingCommand = { ...command };
      delete original.feeConfirmed;
      delete original.feeDisclosureVersion;
      const bytes = JSON.stringify(original);
      vi.spyOn(Date, "now").mockReturnValue(
        Date.parse(stored.referralPassengerLifecycle.quote.expiresAt) + 1,
      );
      const replay = await f.peer.createReferralPassengerBooking(
        original,
        f.who,
      );
      expect(replay).toMatchObject({
        orderId: ack.orderId,
        replayed: true,
        feeConfirmation: null,
      });
      expect(JSON.stringify(original)).toBe(bytes);
      expect(await counts(command.quoteId)).toEqual({
        fees: 0,
        orders: 1,
        consumed: ack.orderId,
      });
      expect(
        (await f.peer.getReferralFeeStatus(f.who)).acknowledgedAt,
      ).toBeNull();
    });
  },
);
