import { describe, expect, it, vi } from "vitest";
import type {
  BookingRecord,
  OwnedOrderRecord,
  PartnerChannelEntryRecord,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";
import { submitEmbeddedAirportBooking } from "@/lib/embed-airport-booking";

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

const handoff = {
  accessToken: "handoff-token",
  tokenType: "Bearer" as const,
  expiresIn: "15m",
  partnerEntrySlug: "ctbc",
  drtsPassengerId: "passenger-001",
  identity: {
    actorType: "referral_passenger" as const,
    actorId: "passenger-001",
    realm: "partner" as const,
    authMode: "jwt_bearer" as const,
    roleFamilies: ["partner"] as ["partner"],
    roles: ["partner_booking"],
    scopes: ["partner:book"],
    tenantId: "tenant-001",
    partnerId: "partner-001",
    partnerProgramId: "program-001",
    partnerEntrySlug: "ctbc",
    drtsPassengerId: "passenger-001",
  },
};

const eligibility = {
  eligibilityVerificationId: "elig-001",
  verificationStatus: "eligible",
} as unknown as PartnerEligibilityVerificationRecord;

const booking = {
  bookingId: "booking-001",
  orderId: "order-001",
  eligibilityVerificationId: "elig-001",
} as unknown as BookingRecord;

const confirmation = {
  bookingId: "booking-001",
  orderId: "order-001",
  orderStatus: "created",
  reservationWindowStart: "2026-07-28T05:30:00.000Z",
} as unknown as BookingRecord;

const receipt = {
  orderId: "order-001",
  orderNo: "ORD-001",
  pickup: { address: "台北市信義區松仁路 100 號" },
  dropoff: { address: "桃園 T2 · 第二航廈 出發接送區" },
  etaSnapshot: { etaMinutes: 12, calculatedAt: "2026-07-28T05:00:00.000Z" },
  status: "created",
} as unknown as OwnedOrderRecord;

describe("submitEmbeddedAirportBooking", () => {
  it("creates a real partner booking through the shared booking path", async () => {
    const getPartnerRouteContext = vi.fn().mockResolvedValue({
      entry: activeEntry,
    });
    const createPartnerIngressHandoff = vi.fn().mockResolvedValue(handoff);
    const verifyPartnerEligibility = vi.fn().mockResolvedValue(eligibility);
    const createPartnerBooking = vi.fn().mockResolvedValue(booking);
    const getPartnerConfirmation = vi.fn().mockResolvedValue(confirmation);
    const getPartnerReceipt = vi.fn().mockResolvedValue(receipt);

    const result = await submitEmbeddedAirportBooking(
      {
        tenantSlug: "ctbc",
        apiKey: "pk_live_001",
        partnerUserRef: "user-001",
        locale: "zh",
        referenceToken: "token-001",
        cardLast4: "1234",
        cardholderName: "王小明",
        benefitReference: "benefit-001",
        flightNo: "CI-100",
        existingEligibilityVerificationId: null,
        submission: {
          address: "台北市信義區松仁路 100 號",
          date: "2026-07-28",
          direction: "out",
          flightNo: "",
          luggageCount: 2,
          passengerName: "王小明",
          phone: "0912345678",
          reservationWindowStart: "2026-07-27T21:30:00.000Z",
          reservationWindowEnd: "2026-07-27T23:30:00.000Z",
          terminal: "桃園 T2 · 第二航廈",
          time: "05:30",
          vehicleId: "sedan",
          vehicleName: "尊榮轎車",
        },
      },
      {
        createPartnerBooking,
        createPartnerIngressHandoff,
        getPartnerConfirmation,
        getPartnerReceipt,
        getPartnerRouteContext,
        verifyPartnerEligibility,
      },
    );

    expect(getPartnerRouteContext).toHaveBeenCalledWith("ctbc");
    expect(createPartnerIngressHandoff).toHaveBeenCalledWith({
      entrySlug: "ctbc",
      apiKey: "pk_live_001",
      partnerUserRef: "user-001",
    });
    expect(verifyPartnerEligibility).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "handoff-token",
        partnerEntry: activeEntry,
        identity: expect.objectContaining({
          actorType: "referral_passenger",
          supportedExecutionModes: [
            "discussion_planning",
            "supervisor_managed_execution",
          ],
        }),
      }),
      {
        referenceToken: "token-001",
        cardLast4: "1234",
        cardholderName: "王小明",
        benefitReference: "benefit-001",
        flightNo: "CI-100",
      },
    );
    expect(createPartnerBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "handoff-token",
        partnerEntry: activeEntry,
      }),
      expect.objectContaining({
        partnerEntrySlug: "ctbc",
        eligibilityVerificationId: "elig-001",
        reservationWindowStart: "2026-07-27T21:30:00.000Z",
        reservationWindowEnd: "2026-07-27T23:30:00.000Z",
        pickup: {
          address: "台北市信義區松仁路 100 號",
          surface: "partner_booking",
        },
        dropoff: {
          address: "桃園 T2 · 第二航廈 出發接送區",
          surface: "partner_booking",
        },
        passenger: {
          name: "王小明",
          phone: "0912345678",
        },
        benefitReference: "benefit-001",
        vehiclePreference: "sedan",
        direction: "dropoff",
        flightNo: "CI-100",
        terminal: "桃園 T2 · 第二航廈",
        luggageCount: 2,
        notes: "尊榮轎車",
      }),
    );
    expect(getPartnerConfirmation).toHaveBeenCalledWith(
      expect.any(Object),
      "booking-001",
    );
    expect(getPartnerReceipt).toHaveBeenCalledWith(
      expect.any(Object),
      "order-001",
    );
    expect(result).toEqual({
      bookingId: "booking-001",
      orderId: "order-001",
      eligibilityVerificationId: "elig-001",
      confirmation,
      receipt,
    });
  });

  it("skips eligibility verification when a verified id is already provided", async () => {
    const getPartnerRouteContext = vi.fn().mockResolvedValue({
      entry: {
        ...activeEntry,
        eligibilityMode: "bank_card_inline",
      },
    });
    const createPartnerIngressHandoff = vi.fn().mockResolvedValue(handoff);
    const verifyPartnerEligibility = vi.fn();
    const createPartnerBooking = vi.fn().mockResolvedValue(booking);
    const getPartnerConfirmation = vi.fn().mockResolvedValue(confirmation);
    const getPartnerReceipt = vi.fn().mockResolvedValue(receipt);

    await submitEmbeddedAirportBooking(
      {
        tenantSlug: "ctbc",
        apiKey: "pk_live_001",
        partnerUserRef: "user-001",
        locale: "zh",
        referenceToken: null,
        cardLast4: null,
        cardholderName: null,
        benefitReference: null,
        flightNo: null,
        existingEligibilityVerificationId: "elig-preverified",
        submission: {
          address: "台北市信義區松仁路 100 號",
          date: "2026-07-28",
          direction: "in",
          flightNo: "BR198",
          luggageCount: 1,
          passengerName: "王小明",
          phone: "0912345678",
          reservationWindowStart: "2026-07-27T21:30:00.000Z",
          reservationWindowEnd: "2026-07-27T23:30:00.000Z",
          terminal: "桃園 T2 · 第二航廈",
          time: "05:30",
          vehicleId: "sedan",
          vehicleName: "尊榮轎車",
        },
      },
      {
        createPartnerBooking,
        createPartnerIngressHandoff,
        getPartnerConfirmation,
        getPartnerReceipt,
        getPartnerRouteContext,
        verifyPartnerEligibility,
      },
    );

    expect(verifyPartnerEligibility).not.toHaveBeenCalled();
    expect(createPartnerBooking).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        eligibilityVerificationId: "elig-preverified",
        direction: "pickup",
      }),
    );
  });

  it("rejects booking when route context is unavailable", async () => {
    const getPartnerRouteContext = vi.fn().mockResolvedValue({
      entry: null,
    });
    const createPartnerIngressHandoff = vi.fn().mockResolvedValue(handoff);
    const verifyPartnerEligibility = vi.fn().mockResolvedValue(eligibility);
    const createPartnerBooking = vi.fn().mockResolvedValue(booking);
    const getPartnerConfirmation = vi.fn().mockResolvedValue(confirmation);
    const getPartnerReceipt = vi.fn().mockResolvedValue(receipt);

    await expect(
      submitEmbeddedAirportBooking(
        {
          tenantSlug: "ctbc",
          apiKey: "pk_live_001",
          partnerUserRef: "user-001",
          locale: "zh",
          referenceToken: "token-001",
          cardLast4: "1234",
          cardholderName: "王小明",
          benefitReference: "benefit-001",
          flightNo: "CI-100",
          existingEligibilityVerificationId: null,
          submission: {
            address: "台北市信義區松仁路 100 號",
            date: "2026-07-28",
            direction: "out",
            flightNo: "",
            luggageCount: 2,
            passengerName: "王小明",
            phone: "0912345678",
            reservationWindowStart: "2026-07-27T21:30:00.000Z",
            reservationWindowEnd: "2026-07-27T23:30:00.000Z",
            terminal: "桃園 T2 · 第二航廈",
            time: "05:30",
            vehicleId: "sedan",
            vehicleName: "尊榮轎車",
          },
        },
        {
          createPartnerBooking,
          createPartnerIngressHandoff,
          getPartnerConfirmation,
          getPartnerReceipt,
          getPartnerRouteContext,
          verifyPartnerEligibility,
        },
      ),
    ).rejects.toThrow("此內嵌預約方案目前無法使用。");

    expect(createPartnerIngressHandoff).not.toHaveBeenCalled();
    expect(verifyPartnerEligibility).not.toHaveBeenCalled();
    expect(createPartnerBooking).not.toHaveBeenCalled();
  });
});
