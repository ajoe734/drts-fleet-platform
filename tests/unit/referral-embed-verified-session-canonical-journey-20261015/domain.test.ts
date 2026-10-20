import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { domainFixture } from "./domain-fixture";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import type { DispatchAssignmentRecord } from "@drts/contracts";

function currentAssignment(orderId: string): DispatchAssignmentRecord {
  const now = new Date().toISOString();
  return {
    assignmentId: "unit-current-assignment",
    dispatchJobId: "unit-current-job",
    orderId,
    taskId: "unit-current-task",
    driverId: "unit-current-driver",
    vehicleId: "unit-current-vehicle",
    assignmentType: "metered",
    status: "assigned",
    acceptedAt: null,
    rejectedAt: null,
    rejectReasonCode: null,
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T02:00:00Z"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("real referral quote/repository/create continuity over controlled storage", () => {
  it("uses the published taxi engine and actual route, commits quote/order/notification together", async () => {
    const f = await domainFixture(),
      who = await f.identity();
    const command = await f.command(who);
    const before = f.db
      .table("ops.phase1_referral_fare_quote_snapshots")
      .get(command.quoteId);
    expect(before).toMatchObject({
      estimatedMin: 265,
      estimatedMax: 340,
      estimatedMinMinor: 26500,
      estimatedMaxMinor: 34000,
      fixedPrice: false,
      isGuaranteed: false,
      businessDispatchSubtype: "enterprise_dispatch",
      quotedFareRuleVersion: "unit-published-taxi-v1",
    });
    expect(f.geo.route).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: expect.objectContaining({ lat: 25.06, lng: 121.52 }),
        destination: expect.objectContaining({ lat: 25.08, lng: 121.24 }),
      }),
    );
    const created = await f.service.createReferralPassengerBooking(
      command,
      who,
    );
    const order = f.db.table("ops.phase1_owned_orders").get(created.orderId);
    const quote = f.db
      .table("ops.phase1_referral_fare_quote_snapshots")
      .get(command.quoteId);
    expect(order).toMatchObject({
      fixedPrice: false,
      quotedFare: { currency: "TWD", amountMinor: 26500 },
      referralPassengerLifecycle: {
        quote: { quoteId: command.quoteId, consumedByOrderId: created.orderId },
        bookingIntent: { quoteId: command.quoteId },
      },
    });
    expect(quote.consumedByOrderId).toBe(created.orderId);
    expect(order.referralPassengerLifecycle.confirmedAt).toBe(quote.consumedAt);
    expect(
      f.db
        .table("mobility.phase1_order_partner_notification_routes")
        .has(created.orderId),
    ).toBe(true);
    const writes = f.db.calls.filter((c) =>
      /^(UPDATE ops.phase1_referral|INSERT INTO ops.phase1_owned_orders|INSERT INTO mobility.phase1_order_partner)/.test(
        c.sql,
      ),
    );
    expect(new Set(writes.map((c) => c.transaction)).size).toBe(1);
    expect(writes[0]?.transaction).not.toBeNull();
  });
  it.each(["fresh", "processing"])(
    "recovers the durable original before expiry/lead checks with %s cache",
    async () => {
      const f = await domainFixture(),
        who = await f.identity(),
        command = await f.command(who);
      const first = await f.service.createReferralPassengerBooking(
        command,
        who,
      );
      const cache = vi
        .spyOn(f.service.getIdempotencyService(), "execute")
        .mockRejectedValue(new Error("cache must not be authority"));
      vi.setSystemTime(new Date(Date.now() + 3600000));
      const replay = await f.service.createReferralPassengerBooking(
        command,
        who,
      );
      expect(replay).toMatchObject({ orderId: first.orderId, replayed: true });
      expect(cache).not.toHaveBeenCalled();
      expect(f.db.table("ops.phase1_owned_orders").size).toBe(1);
    },
  );
  it("recovers a lost COMMIT ACK from the fully persisted original, never allocates a second order", async () => {
    const f = await domainFixture(),
      who = await f.identity(),
      command = await f.command(who);
    f.db.commitAckLost = true;
    const result = await f.service.createReferralPassengerBooking(command, who);
    expect(result.replayed).toBe(true);
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(1);
    expect(
      f.db
        .table("mobility.phase1_order_partner_notification_routes")
        .has(result.orderId),
    ).toBe(true);
    expect(
      (await f.service.createReferralPassengerBooking(command, who)).orderId,
    ).toBe(result.orderId);
  });
  it.each([
    /INSERT INTO ops.phase1_owned_orders/,
    /INSERT INTO mobility.phase1_order_partner_notification_routes/,
  ])(
    "rolls back consumption, order and route together on %s failure",
    async (fault) => {
      const f = await domainFixture(),
        who = await f.identity(),
        command = await f.command(who);
      f.db.failSql = fault;
      const creating = f.service.createReferralPassengerBooking(command, who);
      if (fault.source.includes("notification"))
        await expect(creating).rejects.toMatchObject({
          code: "FARE_QUOTE_UNAVAILABLE",
        });
      else
        await expect(creating).rejects.toThrow(
          "controlled storage write failure",
        );
      expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
      expect(
        f.db.table("mobility.phase1_order_partner_notification_routes").size,
      ).toBe(0);
      expect(
        f.db
          .table("ops.phase1_referral_fare_quote_snapshots")
          .get(command.quoteId).consumedAt,
      ).toBeNull();
      expect(f.service.listOrders()).toHaveLength(0);
    },
  );
  it("reads the database wall clock after the quote lock, rejecting expiry during its wait", async () => {
    const f = await domainFixture(),
      who = await f.identity(),
      command = await f.command(who);
    const quote = f.db
      .table("ops.phase1_referral_fare_quote_snapshots")
      .get(command.quoteId);
    f.db.afterQuoteLock = () => {
      f.db.clock = quote.expiresAt;
    };
    await expect(
      f.service.createReferralPassengerBooking(command, who),
    ).rejects.toMatchObject({ code: "FARE_QUOTE_EXPIRED" });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
    const lock = f.db.calls.findIndex((c) =>
      c.sql.startsWith("SELECT quote_id"),
    );
    expect(f.db.calls[lock + 1]?.sql).toBe("SELECT clock_timestamp() AS now");
  });
  it.each([
    { pickupAddress: "another pickup" },
    { passengerPhone: "0988888888" },
    { vehicleType: "another" },
  ])("rejects changed same-key intent after commit: %j", async (change) => {
    const f = await domainFixture(),
      who = await f.identity(),
      command = await f.command(who);
    await f.service.createReferralPassengerBooking(command, who);
    await expect(
      f.service.createReferralPassengerBooking({ ...command, ...change }, who),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(1);
  });
  it("does not expose private quote owner/tariff metadata in positive API readbacks", async () => {
    const f = await domainFixture(),
      who = await f.identity();
    const q = await f.service.quoteReferralPassengerFare(f.route, who);
    for (const field of [
      "tenantId",
      "partnerId",
      "drtsPassengerId",
      "tariffSnapshot",
      "serviceAreaEvaluation",
    ])
      expect(q).not.toHaveProperty(field);
    const c = await f.command(who),
      result = await f.service.createReferralPassengerBooking(c, who);
    expect((result as any).quote.quoteId).toBe(c.quoteId);
    expect(JSON.stringify((result as any).quote)).not.toContain(
      who.drtsPassengerId,
    );
  });
  it("rejects another genuine linked passenger's quote without consuming it", async () => {
    const f = await domainFixture(),
      who = await f.identity(),
      other = await f.identity("another");
    const command = await f.command(who);
    await expect(
      f.service.createReferralPassengerBooking(command, other),
    ).rejects.toMatchObject({ code: "FARE_QUOTE_FORBIDDEN" });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
  });
  it("revalidates a revoked identity link on the next business read with an otherwise unchanged identity", async () => {
    const f = await domainFixture(),
      who = await f.identity();
    // The administrative revocation writer is outside this unit; the real
    // authority receives its next canonical repository read as revoked.
    const link = await f.links.findByDrtsPassengerId(
      f.entry.entrySlug,
      who.drtsPassengerId,
    );
    vi.spyOn(f.links, "findByDrtsPassengerId").mockResolvedValue({
      ...link!,
      status: "revoked",
    });
    await expect(
      f.service.getReferralPassengerActiveTrip(who),
    ).rejects.toMatchObject({ code: "REFERRAL_HANDOFF_REVOKED" });
  });
  it.each(["cold", "previous", "current"])(
    "reads current persisted assignment with an independent %s task cache",
    async (cache) => {
      const f = await domainFixture(),
        who = await f.identity(),
        command = await f.command(who),
        created = await f.service.createReferralPassengerBooking(command, who);
      const order = f.db.table("ops.phase1_owned_orders").get(created.orderId);
      order.status = "assigned";
      const reader = f.newService();
      const suffix = cache === "current" ? "current" : "previous";
      // Independent process snapshots: only the fields read by the old resolver
      // are material here; all order/identity/quote reads use the real domain.
      const localAssignment = {
        orderId: created.orderId,
        driverId: `unit-${suffix}-driver`,
        vehicleId: `unit-${suffix}-vehicle`,
        status: "assigned",
      };
      Reflect.set(
        reader,
        "driverTasks",
        cache === "cold" ? [] : [localAssignment],
      );
      Reflect.set(
        reader,
        "dispatchAssignments",
        cache === "cold" ? [] : [localAssignment],
      );
      const registry = Reflect.get(reader, "regulatoryRegistryService");
      vi.spyOn(registry, "listDrivers").mockReturnValue([
        { driverId: "unit-previous-driver", name: "Previous driver" },
        { driverId: "unit-current-driver", name: "Current driver" },
      ]);
      vi.spyOn(registry, "listVehicles").mockReturnValue([
        { vehicleId: "unit-previous-vehicle", plateNo: "UNIT-PREVIOUS" },
        { vehicleId: "unit-current-vehicle", plateNo: "UNIT-CURRENT" },
      ]);
      await f.repository.persistChanges({
        dispatchAssignments: [currentAssignment(created.orderId)],
      });
      const readsBefore = f.db.calls.length;
      const result = await reader.getReferralPassengerActiveTrip(who);
      expect(result).toMatchObject({
        active: true,
        trip: {
          orderId: created.orderId,
          status: "assigned",
          driverName: "Current driver",
          plateNumber: "UNIT-CURRENT",
          driverPhoneMasked: null,
        },
      });
      expect(
        f.db.calls
          .slice(readsBefore)
          .filter((call) =>
            call.sql.includes("AS record FROM ops.phase1_owned_orders o WHERE"),
          )
          .map((call) => call.values),
      ).toEqual([[created.orderId]]);
      expect(registry.listDrivers).toHaveBeenCalledOnce();
      expect(registry.listVehicles).toHaveBeenCalledOnce();
      expect(f.db.table("ops.phase1_owned_orders").size).toBe(1);
    },
  );
  it.each(["absent", "unavailable"])(
    "does not fall back to stale task/assignment/candidate when current persisted assignment is %s",
    async (state) => {
      const f = await domainFixture(),
        who = await f.identity(),
        command = await f.command(who),
        created = await f.service.createReferralPassengerBooking(command, who);
      const order = f.db.table("ops.phase1_owned_orders").get(created.orderId);
      order.status = "assigned";
      order.dispatchCandidate = {
        driverName: "Stale candidate",
        plateNumber: "UNIT-STALE",
        driverPhoneMasked: "09**-stale",
      };
      const reader = f.newService();
      const stale = {
        orderId: created.orderId,
        driverId: "unit-previous-driver",
        vehicleId: "unit-previous-vehicle",
        status: "assigned",
      };
      Reflect.set(reader, "driverTasks", [stale]);
      Reflect.set(reader, "dispatchAssignments", [stale]);
      if (state === "unavailable")
        f.db.failSql = /^SELECT jsonb_build_object\(/;
      const reading = reader.getReferralPassengerActiveTrip(who);
      if (state === "unavailable")
        await expect(reading).rejects.toThrow(
          "controlled storage write failure",
        );
      else
        expect(await reading).toMatchObject({
          active: true,
          trip: {
            orderId: created.orderId,
            driverName: null,
            plateNumber: null,
            driverPhoneMasked: null,
          },
        });
    },
  );
  it.each(["0", "2027-02-30T12:00:00Z", "2026-01-01T12:00:00Z"])(
    "rejects invalid/past scheduling %s without minting an estimate",
    async (scheduledAt) => {
      const f = await domainFixture(),
        who = await f.identity();
      await expect(
        f.service.quoteReferralPassengerFare({ ...f.route, scheduledAt }, who),
      ).rejects.toBeDefined();
      expect(f.db.table("ops.phase1_referral_fare_quote_snapshots").size).toBe(
        0,
      );
    },
  );
  it.each([
    "missing-tariff",
    "ambiguous-tariff",
    "uncovered-stop",
    "minor-overflow",
  ])("fails closed without a fabricated estimate: %s", async (fault) => {
    const f = await domainFixture(),
      who = await f.identity();
    if (fault === "missing-tariff") f.db.tariffs = [];
    if (fault === "ambiguous-tariff") f.db.tariffs.push({ ...f.db.tariffs[0] });
    if (fault === "minor-overflow")
      f.db.tariffs[0] = {
        ...f.db.tariffs[0],
        base_fare: Number.MAX_SAFE_INTEGER - 500,
      };
    if (fault === "uncovered-stop")
      f.geo.resolve.mockResolvedValueOnce({
        address: { address: "outside", lat: 10, lng: 100 },
      } as never);
    await expect(
      f.service.quoteReferralPassengerFare(f.route, who),
    ).rejects.toBeDefined();
    expect(f.db.table("ops.phase1_referral_fare_quote_snapshots").size).toBe(0);
  });
  it("does not let an unbacked completed cache result bypass durable committed-intent validation", async () => {
    const f = await domainFixture(),
      who = await f.identity(),
      command = await f.command(who);
    vi.spyOn(f.service.getIdempotencyService(), "execute").mockResolvedValue({
      data: { orderId: "not-a-durable-order" },
      isReplay: true,
    } as never);
    await expect(
      f.service.createReferralPassengerBooking(command, who),
    ).rejects.toMatchObject({ code: "FARE_QUOTE_UNAVAILABLE" });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(0);
  });
  it("checks the consumed order owner before classifying its different idempotency key", async () => {
    const f = await domainFixture(),
      who = await f.identity(),
      other = await f.identity("other-subject");
    const ownCommand = await f.command(who),
      foreignCommand = await f.command(other);
    const foreign = await f.service.createReferralPassengerBooking(
      foreignCommand,
      other,
    );
    const snapshot = f.db
      .table("ops.phase1_referral_fare_quote_snapshots")
      .get(ownCommand.quoteId);
    snapshot.consumedByOrderId = foreign.orderId;
    snapshot.consumedAt = new Date().toISOString();
    await expect(
      f.service.createReferralPassengerBooking(ownCommand, who),
    ).rejects.toMatchObject({ code: "FARE_QUOTE_FORBIDDEN", status: 403 });
    expect(f.db.table("ops.phase1_owned_orders").size).toBe(1);
  });
  it("returns only the same-order cancellation acknowledgement, never the internal owned order or subject", async () => {
    const f = await domainFixture(),
      who = await f.identity(),
      command = await f.command(who);
    const booking = await f.service.createReferralPassengerBooking(
      command,
      who,
    );
    const controller = new OwnedMobilityController(
      f.service,
      f.service.getIdempotencyService(),
      f.partner,
    );
    const result = await controller.cancelReferralPassengerTrip(
      booking.orderId,
      { orderId: booking.orderId, reason: "Unit cancellation" },
      who,
    );
    expect(Object.keys(result.data).sort()).toEqual([
      "cancelledAt",
      "orderId",
      "status",
    ]);
    expect(result.data).toMatchObject({
      orderId: booking.orderId,
      status: "cancelled",
    });
    expect(JSON.stringify(result.data)).not.toContain(who.drtsPassengerId);
  });
});

