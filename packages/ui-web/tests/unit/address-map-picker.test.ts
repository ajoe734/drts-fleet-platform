import type {
  AddressPayload,
  GeocodeCandidate,
  ServiceAreaEvaluationResult,
} from "@drts/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AddressMapPairPicker,
  AddressMapPicker,
  buildAddressPayloadFromCandidate,
  buildManualAddressPayload,
  buildServiceAreaPreviewCommand,
  parseManualGeoPoint,
  serviceabilityTone,
} from "../../src/address-map-picker";

const candidate: GeocodeCandidate = {
  candidateId: "candidate-tpe-t1",
  provider: "mock-map",
  providerCandidateId: "mock-place-tpe-t1",
  placeId: "place-tpe-t1",
  displayName: "桃園機場 第一航廈 入境大廳",
  address: "桃園市大園區航站南路 15 號",
  normalizedAddress: "桃園市大園區航站南路15號",
  district: "大園區",
  locality: "桃園市",
  countryCode: "TW",
  location: { lat: 25.081998, lng: 121.237982 },
  confidence: "exact",
  accuracyM: 12,
};

const pickupPayload = buildAddressPayloadFromCandidate(candidate, {
  actorId: "agent-001",
  selectedAt: "2026-06-30T16:00:00.000Z",
  surface: "callcenter",
});

const dropoffPayload: AddressPayload = {
  address: "台北市信義區松仁路 100 號",
  lat: 25.033879,
  lng: 121.568743,
  coordinateSource: "manual_pin",
  geocodeConfidence: "manual",
};

const serviceability: ServiceAreaEvaluationResult = {
  decision: "manual_review",
  serviceProductType: "taxi_reservation",
  evaluatedAt: "2026-06-30T16:01:00.000Z",
  stops: [
    {
      kind: "pickup",
      location: { lat: 25.081998, lng: 121.237982 },
      serviceAreaCodes: ["TPE"],
      policyCodes: ["AIRPORT_PICKUP_REVIEW"],
      geometryVersionRefs: ["boundary:TPE:v3"],
      decision: "manual_review",
      reasonCodes: ["AIRPORT_PICKUP_REVIEW"],
      reasonMessages: ["機場上車點需客服覆核航廈與門號"],
    },
  ],
  serviceAreaCodes: ["TPE"],
  geometryVersionRefs: ["boundary:TPE:v3"],
  reasonCodes: ["AIRPORT_PICKUP_REVIEW"],
  reasonMessages: ["機場上車點需客服覆核航廈與門號"],
};

