/**
 * Provider-neutral core for the shared AddressMapPicker.
 *
 * This module is intentionally React-free so its payload/provenance helpers,
 * status machine, and mock provider can be unit-tested in a plain Node
 * environment without pulling React into the root vitest run. The geo types are
 * mirrored locally (structurally identical to `@drts/contracts`) so `@drts/ui-web`
 * does not take a runtime dependency on the contracts package, matching the
 * `geometry-editor` precedent.
 */

// ── Mirrored geo contract types (structurally compatible with @drts/contracts) ──

export interface GeoPoint {
  lat: number;
  lng: number;
}

export const GEO_COORDINATE_SOURCES = [
  "provider_candidate",
  "manual_pin",
  "saved_address",
  "reverse_geocode",
  "external_platform",
  "legacy_text",
] as const;
export type GeoCoordinateSource = (typeof GEO_COORDINATE_SOURCES)[number];

export const GEO_GEOCODE_CONFIDENCE_LEVELS = [
  "exact",
  "interpolated",
  "approximate",
  "manual",
  "unknown",
] as const;
export type GeoGeocodeConfidence =
  (typeof GEO_GEOCODE_CONFIDENCE_LEVELS)[number];

export const GEO_RESOLUTION_SURFACES = [
  "api",
  "callcenter",
  "ops_console",
  "platform_admin",
  "tenant_console",
  "tenant_portal",
  "concierge_portal",
  "partner_booking",
  "passenger_entry",
  "driver_app",
  "unknown",
] as const;
export type GeoResolutionSurface = (typeof GEO_RESOLUTION_SURFACES)[number];

export interface GeoCoordinateProvenance {
  coordinateSource: GeoCoordinateSource;
  geocodeProvider?: string | null;
  geocodeConfidence?: GeoGeocodeConfidence | null;
  providerCandidateId?: string | null;
  placeId?: string | null;
  coordinateAccuracyM?: number | null;
  selectedByActorId?: string | null;
  selectedAt?: string | null;
  pinnedByActorId?: string | null;
  pinnedAt?: string | null;
  manualOverrideReason?: string | null;
  surface?: GeoResolutionSurface | null;
}

export interface GeocodeCandidate {
  candidateId: string;
  provider: string;
  providerCandidateId?: string | null;
  placeId?: string | null;
  displayName: string;
  address: string;
  normalizedAddress?: string | null;
  district?: string | null;
  locality?: string | null;
  countryCode?: string | null;
  location?: GeoPoint | null;
  confidence: GeoGeocodeConfidence;
  accuracyM?: number | null;
  metadata?: Record<string, unknown>;
}

export interface SearchGeoQuery {
  q: string;
  near?: GeoPoint | null;
  locale?: string;
  limit?: number;
  surface?: GeoResolutionSurface;
  requestedByActorId?: string | null;
}

export interface ResolveAddressCommand {
  candidateId?: string | null;
  providerCandidateId?: string | null;
  placeId?: string | null;
  addressText: string;
  selectedPoint?: GeoPoint | null;
  selectedByActorId?: string | null;
  surface: GeoResolutionSurface;
  manualOverrideReason?: string | null;
}

export interface ReverseGeocodeCommand {
  location: GeoPoint;
  locale?: string;
  surface: GeoResolutionSurface;
  requestedByActorId?: string | null;
}

export interface AddressPayload {
  addressId?: string | null;
  addressName?: string | null;
  address: string;
  normalizedAddress?: string | null;
  maskedAddress?: string | null;
  sensitive?: boolean;
  lat?: number | null;
  lng?: number | null;
  placeId?: string | null;
  geocodeProvider?: string | null;
  geocodeConfidence?: GeoGeocodeConfidence | null;
  coordinateSource?: GeoCoordinateSource | null;
  coordinateAccuracyM?: number | null;
  providerCandidateId?: string | null;
  selectedByActorId?: string | null;
  selectedAt?: string | null;
  pinnedByActorId?: string | null;
  pinnedAt?: string | null;
  manualOverrideReason?: string | null;
  surface?: GeoResolutionSurface | null;
  coordinateProvenance?: GeoCoordinateProvenance | null;
}

export interface GeoSearchResponse {
  candidates: GeocodeCandidate[];
  provider: string;
  generatedAt: string;
  degraded?: boolean;
  reasonCode?: string | null;
}

