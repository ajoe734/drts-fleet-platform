import { describe, expect, it } from "vitest";
import type { PartnerChannelEntryRecord } from "@drts/contracts";
import {
  createDefaultPartnerBookingDraft,
  getPartnerBookingFieldErrors,
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

  it("renders program-neutral during an authority outage: no program-specific field is required regardless of subtype", () => {
    const draft = createDefaultPartnerBookingDraft();

    // Insurance tenant, but the authority is down so the program is unknown: the
    // reference funnel must not impose (or mislabel-skip) claim/policy gating.
    const insuranceErrors = getPartnerBookingFieldErrors({
      draft,
      subtype: "insurance_replacement_vehicle",
      referenceFallback: true,
    });
    expect(insuranceErrors.claimNumber).toBeUndefined();
    expect(insuranceErrors.policyNumber).toBeUndefined();
    expect(insuranceErrors.replacementVehicleClass).toBeUndefined();

    // Travel tenant, same outage: no roster/group gating either.
    const travelErrors = getPartnerBookingFieldErrors({
      draft,
      subtype: "travel_agency_transfer",
      referenceFallback: true,
    });
    expect(travelErrors.groupCode).toBeUndefined();
    expect(travelErrors.rosterPassengers).toBeUndefined();

    // Universal fields are still validated in reference mode.
    expect(insuranceErrors.pickupAddress).toBeTruthy();
    expect(insuranceErrors.passengerName).toBeTruthy();
  });

  it("keeps the program gate neutral (ready) during an authority outage instead of applying eligibility gating for a program it cannot verify", () => {
    const draft = createDefaultPartnerBookingDraft();
    const gate = getPartnerProgramGate({
      // Airport transfer normally blocks until an eligibility id is present…
      entry: makeEntry({ eligibilityMode: "bank_card_inline" }),
      draft,
      eligibilityVerificationId: null,
      referenceFallback: true,
    });

    // …but the outage funnel cannot verify the program, so the program gate is
    // neutral; the map/coordinate gate is what enforces submit-safety.
    expect(gate.state).toBe("ready");
    expect(gate.actionHref).toBeNull();
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
});
