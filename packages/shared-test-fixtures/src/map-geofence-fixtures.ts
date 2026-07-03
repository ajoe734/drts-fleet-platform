import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  EvaluateServiceAreaCommand,
  GeoPoint,
  GeoProviderHealthResponse,
  GeoResolveResponse,
  GeoResolutionSurface,
  GeoReverseResponse,
  GeoSearchResponse,
  GeocodeCandidate,
  ResolveAddressCommand,
  ResolvedAddressPayload,
  ReverseGeocodeCommand,
  SearchGeoQuery,
  ServiceAreaBoundaryRecord,
  ServiceAreaDefinitionsResponse,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
  ServiceAreaGeoJsonFeature,
  ServiceAreaGeoJsonResponse,
  ServiceAreaGeometry,
  ServiceAreaStopEvaluation,
  ServiceProductType,
  StopPolicyDirection,
  StopPolicyRecord,
} from "../../contracts/src";
import { SERVICE_PRODUCT_TYPES } from "../../contracts/src";

const EARTH_RADIUS_M = 6_371_000;
const DEFAULT_TIMESTAMP = "2026-07-01T10:20:00.000Z";
const DEFAULT_REQUEST_ID_PREFIX = "req-map-geofence";
const DEFAULT_TRACE_ID_PREFIX = "trace-map-geofence";
const PROVIDER_ID = "mock";
const PROVIDER_UNAVAILABLE_SENTINEL = "__provider_unavailable__";
const DEFAULT_REVERSE_MATCH_RADIUS_M = 1_000;
const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_DROP_OFF_POINT: GeoPoint = {
  lat: 25.06,
  lng: 121.58,
};

export const MAP_GEOFENCE_FIXTURE_KEYS = [
  "taipei-core",
  "taoyuan-airport",
  "taipei-station-no-pickup",
  "manual-review-zone",
  "provider-unavailable",
  "no-geocode",
] as const;

export type MapGeofenceFixtureKey = (typeof MAP_GEOFENCE_FIXTURE_KEYS)[number];

export type MapGeofenceFixtureState =
  | "serviceable"
  | "not_serviceable"
  | "no_pickup"
  | "manual_review"
  | "provider_unavailable"
  | "no_geocode";

export interface MapGeofenceEvaluationExpectation {
  key: string;
  serviceProductType: ServiceProductType;
  dropoff?: GeoPoint | null;
  expectedDecision: ServiceAreaEvaluationDecision;
  expectedReasonCodes: string[];
  expectedReasonMessages: string[];
  expectedServiceAreaCodes: string[];
  expectedGeometryVersionRefs: string[];
}

export interface MapGeofenceFixture {
  key: MapGeofenceFixtureKey;
  state: MapGeofenceFixtureState;
  label: string;
  description: string;
  searchQuery: string;
  aliases: string[];
  addressText: string;
  reverseProbeLocation?: GeoPoint | null;
  candidate: GeocodeCandidate | null;
  evaluationExpectations: MapGeofenceEvaluationExpectation[];
}

type MapGeofenceFixtureDefinition = MapGeofenceFixture & {
  keywords: string[];
};

