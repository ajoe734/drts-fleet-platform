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
import { MapGeofenceObservabilityService } from "../map-geofence-observability/map-geofence-observability.service";
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
    private readonly mapGeofenceObservability?: MapGeofenceObservabilityService,
  ) {}

  health() {
    return this.providerConfig().getHealth();
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
    const surface = this.surfaceOrUnknown(normalized.surface);
    this.assertProviderUsable(surface);
    return this.withProviderErrorMapping(
      () => this.provider().search(normalized),
      {
        operation: "search",
        surface,
        startedAt: Date.now(),
      },
    );
  }

  async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
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
    this.assertProviderUsable(normalized.surface);
    const result = await this.withProviderErrorMapping(
      () => this.provider().resolve(normalized),
      {
        operation: "resolve",
        surface: normalized.surface,
        startedAt: Date.now(),
      },
    );
    this.recordAddressResolution(result, normalized.surface);
    return result;
  }

  async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
    const normalized: ReverseGeocodeCommand = {
      ...command,
      location: this.normalizePoint(command.location, "location"),
      surface: this.normalizeSurface(command.surface, "surface"),
      requestedByActorId: this.normalizeOptionalText(
        command.requestedByActorId,
      ),
    };
    this.assertProviderUsable(normalized.surface);
    const result = await this.withProviderErrorMapping(
      () => this.provider().reverse(normalized),
      {
        operation: "reverse",
        surface: normalized.surface,
        startedAt: Date.now(),
      },
    );
    this.recordAddressResolution(result, normalized.surface);
    return result;
  }

  private providerConfig() {
    return this.geoProviderConfigService ?? new GeoProviderConfigService();
  }

  private assertProviderUsable(surface: GeoResolutionSurface) {
    const health = this.providerConfig().getHealth();
    if (!health.failClosed) {
      return;
    }
    this.mapGeofenceObservability?.recordGeocodeRequest({
      provider: health.provider,
      surface,
      operation: "health",
      result: "fail_closed",
      latencyMs: 0,
    });
    this.mapGeofenceObservability?.recordProviderError({
      provider: health.provider,
      surface,
      operation: "health",
      errorCode: "GEO_PROVIDER_NOT_CONFIGURED",
    });
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

  private async withProviderErrorMapping<T extends { provider?: string }>(
    operation: () => Promise<T>,
    context: {
      operation: "search" | "resolve" | "reverse";
      surface: GeoResolutionSurface;
      startedAt: number;
    },
  ) {
    try {
      const result = await operation();
      this.mapGeofenceObservability?.recordGeocodeRequest({
        provider: result.provider ?? null,
        surface: context.surface,
        operation: context.operation,
        result: "success",
        latencyMs: Date.now() - context.startedAt,
      });
      return result;
    } catch (error) {
      if (error instanceof GeoProviderError) {
        this.mapGeofenceObservability?.recordGeocodeRequest({
          provider: this.providerFromError(error),
          surface: context.surface,
          operation: context.operation,
          result: "error",
          latencyMs: Date.now() - context.startedAt,
        });
        this.mapGeofenceObservability?.recordProviderError({
          provider: this.providerFromError(error),
          surface: context.surface,
          operation: context.operation,
          errorCode: error.code,
        });
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

  private recordAddressResolution(
    result: GeoResolveResponse | GeoReverseResponse,
    fallbackSurface: GeoResolutionSurface,
  ) {
    const surface = result.address.surface ?? fallbackSurface;
    const actorId =
      result.address.selectedByActorId ??
      result.address.pinnedByActorId ??
      null;
    this.mapGeofenceObservability?.recordAddressResolved({
      surface,
      actorId,
      provider: result.provider,
      coordinateSource: result.address.coordinateSource,
      candidateId:
        "candidate" in result
          ? (result.candidate?.candidateId ?? null)
          : (result.address.providerCandidateId ?? null),
      placeId: result.address.placeId ?? null,
      addressText: result.address.address,
    });
    if (
      result.address.coordinateSource === "manual_pin" ||
      result.address.pinnedByActorId ||
      result.address.pinnedAt
    ) {
      this.mapGeofenceObservability?.recordPinConfirmed({
        surface,
        actorId,
        coordinateSource: result.address.coordinateSource,
        placeId: result.address.placeId ?? null,
      });
    }
    if (result.address.manualOverrideReason) {
      this.mapGeofenceObservability?.recordManualOverride({
        surface,
        actorId,
        manualOverrideReason: result.address.manualOverrideReason,
        coordinateSource: result.address.coordinateSource,
      });
    }
  }

  private providerFromError(error: GeoProviderError) {
    const provider = error.details?.provider;
    return typeof provider === "string" ? provider : "unknown";
  }

  private surfaceOrUnknown(surface: GeoResolutionSurface | undefined | null) {
    return surface ?? "unknown";
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
