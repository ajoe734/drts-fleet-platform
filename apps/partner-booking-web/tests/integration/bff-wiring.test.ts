import { loadPartnerBookingRecord } from "@/lib/partner-booking-read-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import {
  API_URL,
  clearPartnerEntryAuthorityCacheForTests,
  createPartnerBooking,
  createPartnerIngressHandoff,
  createPartnerSessionFromIngressHandoff,
  getPartnerConfirmation,
  getPartnerReceipt,
  getPartnerRouteContext,
  getPartnerTrip,
  getPublicPartnerEntry,
  PartnerAuthorityError,
  resolvePartnerBrand,
  verifyPartnerEligibility,
  type PartnerSessionRecord,
} from "@/lib/api-client";

const activeEntry = {
  partnerId: "partner-001",
  partnerCode: "acme",
  partnerType: "bank",
  programId: "program-001",
  programCode: "WORLD_ELITE",
  tenantId: "tenant-001",
  bankCode: "ACME",
  entrySlug: "acme",
  displayName: "ACME Elite Demo",
  businessDispatchSubtype: "credit_card_airport_transfer",
  authMode: "partner_api_key",
  eligibilityMode: "bank_card_inline",
  entryHost: "ride.acme.example",
  entryPath: "/partner",
  themeAccent: "#0047AB",
  brandingMetadata: {
    displayName: "ACME Premier Ride",
    themeAccent: "#0047AB",
    supportEmail: "vip@acme.example",
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
    partnerEntrySlug: "acme",
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

    await expect(getPublicPartnerEntry("acme")).resolves.toEqual(activeEntry);
    await expect(getPartnerRouteContext("acme")).resolves.toMatchObject({
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
      `${API_URL}/api/partner/entries/acme`,
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

    await expect(getPartnerRouteContext("acme")).resolves.toMatchObject({
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
      getPartnerRouteContext("acme", { allowInactive: true }),
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
    // SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: INTERNAL_KEY_EXCP_002 retired,
    // requestAuthority no longer sends the legacy internal key at all.
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (requestInit.headers as Record<string, string>)["x-drts-internal-key"],
    ).toBeUndefined();
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

  it("normalizes a dev handoff token before the next authenticated authority call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            access_token: "signed-partner-token",
            token_type: "Bearer",
            expires_in: "15m",
            partner_entry_slug: "acme",
            drts_passenger_id: "passenger-001",
            identity: {
              actor_type: "referral_passenger",
              actor_id: "passenger-001",
              realm: "partner",
              auth_mode: "jwt_bearer",
              role_families: ["partner"],
              roles: ["partner_booking"],
              scopes: ["partner:book"],
              tenant_id: "tenant-001",
              partner_id: "partner-001",
              partner_program_id: "program-001",
              partner_entry_slug: "acme",
              drts_passenger_id: "passenger-001",
            },
          },
          meta: {
            request_id: "handoff-request",
            timestamp: "2026-07-28T00:00:00Z",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            eligibility_verification_id: "elig-001",
            verification_status: "eligible",
          },
          meta: {
            request_id: "eligibility-request",
            timestamp: "2026-07-28T00:00:01Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const handoff = await createPartnerIngressHandoff({
      entrySlug: "acme",
      partnerUserRef: "partner-user-001",
    });
    const normalizedSession = createPartnerSessionFromIngressHandoff(
      handoff,
      activeEntry,
    );

    expect(normalizedSession.accessToken).toBe("signed-partner-token");
    await expect(
      verifyPartnerEligibility(normalizedSession, {
        referenceToken: "reference-token",
      }),
    ).resolves.toMatchObject({
      eligibilityVerificationId: "elig-001",
      verificationStatus: "eligible",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_URL}/api/partner/eligibility/verify`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer signed-partner-token",
        }),
      }),
    );
  });

  it("normalizes nested authority error details at the wire boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: "PARTNER_ELIGIBILITY_REJECTED",
              message: "Eligibility was rejected.",
              details: {
                verification_id: "elig-001",
                decision_context: { reason_code: "BENEFIT_EXHAUSTED" },
              },
              retryable: false,
            },
          },
          409,
        ),
      ),
    );

    const error = await verifyPartnerEligibility(session, {
      referenceToken: "reference-token",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PartnerAuthorityError);
    expect(error).toMatchObject({
      code: "PARTNER_ELIGIBILITY_REJECTED",
      details: {
        verificationId: "elig-001",
        decisionContext: { reasonCode: "BENEFIT_EXHAUSTED" },
      },
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
              details: { entrySlug: "acme", status: "inactive" },
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
      getPartnerRouteContext("acme", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
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
            details: { entrySlug: "acme" },
            retryable: false,
          },
        },
        404,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("acme", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
        tagline:
          "卡友禮賓接送 · 行動銀行內嵌 · 7 步驟漏斗 · 等待後端合作入口啟用",
      }),
    });
    await expect(getPartnerRouteContext("acme")).rejects.toMatchObject({
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
              route: "/api/partner/entries/acme",
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
      getPartnerRouteContext("acme", { allowMissing: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
      }),
    });
    await expect(getPartnerRouteContext("acme")).rejects.toMatchObject({
      code: "INTERNAL_KEY_REQUIRED",
      status: 401,
    });
  });

  it("lets public shells fallback when the authority rejects the request (SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: no legacy internal key is sent anymore)", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "INTERNAL_KEY_INVALID",
            message:
              "x-drts-internal-key header is invalid for this environment.",
            details: {
              route: "/api/partner/entries/acme",
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
      getPartnerRouteContext("acme", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
      }),
    });
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (requestInit.headers as Record<string, string>)["x-drts-internal-key"],
    ).toBeUndefined();
    await expect(getPartnerRouteContext("acme")).rejects.toMatchObject({
      code: "INTERNAL_KEY_INVALID",
      status: 401,
    });
  });

  it("lets public shells fallback when the dev authority is offline", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("acme", { allowMissing: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
      }),
    });
    await expect(getPartnerRouteContext("acme")).rejects.toMatchObject({
      code: "PARTNER_AUTHORITY_UNAVAILABLE",
      status: 503,
    });
  });

  it("lets booking routes fallback on authority outage only when explicitly allowed", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("acme", { allowAuthorityOutage: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
      }),
      provenance: expect.objectContaining({
        source: "local_fallback",
        fallbackCode: "PARTNER_AUTHORITY_UNAVAILABLE",
        fallbackStatus: 503,
      }),
    });

    await expect(getPartnerRouteContext("acme")).rejects.toMatchObject({
      code: "PARTNER_AUTHORITY_UNAVAILABLE",
      status: 503,
    });
  });

  it("lets public shells fallback when mounted authority returns a server error", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(
        {
          error: {
            code: "PARTNER_AUTHORITY_REQUEST_FAILED",
            message: "Partner authority failed while resolving the entry.",
            details: { entrySlug: "adventureworks" },
            retryable: false,
          },
        },
        500,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("adventureworks", { allowInactive: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "Adventure Works Transfer",
        slug: "adventureworks",
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
    // SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: INTERNAL_KEY_EXCP_002 retired,
    // requestAuthority no longer sends the legacy internal key at all.
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (requestInit.headers as Record<string, string>)["x-drts-internal-key"],
    ).toBeUndefined();
    await expect(
      getPartnerRouteContext("adventureworks"),
    ).rejects.toMatchObject({
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
              details: { entrySlug: "acme" },
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
              details: { entrySlug: "acme", status: "inactive" },
              retryable: false,
            },
          },
          404,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getPartnerRouteContext("acme", { allowMissing: true }),
    ).resolves.toMatchObject({
      inactive: true,
      entry: null,
      brand: expect.objectContaining({
        displayName: "ACME Elite Demo",
        slug: "acme",
        tagline:
          "卡友禮賓接送 · 行動銀行內嵌 · 7 步驟漏斗 · 等待後端合作入口啟用",
      }),
    });
    await expect(
      getPartnerRouteContext("acme", { allowMissing: true }),
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
            details: { entrySlug: "acme" },
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

  it("no longer adds the legacy internal key to authority requests, even if DRTS_INTERNAL_KEY is still set (SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: INTERNAL_KEY_EXCP_002 retired)", async () => {
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

    await expect(getPublicPartnerEntry("acme")).resolves.toEqual(activeEntry);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (requestInit.headers as Record<string, string>)["x-drts-internal-key"],
    ).toBeUndefined();
  });

  it("overlays backend branding metadata on top of the local template", () => {
    const brand = resolvePartnerBrand(activeEntry);
    expect(brand.displayName).toBe("ACME Premier Ride");
    expect(brand.hotline.phone).toBe("0800-000-001");
    expect(brand.tagline).toContain("vip@acme.example");
    expect(brand.primary).toBe("#0047AB");
  });

  it("matches adventureworks travel branding from host and subtype hints", () => {
    const brand = resolvePartnerBrand({
      ...activeEntry,
      entrySlug: "adventureworks-group-landing",
      displayName: "探索團體接送",
      programCode: "GROUP_TRANSFER",
      bankCode: "ADVENTURE",
      businessDispatchSubtype: "travel_agency_transfer",
      entryHost: "booking.adventure-works.example",
      themeAccent: "#B0420E",
      brandingMetadata: {
        displayName: "探索團體接送",
        themeAccent: "#B0420E",
        supportEmail: "group@liontravel.example",
        supportPhone: "0800-000-105",
      },
    });

    expect(brand.code).toBe("ADVENTURE");
    expect(brand.host).toBe("booking.adventure-works.example");
    expect(brand.hotline.label).toBe("探索團體服務專線");
  });

  it("uses backend authority clients for booking confirmation, trip, and receipt", async () => {
    const booking = {
      bookingId: "booking-001",
      orderId: "order-001",
      tenantId: "tenant-001",
      partnerId: "partner-001",
      partnerProgramId: "program-001",
      partnerEntrySlug: "acme",
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

    const receipt = {
      orderId: order.orderId,
      bookingId: booking.bookingId,
      orderNo: order.orderNo,
      orderStatus: order.status,
      quotedFare: null,
      completion: null,
      payment: { availability: "not_recorded", status: null, amount: null },
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: { booking, order },
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
          data: receipt,
          meta: { requestId: "r4", timestamp: "t4" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createPartnerBooking(session, {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "acme",
        eligibilityVerificationId: "elig-001",
        pickup: { address: "A", lat: 25, lng: 121 },
        dropoff: { address: "B", lat: 25.1, lng: 121.1 },
        reservationWindowStart: "2026-05-19T10:00:00.000Z",
        reservationWindowEnd: "2026-05-19T11:00:00.000Z",
        passenger: { name: "Test Rider", phone: "0912000000" },
      }),
    ).resolves.toEqual({ booking, order });
    await expect(
      getPartnerConfirmation(session, "booking-001"),
    ).resolves.toEqual(booking);
    await expect(getPartnerTrip(session, "order-001")).resolves.toEqual(order);
    await expect(getPartnerReceipt(session, "order-001")).resolves.toEqual(
      receipt,
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_URL}/api/partner/bookings`,
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
      `${API_URL}/api/partner/bookings/booking-001`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${API_URL}/api/partner/orders/order-001`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      API_URL + "/api/partner/orders/order-001/receipt",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
          "x-realm": "partner",
          "x-tenant-id": "tenant-001",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("normal Partner direct requests to a private Cloud Run API", () => {
  it.each(["entry", "trip", "create"] as const)(
    "carries the existing transport token for %s without replacing product identity",
    async (operation) => {
      const oldAudience = process.env.DRTS_API_AUTH_AUDIENCE;
      process.env.DRTS_API_AUTH_AUDIENCE = "https://SIM-private-api.a.run.app";
      clearPartnerEntryAuthorityCacheForTests();
      const calls: { url: string; headers: Headers }[] = [];
      const order = {
        orderId: "SIM-cloud-order",
        bookingId: "SIM-cloud-booking",
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL, init?: RequestInit) => {
          const url = new URL(String(input));
          calls.push({ url: url.href, headers: new Headers(init?.headers) });
          if (url.hostname === "metadata.google.internal")
            return new Response("SIM-google-transport-token", { status: 200 });
          return jsonResponse({
            data:
              operation === "entry"
                ? activeEntry
                : operation === "create"
                  ? {
                      booking: {
                        bookingId: order.bookingId,
                        orderId: order.orderId,
                      },
                      order,
                    }
                  : order,
            meta: {
              requestId: "SIM-cloud-transport",
              timestamp: "2026-11-12T00:00:00Z",
            },
          });
        }),
      );
      try {
        if (operation === "entry") await getPublicPartnerEntry("acme");
        else if (operation === "trip")
          await getPartnerTrip(session, order.orderId);
        else
          await createPartnerBooking(session, {
            businessDispatchSubtype: "credit_card_airport_transfer",
            partnerEntrySlug: "acme",
            eligibilityVerificationId: "SIM-eligibility",
            pickup: { address: "SIM A", lat: 25, lng: 121 },
            dropoff: { address: "SIM B", lat: 25.1, lng: 121.1 },
            reservationWindowStart: "2099-11-12T10:00:00Z",
            reservationWindowEnd: "2099-11-12T11:00:00Z",
            passenger: { name: "SIM Passenger", phone: "0900000000" },
          });
        expect(calls).toHaveLength(2);
        const metadata = new URL(calls[0]!.url);
        expect(metadata.hostname).toBe("metadata.google.internal");
        expect(metadata.searchParams.get("audience")).toBe(
          process.env.DRTS_API_AUTH_AUDIENCE,
        );
        expect(calls[0]!.headers.get("Metadata-Flavor")).toBe("Google");
        const outbound = calls[1]!.headers;
        expect(outbound.get("x-serverless-authorization")).toBe(
          "Bearer SIM-google-transport-token",
        );
        expect(outbound.get("x-drts-google-id-token")).toBe(
          "SIM-google-transport-token",
        );
        expect(outbound.get("Authorization")).toBe(
          operation === "entry" ? null : "Bearer partner-token",
        );
        expect(outbound.get("x-request-id")).toBeTruthy();
      } finally {
        if (oldAudience === undefined)
          delete process.env.DRTS_API_AUTH_AUDIENCE;
        else process.env.DRTS_API_AUTH_AUDIENCE = oldAudience;
        clearPartnerEntryAuthorityCacheForTests();
        vi.unstubAllGlobals();
      }
    },
  );

  it("does not invent a transport token when the existing metadata source has none", async () => {
    const oldAudience = process.env.DRTS_API_AUTH_AUDIENCE;
    process.env.DRTS_API_AUTH_AUDIENCE = "https://SIM-private-api.a.run.app";
    const calls: Headers[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname === "metadata.google.internal")
          return new Response(null, { status: 503 });
        calls.push(new Headers(init?.headers));
        return jsonResponse({
          data: { orderId: "SIM-cloud-order" },
          meta: { requestId: "SIM-cloud-no-token", timestamp: "t" },
        });
      }),
    );
    try {
      await getPartnerTrip(session, "SIM-cloud-order");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.get("x-serverless-authorization")).toBeNull();
      expect(calls[0]!.get("x-drts-google-id-token")).toBeNull();
      expect(calls[0]!.get("Authorization")).toBe("Bearer partner-token");
    } finally {
      if (oldAudience === undefined) delete process.env.DRTS_API_AUTH_AUDIENCE;
      else process.env.DRTS_API_AUTH_AUDIENCE = oldAudience;
      vi.unstubAllGlobals();
    }
  });
});

describe("normal Partner order progress wire compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    clearPartnerEntryAuthorityCacheForTests();
  });

  it("preserves fresh progress on the same ordinary order GET and its original bearer", async () => {
    const progress = {
      orderId: "SIM-wire-order",
      availability: "available",
      currentTask: { taskId: "SIM-wire-task" },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { orderId: "SIM-wire-order", progress },
        meta: {},
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getPartnerTrip(session, "SIM-wire-order"),
    ).resolves.toMatchObject({ orderId: "SIM-wire-order", progress });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/partner/orders/SIM-wire-order`,
      expect.objectContaining({
        cache: "no-store",
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer partner-token",
        }),
      }),
    );
  });

  it("rejects cross-order progress through the original server read helper without exposing the session", async () => {
    const privateToken = "SIM-wire-server-only";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const path = new URL(String(input)).pathname;
        calls.push(path);
        if (path === "/api/partner/entries/acme")
          return jsonResponse({ data: activeEntry, meta: {} });
        if (path === "/api/partner/ingress/handoff")
          return jsonResponse({
            data: {
              accessToken: privateToken,
              expiresIn: "15m",
              tokenType: "Bearer",
              identity: session.identity,
            },
            meta: {},
          });
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer " + privateToken,
        );
        if (path === "/api/partner/bookings/SIM-wire-booking")
          return jsonResponse({
            data: { bookingId: "SIM-wire-booking", orderId: "SIM-wire-order" },
            meta: {},
          });
        if (path === "/api/partner/orders/SIM-wire-order")
          return jsonResponse({
            data: {
              bookingId: "SIM-wire-booking",
              orderId: "SIM-wire-order",
              progress: { orderId: "unrelated-order" },
            },
            meta: {},
          });
        throw new Error("Unexpected normal wire route: " + path);
      }),
    );
    await expect(
      loadPartnerBookingRecord("acme", {
        partnerUserRef: "SIM-existing-owner",
        bookingId: "SIM-wire-booking",
      }),
    ).rejects.toMatchObject({ code: "PARTNER_BOOKING_READBACK_MISMATCH" });
    expect(calls).toEqual([
      "/api/partner/entries/acme",
      "/api/partner/ingress/handoff",
      "/api/partner/bookings/SIM-wire-booking",
      "/api/partner/orders/SIM-wire-order",
    ]);
  });
});