export interface GeoResolveResponse {
  address: AddressPayload;
  candidate?: GeocodeCandidate | null;
  provider: string;
  resolvedAt: string;
}

export interface GeoReverseResponse {
  address: AddressPayload;
  provider: string;
  resolvedAt: string;
}

export const GEO_PROVIDER_MODES = ["mock", "external", "disabled"] as const;
export type GeoProviderMode = (typeof GEO_PROVIDER_MODES)[number];

export const GEO_PROVIDER_OPERATIONAL_STATUSES = [
  "healthy",
  "degraded",
  "unhealthy",
] as const;
export type GeoProviderOperationalStatus =
  (typeof GEO_PROVIDER_OPERATIONAL_STATUSES)[number];

/**
 * The subset of `GeoProviderHealthResponse` the picker reads. Declaring only
 * the consumed fields keeps the real (larger) contract response assignable.
 */
export interface AddressProviderHealth {
  provider?: string;
  mode: GeoProviderMode;
  status: GeoProviderOperationalStatus;
  failClosed?: boolean;
  mockAllowed?: boolean;
}

export const SERVICE_AREA_EVALUATION_DECISIONS = [
  "serviceable",
  "manual_review",
  "not_serviceable",
] as const;
export type ServiceAreaEvaluationDecision =
  (typeof SERVICE_AREA_EVALUATION_DECISIONS)[number];

export type ServiceAreaEvaluationStopKind = "pickup" | "dropoff";

export interface ServiceAreaStopEvaluation {
  kind: ServiceAreaEvaluationStopKind;
  location: GeoPoint;
  serviceAreaCodes: string[];
  policyCodes: string[];
  geometryVersionRefs: string[];
  decision: ServiceAreaEvaluationDecision;
  reasonCodes: string[];
  reasonMessages: string[];
}

export interface ServiceAreaEvaluationResult {
  decision: ServiceAreaEvaluationDecision;
  serviceProductType: string;
  evaluatedAt: string;
  stops: ServiceAreaStopEvaluation[];
  serviceAreaCodes: string[];
  geometryVersionRefs: string[];
  reasonCodes: string[];
  reasonMessages: string[];
}

/**
 * Mirrors `EvaluateServiceAreaCommand` but keeps `serviceProductType` generic so
 * callers can retain their own `ServiceProductType` union without ui-web needing
 * to import it. Structurally assignable to the contract command.
 */
export interface ServiceAreaPreviewCommand<TServiceProduct extends string = string> {
  serviceProductType: TServiceProduct;
  pickup: GeoPoint;
  dropoff?: GeoPoint | null;
  requestedAt?: string;
}

// ── Coordinate validation (mirrors @drts/contracts) ──

export function isValidLatitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

export function isValidLongitude(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const point = value as Partial<GeoPoint>;
  return isValidLatitude(point.lat) && isValidLongitude(point.lng);
}

// ── Provider abstraction ──

/**
 * Thrown by a provider (including the mock) when the geo backend is unavailable
 * or fail-closed. The picker catches this to surface the provider-outage state
 * and offer the manual-coordinate fallback.
 */
export class AddressProviderUnavailableError extends Error {
  readonly reasonCode: string;

  constructor(message: string, reasonCode = "provider_unavailable") {
    super(message);
    this.name = "AddressProviderUnavailableError";
    this.reasonCode = reasonCode;
  }
}

/**
 * Provider-neutral seam the picker talks to. A real surface adapts
 * `@drts/api-client` (searchGeo/resolveGeo/reverseGeo/evaluateServiceArea/
 * getGeoProviderHealth); CI and stories inject {@link createMockAddressProvider}.
 */
export interface AddressMapPickerProvider {
  search(query: SearchGeoQuery): Promise<GeoSearchResponse>;
  resolve?(command: ResolveAddressCommand): Promise<GeoResolveResponse>;
  reverse?(command: ReverseGeocodeCommand): Promise<GeoReverseResponse>;
  evaluateServiceArea?(
    command: ServiceAreaPreviewCommand,
  ): Promise<ServiceAreaEvaluationResult>;
  getHealth?(): Promise<AddressProviderHealth>;
}

// ── Payload / provenance builders ──

export interface CandidatePayloadOptions {
  surface: GeoResolutionSurface;
  selectedByActorId?: string | null;
  selectedAt?: string | null;
}

