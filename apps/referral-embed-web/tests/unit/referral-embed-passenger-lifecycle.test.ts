import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReferralEmbedSession } from "@drts/contracts";

import { getReferralPassengerActiveBooking } from "@/lib/embed-booking-api";

const activeSession = {
  handoffId: "handoff-referral-001",
  partnerEntrySlug: "referral-demo-community",
  entryHost: "yuhe-residence.example",
  drtsPassengerId: "passenger-referral-001",
  identityActive: true,
  consent: {
    requiredScopes: ["trip.manage", "pii.trip", "identity.bind"] as const,
    bundleVersion: "referral-embed-consent-v1-2026-08-01",
    grantedAt: "2026-08-01T08:00:00.000Z",
  },
  identity: {
    actorType: "referral_passenger" as const,
    actorId: "passenger-referral-001",
    realm: "partner" as const,
    authMode: "jwt_bearer" as const,
    roleFamilies: ["partner"] as const,
    roles: ["referral_passenger"] as const,
    scopes: ["partner:book"] as const,
    tenantId: "tenant-demo-001",
    partnerId: "partner-referral-demo-001",
    partnerProgramId: "program-referral-community",
    partnerEntrySlug: "referral-demo-community",
    drtsPassengerId: "passenger-referral-001",
  },
} satisfies ReferralEmbedSession;

describe("referral embed passenger lifecycle API", () => {
  beforeEach(() => {
    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.DRTS_INTERNAL_KEY = "internal-test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an active-booking success envelope with data null as no active trip", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getReferralPassengerActiveBooking(activeSession),
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/partner/bookings/active",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });
});
