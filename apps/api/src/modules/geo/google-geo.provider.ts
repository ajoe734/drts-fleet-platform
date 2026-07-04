import { Inject, Injectable, Optional } from "@nestjs/common";

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

const GOOGLE_GEOCODE_ENDPOINT =
  "https://maps.googleapis.com/maps/api/geocode/json";
const DEFAULT_LOCALE = "zh-TW";
const DEFAULT_REGION = "tw";
const SEARCH_BIAS_DEGREES = 0.08;

type Env = Record<string, string | undefined>;

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

type GoogleGeocodeStatus =
  | "OK"
  | "ZERO_RESULTS"
  | "OVER_DAILY_LIMIT"
  | "OVER_QUERY_LIMIT"
  | "REQUEST_DENIED"
  | "INVALID_REQUEST"
  | "UNKNOWN_ERROR";

type GoogleAddressComponent = {
  long_name: string;
  short_name: string;
  types: string[];
};

type GoogleGeocodeResult = {
  formatted_address: string;
  place_id?: string;
  partial_match?: boolean;
  types?: string[];
  geometry: {
    location: GeoPoint;
    location_type?: string;
  };
  address_components?: GoogleAddressComponent[];
};

type GoogleGeocodeResponse = {
  status: GoogleGeocodeStatus;
  error_message?: string;
  results?: GoogleGeocodeResult[];
};

export const GOOGLE_GEO_PROVIDER_ENV = "GOOGLE_GEO_PROVIDER_ENV";
export const GOOGLE_GEO_PROVIDER_FETCH = "GOOGLE_GEO_PROVIDER_FETCH";

@Injectable()
export class GoogleGeoProvider implements GeoProvider {
  readonly providerId = "google";

  constructor(
    @Optional()
    @Inject(GOOGLE_GEO_PROVIDER_ENV)
    private readonly env: Env = process.env,
    @Optional()
    @Inject(GOOGLE_GEO_PROVIDER_FETCH)
    private readonly fetchLike: FetchLike = globalThis.fetch.bind(globalThis),
  ) {}

  async search(command: SearchGeoQuery): Promise<GeoSearchResponse> {
    const params = this.baseParams(command.locale);
    params.set("address", command.q);
    params.set("region", DEFAULT_REGION);

    if (command.near) {
      params.set("bounds", this.toBounds(command.near));
    }

    const results = await this.requestGeocode(params);
    const candidates = results
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
      return this.manualPinResolve(command);
    }

    const placeId = this.resolvePlaceId(command);
    if (!placeId) {
      throw new GeoProviderError(
        404,
        "GEO_CANDIDATE_NOT_FOUND",
        "No provider candidate matched the resolve command.",
        {
          candidateId: command.candidateId ?? null,
          providerCandidateId: command.providerCandidateId ?? null,
          placeId: command.placeId ?? null,
        },
      );
    }

    const params = this.baseParams();
    params.set("place_id", placeId);

    const result = (await this.requestGeocode(params))[0];
    if (!result) {
      throw new GeoProviderError(
        404,
        "GEO_CANDIDATE_NOT_FOUND",
        "No provider candidate matched the resolve command.",
        {
          candidateId: command.candidateId ?? null,
          providerCandidateId: command.providerCandidateId ?? null,
          placeId,
        },
      );
    }

