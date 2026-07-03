import { describe, expect, it } from "vitest";
import type { AddressPayload } from "@drts/contracts";
import type {
  AddressProviderState,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
} from "@drts/ui-web";
import {
  getPartnerMapBookingBannerCode,
  getPartnerMapBookingGate,
  hasPartnerCoordinateProvenance,
  isPartnerProviderOutage,
} from "@/lib/partner-map-booking";

const readyPickup: AddressPayload = {
  address: "Terminal 1, Taoyuan International Airport",
  lat: 25.077,
  lng: 121.232,
  coordinateSource: "provider_candidate",
};

const readyDropoff: AddressPayload = {
  address: "No. 12, Sec. 4, Ren'ai Rd., Da'an Dist., Taipei City",
  lat: 25.038,
  lng: 121.548,
  coordinateSource: "manual_pin",
  pinnedByActorId: "partner-agent",
  pinnedAt: "2026-07-03T00:00:00.000Z",
};

const coordsWithoutProvenance: AddressPayload = {
  address: "Somewhere",
  lat: 25.04,
  lng: 121.55,
};

function evaluation(
  decision: ServiceAreaEvaluationDecision,
): ServiceAreaEvaluationResult {
  return {
    decision,
    serviceProductType: "taxi_realtime",
    evaluatedAt: "2026-07-03T00:00:00.000Z",
    stops: [],
    serviceAreaCodes: [],
    geometryVersionRefs: [],
    reasonCodes: [],
    reasonMessages: [],
  };
}

const available: AddressProviderState = {
  available: true,
  degraded: false,
  reasonCode: "available",
};
const unavailable: AddressProviderState = {
  available: false,
  degraded: true,
  reasonCode: "provider_disabled",
};

describe("partner map booking gate", () => {
  it("requires pickup coordinates before dispatch", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: { address: "typed" },
        dropoff: readyDropoff,
        serviceability: null,
        previewStatus: "idle",
        providerOutage: false,
      }),
    ).toEqual({ canSubmit: false, reason: "pickup_coordinates_required" });
  });

  it("requires provenance on the coordinates", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: coordsWithoutProvenance,
        dropoff: readyDropoff,
        serviceability: null,
        previewStatus: "idle",
        providerOutage: false,
      }),
    ).toEqual({ canSubmit: false, reason: "pickup_provenance_required" });
  });

  it("waits for the serviceability preview", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: readyPickup,
        dropoff: readyDropoff,
        serviceability: null,
        previewStatus: "evaluating",
        providerOutage: false,
      }),
    ).toEqual({ canSubmit: false, reason: "serviceability_preview_required" });
  });

  it("blocks a not-serviceable pair", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: readyPickup,
        dropoff: readyDropoff,
        serviceability: evaluation("not_serviceable"),
        previewStatus: "ready",
        providerOutage: false,
      }),
    ).toEqual({ canSubmit: false, reason: "serviceability_blocked" });
  });

  it("dispatches a confirmed, serviceable pair", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: readyPickup,
        dropoff: readyDropoff,
        serviceability: evaluation("serviceable"),
        previewStatus: "ready",
        providerOutage: false,
      }),
    ).toEqual({
      canSubmit: true,
      outcome: { kind: "dispatch", decision: "serviceable" },
    });
  });

  it("routes a provider outage with no coordinates to manual review, not a silent order", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: { address: "typed pickup" },
        dropoff: { address: "typed dropoff" },
        serviceability: null,
        previewStatus: "idle",
        providerOutage: true,
      }),
    ).toEqual({
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    });
  });

  it("treats a preview error as a degraded manual-review path", () => {
    expect(
      getPartnerMapBookingGate({
        pickup: readyPickup,
        dropoff: readyDropoff,
        serviceability: null,
        previewStatus: "error",
        providerOutage: false,
      }),
    ).toEqual({
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    });
  });
});

describe("partner provider outage + banner codes", () => {
  it("flags an outage when any leg is unavailable", () => {
    expect(isPartnerProviderOutage(available, unavailable)).toBe(true);
    expect(isPartnerProviderOutage(available, available)).toBe(false);
  });

  it("maps gate outcomes to stable, concierge-consistent banner codes", () => {
    expect(
      getPartnerMapBookingBannerCode({
        canSubmit: true,
        outcome: { kind: "provider_outage_manual_review" },
      }),
    ).toBe("provider_outage_manual_review");
    expect(
      getPartnerMapBookingBannerCode({
        canSubmit: true,
        outcome: { kind: "dispatch", decision: "manual_review" },
      }),
    ).toBe("manual_review");
    expect(
      getPartnerMapBookingBannerCode({
        canSubmit: false,
        reason: "serviceability_blocked",
      }),
    ).toBe("serviceability_blocked");
  });

  it("accepts a coordinate source as provenance", () => {
    expect(hasPartnerCoordinateProvenance(readyPickup)).toBe(true);
    expect(hasPartnerCoordinateProvenance(coordsWithoutProvenance)).toBe(false);
  });
});
