/**
 * Google map availability for the passenger pages. Same gate as the referral
 * embed (and the Ops console's map-provider-config): the browser key is given
 * to a page only when the provider is external Google, the key is set, and
 * the page's own public origin is listed in MAP_PROVIDER_ALLOWED_ORIGINS (the
 * key's referrer list mirrors that list). Otherwise the key stays on the
 * server and the pages keep their built-in schematic map and address grid.
 */
export interface PassengerMapConfig {
  enabled: boolean;
  browserKey: string | null;
}

export const DISABLED_PASSENGER_MAP_CONFIG: PassengerMapConfig = Object.freeze({
  enabled: false,
  browserKey: null,
});

type HeaderReader = { get(name: string): string | null };
// process.env shape; reads GOOGLE_MAPS_BROWSER_KEY, MAP_PROVIDER_MODE,
// MAP_PROVIDER_NAME, MAP_PROVIDER_ALLOWED_ORIGINS and K_SERVICE.
type MapEnv = Readonly<Record<string, string | undefined>>;

const AUTHORITY = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::([0-9]{1,5}))?$/i;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function validAuthority(value: string | null): string | null {
  if (!value) return null;
  const match = AUTHORITY.exec(value);
  const hostname = match?.[1];
  const port = match?.[2];
  if (!hostname) return null;
  if (port && (Number(port) < 1 || Number(port) > 65535)) return null;
  if (
    !hostname.startsWith("[") &&
    (hostname.length > 253 ||
      hostname.split(".").some((label) => !DNS_LABEL.test(label)))
  )
    return null;
  return value.toLowerCase();
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The browser-facing origin of the current request. ride.smarttransport.tw
 * reaches Cloud Run through a load balancer, so the forwarded host is
 * preferred over Host (Next also fills X-Forwarded-Host from Host). Cloud Run
 * terminates TLS before the standalone HTTP listener, so on Cloud Run the
 * scheme is always https, as in the referral embed's request-origin rule.
 */
export function resolvePassengerPublicOrigin(
  headers: HeaderReader,
  env: MapEnv = process.env,
): string | null {
  const authority =
    validAuthority(firstHeaderValue(headers.get("x-forwarded-host"))) ??
    validAuthority(firstHeaderValue(headers.get("host")));
  if (!authority) return null;
  const hostname = authority.replace(/:\d+$/, "");
  const forwardedProto = firstHeaderValue(
    headers.get("x-forwarded-proto"),
  )?.toLowerCase();
  const protocol = env.K_SERVICE?.trim()
    ? "https"
    : forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : LOOPBACK_HOSTS.has(hostname)
        ? "http"
        : "https";
  return normalizeOrigin(`${protocol}://${authority}`);
}

export function resolvePassengerMapConfig(
  env: MapEnv,
  publicOrigin: string | null,
): PassengerMapConfig {
  const browserKey = env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";
  const origin = publicOrigin ? normalizeOrigin(publicOrigin) : null;
  const allowedOrigins = (env.MAP_PROVIDER_ALLOWED_ORIGINS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(normalizeOrigin);
  const enabled =
    (env.MAP_PROVIDER_MODE?.trim() || "mock").toLowerCase() === "external" &&
    (env.MAP_PROVIDER_NAME?.trim() || "google").toLowerCase() === "google" &&
    browserKey.length > 0 &&
    origin !== null &&
    allowedOrigins.includes(origin);
  return enabled
    ? { enabled: true, browserKey }
    : DISABLED_PASSENGER_MAP_CONFIG;
}
