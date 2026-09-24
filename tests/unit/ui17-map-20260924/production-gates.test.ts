import { describe, it, expect } from "vitest";
import { getPartnerMapSubmitGate } from "../../../apps/partner-booking-web/lib/partner-booking-form";
import { buildCallCenterMapFallbackReview } from "../../../apps/concierge-portal-web/lib/map-booking";
import type { AddressSubmitGateState } from "../../../packages/ui-web/src/address-map-app-support";
import type { ServiceAreaEvaluationResult, AddressProviderState } from "../../../packages/ui-web/src/address-map-picker-core";

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



describe("Production Gates & Payloads", () => {
  describe("getPartnerMapSubmitGate", () => {
    it("handles text address fallback when provider is down and coordinates are missing", () => {
      const result = getPartnerMapSubmitGate({
        draft: { pickupAddress: "Some Address", dropoffAddress: "Another Address" },
        pickup: null,
        dropoff: null,
        serviceability: mockServiceability("serviceable"),
        providerState: { available: false, degraded: true, reasonCode: "request_failed" }
      });
      expect(result.blocking).toBe(false);
      expect(result.code).toBe("dispatch_manual_review_required");
    });

    it("blocks when text addresses are whitespace only", () => {
      const result = getPartnerMapSubmitGate({
        draft: { pickupAddress: "   ", dropoffAddress: "  " },
        pickup: null,
        dropoff: null,
        serviceability: mockServiceability("serviceable"),
        providerState: { available: false, degraded: true, reasonCode: "request_failed" }
      });
      expect(result.blocking).toBe(true);
      expect(result.code).toBe("coordinates_required");
    });

    it("requires coordinates when provider is available", () => {
      const result = getPartnerMapSubmitGate({
        draft: { pickupAddress: "Valid Address", dropoffAddress: "Valid Address" },
        pickup: null,
        dropoff: null,
        serviceability: mockServiceability("serviceable"),
        providerState: { available: true, degraded: false, reasonCode: "available" }
      });
      expect(result.blocking).toBe(true);
      expect(result.code).toBe("coordinates_required");
    });
  });

  describe("buildCallCenterMapFallbackReview", () => {
    it("includes metadata when provider is down and manual review is required", () => {
      const mapGate: AddressSubmitGateState = {
        blocking: false,
        code: "dispatch_manual_review_required"
      };
      const providerState: AddressProviderState = {
        available: false,
        degraded: true,
        reasonCode: "request_failed"
      };
      
      const payload = buildCallCenterMapFallbackReview({ mapGate, providerState });
      
      expect(payload).toEqual({
        reasonCode: "map_provider_unavailable",
        providerAvailable: false,
        providerDegraded: true,
        providerReasonCode: "request_failed"
      });
    });

    it("returns null when provider is healthy", () => {
      const mapGate: AddressSubmitGateState = {
        blocking: false,
        code: "dispatch_manual_review_required" // It might be required for other reasons (e.g., manual pin)
      };
      const providerState: AddressProviderState = {
        available: true,
        degraded: false,
        reasonCode: "available"
      };
      
      const payload = buildCallCenterMapFallbackReview({ mapGate, providerState });
      
      expect(payload).toBeNull();
    });

    it("returns null when mapGate code is not manual review", () => {
      const mapGate: AddressSubmitGateState = {
        blocking: false,
        code: "ready"
      };
      const providerState: AddressProviderState = {
        available: false,
        degraded: true,
        reasonCode: "request_failed"
      };
      
      const payload = buildCallCenterMapFallbackReview({ mapGate, providerState });
      
      expect(payload).toBeNull();
    });
  });
});
