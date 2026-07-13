import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function allowedOrigins() {
  return (process.env.MAP_PROVIDER_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function GET(request: NextRequest) {
  const mode = (process.env.MAP_PROVIDER_MODE ?? "mock").toLowerCase();
  const provider = (process.env.MAP_PROVIDER_NAME ?? "google").toLowerCase();
  const browserKey = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
  const origins = allowedOrigins();
  const requestOrigin = request.nextUrl.origin.replace(/\/$/, "");
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
