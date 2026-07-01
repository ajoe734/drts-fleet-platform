import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import {
  GEO_RESOLUTION_SURFACES,
  type GeoPoint,
  type GeoResolveResponse,
  type GeoResolutionSurface,
  type GeoReverseResponse,
  type GeoSearchResponse,
  type ResolveAddressCommand,
  type ReverseGeocodeCommand,
  type SearchGeoQuery,
  isValidGeoPoint,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { AuditNotificationService } from "../audit-notification/audit-notification.service";
import { MapGeofenceObservabilityService } from "../operational-observability/map-geofence-observability.service";
import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GeoProviderError, type GeoProvider } from "./geo.provider";
import { MockGeoProvider } from "./mock-geo.provider";

const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;
const SURFACE_SET = new Set<string>(GEO_RESOLUTION_SURFACES);

type SearchHttpQuery = {
  q?: string;
  nearLat?: string;
  nearLng?: string;
  locale?: string;
  limit?: string;
  surface?: string;
  requestedByActorId?: string;
};

@Injectable()
export class GeoService {
  constructor(
    private readonly geoProvider: MockGeoProvider,
    @Optional()
    private readonly geoProviderConfigService?: GeoProviderConfigService,
    @Optional()
    private readonly auditNotificationService?: AuditNotificationService,
    @Optional()
    private readonly mapGeofenceObservabilityService?: MapGeofenceObservabilityService,
  ) {}

  health() {
    const health = this.providerConfig().getHealth();
    this.recordProviderHealth(health);
    return health;
  }

  async searchFromHttpQuery(query: SearchHttpQuery) {
    const command: SearchGeoQuery = {
      q: this.normalizeRequiredText(query.q, "q"),
      near: this.parseOptionalPoint(query.nearLat, query.nearLng, "near"),
      limit: this.parseLimit(query.limit),
      requestedByActorId: this.normalizeOptionalText(query.requestedByActorId),
    };
    const locale = this.normalizeOptionalText(query.locale);
    if (locale) {
      command.locale = locale;
    }
    if (query.surface) {
      command.surface = this.normalizeSurface(query.surface, "surface");
    }
    return this.search(command);
  }

  async search(command: SearchGeoQuery): Promise<GeoSearchResponse> {
    const normalized: SearchGeoQuery = {
      q: this.normalizeRequiredText(command.q, "q"),
      near: command.near ? this.normalizePoint(command.near, "near") : null,
      limit: this.normalizeLimit(command.limit),
      requestedByActorId: command.requestedByActorId ?? null,
    };
    if (command.locale) {
      normalized.locale = command.locale;
    }
    if (command.surface) {
      normalized.surface = this.normalizeSurface(command.surface, "surface");
    }
    this.assertProviderUsable();
    const response = await this.withProviderErrorMapping(
      "search",
      normalized,
      () => this.provider().search(normalized),
    );
    if (response.candidates.length !== 1) {
      this.mapGeofenceObservabilityService?.recordGeoOutcome(
        "address_ambiguity",
      );
    }
    return response;
  }

  async resolve(
    command: ResolveAddressCommand,
    requestId?: string,
  ): Promise<GeoResolveResponse> {
    const selectedPoint = command.selectedPoint
      ? this.normalizePoint(command.selectedPoint, "selectedPoint")
      : null;
    const normalized: ResolveAddressCommand = {
      ...command,
      addressText: this.normalizeRequiredText(
        command.addressText,
        "addressText",
      ),
      selectedPoint,
      surface: this.normalizeSurface(command.surface, "surface"),
      selectedByActorId: this.normalizeOptionalText(command.selectedByActorId),
      manualOverrideReason: this.normalizeOptionalText(
        command.manualOverrideReason,
      ),
    };
    this.assertProviderUsable();
    const response = await this.withProviderErrorMapping(
      "resolve",
      normalized,
      () => this.provider().resolve(normalized),
    );
    this.mapGeofenceObservabilityService?.recordGeoOutcome("resolved");
    this.recordGeoAddressResolved(response, normalized, requestId);
    if (response.address.coordinateSource === "manual_pin") {
      this.mapGeofenceObservabilityService?.recordGeoOutcome("manual_override");
      this.recordGeoPinConfirmed(response, normalized, requestId);
      this.recordGeoManualOverrideCreated(response, normalized, requestId);
    }
    return response;
  }

