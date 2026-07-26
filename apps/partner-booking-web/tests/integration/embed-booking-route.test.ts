import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/embed-booking/route";
import * as apiClient from "@/lib/api-client";
import type { PartnerSessionRecord } from "@/lib/api-client";
import type { BookingRecord } from "@drts/contracts";

describe("embed-booking API route", () => {
  it("returns 400 when tenantSlug is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/embed-booking", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("TENANT_SLUG_REQUIRED");
  });

  it("returns 422 when eligibilityVerificationId is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/embed-booking", {
      method: "POST",
      body: JSON.stringify({ tenantSlug: "ctbc" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);

    const json = await res.json();
    expect(json.error).toBe("ELIGIBILITY_VERIFICATION_REQUIRED");
  });

  it("returns 400 when pickup address is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/embed-booking", {
      method: "POST",
      body: JSON.stringify({
        tenantSlug: "ctbc",
        eligibilityVerificationId: "elig-1",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("PICKUP_ADDRESS_REQUIRED");
  });

  it("returns 400 when dropoff address is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/embed-booking", {
      method: "POST",
      body: JSON.stringify({
        tenantSlug: "ctbc",
        eligibilityVerificationId: "elig-1",
        pickup: { address: "Pickup A" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("DROPOFF_ADDRESS_REQUIRED");
  });

  it("returns 400 when passenger details are missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/embed-booking", {
      method: "POST",
      body: JSON.stringify({
        tenantSlug: "ctbc",
        eligibilityVerificationId: "elig-1",
        pickup: { address: "Pickup A" },
        dropoff: { address: "Dropoff B" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.error).toBe("PASSENGER_INFO_REQUIRED");
  });

  it("calls createEmbedPartnerBooking and returns bookingId on success", async () => {
    const mockBooking: BookingRecord = {
      bookingId: "booking-embed-999",
      tenantId: "tenant-001",
      businessDispatchSubtype: "credit_card_airport_transfer",
      partnerEntrySlug: "ctbc",
      eligibilityVerificationId: "elig-999",
      pickup: { address: "Pickup A", lat: 25, lng: 121 },
      dropoff: { address: "Dropoff B", lat: 25.1, lng: 121.1 },
      reservationWindowStart: "2026-06-01T10:00:00.000Z",
      reservationWindowEnd: "2026-06-01T11:00:00.000Z",
      passenger: { name: "Embed Rider", phone: "0900000000" },
      notes: null,
      flightNo: "CI-100",
      status: "confirmed",
      cancellationReason: null,
      orderId: "order-999",
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
    } as unknown as BookingRecord;

    const mockSession = {
      accessToken: "mock-token",
      expiresIn: "1h",
    } as unknown as PartnerSessionRecord;

    vi.spyOn(apiClient, "createEmbedPartnerBooking").mockResolvedValueOnce({
      session: mockSession,
      booking: mockBooking,
    });

    const req = new NextRequest("http://localhost:3000/api/embed-booking", {
      method: "POST",
      body: JSON.stringify({
        tenantSlug: "ctbc",
        eligibilityVerificationId: "elig-999",
        pickup: { address: "Pickup A", lat: 25, lng: 121 },
        dropoff: { address: "Dropoff B", lat: 25.1, lng: 121.1 },
        reservationWindowStart: "2026-06-01T10:00:00.000Z",
        reservationWindowEnd: "2026-06-01T11:00:00.000Z",
        passenger: { name: "Embed Rider", phone: "0900000000" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.bookingId).toBe("booking-embed-999");
    expect(json.booking.status).toBe("confirmed");
  });
});
