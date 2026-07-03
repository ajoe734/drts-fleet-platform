import { HttpStatus, Inject, Injectable, Optional } from "@nestjs/common";

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
import { GeoProviderConfigService } from "./geo-provider-config.service";
import { GEO_PROVIDER, GeoProviderError, type GeoProvider } from "./geo.provider";

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
    @Inject(GEO_PROVIDER)
    private readonly geoProvider: GeoProvider,
    @Optional()
    private readonly geoProviderConfigService?: GeoProviderConfigService,
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
    this.assertProviderUsable();
    return this.withProviderErrorMapping(() =>
      this.provider().search(normalized),
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
    this.assertProviderUsable();
    return this.withProviderErrorMapping(() =>
      this.provider().resolve(normalized),
    );
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
    this.assertProviderUsable();
    return this.withProviderErrorMapping(() =>
      this.provider().reverse(normalized),
    );
  }

  private providerConfig() {
    return this.geoProviderConfigService ?? new GeoProviderConfigService();
  }

  private assertProviderUsable() {
    const health = this.providerConfig().getHealth();
    if (!health.failClosed) {
      return;
    }
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

  private async withProviderErrorMapping<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GeoProviderError) {
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