  async reverse(
    command: ReverseGeocodeCommand,
    requestId?: string,
  ): Promise<GeoReverseResponse> {
    const normalized: ReverseGeocodeCommand = {
      ...command,
      location: this.normalizePoint(command.location, "location"),
      surface: this.normalizeSurface(command.surface, "surface"),
      requestedByActorId: this.normalizeOptionalText(
        command.requestedByActorId,
      ),
    };
    this.assertProviderUsable();
    const response = await this.withProviderErrorMapping(
      "reverse",
      normalized,
      () => this.provider().reverse(normalized),
    );
    this.mapGeofenceObservabilityService?.recordGeoOutcome("resolved");
    this.recordGeoAddressResolved(response, normalized, requestId);
    return response;
  }

  private providerConfig() {
    return this.geoProviderConfigService ?? new GeoProviderConfigService();
  }

  private assertProviderUsable() {
    const health = this.providerConfig().getHealth();
    this.recordProviderHealth(health);
    if (!health.failClosed) {
      return;
    }
    this.mapGeofenceObservabilityService?.recordGeoOutcome("provider_outage");
    throw new ApiRequestError(
      HttpStatus.SERVICE_UNAVAILABLE,
      "GEO_PROVIDER_NOT_CONFIGURED",
      "Geo provider is not configured for runtime use.",
      {
        provider: health.provider,
        mode: health.mode,
        environment: health.environment,
        missingSecretNames: health.missingSecretNames,
        checks: health.checks,
      },
      true,
    );
  }

  private provider(): GeoProvider {
    return this.geoProvider;
  }

