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

const PROVIDER_ID = "mock";
const PROVIDER_UNAVAILABLE_SENTINEL = "__provider_unavailable__";
const EARTH_RADIUS_M = 6_371_000;

type MockPlace = GeocodeCandidate & {
  location: GeoPoint;
  keywords: string[];
};

const MOCK_PLACES: MockPlace[] = [
  {
    candidateId: "mock-taipei-station",
    provider: PROVIDER_ID,
    providerCandidateId: "mock:place:taipei-station",
    placeId: "mock-place-taipei-station",
    displayName: "Taipei Station",
    address: "台北市中正區北平西路3號",
    normalizedAddress: "臺北市中正區北平西路3號",
    district: "中正區",
    locality: "臺北市",
    countryCode: "TW",
    location: { lat: 25.0478, lng: 121.5171 },
    confidence: "exact",
    accuracyM: 15,
    metadata: { fixture: true, serviceArea: "TAIPEI_CORE" },
    keywords: [
      "taipei",
      "station",
      "台北",
      "臺北",
      "車站",
      "台北車站",
      "臺北車站",
      "北平西路",
    ],
  },
  {
    candidateId: "mock-xinyi-hospital",
    provider: PROVIDER_ID,
    providerCandidateId: "mock:place:xinyi-hospital",
    placeId: "mock-place-xinyi-hospital",
    displayName: "Xinyi Hospital Access",
    address: "台北市信義區吳興街252號",
    normalizedAddress: "臺北市信義區吳興街252號",
    district: "信義區",
    locality: "臺北市",
    countryCode: "TW",
    location: { lat: 25.0338, lng: 121.5645 },
    confidence: "exact",
    accuracyM: 20,
    metadata: { fixture: true, serviceArea: "TAIPEI_CORE" },
    keywords: ["xinyi", "hospital", "信義", "醫院", "吳興街"],
  },
  {
    candidateId: "mock-taoyuan-airport-t1",
    provider: PROVIDER_ID,
    providerCandidateId: "mock:place:taoyuan-airport-t1",
    placeId: "mock-place-taoyuan-airport-t1",
    displayName: "Taoyuan Airport Terminal 1",
    address: "桃園市大園區航站南路9號",
    normalizedAddress: "桃園市大園區航站南路9號",
    district: "大園區",
    locality: "桃園市",
    countryCode: "TW",
    location: { lat: 25.0797, lng: 121.2342 },
    confidence: "exact",
    accuracyM: 30,
    metadata: { fixture: true, serviceArea: "TAOYUAN_AIRPORT" },
    keywords: ["taoyuan", "airport", "terminal", "桃園", "機場", "航站"],
  },
  {
    candidateId: "mock-taichung-station",
    provider: PROVIDER_ID,
    providerCandidateId: "mock:place:taichung-station",
    placeId: "mock-place-taichung-station",
    displayName: "Taichung Station",
    address: "台中市中區台灣大道一段1號",
    normalizedAddress: "臺中市中區臺灣大道一段1號",
    district: "中區",
    locality: "臺中市",
    countryCode: "TW",
    location: { lat: 24.137, lng: 120.6869 },
    confidence: "exact",
    accuracyM: 25,
    metadata: { fixture: true, serviceArea: "OUT_OF_AREA" },
    keywords: ["taichung", "station", "台中", "臺中", "車站"],
  },
];

@Injectable()
export class MockGeoProvider implements GeoProvider {
  readonly providerId = PROVIDER_ID;

  async search(command: SearchGeoQuery): Promise<GeoSearchResponse> {
    this.throwIfUnavailable(command.q);
    const query = command.q.trim().toLowerCase();
    const limit = command.limit ?? 8;
    const scored = MOCK_PLACES.map((place) => ({
      place,
      score: this.scorePlace(place, query, command.near ?? null),
    }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ place }) => this.toCandidate(place));

