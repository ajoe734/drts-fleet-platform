import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/embed-partner-session", () => ({
  getReferralEmbedSession: vi.fn(),
}));

import { getReferralEmbedSession } from "@/lib/embed-partner-session";
import { GET as getActiveBooking } from "@/app/api/referral/bookings/active/route";
import { POST as createBooking } from "@/app/api/referral/bookings/route";

const mockedGetReferralEmbedSession = vi.mocked(getReferralEmbedSession);

const activeSession = {
  handoffId: "handoff-referral-001",
  partnerEntrySlug: "referral-demo-community",
  entryHost: "yuhe-residence.example",
  drtsPassengerId: "passenger-referral-001",
  identityActive: true,
  consent: {
    requiredScopes: ["trip.manage", "pii.trip", "identity.bind"],
    bundleVersion: "referral-embed-consent-v1-2026-08-01",
    grantedAt: "2026-08-01T08:00:00.000Z",
  },
  identity: {
    actorType: "referral_passenger" as const,
    actorId: "passenger-referral-001",
    realm: "partner" as const,
    authMode: "jwt_bearer" as const,
    roleFamilies: ["partner"] as const,
    roles: ["referral_passenger"],
    scopes: ["partner:book"],
    tenantId: "tenant-demo-001",
    partnerId: "partner-referral-demo-001",
    partnerProgramId: "program-referral-community",
    partnerEntrySlug: "referral-demo-community",
    drtsPassengerId: "passenger-referral-001",
  },
};

describe("referral embed booking routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedGetReferralEmbedSession.mockReset();
    process.env.DRTS_API_URL = "http://localhost:3001";
    process.env.DRTS_INTERNAL_KEY = "internal-test-key";
  });

  it("requires an active referral embed session before serving booking authority routes", async () => {
    mockedGetReferralEmbedSession.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await getActiveBooking();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "REFERRAL_SESSION_REQUIRED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards referral booking create through server authority headers and idempotency key", async () => {
    mockedGetReferralEmbedSession.mockResolvedValue(activeSession as never);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            replayed: false,
            booking: {
              booking_id: "booking-referral-001",
            },
            order: {
              order_id: "order-referral-001",
            },
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await createBooking(
      new Request("http://embed.example/api/referral/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-referral-booking-001",
          "x-tenant-id": "spoofed-tenant",
          "x-actor-id": "spoofed-passenger",
        },
        body: JSON.stringify({
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: { address: "台北市信義區松仁路100號" },
          dropoff: { address: "台北市中山區樂群三路200號" },
          reservationWindowStart: "2026-08-01T08:00:00.000Z",
          reservationWindowEnd: "2026-08-01T08:20:00.000Z",
          passenger: {
            name: "林小姐",
            phone: "0911222333",
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [targetUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;

    expect(targetUrl).toBe("http://localhost:3001/api/partner/bookings");
    expect(headers.get("x-drts-internal-key")).toBe("internal-test-key");
    expect(headers.get("x-actor-id")).toBe("passenger-referral-001");
    expect(headers.get("x-tenant-id")).toBe("tenant-demo-001");
    expect(headers.get("x-partner-entry-slug")).toBe(
      "referral-demo-community",
    );
    expect(headers.get("idempotency-key")).toBe(
      "idem-referral-booking-001",
    );
    expect(headers.get("x-scopes")).toBe("partner:book");
    expect(headers.get("x-role-families")).toBe("partner");
    expect(headers.get("x-actor-id")).not.toBe("spoofed-passenger");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        booking: {
          bookingId: "booking-referral-001",
        },
        order: {
          orderId: "order-referral-001",
        },
      },
    });
  });
});
