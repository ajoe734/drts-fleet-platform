import type { OrderPartnerNotificationRoute } from "@drts/contracts";
import type { QueryResultRow } from "pg";
import { describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { persistOrderPartnerNotificationRoute } from "../../../apps/api/src/modules/tenant-partner/order-partner-notification-route";

const route: OrderPartnerNotificationRoute = {
  orderId: "route-exclusion-order",
  tenantId: "route-exclusion-tenant",
  partnerId: "route-exclusion-partner",
  entrySlug: "route-exclusion-entry",
  partnerUserRef: "frozen-recipient",
  drtsPassengerId: "route-exclusion-passenger",
  passengerSubjectRef: "route-exclusion-subject",
  identityLinkedAt: "2026-10-01T00:00:00.000Z",
  consentBundleVersion: "v1",
  notificationPolicyVersion: "partner_notification_v1",
  rideRef: "route-exclusion-ride",
  createdAt: "2026-10-08T00:00:00.000Z",
};
const storedRow = {
  order_id: route.orderId,
  tenant_id: route.tenantId,
  partner_id: route.partnerId,
  entry_slug: route.entrySlug,
  partner_user_ref: route.partnerUserRef,
  drts_passenger_id: route.drtsPassengerId,
  passenger_subject_ref: route.passengerSubjectRef,
  identity_linked_at: route.identityLinkedAt,
  consent_bundle_version: route.consentBundleVersion,
  notification_policy_version: route.notificationPolicyVersion,
  ride_ref: route.rideRef,
  created_at: route.createdAt,
};
const lockSql = "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))";
const firstPartyRead =
  "FROM mobility.phase1_order_first_party_notification_routes";
const partnerInsert =
  "INSERT INTO mobility.phase1_order_partner_notification_routes";
const sequenceInsert =
  "INSERT INTO mobility.phase1_partner_notification_sequences";

function result(rows: QueryResultRow[] = []) {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

// Only DB I/O is stubbed: canned rows/errors and suspended responses exercise
// the real helper and repository transaction/savepoint control flow. This does
// not simulate PG locks, constraints, rollback or concurrent transaction visibility.
function harness(options: { firstParty?: boolean; replay?: boolean } = {}) {
  const query = vi.fn<
    (
      sql: string,
      values?: readonly unknown[],
    ) => Promise<ReturnType<typeof result>>
  >(async (sql) => {
    if (sql.includes(firstPartyRead))
      return result(options.firstParty ? [{ order_id: route.orderId }] : []);
    if (sql.includes(partnerInsert))
      return result(options.replay ? [] : [storedRow]);
    if (sql.includes("FROM mobility.phase1_order_partner_notification_routes"))
      return result([storedRow]);
    if (
      sql === lockSql ||
      sql.includes(sequenceInsert) ||
      /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE SAVEPOINT|SET LOCAL)/.test(sql)
    )
      return result();
    throw new Error(`Unexpected DB query: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  const database = {
    isEnabled: () => true,
    connect: vi.fn(async () => client),
    query: vi.fn(async () => {
      throw new Error("escaped caller transaction");
    }),
  };
  return { query, client, database };
}

describe("PG-QA-F1 shared partner route exclusion", () => {
  it.each([lockSql, firstPartyRead])(
    "awaits %s before advancing toward either insert",
    async (boundary) => {
      const h = harness();
      let resume!: () => void;
      const suspended = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const original = h.query.getMockImplementation()!;
      h.query.mockImplementation(async (sql, values) => {
        if (sql.includes(boundary)) await suspended;
        return original(sql, values);
      });
      const writing = persistOrderPartnerNotificationRoute(
        h.client as never,
        route,
      );
      // Drain the promises up to the suspended boundary, without timers/sockets.
      for (let i = 0; i < 10; i++) await Promise.resolve();
      const pendingCalls = h.query.mock.calls.slice();
      resume();
      const stored = await writing;
      expect(pendingCalls.at(-1)?.[0]).toContain(boundary);
      expect(pendingCalls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(
        false,
      );
      expect(h.query.mock.calls[0]).toEqual([
        lockSql,
        [`passenger-push-first-party-route:${route.orderId}`],
      ]);
      expect(h.query.mock.calls[1]?.[0]).toContain(firstPartyRead);
      expect(h.query.mock.calls[1]?.[1]).toEqual([route.orderId]);
      expect(stored).toEqual(route);
    },
  );

  it("rejects an existing first-party route before any partner route or sequence insert", async () => {
    const h = harness({ firstParty: true });
    expect(
      await persistOrderPartnerNotificationRoute(h.client as never, route),
    ).toBeNull();
    expect(h.query).toHaveBeenCalledTimes(2);
    expect(
      h.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql)),
    ).toBe(false);
  });

  it("creates a legal partner route and initial sequence on the supplied executor", async () => {
    const h = harness();
    expect(
      await persistOrderPartnerNotificationRoute(h.client as never, route),
    ).toEqual(route);
    const inserts = h.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO"),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.[0]).toContain(partnerInsert);
    expect(inserts[0]?.[1]).toEqual(Object.values(storedRow));
    expect(inserts[1]?.[0]).toContain(sequenceInsert);
    expect(inserts[1]?.[1]).toEqual([route.orderId]);
    expect(
      h.query.mock.calls.some(([sql]) => /^(BEGIN|COMMIT|ROLLBACK)/.test(sql)),
    ).toBe(false);
    expect(h.database.connect).not.toHaveBeenCalled();
    expect(h.database.query).not.toHaveBeenCalled();
  });

  it("replays the frozen route without reinitializing the sequence", async () => {
    const h = harness({ replay: true });
    expect(
      await persistOrderPartnerNotificationRoute(h.client as never, {
        ...route,
        partnerUserRef: "replacement",
        consentBundleVersion: "replacement",
      }),
    ).toEqual(route);
    expect(
      h.query.mock.calls.some(([sql]) => sql.includes(sequenceInsert)),
    ).toBe(false);
  });

  it.each([lockSql, firstPartyRead])(
    "propagates %s errors without writing either row",
    async (boundary) => {
      const h = harness();
      const original = h.query.getMockImplementation()!;
      const failure = new Error("DB boundary failed");
      h.query.mockImplementation(async (sql, values) => {
        if (sql.includes(boundary)) throw failure;
        return original(sql, values);
      });
      await expect(
        persistOrderPartnerNotificationRoute(h.client as never, route),
      ).rejects.toBe(failure);
      expect(
        h.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
      ).toBe(false);
    },
  );

  it.each(["multi-taxi", "owned-mobility"])(
    "%s returns null and finishes its existing transaction on first-party conflict",
    async (writer) => {
      const h = harness({ firstParty: true });
      const repository =
        writer === "multi-taxi"
          ? new MultiTaxiRepository(h.database as never)
          : new OwnedMobilityRepository(h.database as never);
      expect(
        await repository.writeOrderPartnerNotificationRoute(route),
      ).toBeNull();
      expect(h.query.mock.calls[0]?.[0]).toBe("BEGIN");
      expect(h.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
      expect(
        h.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
      ).toBe(false);
      expect(h.database.connect).toHaveBeenCalledTimes(1);
      expect(h.database.query).not.toHaveBeenCalled();
      expect(h.client.release).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the enclosing booking transaction under caller ownership on conflict", async () => {
    const h = harness({ firstParty: true });
    const repository = new OwnedMobilityRepository(h.database as never);
    expect(
      await repository.writeOrderPartnerNotificationRoute(
        route,
        h.client as never,
      ),
    ).toBeNull();
    expect(h.query.mock.calls[0]?.[0]).toBe(
      "SAVEPOINT partner_notification_route",
    );
    expect(h.query.mock.calls.at(-1)?.[0]).toBe(
      "RELEASE SAVEPOINT partner_notification_route",
    );
    expect(
      h.query.mock.calls.some(([sql]) => /^(BEGIN|COMMIT|ROLLBACK)/.test(sql)),
    ).toBe(false);
    expect(
      h.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO")),
    ).toBe(false);
    expect(h.database.connect).not.toHaveBeenCalled();
    expect(h.client.release).not.toHaveBeenCalled();
  });
});
