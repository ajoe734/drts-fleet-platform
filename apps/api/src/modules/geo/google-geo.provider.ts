import { Inject, Injectable, Optional } from "@nestjs/common";

import type {
  ComputeGeoRouteCommand,
  GeoGeocodeConfidence,
  GeoPoint,
  GeoResolveResponse,
  GeoReverseResponse,
  GeoRouteResponse,
  GeoSearchResponse,
  GeocodeCandidate,
  ResolveAddressCommand,
  ResolvedAddressPayload,
  ReverseGeocodeCommand,
  SearchGeoQuery,
} from "@drts/contracts";

import { GeoProviderError, type GeoProvider } from "./geo.provider";

export const GOOGLE_GEO_FETCH = "GOOGLE_GEO_FETCH";
export const GOOGLE_GEO_ENV = "GOOGLE_GEO_ENV";

const PROVIDER_ID = "google";
const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const DEFAULT_TIMEOUT_MS = 5_000;

type Env = Record<string, string | undefined>;
type Fetcher = typeof fetch;

type GoogleAddressComponent = {
  long_name?: unknown;
  short_name?: unknown;
  types?: unknown;
};

type GoogleGeocodeResult = {
  address_components?: unknown;
  formatted_address?: unknown;
  geometry?: unknown;
  partial_match?: unknown;
  place_id?: unknown;
  types?: unknown;
};

@Injectable()
export class GoogleGeoProvider implements GeoProvider {
  readonly providerId = PROVIDER_ID;
  private readonly fetcher: Fetcher;
  private readonly env: Env;

  constructor(
    @Optional() @Inject(GOOGLE_GEO_FETCH) fetcher?: Fetcher,
    @Optional() @Inject(GOOGLE_GEO_ENV) env?: Env,
  ) {
    this.fetcher = fetcher ?? globalThis.fetch;
    this.env = env ?? process.env;
  }

  async search(command: SearchGeoQuery): Promise<GeoSearchResponse> {
    const params = new URLSearchParams({
      address: command.q,
      key: this.requiredKey("GOOGLE_MAPS_GEOCODING_API_KEY"),
      language: command.locale ?? "zh-TW",
      region: "tw",
    });
    if (command.near) {
      params.set(
        "bounds",
        this.biasBounds(
          command.near,
          this.numberEnv("GOOGLE_MAPS_SEARCH_BIAS_DEGREES", 0.08),
        ),
      );
    }
    const results = await this.requestGeocode(params);
    const limit = Math.max(1, Math.min(command.limit ?? 8, 20));

    return {
      candidates: results
        .slice(0, limit)
        .map((result) => this.toCandidate(result)),
      provider: this.providerId,
      generatedAt: new Date().toISOString(),
    };
  }

  async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
    const placeId = this.resolvePlaceId(command);
    if (!placeId && command.selectedPoint) {
      return this.manualResolution(command);
    }

    const params = new URLSearchParams({
      key: this.requiredKey("GOOGLE_MAPS_GEOCODING_API_KEY"),
      language: "zh-TW",
      region: "tw",
    });
    if (placeId) {
      params.set("place_id", placeId);
    } else {
      params.set("address", command.addressText);
    }

    const result = (await this.requestGeocode(params))[0];
    if (!result) {
      throw new GeoProviderError(
        404,
        "GEO_CANDIDATE_NOT_FOUND",
        "Google Geocoding returned no matching address.",
        { provider: this.providerId },
      );
    }

