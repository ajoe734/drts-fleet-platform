// PUSH-CHANNEL-ROUTER-20261006 D2 — MultiTaxiRepository.resolvePassengerNotificationChannel
// against the two frozen route snapshot tables, one query, four outcomes.
import { describe, expect, it, vi } from "vitest";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

const partnerRow = {
  order_id: "order-1",
  tenant_id: "tenant-1",
  partner_id: "partner-1",
  entry_slug: "entry-1",
  partner_user_ref: "opaque-user-1",
  drts_passenger_id: "passenger-1",
  passenger_subject_ref: "subject-1",
  identity_linked_at: "2026-10-06T00:00:00.000Z",
  consent_bundle_version: "v1",
  notification_policy_version: "partner_notification_v1",
  ride_ref: "ride-1",
  created_at: "2026-10-06T00:00:00.000Z",
};

const firstPartyRow = {
  order_id: "order-1",
  tenant_id: "tenant-1",
  drts_passenger_id: "passenger-2",
  passenger_subject_ref: "subject-2",
  app_id: "app-1",
  notification_policy_version: "first_party_notification_v1",
  consent_version: "v1",
  ride_ref: "ride-1",
  created_at: "2026-10-06T00:00:00.000Z",
};

function repositoryWith(partner: typeof partnerRow | null, firstParty: typeof firstPartyRow | null) {
  const query = vi.fn(async (sql: string) => {
    expect(sql).toContain("mobility.phase1_order_partner_notification_routes");
    expect(sql).toContain("mobility.phase1_order_first_party_notification_routes");
    return {
      rows: [{ partner_route: partner, first_party_route: firstParty }],
    };
  });
  return {
    query,
    repository: new MultiTaxiRepository({ isEnabled: () => true, query } as never),
  };
}

describe("MultiTaxiRepository.resolvePassengerNotificationChannel", () => {
  it("only a partner route exists -> partner_webhook, mapped route fields intact", async () => {
    const { repository, query } = repositoryWith(partnerRow, null);
    const resolution = await repository.resolvePassengerNotificationChannel("order-1");
    expect(resolution).toMatchObject({
      channel: "partner_webhook",
      route: { orderId: "order-1", partnerId: "partner-1", entrySlug: "entry-1" },
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("only a first-party route exists -> first_party_app, mapped route fields intact", async () => {
    const { repository } = repositoryWith(null, firstPartyRow);
    const resolution = await repository.resolvePassengerNotificationChannel("order-1");
    expect(resolution).toMatchObject({
      channel: "first_party_app",
      route: { orderId: "order-1", appId: "app-1", drtsPassengerId: "passenger-2" },
    });
  });

  it("both snapshots exist -> ambiguous, neither route is surfaced", async () => {
    const { repository } = repositoryWith(partnerRow, firstPartyRow);
    const resolution = await repository.resolvePassengerNotificationChannel("order-1");
    expect(resolution).toEqual({ channel: "ambiguous" });
  });

  it("neither snapshot exists -> none", async () => {
    const { repository } = repositoryWith(null, null);
    const resolution = await repository.resolvePassengerNotificationChannel("order-1");
    expect(resolution).toEqual({ channel: "none" });
  });

  it("returns none without querying when durable storage is disabled", async () => {
    const query = vi.fn();
    const repository = new MultiTaxiRepository({
      isEnabled: () => false,
      query,
    } as never);
    expect(await repository.resolvePassengerNotificationChannel("order-1")).toEqual({
      channel: "none",
    });
    expect(query).not.toHaveBeenCalled();
  });
});