describe("AddressMapPicker helpers", () => {
  it("builds a contract-compatible AddressPayload from a provider candidate", () => {
    expect(pickupPayload).toMatchObject({
      address: "桃園市大園區航站南路 15 號",
      normalizedAddress: "桃園市大園區航站南路15號",
      lat: 25.081998,
      lng: 121.237982,
      placeId: "place-tpe-t1",
      geocodeProvider: "mock-map",
      geocodeConfidence: "exact",
      coordinateSource: "provider_candidate",
      providerCandidateId: "mock-place-tpe-t1",
      selectedByActorId: "agent-001",
      pinnedByActorId: "agent-001",
      surface: "callcenter",
    });
    expect(pickupPayload.coordinateProvenance).toMatchObject({
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-map",
      geocodeConfidence: "exact",
      placeId: "place-tpe-t1",
      providerCandidateId: "mock-place-tpe-t1",
      selectedAt: "2026-06-30T16:00:00.000Z",
      pinnedAt: "2026-06-30T16:00:00.000Z",
    });
  });

  it("parses and builds manual coordinate fallback payloads", () => {
    expect(parseManualGeoPoint("25.033879", "121.568743")).toEqual({
      lat: 25.033879,
      lng: 121.568743,
    });
    expect(parseManualGeoPoint("91", "121.568743")).toBeNull();

    const manual = buildManualAddressPayload({
      address: "台北市信義區松仁路 100 號",
      lat: 25.033879,
      lng: 121.568743,
      manualOverrideReason: "caller confirmed building entrance",
      actorId: "agent-002",
      selectedAt: "2026-06-30T16:02:00.000Z",
      surface: "callcenter",
    });

    expect(manual).toMatchObject({
      coordinateSource: "manual_pin",
      geocodeConfidence: "manual",
      manualOverrideReason: "caller confirmed building entrance",
      pinnedByActorId: "agent-002",
      surface: "callcenter",
    });
  });

  it("builds service-area preview commands only when pickup coordinates exist", () => {
    expect(
      buildServiceAreaPreviewCommand({
        pickup: { address: "text only" },
        serviceProductType: "taxi_reservation",
      }),
    ).toBeNull();

    expect(
      buildServiceAreaPreviewCommand({
        pickup: pickupPayload,
        dropoff: dropoffPayload,
        serviceProductType: "taxi_reservation",
        requestedAt: "2026-06-30T17:00:00.000Z",
      }),
    ).toEqual({
      serviceProductType: "taxi_reservation",
      pickup: { lat: 25.081998, lng: 121.237982 },
      dropoff: { lat: 25.033879, lng: 121.568743 },
      requestedAt: "2026-06-30T17:00:00.000Z",
    });
  });

  it("maps serviceability decisions to production warning tones", () => {
    expect(serviceabilityTone("serviceable")).toBe("success");
    expect(serviceabilityTone("manual_review")).toBe("warning");
    expect(serviceabilityTone("not_serviceable")).toBe("danger");
    expect(serviceabilityTone(null)).toBe("neutral");
  });
});

describe("AddressMapPicker component", () => {
  it("renders candidates, confirmed coordinates, and serviceability preview", () => {
    const markup = renderToStaticMarkup(
      createElement(AddressMapPicker, {
        id: "pickup-picker",
        label: "上車點",
        stopKind: "pickup",
        value: pickupPayload,
        query: "桃園機場",
        candidates: [candidate],
        providerStatus: "ready",
        serviceability,
      }),
    );

    expect(markup).toContain('data-address-map-picker="pickup-picker"');
    expect(markup).toContain('data-stop-kind="pickup"');
    expect(markup).toContain('data-provider-status="ready"');
    expect(markup).toContain('data-candidate-id="candidate-tpe-t1"');
    expect(markup).toContain("25.081998");
    expect(markup).toContain('data-serviceability-decision="manual_review"');
    expect(markup).toContain("機場上車點需客服覆核航廈與門號");
  });

  it("renders visible provider outage and manual fallback controls", () => {
    const markup = renderToStaticMarkup(
      createElement(AddressMapPicker, {
        id: "dropoff-picker",
        label: "下車點",
        stopKind: "dropoff",
        value: dropoffPayload,
        providerStatus: "provider_unavailable",
        manualFallbackReason: "provider outage",
      }),
    );

    expect(markup).toContain('data-provider-status="provider_unavailable"');
    expect(markup).toContain("地圖/地址服務暫不可用");
    expect(markup).toContain("data-address-map-manual-fallback");
    expect(markup).toContain("provider outage");
  });

  it("renders a pair picker that signals service-area evaluation readiness", () => {
    const markup = renderToStaticMarkup(
      createElement(AddressMapPairPicker, {
        id: "phone-booking-pair",
        serviceProductType: "taxi_reservation",
        serviceability,
        pickup: {
          id: "pickup",
          label: "上車點",
          value: pickupPayload,
          candidates: [candidate],
          providerStatus: "ready",
        },
        dropoff: {
          id: "dropoff",
          label: "下車點",
          value: dropoffPayload,
          providerStatus: "manual",
        },
      }),
    );

    expect(markup).toContain(
      'data-address-map-pair-picker="phone-booking-pair"',
    );
    expect(markup).toContain('data-service-product-type="taxi_reservation"');
    expect(markup).toContain('data-can-evaluate-service-area="true"');
    expect(markup).toContain("pickup/dropoff 已具備座標");
  });
});
