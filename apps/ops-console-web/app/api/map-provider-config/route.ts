import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function allowedOrigins() {
  return (process.env.MAP_PROVIDER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function externalRequestOrigin(request: NextRequest) {
  const host =
    firstHeaderValue(request.headers.get("host")) ??
    firstHeaderValue(request.headers.get("x-forwarded-host"));
  const protocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    request.nextUrl.protocol.replace(/:$/, "");

  if (host && (protocol === "http" || protocol === "https")) {
    try {
      return new URL(`${protocol}://${host}`).origin;
    } catch {
      // Fall back to Next's parsed origin when proxy headers are malformed.
    }
  }

  return request.nextUrl.origin;
}

export function GET(request: NextRequest) {
  const mode = (process.env.MAP_PROVIDER_MODE ?? "mock").toLowerCase();
  const provider = (process.env.MAP_PROVIDER_NAME ?? "google").toLowerCase();
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
  const origins = allowedOrigins();
  const requestOrigin = externalRequestOrigin(request).replace(/\/$/, "");
  const originAllowed = origins.length === 0 || origins.includes(requestOrigin);
  const enabled =
    mode === "external" &&
    provider === "google" &&
    browserKey.length > 0 &&
    originAllowed;

  return NextResponse.json(
    {
      provider: enabled ? "google" : "fallback",
      enabled,
      browserKey: enabled ? browserKey : null,
      mapId: enabled ? (process.env.GOOGLE_MAPS_MAP_ID ?? null) : null,
      reasonCode: enabled
        ? null
        : !originAllowed
          ? "origin_not_allowed"
          : mode !== "external"
            ? "provider_not_external"
            : !browserKey
              ? "browser_key_missing"
              : "provider_not_supported",
    },
    {
      headers: {
        "cache-control": "private, no-store, max-age=0",
      },
    },
  );
}