/**
 * Convert a provider search candidate into a contract `AddressPayload` carrying
 * `provider_candidate` provenance. Returns `null` when the candidate has no
 * usable coordinates (the caller should fall back to manual entry).
 */
export function candidateToAddressPayload(
  candidate: GeocodeCandidate,
  options: CandidatePayloadOptions,
): AddressPayload | null {
  if (!candidate.location || !isValidGeoPoint(candidate.location)) {
    return null;
  }
  const providerCandidateId =
    candidate.providerCandidateId ?? candidate.candidateId;
  const provenance: GeoCoordinateProvenance = {
    coordinateSource: "provider_candidate",
    geocodeProvider: candidate.provider,
    geocodeConfidence: candidate.confidence,
    providerCandidateId,
    placeId: candidate.placeId ?? null,
    coordinateAccuracyM: candidate.accuracyM ?? null,
    selectedByActorId: options.selectedByActorId ?? null,
    selectedAt: options.selectedAt ?? null,
    surface: options.surface,
  };
  return {
    addressName: candidate.displayName,
    address: candidate.address,
    normalizedAddress: candidate.normalizedAddress ?? null,
    lat: candidate.location.lat,
    lng: candidate.location.lng,
    placeId: candidate.placeId ?? null,
    geocodeProvider: candidate.provider,
    geocodeConfidence: candidate.confidence,
    coordinateSource: "provider_candidate",
    coordinateAccuracyM: candidate.accuracyM ?? null,
    providerCandidateId,
    selectedByActorId: options.selectedByActorId ?? null,
    selectedAt: options.selectedAt ?? null,
    surface: options.surface,
    coordinateProvenance: provenance,
  };
}

export interface ManualCoordinateInput {
  lat: number;
  lng: number;
  addressText: string;
  surface: GeoResolutionSurface;
  manualOverrideReason: string;
  pinnedByActorId?: string | null;
  pinnedAt?: string | null;
  /** Defaults to `"manual"`; a dragged provider pin may keep a finer level. */
  geocodeConfidence?: GeoGeocodeConfidence;
  addressName?: string | null;
}

/**
 * Build an `AddressPayload` for a manually pinned / manually typed coordinate.
 * Carries `manual_pin` provenance plus the required manual-override reason.
 * Returns `null` when the coordinate is out of range.
 */
export function manualCoordinateToAddressPayload(
  input: ManualCoordinateInput,
): AddressPayload | null {
  if (!isValidLatitude(input.lat) || !isValidLongitude(input.lng)) {
    return null;
  }
  const confidence: GeoGeocodeConfidence = input.geocodeConfidence ?? "manual";
  const provenance: GeoCoordinateProvenance = {
    coordinateSource: "manual_pin",
    geocodeConfidence: confidence,
    pinnedByActorId: input.pinnedByActorId ?? null,
    pinnedAt: input.pinnedAt ?? null,
    manualOverrideReason: input.manualOverrideReason,
    surface: input.surface,
  };
  return {
    addressName: input.addressName ?? null,
    address: input.addressText,
    lat: input.lat,
    lng: input.lng,
    geocodeConfidence: confidence,
    coordinateSource: "manual_pin",
    pinnedByActorId: input.pinnedByActorId ?? null,
    pinnedAt: input.pinnedAt ?? null,
    manualOverrideReason: input.manualOverrideReason,
    surface: input.surface,
    coordinateProvenance: provenance,
  };
}

/**
 * True once the address carries valid coordinates and provenance — i.e. it is a
 * dispatch-ready payload rather than a legacy text-only address.
 */
export function isDispatchReadyAddress(
  address: AddressPayload | null | undefined,
): boolean {
  if (!address) {
    return false;
  }
  return (
    isValidLatitude(address.lat) &&
    isValidLongitude(address.lng) &&
    Boolean(address.coordinateSource)
  );
}

// ── Service-area preview ──

export interface ServiceAreaPreviewInput<TServiceProduct extends string = string> {
  serviceProductType: TServiceProduct;
  pickup: GeoPoint;
  dropoff?: GeoPoint | null;
  requestedAt?: string;
}

/**
 * Build the `EvaluateServiceAreaCommand`-shaped preview command from a
 * pickup (and optional dropoff). Returns `null` when the pickup coordinate is
 * invalid, since serviceability cannot be evaluated without it.
 */
