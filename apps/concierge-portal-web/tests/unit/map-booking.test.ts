import { describe, expect, it } from "vitest";
import {
  buildConciergeManualPinAddress,
  getConciergeMapBookingGate,
  hasConciergeCoordinatePair,
  parseConciergeMapProviderState,
  parseConciergeCoordinate,
} from "../../lib/map-booking";

const SELECTED_AT = "2026-07-01T09:15:00.000Z";

describe("concierge map booking helpers", () => {
  it("validates coordinate pairs with latitude and longitude bounds", () => {
    expect(parseConciergeCoordinate("25.037519", { min: -90, max: 90 })).toBe(
      25.037519,
    );
    expect(parseConciergeCoordinate("121.56368", { min: -180, max: 180 })).toBe(
      121.56368,
    );
    expect(parseConciergeCoordinate("91", { min: -90, max: 90 })).toBeNull();
    expect(parseConciergeCoordinate("181", { min: -180, max: 180 })).toBeNull();
    expect(hasConciergeCoordinatePair("25.037519", "121.56368")).toBe(true);
    expect(hasConciergeCoordinatePair("", "121.56368")).toBe(false);
  });

  it("blocks concierge booking until pickup and dropoff coordinates are present", () => {
    expect(
      getConciergeMapBookingGate({
        pickupLat: "",
        pickupLng: "121.56368",
        dropoffLat: "25.033879",
        dropoffLng: "121.568743",
      }),
    ).toEqual({
      canSubmit: false,
      reason: "pickup_coordinates_required",
    });
    expect(
      getConciergeMapBookingGate({
        pickupLat: "25.037519",
        pickupLng: "121.56368",
        dropoffLat: "25.033879",
        dropoffLng: "",
      }),
    ).toEqual({
      canSubmit: false,
      reason: "dropoff_coordinates_required",
    });
    expect(
      getConciergeMapBookingGate({
        pickupLat: "25.037519",
        pickupLng: "121.56368",
        dropoffLat: "25.033879",
        dropoffLng: "121.568743",
      }),
    ).toEqual({ canSubmit: true, decision: "coordinates_ready" });
  });

  it("parses the concierge map provider outage state fail-closed", () => {
    expect(parseConciergeMapProviderState("provider_unavailable")).toBe(
      "provider_unavailable",
    );
    expect(parseConciergeMapProviderState("manual_fallback")).toBe(
      "manual_fallback",
    );
    expect(parseConciergeMapProviderState("live_provider")).toBe(
      "manual_fallback",
    );
    expect(parseConciergeMapProviderState(null)).toBe("manual_fallback");
  });

  it("builds manual-pin provenance for concierge assisted-entry payloads", () => {
    const payload = buildConciergeManualPinAddress({
      address: " Taipei City Hall curb ",
      lat: "25.037519",
      lng: "121.56368",
      actorId: "CP-OPS-001",
      selectedAt: SELECTED_AT,
      manualOverrideReason: "caller confirmed lobby curb",
    });

    expect(payload).toMatchObject({
      address: "Taipei City Hall curb",
      lat: 25.037519,
      lng: 121.56368,
      coordinateSource: "manual_pin",
      geocodeConfidence: "manual",
      selectedByActorId: "CP-OPS-001",
      pinnedByActorId: "CP-OPS-001",
      surface: "concierge_portal",
      manualOverrideReason: "caller confirmed lobby curb",
      coordinateProvenance: {
        coordinateSource: "manual_pin",
        geocodeConfidence: "manual",
        selectedByActorId: "CP-OPS-001",
        pinnedByActorId: "CP-OPS-001",
        surface: "concierge_portal",
        manualOverrideReason: "caller confirmed lobby curb",
      },
    });
  });

  it("keeps invalid coordinate payloads text-only so the gate can reject them", () => {
    const payload = buildConciergeManualPinAddress({
      address: "Text only pickup",
      lat: "not-a-lat",
      lng: "121.56368",
      actorId: "CP-OPS-001",
      selectedAt: SELECTED_AT,
    });

    expect(payload).toEqual({
      address: "Text only pickup",
    });
  });
});
