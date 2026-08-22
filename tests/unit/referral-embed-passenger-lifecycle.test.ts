import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import {
  cancelReferralTripServer,
  createReferralBookingServer,
  getReferralActiveTripServer,
  getReferralTripHistoryServer,
  getReferralTripReceiptServer,
  submitReferralTripRatingServer,
} from "../../apps/referral-embed-web/lib/embed-booking-api";
import * as sessionModule from "../../apps/referral-embed-web/lib/embed-partner-session";

describe("referral embed passenger lifecycle API integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const mockSession = {
    partnerEntrySlug: "referral-demo-community",
    drtsPassengerId: "pax-ref-001",
    identityActive: true,
    identity: {
      actorType: "referral_passenger",
      actorId: "pax-ref-001",
      realm: "partner",
      tenantId: "tenant-demo",
      partnerId: "partner-001",
      partnerProgramId: "program-001",
      partnerEntrySlug: "referral-demo-community",
      drtsPassengerId: "pax-ref-001",
    },
  };

  it("throws error when session is inactive or missing", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      null as never,
    );

    await expect(
      createReferralBookingServer({
        entrySlug: "referral-demo-community",
        pickupAddress: "A",
        dropoffAddress: "B",
      }),
    ).rejects.toThrow("UNAUTHORIZED");
  });

  it("sends booking request to authority with session identity headers", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              orderId: "order-123",
              orderNo: "DRTS-123",
              status: "pending",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await createReferralBookingServer({
      entrySlug: "referral-demo-community",
      pickupAddress: "Pickup Spot",
      dropoffAddress: "Dropoff Spot",
      idempotencyKey: "idemp-001",
    });

    expect(result).toEqual({
      orderId: "order-123",
      orderNo: "DRTS-123",
      status: "pending",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/partner/referral/passenger/bookings"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-actor-type": "referral_passenger",
          "x-drts-passenger-id": "pax-ref-001",
          "x-tenant-id": "tenant-demo",
        }),
      }),
    );
  });

  it("fetches active trip from authority", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              active: true,
              trip: { orderId: "order-123", status: "dispatched" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getReferralActiveTripServer();
    if (!result) {
      throw new Error("expected active trip payload");
    }
    expect(result.active).toBe(true);
    expect(result.trip?.orderId).toBe("order-123");
  });

  it("treats a successful null active-trip envelope as no active trip", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: null }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getReferralActiveTripServer()).resolves.toBeNull();
  });

  it("fetches trip history from authority", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              items: [{ orderId: "order-123", status: "completed" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getReferralTripHistoryServer();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.orderId).toBe("order-123");
  });

  it("fetches PII-masked trip receipt from authority", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: {
              orderId: "order-123",
              passengerNameMasked: "L. Tsai",
              passengerPhoneMasked: "0912-***-820",
              totalFare: 285,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await getReferralTripReceiptServer("order-123");
    expect(result.passengerNameMasked).toBe("L. Tsai");
    expect(result.passengerPhoneMasked).toBe("0912-***-820");
  });

  it("sends trip cancellation request to authority", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { orderId: "order-123", status: "cancelled" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await cancelReferralTripServer("order-123", {
      orderId: "order-123",
      reason: "User cancelled",
    });
    expect(result.status).toBe("cancelled");
  });

  it("sends rating submission to authority", async () => {
    vi.spyOn(sessionModule, "getReferralEmbedSession").mockResolvedValue(
      mockSession as never,
    );

    const fetchSpy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { orderId: "order-123", score: 5, comment: "Great" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await submitReferralTripRatingServer("order-123", {
      orderId: "order-123",
      score: 5,
      comment: "Great",
      idempotencyKey: "rate-idemp-1",
    });
    expect(result.score).toBe(5);
  });

  it("routes completed and cancelled mutations into BFF readback screens", () => {
    const component = readFileSync(
      "apps/referral-embed-web/components/passenger-embed.tsx",
      "utf8",
    );
    const page = readFileSync(
      "apps/referral-embed-web/app/embed/[entrySlug]/page.tsx",
      "utf8",
    );

    expect(component).toContain("/api/referral/cancel/");
    expect(component).toContain("/api/referral/rating/");
    expect(component).toContain(
      '{completed ? (\n        <Card theme={theme} title="為這趟行程評分">',
    );
    expect(component).toContain('screen: "cancelled"');
    expect(component).toContain("downloadUrl: liveData.receipt.downloadUrl");
    expect(component).not.toContain("embedTripHistory");
    expect(component).not.toContain("embedReceipt");
    expect(page).toContain("getReferralTripHistoryServer()");
    expect(page).toContain("getReferralTripReceiptServer(receiptOrderId)");
  });
});