export function buildServiceAreaPreviewCommand<TServiceProduct extends string>(
  input: ServiceAreaPreviewInput<TServiceProduct>,
): ServiceAreaPreviewCommand<TServiceProduct> | null {
  if (!isValidGeoPoint(input.pickup)) {
    return null;
  }
  const dropoff =
    input.dropoff && isValidGeoPoint(input.dropoff) ? input.dropoff : null;
  const command: ServiceAreaPreviewCommand<TServiceProduct> = {
    serviceProductType: input.serviceProductType,
    pickup: { lat: input.pickup.lat, lng: input.pickup.lng },
    dropoff,
  };
  if (input.requestedAt) {
    command.requestedAt = input.requestedAt;
  }
  return command;
}

export function canPreviewServiceArea(
  pickup: AddressPayload | GeoPoint | null | undefined,
): boolean {
  if (!pickup) {
    return false;
  }
  return isValidLatitude(pickup.lat) && isValidLongitude(pickup.lng);
}

/** Coordinate view of an address, or `null` when it is not yet pinned. */
export function addressToGeoPoint(
  address: AddressPayload | null | undefined,
): GeoPoint | null {
  if (
    !address ||
    !isValidLatitude(address.lat) ||
    !isValidLongitude(address.lng)
  ) {
    return null;
  }
  return { lat: address.lat as number, lng: address.lng as number };
}

// ── Provider availability derivation ──

export type AddressProviderReasonCode =
  | "available"
  | "degraded"
  | "provider_disabled"
  | "provider_unhealthy"
  | "request_failed";

export interface AddressProviderState {
  available: boolean;
  degraded: boolean;
  reasonCode: AddressProviderReasonCode;
}

/**
 * Interpret a provider health snapshot into whether the picker may attempt
 * search/resolve (available), and whether results should be flagged degraded.
 * A `disabled` mode or `unhealthy` fail-closed status marks the provider
 * unavailable so the UI shows the outage state and manual fallback.
 */
export function deriveProviderState(
  health: AddressProviderHealth | null | undefined,
): AddressProviderState {
  if (!health) {
    return { available: true, degraded: false, reasonCode: "available" };
  }
  if (health.mode === "disabled") {
    return {
      available: false,
      degraded: true,
      reasonCode: "provider_disabled",
    };
  }
  if (health.status === "unhealthy") {
    // Fail-closed unhealthy providers cannot serve; if not fail-closed and mock
    // is allowed we still let the surface try (degraded), matching the backend.
    const usable = health.failClosed === false && health.mockAllowed === true;
    return {
      available: usable,
      degraded: true,
      reasonCode: "provider_unhealthy",
    };
  }
  if (health.status === "degraded") {
    return { available: true, degraded: true, reasonCode: "degraded" };
  }
  return { available: true, degraded: false, reasonCode: "available" };
}

// ── Display helpers (confidence + serviceability tones) ──

export type AddressPickerTone =
  | "success"
  | "info"
  | "warn"
  | "danger"
  | "neutral";

export function confidenceTone(
  confidence: GeoGeocodeConfidence | null | undefined,
): AddressPickerTone {
  switch (confidence) {
    case "exact":
      return "success";
    case "interpolated":
      return "info";
    case "manual":
      return "info";
    case "approximate":
      return "warn";
    case "unknown":
    default:
      return "neutral";
  }
}

export function serviceabilityTone(
  decision: ServiceAreaEvaluationDecision | null | undefined,
): AddressPickerTone {
  switch (decision) {
    case "serviceable":
      return "success";
    case "manual_review":
      return "warn";
    case "not_serviceable":
      return "danger";
    default:
      return "neutral";
  }
}

// ── Picker status machine ──

export const ADDRESS_PICKER_STATUSES = [
  "idle",
  "searching",
  "candidates",
  "no_match",
  "selected",
  "manual_entry",
  "provider_unavailable",
] as const;
export type AddressPickerStatus = (typeof ADDRESS_PICKER_STATUSES)[number];

export interface AddressPickerStatusInput {
  providerAvailable: boolean;
  isSearching: boolean;
  manualMode: boolean;
  searchAttempted: boolean;
  candidateCount: number;
  hasSelection: boolean;
}

/**
 * Pure reducer of the picker's observable status from its inputs. Provider
 * outage dominates; then manual mode; then an active selection; then the
 * search lifecycle (searching → candidates / no_match); finally idle.
 */
