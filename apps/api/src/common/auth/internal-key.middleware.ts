import { Injectable, type NestMiddleware } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { ApiRequestError } from "../api-envelope";
import { extractBootstrapRequestIdentity } from "./auth.extractor";
import { resolveOpenRouteInventoryEntry } from "./open-route.inventory";

type HeaderValue = string | string[] | undefined;

type RequestLike = {
  headers?: Record<string, HeaderValue>;
  originalUrl?: string;
  url?: string;
  method?: string;
};

const INTERNAL_KEY_HEADER = "x-drts-internal-key";
const AUTHORIZATION_HEADER = "authorization";
const CONTROL_PLANE_AUTH_HEADER = "x-drts-authorization";
const HEALTH_PATHS = new Set(["/health", "/api/health"]);
const PUBLIC_BOOTSTRAP_REALMS = new Set([
  "platform",
  "tenant",
  "ops",
  "driver",
  "partner",
]);

function normalizeHeaderValue(value: HeaderValue): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function stripQueryString(path: string): string {
  const queryStart = path.indexOf("?");
  return queryStart >= 0 ? path.slice(0, queryStart) : path;
}

export function isHealthRequest(path: string | undefined): boolean {
  if (!path) {
    return false;
  }
  return HEALTH_PATHS.has(stripQueryString(path));
}

function isOptionsRequest(method: string | undefined): boolean {
  return method?.toUpperCase() === "OPTIONS";
}

function isExplicitPublicRequest(
  method: string | undefined,
  path: string | undefined,
): boolean {
  if (!method || !path) {
    return false;
  }

  return Boolean(resolveOpenRouteInventoryEntry(method, path));
}

function hasPublicBootstrapRealm(request: RequestLike): boolean {
  const identity = extractBootstrapRequestIdentity(request.headers ?? {}, {
    allowAnonymous: false,
    method: request.method,
    requestUrl: request.originalUrl ?? request.url,
  });

  return Boolean(
    identity &&
    identity.actorType !== "system" &&
    identity.actorId &&
    PUBLIC_BOOTSTRAP_REALMS.has(identity.realm),
  );
}

function hasBearerAuthorization(request: RequestLike): boolean {
  const headerValues = [
    normalizeHeaderValue(request.headers?.[AUTHORIZATION_HEADER]),
    normalizeHeaderValue(request.headers?.[CONTROL_PLANE_AUTH_HEADER]),
  ];
  return headerValues.some((value) => /^Bearer\s+\S+/i.test(value));
}

export function validateInternalKey(
  request: RequestLike,
  expectedKey: string | undefined,
): void {
  const requestPath = request.originalUrl ?? request.url ?? "";
  const requestMethod = request.method ?? "GET";

  if (
    !expectedKey ||
    isHealthRequest(requestPath) ||
    isOptionsRequest(requestMethod) ||
    isExplicitPublicRequest(requestMethod, requestPath) ||
    hasPublicBootstrapRealm(request) ||
    hasBearerAuthorization(request)
  ) {
    return;
  }

  const providedKey = normalizeHeaderValue(
    request.headers?.[INTERNAL_KEY_HEADER],
  );
  if (!providedKey) {
    throw new ApiRequestError(
      401,
      "INTERNAL_KEY_REQUIRED",
      "x-drts-internal-key header is required for this environment.",
      {
        route: requestPath,
        method: requestMethod,
      },
    );
  }

  const expectedBuffer = Buffer.from(expectedKey, "utf8");
  const providedBuffer = Buffer.from(providedKey, "utf8");
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);

  if (matches) {
    return;
  }

  throw new ApiRequestError(
    401,
    "INTERNAL_KEY_INVALID",
    "x-drts-internal-key header is invalid for this environment.",
    {
      route: requestPath,
      method: requestMethod,
    },
  );
}

export function requireInternalKey(
  request: RequestLike,
  expectedKey: string | undefined,
): void {
  const requestPath = request.originalUrl ?? request.url ?? "";
  const requestMethod = request.method ?? "GET";
  const configuredKey = expectedKey?.trim();

  if (!configuredKey) {
    throw new ApiRequestError(
      503,
      "INTERNAL_KEY_NOT_CONFIGURED",
      "x-drts-internal-key validation is not configured for this environment.",
      {
        route: requestPath,
        method: requestMethod,
        requiredEnv: "DRTS_INTERNAL_KEY",
      },
    );
  }

  const providedKey = normalizeHeaderValue(
    request.headers?.[INTERNAL_KEY_HEADER],
  );
  if (!providedKey) {
    throw new ApiRequestError(
      401,
      "INTERNAL_KEY_REQUIRED",
      "x-drts-internal-key header is required for this environment.",
      {
        route: requestPath,
        method: requestMethod,
      },
    );
  }

  const expectedBuffer = Buffer.from(configuredKey, "utf8");
  const providedBuffer = Buffer.from(providedKey, "utf8");
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);

  if (matches) {
    return;
  }

  throw new ApiRequestError(
    401,
    "INTERNAL_KEY_INVALID",
    "x-drts-internal-key header is invalid for this environment.",
    {
      route: requestPath,
      method: requestMethod,
    },
  );
}

@Injectable()
export class InternalKeyMiddleware implements NestMiddleware {
  use(request: RequestLike, _response: unknown, next: () => void) {
    // Non-prod escape hatch: when enforcement is explicitly disabled (dev, so
    // every server-to-server surface — e.g. the passenger embed resolving its
    // partner entry — works without depending on per-service key mounts), the
    // internal-key gate is a no-op. Defaults to enforced; prod never sets the
    // flag, so production stays locked down.
    if (process.env.DRTS_INTERNAL_KEY_ENFORCED === "false") {
      next();
      return;
    }
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
    next();
  }
}
