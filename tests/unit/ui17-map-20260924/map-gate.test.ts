import { describe, it, expect } from "vitest";
import { evaluateAddressSubmitGate } from "../../../packages/ui-web/src/address-map-app-support";
import type {
  AddressPayload,
  ServiceAreaEvaluationResult,
} from "../../../packages/ui-web/src/address-map-picker-core";

const mockServiceability = (decision: "serviceable" | "manual_review" | "not_serviceable"): ServiceAreaEvaluationResult => ({
  decision,
  serviceProductType: "standard",
  evaluatedAt: "2026-09-24T00:00:00Z",
  stops: [],
  serviceAreaCodes: ["TAIPEI_METRO"],
  geometryVersionRefs: ["v1"],
  reasonCodes: [],
  reasonMessages: []
});

const mockAddress = (lat: number, lng: number, source: AddressPayload["coordinateSource"] = "provider_candidate", reason?: string): AddressPayload => ({
  address: source === "manual_pin" ? "manual" : "normal",
  lat,
  lng,
  coordinateSource: source,
  manualOverrideReason: reason || null,
});

describe("evaluateAddressSubmitGate regressions (UI17-MAP-20260924)", () => {
  it("allows valid manual coordinates with healthy provider", () => {
    const res = evaluateAddressSubmitGate({
      pickup: mockAddress(25, 121, "manual_pin", "reason"),
      dropoff: mockAddress(25.1, 121.1),
      serviceability: mockServiceability("serviceable"),
      providerState: { available: true, degraded: false, reasonCode: "available" }
    });
    expect(res.blocking).toBe(false);
    expect(res.code).toBe("ready");
  });

  it("blocks missing coordinates", () => {
    const res = evaluateAddressSubmitGate({
      pickup: mockAddress(25, 121),
      dropoff: null,
      serviceability: mockServiceability("serviceable"),
      providerState: { available: true, degraded: false, reasonCode: "available" }
    });
    expect(res.blocking).toBe(true);
    expect(res.code).toBe("coordinates_required");
  });
  
  it("requires manual review when provider is down", () => {
    const res = evaluateAddressSubmitGate({
      pickup: mockAddress(25, 121),
      dropoff: mockAddress(25.1, 121.1),
      serviceability: mockServiceability("serviceable"),
      providerState: { available: false, degraded: true, reasonCode: "provider_unhealthy" }
    });
    expect(res.blocking).toBe(false);
    expect(res.code).toBe("dispatch_manual_review_required");
  });
  
  it("blocks when out of area", () => {
    const res = evaluateAddressSubmitGate({
      pickup: mockAddress(25, 121),
      dropoff: mockAddress(25.1, 121.1),
      serviceability: mockServiceability("not_serviceable"),
      providerState: { available: true, degraded: false, reasonCode: "available" }
    });
    expect(res.blocking).toBe(true);
    expect(res.code).toBe("outside_service_area");
  });

  it("blocks when out of area even if provider is down (outside-before-outage)", () => {
    const res = evaluateAddressSubmitGate({
      pickup: mockAddress(25, 121),
      dropoff: mockAddress(25.1, 121.1),
      serviceability: mockServiceability("not_serviceable"),
      providerState: { available: false, degraded: true, reasonCode: "provider_unhealthy" }
    });
    expect(res.blocking).toBe(true);
    expect(res.code).toBe("outside_service_area");
  });

  it("requires manual review when serviceability is manual_review", () => {
    const res = evaluateAddressSubmitGate({
      pickup: mockAddress(25, 121),
      dropoff: mockAddress(25.1, 121.1),
      serviceability: mockServiceability("manual_review"),
      providerState: { available: true, degraded: false, reasonCode: "available" }
    });
    expect(res.blocking).toBe(false);
    expect(res.code).toBe("dispatch_manual_review_required");
  });
});

