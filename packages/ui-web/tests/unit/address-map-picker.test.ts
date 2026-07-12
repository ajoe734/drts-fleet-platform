import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AddressMapPicker,
  AddressProviderUnavailableError,
  buildServiceAreaPreviewCommand,
  candidateToAddressPayload,
  createMockAddressProvider,
  derivePickerStatus,
  deriveProviderState,
  isDispatchReadyAddress,
  manualCoordinateToAddressPayload,
  serviceabilityTone,
  worstServiceDecision,
  type AddressPayload,
  type GeocodeCandidate,
} from "../../src/index";

const CANDIDATE: GeocodeCandidate = {
  candidateId: "c-1",
  provider: "mock-geo",
  providerCandidateId: "place-1",
  placeId: "place-1",
  displayName: "Taipei 101",
  address: "No. 7, Section 5, Xinyi Road, Taipei",
  normalizedAddress: "No.7 Sec.5 Xinyi Rd, Taipei",
  location: { lat: 25.033964, lng: 121.564468 },
  confidence: "exact",
  accuracyM: 8,
};

describe("candidateToAddressPayload", () => {
  it("emits a contract payload with provider_candidate provenance", () => {
    const payload = candidateToAddressPayload(CANDIDATE, {
      surface: "callcenter",
      selectedByActorId: "agent-9",
    });

    expect(payload).not.toBeNull();
    expect(payload?.lat).toBe(25.033964);
    expect(payload?.lng).toBe(121.564468);
    expect(payload?.coordinateSource).toBe("provider_candidate");
    expect(payload?.geocodeConfidence).toBe("exact");
    expect(payload?.providerCandidateId).toBe("place-1");
    expect(payload?.coordinateProvenance?.coordinateSource).toBe(
      "provider_candidate",
    );
    expect(payload?.coordinateProvenance?.geocodeProvider).toBe("mock-geo");
    expect(payload?.coordinateProvenance?.surface).toBe("callcenter");
    expect(payload?.coordinateProvenance?.selectedByActorId).toBe("agent-9");
    expect(isDispatchReadyAddress(payload)).toBe(true);
  });

  it("returns null when the candidate has no coordinates", () => {
    const payload = candidateToAddressPayload(
      { ...CANDIDATE, location: null },
      { surface: "callcenter" },
    );
    expect(payload).toBeNull();
  });

  it("falls back to candidateId when providerCandidateId is absent", () => {
    const payload = candidateToAddressPayload(
      { ...CANDIDATE, providerCandidateId: null },
      { surface: "ops_console" },
    );
    expect(payload?.providerCandidateId).toBe("c-1");
  });
});

describe("manualCoordinateToAddressPayload", () => {
  it("emits manual_pin provenance with the override reason", () => {
    const payload = manualCoordinateToAddressPayload({
      lat: 25.05,
      lng: 121.53,
      addressText: "New development",
      surface: "callcenter",
      manualOverrideReason: "not yet mapped",
      pinnedByActorId: "agent-9",
    });

    expect(payload).not.toBeNull();
    expect(payload?.coordinateSource).toBe("manual_pin");
    expect(payload?.geocodeConfidence).toBe("manual");
    expect(payload?.manualOverrideReason).toBe("not yet mapped");
    expect(payload?.coordinateProvenance?.coordinateSource).toBe("manual_pin");
    expect(payload?.coordinateProvenance?.pinnedByActorId).toBe("agent-9");
    expect(isDispatchReadyAddress(payload)).toBe(true);
  });

  it("preserves provider lineage when nudging an existing provider candidate", () => {
    const selected = candidateToAddressPayload(CANDIDATE, {
      surface: "callcenter",
      selectedByActorId: "agent-9",
    });

    const payload = manualCoordinateToAddressPayload({
      lat: 25.0341,
      lng: 121.5649,
      addressText: "No. 7, Section 5, Xinyi Road, Taipei",
      addressName: "Taipei 101",
      surface: "callcenter",
      manualOverrideReason: "adjust pin to pickup curb",
      pinnedByActorId: "agent-11",
      baseAddress: selected,
    });

    expect(payload).not.toBeNull();
    expect(payload?.coordinateSource).toBe("manual_pin");
    expect(payload?.providerCandidateId).toBe("place-1");
    expect(payload?.placeId).toBe("place-1");
    expect(payload?.geocodeProvider).toBe("mock-geo");
    expect(payload?.selectedByActorId).toBe("agent-9");
    expect(payload?.geocodeConfidence).toBe("exact");
    expect(payload?.coordinateAccuracyM).toBeNull();
    expect(payload?.coordinateProvenance?.providerCandidateId).toBe("place-1");
    expect(payload?.coordinateProvenance?.placeId).toBe("place-1");
    expect(payload?.coordinateProvenance?.geocodeProvider).toBe("mock-geo");
    expect(payload?.coordinateProvenance?.selectedByActorId).toBe("agent-9");
    expect(payload?.coordinateProvenance?.coordinateAccuracyM).toBe(8);
    expect(payload?.coordinateProvenance?.pinnedByActorId).toBe("agent-11");
  });

  it("returns null for out-of-range coordinates", () => {
    expect(
      manualCoordinateToAddressPayload({
        lat: 999,
        lng: 121,
        addressText: "bad",
        surface: "callcenter",
        manualOverrideReason: "x",
      }),
    ).toBeNull();
  });
});