export function derivePickerStatus(
  input: AddressPickerStatusInput,
): AddressPickerStatus {
  if (!input.providerAvailable && !input.manualMode) {
    return "provider_unavailable";
  }
  if (input.manualMode && !input.hasSelection) {
    return "manual_entry";
  }
  if (input.hasSelection) {
    return "selected";
  }
  if (input.isSearching) {
    return "searching";
  }
  if (input.searchAttempted) {
    return input.candidateCount > 0 ? "candidates" : "no_match";
  }
  return "idle";
}

// ── Emitted snapshot ──

export interface AddressMapPickerChange {
  status: AddressPickerStatus;
  address: AddressPayload | null;
  dispatchReady: boolean;
  serviceability: ServiceAreaEvaluationResult | null;
  providerState: AddressProviderState;
}

// ── Labels (surface-agnostic, no internal policy jargon) ──

export interface AddressMapPickerLabels {
  searchLabel: string;
  searchPlaceholder: string;
  searchButton: string;
  searching: string;
  candidatesTitle: string;
  noMatchTitle: string;
  noMatchBody: string;
  manualToggle: string;
  manualTitle: string;
  manualLatLabel: string;
  manualLngLabel: string;
  manualReasonLabel: string;
  manualReasonPlaceholder: string;
  manualApply: string;
  manualInvalid: string;
  providerOutageTitle: string;
  providerOutageBody: string;
  degradedNote: string;
  confidenceLabel: string;
  provenanceLabel: string;
  coordinatesLabel: string;
  mapEmpty: string;
  mapHint: string;
  pinAdjustHint: string;
  clearSelection: string;
  serviceableTitle: string;
  manualReviewTitle: string;
  notServiceableTitle: string;
  serviceabilityPending: string;
}

export const DEFAULT_ADDRESS_PICKER_LABELS: AddressMapPickerLabels = {
  searchLabel: "Search address",
  searchPlaceholder: "Enter a street, place, or landmark",
  searchButton: "Search",
  searching: "Searching…",
  candidatesTitle: "Matching addresses",
  noMatchTitle: "No matching address",
  noMatchBody:
    "We couldn't find that address. Refine your search or drop a pin manually.",
  manualToggle: "Enter coordinates manually",
  manualTitle: "Manual location",
  manualLatLabel: "Latitude",
  manualLngLabel: "Longitude",
  manualReasonLabel: "Reason for manual location",
  manualReasonPlaceholder: "e.g. new development not yet mapped",
  manualApply: "Use this location",
  manualInvalid: "Enter a valid latitude (-90 to 90) and longitude (-180 to 180).",
  providerOutageTitle: "Address lookup is unavailable",
  providerOutageBody:
    "The address service can't be reached right now. Enter the location manually to continue.",
  degradedNote: "Address results may be limited right now.",
  confidenceLabel: "Match confidence",
  provenanceLabel: "Location source",
  coordinatesLabel: "Coordinates",
  mapEmpty: "Select an address or drop a pin to preview it here.",
  mapHint: "Drag the pin or use arrow keys to fine-tune the location.",
  pinAdjustHint: "Pin adjusted manually.",
  clearSelection: "Clear",
  serviceableTitle: "Inside the service area",
  manualReviewTitle: "Needs review before dispatch",
  notServiceableTitle: "Outside the service area",
  serviceabilityPending: "Checking service area…",
};

export function resolveAddressPickerLabels(
  overrides?: Partial<AddressMapPickerLabels>,
): AddressMapPickerLabels {
  return { ...DEFAULT_ADDRESS_PICKER_LABELS, ...(overrides ?? {}) };
}

// ── Mock provider (deterministic; the required CI provider) ──

const MOCK_CLOCK = "2026-07-01T00:00:00.000Z";
const MOCK_PROVIDER_NAME = "mock-geo";

/**
 * Default service-area box for the mock provider (greater Taipei), reused across
 * stories and tests. Points inside are serviceable; the outer ring is
 * manual_review; everything else is not_serviceable.
 */
export const MOCK_SERVICE_BOX = {
  minLat: 24.99,
  maxLat: 25.12,
  minLng: 121.45,
  maxLng: 121.62,
} as const;