  private async withProviderErrorMapping<T>(
    operationName: "search" | "resolve" | "reverse",
    command: SearchGeoQuery | ResolveAddressCommand | ReverseGeocodeCommand,
    operation: () => Promise<T>,
  ) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GeoProviderError) {
        this.recordGeoProviderError(operationName, command, error);
        throw new ApiRequestError(
          error.statusCode,
          error.code,
          error.message,
          error.details,
          error.retryable,
        );
      }
      throw error;
    }
  }

  private recordProviderHealth(
    health: ReturnType<GeoProviderConfigService["getHealth"]>,
  ) {
    this.mapGeofenceObservabilityService?.recordProviderHealth({
      status: health.status,
      provider: health.provider,
      mode: health.mode,
      failClosed: health.failClosed,
    });
  }

  private recordGeoProviderError(
    operationName: "search" | "resolve" | "reverse",
    command: SearchGeoQuery | ResolveAddressCommand | ReverseGeocodeCommand,
    error: GeoProviderError,
  ) {
    if (error.statusCode >= 500 || error.retryable) {
      this.mapGeofenceObservabilityService?.recordGeoOutcome("provider_outage");
      return;
    }
    if (error.code === "GEO_CANDIDATE_NOT_FOUND") {
      const resolveCommand = command as ResolveAddressCommand;
      const hasCandidateReference = Boolean(
        resolveCommand.candidateId ||
        resolveCommand.providerCandidateId ||
        resolveCommand.placeId,
      );
      this.mapGeofenceObservabilityService?.recordGeoOutcome(
        hasCandidateReference ? "address_ambiguity" : "coordinate_less_attempt",
      );
      return;
    }
    if (operationName === "search" && error.statusCode === 404) {
      this.mapGeofenceObservabilityService?.recordGeoOutcome(
        "address_ambiguity",
      );
    }
  }

  private recordGeoAddressResolved(
    response: GeoResolveResponse | GeoReverseResponse,
    command: ResolveAddressCommand | ReverseGeocodeCommand,
    requestId?: string,
  ) {
    const actorId =
      "selectedByActorId" in command
        ? (command.selectedByActorId ?? null)
        : "requestedByActorId" in command
          ? (command.requestedByActorId ?? null)
          : null;
    this.auditNotificationService?.recordAuditLog({
      actorId,
      actorType: actorId ? "ops_user" : "system",
      tenantId: null,
      moduleName: "geo",
      actionName: "geo.address.resolved",
      resourceType: "geo_address",
      resourceId:
        response.address.placeId ??
        response.address.providerCandidateId ??
        response.address.normalizedAddress ??
        response.address.address,
      newValuesSummary: {
        provider: response.provider,
        surface: response.address.surface ?? null,
        actorId,
        actorRole: actorId ? "ops_user" : "system",
        candidateId:
          response.address.providerCandidateId ??
          response.address.placeId ??
          null,
        lat: response.address.lat,
        lng: response.address.lng,
        confidence: response.address.geocodeConfidence ?? null,
        provenance: response.address.coordinateSource,
        accuracyMeters: response.address.coordinateAccuracyM ?? null,
        coordinateSource: response.address.coordinateSource,
        geocodeConfidence: response.address.geocodeConfidence ?? null,
        coordinateAccuracyM: response.address.coordinateAccuracyM ?? null,
        manualOverrideReason: response.address.manualOverrideReason ?? null,
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  private recordGeoPinConfirmed(
    response: GeoResolveResponse,
    command: ResolveAddressCommand,
    requestId?: string,
  ) {
    const actorId = command.selectedByActorId ?? null;
    this.auditNotificationService?.recordAuditLog({
      actorId,
      actorType: actorId ? "ops_user" : "system",
      tenantId: null,
      moduleName: "geo",
      actionName: "geo.pin.confirmed",
      resourceType: "geo_pin",
      resourceId:
        response.address.normalizedAddress ?? response.address.address,
      newValuesSummary: {
        surface: response.address.surface ?? null,
        actorId,
        actorRole: actorId ? "ops_user" : "system",
        stopRole: null,
        lat: response.address.lat,
        lng: response.address.lng,
        provenance: response.address.coordinateSource,
        serviceAreaPreviewDecision: null,
        coordinateSource: response.address.coordinateSource,
        manualOverrideReason: response.address.manualOverrideReason ?? null,
        selectedByActorId: response.address.selectedByActorId ?? null,
        pinnedByActorId: response.address.pinnedByActorId ?? null,
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  private recordGeoManualOverrideCreated(
    response: GeoResolveResponse,
    command: ResolveAddressCommand,
    requestId?: string,
  ) {
    const actorId = command.selectedByActorId ?? null;
    this.auditNotificationService?.recordAuditLog({
      actorId,
      actorType: actorId ? "ops_user" : "system",
      tenantId: null,
      moduleName: "geo",
      actionName: "geo.manual_override.created",
      resourceType: "geo_manual_override",
      resourceId:
        response.address.normalizedAddress ?? response.address.address,
      newValuesSummary: {
        surface: response.address.surface ?? null,
        actorId,
        actorRole: actorId ? "ops_user" : "system",
        reasonCode: response.address.manualOverrideReason ?? null,
        providerState: response.provider,
        lat: response.address.lat,
        lng: response.address.lng,
        manualReviewRequired: true,
        coordinateSource: response.address.coordinateSource,
      },
      ...(requestId ? { requestId } : {}),
    });
  }

  private normalizeRequiredText(value: unknown, field: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is required.`,
        { field },
      );
    }
    return value.trim();
  }

  private normalizeOptionalText(value: unknown) {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private parseOptionalPoint(
    lat: string | undefined,
    lng: string | undefined,
    field: string,
  ): GeoPoint | null {
    if (!lat && !lng) {
      return null;
    }
    if (!lat || !lng) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_COORDINATE",
        `${field} requires both latitude and longitude.`,
        { field },
      );
    }
    return this.normalizePoint({ lat: Number(lat), lng: Number(lng) }, field);
  }

  private normalizePoint(value: unknown, field: string) {
    if (!isValidGeoPoint(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "INVALID_COORDINATE",
        `${field} must include valid lat/lng coordinates.`,
        { field },
      );
    }
    return value;
  }

  private parseLimit(value: string | undefined) {
    if (!value) {
      return DEFAULT_SEARCH_LIMIT;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "limit must be a positive integer.",
        { field: "limit" },
      );
    }
    return this.normalizeLimit(parsed);
  }

  private normalizeLimit(value: number | undefined) {
    if (value === undefined || value === null) {
      return DEFAULT_SEARCH_LIMIT;
    }
    return Math.min(value, MAX_SEARCH_LIMIT);
  }

  private normalizeSurface(
    value: unknown,
    field: string,
  ): GeoResolutionSurface {
    if (typeof value !== "string" || !SURFACE_SET.has(value)) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        `${field} is not a supported geo surface.`,
        { field, allowedValues: GEO_RESOLUTION_SURFACES },
      );
    }
    return value as GeoResolutionSurface;
  }
}
