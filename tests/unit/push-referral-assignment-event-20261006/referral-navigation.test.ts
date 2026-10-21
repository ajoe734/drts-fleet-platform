import { describe, expect, it, vi } from "vitest";
import { PartnerNotificationNavigationRepository } from "../../../apps/api/src/modules/tenant-partner/partner-notification-navigation.repository";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";

// Actual repository and resolver; DB rows and partner authentication/handoff
// issuance are boundaries. Existing NAV production-path tests cover the signed
// handoff/session BFF; no server or browser is started by either suite.
describe("referral notification navigation", () => {
  it.each([
    ["assigned", "trip"],
    ["cancelled", "cancelled"],
  ])(
    "resolves routed business dispatch in %s status to %s",
    async (status, screen) => {
      const query = vi.fn(async () => ({
        rows: [
          {
            order_id: "referral-order",
            tenant_id: "tenant-1",
            partner_id: "partner-1",
            entry_slug: "entry-1",
            partner_user_ref: "opaque-user-1",
            drts_passenger_id: "passenger-1",
            ride_ref: "referral-order",
            consent_bundle_version: "v1",
            status,
          },
        ],
      }));
      const repository = new PartnerNotificationNavigationRepository({
        connect: async () => ({ query, release: vi.fn() }),
      } as never);
      const issue = vi.fn(async () => ({ artifact: "fresh-test-artifact" }));
      const tenant = {
        getPartnerEntry: vi.fn(async () => ({
          tenantId: "tenant-1",
          partnerId: "partner-1",
          entryHost: "entry.example.test",
        })),
        authenticatePartnerBootstrap: vi.fn(),
        issueReferralEmbedHandoffArtifact: issue,
      };
      const controller = new TenantPartnerController(
        tenant as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {
          find: async () => ({
            status: "active",
            drtsPassengerId: "passenger-1",
          }),
        } as never,
        repository,
      );
      const result = await controller.resolvePartnerNotificationNavigation(
        "entry-1",
        { rideRef: "referral-order", partnerUserRef: "opaque-user-1" },
        { headers: { "x-api-key": "test-only" } },
      );
      expect(issue).toHaveBeenCalledWith(
        expect.objectContaining({
          navigationContext: { orderId: "referral-order", screen },
        }),
        undefined,
        { allowInternalBootstrap: false },
      );
      expect(result.data.destinationUrl).toContain(
        "/api/referral/notification-navigation?artifact=fresh-test-artifact&entrySlug=entry-1",
      );
      const [sql, values] = (
        query.mock.calls as unknown as [string, unknown[]][]
      )[0]!;
      expect(values).toEqual(["entry-1", "referral-order", "opaque-user-1"]);
      expect(sql).toContain(
        "o.record->'passenger'->>'passengerId' = r.drts_passenger_id",
      );
      expect(sql).not.toContain("multi_taxi_direct");
    },
  );
});
