import type { GeoReverseResponse, GeoSearchResponse } from "@drts/contracts";
import { deepCamelize } from "./embed-api";
import { ReferralBookingApiError } from "./embed-booking-api";
import {
  getReferralIdentityHeaders,
  readActiveReferralSession,
} from "./embed-partner-session";
import { getServerApiBaseUrl } from "./embed-runtime";

// The rider picks places in Taiwan; keep queries and points inside sane bounds.
const MAX_QUERY_LENGTH = 120;

/** Address utilities for the booking form, as the active referral passenger. */
async function geoRequest<T>(
  path: string,
  method: "GET" | "POST",
  command?: unknown,
): Promise<T> {
  const session = await readActiveReferralSession();
  const headers = await getReferralIdentityHeaders(session);
  let response: Response;
  try {
    response = await fetch(`${getServerApiBaseUrl()}/api/geo/${path}`, {
      method,
      headers: { ...headers, "Content-Type": "application/json" },
      ...(command === undefined ? {} : { body: JSON.stringify(command) }),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    throw new ReferralBookingApiError(503, "GEO_UPSTREAM_UNAVAILABLE");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ReferralBookingApiError(
      response.status,
      typeof body?.error?.code === "string"
        ? body.error.code
        : "GEO_UPSTREAM_REQUEST_FAILED",
    );
  if (!body || typeof body !== "object" || !("data" in body) || !body.data)
    throw new ReferralBookingApiError(502, "GEO_UPSTREAM_INVALID_RESPONSE");
  return deepCamelize(body.data) as T;
}

export function searchReferralPlacesServer(query: string, limit = 5) {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) throw new ReferralBookingApiError(400, "VALIDATION_ERROR");
  const params = new URLSearchParams({
    q,
    limit: String(Math.min(Math.max(Math.trunc(limit), 1), 8)),
    locale: "zh-TW",
    surface: "passenger_entry",
  });
  return geoRequest<GeoSearchResponse>(`search?${params.toString()}`, "GET");
}

export function reverseReferralPlaceServer(lat: number, lng: number) {
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  )
    throw new ReferralBookingApiError(400, "VALIDATION_ERROR");
  return geoRequest<GeoReverseResponse>("reverse", "POST", {
    location: { lat, lng },
    locale: "zh-TW",
    surface: "passenger_entry",
  });
}