const MOCK_CANDIDATES: GeocodeCandidate[] = [
  {
    candidateId: "mock-taipei-101",
    provider: MOCK_PROVIDER_NAME,
    providerCandidateId: "place-101",
    placeId: "place-101",
    displayName: "Taipei 101",
    address: "No. 7, Section 5, Xinyi Road, Xinyi District, Taipei",
    normalizedAddress: "No.7 Sec.5 Xinyi Rd, Xinyi, Taipei",
    district: "Xinyi",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.033964, lng: 121.564468 },
    confidence: "exact",
    accuracyM: 8,
  },
  {
    candidateId: "mock-taipei-main",
    provider: MOCK_PROVIDER_NAME,
    providerCandidateId: "place-main",
    placeId: "place-main",
    displayName: "Taipei Main Station",
    address: "No. 3, Beiping West Road, Zhongzheng District, Taipei",
    normalizedAddress: "No.3 Beiping W. Rd, Zhongzheng, Taipei",
    district: "Zhongzheng",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.047762, lng: 121.517017 },
    confidence: "interpolated",
    accuracyM: 25,
  },
  {
    candidateId: "mock-banqiao",
    provider: MOCK_PROVIDER_NAME,
    providerCandidateId: "place-banqiao",
    placeId: "place-banqiao",
    displayName: "Banqiao District Office",
    address: "No. 161, Section 1, Zhongshan Road, Banqiao District, New Taipei",
    normalizedAddress: "No.161 Sec.1 Zhongshan Rd, Banqiao, New Taipei",
    district: "Banqiao",
    locality: "New Taipei",
    countryCode: "TW",
    location: { lat: 25.011, lng: 121.4636 },
    confidence: "approximate",
    accuracyM: 120,
  },
];

export interface MockAddressProviderOptions {
  /** Override the candidate fixtures returned by search. */
  candidates?: GeocodeCandidate[];
  /** When true, every request throws {@link AddressProviderUnavailableError}. */
  unavailable?: boolean;
  /** When true, search responses are flagged `degraded`. */
  degraded?: boolean;
  /** Health snapshot returned by `getHealth`. */
  health?: AddressProviderHealth;
  /** Deterministic timestamp for responses (defaults to a fixed clock). */
  now?: string;
}

function mockServiceDecision(point: GeoPoint): ServiceAreaEvaluationDecision {
  const inLat = point.lat >= MOCK_SERVICE_BOX.minLat && point.lat <= MOCK_SERVICE_BOX.maxLat;
  const inLng = point.lng >= MOCK_SERVICE_BOX.minLng && point.lng <= MOCK_SERVICE_BOX.maxLng;
  if (inLat && inLng) {
    // Outer 10% ring → manual_review.
    const latSpan = MOCK_SERVICE_BOX.maxLat - MOCK_SERVICE_BOX.minLat;
    const lngSpan = MOCK_SERVICE_BOX.maxLng - MOCK_SERVICE_BOX.minLng;
    const nearEdge =
      point.lat - MOCK_SERVICE_BOX.minLat < latSpan * 0.1 ||
      MOCK_SERVICE_BOX.maxLat - point.lat < latSpan * 0.1 ||
      point.lng - MOCK_SERVICE_BOX.minLng < lngSpan * 0.1 ||
      MOCK_SERVICE_BOX.maxLng - point.lng < lngSpan * 0.1;
    return nearEdge ? "manual_review" : "serviceable";
  }
  return "not_serviceable";
}

/**
 * Deterministic, network-free provider for CI and stories. Search matches
 * candidate display names / addresses by case-insensitive substring; the empty
 * or "nowhere" query yields no candidates (the no-match path).
 */
