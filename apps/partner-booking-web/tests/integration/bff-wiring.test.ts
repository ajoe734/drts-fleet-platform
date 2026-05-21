import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  API_URL,
  createPartnerBooking,
  getPartnerConfirmation,
  getPartnerReceipt,
  getPartnerRouteContext,
  getPartnerTrip,
  getPublicPartnerEntry,
  resolvePartnerBrand,
  verifyPartnerEligibility,
  type PartnerSessionRecord,
} from "@/lib/api-client";

const activeEntry = {
  partnerId: "partner-001",
  partnerCode: "ctbc",
  partnerType: "bank",
  programId: "program-001",
  programCode: "WORLD_ELITE",
  tenantId: "tenant-001",
  bankCode: "CTBC",
  entrySlug: "ctbc",
  displayName: "CTBC World Elite",
  businessDispatchSubtype: "credit_card_airport_transfer",
  authMode: "partner_api_key",
  eligibilityMode: "bank_card_inline",
  entryHost: "ride.ctbc.com.tw",
  entryPath: "/partner",
  themeAccent: "#0047AB",
  brandingMetadata: {
    displayName: "CTBC Premier Ride",
    themeAccent: "#0047AB",
    supportEmail: "vip@ctbc.example",
    supportPhone: "0800-000-001",
  },
  eligibilityContract: null,
  status: "active",
  activeFlag: true,
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  createdAt: "2026-05-19T00:00:00.000Z",
  updatedAt: "2026-05-19T00:00:00.000Z",
  auditMetadata: {
    source: "test",
    requestId: "req-001",
    createdBy: "tester",
    updatedBy: "tester",
  },
} as unknown as PartnerChannelEntryRecord;

