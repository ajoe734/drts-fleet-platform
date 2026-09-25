import { describe, test, expect } from "vitest";
import { evaluateAddressSubmitGate } from "../../../packages/ui-web/src/address-map-app-support";

describe("UI17-MAP-20260924 gate behavior regressions", () => {
  const validAddress = {
    address: "Taipei 101",
    coordinateSource: "provider_candidate" as const,
    lat: 25.033,
    lng: 121.5654,
  };
  const invalidAddress = {
    address: "No Pin",
    coordinateSource: "provider_candidate" as const,
  };

  test("tenant outage request prevention logic / provider_down with pins", () => {
    // When provider is down but we HAVE valid pins (like Concierge explicitly allows)
    // evaluateAddressSubmitGate itself should return dispatch_manual_review_required
    const gate = evaluateAddressSubmitGate({
      pickup: validAddress,
      dropoff: validAddress,
      serviceability: { decision: "serviceable", reasonCodes: ["ok"] } as any,
      providerState: {
        available: false,
        degraded: true,
        reasonCode: "provider_unhealthy",
      },
    });
    expect(gate.blocking).toBe(false);
    expect(gate.code).toBe("dispatch_manual_review_required");
  });

  test("provider down with missing pins blocks on coordinates_required first", () => {
    // When provider is down and we DONT have pins, it blocks immediately
    const gate = evaluateAddressSubmitGate({
      pickup: invalidAddress as any,
      dropoff: validAddress,
      serviceability: { decision: "serviceable", reasonCodes: ["ok"] } as any,
      providerState: {
        available: false,
        degraded: true,
        reasonCode: "provider_unhealthy",
      },
    });
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe("coordinates_required");
  });

  test("invalid manual pins or missing reason (coordinates_required)", () => {
    // Missing lat/lng
    const gate = evaluateAddressSubmitGate({
      pickup: {
        address: "Manual Point",
        coordinateSource: "manual_pin",
        lat: NaN,
        lng: 121.5,
      },
      dropoff: validAddress,
      serviceability: { decision: "serviceable", reasonCodes: ["ok"] } as any,
    });
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe("coordinates_required");
  });

  test("outside service area takes precedence over provider outage", () => {
    const gate = evaluateAddressSubmitGate({
      pickup: validAddress,
      dropoff: validAddress,
      serviceability: {
        decision: "not_serviceable",
        reasonCodes: ["out_of_area"],
      } as any,
      providerState: {
        available: false,
        degraded: true,
        reasonCode: "provider_unhealthy",
      },
    });
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe("outside_service_area");
  });

  test("healthy manual pins are fully ready if serviceable", () => {
    const gate = evaluateAddressSubmitGate({
      pickup: {
        ...validAddress,
        coordinateSource: "manual_pin",
      },
      dropoff: validAddress,
      serviceability: { decision: "serviceable", reasonCodes: ["ok"] } as any,
      providerState: {
        available: true,
        degraded: false,
        reasonCode: "available",
      },
    });
    expect(gate.blocking).toBe(false);
    expect(gate.code).toBe("ready");
  });
});

import { evaluateTenantSubmitGate } from "../../../apps/tenant-console-web/lib/tenant-address-map";
import { evaluateManualApply } from "../../../packages/ui-web/src/address-map-picker-core";
import { buildCallCenterMapFallbackReview } from "../../../apps/concierge-portal-web/lib/map-booking";

describe("R7b/R7c real component/handler regressions", () => {
  const validAddress = {
    address: "Taipei 101",
    coordinateSource: "provider_candidate" as const,
    lat: 25.033,
    lng: 121.5654,
  };

  test("evaluateTenantSubmitGate: blocks on provider outage regardless of pins", () => {
    const gate = evaluateTenantSubmitGate(
      validAddress as any,
      validAddress as any,
      { decision: "serviceable", reasonCodes: ["ok"] } as any,
      { available: false, degraded: true, reasonCode: "provider_unhealthy" },
    );
    expect(gate.blocking).toBe(true);
    expect(gate.code).toBe("provider_outage");
  });

  test("evaluateManualApply: rejects invalid lat/lng and blank reason", () => {
    const labels = {
      manualInvalid: "Invalid",
      manualReasonLabel: "Reason required",
      pinAdjustHint: "Pin adjusted",
    } as any;

    // Invalid lat
    expect(
      evaluateManualApply(
        "NaN",
        "121.5",
        "reason",
        true,
        labels,
        "",
        null,
        "A1",
        "tenant_console",
      ).error,
    ).toBe("Invalid");

    // Blank reason
    expect(
      evaluateManualApply(
        "25.0",
        "121.5",
        "   ",
        true,
        labels,
        "",
        null,
        "A1",
        "tenant_console",
      ).error,
    ).toBe("Reason required");

    // Valid
    const valid = evaluateManualApply(
      "25.0",
      "121.5",
      "   reason   ",
      true,
      labels,
      "Query",
      null,
      "A1",
      "tenant_console",
    );
    expect(valid.error).toBeUndefined();
    expect(valid.address?.manualOverrideReason).toBe("reason");
    expect(valid.reason).toBe("reason");
  });

  test("buildCallCenterMapFallbackReview: explicitly allows fallback on outage with pins, but blocks outside/missing", () => {
    // Normal fallback
    const fallback = buildCallCenterMapFallbackReview({
      mapGate: {
        blocking: false,
        code: "dispatch_manual_review_required",
        addressErrors: [],
        addressPairsReady: false,
      },
      providerState: {
        available: false,
        degraded: true,
        reasonCode: "provider_unhealthy",
      },
    });
    expect(fallback).not.toBeNull();
    expect(fallback?.providerDegraded).toBe(true);

    // Blocked by outside (which evaluates as blocking: true from submitGate)
    const blockedFallback = buildCallCenterMapFallbackReview({
      mapGate: {
        blocking: true,
        code: "outside_service_area",
        addressErrors: [],
        addressPairsReady: false,
      },
      providerState: {
        available: false,
        degraded: true,
        reasonCode: "provider_unhealthy",
      },
    });
    expect(blockedFallback).toBeNull(); // Because the gate is blocking, we don't proceed to fallback review
  });
});