describe("buildServiceAreaPreviewCommand", () => {
  it("builds a pickup/dropoff evaluation command", () => {
    const command = buildServiceAreaPreviewCommand({
      serviceProductType: "taxi",
      pickup: { lat: 25.03, lng: 121.56 },
      dropoff: { lat: 25.05, lng: 121.52 },
    });
    expect(command).toEqual({
      serviceProductType: "taxi",
      pickup: { lat: 25.03, lng: 121.56 },
      dropoff: { lat: 25.05, lng: 121.52 },
    });
  });

  it("returns null when the pickup coordinate is invalid", () => {
    expect(
      buildServiceAreaPreviewCommand({
        serviceProductType: "taxi",
        pickup: { lat: Number.NaN, lng: 121.56 },
      }),
    ).toBeNull();
  });

  it("drops an invalid dropoff to null", () => {
    const command = buildServiceAreaPreviewCommand({
      serviceProductType: "taxi",
      pickup: { lat: 25.03, lng: 121.56 },
      dropoff: { lat: 999, lng: 0 },
    });
    expect(command?.dropoff).toBeNull();
  });
});

describe("deriveProviderState", () => {
  it("treats a disabled provider as unavailable", () => {
    const state = deriveProviderState({
      mode: "disabled",
      status: "unhealthy",
    });
    expect(state.available).toBe(false);
    expect(state.reasonCode).toBe("provider_disabled");
  });

  it("treats an unhealthy fail-closed provider as unavailable", () => {
    const state = deriveProviderState({
      mode: "external",
      status: "unhealthy",
      failClosed: true,
    });
    expect(state.available).toBe(false);
    expect(state.reasonCode).toBe("provider_unhealthy");
  });

  it("keeps a degraded provider available but flagged", () => {
    const state = deriveProviderState({ mode: "external", status: "degraded" });
    expect(state.available).toBe(true);
    expect(state.degraded).toBe(true);
  });

  it("reports a healthy provider as available", () => {
    const state = deriveProviderState({ mode: "mock", status: "healthy" });
    expect(state).toEqual({
      available: true,
      degraded: false,
      reasonCode: "available",
    });
  });

  it("assumes availability when no health snapshot exists", () => {
    expect(deriveProviderState(null).available).toBe(true);
  });
});

describe("derivePickerStatus", () => {
  const base = {
    providerAvailable: true,
    isSearching: false,
    manualMode: false,
    searchAttempted: false,
    candidateCount: 0,
    hasSelection: false,
  };

  it("surfaces provider outage over everything else", () => {
    expect(derivePickerStatus({ ...base, providerAvailable: false })).toBe(
      "provider_unavailable",
    );
  });

  it("stays in manual entry when manual mode is on without a selection", () => {
    expect(derivePickerStatus({ ...base, manualMode: true })).toBe(
      "manual_entry",
    );
  });

  it("reports selected once an address is pinned", () => {
    expect(derivePickerStatus({ ...base, hasSelection: true })).toBe(
      "selected",
    );
  });

  it("reports no_match when a search returned nothing", () => {
    expect(
      derivePickerStatus({ ...base, searchAttempted: true, candidateCount: 0 }),
    ).toBe("no_match");
  });

  it("reports candidates when a search returned rows", () => {
    expect(
      derivePickerStatus({ ...base, searchAttempted: true, candidateCount: 2 }),
    ).toBe("candidates");
  });
});

