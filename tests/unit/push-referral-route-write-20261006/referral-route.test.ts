import { describe, expect, it, vi } from "vitest";
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
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    statements.push(sql.trim());
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
    {} as never,
    {} as never,
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
  };
}

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
