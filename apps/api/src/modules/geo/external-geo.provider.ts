import { Injectable } from "@nestjs/common";

import type {
  GeoGeocodeConfidence,
  GeoPoint,
  GeoResolveResponse,
  GeoReverseResponse,
  GeoSearchResponse,
  GeocodeCandidate,
  ResolveAddressCommand,
  ResolvedAddressPayload,
  ReverseGeocodeCommand,
  SearchGeoQuery,
} from "@drts/contracts";

import { GeoProviderError, type GeoProvider } from "./geo.provider";

const PROVIDER_ID = "google_maps";
const GEOCODE_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

type FetchLike = typeof fetch;
type Env = Record<string, string | undefined>;

type GoogleAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GoogleGeocodeResult = {
  formatted_address?: string;
  partial_match?: boolean;
  place_id?: string;
  address_components?: GoogleAddressComponent[];
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
    location_type?: string;
  };
  types?: string[];
};

type GoogleGeocodePayload = {
  status?: string;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

@Injectable()
export class ExternalGeoProvider implements GeoProvider {
  readonly providerId = PROVIDER_ID;

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly env: Env = process.env,
  ) {}

  async search(command: SearchGeoQuery): Promise<GeoSearchResponse> {
    const payload = await this.requestGeocode({
      address: command.q.trim(),
      language: command.locale,
    });
    const candidates = (payload.results ?? [])
      .slice(0, command.limit ?? 8)
      .map((result) => this.toCandidate(result));

    return {
      candidates,
      provider: this.providerId,
      generatedAt: new Date().toISOString(),
    };
  }

  async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
    if (command.selectedPoint) {
      return this.manualResolve(command);
    }

    const payload = await this.requestGeocode(
      this.resolveRequestParams(command),
      "GEO_CANDIDATE_NOT_FOUND",
      404,
      false,
    );
    const result = payload.results?.[0];
    if (!result) {
      throw new GeoProviderError(
        404,
        "GEO_CANDIDATE_NOT_FOUND",
        "No external geocode candidate matched the resolve command.",
        {
          candidateId: command.candidateId ?? null,
          providerCandidateId: command.providerCandidateId ?? null,
          placeId: command.placeId ?? null,
        },
      );
    }

    const resolvedAt = new Date().toISOString();
    return {
      address: this.toResolvedAddress(
        result,
        "provider_candidate",
        command.surface,
        command.selectedByActorId ?? null,
        resolvedAt,
      ),
      candidate: this.toCandidate(result),
      provider: this.providerId,
      resolvedAt,
    };
  }

  async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
    const payload = await this.requestGeocode({
      latlng: `${command.location.lat},${command.location.lng}`,
      language: command.locale,
    });
    const result = payload.results?.[0];
    if (!result) {
      throw new GeoProviderError(
        404,
        "GEO_REVERSE_NOT_FOUND",
        "No external reverse-geocode result matched the requested coordinates.",
        {
          lat: command.location.lat,
          lng: command.location.lng,
        },
      );
    }

    const resolvedAt = new Date().toISOString();
    return {
      address: this.toResolvedAddress(
        result,
        "reverse_geocode",
        command.surface,
        command.requestedByActorId ?? null,
        resolvedAt,
      ),
      provider: this.providerId,
      resolvedAt,
    };
  }

  private async requestGeocode(
    params: Record<string, string | undefined>,
    emptyCode = "GEO_PROVIDER_UNAVAILABLE",
    emptyStatusCode = 503,
    emptyRetryable = true,
  ) {
    const url = new URL(
      this.env.MAP_PROVIDER_GEOCODE_API_URL ?? GEOCODE_API_URL,
    );
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
    url.searchParams.set("key", this.serverKey());
    url.searchParams.set("region", this.env.MAP_PROVIDER_REGION_HINT ?? "tw");

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
    } catch (error) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_UNAVAILABLE",
        "External geocode provider request failed before a response was received.",
        {
          cause: error instanceof Error ? error.message : String(error),
        },
        true,
      );
    }

    if (!response.ok) {
      throw new GeoProviderError(
        response.status >= 500 ? 503 : response.status,
        response.status === 429
          ? "GEO_PROVIDER_QUOTA_EXCEEDED"
          : "GEO_PROVIDER_UNAVAILABLE",
        `External geocode provider returned HTTP ${response.status}.`,
        {
          status: response.status,
        },
        response.status >= 500 || response.status === 429,
      );
    }

    const payload = (await response.json()) as GoogleGeocodePayload;
    const status = (payload.status ?? "").toUpperCase();
    if (status === "OK") {
      return payload;
    }
    if (status === "ZERO_RESULTS") {
      if (emptyStatusCode === 404) {
        return payload;
      }
      throw new GeoProviderError(
        emptyStatusCode,
        emptyCode,
        "External geocode provider returned no results.",
        {
          status,
          errorMessage: payload.error_message ?? null,
        },
        emptyRetryable,
      );
    }

    const code =
      status === "OVER_DAILY_LIMIT" || status === "OVER_QUERY_LIMIT"
        ? "GEO_PROVIDER_QUOTA_EXCEEDED"
        : status === "REQUEST_DENIED" || status === "INVALID_REQUEST"
          ? "GEO_PROVIDER_REQUEST_INVALID"
          : "GEO_PROVIDER_UNAVAILABLE";
    const statusCode =
      code === "GEO_PROVIDER_REQUEST_INVALID"
        ? 400
        : code === "GEO_PROVIDER_QUOTA_EXCEEDED"
          ? 429
          : 503;

    throw new GeoProviderError(
      statusCode,
      code,
      payload.error_message ??
        `External geocode provider returned status ${status || "UNKNOWN"}.`,
      {
        status,
      },
      statusCode >= 429,
    );
  }

  private resolveRequestParams(command: ResolveAddressCommand) {
    const placeId =
      command.placeId ??
      command.providerCandidateId ??
      this.placeIdFromCandidateId(command.candidateId);
    if (placeId) {
      return { place_id: placeId };
    }
    return {
      address: command.addressText.trim(),
    };
  }

  private manualResolve(command: ResolveAddressCommand): GeoResolveResponse {
    const resolvedAt = new Date().toISOString();
    return {
      address: {
        address: command.addressText,
        normalizedAddress: command.addressText.trim(),
        lat: command.selectedPoint!.lat,
        lng: command.selectedPoint!.lng,
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

  private serverKey() {
    const value = this.env.MAP_PROVIDER_SERVER_KEY?.trim();
    if (!value) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_NOT_CONFIGURED",
        "MAP_PROVIDER_SERVER_KEY is required for external geo provider mode.",
        {
          missingSecretNames: ["MAP_PROVIDER_SERVER_KEY"],
        },
        true,
      );
    }
    return value;
  }

  private toCandidate(result: GoogleGeocodeResult): GeocodeCandidate {
    const location = this.readPoint(result);
    const locationType = result.geometry?.location_type ?? null;
    return {
      candidateId: `google:${result.place_id ?? "unknown"}`,
      provider: this.providerId,
      providerCandidateId: result.place_id ?? null,
      placeId: result.place_id ?? null,
      displayName: this.displayName(result),
      address: result.formatted_address ?? "Unknown address",
      normalizedAddress: result.formatted_address ?? null,
      district: this.component(result, "administrative_area_level_2"),
      locality:
        this.component(result, "locality") ??
        this.component(result, "administrative_area_level_1"),
      countryCode: this.component(result, "country", true),
      location,
      confidence: this.confidence(result),
      accuracyM: this.accuracyMeters(locationType),
      metadata: {
        locationType,
        partialMatch: result.partial_match ?? false,
        resultTypes: result.types ?? [],
      },
    };
  }

  private toResolvedAddress(
    result: GoogleGeocodeResult,
    coordinateSource: "provider_candidate" | "reverse_geocode",
    surface: ResolveAddressCommand["surface"] | ReverseGeocodeCommand["surface"],
    actorId: string | null,
    resolvedAt: string,
  ): ResolvedAddressPayload {
    const location = this.readPoint(result);
    if (!location) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_UNAVAILABLE",
        "External geocode provider response omitted a usable coordinate.",
        {
          placeId: result.place_id ?? null,
        },
        true,
      );
    }

    return {
      address: result.formatted_address ?? "Unknown address",
      normalizedAddress: result.formatted_address ?? null,
      lat: location.lat,
      lng: location.lng,
      placeId: result.place_id ?? null,
      geocodeProvider: this.providerId,
      geocodeConfidence: this.confidence(result),
      coordinateSource,
      coordinateAccuracyM: this.accuracyMeters(
        result.geometry?.location_type ?? null,
      ),
      providerCandidateId: result.place_id ?? null,
      selectedByActorId: actorId,
      selectedAt: actorId ? resolvedAt : null,
      pinnedByActorId:
        coordinateSource === "provider_candidate" ? actorId : null,
      pinnedAt: coordinateSource === "provider_candidate" && actorId
        ? resolvedAt
        : null,
      manualOverrideReason: null,
      surface,
      resolvedAt,
    };
  }

  private readPoint(result: GoogleGeocodeResult): GeoPoint | null {
    const lat = result.geometry?.location?.lat;
    const lng = result.geometry?.location?.lng;
    return typeof lat === "number" && typeof lng === "number"
      ? { lat, lng }
      : null;
  }

  private confidence(result: GoogleGeocodeResult): GeoGeocodeConfidence {
    if (result.partial_match) {
      return "approximate";
    }
    switch ((result.geometry?.location_type ?? "").toUpperCase()) {
      case "ROOFTOP":
        return "exact";
      case "RANGE_INTERPOLATED":
        return "interpolated";
      case "GEOMETRIC_CENTER":
      case "APPROXIMATE":
        return "approximate";
      default:
        return "unknown";
    }
  }

  private accuracyMeters(locationType: string | null) {
    switch ((locationType ?? "").toUpperCase()) {
      case "ROOFTOP":
        return 20;
      case "RANGE_INTERPOLATED":
        return 60;
      case "GEOMETRIC_CENTER":
        return 150;
      case "APPROXIMATE":
        return 500;
      default:
        return null;
    }
  }

  private displayName(result: GoogleGeocodeResult) {
    return (
      this.component(result, "point_of_interest") ??
      this.component(result, "premise") ??
      this.component(result, "establishment") ??
      this.component(result, "route") ??
      result.formatted_address?.split(",")[0]?.trim() ??
      "Unknown place"
    );
  }

  private component(
    result: GoogleGeocodeResult,
    type: string,
    short = false,
  ): string | null {
    const match = result.address_components?.find((component) =>
      component.types?.includes(type),
    );
    if (!match) {
      return null;
    }
    return short ? match.short_name ?? match.long_name ?? null : match.long_name ?? match.short_name ?? null;
  }

  private placeIdFromCandidateId(candidateId?: string | null) {
    if (!candidateId) {
      return null;
    }
    return candidateId.startsWith("google:") ? candidateId.slice(7) : null;
  }
}