const MAP_GEOFENCE_SERVICE_AREA_SEEDS: readonly ServiceAreaBoundaryRecord[] = [
  {
    serviceAreaId: "11111111-1111-4111-8111-111111111111",
    areaCode: "TAIPEI_CORE",
    displayName: "Taipei core operating area",
    status: "active",
    geometry: {
      type: "polygon",
      coordinates: [
        { lat: 25.0005, lng: 121.4505 },
        { lat: 25.0005, lng: 121.625 },
        { lat: 25.125, lng: 121.625 },
        { lat: 25.125, lng: 121.4505 },
      ],
    },
    serviceProductTypes: [
      "taxi_realtime",
      "taxi_reservation",
      "enterprise_dispatch",
    ],
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    serviceAreaId: "22222222-2222-4222-8222-222222222222",
    areaCode: "TAOYUAN_AIRPORT",
    displayName: "Taoyuan airport transfer area",
    status: "active",
    geometry: {
      type: "circle",
      center: { lat: 25.0797, lng: 121.2342 },
      radiusMeters: 6_500,
    },
    serviceProductTypes: ["credit_card_airport_transfer"],
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
] as const;

const MAP_GEOFENCE_STOP_POLICY_SEEDS: readonly StopPolicyRecord[] = [
  {
    stopPolicyId: "33333333-3333-4333-8333-333333333333",
    policyCode: "TPE_STATION_PICKUP_BLOCK",
    displayName: "Taipei station pickup curb restriction",
    status: "active",
    direction: "pickup",
    effect: "deny",
    geometry: {
      type: "circle",
      center: { lat: 25.0478, lng: 121.517 },
      radiusMeters: 220,
    },
    serviceAreaCodes: ["TAIPEI_CORE"],
    serviceProductTypes: [
      "taxi_realtime",
      "taxi_reservation",
      "enterprise_dispatch",
    ],
    reasonCode: "PICKUP_NOT_ALLOWED",
    reasonMessage: "Pickup is not allowed at this curb zone.",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    stopPolicyId: "44444444-4444-4444-8444-444444444444",
    policyCode: "XINYI_HOSPITAL_MANUAL_REVIEW",
    displayName: "Xinyi hospital access manual review",
    status: "active",
    direction: "both",
    effect: "manual_review",
    geometry: {
      type: "circle",
      center: { lat: 25.0338, lng: 121.5645 },
      radiusMeters: 180,
    },
    serviceAreaCodes: ["TAIPEI_CORE"],
    serviceProductTypes: ["taxi_realtime", "taxi_reservation"],
    reasonCode: "STOP_REQUIRES_MANUAL_REVIEW",
    reasonMessage: "This stop requires ops review before dispatch.",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    effectiveUntil: null,
    version: 1,
    metadata: { source: "seed" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
] as const;

const MAP_GEOFENCE_FIXTURE_DEFINITIONS: readonly MapGeofenceFixtureDefinition[] =
  [
    {
      key: "taipei-core",
      state: "serviceable",
      label: "Taipei core serviceable",
      description:
        "Taipei City Hall fixture resolves inside TAIPEI_CORE without stop restrictions.",
      searchQuery: "台北市政府",
      aliases: [
        "台北市政府",
        "臺北市政府",
        "taipei city hall",
        "taipei cityhall",
      ],
      addressText: "台北市信義區市府路1號",
      reverseProbeLocation: { lat: 25.0376, lng: 121.5636 },
      keywords: [
        "taipei",
        "city",
        "hall",
        "台北",
        "臺北",
        "市政府",
        "台北市政府",
        "臺北市政府",
        "市府路",
      ],
      candidate: {
        candidateId: "mock-taipei-city-hall",
        provider: PROVIDER_ID,
        providerCandidateId: "mock:place:taipei-city-hall",
        placeId: "mock-place-taipei-city-hall",
        displayName: "Taipei City Hall",
        address: "台北市信義區市府路1號",
        normalizedAddress: "臺北市信義區市府路1號",
        district: "信義區",
        locality: "臺北市",
        countryCode: "TW",
        location: { lat: 25.0375, lng: 121.5637 },
        confidence: "exact",
        accuracyM: 20,
        metadata: {
          fixture: true,
          fixtureKey: "taipei-core",
          fixtureState: "serviceable",
          serviceArea: "TAIPEI_CORE",
        },
      },
      evaluationExpectations: [
        {
          key: "taxi-realtime-serviceable",
          serviceProductType: "taxi_realtime",
          dropoff: DEFAULT_DROP_OFF_POINT,
          expectedDecision: "serviceable",
          expectedReasonCodes: [],
          expectedReasonMessages: [],
          expectedServiceAreaCodes: ["TAIPEI_CORE"],
          expectedGeometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
        },
      ],
    },
    {
      key: "taoyuan-airport",
      state: "serviceable",
      label: "Taoyuan airport",
      description:
        "Taoyuan Airport Terminal 1 fixture is serviceable only for airport-transfer products.",
      searchQuery: "桃園機場第一航廈",
      aliases: [
        "桃園機場第一航廈",
        "桃園機場",
        "taoyuan airport",
        "taoyuan airport terminal 1",
        "taoyuan airport t1",
      ],
      addressText: "桃園市大園區航站南路9號",
      reverseProbeLocation: { lat: 25.0798, lng: 121.2341 },
      keywords: [
        "taoyuan",
        "airport",
        "terminal",
        "桃園",
        "機場",
        "航站",
      ],
      candidate: {
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
        metadata: {
          fixture: true,
          fixtureKey: "taoyuan-airport",
          fixtureState: "serviceable",
          serviceArea: "TAOYUAN_AIRPORT",
        },
      },
      evaluationExpectations: [
        {
          key: "airport-transfer-serviceable",
          serviceProductType: "credit_card_airport_transfer",
          expectedDecision: "serviceable",
          expectedReasonCodes: [],
          expectedReasonMessages: [],
          expectedServiceAreaCodes: ["TAOYUAN_AIRPORT"],
          expectedGeometryVersionRefs: ["service_area:TAOYUAN_AIRPORT@1"],
        },
        {
          key: "taxi-realtime-not-serviceable",
          serviceProductType: "taxi_realtime",
          expectedDecision: "not_serviceable",
          expectedReasonCodes: ["PICKUP_AREA_NOT_SERVICEABLE"],
          expectedReasonMessages: ["pickup is outside the service area."],
          expectedServiceAreaCodes: [],
          expectedGeometryVersionRefs: [],
        },
      ],
    },
    {
      key: "taipei-station-no-pickup",
      state: "no_pickup",
      label: "Taipei Station no-pickup",
      description:
        "Taipei Station fixture hits the pickup deny stop policy inside TAIPEI_CORE.",
      searchQuery: "台北車站",
      aliases: ["台北車站", "臺北車站", "taipei station"],
      addressText: "台北市中正區北平西路3號",
      reverseProbeLocation: { lat: 25.0477, lng: 121.517 },
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
      candidate: {
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
        metadata: {
          fixture: true,
          fixtureKey: "taipei-station-no-pickup",
          fixtureState: "no_pickup",
          serviceArea: "TAIPEI_CORE",
          stopPolicy: "TPE_STATION_PICKUP_BLOCK",
        },
      },
      evaluationExpectations: [
        {
          key: "taxi-realtime-no-pickup",
          serviceProductType: "taxi_realtime",
          dropoff: DEFAULT_DROP_OFF_POINT,
          expectedDecision: "not_serviceable",
          expectedReasonCodes: ["PICKUP_NOT_ALLOWED"],
          expectedReasonMessages: ["Pickup is not allowed at this curb zone."],
          expectedServiceAreaCodes: ["TAIPEI_CORE"],
          expectedGeometryVersionRefs: [
            "service_area:TAIPEI_CORE@1",
            "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
          ],
        },
      ],
    },
    {
      key: "manual-review-zone",
      state: "manual_review",
      label: "Manual-review zone",
      description:
        "Xinyi Hospital Access fixture requires manual review before dispatch.",
      searchQuery: "吳興街252號",
      aliases: [
        "吳興街252號",
        "xinyi hospital access",
        "xinyi hospital",
        "信義醫院",
      ],
      addressText: "台北市信義區吳興街252號",
      reverseProbeLocation: { lat: 25.0339, lng: 121.5644 },
      keywords: ["xinyi", "hospital", "信義", "醫院", "吳興街"],
      candidate: {
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
        metadata: {
          fixture: true,
          fixtureKey: "manual-review-zone",
          fixtureState: "manual_review",
          serviceArea: "TAIPEI_CORE",
          stopPolicy: "XINYI_HOSPITAL_MANUAL_REVIEW",
        },
      },
      evaluationExpectations: [
        {
          key: "taxi-realtime-manual-review",
          serviceProductType: "taxi_realtime",
          dropoff: DEFAULT_DROP_OFF_POINT,
          expectedDecision: "manual_review",
          expectedReasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
          expectedReasonMessages: [
            "This stop requires ops review before dispatch.",
          ],
          expectedServiceAreaCodes: ["TAIPEI_CORE"],
          expectedGeometryVersionRefs: [
            "service_area:TAIPEI_CORE@1",
            "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
          ],
        },
      ],
    },
    {
      key: "provider-unavailable",
      state: "provider_unavailable",
      label: "Provider unavailable",
      description: "Sentinel fixture that forces GEO_PROVIDER_UNAVAILABLE.",
      searchQuery: PROVIDER_UNAVAILABLE_SENTINEL,
      aliases: [PROVIDER_UNAVAILABLE_SENTINEL, "provider unavailable"],
      addressText: PROVIDER_UNAVAILABLE_SENTINEL,
      reverseProbeLocation: null,
      keywords: ["provider unavailable", PROVIDER_UNAVAILABLE_SENTINEL],
      candidate: null,
      evaluationExpectations: [],
    },
    {
      key: "no-geocode",
      state: "no_geocode",
      label: "No geocode",
      description: "Canonical query with zero deterministic candidates.",
      searchQuery: "火星基地",
      aliases: ["火星基地", "no geocode", "unknown address"],
      addressText: "火星基地",
      reverseProbeLocation: null,
      keywords: ["火星基地", "no geocode", "unknown address"],
      candidate: null,
      evaluationExpectations: [],
    },
  ] as const;

const CANDIDATE_FIXTURES = MAP_GEOFENCE_FIXTURE_DEFINITIONS.filter(
  (fixture) => fixture.candidate !== null,
);

export class MapGeofenceFixtureError extends Error {
  constructor(
    readonly statusCode: number,
    readonly envelope: ApiErrorEnvelope,
  ) {
    super(envelope.error.message);
    this.name = "MapGeofenceFixtureError";
  }
}

export function listMapGeofenceFixtures(): MapGeofenceFixture[] {
  return MAP_GEOFENCE_FIXTURE_DEFINITIONS.map(cloneFixture);
}

export function getMapGeofenceFixture(
  key: MapGeofenceFixtureKey,
): MapGeofenceFixture {
  const fixture = MAP_GEOFENCE_FIXTURE_DEFINITIONS.find(
    (candidate) => candidate.key === key,
  );
  if (!fixture) {
    throw new Error(`Unknown map geofence fixture key: ${key}`);
  }
  return cloneFixture(fixture);
}

export function isMapGeofenceProviderUnavailableValue(value?: string | null) {
  return normalizeText(value) === PROVIDER_UNAVAILABLE_SENTINEL;
}

export function findMapGeofenceFixtureByCandidateId(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const fixture = CANDIDATE_FIXTURES.find(
    (candidate) => candidate.candidate?.candidateId === normalized,
  );
  return fixture ? cloneFixture(fixture) : null;
}

export function findMapGeofenceFixtureByProviderCandidateId(
  value?: string | null,
) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const fixture = CANDIDATE_FIXTURES.find(
    (candidate) => candidate.candidate?.providerCandidateId === normalized,
  );
  return fixture ? cloneFixture(fixture) : null;
}

export function findMapGeofenceFixtureByPlaceId(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const fixture = CANDIDATE_FIXTURES.find(
    (candidate) => candidate.candidate?.placeId === normalized,
  );
  return fixture ? cloneFixture(fixture) : null;
}

export function findMapGeofenceFixtureByAddressText(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  const fixture = MAP_GEOFENCE_FIXTURE_DEFINITIONS.find((candidate) =>
    fixtureMatchesText(candidate, normalized),
  );
  return fixture ? cloneFixture(fixture) : null;
}

export function findMapGeofenceFixtureByPoint(
  point?: GeoPoint | null,
  maxDistanceMeters = 350,
) {
  if (!point) {
    return null;
  }
  const nearest = nearestFixture(point);
  if (!nearest || nearest.distanceMeters > maxDistanceMeters) {
    return null;
  }
  return cloneFixture(nearest.fixture);
}

export function buildMapGeofenceGeoHealthResponse(): GeoProviderHealthResponse {
  return {
    provider: PROVIDER_ID,
    mode: "mock",
    status: "healthy",
    environment: "test",
    generatedAt: DEFAULT_TIMESTAMP,
    failClosed: false,
    mockAllowed: true,
    requiredSecretNames: [],
    missingSecretNames: [],
    quota: {
      dailyLimit: null,
      minuteLimit: null,
      warningThresholdPercent: 80,
      criticalThresholdPercent: 95,
      policy: "mock_unlimited",
    },
    keyRestrictions: {
      browserAllowedOrigins: ["http://map-geofence-harness.local"],
      mobileBundleIds: [],
      mobilePackageNames: [],
      serverKeyConfigured: false,
      browserKeyConfigured: false,
    },
    checks: [
      {
        name: "provider_mode",
        status: "pass",
        message: "Mock geo provider is enabled for offline harness tests.",
      },
    ],
  };
}

export function buildMapGeofenceGeoHealthEnvelope(requestId?: string) {
  return buildSuccessEnvelope(
    buildMapGeofenceGeoHealthResponse(),
    requestId ?? requestIdFor("geo-health"),
  );
}

export function searchMapGeofenceCandidates(
  command: SearchGeoQuery,
): GeoSearchResponse {
  const query = command.q.trim();
  if (!query) {
    throw validationError(
      400,
      "VALIDATION_ERROR",
      "q is required.",
      { field: "q" },
    );
  }
  if (isMapGeofenceProviderUnavailableValue(query)) {
    throw providerUnavailableError();
  }
  const limit = command.limit ?? DEFAULT_SEARCH_LIMIT;
  const normalizedQuery = normalizeText(query);
  const candidates = CANDIDATE_FIXTURES.map((fixture) => ({
    fixture,
    score: scoreFixtureSearch(
      fixture,
      normalizedQuery,
      command.near ?? null,
    ),
  }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ fixture }) => cloneValue(fixture.candidate!));

  return {
    candidates,
    provider: PROVIDER_ID,
    generatedAt: DEFAULT_TIMESTAMP,
  };
}

export function buildMapGeofenceSearchEnvelope(
  command: SearchGeoQuery,
  requestId?: string,
) {
  return buildSuccessEnvelope(
    searchMapGeofenceCandidates(command),
    requestId ?? requestIdFor("geo-search"),
  );
}

export function resolveMapGeofenceAddress(
  command: ResolveAddressCommand,
): GeoResolveResponse {
  if (isMapGeofenceProviderUnavailableValue(firstDefinedValue(command))) {
    throw providerUnavailableError();
  }
  if (!command.addressText.trim()) {
    throw validationError(
      400,
      "VALIDATION_ERROR",
      "addressText is required.",
      { field: "addressText" },
    );
  }
  if (command.selectedPoint) {
    return {
      address: buildManualPinAddress(command, DEFAULT_TIMESTAMP),
      candidate: null,
      provider: PROVIDER_ID,
      resolvedAt: DEFAULT_TIMESTAMP,
    };
  }

  const fixture =
    findDefinitionByCandidateId(command.candidateId) ??
    findDefinitionByProviderCandidateId(command.providerCandidateId) ??
    findDefinitionByPlaceId(command.placeId) ??
    findDefinitionByAddressText(command.addressText);

  if (!fixture?.candidate) {
    throw candidateNotFoundError(command);
  }

  return {
    address: buildResolvedAddressFromCandidate(
      fixture.candidate,
      command.surface,
      command.selectedByActorId ?? null,
      DEFAULT_TIMESTAMP,
    ),
    candidate: cloneValue(fixture.candidate),
    provider: PROVIDER_ID,
    resolvedAt: DEFAULT_TIMESTAMP,
  };
}

export function buildMapGeofenceResolveEnvelope(
  command: ResolveAddressCommand,
  requestId?: string,
) {
  return buildSuccessEnvelope(
    resolveMapGeofenceAddress(command),
    requestId ?? requestIdFor("geo-resolve"),
  );
}

export function reverseMapGeofenceLocation(
  command: ReverseGeocodeCommand,
): GeoReverseResponse {
  if (
    isMapGeofenceProviderUnavailableValue(
      command.requestedByActorId === PROVIDER_UNAVAILABLE_SENTINEL
        ? PROVIDER_UNAVAILABLE_SENTINEL
        : null,
    )
  ) {
    throw providerUnavailableError();
  }
  const location = normalizePoint(command.location, "location");
  const nearest = nearestFixture(location);
  if (nearest && nearest.fixture.candidate) {
    return {
      address: buildResolvedAddressFromCandidate(
        nearest.fixture.candidate,
        command.surface,
        command.requestedByActorId ?? null,
        DEFAULT_TIMESTAMP,
        nearest.distanceMeters,
      ),
      provider: PROVIDER_ID,
      resolvedAt: DEFAULT_TIMESTAMP,
    };
  }

  return {
    address: {
      address: `Mock reverse geocode ${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
      normalizedAddress: null,
      lat: location.lat,
      lng: location.lng,
      geocodeProvider: PROVIDER_ID,
      geocodeConfidence: "approximate",
      coordinateSource: "reverse_geocode",
      coordinateAccuracyM: null,
      selectedByActorId: command.requestedByActorId ?? null,
      selectedAt: DEFAULT_TIMESTAMP,
      surface: command.surface,
      resolvedAt: DEFAULT_TIMESTAMP,
      coordinateProvenance: {
        coordinateSource: "reverse_geocode",
        geocodeProvider: PROVIDER_ID,
        geocodeConfidence: "approximate",
        selectedByActorId: command.requestedByActorId ?? null,
        selectedAt: DEFAULT_TIMESTAMP,
        surface: command.surface,
      },
    },
    provider: PROVIDER_ID,
    resolvedAt: DEFAULT_TIMESTAMP,
  };
}

export function buildMapGeofenceReverseEnvelope(
  command: ReverseGeocodeCommand,
  requestId?: string,
) {
  return buildSuccessEnvelope(
    reverseMapGeofenceLocation(command),
    requestId ?? requestIdFor("geo-reverse"),
  );
}

export function evaluateMapGeofenceServiceArea(
  command: EvaluateServiceAreaCommand,
): ServiceAreaEvaluationResult {
  const serviceProductType = normalizeServiceProductType(
    command.serviceProductType,
  );
  const stops: Array<{ kind: "pickup" | "dropoff"; location: GeoPoint }> = [
    {
      kind: "pickup",
      location: normalizePoint(command.pickup, "pickup"),
    },
  ];
  if (command.dropoff) {
    stops.push({
      kind: "dropoff",
      location: normalizePoint(command.dropoff, "dropoff"),
    });
  }

  const requestedAt = normalizeRequestedAt(command.requestedAt);
  const activeAreas = MAP_GEOFENCE_SERVICE_AREA_SEEDS.filter(
    (area) =>
      area.status === "active" &&
      recordIsEffective(area.effectiveFrom, area.effectiveUntil, requestedAt) &&
      serviceProductApplies(area.serviceProductTypes, serviceProductType),
  );
  const activePolicies = MAP_GEOFENCE_STOP_POLICY_SEEDS.filter(
    (policy) =>
      policy.status === "active" &&
      recordIsEffective(
        policy.effectiveFrom,
        policy.effectiveUntil,
        requestedAt,
      ) &&
      serviceProductApplies(policy.serviceProductTypes, serviceProductType),
  );
  const evaluatedStops = stops.map((stop) =>
    evaluateStop(stop, activeAreas, activePolicies),
  );
  return {
    decision: resolveOverallDecision(
      evaluatedStops.map((stop) => stop.decision),
    ),
    serviceProductType,
    evaluatedAt: DEFAULT_TIMESTAMP,
    stops: evaluatedStops,
    serviceAreaCodes: unique(
      evaluatedStops.flatMap((stop) => stop.serviceAreaCodes),
    ),
    geometryVersionRefs: unique(
      evaluatedStops.flatMap((stop) => stop.geometryVersionRefs),
    ),
    reasonCodes: unique(evaluatedStops.flatMap((stop) => stop.reasonCodes)),
    reasonMessages: unique(
      evaluatedStops.flatMap((stop) => stop.reasonMessages),
    ),
  };
}

export function buildMapGeofenceServiceAreaEnvelope(
  command: EvaluateServiceAreaCommand,
  requestId?: string,
) {
  return buildSuccessEnvelope(
    evaluateMapGeofenceServiceArea(command),
    requestId ?? requestIdFor("service-area-evaluate"),
  );
}

export function buildMapGeofenceServiceAreaDefinitionsResponse(): ServiceAreaDefinitionsResponse {
  return {
    serviceAreas: MAP_GEOFENCE_SERVICE_AREA_SEEDS.map(cloneValue),
    stopPolicies: MAP_GEOFENCE_STOP_POLICY_SEEDS.map(cloneValue),
    generatedAt: DEFAULT_TIMESTAMP,
  };
}

export function buildMapGeofenceServiceAreaDefinitionsEnvelope(
  requestId?: string,
) {
  return buildSuccessEnvelope(
    buildMapGeofenceServiceAreaDefinitionsResponse(),
    requestId ?? requestIdFor("service-area-definitions"),
  );
}

export function buildMapGeofenceServiceAreaGeoJsonResponse(): ServiceAreaGeoJsonResponse {
  const serviceAreaFeatures =
    MAP_GEOFENCE_SERVICE_AREA_SEEDS.map<ServiceAreaGeoJsonFeature>((record) => ({
      type: "Feature",
      id: record.serviceAreaId,
      geometry: geometryToGeoJson(record.geometry),
      properties: {
        recordKind: "service_area",
        serviceAreaId: record.serviceAreaId,
        areaCode: record.areaCode,
        displayName: record.displayName,
        status: record.status,
        sourceGeometry: cloneValue(record.geometry),
        serviceProductTypes: [...record.serviceProductTypes],
        effectiveFrom: record.effectiveFrom,
        effectiveUntil: record.effectiveUntil,
        version: record.version,
        geometryVersionRef: geometryVersionRef(
          "service_area",
          record.areaCode,
          record.version,
        ),
        metadata: cloneValue(record.metadata ?? {}),
      },
    }));

  const stopPolicyFeatures =
    MAP_GEOFENCE_STOP_POLICY_SEEDS.map<ServiceAreaGeoJsonFeature>(
      (record) => ({
        type: "Feature",
        id: record.stopPolicyId,
        geometry: geometryToGeoJson(record.geometry),
        properties: {
          recordKind: "stop_policy",
          stopPolicyId: record.stopPolicyId,
          policyCode: record.policyCode,
          displayName: record.displayName,
          status: record.status,
          direction: record.direction,
          effect: record.effect,
          sourceGeometry: cloneValue(record.geometry),
          serviceAreaCodes: [...record.serviceAreaCodes],
          serviceProductTypes: [...record.serviceProductTypes],
          reasonCode: record.reasonCode,
          reasonMessage: record.reasonMessage,
          effectiveFrom: record.effectiveFrom,
          effectiveUntil: record.effectiveUntil,
          version: record.version,
          geometryVersionRef: geometryVersionRef(
            "stop_policy",
            record.policyCode,
            record.version,
          ),
          metadata: cloneValue(record.metadata ?? {}),
        },
      }),
    );

  return {
    type: "FeatureCollection",
    features: [...serviceAreaFeatures, ...stopPolicyFeatures],
    generatedAt: DEFAULT_TIMESTAMP,
  };
}

export function buildMapGeofenceServiceAreaGeoJsonEnvelope(
  requestId?: string,
) {
  return buildSuccessEnvelope(
    buildMapGeofenceServiceAreaGeoJsonResponse(),
    requestId ?? requestIdFor("service-area-geojson"),
  );
}

export function buildMapGeofenceErrorEnvelope(
  code: string,
  message: string,
  details?: Record<string, unknown>,
  retryable = false,
  traceId = `${DEFAULT_TRACE_ID_PREFIX}:${code.toLowerCase()}`,
): ApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      retryable,
      traceId,
      ...(details ? { details } : {}),
    },
  };
}

function cloneFixture(definition: MapGeofenceFixtureDefinition): MapGeofenceFixture {
  return cloneValue({
    key: definition.key,
    state: definition.state,
    label: definition.label,
    description: definition.description,
    searchQuery: definition.searchQuery,
    aliases: definition.aliases,
    addressText: definition.addressText,
    reverseProbeLocation: definition.reverseProbeLocation ?? null,
    candidate: definition.candidate,
    evaluationExpectations: definition.evaluationExpectations,
  });
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requestIdFor(operation: string) {
  return `${DEFAULT_REQUEST_ID_PREFIX}:${operation}`;
}

function buildSuccessEnvelope<T>(
  data: T,
  requestId: string,
): ApiSuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId,
      timestamp: DEFAULT_TIMESTAMP,
    },
  };
}

function normalizeText(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function fixtureMatchesText(
  fixture: MapGeofenceFixtureDefinition,
  normalizedValue: string,
) {
  if (!normalizedValue) {
    return false;
  }
  if (normalizeText(fixture.searchQuery) === normalizedValue) {
    return true;
  }
  if (normalizeText(fixture.addressText) === normalizedValue) {
    return true;
  }
  if (
    fixture.aliases.some((alias) => normalizeText(alias) === normalizedValue)
  ) {
    return true;
  }
  if (
    fixture.candidate &&
    [
      fixture.candidate.displayName,
      fixture.candidate.address,
      fixture.candidate.normalizedAddress,
    ].some((value) => normalizeText(value) === normalizedValue)
  ) {
    return true;
  }
  return false;
}

function scoreFixtureSearch(
  fixture: MapGeofenceFixtureDefinition,
  normalizedQuery: string,
  near?: GeoPoint | null,
) {
  if (!fixture.candidate) {
    return 0;
  }
  let score = 0;
  const searchableValues = [
    fixture.searchQuery,
    fixture.addressText,
    fixture.candidate.displayName,
    fixture.candidate.address,
    fixture.candidate.normalizedAddress ?? "",
    ...fixture.aliases,
    ...fixture.keywords,
  ].map(normalizeText);
  for (const value of searchableValues) {
    if (!value) {
      continue;
    }
    if (value === normalizedQuery) {
      score += 8;
      continue;
    }
    if (value.includes(normalizedQuery) || normalizedQuery.includes(value)) {
      score += 3;
    }
  }
  if (near && fixture.candidate.location && score > 0) {
    const distanceKm = distanceMeters(fixture.candidate.location, near) / 1000;
    score += Math.max(0, 3 - distanceKm / 10);
  }
  return score;
}

function firstDefinedValue(command: ResolveAddressCommand) {
  return (
    command.candidateId ??
    command.providerCandidateId ??
    command.placeId ??
    command.addressText
  );
}

function providerUnavailableError() {
  return new MapGeofenceFixtureError(
    503,
    buildMapGeofenceErrorEnvelope(
      "GEO_PROVIDER_UNAVAILABLE",
      "Mock geocode provider is unavailable.",
      { provider: PROVIDER_ID },
      true,
    ),
  );
}

function candidateNotFoundError(command: ResolveAddressCommand) {
  return new MapGeofenceFixtureError(
    404,
    buildMapGeofenceErrorEnvelope(
      "GEO_CANDIDATE_NOT_FOUND",
      "No mock geocode candidate matched the resolve command.",
      {
        candidateId: command.candidateId ?? null,
        providerCandidateId: command.providerCandidateId ?? null,
        placeId: command.placeId ?? null,
      },
    ),
  );
}

function validationError(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return new MapGeofenceFixtureError(
    statusCode,
    buildMapGeofenceErrorEnvelope(code, message, details),
  );
}

function buildManualPinAddress(
  command: ResolveAddressCommand,
  resolvedAt: string,
): ResolvedAddressPayload {
  const point = normalizePoint(command.selectedPoint, "selectedPoint");
  return {
    address: command.addressText.trim(),
    normalizedAddress: command.addressText.trim(),
    lat: point.lat,
    lng: point.lng,
    geocodeProvider: PROVIDER_ID,
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
    coordinateProvenance: {
      coordinateSource: "manual_pin",
      geocodeProvider: PROVIDER_ID,
      geocodeConfidence: "manual",
      selectedByActorId: command.selectedByActorId ?? null,
      selectedAt: resolvedAt,
      pinnedByActorId: command.selectedByActorId ?? null,
      pinnedAt: resolvedAt,
      manualOverrideReason: command.manualOverrideReason ?? null,
      surface: command.surface,
    },
  };
}

function buildResolvedAddressFromCandidate(
  candidate: GeocodeCandidate,
  surface: GeoResolutionSurface,
  actorId: string | null,
  resolvedAt: string,
  distanceMetersFromProbe?: number,
): ResolvedAddressPayload {
  const accuracyM =
    distanceMetersFromProbe !== undefined
      ? Math.round(distanceMetersFromProbe)
      : (candidate.accuracyM ?? null);
  return {
    address: candidate.address,
    normalizedAddress: candidate.normalizedAddress ?? candidate.address,
    lat: candidate.location?.lat ?? 0,
    lng: candidate.location?.lng ?? 0,
    placeId: candidate.placeId ?? null,
    geocodeProvider: candidate.provider,
    geocodeConfidence: candidate.confidence,
    coordinateSource: distanceMetersFromProbe
      ? "reverse_geocode"
      : "provider_candidate",
    coordinateAccuracyM: accuracyM,
    providerCandidateId: candidate.providerCandidateId ?? null,
    selectedByActorId: actorId,
    selectedAt: resolvedAt,
    pinnedByActorId: actorId,
    pinnedAt: resolvedAt,
    surface,
    resolvedAt,
    coordinateProvenance: {
      coordinateSource: distanceMetersFromProbe
        ? "reverse_geocode"
        : "provider_candidate",
      geocodeProvider: candidate.provider,
      geocodeConfidence: candidate.confidence,
      providerCandidateId: candidate.providerCandidateId ?? null,
      placeId: candidate.placeId ?? null,
      coordinateAccuracyM: accuracyM,
      selectedByActorId: actorId,
      selectedAt: resolvedAt,
      pinnedByActorId: actorId,
      pinnedAt: resolvedAt,
      surface,
    },
  };
}

function nearestFixture(point: GeoPoint) {
  const nearest = CANDIDATE_FIXTURES.map((fixture) => ({
    fixture,
    distanceMeters: distanceMeters(fixture.candidate!.location!, point),
  })).sort((left, right) => left.distanceMeters - right.distanceMeters)[0];

  if (!nearest || nearest.distanceMeters > DEFAULT_REVERSE_MATCH_RADIUS_M) {
    return null;
  }
  return nearest;
}

function normalizePoint(point: GeoPoint | null | undefined, field: string) {
  if (!point || typeof point !== "object") {
    throw validationError(
      400,
      "VALIDATION_ERROR",
      `${field} is required.`,
      { field },
    );
  }
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw validationError(
      400,
      "INVALID_COORDINATE",
      `${field}.lat must be between -90 and 90.`,
      { field: `${field}.lat` },
    );
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw validationError(
      400,
      "INVALID_COORDINATE",
      `${field}.lng must be between -180 and 180.`,
      { field: `${field}.lng` },
    );
  }
  return { lat, lng };
}

function normalizeServiceProductType(value: ServiceProductType) {
  if (!SERVICE_PRODUCT_TYPES.includes(value)) {
    throw validationError(
      400,
      "VALIDATION_ERROR",
      "serviceProductType is unsupported.",
      { field: "serviceProductType", value },
    );
  }
  return value;
}

function normalizeRequestedAt(value?: string | null) {
  if (!value) {
    return new Date(DEFAULT_TIMESTAMP);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(
      400,
      "VALIDATION_ERROR",
      "requestedAt must be an ISO timestamp.",
      { field: "requestedAt" },
    );
  }
  return parsed;
}

function serviceProductApplies(
  serviceProductTypes: readonly ServiceProductType[],
  value: ServiceProductType,
) {
  return (
    serviceProductTypes.length === 0 || serviceProductTypes.includes(value)
  );
}

function recordIsEffective(
  effectiveFrom: string,
  effectiveUntil: string | null,
  requestedAt: Date,
) {
  const from = Date.parse(effectiveFrom);
  const until = effectiveUntil ? Date.parse(effectiveUntil) : null;
  if (Number.isNaN(from) || (until !== null && Number.isNaN(until))) {
    return false;
  }
  const requestedMs = requestedAt.getTime();
  return requestedMs >= from && (until === null || requestedMs < until);
}

function evaluateStop(
  stop: { kind: "pickup" | "dropoff"; location: GeoPoint },
  activeAreas: readonly ServiceAreaBoundaryRecord[],
  activePolicies: readonly StopPolicyRecord[],
): ServiceAreaStopEvaluation {
  const matchedAreas = activeAreas.filter((area) =>
    geometryContainsPoint(area.geometry, stop.location),
  );
  const serviceAreaCodes = matchedAreas.map((area) => area.areaCode);
  const reasonCodes: string[] = [];
  const reasonMessages: string[] = [];
  const geometryVersionRefs = matchedAreas.map((area) =>
    geometryVersionRef("service_area", area.areaCode, area.version),
  );
  let decision: ServiceAreaEvaluationDecision = "serviceable";

  if (matchedAreas.length === 0) {
    decision = "not_serviceable";
    reasonCodes.push(`${stop.kind.toUpperCase()}_AREA_NOT_SERVICEABLE`);
    reasonMessages.push(`${stop.kind} is outside the service area.`);
  }

  const policies = activePolicies.filter((policy) => {
    if (!directionApplies(policy.direction, stop.kind)) {
      return false;
    }
    if (
      policy.serviceAreaCodes.length > 0 &&
      !policy.serviceAreaCodes.some((areaCode) =>
        serviceAreaCodes.includes(areaCode),
      )
    ) {
      return false;
    }
    return geometryContainsPoint(policy.geometry, stop.location);
  });

  for (const policy of policies) {
    geometryVersionRefs.push(
      geometryVersionRef("stop_policy", policy.policyCode, policy.version),
    );
    if (policy.effect === "allow") {
      continue;
    }
    reasonCodes.push(policy.reasonCode);
    reasonMessages.push(policy.reasonMessage);
    if (policy.effect === "deny") {
      decision = "not_serviceable";
    } else if (decision === "serviceable") {
      decision = "manual_review";
    }
  }

  return {
    kind: stop.kind,
    location: stop.location,
    serviceAreaCodes,
    policyCodes: policies.map((policy) => policy.policyCode),
    geometryVersionRefs: unique(geometryVersionRefs),
    decision,
    reasonCodes: unique(reasonCodes),
    reasonMessages: unique(reasonMessages),
  };
}

function resolveOverallDecision(decisions: ServiceAreaEvaluationDecision[]) {
  if (decisions.includes("not_serviceable")) {
    return "not_serviceable";
  }
  if (decisions.includes("manual_review")) {
    return "manual_review";
  }
  return "serviceable";
}

function geometryContainsPoint(geometry: ServiceAreaGeometry, point: GeoPoint) {
  if (geometry.type === "circle") {
    return distanceMeters(geometry.center, point) <= geometry.radiusMeters;
  }
  return polygonContainsPoint(geometry.coordinates, point);
}

function polygonContainsPoint(points: GeoPoint[], point: GeoPoint) {
  if (points.length < 3) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const current = points[i]!;
    const previous = points[j]!;
    if (pointOnSegment(point, previous, current)) {
      return true;
    }
    const intersects =
      current.lng > point.lng !== previous.lng > point.lng &&
      point.lat <
        ((previous.lat - current.lat) * (point.lng - current.lng)) /
          (previous.lng - current.lng) +
          current.lat;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointOnSegment(point: GeoPoint, start: GeoPoint, end: GeoPoint) {
  const cross =
    (point.lng - start.lng) * (end.lat - start.lat) -
    (point.lat - start.lat) * (end.lng - start.lng);
  if (Math.abs(cross) > 1e-10) {
    return false;
  }
  const minLat = Math.min(start.lat, end.lat);
  const maxLat = Math.max(start.lat, end.lat);
  const minLng = Math.min(start.lng, end.lng);
  const maxLng = Math.max(start.lng, end.lng);
  return (
    point.lat >= minLat &&
    point.lat <= maxLat &&
    point.lng >= minLng &&
    point.lng <= maxLng
  );
}

function directionApplies(direction: StopPolicyDirection, stopKind: string) {
  return direction === "both" || direction === stopKind;
}

function geometryVersionRef(
  kind: "service_area" | "stop_policy",
  code: string,
  version: number,
) {
  return `${kind}:${code}@${version}`;
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}

function geometryToGeoJson(geometry: ServiceAreaGeometry) {
  if (geometry.type === "polygon") {
    return {
      type: "Polygon" as const,
      coordinates: [closeGeoJsonRing(geometry.coordinates)],
    };
  }
  return {
    type: "Polygon" as const,
    coordinates: [circleToGeoJsonRing(geometry.center, geometry.radiusMeters)],
  };
}

function closeGeoJsonRing(points: GeoPoint[]) {
  const ring = points.map((point) => [point.lng, point.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    ring.push([...first]);
  }
  return ring;
}

function circleToGeoJsonRing(center: GeoPoint, radiusMeters: number) {
  const segments = 48;
  const latRadius = radiusMeters / 111_320;
  const lngRadius =
    radiusMeters /
    (111_320 * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01));
  const ring: number[][] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (2 * Math.PI * index) / segments;
    ring.push([
      center.lng + lngRadius * Math.cos(angle),
      center.lat + latRadius * Math.sin(angle),
    ]);
  }
  ring.push([...ring[0]!]);
  return ring;
}

function distanceMeters(from: GeoPoint, to: GeoPoint) {
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function findDefinitionByCandidateId(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  return (
    MAP_GEOFENCE_FIXTURE_DEFINITIONS.find(
      (fixture) => fixture.candidate?.candidateId === normalized,
    ) ?? null
  );
}

function findDefinitionByProviderCandidateId(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  return (
    MAP_GEOFENCE_FIXTURE_DEFINITIONS.find(
      (fixture) => fixture.candidate?.providerCandidateId === normalized,
    ) ?? null
  );
}

function findDefinitionByPlaceId(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  return (
    MAP_GEOFENCE_FIXTURE_DEFINITIONS.find(
      (fixture) => fixture.candidate?.placeId === normalized,
    ) ?? null
  );
}

function findDefinitionByAddressText(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  return (
    MAP_GEOFENCE_FIXTURE_DEFINITIONS.find((fixture) =>
      fixtureMatchesText(fixture, normalized),
    ) ?? null
  );
}

export {
  DEFAULT_TIMESTAMP as MAP_GEOFENCE_FIXTURE_TIMESTAMP,
  MAP_GEOFENCE_SERVICE_AREA_SEEDS,
  MAP_GEOFENCE_STOP_POLICY_SEEDS,
  PROVIDER_ID as MAP_GEOFENCE_PROVIDER_ID,
  PROVIDER_UNAVAILABLE_SENTINEL as MAP_GEOFENCE_PROVIDER_UNAVAILABLE_SENTINEL,
};
