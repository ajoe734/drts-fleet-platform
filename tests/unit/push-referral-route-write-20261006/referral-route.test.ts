import type { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { domainFixture } from "../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import type {
  ConsumerNotificationOutboxRecord,
  DriverTaskRecord,
} from "@drts/contracts";
import { harness as transportHarness } from "../system-remediation/sr-partner-notify-transport-20260918/transport-harness";
import { buildOrderFixture } from "../../../apps/api/tests/integration/voice-order-fixture";
import { resolveOrderPartnerNotificationRoute } from "../../../apps/api/src/modules/tenant-partner/order-partner-notification-route";
import { TenantPartnerModule } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.module";
import { OwnedMobilityModule } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.module";
import { MultiTaxiModule } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.module";
import { PartnerUserIdentityLinkRepository } from "../../../apps/api/src/modules/tenant-partner/partner-user-identity-link.repository";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

// Actual quote/authority/repositories; only SQL I/O/faults are controlled.
async function harness() {
  const f = await domainFixture(),
    identity = await f.identity("opaque-partner-recipient");
  const command = await f.command(identity);
  Reflect.set(f.service, "callcenterService", new CallcenterService(f.audit));
  const link = await f.links.findByDrtsPassengerId(
    identity.partnerEntrySlug,
    identity.drtsPassengerId,
  );
  if (!link) throw new Error("Normal identity link was not created");
  const findByDrtsPassengerId = vi
    .spyOn(f.links, "findByDrtsPassengerId")
    .mockResolvedValue(link);
  const queryBase = f.db.query.bind(f.db),
    connectBase = f.db.connect.bind(f.db);
  const statements: string[] = [];
  const query = vi.fn(
    async (
      sql: string,
      values: readonly unknown[] = [],
      execute: (
        sql: string,
        values: readonly unknown[],
      ) => ReturnType<typeof f.db.query> = queryBase,
    ) => {
      statements.push(sql.replace(/\s+/g, " ").trim());
      return execute(sql, values);
    },
  );
  vi.spyOn(f.db, "query").mockImplementation((sql, values = []) =>
    query(sql, values, queryBase),
  );
  vi.spyOn(f.db, "connect").mockImplementation(async () => {
    const client = await connectBase(),
      execute = client.query.bind(client);
    client.query = (sql, values = []) => query(sql, values, execute);
    return client;
  });
  const events = Reflect.get(
    f.service,
    "opsDispatchEventsService",
  ) as OpsDispatchEventsService;
  const emit = events.publishOrderCreated.bind(events);
  const publish = vi
    .spyOn(events, "publishOrderCreated")
    .mockImplementation(
      (
        ...args: Parameters<OpsDispatchEventsService["publishOrderCreated"]>
      ) => {
        statements.push("PUBLISH");
        return emit(...args);
      },
    );
  const allocator = new MultiTaxiRepository(f.db as never);
  return {
    ...f,
    identity,
    command,
    query,
    publish,
    allocator,
    tenant: f.partner,
    links: { findByDrtsPassengerId },
    link,
    database: f.db,
    get routes() {
      return f.db.table("mobility.phase1_order_partner_notification_routes");
    },
    get sequences() {
      return f.db.table("mobility.phase1_partner_notification_sequences");
    },
    statements,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("referral embed notification route", () => {
  it("persists the trusted route and sequence before publishing the committed booking", async () => {
    const h = await harness();
    const result = await h.service.createReferralPassengerBooking(
      h.command,
      h.identity,
    );
    expect(h.routes.get(result.orderId)).toMatchObject({
      tenant_id: h.identity.tenantId,
      partner_id: h.identity.partnerId,
      entry_slug: h.identity.partnerEntrySlug,
      partner_user_ref: h.link.partnerUserRef,
      drts_passenger_id: h.identity.drtsPassengerId,
      notification_policy_version: "partner_notification_v1",
      ride_ref: result.orderId,
    });
    expect(h.links.findByDrtsPassengerId).toHaveBeenCalledWith(
      h.identity.partnerEntrySlug,
      h.identity.drtsPassengerId,
    );
    const routeIndex = h.statements.findIndex((sql) =>
      sql.includes(
        "INSERT INTO mobility.phase1_order_partner_notification_routes",
      ),
    );
    const sequenceIndex = h.statements.findIndex((sql) =>
      sql.includes(
        "INSERT INTO mobility.phase1_partner_notification_sequences",
      ),
    );
    expect(routeIndex).toBeGreaterThan(h.statements.indexOf("BEGIN"));
    expect(sequenceIndex).toBeGreaterThan(routeIndex);
    expect(h.statements.indexOf("COMMIT")).toBeGreaterThan(sequenceIndex);
    expect(h.statements.indexOf("PUBLISH")).toBeGreaterThan(
      h.statements.indexOf("COMMIT"),
    );
  });
});

describe("referral route negative cases and replay", () => {
  it("writes the route for scheduled referral bookings too", async () => {
    const h = await harness();
    const input = {
      ...h.route,
      scheduledAt: new Date(Date.now() + 7200000).toISOString(),
    };
    const quote = await h.service.quoteReferralPassengerFare(input, h.identity);
    const booking = await h.service.createReferralPassengerBooking(
      {
        ...input,
        quoteId: quote.quoteId,
        passengerName: "Synthetic rider",
        passengerPhone: "0912345678",
      },
      h.identity,
    );
    expect(h.routes.get(booking.orderId)?.partner_user_ref).toBe(
      h.link.partnerUserRef,
    );
    expect(h.sequences.get(booking.orderId)?.next_sequence).toBe(1);
  });

  it("rolls back booking when the entry disappears at route resolution", async () => {
    const h = await harness();
    h.links.findByDrtsPassengerId.mockImplementation(async () => {
      // The current entry read succeeded, then the next authority/route read
      // disappears. R5 cannot commit a booking after that loss of authority.
      vi.spyOn(h.tenant, "getPartnerEntry").mockImplementation(() => {
        throw new Error("entry no longer available");
      });
      return h.link;
    });
    await expect(
      h.service.createReferralPassengerBooking(h.command, h.identity),
    ).rejects.toThrow("entry no longer available");
    expect(h.db.table("ops.phase1_owned_orders").size).toBe(0);
    expect(
      h.db
        .table("ops.phase1_referral_fare_quote_snapshots")
        .get(h.command.quoteId).consumedByOrderId,
    ).toBeNull();
    expect(h.routes.size).toBe(0);
    expect(h.sequences.size).toBe(0);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it.each(["missing", "revoked", "lookup-error", "missing-subject"])(
    "%s denies current authority before creating or routing a booking",
    async (mode) => {
      const h = await harness();
      if (mode === "missing")
        h.links.findByDrtsPassengerId.mockResolvedValue(null);
      if (mode === "revoked") h.link.status = "revoked";
      if (mode === "lookup-error")
        h.links.findByDrtsPassengerId.mockRejectedValue(
          new Error("lookup unavailable"),
        );
      const actor =
        mode === "missing-subject"
          ? { ...h.identity, drtsPassengerId: null, actorId: null }
          : h.identity;
      const attempt = h.service.createReferralPassengerBooking(
        h.command,
        actor,
      );
      if (mode === "lookup-error")
        await expect(attempt).rejects.toThrow("lookup unavailable");
      else
        await expect(attempt).rejects.toMatchObject({
          status: 403,
          code:
            mode === "missing-subject"
              ? "REFERRAL_PASSENGER_IDENTITY_REQUIRED"
              : "REFERRAL_HANDOFF_REVOKED",
        });
      expect(h.db.table("ops.phase1_owned_orders").size).toBe(0);
      expect(
        h.db
          .table("ops.phase1_referral_fare_quote_snapshots")
          .get(h.command.quoteId).consumedByOrderId,
      ).toBeNull();
      expect(h.publish).not.toHaveBeenCalled();
      expect(h.routes.size).toBe(0);
      expect(h.sequences.size).toBe(0);
    },
  );

  it("preserves entry mismatch 403 and rejects unknown caller recipient claims", async () => {
    const h = await harness();
    await expect(
      h.service.createReferralPassengerBooking(
        { ...h.command, entrySlug: "another-entry" },
        h.identity,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.links.findByDrtsPassengerId).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
    const spoofed = {
      ...h.command,
      partnerUserRef: "attacker",
      drtsPassengerId: "attacker",
      tenantId: "attacker",
      partnerId: "attacker",
    };
    await expect(
      h.service.createReferralPassengerBooking(spoofed, h.identity),
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
    expect(h.routes.size).toBe(0);
    expect(h.db.table("ops.phase1_owned_orders").size).toBe(0);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it("does not repeat route writes or overwrite recipient/sequence on API replay", async () => {
    const h = await harness();
    const input = { ...h.command, idempotencyKey: "referral-route-replay" };
    const first = await h.service.createReferralPassengerBooking(
      input,
      h.identity,
    );
    h.link.partnerUserRef = "changed-after-booking";
    const replay = await h.service.createReferralPassengerBooking(
      input,
      h.identity,
    );
    expect(replay).toMatchObject({ orderId: first.orderId, replayed: true });
    expect(h.links.findByDrtsPassengerId).toHaveBeenCalledWith(
      h.identity.partnerEntrySlug,
      h.identity.drtsPassengerId,
    );
    expect(
      h.statements.filter((sql) =>
        sql.includes(
          "INSERT INTO mobility.phase1_order_partner_notification_routes",
        ),
      ),
    ).toHaveLength(1);
    expect(h.routes.get(first.orderId)?.partner_user_ref).toBe(
      "opaque-partner-recipient",
    );
    expect(h.sequences.get(first.orderId)?.next_sequence).toBe(1);
  });

  it("both repository entry points use the immutable SQL and preserve an advanced sequence", async () => {
    const h = await harness();
    const booking = await h.service.createReferralPassengerBooking(
      h.command,
      h.identity,
    );
    const stored = (await h.allocator.findOrderPartnerNotificationRoute(
      booking.orderId,
    ))!;
    h.sequences.get(booking.orderId)!.next_sequence = 9;
    expect(
      await h.allocator.writeOrderPartnerNotificationRoute({
        ...stored,
        partnerUserRef: "replacement",
      }),
    ).toEqual(stored);
    expect(
      await h.repository.writeOrderPartnerNotificationRoute({
        ...stored,
        entrySlug: "replacement",
      }),
    ).toEqual(stored);
    expect(h.sequences.get(booking.orderId)?.next_sequence).toBe(9);
    expect(
      h.statements.filter((sql) =>
        sql.includes(
          "INSERT INTO mobility.phase1_partner_notification_sequences",
        ),
      ),
    ).toHaveLength(1);
  });

  it("rejects the booking without partner rows when first-party routing already exists", async () => {
    const h = await harness();
    const baseQuery = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql, values, execute) => {
      if (
        sql.includes(
          "FROM mobility.phase1_order_first_party_notification_routes",
        )
      )
        return { rows: [{ order_id: values?.[0] }] };
      return baseQuery(sql, values, execute);
    });
    await expect(
      h.service.createReferralPassengerBooking(h.command, h.identity),
    ).rejects.toMatchObject({ code: "FARE_QUOTE_UNAVAILABLE" });
    expect(h.db.table("ops.phase1_owned_orders").size).toBe(0);
    expect(h.routes.size).toBe(0);
    expect(h.sequences.size).toBe(0);
    expect(h.statements).toContain("ROLLBACK");
    expect(h.publish).not.toHaveBeenCalled();
  });

  it.each(["lock", "first-party-check", "route", "sequence"])(
    "%s failure rolls back the whole uncommitted referral unit",
    async (target) => {
      const h = await harness();
      const baseQuery = h.query.getMockImplementation()!;
      const failure = new Error("injected notification write failure");
      const report = vi.spyOn(h.repository, "reportPersistenceFailure");
      h.query.mockImplementation(async (sql, values, execute) => {
        if (
          sql.includes(
            {
              lock: "pg_advisory_xact_lock",
              "first-party-check":
                "FROM mobility.phase1_order_first_party_notification_routes",
              route:
                "INSERT INTO mobility.phase1_order_partner_notification_routes",
              sequence:
                "INSERT INTO mobility.phase1_partner_notification_sequences",
            }[target]!,
          )
        )
          throw failure;
        return baseQuery(sql, values, execute);
      });
      if (target === "lock")
        await expect(
          h.service.createReferralPassengerBooking(h.command, h.identity),
        ).rejects.toBe(failure);
      else {
        await expect(
          h.service.createReferralPassengerBooking(h.command, h.identity),
        ).rejects.toMatchObject({
          status: 503,
          code: "FARE_QUOTE_UNAVAILABLE",
        });
        expect(report).toHaveBeenCalledWith(
          failure,
          "write order partner notification route",
        );
        expect(h.statements).toContain(
          "ROLLBACK TO SAVEPOINT partner_notification_route",
        );
        expect(h.statements).toContain(
          "RELEASE SAVEPOINT partner_notification_route",
        );
      }
      expect(h.db.table("ops.phase1_owned_orders").size).toBe(0);
      expect(
        h.db
          .table("ops.phase1_referral_fare_quote_snapshots")
          .get(h.command.quoteId).consumedByOrderId,
      ).toBeNull();
      expect(h.statements).toContain("ROLLBACK");
      expect(h.publish).not.toHaveBeenCalled();
      expect(h.routes.size).toBe(0);
      expect(h.sequences.size).toBe(0);
    },
  );

  it("does not publish or expose a booking when its transaction fails to commit", async () => {
    const h = await harness();
    const baseQuery = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql, values, execute) => {
      if (sql === "COMMIT") throw new Error("commit failed");
      return baseQuery(sql, values, execute);
    });
    await expect(
      h.service.createReferralPassengerBooking(h.command, h.identity),
    ).rejects.toThrow("commit failed");
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.service.listOrders()).toHaveLength(0);
    expect(h.statements).toContain("ROLLBACK");
  });

  it.each(["tenant", "partner-staff"])(
    "%s bookings never invoke recipient lookup or route SQL",
    async (source) => {
      const h = await harness();
      const booking = await h.service.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: { address: "Pickup fixture" },
          dropoff: { address: "Dropoff fixture" },
          passenger: { name: "Fixture", phone: "0912345678" },
          reservationWindowStart: new Date(Date.now() + 7200000).toISOString(),
          reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
          ...(source === "partner-staff"
            ? { partnerEntrySlug: h.identity.partnerEntrySlug! }
            : {}),
        },
        h.identity.tenantId!,
        source === "partner-staff"
          ? { ...h.identity, actorType: "partner_api_key" }
          : null,
      );
      expect(booking.orderId).toBeTruthy();
      expect(h.links.findByDrtsPassengerId).not.toHaveBeenCalled();
      expect(h.routes.size).toBe(0);
    },
  );

  it("phone and voice creation never write a partner route even with passenger/contact data", async () => {
    const h = await harness();
    const phone = await h.service.createCallCenterOrder({
      callId: "phone-route-negative",
      agentId: "agent-fixture",
      pickup: { address: "Pickup fixture" },
      dropoff: { address: "Dropoff fixture" },
      passenger: {
        passengerId: h.identity.drtsPassengerId!,
        name: "Fixture",
        phone: "0912345678",
      },
    });
    expect(phone.orderId).toBeTruthy();
    const voice = await h.service.createVoiceOrder(
      buildOrderFixture({
        orderId: "voice-route-negative",
        callId: "voice-call-fixture",
        voiceIntentId: "voice-intent-fixture",
      }),
      "route-negative",
    );
    expect(voice.aggregateVersion).toBe(1);
    expect(h.links.findByDrtsPassengerId).not.toHaveBeenCalled();
    expect(h.routes.size).toBe(0);
  });

  it("shared resolution skips an unavailable entry and scopes h.identity lookup to the exact entry/subject", async () => {
    const h = await harness();
    const order = buildOrderFixture({ orderId: "scoped-resolution" });
    vi.spyOn(h.tenant, "getPartnerEntry").mockImplementation(() => {
      throw new Error("entry unavailable");
    });
    expect(
      await resolveOrderPartnerNotificationRoute(
        order,
        h.identity,
        h.links as never,
        h.tenant,
      ),
    ).toBeNull();
    const links = new PartnerUserIdentityLinkRepository();
    const linked = await links.resolveOrCreate({
      entrySlug: h.identity.partnerEntrySlug!,
      partnerUserRef: "scoped-recipient",
    });
    expect(
      await resolveOrderPartnerNotificationRoute(
        order,
        {
          ...h.identity,
          partnerEntrySlug: "other-entry",
          drtsPassengerId: linked.drtsPassengerId,
        },
        links,
        h.tenant,
      ),
    ).toBeNull();
    expect(
      await resolveOrderPartnerNotificationRoute(
        order,
        { ...h.identity, drtsPassengerId: "other-passenger" },
        links,
        h.tenant,
      ),
    ).toBeNull();
  });

  it("keeps the module edge one way and resolves the existing narrow h.identity export", () => {
    const imports = (
      Reflect.getMetadata("imports", OwnedMobilityModule) as Array<{
        forwardRef?: () => unknown;
      }>
    ).map((entry) => entry.forwardRef?.() ?? entry);
    expect(imports).not.toContain(MultiTaxiModule);
    expect(Reflect.getMetadata("exports", TenantPartnerModule)).toContain(
      PartnerUserIdentityLinkRepository,
    );
  });
});

describe("referral booking to partner notification delivery", () => {
  it("the real arrival producer allocates an event sequence and reaches the mock partner HTTP endpoint", async () => {
    const h = await harness();
    const booking = await h.service.createReferralPassengerBooking(
      h.command,
      h.identity,
    );
    // Seed a valid driver task as the precondition for the arrival producer;
    // assignment generation is owned by the following task in this wave.
    const acceptedAt = new Date().toISOString();
    const task: DriverTaskRecord = {
      taskId: "arrival-fixture",
      dispatchJobId: "arrival-dispatch-fixture",
      assignmentId: "arrival-assignment-fixture",
      sourcePlatform: null,
      routeProvided: false,
      waypoints: [],
      fare: null,
      proof: null,
      orderId: booking.orderId,
      status: "enroute_pickup",
      driverId: "driver-fixture",
      vehicleId: "vehicle-fixture",
      acceptedAt,
      departedAt: acceptedAt,
      arrivedPickupAt: null,
      startedAt: null,
      completedAt: null,
      actualDistanceKm: null,
      actualDurationSec: null,
    };
    (h.service as unknown as { driverTasks: DriverTaskRecord[] }).driverTasks =
      [task];
    await h.service.arrivedPickup("arrival-fixture", {
      arrivedAt: new Date().toISOString(),
    });
    const persisted = [
      ...h.db.table("ops.consumer_notification_outbox").values(),
    ].find((item) => item.event_type === "driver_arrived")!;
    const row = Object.fromEntries(
      Object.entries(persisted).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
        key === "payload" && typeof value === "string"
          ? JSON.parse(value)
          : value,
      ]),
    ) as unknown as ConsumerNotificationOutboxRecord;
    expect(row).toMatchObject({
      orderId: booking.orderId,
      payload: { eventSequence: 1 },
    });
    expect(h.sequences.get(booking.orderId)?.next_sequence).toBe(2);
    const delivery = await transportHarness();
    const route = (await h.allocator.findOrderPartnerNotificationRoute(
      booking.orderId,
    ))!;
    Object.assign(delivery.row, row);
    Object.assign(delivery.route, route);
    Object.assign(delivery.entry, {
      entrySlug: route.entrySlug,
      tenantId: route.tenantId,
      partnerId: route.partnerId,
    });
    Object.assign(delivery.binding, {
      entrySlug: route.entrySlug,
      tenantId: route.tenantId,
      partnerId: route.partnerId,
    });
    delivery.link.drtsPassengerId = route.drtsPassengerId;
    delivery.relevance.status = "arrived_pickup";
    delivery.repository.findOrderPartnerNotificationRoute.mockImplementation(
      (...args: unknown[]) =>
        h.allocator.findOrderPartnerNotificationRoute(String(args[0])),
    );
    expect(
      await delivery.service.deliverPassengerNotification(row),
    ).toMatchObject({ result: "delivered", deliveryStage: "partner_accepted" });
    expect(delivery.fetch).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(delivery.fetch.mock.calls[0]?.[1]?.body));
    expect(payload.data).toMatchObject({
      event_sequence: 1,
      partner_entry_slug: h.identity.partnerEntrySlug,
      recipient: { partner_user_ref: h.link.partnerUserRef },
      ride_ref: booking.orderId,
    });
    expect(delivery.resolver.resolveDevice).not.toHaveBeenCalled();
  });
});
