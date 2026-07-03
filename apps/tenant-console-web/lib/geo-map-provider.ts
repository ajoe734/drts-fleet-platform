"use client";

/**
 * Browser-side geo provider for the shared booking `AddressMapPairPicker`.
 *
 * Implements the `AddressMapPickerProvider` seam by calling the same-origin
 * `/api/geo/*` proxy routes (see `app/api/geo/[action]/route.ts`). Any transport
 * or backend failure is rethrown as `AddressProviderUnavailableError` so the
 * picker shows its outage state and offers the manual-coordinate fallback,
 * keeping the booking surface usable when geo is degraded (Gate E).
 */
import {
  AddressProviderUnavailableError,
  type AddressMapPickerProvider,
  type AddressProviderHealth,
  type GeoResolveResponse,
  type GeoReverseResponse,
  type GeoSearchResponse,
  type ResolveAddressCommand,
  type ReverseGeocodeCommand,
  type SearchGeoQuery,
  type ServiceAreaEvaluationResult,
  type ServiceAreaPreviewCommand,
} from "@drts/ui-web";

const GEO_BASE_PATH = "/api/geo";

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload?.error) {
        reason = payload.error;
      }
    } catch {
      // Non-JSON error body; keep the HTTP status reason.
    }
    throw new AddressProviderUnavailableError(reason, "request_failed");
  }
  return (await response.json()) as T;
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    throw new AddressProviderUnavailableError(
      error instanceof Error ? error.message : "Geo request failed.",
      "request_failed",
    );
  }
  return readJson<T>(response);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new AddressProviderUnavailableError(
      error instanceof Error ? error.message : "Geo request failed.",
      "request_failed",
    );
  }
  return readJson<T>(response);
}

export function createTenantConsoleGeoProvider(): AddressMapPickerProvider {
  return {
    async search(query: SearchGeoQuery): Promise<GeoSearchResponse> {
      const params = new URLSearchParams();
      params.set("q", query.q);
      if (query.locale) params.set("locale", query.locale);
      if (typeof query.limit === "number") {
        params.set("limit", String(query.limit));
      }
      if (query.near) {
        params.set("nearLat", String(query.near.lat));
        params.set("nearLng", String(query.near.lng));
      }
      if (query.requestedByActorId) {
        params.set("requestedByActorId", query.requestedByActorId);
      }
      return getJson<GeoSearchResponse>(
        `${GEO_BASE_PATH}/search?${params.toString()}`,
      );
    },

    async resolve(command: ResolveAddressCommand): Promise<GeoResolveResponse> {
      return postJson<GeoResolveResponse>(`${GEO_BASE_PATH}/resolve`, command);
    },

    async reverse(command: ReverseGeocodeCommand): Promise<GeoReverseResponse> {
      return postJson<GeoReverseResponse>(`${GEO_BASE_PATH}/reverse`, command);
    },

    async evaluateServiceArea(
      command: ServiceAreaPreviewCommand,
    ): Promise<ServiceAreaEvaluationResult> {
      return postJson<ServiceAreaEvaluationResult>(
        `${GEO_BASE_PATH}/evaluate-service-area`,
        command,
      );
    },

    async getHealth(): Promise<AddressProviderHealth> {
      return getJson<AddressProviderHealth>(`${GEO_BASE_PATH}/health`);
    },
  };
}