export function createMockAddressProvider(
  options: MockAddressProviderOptions = {},
): AddressMapPickerProvider {
  const now = options.now ?? MOCK_CLOCK;
  const fixtures = options.candidates ?? MOCK_CANDIDATES;

  function guard(): void {
    if (options.unavailable) {
      throw new AddressProviderUnavailableError(
        "Mock geo provider is configured as unavailable.",
      );
    }
  }

  return {
    async search(query: SearchGeoQuery): Promise<GeoSearchResponse> {
      guard();
      const needle = query.q.trim().toLowerCase();
      const matches =
        needle.length === 0 || needle === "nowhere"
          ? []
          : fixtures.filter(
              (candidate) =>
                candidate.displayName.toLowerCase().includes(needle) ||
                candidate.address.toLowerCase().includes(needle) ||
                (candidate.locality ?? "").toLowerCase().includes(needle) ||
                (candidate.district ?? "").toLowerCase().includes(needle),
            );
      const limited =
        typeof query.limit === "number" ? matches.slice(0, query.limit) : matches;
      const response: GeoSearchResponse = {
        candidates: limited,
        provider: MOCK_PROVIDER_NAME,
        generatedAt: now,
      };
      if (options.degraded) {
        response.degraded = true;
        response.reasonCode = "mock_degraded";
      }
      return response;
    },

    async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
      guard();
      const candidate =
        fixtures.find(
          (item) =>
            item.candidateId === command.candidateId ||
            item.providerCandidateId === command.providerCandidateId ||
            item.placeId === command.placeId,
        ) ?? null;
      const point = command.selectedPoint ?? candidate?.location ?? null;
      const address: AddressPayload = candidate
        ? (candidateToAddressPayload(candidate, {
            surface: command.surface,
            selectedByActorId: command.selectedByActorId ?? null,
            selectedAt: now,
          }) ?? {
            address: command.addressText,
            surface: command.surface,
          })
        : {
            address: command.addressText,
            lat: point?.lat ?? null,
            lng: point?.lng ?? null,
            surface: command.surface,
          };
      return {
        address,
        candidate,
        provider: MOCK_PROVIDER_NAME,
        resolvedAt: now,
      };
    },

    async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
      guard();
      return {
        address: {
          address: `Pinned location (${command.location.lat.toFixed(5)}, ${command.location.lng.toFixed(5)})`,
          lat: command.location.lat,
          lng: command.location.lng,
          coordinateSource: "reverse_geocode",
          geocodeConfidence: "approximate",
          geocodeProvider: MOCK_PROVIDER_NAME,
          surface: command.surface,
        },
        provider: MOCK_PROVIDER_NAME,
        resolvedAt: now,
      };
    },

    async evaluateServiceArea(
      command: ServiceAreaPreviewCommand,
    ): Promise<ServiceAreaEvaluationResult> {
      guard();
      const stops: ServiceAreaStopEvaluation[] = [];
      const pickupDecision = mockServiceDecision(command.pickup);
      stops.push({
        kind: "pickup",
        location: command.pickup,
        serviceAreaCodes: pickupDecision === "not_serviceable" ? [] : ["mock-core"],
        policyCodes: [],
        geometryVersionRefs: ["mock-v1"],
        decision: pickupDecision,
        reasonCodes: [`pickup_${pickupDecision}`],
        reasonMessages: [],
      });
      let decision = pickupDecision;
      if (command.dropoff) {
        const dropoffDecision = mockServiceDecision(command.dropoff);
        stops.push({
          kind: "dropoff",
          location: command.dropoff,
          serviceAreaCodes:
            dropoffDecision === "not_serviceable" ? [] : ["mock-core"],
          policyCodes: [],
          geometryVersionRefs: ["mock-v1"],
          decision: dropoffDecision,
          reasonCodes: [`dropoff_${dropoffDecision}`],
          reasonMessages: [],
        });
        decision = worstServiceDecision(pickupDecision, dropoffDecision);
      }
      return {
        decision,
        serviceProductType: command.serviceProductType,
        evaluatedAt: now,
        stops,
        serviceAreaCodes: decision === "not_serviceable" ? [] : ["mock-core"],
        geometryVersionRefs: ["mock-v1"],
        reasonCodes: [`overall_${decision}`],
        reasonMessages: [],
      };
    },

    async getHealth(): Promise<AddressProviderHealth> {
      return (
        options.health ?? {
          provider: MOCK_PROVIDER_NAME,
          mode: options.unavailable ? "disabled" : "mock",
          status: options.unavailable
            ? "unhealthy"
            : options.degraded
              ? "degraded"
              : "healthy",
          failClosed: Boolean(options.unavailable),
          mockAllowed: true,
        }
      );
    },
  };
}

/** Combine two stop decisions into the strictest overall outcome. */
export function worstServiceDecision(
  a: ServiceAreaEvaluationDecision,
  b: ServiceAreaEvaluationDecision,
): ServiceAreaEvaluationDecision {
  const rank: Record<ServiceAreaEvaluationDecision, number> = {
    serviceable: 0,
    manual_review: 1,
    not_serviceable: 2,
  };
  return rank[a] >= rank[b] ? a : b;
}
