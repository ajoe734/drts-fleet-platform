import { Injectable, type NestMiddleware } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";

import { ApiRequestError } from "../api-envelope";
import { extractBootstrapRequestIdentity } from "./auth.extractor";

type HeaderValue = string | string[] | undefined;

type RequestLike = {
  headers?: Record<string, HeaderValue>;
  originalUrl?: string;
  url?: string;
  method?: string;
};

const INTERNAL_KEY_HEADER = "x-drts-internal-key";
const AUTHORIZATION_HEADER = "authorization";
const HEALTH_PATHS = new Set(["/health", "/api/health"]);
const EXPLICIT_PUBLIC_ROUTE_KEYS = new Set([
  "GET identity/context",
  "GET tenant/roles",
  "POST auth/tenant/bootstrap-session",
  "POST auth/partner/bootstrap-session",
]);
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

function normalizeRequestPath(path: string): string {
  return stripQueryString(path)
    .replace(/^\/+/, "")
    .replace(/^api\/+/, "")
    .replace(/\/+$/, "");
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

  return EXPLICIT_PUBLIC_ROUTE_KEYS.has(
    `${method.toUpperCase()} ${normalizeRequestPath(path)}`,
  );
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
  const authorization = normalizeHeaderValue(
    request.headers?.[AUTHORIZATION_HEADER],
  );
  return /^Bearer\s+\S+/i.test(authorization);
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

@Injectable()
export class InternalKeyMiddleware implements NestMiddleware {
  use(request: RequestLike, _response: unknown, next: () => void) {
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
    next();
  }
}