    return {
      candidates: scored,
      provider: this.providerId,
      generatedAt: new Date().toISOString(),
    };
  }

  async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
    this.throwIfUnavailable(
      command.candidateId ??
        command.providerCandidateId ??
        command.placeId ??
        command.addressText,
    );
    const place = this.findPlace(command);
    if (place) {
      const resolvedAt = new Date().toISOString();
      return {
        address: this.toResolvedAddress(
          place,
          "provider_candidate",
          command.surface,
          command.selectedByActorId,
          resolvedAt,
        ),
        candidate: this.toCandidate(place),
        provider: this.providerId,
        resolvedAt,
      };
    }

    if (command.selectedPoint) {
      const resolvedAt = new Date().toISOString();
      return {
        address: {
          address: command.addressText,
          normalizedAddress: command.addressText.trim(),
          lat: command.selectedPoint.lat,
          lng: command.selectedPoint.lng,
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

    throw new GeoProviderError(
      404,
      "GEO_CANDIDATE_NOT_FOUND",
      "No mock geocode candidate matched the resolve command.",
      {
        candidateId: command.candidateId,
        providerCandidateId: command.providerCandidateId,
        placeId: command.placeId,
      },
    );
  }

  async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
    const nearest = this.findNearest(command.location);
    const resolvedAt = new Date().toISOString();
    if (nearest && nearest.distanceMeters <= 1000) {
      return {
        address: this.toResolvedAddress(
          nearest.place,
          "reverse_geocode",
          command.surface,
          command.requestedByActorId,
          resolvedAt,
          nearest.distanceMeters,
        ),
        provider: this.providerId,
        resolvedAt,
      };
    }

    return {
      address: {
        address: `Mock reverse geocode ${command.location.lat.toFixed(
          6,
        )},${command.location.lng.toFixed(6)}`,
        normalizedAddress: null,
        lat: command.location.lat,
        lng: command.location.lng,
        geocodeProvider: this.providerId,
        geocodeConfidence: "approximate",
        coordinateSource: "reverse_geocode",
        coordinateAccuracyM: null,
        selectedByActorId: command.requestedByActorId ?? null,
        selectedAt: resolvedAt,
        surface: command.surface,
        resolvedAt,
      },
      provider: this.providerId,
      resolvedAt,
    };
  }

  private findPlace(command: ResolveAddressCommand) {
    return MOCK_PLACES.find(
      (place) =>
        place.candidateId === command.candidateId ||
        place.providerCandidateId === command.providerCandidateId ||
        place.placeId === command.placeId,
    );
  }

  private findNearest(location: GeoPoint) {
    return MOCK_PLACES.map((place) => ({
      place,
      distanceMeters: this.distanceMeters(place.location, location),
    })).sort((left, right) => left.distanceMeters - right.distanceMeters)[0];
  }

  private reverseConfidence(distanceMeters: number): GeoGeocodeConfidence {
    if (distanceMeters <= 50) {
      return "exact";
    }
    if (distanceMeters <= 250) {
      return "interpolated";
    }
    return "approximate";
  }

  private toCandidate(place: MockPlace): GeocodeCandidate {
    return {
      candidateId: place.candidateId,
      provider: place.provider,
      providerCandidateId: place.providerCandidateId ?? null,
      placeId: place.placeId ?? null,
      displayName: place.displayName,
      address: place.address,
      normalizedAddress: place.normalizedAddress ?? null,
      district: place.district ?? null,
      locality: place.locality ?? null,
      countryCode: place.countryCode ?? null,
      location: place.location,
      confidence: place.confidence,
      accuracyM: place.accuracyM ?? null,
      metadata: place.metadata ?? {},
    };
  }

  private toResolvedAddress(
    place: MockPlace,
    coordinateSource: "provider_candidate" | "reverse_geocode",
    surface: ResolveAddressCommand["surface"],
    actorId: string | null | undefined,
    resolvedAt: string,
    accuracyM = place.accuracyM ?? null,
  ): ResolvedAddressPayload {
    return {
      address: place.address,
      normalizedAddress: place.normalizedAddress ?? null,
      lat: place.location.lat,
      lng: place.location.lng,
      placeId: place.placeId ?? null,
      providerCandidateId: place.providerCandidateId ?? null,
      geocodeProvider: this.providerId,
      geocodeConfidence:
        coordinateSource === "provider_candidate"
          ? place.confidence
          : this.reverseConfidence(accuracyM ?? 1000),
      coordinateSource,
      coordinateAccuracyM: accuracyM,
      selectedByActorId: actorId ?? null,
      selectedAt: resolvedAt,
      pinnedByActorId: actorId ?? null,
      pinnedAt: resolvedAt,
      surface,
      resolvedAt,
    };
  }

  private scorePlace(place: MockPlace, query: string, near?: GeoPoint | null) {
    const haystack = [
      place.candidateId,
      place.displayName,
      place.address,
      place.normalizedAddress,
      place.district,
      place.locality,
      ...place.keywords,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    let score = haystack.includes(query) ? 10 : 0;
    for (const token of query.split(/\s+/).filter(Boolean)) {
      if (haystack.includes(token)) {
        score += 2;
      }
    }
    if (near && score > 0) {
      const distanceKm = this.distanceMeters(place.location, near) / 1000;
      score += Math.max(0, 3 - distanceKm / 10);
    }
    return score;
  }

  private throwIfUnavailable(value?: string | null) {
    if (value?.trim() === PROVIDER_UNAVAILABLE_SENTINEL) {
      throw new GeoProviderError(
        503,
        "GEO_PROVIDER_UNAVAILABLE",
        "Mock geocode provider is unavailable.",
        { provider: this.providerId },
        true,
      );
    }
  }

  private distanceMeters(from: GeoPoint, to: GeoPoint) {
    const fromLat = this.toRadians(from.lat);
    const toLat = this.toRadians(to.lat);
    const deltaLat = this.toRadians(to.lat - from.lat);
    const deltaLng = this.toRadians(to.lng - from.lng);
    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(fromLat) *
        Math.cos(toLat) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }
}