const session = {
  accessToken: "partner-token",
  expiresIn: "1h",
  partnerEntry: activeEntry,
  identity: {
    authMode: "jwt_bearer",
    actorType: "partner_api_key",
    actorId: "partner-user-001",
    realm: "partner",
    tenantId: "tenant-001",
    partnerId: "partner-001",
    partnerProgramId: "program-001",
    partnerEntrySlug: "ctbc",
    roleFamilies: ["partner"],
    roles: ["partner_booking"],
    scopes: ["partner:book"],
    requestId: "req-001",
  },
} as unknown as PartnerSessionRecord;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("partner-booking-web BFF wiring", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves public partner entries from backend authority", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: activeEntry,
          meta: {
            requestId: "req-123",
            timestamp: "2026-05-19T00:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: activeEntry,
          meta: {
            requestId: "req-124",
            timestamp: "2026-05-19T00:00:01.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicPartnerEntry("ctbc")).resolves.toEqual(activeEntry);
    await expect(getPartnerRouteContext("ctbc")).resolves.toMatchObject({
      entry: activeEntry,
      inactive: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/partner/entries/ctbc`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("distinguishes inactive partner entries from unknown slugs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "PARTNER_ENTRY_INACTIVE",
              message: "The partner entry is inactive and cannot be used.",
              details: { entrySlug: "ctbc", status: "inactive" },
              retryable: false,
            },
          },
          404,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "PARTNER_ENTRY_NOT_FOUND",
              message: "The partner entry could not be found.",
              details: { entrySlug: "ghost" },
              retryable: false,
            },
          },
          404,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("ctbc", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({ slug: "ctbc" }),
    });

    await expect(getPublicPartnerEntry("ghost")).rejects.toMatchObject({
      code: "PARTNER_ENTRY_NOT_FOUND",
      status: 404,
    });
  });

  it("preserves backend canonical eligibility error codes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "ELIGIBILITY_VERIFICATION_REQUIRED",
            message: "Eligibility verification id is required.",
            details: { entrySlug: "ctbc" },
            retryable: false,
          },
        },
        422,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyPartnerEligibility(session, {
        cardLast4: "1234",
        cardholderName: "Tester",
      }),
    ).rejects.toMatchObject({
      code: "ELIGIBILITY_VERIFICATION_REQUIRED",
      status: 422,
    });
  });

  it("overlays backend branding metadata on top of the local template", () => {
    const brand = resolvePartnerBrand(activeEntry);
    expect(brand.displayName).toBe("CTBC Premier Ride");
    expect(brand.hotline.phone).toBe("0800-000-001");
    expect(brand.tagline).toContain("vip@ctbc.example");
    expect(brand.primary).toBe("#0047AB");
  });

  it("uses backend authority clients for booking confirmation, trip, and receipt", async () => {
    const booking = {
      bookingId: "booking-001",
      orderId: "order-001",
      tenantId: "tenant-001",
      partnerId: "partner-001",
      partnerProgramId: "program-001",
      partnerEntrySlug: "ctbc",
      eligibilityVerificationId: "elig-001",
      issuerAuthorizationRef: null,
      status: "active",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "credit_card_airport_transfer",
      bookingType: "oneway",
      reservationWindowStart: "2026-05-19T10:00:00.000Z",
      reservationWindowEnd: "2026-05-19T11:00:00.000Z",
      recurrenceRule: null,
      modifiableUntil: null,
      cancelableUntil: null,
      pickup: { address: "A", lat: 25, lng: 121 },
      dropoff: { address: "B", lat: 25.1, lng: 121.1 },
      passenger: { name: "Test Rider", phone: "0912000000" },
      bookedBy: null,
      onsiteContact: null,
      costCenter: null,
      vehiclePreference: null,
      benefitReference: null,
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: null,
      quotedFare: null,
      quotedFareSource: null,
      quotedFareRuleVersion: null,
      manualFareOverride: null,
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceGates: [],
      orderStatus: "created",
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
    } as unknown as BookingRecord;
    const order = {
      orderId: "order-001",
      orderNo: "ORD-001",
      bookingId: "booking-001",
      tenantId: "tenant-001",
      passengerId: null,
      source: "tenant_booking",
      status: "created",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "credit_card_airport_transfer",
      pickup: { address: "A", lat: 25, lng: 121 },
      dropoff: { address: "B", lat: 25.1, lng: 121.1 },
      passenger: { name: "Test Rider", phone: "0912000000" },
      requestedAt: "2026-05-19T00:00:00.000Z",
      reservationWindowStart: "2026-05-19T10:00:00.000Z",
      reservationWindowEnd: "2026-05-19T11:00:00.000Z",
      acceptedAt: null,
      arrivedAt: null,
      boardedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      assignedDriverId: null,
      assignedVehicleId: null,
      estimatedDistanceKm: null,
      estimatedDurationMin: null,
      actualDistanceKm: null,
      actualDurationMin: null,
      fare: null,
      pricingVersionSnapshot: null,
      approvalRequestId: null,
      tenantApprovalState: "not_required",
      dispatchContext: null,
      sourceMetadata: null,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:00:00.000Z",
    } as unknown as OwnedOrderRecord;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: booking,
          meta: { requestId: "r1", timestamp: "t1" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: booking,
          meta: { requestId: "r2", timestamp: "t2" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: order,
          meta: { requestId: "r3", timestamp: "t3" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: order,
          meta: { requestId: "r4", timestamp: "t4" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPartnerBooking(session, {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "ctbc",
        eligibilityVerificationId: "elig-001",
        pickup: { address: "A", lat: 25, lng: 121 },
        dropoff: { address: "B", lat: 25.1, lng: 121.1 },
        reservationWindowStart: "2026-05-19T10:00:00.000Z",
        reservationWindowEnd: "2026-05-19T11:00:00.000Z",
        passenger: { name: "Test Rider", phone: "0912000000" },
      }),
    ).resolves.toEqual(booking);
    await expect(
      getPartnerConfirmation(session, "booking-001"),
    ).resolves.toEqual(booking);
    await expect(getPartnerTrip(session, "order-001")).resolves.toEqual(order);
    await expect(getPartnerReceipt(session, "order-001")).resolves.toEqual(
      order,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/api/tenant/bookings`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
          "x-realm": "partner",
          "x-tenant-id": "tenant-001",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/api/tenant/bookings/booking-001`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${API_URL}/api/orders/order-001`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
        }),
      }),
    );
  });
});
