#!/usr/bin/env node

const GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MAPS_JS_URL = "https://maps.googleapis.com/maps/api/js";
const timeoutMs = positiveNumber(process.env.MAP_PROVIDER_TIMEOUT_MS, 10_000);

const geocodingKey = required("GOOGLE_MAPS_GEOCODING_API_KEY");
const routesKey = required("GOOGLE_MAPS_ROUTES_API_KEY");
const browserKey = required("GOOGLE_MAPS_BROWSER_KEY");
const allowedOrigin = required("MAP_PROVIDER_SMOKE_ORIGIN").replace(/\/$/, "");

await verifyGeocoding();
await verifyRoutes();
await verifyBrowserMap();

console.log("LIVE_GEOCODING_SMOKE=PASS");
console.log("LIVE_ROUTES_SMOKE=PASS");
console.log("LIVE_BROWSER_MAPS_SMOKE=PASS");

async function verifyGeocoding() {
  const url = new URL(GEOCODING_URL);
  url.searchParams.set("address", "台北車站");
  url.searchParams.set("language", "zh-TW");
  url.searchParams.set("region", "tw");
  url.searchParams.set("key", geocodingKey);
  const payload = await requestJson(url, {}, "geocoding");
  const results = Array.isArray(payload.results) ? payload.results : [];
  const location = record(record(results[0])?.geometry)?.location;
  const point = record(location);
  const lat = finiteNumber(point?.lat);
  const lng = finiteNumber(point?.lng);
  assert(payload.status === "OK", "geocoding did not return OK");
  assert(results.length > 0, "geocoding returned no result");
  assert(
    lat !== null && lat >= 21 && lat <= 26.5,
    "geocoding latitude is outside Taiwan",
  );
  assert(
    lng !== null && lng >= 119 && lng <= 123,
    "geocoding longitude is outside Taiwan",
  );
}

async function verifyRoutes() {
  const payload = await requestJson(
    ROUTES_URL,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": routesKey,
        "x-goog-fieldmask":
          "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: waypoint(25.0478, 121.5171),
        destination: waypoint(25.0375, 121.5637),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "zh-TW",
        units: "METRIC",
      }),
    },
    "routes",
  );
  const routes = Array.isArray(payload.routes) ? payload.routes : [];
  const route = record(routes[0]);
  const polyline = record(route?.polyline);
  assert(routes.length > 0, "routes returned no result");
  assert(
    (finiteNumber(route?.distanceMeters) ?? 0) > 0,
    "routes distance is missing",
  );
  assert(
    /^[0-9.]+s$/.test(text(route?.duration) ?? ""),
    "routes duration is invalid",
  );
  assert(
    (text(polyline?.encodedPolyline)?.length ?? 0) > 0,
    "routes polyline is missing",
  );
}

async function verifyBrowserMap() {
  const url = new URL(MAPS_JS_URL);
  url.searchParams.set("key", browserKey);
  url.searchParams.set("v", "weekly");
  url.searchParams.set("loading", "async");
  const response = await fetch(url, {
    headers: { referer: `${allowedOrigin}/` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.ok, `browser map returned HTTP ${response.status}`);
  const source = await response.text();
  assert(source.length > 10_000, "browser map script is unexpectedly empty");
  assert(
    !/InvalidKeyMapError|RefererNotAllowedMapError|ApiNotActivatedMapError/.test(
      source,
    ),
    "browser map key or referrer restriction was rejected",
  );
}

async function requestJson(url, init, label) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert(response.ok, `${label} returned HTTP ${response.status}`);
  try {
    return record(await response.json()) ?? {};
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

function waypoint(latitude, longitude) {
  return { location: { latLng: { latitude, longitude } } };
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Google Maps live smoke failed: ${message}`);
  }
}
