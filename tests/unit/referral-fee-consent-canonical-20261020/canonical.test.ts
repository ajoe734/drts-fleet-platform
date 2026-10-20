import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  PASSENGER_FEE_ROWS,
  PASSENGER_CONFIRMATION_ROWS,
  PASSENGER_FEE_DISCLOSURE_VERSION,
  PASSENGER_FEE_CONTENT_HASH,
  type CreateReferralPassengerBookingCommand,
} from "@drts/contracts";
import * as compatibility from "../../../packages/passenger-client/src/fares/disclosure";
import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import {
  IdempotencyService,
  IdempotencyRepository,
} from "../../../apps/api/src/common/idempotency";
const version = PASSENGER_FEE_DISCLOSURE_VERSION;
const agree = { disclosureVersion: version, acknowledged: true as const };
async function unacknowledged() {
  const f = await domainFixture(),
    who = await f.identity();
  const q = await f.service.quoteReferralPassengerFare(f.route, who);
  const command: CreateReferralPassengerBookingCommand = {
    ...f.route,
    quoteId: q.quoteId,
    passengerName: "Fee synthetic rider",
    passengerPhone: "0912345678",
    idempotencyKey: "fee-command",
    feeDisclosureVersion: version,
    feeConfirmed: true,
  };
  return { ...f, who, q, command };
}
describe("E19 canonical fee agreement and real SQL wire", () => {
  it("uses the exact eight fixed lines, four existing rows and one compatibility catalog", () => {
    expect(PASSENGER_FEE_ROWS.map(([a, b]) => a + b)).toEqual([
      "車資依核定運價含延滯計時",
      "預約費不另收",
      "取消費不收",
      "等待費不另收",
      "遺失物補償金不收",
      "汙損清潔費實支實付",
      "國道通行費經同意後實收",
      "優惠活動目前無",
    ]);
    expect(PASSENGER_CONFIRMATION_ROWS).toEqual([
      "車資依核定運價計費（含延滯計時）",
      "預約費、取消費、等待費：不另收",
      "國道通行費經您同意行駛後實收",
      "車內汙損清潔費實支實付",
    ]);
    expect(compatibility.PASSENGER_FEE_ROWS).toBe(PASSENGER_FEE_ROWS);
    expect(
      createHash("sha256")
        .update(
          JSON.stringify({
            feeRows: PASSENGER_FEE_ROWS,
            confirmationRows: PASSENGER_CONFIRMATION_ROWS,
          }),
        )
        .digest("hex"),
    ).toBe(PASSENGER_FEE_CONTENT_HASH);
  });
  it("does not mistake normal privacy consent for first fee consent", async () => {
    const f = await unacknowledged();
    expect(await f.service.getReferralFeeStatus(f.who)).toMatchObject({
      disclosureVersion: version,
      acknowledgedAt: null,
    });
    await expect(
      f.service.createReferralPassengerBooking(f.command, f.who),
    ).rejects.toMatchObject({ code: "FEE_DISCLOSURE_REQUIRED" });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
  });
  it("uses the actual controller/service/SQL acknowledgement and reads it after a new service", async () => {
    const f = await unacknowledged();
    const controller = new OwnedMobilityController(
      f.service,
      new IdempotencyService(new IdempotencyRepository()),
    );
    f.db.clock = "2026-10-20T00:00:00.000Z";
    const ack = await controller.acknowledgeReferralFees(agree, f.who);
    expect(ack.data).toMatchObject({
      acknowledgedAt: f.db.clock,
      contentHash: PASSENGER_FEE_CONTENT_HASH,
    });
    expect(
      (await f.newService().getReferralFeeStatus(f.who)).acknowledgedAt,
    ).toBe(f.db.clock);
  });
  it("keeps the first DB time when the same version is acknowledged again", async () => {
    const f = await unacknowledged();
    f.db.clock = "2026-10-20T00:00:00Z";
    const first = await f.service.acknowledgeReferralFees(agree, f.who);
    f.db.clock = "2026-10-20T01:00:00Z";
    expect(await f.service.acknowledgeReferralFees(agree, f.who)).toEqual(
      first,
    );
    expect(
      f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").size,
    ).toBe(1);
  });
  it("recovers a lost first-ack COMMIT response with a normal same-version read/retry", async () => {
    const f = await unacknowledged();
    f.db.commitAckLost = true;
    await expect(
      f.service.acknowledgeReferralFees(agree, f.who),
    ).rejects.toThrow("lost COMMIT ACK");
    const stored = await f.service.getReferralFeeStatus(f.who);
    expect(stored.acknowledgedAt).toBeTruthy();
    expect(await f.service.acknowledgeReferralFees(agree, f.who)).toEqual(
      stored,
    );
  });
  it("does not lend another canonical passenger's version agreement", async () => {
    const f = await unacknowledged();
    await f.service.acknowledgeReferralFees(agree, f.who);
    const other = await f.identity("other-fee-passenger");
    expect(
      (await f.service.getReferralFeeStatus(other)).acknowledgedAt,
    ).toBeNull();
  });
  it.each([
    null,
    { realm: "platform", actorType: "platform_admin" },
    { realm: "partner", actorType: "referral_passenger", scopes: [] },
  ])(
    "rejects missing or foreign authority before a fee write %#",
    async (value) => {
      const f = await unacknowledged();
      await expect(
        f.service.acknowledgeReferralFees(agree, value as never),
      ).rejects.toBeDefined();
      expect(
        f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").size,
      ).toBe(0);
    },
  );
  it.each([
    { disclosureVersion: "old-version", acknowledged: true },
    { disclosureVersion: version, acknowledged: false },
    { ...agree, acknowledgedAt: "2000-01-01" },
    { ...agree, drtsPassengerId: "foreign" },
  ])(
    "rejects stale, implicit or caller-owned acknowledgement fields %#",
    async (body) => {
      const f = await unacknowledged();
      await expect(
        f.service.acknowledgeReferralFees(body as never, f.who),
      ).rejects.toBeDefined();
      expect(
        f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").size,
      ).toBe(0);
    },
  );
  it.each([false, undefined])(
    "requires a distinct explicit per-order confirmation %s",
    async (flag) => {
      const f = await unacknowledged();
      await f.service.acknowledgeReferralFees(agree, f.who);
      const command = { ...f.command };
      if (flag === undefined) delete command.feeConfirmed;
      else command.feeConfirmed = flag;
      await expect(
        f.service.createReferralPassengerBooking(command, f.who),
      ).rejects.toMatchObject({ code: "FEE_CONFIRMATION_REQUIRED" });
      expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
    },
  );
  it("refreshes unconsumed old disclosure quotes rather than manufacturing agreement", async () => {
    const f = await unacknowledged();
    await f.service.acknowledgeReferralFees(agree, f.who);
    f.db
      .table("ops.phase1_referral_fare_quote_snapshots")
      .get(f.q.quoteId).feeDisclosureVersion = "prior";
    await expect(
      f.service.createReferralPassengerBooking(f.command, f.who),
    ).rejects.toMatchObject({ code: "FEE_DISCLOSURE_CHANGED" });
  });
  it("commits the fee snapshot with quote/order/route and returns the same durable server time", async () => {
    const f = await unacknowledged();
    await f.service.acknowledgeReferralFees(agree, f.who);
    const ack = await f.service.createReferralPassengerBooking(
      f.command,
      f.who,
    );
    const order = f.db.table("ops.phase1_owned_orders").get(ack.orderId);
    const snapshot = f.db
      .table("ops.phase1_referral_order_fee_confirmations")
      .get(ack.orderId);
    expect(snapshot).toEqual(order.referralPassengerLifecycle.feeConfirmation);
    expect(snapshot).toMatchObject({
      orderId: ack.orderId,
      quoteId: f.q.quoteId,
      disclosureVersion: version,
      contentHash: PASSENGER_FEE_CONTENT_HASH,
      quotedFareRuleVersion: f.q.quotedFareRuleVersion,
    });
    expect(snapshot.quotedFareRuleVersion).not.toBe(version);
    const writes = f.db.calls.filter(
      (c) =>
        c.sql.startsWith(
          "INSERT INTO ops.phase1_referral_order_fee_confirmations",
        ) ||
        c.sql.startsWith("INSERT INTO ops.phase1_owned_orders") ||
        c.sql.startsWith(
          "INSERT INTO mobility.phase1_order_partner_notification_routes",
        ),
    );
    expect(writes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(writes.map((c) => c.transaction)).size).toBe(1);
    expect(writes[0]!.transaction).not.toBeNull();
    const peer = f.newService();
    const replay = await peer.createReferralPassengerBooking(f.command, f.who);
    expect(replay).toMatchObject({
      orderId: ack.orderId,
      replayed: true,
      feeConfirmation: snapshot,
    });
    const history = await peer.listReferralPassengerHistory(f.who);
    expect(
      history.items.find((i) => i.orderId === ack.orderId)?.feeConfirmation,
    ).toEqual(snapshot);
  });
  it.each([
    /INSERT INTO ops.phase1_referral_order_fee_confirmations/,
    /INSERT INTO mobility.phase1_order_partner_notification_routes/,
  ])(
    "rolls back all per-order facts on a real wire failure %s",
    async (pattern) => {
      const f = await unacknowledged();
      await f.service.acknowledgeReferralFees(agree, f.who);
      f.db.failSql = pattern;
      await expect(
        f.service.createReferralPassengerBooking(f.command, f.who),
      ).rejects.toBeDefined();
      expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
      expect(
        f.db.table("ops.phase1_referral_order_fee_confirmations").size,
      ).toBe(0);
      expect(
        f.db.table("ops.phase1_referral_fare_quote_snapshots").get(f.q.quoteId)
          .consumedByOrderId,
      ).toBeNull();
      expect(
        (await f.service.getReferralFeeStatus(f.who)).acknowledgedAt,
      ).toBeTruthy();
      expect(f.service.listOrders()).toHaveLength(0);
    },
  );
  it("retains one same fee snapshot after lost booking COMMIT ACK", async () => {
    const f = await unacknowledged();
    await f.service.acknowledgeReferralFees(agree, f.who);
    f.db.commitAckLost = true;
    const recovered = await f.service.createReferralPassengerBooking(
      f.command,
      f.who,
    );
    const replay = await f
      .newService()
      .createReferralPassengerBooking(f.command, f.who);
    expect(replay).toMatchObject({
      orderId: recovered.orderId,
      replayed: true,
      feeConfirmation: recovered.feeConfirmation,
    });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(1);
  });
  it.each([{ feeConfirmed: false }, { feeDisclosureVersion: "changed" }])(
    "cannot remove or change a committed fee intent %#",
    async (change) => {
      const f = await unacknowledged();
      await f.service.acknowledgeReferralFees(agree, f.who);
      await f.service.createReferralPassengerBooking(f.command, f.who);
      await expect(
        f.service.createReferralPassengerBooking(
          { ...f.command, ...change },
          f.who,
        ),
      ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    },
  );
  it("recovers the exact committed pre-fee intent without upgrading its original body/key", async () => {
    const f = await unacknowledged();
    await f.service.acknowledgeReferralFees(agree, f.who);
    const ack = await f.service.createReferralPassengerBooking(
      f.command,
      f.who,
    );
    const original = { ...f.command };
    delete original.feeConfirmed;
    delete original.feeDisclosureVersion;
    const order = f.db.table("ops.phase1_owned_orders").get(ack.orderId);
    delete order.referralPassengerLifecycle.bookingIntent.feeConfirmed;
    delete order.referralPassengerLifecycle.bookingIntent.feeDisclosureVersion;
    delete order.referralPassengerLifecycle.feeConfirmation;
    f.db.table("ops.phase1_referral_order_fee_confirmations").clear();
    f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").clear();
    const quote = order.referralPassengerLifecycle.quote;
    delete quote.feeDisclosureVersion;
    delete quote.feeContentHash;
    quote.expiresAt = new Date(Date.parse(quote.createdAt) + 1).toISOString();
    const before = JSON.stringify(original);
    const replay = await f
      .newService()
      .createReferralPassengerBooking(original, f.who);
    expect(replay).toMatchObject({
      orderId: ack.orderId,
      replayed: true,
      feeConfirmation: null,
    });
    expect(JSON.stringify(original)).toBe(before);
    expect(f.db.table("ops.phase1_referral_order_fee_confirmations").size).toBe(
      0,
    );
  });
  it("does not credit a prior disclosure version as the current first agreement", async () => {
    const f = await unacknowledged();
    const owner = {
      tenantId: f.who.tenantId,
      partnerId: f.who.partnerId,
      partnerProgramId: f.who.partnerProgramId,
      entrySlug: f.entry.entrySlug,
      drtsPassengerId: f.who.drtsPassengerId,
    };
    const prior = await f.repository.acknowledgeReferralFees(
      owner,
      "prior-disclosure",
      "a".repeat(64),
    );
    expect(prior).toMatchObject({
      ...owner,
      disclosureVersion: "prior-disclosure",
    });
    const stored = [
      ...f.db
        .table("ops.phase1_referral_passenger_fee_acknowledgements")
        .values(),
    ];
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject(owner);
    expect(
      (await f.service.getReferralFeeStatus(f.who)).acknowledgedAt,
    ).toBeNull();
    await expect(
      f.service.createReferralPassengerBooking(f.command, f.who),
    ).rejects.toMatchObject({ code: "FEE_DISCLOSURE_REQUIRED" });
  });
  it("rolls back an unacknowledged first consent when its SQL write fails", async () => {
    const f = await unacknowledged();
    f.db.failSql =
      /INSERT INTO ops.phase1_referral_passenger_fee_acknowledgements/;
    await expect(
      f.service.acknowledgeReferralFees(agree, f.who),
    ).rejects.toThrow("controlled storage write failure");
    expect(
      f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").size,
    ).toBe(0);
  });
  it.each([
    "tenantId",
    "partnerId",
    "partnerProgramId",
    "partnerEntrySlug",
  ] as const)(
    "rejects spoofed first-ack %s using actual entry authority",
    async (key) => {
      const f = await unacknowledged();
      await expect(
        f.service.acknowledgeReferralFees(agree, {
          ...f.who,
          [key]: "foreign",
        }),
      ).rejects.toBeDefined();
      expect(
        f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").size,
      ).toBe(0);
    },
  );
  it("fails closed when the actual repository is disabled", async () => {
    const f = await unacknowledged();
    vi.spyOn(f.db, "isEnabled").mockReturnValue(false);
    await expect(
      f.service.acknowledgeReferralFees(agree, f.who),
    ).rejects.toBeDefined();
    expect(
      f.db.table("ops.phase1_referral_passenger_fee_acknowledgements").size,
    ).toBe(0);
  });
});
