import type {
  ComputeGeoRouteCommand,
  CreatePassengerRideCommand,
  FareQuoteCommand,
  FareQuoteResponse,
  FaresResponse,
  GeoResolveResponse,
  GeoReverseResponse,
  GeoRouteResponse,
  GeoSearchResponse,
  PassengerMeResponse,
  PassengerRideResponse,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  SearchGeoQuery,
  UpdatePassengerMeCommand,
} from "@drts/contracts";
import type { FetchFn, PassengerClientOptions } from "../client.js";
import { PassengerApiError } from "../auth/errors.js";
import { validateBookingSettings } from "./time.js";
import { decodeBookingWire } from "./wire.js";

/** Portable booking transport; HTTP is the only injected external boundary. */
export class PassengerBookingClient {
  private readonly fetchFn: FetchFn;
  private readonly baseUrl: string;

  constructor(options: PassengerClientOptions) {
    this.baseUrl = options.baseUrl;
    if (!options.fetchFn) throw new Error("booking_fetch_required");
    this.fetchFn = options.fetchFn;
  }

  private async request<T>(
    path: string,
    body?: unknown,
    method?: string,
    requestId?: string,
  ): Promise<T> {
    const response = await this.fetchFn(
      `${this.baseUrl}/api/passenger-app/${path}`,
      {
        method: method ?? (body === undefined ? "GET" : "POST"),
        headers: {
          "Content-Type": "application/json",
          ...(requestId ? { "x-request-id": requestId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.ok)
        throw new PassengerApiError(
          response.status,
          "invalid_response",
          "Invalid API response",
        );
    }
    if (!response.ok) {
      const envelope = payload as
        | {
            error?:
              | string
              | {
                  code?: string;
                  message?: string;
                  details?: Record<string, unknown>;
                  retryable?: boolean;
                };
          }
        | undefined;
      const error = envelope?.error ?? undefined;
      throw new PassengerApiError(
        response.status,
        typeof error === "string" ? error : (error?.code ?? "unavailable"),
        typeof error === "object"
          ? (error.message ?? "Booking request failed")
          : "Booking request failed",
        typeof error === "object" ? (error.details ?? {}) : {},
        typeof error === "object" && error.retryable === true,
      );
    }
    // The actual global HTTP serializer emits snake_case. Decode DTO fields,
    // retaining opaque values and dictionary/metadata bags unchanged.
    if (payload && typeof payload === "object" && "data" in payload)
      return decodeBookingWire(payload.data) as T;
    throw new PassengerApiError(
      response.status,
      "invalid_response",
      "Missing API success envelope",
    );
  }

  getAccount() {
    return this.request<PassengerMeResponse>("me");
  }
  updateAccount(command: UpdatePassengerMeCommand) {
    return this.request<PassengerMeResponse>("me", command, "PATCH");
  }
  getFares() {
    return this.request<FaresResponse>("fares");
  }
  async getSettings() {
    return validateBookingSettings(await this.request<unknown>("settings"));
  }
  getFareQuote(command: FareQuoteCommand) {
    return this.request<FareQuoteResponse>("quotes", command);
  }
  createRide(command: CreatePassengerRideCommand, requestId?: string) {
    return this.request<PassengerRideResponse>(
      "rides",
      command,
      "POST",
      requestId,
    );
  }

  private async geo<T>(path: string, command?: unknown): Promise<T> {
    try {
      return await this.request<T>(path, command);
    } catch (reason) {
      if (reason instanceof PassengerApiError)
        throw new PassengerApiError(
          reason.status,
          reason.code,
          "目前無法搜尋地址，請稍後重試。",
          reason.details,
          reason.retryable,
        );
      throw reason;
    }
  }

  search(query: SearchGeoQuery) {
    const params: [string, string][] = [
      ["q", query.q],
      ["surface", "passenger_entry"],
    ];
    if (query.limit !== undefined) params.push(["limit", String(query.limit)]);
    if (query.locale) params.push(["locale", query.locale]);
    const search = params
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");
    return this.geo<GeoSearchResponse>(`geo/search?${search}`);
  }
  resolve(command: ResolveAddressCommand) {
    return this.geo<GeoResolveResponse>("geo/resolve", {
      ...command,
      surface: "passenger_entry",
    });
  }
  reverse(command: ReverseGeocodeCommand) {
    return this.geo<GeoReverseResponse>("geo/reverse", {
      ...command,
      surface: "passenger_entry",
    });
  }
  route(command: ComputeGeoRouteCommand) {
    return this.geo<GeoRouteResponse>("geo/route", command);
  }
  // No getHealth/evaluateServiceArea: there is no authorized passenger health/
  // evaluator endpoint. Real operation failures are visible; quotes own serviceability.
}
