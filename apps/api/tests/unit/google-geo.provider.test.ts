import { describe, expect, it, vi } from "vitest";

import { GeoProviderConfigService } from "../../src/modules/geo/geo-provider-config.service";
import { GeoProviderError } from "../../src/modules/geo/geo.provider";
import { GoogleGeoProvider } from "../../src/modules/geo/google-geo.provider";

const env = {
  GOOGLE_MAPS_GEOCODING_API_KEY: "test-geocoding-key",
  GOOGLE_MAPS_ROUTES_API_KEY: "test-routes-key",
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function geocodeResult() {
  return {
    formatted_address: "100台北市中正區北平西路3號",
    place_id: "ChIJTaipeiStation",
    partial_match: false,
    types: ["transit_station"],
    address_components: [
      {
        long_name: "中正區",
        short_name: "中正區",
        types: ["administrative_area_level_3"],
      },
      {
        long_name: "台北市",
        short_name: "台北市",
        types: ["administrative_area_level_1"],
      },
      { long_name: "台灣", short_name: "TW", types: ["country"] },
    ],
    geometry: {
      location: { lat: 25.0478, lng: 121.5171 },
      location_type: "ROOFTOP",
    },
  };
}

describe("GoogleGeoProvider", () => {
  it("normalizes Google address search without exposing the server key", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ status: "OK", results: [geocodeResult()] }),
    );
    const provider = new GoogleGeoProvider(fetcher as typeof fetch, env);

    const result = await provider.search({
      q: "台北車站",
      locale: "zh-TW",
      near: { lat: 25.0478, lng: 121.5171 },
      surface: "callcenter",
    });

    expect(result).toMatchObject({
      provider: "google",
      candidates: [
        {
          candidateId: "google:ChIJTaipeiStation",
          placeId: "ChIJTaipeiStation",
          address: "100台北市中正區北平西路3號",
          district: "中正區",
          locality: "台北市",
          countryCode: "TW",
          location: { lat: 25.0478, lng: 121.5171 },
          confidence: "exact",
        },
      ],
    });
    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://maps.googleapis.com/maps/api/geocode/json",
    );
    expect(requestUrl.searchParams.get("address")).toBe("台北車站");
    expect(requestUrl.searchParams.has("bounds")).toBe(true);
  });

  it("resolves place IDs and reverse-geocodes with auditable provenance", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ status: "OK", results: [geocodeResult()] }),
    );
    const provider = new GoogleGeoProvider(fetcher as typeof fetch, env);

    const resolved = await provider.resolve({
      candidateId: "google:ChIJTaipeiStation",
      addressText: "台北車站",
      selectedByActorId: "agent-001",
      surface: "callcenter",
    });
    const reversed = await provider.reverse({
      location: { lat: 25.0478, lng: 121.5171 },
      requestedByActorId: "ops-001",
      surface: "ops_console",
    });

    expect(resolved.address).toMatchObject({
      geocodeProvider: "google",
      coordinateSource: "provider_candidate",
      selectedByActorId: "agent-001",
      placeId: "ChIJTaipeiStation",
    });
    expect(reversed.address).toMatchObject({
      geocodeProvider: "google",
      coordinateSource: "reverse_geocode",
      selectedByActorId: "ops-001",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "place_id=ChIJTaipeiStation",
    );
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      "latlng=25.0478%2C121.5171",
    );
  });

  it("keeps explicit manual pins operational without spending provider quota", async () => {
    const fetcher = vi.fn();
    const provider = new GoogleGeoProvider(fetcher as typeof fetch, env);

    const result = await provider.resolve({
      addressText: "乘客指定側門",
      selectedPoint: { lat: 25.041, lng: 121.55 },
      selectedByActorId: "agent-002",
      surface: "callcenter",
      manualOverrideReason: "caller_confirmed_gate",
    });

    expect(result.address).toMatchObject({
      coordinateSource: "manual_pin",
      geocodeProvider: "google",
      manualOverrideReason: "caller_confirmed_gate",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls Compute Routes with the dedicated key and narrow field mask", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        routes: [
          {
            distanceMeters: 6200,
            duration: "905s",
            polyline: { encodedPolyline: "encoded-route" },
          },
        ],
      }),
    );
    const provider = new GoogleGeoProvider(fetcher as typeof fetch, env);

    const result = await provider.route({
      origin: { lat: 25.0478, lng: 121.5171 },
      destination: { lat: 25.0375, lng: 121.5637 },
      travelMode: "drive",
      locale: "zh-TW",
    });

    expect(result).toMatchObject({
      provider: "google",
      distanceMeters: 6200,
      durationSeconds: 905,
      encodedPolyline: "encoded-route",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-goog-api-key": "test-routes-key",
          "x-goog-fieldmask":
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        }),
      }),
    );
  });

  it("maps quota and upstream failures to retryable provider errors", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 429));
    const provider = new GoogleGeoProvider(fetcher as typeof fetch, env);

    await expect(
      provider.search({ q: "台北", surface: "callcenter" }),
    ).rejects.toMatchObject({
      code: "GEO_PROVIDER_UNAVAILABLE",
      statusCode: 503,
      retryable: true,
    } satisfies Partial<GeoProviderError>);
  });
});

describe("Google provider health", () => {
  it("passes only when both server keys and the implemented adapter are configured", () => {
    const health = new GeoProviderConfigService({
      DRTS_ENV: "staging",
      MAP_PROVIDER_MODE: "external",
      MAP_PROVIDER_NAME: "google",
      MAP_PROVIDER_ALLOWED_ORIGINS: "https://ops.example.test",
      GOOGLE_MAPS_GEOCODING_API_KEY: "configured",
      GOOGLE_MAPS_ROUTES_API_KEY: "configured",
      GOOGLE_MAPS_BROWSER_KEY: "configured",
    }).getHealth();

    expect(health).toMatchObject({
      provider: "google",
      mode: "external",
      status: "healthy",
      failClosed: false,
      missingSecretNames: [],
      keyRestrictions: {
        serverKeyConfigured: true,
        browserKeyConfigured: true,
      },
      checks: expect.arrayContaining([
        expect.objectContaining({ name: "external_adapter", status: "pass" }),
      ]),
    });
  });
});
