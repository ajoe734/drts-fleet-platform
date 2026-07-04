import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  API_URL,
  clearPartnerEntryAuthorityCacheForTests,
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

const snakeCaseEntry = {
  partner_id: "partner-bank-demo-001",
  partner_code: "bank_demo_alpha",
  partner_type: "bank_partner",
  program_id: "program-airport-alpha",
  program_code: "AIRPORT_ALPHA",
  tenant_id: "tenant-demo-001",
  bank_code: "BANK_DEMO_ALPHA",
  entry_slug: "bank-demo-alpha-airport",
  display_name: "Bank Demo Alpha Airport Transfer",
  business_dispatch_subtype: "credit_card_airport_transfer",
  auth_mode: "partner_api_key",
  eligibility_mode: "bank_card_inline",
  entry_host: null,
  entry_path: "/partner/bank-demo-alpha-airport",
  theme_accent: "#0b7285",
  branding_metadata: {
    display_name: "Bank Demo Alpha Airport Transfer",
    theme_accent: "#0b7285",
    support_email: "alpha-airport@bank-demo.example",
    support_phone: "0800-000-111",
  },
  eligibility_contract: null,
  status: "active",
  active_flag: true,
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  created_at: "2026-04-10T00:00:00.000Z",
  updated_at: "2026-04-10T00:00:00.000Z",
  audit_metadata: {
    source: "seed_bootstrap",
    request_id: null,
    created_by: "system:seed",
    updated_by: "system:seed",
  },
};

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
    clearPartnerEntryAuthorityCacheForTests();
    delete process.env.DRTS_INTERNAL_KEY;
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
      provenance: {
        source: "authority",
        requestId: "req-124",
        timestamp: "2026-05-19T00:00:01.000Z",
        entryUpdatedAt: activeEntry.updatedAt,
        auditSource: "test",
        auditRequestId: "req-001",
        fallbackCode: null,
        fallbackStatus: null,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/partner/entries/ctbc`,
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("reuses authority-backed route entry envelopes across render bursts", async () => {
    process.env.DRTS_INTERNAL_KEY = "dev-internal-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: activeEntry,
        meta: {
          requestId: "req-cache",
          timestamp: "2026-05-19T00:00:03.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPartnerRouteContext("ctbc")).resolves.toMatchObject({
      entry: activeEntry,
      provenance: {
        source: "authority",
        requestId: "req-cache",
        timestamp: "2026-05-19T00:00:03.000Z",
        fallbackCode: null,
        fallbackStatus: null,
      },
    });
    await expect(
      getPartnerRouteContext("ctbc", { allowInactive: true }),
    ).resolves.toMatchObject({
      entry: activeEntry,
      provenance: {
        source: "authority_cache",
        requestId: "req-cache",
        timestamp: "2026-05-19T00:00:03.000Z",
        fallbackCode: null,
        fallbackStatus: null,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL + "/api/partner/entries/ctbc",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-drts-internal-key": "dev-internal-key",
        }),
      }),
    );
  });

  it("normalizes snake_case public partner entries from the dev API envelope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: snakeCaseEntry,
          meta: {
            request_id: "req-126",
            timestamp: "2026-06-12T00:00:00.000Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: snakeCaseEntry,
          meta: {
            request_id: "req-127",
            timestamp: "2026-06-12T00:00:01.000Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPublicPartnerEntry("bank-demo-alpha-airport"),
    ).resolves.toMatchObject({
      entrySlug: "bank-demo-alpha-airport",
      displayName: "Bank Demo Alpha Airport Transfer",
      activeFlag: true,
      brandingMetadata: {
        displayName: "Bank Demo Alpha Airport Transfer",
        supportEmail: "alpha-airport@bank-demo.example",
      },
      auditMetadata: {
        createdBy: "system:seed",
      },
    });

    await expect(
      getPartnerRouteContext("bank-demo-alpha-airport"),
    ).resolves.toMatchObject({
      inactive: false,
      brand: expect.objectContaining({
        slug: "bank-demo-alpha-airport",
        displayName: "Bank Demo Alpha Airport Transfer",
      }),
      provenance: expect.objectContaining({
        requestId: "req-127",
        timestamp: "2026-06-12T00:00:01.000Z",
      }),
    });
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
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
        tagline:
          "卡友禮賓接送 · 行動銀行內嵌 · 7 步驟漏斗 · 等待後端合作入口啟用",
      }),
    });

    await expect(getPublicPartnerEntry("ghost")).rejects.toMatchObject({
      code: "PARTNER_ENTRY_NOT_FOUND",
      status: 404,
    });
  });

  it("uses the local shell fallback for program routes before a dev entry is seeded", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "PARTNER_ENTRY_NOT_FOUND",
            message: "The partner entry could not be found.",
            details: { entrySlug: "ctbc" },
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
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
        tagline:
          "卡友禮賓接送 · 行動銀行內嵌 · 7 步驟漏斗 · 等待後端合作入口啟用",
      }),
    });
    await expect(getPartnerRouteContext("ctbc")).rejects.toMatchObject({
      code: "PARTNER_ENTRY_NOT_FOUND",
      status: 404,
    });
  });

  it("lets public shells fallback when the dev authority requires an internal key that is not mounted", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "INTERNAL_KEY_REQUIRED",
            message:
              "x-drts-internal-key header is required for this environment.",
            details: {
              route: "/api/partner/entries/ctbc",
              method: "GET",
            },
            retryable: false,
          },
        },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("ctbc", { allowMissing: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
      }),
    });
    await expect(getPartnerRouteContext("ctbc")).rejects.toMatchObject({
      code: "INTERNAL_KEY_REQUIRED",
      status: 401,
    });
  });

  it("lets public shells fallback when the mounted internal key is rejected", async () => {
    process.env.DRTS_INTERNAL_KEY = "stale-dev-key";
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "INTERNAL_KEY_INVALID",
            message:
              "x-drts-internal-key header is invalid for this environment.",
            details: {
              route: "/api/partner/entries/ctbc",
              method: "GET",
            },
            retryable: false,
          },
        },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("ctbc", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/partner/entries/ctbc`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-drts-internal-key": "stale-dev-key",
        }),
      }),
    );
    await expect(getPartnerRouteContext("ctbc")).rejects.toMatchObject({
      code: "INTERNAL_KEY_INVALID",
      status: 401,
    });
  });

  it("lets public shells fallback when the dev authority is offline", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("ctbc", { allowMissing: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
      }),
    });
    await expect(getPartnerRouteContext("ctbc")).rejects.toMatchObject({
      code: "PARTNER_AUTHORITY_UNAVAILABLE",
      status: 503,
    });
  });

  it("lets booking routes fallback on authority outage only when explicitly allowed", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("ctbc", { allowAuthorityOutage: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
      }),
      provenance: expect.objectContaining({
        source: "local_fallback",
        fallbackCode: "PARTNER_AUTHORITY_UNAVAILABLE",
        fallbackStatus: 503,
      }),
    });

    await expect(getPartnerRouteContext("ctbc")).rejects.toMatchObject({
      code: "PARTNER_AUTHORITY_UNAVAILABLE",
      status: 503,
    });
  });

  it("lets public shells fallback when mounted authority returns a server error", async () => {
    process.env.DRTS_INTERNAL_KEY = "dev-internal-key";
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "PARTNER_AUTHORITY_REQUEST_FAILED",
            message: "Partner authority failed while resolving the entry.",
            details: { entrySlug: "lion" },
            retryable: false,
          },
        },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("lion", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "Lion Group Transfer",
        slug: "lion",
      }),
      provenance: {
        source: "local_fallback",
        requestId: null,
        timestamp: null,
        entryUpdatedAt: null,
        auditSource: null,
        auditRequestId: null,
        fallbackCode: "PARTNER_AUTHORITY_REQUEST_FAILED",
        fallbackStatus: 500,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      API_URL + "/api/partner/entries/lion",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-drts-internal-key": "dev-internal-key",
        }),
      }),
    );
    await expect(getPartnerRouteContext("lion")).rejects.toMatchObject({
      code: "PARTNER_AUTHORITY_REQUEST_FAILED",
      status: 500,
    });
  });

  it("lets public shells fallback on missing entries without swallowing inactive entries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              code: "PARTNER_ENTRY_NOT_FOUND",
              message: "The partner entry could not be found.",
              details: { entrySlug: "ctbc" },
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
              code: "PARTNER_ENTRY_INACTIVE",
              message: "The partner entry is inactive and cannot be used.",
              details: { entrySlug: "ctbc", status: "inactive" },
              retryable: false,
            },
          },
          404,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("ctbc", { allowMissing: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "CTBC World Elite",
        slug: "ctbc",
        tagline:
          "卡友禮賓接送 · 行動銀行內嵌 · 7 步驟漏斗 · 等待後端合作入口啟用",
      }),
    });
    await expect(
      getPartnerRouteContext("ctbc", { allowMissing: true }),
    ).rejects.toMatchObject({
      code: "PARTNER_ENTRY_INACTIVE",
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

  it("adds the server-only internal key to authority requests when configured", async () => {
    process.env.DRTS_INTERNAL_KEY = "dev-internal-key";
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: activeEntry,
        meta: {
          requestId: "req-125",
          timestamp: "2026-05-19T00:00:02.000Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicPartnerEntry("ctbc")).resolves.toEqual(activeEntry);

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/partner/entries/ctbc`,
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-drts-internal-key": "dev-internal-key",
        }),
      }),
    );
  });

  it("overlays backend branding metadata on top of the local template", () => {
    const brand = resolvePartnerBrand(activeEntry);
    expect(brand.displayName).toBe("CTBC Premier Ride");
    expect(brand.hotline.phone).toBe("0800-000-001");
    expect(brand.tagline).toContain("vip@ctbc.example");
    expect(brand.primary).toBe("#0047AB");
  });

  it("matches lion travel branding from host and subtype hints", () => {
    const brand = resolvePartnerBrand({
      ...activeEntry,
      entrySlug: "lion-group-landing",
      displayName: "雄獅團體接送",
      programCode: "GROUP_TRANSFER",
      bankCode: "LION",
      businessDispatchSubtype: "travel_agency_transfer",
      entryHost: "booking.lion-travel.com.tw",
      themeAccent: "#B0420E",
      brandingMetadata: {
        displayName: "雄獅團體接送",
        themeAccent: "#B0420E",
        supportEmail: "group@liontravel.example",
        supportPhone: "0800-090-068",
      },
    });

    expect(brand.code).toBe("LION");
    expect(brand.host).toBe("booking.lion-travel.com.tw");
    expect(brand.hotline.label).toBe("雄獅團體服務專線");
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
