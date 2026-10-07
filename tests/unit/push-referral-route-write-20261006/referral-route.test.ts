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
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "referral_passenger",
  actorId: "referral-route-passenger",
  realm: "partner",
  tenantId: "tenant-demo-001",
  partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
  partnerProgramId: "program-referral-community",
  partnerEntrySlug: "yuhe-residence",
  drtsPassengerId: "referral-route-passenger",
  roleFamilies: ["partner"],
  roles: ["referral_passenger"],
  scopes: [],
  requestId: null,
};
const command = {
  entrySlug: identity.partnerEntrySlug!,
  pickupAddress: "Pickup fixture",
  dropoffAddress: "Dropoff fixture",
};

// Only the DB boundary is mocked. The booking, governance, route writer and
// outbox repository are production code. This is not a Postgres schema probe.
function harness() {
  const statements: string[] = [];
  const routes = new Map<string, Record<string, unknown>>();
  const sequences = new Map<string, number>();
  const outboxes = new Map<string, ConsumerNotificationOutboxRecord>();
  let savedRoutes = new Map(routes);
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    statements.push(sql.trim());
    if (sql === "SAVEPOINT partner_notification_route")
      savedRoutes = new Map(routes);
    if (sql === "ROLLBACK TO SAVEPOINT partner_notification_route") {
      routes.clear();
      for (const [key, row] of savedRoutes) routes.set(key, row);
    }
    if (sql.includes("RETURNING aggregate_version"))
      return { rows: [{ aggregate_version: 1 }] };
    if (
      sql.includes("INSERT INTO mobility.phase1_partner_notification_sequences")
    ) {
      sequences.set(String(values?.[0]), 1);
    }
    if (sql.includes("UPDATE mobility.phase1_partner_notification_sequences")) {
      const orderId = String(values?.[0]);
      const next = sequences.get(orderId);
      if (next === undefined) return { rows: [] };
      sequences.set(orderId, next + 1);
      return { rows: [{ event_sequence: String(next) }] };
    }
    if (sql.includes("INSERT INTO ops.consumer_notification_outbox")) {
      const v = values!;
      const row = {
        outboxId: v[0],
        orderId: v[1],
        passengerSubjectRef: v[2],
        eventType: v[3],
        assignmentVersion: v[4],
        payload: JSON.parse(String(v[5])),
        status: v[6],
        attemptCount: v[7],
        nextAttemptAt: v[8],
        createdAt: v[9],
        deliveredAt: v[10],
      } as ConsumerNotificationOutboxRecord;
      outboxes.set(row.outboxId, row);
      return { rows: [{ outbox_id: row.outboxId }] };
    }
    if (sql.includes("UPDATE ops.consumer_notification_outbox")) {
      outboxes.get(String(values?.[0]))!.payload.eventSequence = Number(
        values?.[1],
      );
    }
    if (
      sql.includes(
        "INSERT INTO mobility.phase1_order_partner_notification_routes",
      )
    ) {
      const columns = [
        "order_id",
        "tenant_id",
        "partner_id",
        "entry_slug",
        "partner_user_ref",
        "drts_passenger_id",
        "passenger_subject_ref",
        "identity_linked_at",
        "consent_bundle_version",
        "notification_policy_version",
        "ride_ref",
        "created_at",
      ];
      const row = Object.fromEntries(
        columns.map((key, i) => [key, values?.[i]]),
      );
      if (routes.has(String(row.order_id))) return { rows: [] };
      routes.set(String(row.order_id), row);
      return { rows: [row] };
    }
    if (
      sql.includes("FROM mobility.phase1_order_partner_notification_routes")
    ) {
      const row = routes.get(String(values?.[0]));
      return { rows: row ? [row] : [] };
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const database = {
    isEnabled: () => true,
    query,
    connect: vi.fn(async () => client),
  };
  const allocator = new MultiTaxiRepository(database as never);
  const repository = new OwnedMobilityRepository(database as never, allocator);
  const audit = new AuditNotificationService();
  const tenant = new TenantPartnerService(audit);
  const link = {
    entrySlug: identity.partnerEntrySlug,
    partnerUserRef: "opaque-partner-recipient",
    drtsPassengerId: identity.drtsPassengerId,
    status: "active",
    consentScope: "passenger_identity_link",
    linkedAt: "2026-10-01T00:00:00.000Z",
  };
  const links = {
    findByDrtsPassengerId: vi.fn(async () => link as typeof link | null),
  };
  const publish = vi.fn(() => {
    statements.push("PUBLISH");
  });
  const service = new OwnedMobilityService(
    {} as never,
    audit,
    { linkOrderToCallSession: vi.fn(() => ({ recordingId: null })) } as never,
    { publishTaskUpdated: vi.fn() } as never,
    { publishOrderCreated: publish } as never,
    repository,
    tenant,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    links as never,
  );
  return {
    service,
    repository,
    allocator,
    tenant,
    links,
    link,
    routes,
    query,
    statements,
    publish,
    database,
    sequences,
    outboxes,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("referral embed notification route", () => {
  it("persists the trusted route and sequence before publishing the committed booking", async () => {
    const h = harness();
    const result = await h.service.createReferralPassengerBooking(
      command,
      identity,
    );
    expect(h.routes.get(result.orderId)).toMatchObject({
      tenant_id: identity.tenantId,
      partner_id: identity.partnerId,
      entry_slug: identity.partnerEntrySlug,
      partner_user_ref: h.link.partnerUserRef,
      drts_passenger_id: identity.drtsPassengerId,
      notification_policy_version: "partner_notification_v1",
      ride_ref: result.orderId,
    });
    expect(h.links.findByDrtsPassengerId).toHaveBeenCalledExactlyOnceWith(
      identity.partnerEntrySlug,
      identity.drtsPassengerId,
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
    const h = harness();
    const booking = await h.service.createReferralPassengerBooking(
      { ...command, scheduledAt: new Date(Date.now() + 7200000).toISOString() },
      identity,
    );
    expect(h.routes.get(booking.orderId)?.partner_user_ref).toBe(
      h.link.partnerUserRef,
    );
    expect(h.sequences.get(booking.orderId)).toBe(1);
  });

  it("keeps booking successful when the entry disappears at route resolution", async () => {
    const h = harness();
    h.links.findByDrtsPassengerId.mockImplementation(async () => {
      // Booking authorization has already checked the entry; only the later
      // notification registry lookup fails. Intake authorization stays intact.
      vi.spyOn(h.tenant, "getPartnerEntry").mockImplementation(() => {
        throw new Error("entry no longer available");
      });
      return h.link;
    });
    const booking = await h.service.createReferralPassengerBooking(
      command,
      identity,
    );
    expect(booking.orderId).toBeTruthy();
    expect(h.routes.size).toBe(0);
    expect(h.sequences.size).toBe(0);
    expect(h.publish).toHaveBeenCalledTimes(1);
  });

  it.each(["missing", "revoked", "lookup-error", "missing-subject"])(
    "%s skips routing without blocking the booking",
    async (mode) => {
      const h = harness();
      if (mode === "missing")
        h.links.findByDrtsPassengerId.mockResolvedValue(null);
      if (mode === "revoked") h.link.status = "revoked";
      if (mode === "lookup-error")
        h.links.findByDrtsPassengerId.mockRejectedValue(
          new Error("lookup unavailable"),
        );
      const actor =
        mode === "missing-subject"
          ? { ...identity, drtsPassengerId: null }
          : identity;
      const result = await h.service.createReferralPassengerBooking(
        command,
        actor,
      );
      expect(result.orderId).toBeTruthy();
      expect(h.routes.size).toBe(0);
      expect(h.sequences.size).toBe(0);
    },
  );

  it("preserves the entry mismatch 403 and ignores caller recipient claims", async () => {
    const h = harness();
    await expect(
      h.service.createReferralPassengerBooking(
        { ...command, entrySlug: "another-entry" },
        identity,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(h.links.findByDrtsPassengerId).not.toHaveBeenCalled();
    expect(h.publish).not.toHaveBeenCalled();
    const spoofed = {
      ...command,
      partnerUserRef: "attacker",
      drtsPassengerId: "attacker",
      tenantId: "attacker",
      partnerId: "attacker",
    };
    const booking = await h.service.createReferralPassengerBooking(
      spoofed,
      identity,
    );
    expect(h.routes.get(booking.orderId)).toMatchObject({
      partner_user_ref: h.link.partnerUserRef,
      drts_passenger_id: identity.drtsPassengerId,
      tenant_id: identity.tenantId,
      partner_id: identity.partnerId,
    });
  });

  it("does not repeat route writes or overwrite recipient/sequence on API replay", async () => {
    const h = harness();
    const input = { ...command, idempotencyKey: "referral-route-replay" };
    const first = await h.service.createReferralPassengerBooking(
      input,
      identity,
    );
    h.link.partnerUserRef = "changed-after-booking";
    const replay = await h.service.createReferralPassengerBooking(
      input,
      identity,
    );
    expect(replay).toMatchObject({ orderId: first.orderId, replayed: true });
    expect(h.links.findByDrtsPassengerId).toHaveBeenCalledTimes(1);
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
    expect(h.sequences.get(first.orderId)).toBe(1);
  });

  it("both repository entry points use the immutable SQL and preserve an advanced sequence", async () => {
    const h = harness();
    const booking = await h.service.createReferralPassengerBooking(
      command,
      identity,
    );
    const stored = (await h.allocator.findOrderPartnerNotificationRoute(
      booking.orderId,
    ))!;
    h.sequences.set(booking.orderId, 9);
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
    expect(h.sequences.get(booking.orderId)).toBe(9);
    expect(
      h.statements.filter((sql) =>
        sql.includes(
          "INSERT INTO mobility.phase1_partner_notification_sequences",
        ),
      ),
    ).toHaveLength(1);
  });

  it.each(["route", "sequence"])(
    "%s insert failure rolls back only notification setup and logs it",
    async (target) => {
      const h = harness();
      const baseQuery = h.query.getMockImplementation()!;
      const failure = new Error("injected notification write failure");
      h.query.mockImplementation(async (sql, values) => {
        if (
          sql.includes(
            target === "route"
              ? "INSERT INTO mobility.phase1_order_partner_notification_routes"
              : "INSERT INTO mobility.phase1_partner_notification_sequences",
          )
        )
          throw failure;
        return baseQuery(sql, values);
      });
      const report = vi
        .spyOn(h.repository, "reportPersistenceFailure")
        .mockImplementation(() => {});
      const booking = await h.service.createReferralPassengerBooking(
        command,
        identity,
      );
      expect(h.service.getOrder(booking.orderId).status).toBe("created");
      expect(report).toHaveBeenCalledExactlyOnceWith(
        failure,
        "write order partner notification route",
      );
      expect(h.statements).toContain(
        "ROLLBACK TO SAVEPOINT partner_notification_route",
      );
      expect(h.statements).toContain(
        "RELEASE SAVEPOINT partner_notification_route",
      );
      expect(h.statements).toContain("COMMIT");
      expect(h.publish).toHaveBeenCalledTimes(1);
      expect(h.routes.size).toBe(0);
    },
  );

  it("does not publish or expose a booking when its transaction fails to commit", async () => {
    const h = harness();
    const baseQuery = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql, values) => {
      if (sql === "COMMIT") throw new Error("commit failed");
      return baseQuery(sql, values);
    });
    await expect(
      h.service.createReferralPassengerBooking(command, identity),
    ).rejects.toThrow("commit failed");
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.service.listOrders()).toHaveLength(0);
    expect(h.statements).toContain("ROLLBACK");
  });

  it.each(["tenant", "partner-staff"])(
    "%s bookings never invoke recipient lookup or route SQL",
    async (source) => {
      const h = harness();
      const booking = await h.service.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: { address: "Pickup fixture" },
          dropoff: { address: "Dropoff fixture" },
          passenger: { name: "Fixture", phone: "0912345678" },
          reservationWindowStart: new Date(Date.now() + 7200000).toISOString(),
          reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
          ...(source === "partner-staff"
            ? { partnerEntrySlug: identity.partnerEntrySlug! }
            : {}),
        },
        identity.tenantId!,
        source === "partner-staff"
          ? { ...identity, actorType: "partner_api_key" }
          : null,
      );
      expect(booking.orderId).toBeTruthy();
      expect(h.links.findByDrtsPassengerId).not.toHaveBeenCalled();
      expect(h.routes.size).toBe(0);
    },
  );

  it("phone and voice creation never write a partner route even with passenger/contact data", async () => {
    const h = harness();
    const phone = await h.service.createCallCenterOrder({
      callId: "phone-route-negative",
      agentId: "agent-fixture",
      pickup: { address: "Pickup fixture" },
      dropoff: { address: "Dropoff fixture" },
      passenger: {
        passengerId: identity.drtsPassengerId!,
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

  it("shared resolution skips an unavailable entry and scopes identity lookup to the exact entry/subject", async () => {
    const h = harness();
    const order = buildOrderFixture({ orderId: "scoped-resolution" });
    vi.spyOn(h.tenant, "getPartnerEntry").mockImplementation(() => {
      throw new Error("entry unavailable");
    });
    expect(
      await resolveOrderPartnerNotificationRoute(
        order,
        identity,
        h.links as never,
        h.tenant,
      ),
    ).toBeNull();
    const links = new PartnerUserIdentityLinkRepository();
    const linked = await links.resolveOrCreate({
      entrySlug: identity.partnerEntrySlug!,
      partnerUserRef: "scoped-recipient",
    });
    expect(
      await resolveOrderPartnerNotificationRoute(
        order,
        {
          ...identity,
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
        { ...identity, drtsPassengerId: "other-passenger" },
        links,
        h.tenant,
      ),
    ).toBeNull();
  });

  it("keeps the module edge one way and resolves the existing narrow identity export", () => {
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
    const h = harness();
    const booking = await h.service.createReferralPassengerBooking(
      command,
      identity,
    );
    // Seed a valid driver task as the precondition for the arrival producer;
    // assignment generation is owned by the following task in this wave.
    (h.service as unknown as { driverTasks: DriverTaskRecord[] }).driverTasks =
      [
        {
          taskId: "arrival-fixture",
          orderId: booking.orderId,
          status: "enroute_pickup",
          driverId: "driver-fixture",
          vehicleId: "vehicle-fixture",
          acceptedAt: new Date().toISOString(),
        } as DriverTaskRecord,
      ];
    await h.service.arrivedPickup("arrival-fixture", {
      arrivedAt: new Date().toISOString(),
    });
    const row = [...h.outboxes.values()].find(
      (item) => item.eventType === "driver_arrived",
    )!;
    expect(row).toMatchObject({
      orderId: booking.orderId,
      payload: { eventSequence: 1 },
    });
    expect(h.sequences.get(booking.orderId)).toBe(2);
    const delivery = transportHarness();
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
      partner_entry_slug: identity.partnerEntrySlug,
      recipient: { partner_user_ref: h.link.partnerUserRef },
      ride_ref: booking.orderId,
    });
    expect(delivery.resolver.resolveDevice).not.toHaveBeenCalled();
  });
});
