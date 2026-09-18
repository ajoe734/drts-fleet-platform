import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/embed-partner-session", () => ({
  getReferralEmbedSession: vi.fn(),
}));

import { createReferralBookingServer } from "../../lib/embed-booking-api";
import { getReferralEmbedSession } from "../../lib/embed-partner-session";

describe("referral booking authority adapter", () => {
  beforeEach(() => {
    vi.mocked(getReferralEmbedSession).mockResolvedValue({
      identityActive: true,
      partnerEntrySlug: "yuhe-residence",
      drtsPassengerId: "referral-demo-yuhe-residence",
      identity: {
        actorType: "referral_passenger",
        actorId: "referral-demo-yuhe-residence",
        realm: "partner",
        tenantId: "tenant-demo-001",
        partnerId: "partner-yuhe",
        partnerProgramId: "program-referral-community",
        partnerEntrySlug: "yuhe-residence",
        drtsPassengerId: "referral-demo-yuhe-residence",
      },
    } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: { order_id: "order-001", booking_id: "booking-001" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the API-prefixed referral route and returns camel-case contract data", async () => {
    const result = await createReferralBookingServer({
      entrySlug: "yuhe-residence",
      pickupAddress: "台北車站",
      dropoffAddress: "桃園國際機場 T2",
    });

    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      "/api/partner/referral/passenger/bookings",
    );
    expect(result).toEqual({ orderId: "order-001", bookingId: "booking-001" });
  });
});
