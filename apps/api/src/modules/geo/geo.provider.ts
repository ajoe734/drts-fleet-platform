import type {
  ComputeGeoRouteCommand,
  GeoResolveResponse,
  GeoRouteResponse,
  GeoReverseResponse,
  GeoSearchResponse,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  SearchGeoQuery,
} from "@drts/contracts";

export const GEO_PROVIDER = Symbol("GEO_PROVIDER");

export interface GeoProvider {
  readonly providerId: string;
  search(command: SearchGeoQuery): Promise<GeoSearchResponse>;
  resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse>;
  reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse>;
  route(command: ComputeGeoRouteCommand): Promise<GeoRouteResponse>;
}

export class GeoProviderError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "GeoProviderError";
  }
}
