import { describe, expect, it, vi } from "vitest";

import { ExternalGeoProvider } from "../../src/modules/geo/external-geo.provider";
import { GeoProviderError } from "../../src/modules/geo/geo.provider";

function createResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
    ...init,
  });
}

describe("ExternalGeoProvider", () => {
  it("maps Google geocode search results into geo candidates", async () => {
    const fetchImpl = vi.fn(async () =>
      createResponse({
        status: "OK",
        results: [
          {
            formatted_address: "Taipei City Hall, Xinyi District, Taipei City",
            place_id: "place-001",
            geometry: {
              location: { lat: 25.0375, lng: 121.5637 },
              location_type: "ROOFTOP",
            },
            address_components: [
              { long_name: "Taipei City Hall", types: ["premise"] },
              { long_name: "Xinyi District", types: ["administrative_area_level_2"] },
              { long_name: "Taipei City", types: ["locality"] },
              { short_name: "TW", types: ["country"] },
            ],
            types: ["premise"],
          },
        ],
      }),
    );
    const provider = new ExternalGeoProvider(fetchImpl as typeof fetch, {
      MAP_PROVIDER_SERVER_KEY: "server-key",
    });

    const result = await provider.search({
      q: "taipei city hall",
      surface: "callcenter",
      limit: 5,
    });

    expect(result.provider).toBe("google_maps");
    expect(result.candidates).toEqual([
      expect.objectContaining({
        candidateId: "google:place-001",
        providerCandidateId: "place-001",
        placeId: "place-001",
        displayName: "Taipei City Hall",
        confidence: "exact",
        countryCode: "TW",
        location: { lat: 25.0375, lng: 121.5637 },
      }),
    ]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("resolves provider candidates by place id", async () => {
    const fetchImpl = vi.fn(async () =>
      createResponse({
        status: "OK",
        results: [
          {
            formatted_address: "Taipei Main Station, Zhongzheng District, Taipei City",
            place_id: "place-002",
            geometry: {
              location: { lat: 25.0478, lng: 121.5171 },
              location_type: "RANGE_INTERPOLATED",
            },
            address_components: [
              { long_name: "Taipei Main Station", types: ["premise"] },
              { long_name: "Zhongzheng District", types: ["administrative_area_level_2"] },
              { long_name: "Taipei City", types: ["locality"] },
              { short_name: "TW", types: ["country"] },
            ],
          },
        ],
      }),
    );
    const provider = new ExternalGeoProvider(fetchImpl as typeof fetch, {
      MAP_PROVIDER_SERVER_KEY: "server-key",
    });

    const result = await provider.resolve({
      candidateId: "google:place-002",
      addressText: "Taipei Main Station",
      selectedByActorId: "agent-001",
      surface: "callcenter",
    });

    expect(result.address).toMatchObject({
      address: "Taipei Main Station, Zhongzheng District, Taipei City",
      lat: 25.0478,
      lng: 121.5171,
      placeId: "place-002",
      providerCandidateId: "place-002",
      geocodeProvider: "google_maps",
      geocodeConfidence: "interpolated",
      coordinateSource: "provider_candidate",
      selectedByActorId: "agent-001",
      pinnedByActorId: "agent-001",
    });
  });

  it("reverse geocodes lat/lng into a resolved address", async () => {
    const fetchImpl = vi.fn(async () =>
      createResponse({
        status: "OK",
        results: [
          {
            formatted_address: "No. 1, Shifu Rd, Xinyi District, Taipei City",
            place_id: "place-003",
            geometry: {
              location: { lat: 25.0375, lng: 121.5637 },
              location_type: "ROOFTOP",
            },
            address_components: [
              { long_name: "Xinyi District", types: ["administrative_area_level_2"] },
              { long_name: "Taipei City", types: ["locality"] },
              { short_name: "TW", types: ["country"] },
            ],
          },
        ],
      }),
    );
    const provider = new ExternalGeoProvider(fetchImpl as typeof fetch, {
      MAP_PROVIDER_SERVER_KEY: "server-key",
    });

    const result = await provider.reverse({
      location: { lat: 25.0375, lng: 121.5637 },
      surface: "ops_console",
      requestedByActorId: "ops-007",
    });

    expect(result.address).toMatchObject({
      address: "No. 1, Shifu Rd, Xinyi District, Taipei City",
      lat: 25.0375,
      lng: 121.5637,
      geocodeProvider: "google_maps",
      coordinateSource: "reverse_geocode",
      selectedByActorId: "ops-007",
    });
  });

  it("fails closed when the external server key is missing", async () => {
    const provider = new ExternalGeoProvider(vi.fn() as typeof fetch, {});

    await expect(
      provider.search({
        q: "taipei",
        surface: "callcenter",
      }),
    ).rejects.toBeInstanceOf(GeoProviderError);
  });
});