describe("referral rating and canonical CRM share the owned-order transaction", () => {
  async function completed() {
    const f = await domainFixture(),
      who = await f.identity(),
      command = await f.command(who);
    const created = await f.service.createReferralPassengerBooking(
      command,
      who,
    );
    // This suite controls the durable completion read port. The original C022
    // lifecycle test separately traverses the real driver completion methods.
    const order = f.db.table("ops.phase1_owned_orders").get(created.orderId);
    order.status = "completed";
    return { ...f, who, order };
  }
  it.each([false, true])(
    "creates one same-order low-rating case independently of contact=%s and preserves later Ops state",
    async (contactRequested) => {
      const f = await completed();
      const command = {
        orderId: f.order.orderId,
        score: 2 as const,
        contactRequested,
        tags: ["service"],
        comment: "Unit feedback",
      };
      const first = await f.service.submitReferralPassengerRating(
        f.order.orderId,
        command,
        f.who,
      );
      expect(first).toMatchObject({
        orderId: f.order.orderId,
        score: 2,
        contactRequested,
        complaintCaseNo: expect.any(String),
      });
      const cases = f.db.table("crm.phase1_complaint_cases");
      expect(cases.size).toBe(1);
      const c = cases.get(first.complaintCaseNo!);
      expect(c).toMatchObject({
        relatedOrderId: f.order.orderId,
        status: "new",
      });
      expect(c.description).toContain(
        contactRequested ? "同意客服聯繫" : "不需客服聯繫",
      );
      c.status = "under_investigation";
      const replay = await f.service.submitReferralPassengerRating(
        f.order.orderId,
        command,
        f.who,
      );
      expect(replay).toEqual(first);
      expect(cases.get(first.complaintCaseNo!)?.status).toBe(
        "under_investigation",
      );
      const writes = f.db.calls.filter((c) =>
        /INSERT INTO (crm.phase1_complaint_|ops.phase1_owned_orders)/.test(
          c.sql,
        ),
      );
      expect(
        writes
          .slice(-3)
          .every(
            (c) =>
              c.transaction === writes.at(-1)?.transaction &&
              c.transaction !== null,
          ),
      ).toBe(true);
      expect(
        f.db.calls.some((c) =>
          /passenger\.(accounts|trip_ratings|complaints)/.test(c.sql),
        ),
      ).toBe(false);
    },
  );
  it.each([
    /INSERT INTO crm.phase1_complaint_timelines/,
    /INSERT INTO ops.phase1_owned_orders/,
  ])("rolls back case, timeline and rating on %s", async (fault) => {
    const f = await completed();
    f.db.failSql = fault;
    await expect(
      f.service.submitReferralPassengerRating(
        f.order.orderId,
        { orderId: f.order.orderId, score: 1, contactRequested: false },
        f.who,
      ),
    ).rejects.toThrow("controlled storage write failure");
    expect(f.db.table("crm.phase1_complaint_cases").size).toBe(0);
    expect(f.db.table("crm.phase1_complaint_timelines").size).toBe(0);
    expect(
      f.db.table("ops.phase1_owned_orders").get(f.order.orderId)
        .referralPassengerLifecycle.rating,
    ).toBeUndefined();
  });
  it("recovers a rating COMMIT ACK loss and returns the original case/timeline, not a new case", async () => {
    const f = await completed();
    f.db.commitAckLost = true;
    const command = {
      orderId: f.order.orderId,
      score: 1 as const,
      contactRequested: false,
    };
    const first = await f.service.submitReferralPassengerRating(
      f.order.orderId,
      command,
      f.who,
    );
    expect(
      await f.service.submitReferralPassengerRating(
        f.order.orderId,
        command,
        f.who,
      ),
    ).toEqual(first);
    expect(f.db.table("crm.phase1_complaint_cases").size).toBe(1);
    expect(f.db.table("crm.phase1_complaint_timelines").size).toBe(1);
  });
  it("rejects a changed explicit contact choice and never reclassifies missing rating provenance as legacy", async () => {
    const f = await completed(),
      command = {
        orderId: f.order.orderId,
        score: 1 as const,
        contactRequested: false,
      };
    await f.service.submitReferralPassengerRating(
      f.order.orderId,
      command,
      f.who,
    );
    await expect(
      f.service.submitReferralPassengerRating(
        f.order.orderId,
        { ...command, contactRequested: true },
        f.who,
      ),
    ).rejects.toMatchObject({ code: "PASSENGER_RATING_ALREADY_SUBMITTED" });
    delete f.db.table("ops.phase1_owned_orders").get(f.order.orderId)
      .referralPassengerLifecycle.rating.policyVersion;
    await expect(
      f.service.submitReferralPassengerRating(f.order.orderId, command, f.who),
    ).rejects.toMatchObject({
      code: "PASSENGER_COMPLAINT_STORAGE_UNAVAILABLE",
    });
  });
  it("does not report the estimate or fabricated fare components as an actual completed-trip charge", async () => {
    const f = await completed();
    const receipt = await f.service.getReferralPassengerReceipt(
      f.order.orderId,
      f.who,
    );
    expect(receipt).toMatchObject({
      totalFare: null,
      fareBase: null,
      fareDistance: null,
      fareTime: null,
      formattedTotal: "實際車資待確認",
    });
    expect(receipt.quote?.estimatedMin).toBe(265);
  });
  it("maps only actual completed-task minor-unit amounts/components, preserving fractional TWD and unknown settlement", async () => {
    const f = await completed();
    f.db.table("ops.phase1_driver_tasks").set("actual-task", {
      taskId: "actual-task",
      orderId: f.order.orderId,
      status: "completed",
      completedAt: "2026-10-20T02:00:00Z",
      fare: { currency: "NTD", amountMinor: 28650 },
      actualFareBreakdown: {
        startMinor: 8500,
        distanceMinor: 18050,
        delayMinor: 0,
        nightMinor: 2000,
      },
    });
    const receipt = await f.service.getReferralPassengerReceipt(
      f.order.orderId,
      f.who,
    );
    expect(receipt).toMatchObject({
      totalFare: 286.5,
      fareBase: 85,
      fareDistance: 180.5,
      fareTime: 0,
      fareNight: 20,
      completedAt: "2026-10-20T02:00:00Z",
      paymentChannel: "付款及結算狀態未提供",
    });
    expect(receipt.totalFare).not.toBe(receipt.quote?.estimatedMin);
    expect(receipt.passengerPhoneMasked).not.toContain("0912345678");
  });
  it.each([
    { currency: "USD", amountMinor: 28650 },
    { currency: "NTD", amountMinor: NaN },
  ])(
    "does not label invalid or foreign task money as actual TWD: %j",
    async (fare) => {
      const f = await completed();
      f.db.table("ops.phase1_driver_tasks").set("actual-task", {
        taskId: "actual-task",
        orderId: f.order.orderId,
        status: "completed",
        fare,
      });
      const receipt = await f.service.getReferralPassengerReceipt(
        f.order.orderId,
        f.who,
      );
      expect(receipt.totalFare).toBeNull();
      expect(receipt.formattedTotal).toBe("實際車資待確認");
    },
  );
});
