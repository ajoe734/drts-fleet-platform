import { describe, expect, it } from "vitest";
import type {
  AddressPayload,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";
import type { AddressProviderState } from "@drts/ui-web";
import {
  buildConciergeOrderAddress,
  getConciergeMapBookingBannerCode,
  getConciergeMapBookingGate,
  hasConciergeCoordinateProvenance,
  isConciergeProviderOutage,
} from "../../lib/map-booking";

const readyPickup: AddressPayload = {
  address: "1F, No. 1, Shifu Rd., Xinyi Dist., Taipei City",
  lat: 25.036,
  lng: 121.565,
  coordinateSource: "provider_candidate",
};

const readyDropoff: AddressPayload = {
  address: "No. 12, Sec. 4, Ren'ai Rd., Da'an Dist., Taipei City",
  lat: 25.038,
  lng: 121.548,
  coordinateSource: "manual_pin",
  pinnedByActorId: "concierge-operator",
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
  reasonCode: "provider_unhealthy",
};

describe("concierge map booking gate", () => {
  it("blocks when the pickup has no coordinates", () => {
    const gate = getConciergeMapBookingGate({
      pickup: { address: "text only" },
      dropoff: readyDropoff,
      serviceability: null,
      previewStatus: "idle",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: false,
      reason: "pickup_coordinates_required",
    });
  });

  it("blocks when the dropoff has no coordinates", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: { address: "text only" },
      serviceability: null,
      previewStatus: "idle",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: false,
      reason: "dropoff_coordinates_required",
    });
  });

  it("blocks when coordinates lack provenance", () => {
    const gate = getConciergeMapBookingGate({
      pickup: coordsWithoutProvenance,
      dropoff: readyDropoff,
      serviceability: null,
      previewStatus: "idle",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: false,
      reason: "pickup_provenance_required",
    });
  });

  it("requires a serviceability preview before dispatch", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: null,
      previewStatus: "evaluating",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: false,
      reason: "serviceability_preview_required",
    });
  });

  it("blocks a not-serviceable pair", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: evaluation("not_serviceable"),
      previewStatus: "ready",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: false,
      reason: "serviceability_blocked",
    });
  });

  it("dispatches a confirmed, serviceable pair", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: evaluation("serviceable"),
      previewStatus: "ready",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: true,
      outcome: { kind: "dispatch", decision: "serviceable" },
    });
  });

  it("dispatches a manual-review decision (still routed, not blocked)", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: evaluation("manual_review"),
      previewStatus: "ready",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: true,
      outcome: { kind: "dispatch", decision: "manual_review" },
    });
  });

  it("routes a provider outage with no coordinates to manual review, not a silent order", () => {
    const gate = getConciergeMapBookingGate({
      pickup: { address: "typed pickup" },
      dropoff: { address: "typed dropoff" },
      serviceability: null,
      previewStatus: "idle",
      providerOutage: true,
    });
    expect(gate).toEqual({
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    });
  });

  it("still dispatches a confirmed pair even if the provider later reports an outage", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: evaluation("serviceable"),
      previewStatus: "ready",
      providerOutage: true,
    });
    expect(gate).toEqual({
      canSubmit: true,
      outcome: { kind: "dispatch", decision: "serviceable" },
    });
  });

  it("blocks a preview error while the provider is healthy (backend gate error, not a silent submit)", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: null,
      previewStatus: "error",
      providerOutage: false,
    });
    expect(gate).toEqual({
      canSubmit: false,
      reason: "serviceability_preview_unavailable",
    });
  });

  it("degrades a preview error to manual review only during a genuine provider outage", () => {
    const gate = getConciergeMapBookingGate({
      pickup: readyPickup,
      dropoff: readyDropoff,
      serviceability: null,
      previewStatus: "error",
      providerOutage: true,
    });
    expect(gate).toEqual({
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    });
  });
});

describe("concierge provider outage detection", () => {
  it("flags an outage when any leg is unavailable", () => {
    expect(isConciergeProviderOutage(available, unavailable)).toBe(true);
    expect(isConciergeProviderOutage(unavailable, available)).toBe(true);
  });

  it("stays healthy when both legs are available", () => {
    expect(isConciergeProviderOutage(available, available)).toBe(false);
    expect(isConciergeProviderOutage(null, undefined)).toBe(false);
  });
});

describe("concierge banner code", () => {
  it("maps outcomes and reasons to stable codes", () => {
    expect(
      getConciergeMapBookingBannerCode({
        canSubmit: true,
        outcome: { kind: "provider_outage_manual_review" },
      }),
    ).toBe("provider_outage_manual_review");
    expect(
      getConciergeMapBookingBannerCode({
        canSubmit: true,
        outcome: { kind: "dispatch", decision: "manual_review" },
      }),
    ).toBe("manual_review");
    expect(
      getConciergeMapBookingBannerCode({
        canSubmit: true,
        outcome: { kind: "dispatch", decision: "serviceable" },
      }),
    ).toBe("serviceable");
    expect(
      getConciergeMapBookingBannerCode({
        canSubmit: false,
        reason: "serviceability_blocked",
      }),
    ).toBe("serviceability_blocked");
    expect(
      getConciergeMapBookingBannerCode({
        canSubmit: false,
        reason: "serviceability_preview_unavailable",
      }),
    ).toBe("serviceability_preview_unavailable");
  });
});

describe("concierge order address builder", () => {
  it("submits confirmed coordinates when a pin is present", () => {
    const payload = buildConciergeOrderAddress(readyPickup, "fallback text");
    expect(payload.lat).toBe(readyPickup.lat);
    expect(payload.lng).toBe(readyPickup.lng);
    expect(payload.coordinateSource).toBe("provider_candidate");
  });

  it("submits a coordinate-less text address when no pin is confirmed", () => {
    const payload = buildConciergeOrderAddress(null, "  123 Main St  ");
    expect(payload).toEqual({ address: "123 Main St" });
    expect(payload.lat).toBeUndefined();
    expect(payload.coordinateSource).toBeUndefined();
  });

  it("keeps text-only fallback when a pin has no coordinates", () => {
    const payload = buildConciergeOrderAddress(
      { address: "pin without coords" },
      "typed address",
    );
    expect(payload).toEqual({ address: "typed address" });
  });
});

describe("concierge coordinate provenance", () => {
  it("accepts a coordinate source as provenance", () => {
    expect(hasConciergeCoordinateProvenance(readyPickup)).toBe(true);
  });

  it("rejects coordinates without any provenance", () => {
    expect(hasConciergeCoordinateProvenance(coordsWithoutProvenance)).toBe(
      false,
    );
  });
});