    const resolvedAt = new Date().toISOString();
    const candidate = this.toCandidate(result);
    return {
      address: this.toResolvedAddress(
        result,
        "provider_candidate",
        command.surface,
        command.selectedByActorId,
        resolvedAt,
      ),
      candidate,
      provider: this.providerId,
      resolvedAt,
    };
  }

  async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
    const params = new URLSearchParams({
      key: this.requiredKey("GOOGLE_MAPS_GEOCODING_API_KEY"),
      language: command.locale ?? "zh-TW",
      latlng: `${command.location.lat},${command.location.lng}`,
      region: "tw",
    });
    const result = (await this.requestGeocode(params))[0];
    if (!result) {
      throw new GeoProviderError(
        404,
        "GEO_CANDIDATE_NOT_FOUND",
        "Google reverse geocoding returned no matching address.",
        { provider: this.providerId },
      );
    }

    const resolvedAt = new Date().toISOString();
    return {
      address: this.toResolvedAddress(
        result,
        "reverse_geocode",
        command.surface,
        command.requestedByActorId,
        resolvedAt,
      ),
      provider: this.providerId,
      resolvedAt,
    };
  }

  async route(command: ComputeGeoRouteCommand): Promise<GeoRouteResponse> {
    const travelMode =
      command.travelMode === "walk"
        ? "WALK"
        : command.travelMode === "two_wheeler"
          ? "TWO_WHEELER"
          : "DRIVE";
    const body: Record<string, unknown> = {
      origin: this.routeWaypoint(command.origin),
      destination: this.routeWaypoint(command.destination),
      travelMode,
      computeAlternativeRoutes: false,
      languageCode: command.locale ?? "zh-TW",
      units: "METRIC",
    };
    if (travelMode === "DRIVE") {
      body.routingPreference = "TRAFFIC_AWARE";
    }

    const response = await this.request(
      ROUTES_URL,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.requiredKey("GOOGLE_MAPS_ROUTES_API_KEY"),
          "x-goog-fieldmask":
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
        },
        body: JSON.stringify(body),
      },
      "routes",
    );
    const routes = Array.isArray(response.routes) ? response.routes : [];
    const route = this.record(routes[0]);
    const distanceMeters = this.finiteNumber(route?.distanceMeters);
    const durationSeconds = this.durationSeconds(route?.duration);
    const polyline = this.record(route?.polyline);
    const encodedPolyline = this.text(polyline?.encodedPolyline);
    if (distanceMeters === null || durationSeconds === null) {
      throw new GeoProviderError(
        502,
        "GEO_ROUTE_INVALID_RESPONSE",
        "Google Routes returned no usable route.",
        { provider: this.providerId },
        false,
      );
    }

    return {
      provider: this.providerId,
      distanceMeters: Math.round(distanceMeters),
      durationSeconds,
      encodedPolyline,
      generatedAt: new Date().toISOString(),
    };
  }

  private async requestGeocode(params: URLSearchParams) {
    const payload = await this.request(
      `${GEOCODING_URL}?${params.toString()}`,
      { method: "GET" },
      "geocoding",
    );
    const status = this.text(payload.status) ?? "UNKNOWN_ERROR";
    if (status === "ZERO_RESULTS") {
      return [];
    }
    if (status !== "OK") {
      const retryable = ["OVER_QUERY_LIMIT", "UNKNOWN_ERROR"].includes(status);
      throw new GeoProviderError(
        retryable ? 503 : 502,
        retryable ? "GEO_PROVIDER_UNAVAILABLE" : "GEO_PROVIDER_REJECTED",
        `Google Geocoding request failed with status ${status}.`,
        { provider: this.providerId, providerStatus: status },
        retryable,
      );
    }
    return (Array.isArray(payload.results) ? payload.results : [])
      .map((item) => this.record(item))
      .filter((item): item is GoogleGeocodeResult => item !== null);
  }

  private async request(
    url: string,
    init: RequestInit,
    operation: "geocoding" | "routes",
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        signal: AbortSignal.timeout(
          this.numberEnv("MAP_PROVIDER_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
        ),
      });
    } catch (error) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_UNAVAILABLE",
        `Google ${operation} request was unavailable.`,
        {
          provider: this.providerId,
          reason: error instanceof Error ? error.name : "network_error",
        },
        true,
      );
    }

    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new GeoProviderError(
        retryable ? 503 : 502,
        retryable ? "GEO_PROVIDER_UNAVAILABLE" : "GEO_PROVIDER_REJECTED",
        `Google ${operation} request failed with HTTP ${response.status}.`,
        { provider: this.providerId, httpStatus: response.status },
        retryable,
      );
    }

    try {
      return this.record(await response.json()) ?? {};
    } catch {
      throw new GeoProviderError(
        502,
        "GEO_PROVIDER_INVALID_RESPONSE",
        `Google ${operation} returned invalid JSON.`,
        { provider: this.providerId },
      );
    }
  }

  private toCandidate(result: GoogleGeocodeResult): GeocodeCandidate {
    const placeId = this.requiredResultText(result.place_id, "place_id");
    const address = this.requiredResultText(
      result.formatted_address,
      "formatted_address",
    );
    const location = this.resultLocation(result);
    const components = this.addressComponents(result);
    return {
      candidateId: `google:${placeId}`,
      provider: this.providerId,
      providerCandidateId: placeId,
      placeId,
      displayName: address,
      address,
      normalizedAddress: address,
      district: this.component(components, [
        "administrative_area_level_3",
        "sublocality_level_1",
        "sublocality",
      ]),
      locality: this.component(components, [
        "locality",
        "administrative_area_level_1",
      ]),
      countryCode: this.component(components, ["country"], true),
      location,
      confidence: this.confidence(result),
      accuracyM: this.accuracyMeters(result),
      metadata: {
        types: Array.isArray(result.types) ? result.types : [],
        partialMatch: result.partial_match === true,
      },
    };
  }

  private toResolvedAddress(
    result: GoogleGeocodeResult,
    coordinateSource: "provider_candidate" | "reverse_geocode",
    surface: ResolveAddressCommand["surface"],
    actorId: string | null | undefined,
    resolvedAt: string,
  ): ResolvedAddressPayload {
    const candidate = this.toCandidate(result);
    const location = candidate.location;
    if (!location) {
      throw new GeoProviderError(
        502,
        "GEO_PROVIDER_INVALID_RESPONSE",
        "Google Geocoding result did not include coordinates.",
        { provider: this.providerId },
      );
    }
    return {
      address: candidate.address,
      normalizedAddress: candidate.normalizedAddress ?? null,
      lat: location.lat,
      lng: location.lng,
      placeId: candidate.placeId ?? null,
      providerCandidateId: candidate.providerCandidateId ?? null,
      geocodeProvider: this.providerId,
      geocodeConfidence: candidate.confidence,
      coordinateSource,
      coordinateAccuracyM: candidate.accuracyM ?? null,
      selectedByActorId: actorId ?? null,
      selectedAt: resolvedAt,
      pinnedByActorId: actorId ?? null,
      pinnedAt: resolvedAt,
      surface,
      resolvedAt,
    };
  }

  private manualResolution(command: ResolveAddressCommand): GeoResolveResponse {
    const point = command.selectedPoint;
    if (!point) {
      throw new GeoProviderError(
        400,
        "GEO_COORDINATES_REQUIRED",
        "Manual resolution requires selected coordinates.",
      );
    }
    const resolvedAt = new Date().toISOString();
    return {
      address: {
        address: command.addressText,
        normalizedAddress: command.addressText.trim(),
        lat: point.lat,
        lng: point.lng,
        geocodeProvider: this.providerId,
        geocodeConfidence: "manual",
        coordinateSource: "manual_pin",
        coordinateAccuracyM: null,
        selectedByActorId: command.selectedByActorId ?? null,
        selectedAt: resolvedAt,
        pinnedByActorId: command.selectedByActorId ?? null,
        pinnedAt: resolvedAt,
        manualOverrideReason: command.manualOverrideReason ?? null,
        surface: command.surface,
        resolvedAt,
      },
      candidate: null,
      provider: this.providerId,
      resolvedAt,
    };
  }

  private resolvePlaceId(command: ResolveAddressCommand) {
    const value =
      command.placeId ?? command.providerCandidateId ?? command.candidateId;
    return value?.startsWith("google:") ? value.slice("google:".length) : value;
  }

  private resultLocation(result: GoogleGeocodeResult): GeoPoint {
    const geometry = this.record(result.geometry);
    const location = this.record(geometry?.location);
    const lat = this.finiteNumber(location?.lat);
    const lng = this.finiteNumber(location?.lng);
    if (lat === null || lng === null) {
      throw new GeoProviderError(
        502,
        "GEO_PROVIDER_INVALID_RESPONSE",
        "Google Geocoding result did not include valid coordinates.",
        { provider: this.providerId },
      );
    }
    return { lat, lng };
  }

  private confidence(result: GoogleGeocodeResult): GeoGeocodeConfidence {
    if (result.partial_match === true) {
      return "approximate";
    }
    const locationType = this.text(this.record(result.geometry)?.location_type);
    if (locationType === "ROOFTOP") {
      return "exact";
    }
    if (locationType === "RANGE_INTERPOLATED") {
      return "interpolated";
    }
    return locationType ? "approximate" : "unknown";
  }

  private accuracyMeters(result: GoogleGeocodeResult) {
    const locationType = this.text(this.record(result.geometry)?.location_type);
    return locationType === "ROOFTOP"
      ? 20
      : locationType === "RANGE_INTERPOLATED"
        ? 75
        : locationType === "GEOMETRIC_CENTER"
          ? 250
          : 1_000;
  }

  private addressComponents(result: GoogleGeocodeResult) {
    return (
      Array.isArray(result.address_components) ? result.address_components : []
    )
      .map((item) => this.record(item))
      .filter((item): item is GoogleAddressComponent => item !== null);
  }

  private component(
    components: GoogleAddressComponent[],
    types: string[],
    short = false,
  ) {
    for (const type of types) {
      const match = components.find(
        (component) =>
          Array.isArray(component.types) && component.types.includes(type),
      );
      const value = this.text(short ? match?.short_name : match?.long_name);
      if (value) {
        return value;
      }
    }
    return null;
  }

  private routeWaypoint(point: GeoPoint) {
    return {
      location: {
        latLng: { latitude: point.lat, longitude: point.lng },
      },
    };
  }

  private biasBounds(point: GeoPoint, delta: number) {
    return `${point.lat - delta},${point.lng - delta}|${point.lat + delta},${point.lng + delta}`;
  }

  private durationSeconds(value: unknown) {
    const match = this.text(value)?.match(/^(\d+(?:\.\d+)?)s$/);
    return match ? Math.max(0, Math.round(Number(match[1]))) : null;
  }

  private requiredKey(name: string) {
    const value = this.env[name]?.trim();
    if (!value) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_NOT_CONFIGURED",
        `Required Google Maps credential ${name} is not configured.`,
        { provider: this.providerId, missingSecretNames: [name] },
        true,
      );
    }
    return value;
  }

  private requiredResultText(value: unknown, field: string) {
    const text = this.text(value);
    if (!text) {
      throw new GeoProviderError(
        502,
        "GEO_PROVIDER_INVALID_RESPONSE",
        `Google Geocoding result omitted ${field}.`,
        { provider: this.providerId },
      );
    }
    return text;
  }

  private numberEnv(name: string, fallback: number) {
    const parsed = Number(this.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private finiteNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
}
