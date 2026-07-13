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

function browserRequestOrigin(request: NextRequest) {
  const source =
    firstHeaderValue(request.headers.get("origin")) ??
    firstHeaderValue(request.headers.get("referer"));
  if (!source) return null;

  try {
    const parsed = new URL(source);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.origin
      : "invalid";
  } catch {
    return "invalid";
  }
}

function isOriginAllowed(request: NextRequest, origins: string[]) {
  const fetchSite = firstHeaderValue(request.headers.get("sec-fetch-site"));
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const requestOrigin = browserRequestOrigin(request);
  return (
    !requestOrigin || origins.length === 0 || origins.includes(requestOrigin)
  );
}

export function GET(request: NextRequest) {
  const mode = (process.env.MAP_PROVIDER_MODE ?? "mock").toLowerCase();
  const provider = (process.env.MAP_PROVIDER_NAME ?? "google").toLowerCase();
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
  const origins = allowedOrigins();
  const originAllowed = isOriginAllowed(request, origins);
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
