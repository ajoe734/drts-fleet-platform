import { describe, expect, it } from "vitest";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import { evaluateAddressSubmitGate } from "@drts/ui-web";
import {
  createDefaultPartnerBookingDraft,
  getPartnerBookingFieldErrors,
  getPartnerMapSubmitGate,
  getPartnerProgramCoverage,
  getPartnerProgramGate,
  getPartnerProgramLabel,
  isPartnerBookingDraftReady,
} from "@/lib/partner-booking-form";

function makeEntry(
  overrides: Partial<
    Pick<
      PartnerChannelEntryRecord,
      "businessDispatchSubtype" | "eligibilityMode" | "entrySlug"
    >
  > = {},
): Pick<
  PartnerChannelEntryRecord,
  "businessDispatchSubtype" | "eligibilityMode" | "entrySlug"
> {
  return {
    businessDispatchSubtype: "credit_card_airport_transfer",
    eligibilityMode: "bank_card_inline",
    entrySlug: "ctbc",
    ...overrides,
  };
}

describe("partner booking program form utilities", () => {
  it("blocks airport transfer until an eligibility verification id is present", () => {
    const draft = createDefaultPartnerBookingDraft();
    const gate = getPartnerProgramGate({
      entry: makeEntry(),
      draft,
      eligibilityVerificationId: null,
    });

    expect(gate.state).toBe("blocked");
    expect(gate.actionHref).toBe("/ctbc/eligibility");
  });

  it("localizes program labels, coverage, gates, and validation errors", () => {
    const draft = createDefaultPartnerBookingDraft();
    const gate = getPartnerProgramGate({
      entry: makeEntry(),
      draft,
      eligibilityVerificationId: null,
      locale: "en",
    });
    const errors = getPartnerBookingFieldErrors({
      draft,
      subtype: "credit_card_airport_transfer",
      locale: "en",
    });

    expect(getPartnerProgramLabel("credit_card_airport_transfer", "en")).toBe(
      "Credit-card airport transfer",
    );
    expect(getPartnerProgramCoverage("travel_agency_transfer", "zh")).toContain(
      "團體",
    );
    expect(gate.message).toContain("verified eligibility");
    expect(errors.pickupAddress).toBe("Pickup address is required.");
  });

  it("requires claim, policy, claimant, and replacement-vehicle coverage fields for insurance replacement", () => {
    const draft = createDefaultPartnerBookingDraft();
    const errors = getPartnerBookingFieldErrors({
      draft,
      subtype: "insurance_replacement_vehicle",
    });

    expect(errors.claimNumber).toBeTruthy();
    expect(errors.policyNumber).toBeTruthy();
    expect(errors.claimReference).toBeTruthy();
    expect(errors.claimantName).toBeTruthy();
    expect(errors.replacementStart).toBeUndefined();
    expect(errors.replacementEnd).toBeUndefined();
    expect(errors.replacementVehicleClass).toBeTruthy();
  });

  it("requires roster-oriented travel fields for travel agency transfers", () => {
    const draft = createDefaultPartnerBookingDraft();
    const errors = getPartnerBookingFieldErrors({
      draft,
      subtype: "travel_agency_transfer",
    });

    expect(errors.groupCode).toBeTruthy();
    expect(errors.groupSize).toBeTruthy();
    expect(errors.itineraryLink).toBeTruthy();
    expect(errors.meetingPoint).toBeTruthy();
    expect(errors.rosterPassengers).toBeTruthy();
  });

  it("marks a completed travel-agency draft ready when eligibility mode is none", () => {
    const draft = createDefaultPartnerBookingDraft();
    draft.pickupAddress = "Taipei Main Station";
    draft.dropoffAddress = "Taoyuan Airport T1";
    draft.passengerName = "Tour Leader";
    draft.passengerPhone = "0912000000";
    draft.groupCode = "GRP-101";
    draft.groupSize = "18";
    draft.itineraryLink =
      "https://booking.lion-travel.com.tw/itinerary/GRP-101";
    draft.luggageCount = "12";
    draft.meetingPoint = "North Gate coach bay";
    draft.rosterPassengers = "Tour Leader\\nPassenger A\\nPassenger B";

    expect(
      isPartnerBookingDraftReady({
        entry: makeEntry({
          businessDispatchSubtype: "travel_agency_transfer",
          eligibilityMode: "none",
          entrySlug: "grand",
        }),
        draft,
        eligibilityVerificationId: null,
      }),
    ).toBe(true);
  });

  it("rejects invalid itinerary links for travel agency transfers", () => {
    const draft = createDefaultPartnerBookingDraft();
    draft.pickupAddress = "Taipei Main Station";
    draft.dropoffAddress = "Taoyuan Airport T1";
    draft.passengerName = "Tour Leader";
    draft.passengerPhone = "0912000000";
    draft.groupCode = "GRP-101";
    draft.groupSize = "18";
    draft.itineraryLink = "lion-itinerary";
    draft.meetingPoint = "North Gate coach bay";
    draft.rosterPassengers = "Tour Leader";

    const errors = getPartnerBookingFieldErrors({
      draft,
      subtype: "travel_agency_transfer",
    });

    expect(errors.itineraryLink).toBeTruthy();
  });

  it("requires coordinates before a booking can proceed", () => {
    expect(
      evaluateAddressSubmitGate({
        pickup: { address: "A" },
        dropoff: { address: "B" },
        serviceability: null,
      }),
    ).toEqual({
      blocking: true,
      code: "coordinates_required",
    });
  });

  it("keeps manual-review routes explicit without blocking the record step", () => {
    expect(
      evaluateAddressSubmitGate({
        pickup: { address: "A", lat: 25, lng: 121 },
        dropoff: { address: "B", lat: 25.05, lng: 121.05 },
        serviceability: {
          decision: "manual_review",
          evaluatedAt: "2026-07-03T00:00:00.000Z",
          geometryVersionRefs: [],
          reasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
          reasonMessages: [],
          serviceAreaCodes: ["mock-core"],
          serviceProductType: "credit_card_airport_transfer",
          stops: [],
        },
      }),
    ).toEqual({
      blocking: false,
      code: "dispatch_manual_review_required",
    });
  });

  it("keeps provider outages in explicit manual review instead of normal ready", () => {
    expect(
      evaluateAddressSubmitGate({
        pickup: { address: "A", lat: 25, lng: 121 },
        dropoff: { address: "B", lat: 25.05, lng: 121.05 },
        serviceability: null,
        providerState: {
          available: false,
          degraded: true,
          reasonCode: "request_failed",
        },
      }),
    ).toEqual({
      blocking: false,
      code: "dispatch_manual_review_required",
    });
  });

  it("allows text-only address fallback when the provider is unavailable", () => {
    const draft = createDefaultPartnerBookingDraft();
    draft.pickupAddress = "台北市信義區松仁路 100 號";
    draft.dropoffAddress = "桃園機場第二航廈";

    expect(
      getPartnerMapSubmitGate({
        draft,
        pickup: null,
        dropoff: null,
        serviceability: null,
        providerState: {
          available: false,
          degraded: true,
          reasonCode: "request_failed",
        },
      }),
    ).toEqual({
      blocking: false,
      code: "dispatch_manual_review_required",
    });
  });
});