describe("serviceability helpers", () => {
  it("maps decisions to tones", () => {
    expect(serviceabilityTone("serviceable")).toBe("success");
    expect(serviceabilityTone("manual_review")).toBe("warn");
    expect(serviceabilityTone("not_serviceable")).toBe("danger");
  });

  it("takes the strictest decision across stops", () => {
    expect(worstServiceDecision("serviceable", "manual_review")).toBe(
      "manual_review",
    );
    expect(worstServiceDecision("manual_review", "not_serviceable")).toBe(
      "not_serviceable",
    );
  });
});

describe("createMockAddressProvider", () => {
  it("returns candidates for a matching query", async () => {
    const provider = createMockAddressProvider();
    const response = await provider.search({ q: "taipei 101" });
    expect(response.candidates.length).toBeGreaterThan(0);
    expect(response.candidates[0]?.displayName).toContain("Taipei 101");
    expect(response.provider).toBe("mock-geo");
  });

  it("returns no candidates for the no-match query", async () => {
    const provider = createMockAddressProvider();
    const response = await provider.search({ q: "nowhere" });
    expect(response.candidates).toHaveLength(0);
  });

  it("flags degraded search responses", async () => {
    const provider = createMockAddressProvider({ degraded: true });
    const response = await provider.search({ q: "taipei" });
    expect(response.degraded).toBe(true);
  });

  it("throws when configured unavailable", async () => {
    const provider = createMockAddressProvider({ unavailable: true });
    await expect(provider.search({ q: "taipei" })).rejects.toBeInstanceOf(
      AddressProviderUnavailableError,
    );
  });

  it("evaluates service area by the mock box", async () => {
    const provider = createMockAddressProvider();
    const serviceable = await provider.evaluateServiceArea?.({
      serviceProductType: "taxi",
      pickup: { lat: 25.05, lng: 121.53 },
    });
    expect(serviceable?.decision).toBe("serviceable");

    const outside = await provider.evaluateServiceArea?.({
      serviceProductType: "taxi",
      pickup: { lat: 10, lng: 100 },
    });
    expect(outside?.decision).toBe("not_serviceable");
  });
});

describe("AddressMapPicker static render", () => {
  it("renders the empty map and the manual fallback affordance", () => {
    const html = renderToStaticMarkup(
      createElement(AddressMapPicker, {
        provider: createMockAddressProvider(),
        surface: "callcenter",
      }),
    );
    expect(html).toContain("Search address");
    expect(html).toContain("Enter coordinates manually");
    expect(html).toContain("Select an address or drop a pin");
  });

  it("shows the provider outage state when health is unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(AddressMapPicker, {
        provider: createMockAddressProvider(),
        surface: "callcenter",
        providerHealth: {
          mode: "disabled",
          status: "unhealthy",
          failClosed: true,
        },
      }),
    );
    expect(html).toContain("Address lookup is unavailable");
  });

  it("renders provenance + coordinates for a controlled selection", () => {
    const value: AddressPayload = candidateToAddressPayload(CANDIDATE, {
      surface: "callcenter",
    }) as AddressPayload;
    const html = renderToStaticMarkup(
      createElement(AddressMapPicker, {
        provider: createMockAddressProvider(),
        surface: "callcenter",
        value,
        enableServiceabilityPreview: false,
      }),
    );
    expect(html).toContain("Match confidence");
    expect(html).toContain("Location source");
    expect(html).toContain("provider_candidate");
  });

  it("lets a product surface replace the CI grid with an interactive map", () => {
    const value = candidateToAddressPayload(CANDIDATE, {
      surface: "callcenter",
    });
    const html = renderToStaticMarkup(
      createElement(AddressMapPicker, {
        id: "pickup-map",
        provider: createMockAddressProvider(),
        surface: "callcenter",
        value,
        renderMap: ({ id, point }) =>
          createElement("div", {
            "data-custom-map": id,
            "data-lat": point?.lat,
            "data-lng": point?.lng,
          }),
      }),
    );

    expect(html).toContain('data-custom-map="pickup-map-interactive-map"');
    expect(html).toContain('data-lat="25.033964"');
    expect(html).not.toContain("Select an address or drop a pin");
  });
});
