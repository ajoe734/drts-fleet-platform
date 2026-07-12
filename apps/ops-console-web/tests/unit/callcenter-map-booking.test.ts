import type {
  AddressPayload,
  GeoCoordinateProvenance,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";
import { describe, expect, it } from "vitest";
import {
  buildCallcenterMapOrderCommand,
  getCallcenterMapBookingGate,
  hasCallcenterAddressCoordinates,
  hasCallcenterCoordinateProvenance,
} from "../../app/callcenter/map-booking";

const providerPickup: AddressPayload = {
  address: "桃園機場 第一航廈 入境大廳",
  lat: 25.081998,
  lng: 121.237982,
  coordinateSource: "provider_candidate",
  geocodeProvider: "mock-geo",
  geocodeConfidence: "exact",
  providerCandidateId: "mock-place-tpe-t1",
  pinnedByActorId: "agent-001",
  pinnedAt: "2026-06-30T16:00:00.000Z",
};

const manualDropoff: AddressPayload = {
  address: "台北市信義區松仁路 100 號",
  lat: 25.033879,
  lng: 121.568743,
  coordinateSource: "manual_pin",
  geocodeConfidence: "manual",
  manualOverrideReason: "caller confirmed building entrance",
  pinnedByActorId: "agent-001",
  pinnedAt: "2026-06-30T16:01:00.000Z",
};

const nestedProviderPickup: AddressPayload = {
  address: "台北市政府",
  lat: 25.037519,
  lng: 121.56368,
  coordinateProvenance: {
    coordinateSource: "provider_candidate",
    geocodeProvider: "mock-geo",
    geocodeConfidence: "exact",
    providerCandidateId: "mock-place-city-hall",
    placeId: "mock-city-hall",
    coordinateAccuracyM: 8,
    selectedByActorId: "agent-001",
    selectedAt: "2026-06-30T16:00:00.000Z",
    pinnedByActorId: "agent-001",
    pinnedAt: "2026-06-30T16:00:10.000Z",
    surface: "callcenter",
  },
};

function serviceability(
  decision: ServiceAreaEvaluationResult["decision"],
): ServiceAreaEvaluationResult {
  return {
    decision,
    serviceProductType: "taxi_realtime",
    evaluatedAt: "2026-06-30T16:02:00.000Z",
    stops: [],
    serviceAreaCodes: decision === "not_serviceable" ? [] : ["TPE"],
    geometryVersionRefs: ["boundary:TPE:v3"],
    reasonCodes: decision === "not_serviceable" ? ["OUT_OF_SERVICE_AREA"] : [],
    reasonMessages:
      decision === "not_serviceable" ? ["Pickup is outside service area."] : [],
  };
}

describe("callcenter map booking gate", () => {
  it("detects coordinate and provenance readiness", () => {
    expect(hasCallcenterAddressCoordinates(providerPickup)).toBe(true);
    expect(hasCallcenterCoordinateProvenance(providerPickup)).toBe(true);
    expect(hasCallcenterCoordinateProvenance(nestedProviderPickup)).toBe(true);
    expect(
      hasCallcenterCoordinateProvenance({
        address: "coordinates with empty nested provenance",
        lat: 25,
        lng: 121,
        coordinateProvenance: {} as GeoCoordinateProvenance,
      }),
    ).toBe(false);
    expect(
      hasCallcenterAddressCoordinates({
        address: "text only",
      }),
    ).toBe(false);
    expect(
      hasCallcenterCoordinateProvenance({
        address: "coordinates without provenance",
        lat: 25,
        lng: 121,
      }),
    ).toBe(false);
  });

  it("blocks coordinate-less phone bookings before they become dispatchable", () => {
    expect(
      getCallcenterMapBookingGate({
        pickup: { address: "text only pickup" },
        dropoff: manualDropoff,
        serviceability: serviceability("serviceable"),
        previewStatus: "ready",
      }),
    ).toEqual({
      canSubmit: false,
      reason: "pickup_coordinates_required",
    });

    expect(
      getCallcenterMapBookingGate({
        pickup: providerPickup,
        dropoff: { address: "text only dropoff" },
        serviceability: serviceability("serviceable"),
        previewStatus: "ready",
      }),
    ).toEqual({
      canSubmit: false,
      reason: "dropoff_coordinates_required",
    });
  });

  it("requires service-area preview and blocks not-serviceable decisions", () => {
    expect(
      getCallcenterMapBookingGate({
        pickup: providerPickup,
        dropoff: manualDropoff,
        serviceability: null,
        previewStatus: "idle",
      }),
    ).toEqual({
      canSubmit: false,
      reason: "serviceability_preview_required",
    });

    expect(
      getCallcenterMapBookingGate({
        pickup: providerPickup,
        dropoff: manualDropoff,
        serviceability: serviceability("not_serviceable"),
        previewStatus: "ready",
      }),
    ).toEqual({
      canSubmit: false,
      reason: "serviceability_blocked",
    });
  });

  it("allows manual-review bookings while keeping the decision visible", () => {
    expect(
      getCallcenterMapBookingGate({
        pickup: providerPickup,
        dropoff: manualDropoff,
        serviceability: serviceability("manual_review"),
        previewStatus: "ready",
      }),
    ).toEqual({
      canSubmit: true,
      decision: "manual_review",
    });
  });

  it("builds CreateCallCenterOrderCommand with coordinate payloads", () => {
    expect(
      buildCallcenterMapOrderCommand({
        callId: "CALL-001",
        agentId: "agent-001",
        recordingId: null,
        pickup: providerPickup,
        dropoff: manualDropoff,
        passengerName: " 王小姐 ",
        passengerPhone: "",
        fallbackPassengerPhone: "0912-555-401",
        notes: " gate 3 ",
      }),
    ).toMatchObject({
      callId: "CALL-001",
      agentId: "agent-001",
      pickup: providerPickup,
      dropoff: manualDropoff,
      passenger: {
        name: "王小姐",
        phone: "0912-555-401",
      },
      notes: "gate 3",
    });
  });
});