    const resolvedAt = new Date().toISOString();
    return {
      address: this.toResolvedAddress(
        result,
        "provider_candidate",
        command.surface,
        command.selectedByActorId,
        resolvedAt,
      ),
      candidate: this.toCandidate(result),
      provider: this.providerId,
      resolvedAt,
    };
  }

  async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
    const params = this.baseParams(command.locale);
    params.set("latlng", this.toLatLng(command.location));
    params.set("result_type", "street_address|premise|route|intersection");

    const result = (await this.requestGeocode(params))[0];
    if (!result) {
      throw new GeoProviderError(
        404,
        "GEO_REVERSE_NOT_FOUND",
        "No reverse geocode result matched the requested location.",
        {
          location: command.location,
        },
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

  private async manualPinResolve(
    command: ResolveAddressCommand,
  ): Promise<GeoResolveResponse> {
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

  private baseParams(locale = DEFAULT_LOCALE) {
    const params = new URLSearchParams();
    params.set("key", this.requireServerKey());
    params.set("language", locale || DEFAULT_LOCALE);
    return params;
  }

  private resolvePlaceId(command: ResolveAddressCommand) {
    if (command.placeId?.trim()) {
      return command.placeId.trim();
    }
    if (command.providerCandidateId?.trim()) {
      return command.providerCandidateId.trim();
    }
    if (command.candidateId?.startsWith(`${this.providerId}:`)) {
      return command.candidateId.slice(`${this.providerId}:`.length).trim();
    }
    return null;
  }

  private requireServerKey() {
    const key = this.env.MAP_PROVIDER_SERVER_KEY?.trim();
    if (key) {
      return key;
    }
    throw new GeoProviderError(
      503,
      "GEO_PROVIDER_UNAVAILABLE",
      "Google geo provider server key is missing.",
      {
        provider: this.providerId,
      },
      true,
    );
  }

  private async requestGeocode(params: URLSearchParams) {
    let response;
    try {
      response = await this.fetchLike(
        `${GOOGLE_GEOCODE_ENDPOINT}?${params.toString()}`,
      );
    } catch (error) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_UNAVAILABLE",
        "Google geo provider request failed.",
        {
          provider: this.providerId,
          message: error instanceof Error ? error.message : String(error),
        },
        true,
      );
    }

    if (!response.ok) {
      throw new GeoProviderError(
        response.status >= 500 ? 503 : 502,
        "GEO_PROVIDER_UNAVAILABLE",
        `Google geo provider responded with HTTP ${response.status}.`,
        {
          provider: this.providerId,
          httpStatus: response.status,
        },
        response.status >= 500,
      );
    }

    const payload = (await response.json()) as GoogleGeocodeResponse;
    switch (payload.status) {
      case "OK":
        return payload.results ?? [];
      case "ZERO_RESULTS":
        return [];
      case "OVER_DAILY_LIMIT":
      case "OVER_QUERY_LIMIT":
        throw new GeoProviderError(
          503,
          "GEO_PROVIDER_QUOTA_EXCEEDED",
          "Google geo provider quota is exhausted or throttled.",
          {
            provider: this.providerId,
            providerStatus: payload.status,
            errorMessage: payload.error_message ?? null,
          },
          true,
        );
      case "REQUEST_DENIED":
      case "INVALID_REQUEST":
      case "UNKNOWN_ERROR":
      default:
        throw new GeoProviderError(
          503,
          "GEO_PROVIDER_UNAVAILABLE",
          `Google geo provider returned ${payload.status}.`,
          {
            provider: this.providerId,
            providerStatus: payload.status,
            errorMessage: payload.error_message ?? null,
          },
          payload.status === "UNKNOWN_ERROR",
        );
    }
  }

  private toCandidate(result: GoogleGeocodeResult): GeocodeCandidate {
    return {
      candidateId: this.candidateId(result),
      provider: this.providerId,
      providerCandidateId: result.place_id ?? null,
      placeId: result.place_id ?? null,
      displayName: result.formatted_address,
      address: result.formatted_address,
      normalizedAddress: result.formatted_address,
      district: this.addressComponent(result, [
        "sublocality_level_1",
        "administrative_area_level_3",
        "administrative_area_level_2",
      ]),
      locality: this.addressComponent(result, [
        "locality",
        "administrative_area_level_1",
      ]),
      countryCode: this.addressComponent(result, ["country"], true),
      location: result.geometry.location,
      confidence: this.confidenceFromLocationType(result.geometry.location_type),
      accuracyM: this.accuracyFromLocationType(result.geometry.location_type),
      metadata: {
        locationType: result.geometry.location_type ?? null,
        partialMatch: result.partial_match ?? false,
        types: result.types ?? [],
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
    const locationType = result.geometry.location_type;
    return {
      address: result.formatted_address,
      normalizedAddress: result.formatted_address,
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      placeId: result.place_id ?? null,
      providerCandidateId: result.place_id ?? null,
      geocodeProvider: this.providerId,
      geocodeConfidence:
        coordinateSource === "provider_candidate"
          ? this.confidenceFromLocationType(locationType)
          : this.reverseConfidenceFromLocationType(locationType),
      coordinateSource,
      coordinateAccuracyM: this.accuracyFromLocationType(locationType),
      selectedByActorId: actorId ?? null,
      selectedAt: resolvedAt,
      pinnedByActorId: actorId ?? null,
      pinnedAt: resolvedAt,
      surface,
      resolvedAt,
    };
  }

  private candidateId(result: GoogleGeocodeResult) {
    if (result.place_id?.trim()) {
      return `${this.providerId}:${result.place_id.trim()}`;
    }
    const { lat, lng } = result.geometry.location;
    return `${this.providerId}:${lat.toFixed(6)},${lng.toFixed(6)}`;
  }

  private addressComponent(
    result: GoogleGeocodeResult,
    types: string[],
    shortName = false,
  ) {
    const components = result.address_components ?? [];

    for (const type of types) {
      const match = components.find((component) => component.types.includes(type));
      if (match) {
        return shortName ? match.short_name : match.long_name;
      }
    }
    return null;
  }

  private confidenceFromLocationType(
    locationType?: string,
  ): GeoGeocodeConfidence {
    switch (locationType) {
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

  private reverseConfidenceFromLocationType(
    locationType?: string,
  ): GeoGeocodeConfidence {
    const confidence = this.confidenceFromLocationType(locationType);
    return confidence === "unknown" ? "approximate" : confidence;
  }

  private accuracyFromLocationType(locationType?: string) {
    switch (locationType) {
      case "ROOFTOP":
        return 15;
      case "RANGE_INTERPOLATED":
        return 50;
      case "GEOMETRIC_CENTER":
        return 150;
      case "APPROXIMATE":
        return 500;
      default:
        return null;
    }
  }

  private toBounds(near: GeoPoint) {
    const latOffset = SEARCH_BIAS_DEGREES;
    const lngOffset =
      SEARCH_BIAS_DEGREES /
      Math.max(Math.cos((near.lat * Math.PI) / 180), 0.25);
    return `${(near.lat - latOffset).toFixed(6)},${(near.lng - lngOffset).toFixed(6)}|${(near.lat + latOffset).toFixed(6)},${(near.lng + lngOffset).toFixed(6)}`;
  }

  private toLatLng(point: GeoPoint) {
    return `${point.lat},${point.lng}`;
  }
}
