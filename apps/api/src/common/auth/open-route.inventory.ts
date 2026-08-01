export type OpenRouteRateLimitPolicy =
  | "OPEN_ROUTE_RATE_LIMIT"
  | "READ_HEAVY_RATE_LIMIT"
  | "RATE_LIMIT_SKIP_DEFAULT";

export interface OpenRouteInventoryEntry {
  method: string;
  path: string;
  description: string;
  dataExposure: string;
  rateLimitPolicy: OpenRouteRateLimitPolicy;
}

export const OPEN_ROUTE_INVENTORY: readonly OpenRouteInventoryEntry[] = [
  {
    method: "GET",
    path: "health",
    description: "API liveness and dependency health probe",
    dataExposure: "Service status and dependency health summary only.",
    rateLimitPolicy: "RATE_LIMIT_SKIP_DEFAULT",
  },
  {
    method: "GET",
    path: "identity/context",
    description: "Anonymous-safe identity context probe",
    dataExposure: "Resolved caller identity envelope only; no secret material.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "GET",
    path: "tenant/roles",
    description: "Tenant role catalog bootstrap read",
    dataExposure: "Role catalog metadata only; no tenant membership state.",
    rateLimitPolicy: "READ_HEAVY_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "auth/driver/device/register",
    description: "Driver device registration exchange",
    dataExposure: "Short-lived device provisioning session only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "auth/driver/device/refresh",
    description: "Driver device refresh exchange",
    dataExposure: "Short-lived refreshed device session only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "auth/partner/bootstrap-session",
    description: "Partner bootstrap session exchange",
    dataExposure: "Partner bootstrap session envelope only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "auth/tenant/bootstrap-session",
    description: "Tenant bootstrap session exchange",
    dataExposure: "Tenant bootstrap session envelope only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "multi-taxi/rides",
    description: "Passenger ride creation handoff",
    dataExposure: "Created ride handoff details for the presented request only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "GET",
    path: "partner/entries",
    description: "Partner entry catalog lookup",
    dataExposure: "Public partner entry catalog fields only.",
    rateLimitPolicy: "READ_HEAVY_RATE_LIMIT",
  },
  {
    method: "GET",
    path: "partner/entries/:entrySlug",
    description: "Partner entry detail lookup",
    dataExposure: "Public partner entry detail fields only.",
    rateLimitPolicy: "READ_HEAVY_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "partner/ingress/handoff",
    description: "Partner ingress handoff exchange",
    dataExposure: "Short-lived ingress handoff session only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "partner/ingress/referral-embed-handoff",
    description: "Referral embed handoff creation",
    dataExposure: "Short-lived referral embed session only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "partner/ingress/referral-embed-handoff/consent",
    description: "Referral embed consent recording",
    dataExposure: "Consent receipt only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "partner/ingress/referral-embed-handoff/consume",
    description: "Referral embed session consumption",
    dataExposure: "Single-use referral embed session material only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "GET",
    path: "passenger-rides/:accessToken",
    description: "Passenger ride detail lookup by access token",
    dataExposure: "Ride status and passenger-facing trip details for one token.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "GET",
    path: "passenger-rides/:accessToken/events",
    description: "Passenger ride live event stream by access token",
    dataExposure: "Passenger-facing ride event stream for one token.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "passenger-rides/:accessToken/cancel",
    description: "Passenger ride cancellation by access token",
    dataExposure: "Cancellation result for one passenger ride token.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "passenger-rides/:accessToken/contact",
    description: "Passenger ride contact handoff",
    dataExposure: "Passenger-facing contact handoff result only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "POST",
    path: "passenger-rides/:accessToken/ratings",
    description: "Passenger ride rating submission",
    dataExposure: "Rating acknowledgement only.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
  {
    method: "GET",
    path: "passenger-rides/:accessToken/receipt",
    description: "Passenger ride receipt lookup by access token",
    dataExposure: "Passenger-facing receipt fields for one token.",
    rateLimitPolicy: "OPEN_ROUTE_RATE_LIMIT",
  },
] as const;

function normalizeRoutePath(url: string): string {
  const withoutQuery = url.split("?", 1)[0] ?? url;
  const trimmed = withoutQuery.replace(/^\/+/, "").replace(/^api\/+/, "");
  return trimmed.replace(/\/+$/, "");
}

function pathToRegExp(path: string) {
  const escaped = path
    .split("/")
    .map((segment) =>
      segment.startsWith(":")
        ? "[^/]+"
        : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${escaped}$`);
}

export function resolveOpenRouteInventoryEntry(
  method: string,
  url: string,
): OpenRouteInventoryEntry | null {
  const normalizedMethod = method.toUpperCase();
  const routePath = normalizeRoutePath(url);

  for (const entry of OPEN_ROUTE_INVENTORY) {
    if (entry.method !== normalizedMethod) {
      continue;
    }

    if (pathToRegExp(entry.path).test(routePath)) {
      return entry;
    }
  }

  return null;
}
