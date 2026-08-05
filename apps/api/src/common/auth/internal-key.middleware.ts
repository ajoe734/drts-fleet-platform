import { Injectable, Logger, Optional, type NestMiddleware } from "@nestjs/common";

import { ApiRequestError } from "../api-envelope";
import { extractBootstrapRequestIdentity } from "./auth.extractor";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import {
  evaluateInternalKey,
  parseCsvKeys,
} from "./internal-key-exception-registry";
import { internalKeyMetrics } from "./internal-key-metrics";
import { internalKeyAuditRecorder } from "./internal-key-audit";
import { SecurityEventsService } from "../../modules/security-events/security-events.service";

type HeaderValue = string | string[] | undefined;

type RequestLike = {
  headers?: Record<string, HeaderValue>;
  originalUrl?: string;
  url?: string;
  method?: string;
};

const INTERNAL_KEY_HEADER = "x-drts-internal-key";
export const REFERRAL_EMBED_HANDOFF_KEY_HEADER = "x-drts-referral-handoff-key";
const AUTHORIZATION_HEADER = "authorization";
const CONTROL_PLANE_AUTH_HEADER = "x-drts-authorization";
const HEALTH_PATHS = new Set(["/health", "/api/health"]);
const METRICS_PATHS = new Set(["/metrics", "/api/metrics"]);
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

const logger = new Logger("InternalKeyMiddleware");

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

export function isMetricsRequest(path: string | undefined): boolean {
  if (!path) {
    return false;
  }
  return METRICS_PATHS.has(stripQueryString(path));
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
  const headerValues = [
    normalizeHeaderValue(request.headers?.[AUTHORIZATION_HEADER]),
    normalizeHeaderValue(request.headers?.[CONTROL_PLANE_AUTH_HEADER]),
  ];
  return headerValues.some((value) => /^Bearer\s+\S+/i.test(value));
}

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

function isInternalKeyEnforcementDisabled(): boolean {
  return (
    !isStrictAuthEnvironment() &&
    process.env.DRTS_INTERNAL_KEY_ENFORCED?.trim().toLowerCase() === "false"
  );
}

export function validateInternalKey(
  request: RequestLike,
  expectedKey: string | undefined,
): void {
  const rawPath = request.originalUrl ?? request.url ?? "";
  const requestPath = stripQueryString(rawPath);
  const requestMethod = request.method ?? "GET";
  const strictEnvironment = isStrictAuthEnvironment();

  if (
    isHealthRequest(rawPath) ||
    isMetricsRequest(rawPath) ||
    isOptionsRequest(requestMethod) ||
    isExplicitPublicRequest(requestMethod, rawPath) ||
    hasBearerAuthorization(request)
  ) {
    return;
  }

  if (
    !strictEnvironment &&
    (!expectedKey || hasPublicBootstrapRealm(request))
  ) {
    return;
  }

  if (!expectedKey) {
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

  const previousKey = process.env.DRTS_INTERNAL_KEY_PREVIOUS?.trim();
  const previousKeyExpiresAt = process.env.DRTS_INTERNAL_KEY_PREVIOUS_EXPIRES_AT?.trim();
  const revokedKeys = parseCsvKeys(process.env.DRTS_INTERNAL_KEY_REVOKED_KEYS);

  const evalResult = evaluateInternalKey(providedKey, expectedKey, {
    headerName: INTERNAL_KEY_HEADER,
    requestPath,
    requestMethod,
    previousKey,
    previousKeyExpiresAt,
    revokedKeys,
  });

  if (evalResult.valid) {
    if (evalResult.keyState === "rotated_previous") {
      internalKeyMetrics.recordRotationPreviousUsed(
        evalResult.exception?.exceptionId,
        evalResult.exception?.owner,
      );
    }
    internalKeyAuditRecorder.recordUsage(evalResult, {
      header: INTERNAL_KEY_HEADER,
      route: `${requestMethod} ${requestPath}`,
    });
    const usageSignal =
      evalResult.exception?.usageSignal ?? "AUTH_INTERNAL_KEY_USED";
    logger.log(
      `[${usageSignal}] exceptionId=${evalResult.exception?.exceptionId} keyState=${evalResult.keyState} owner=${evalResult.exception?.owner} route=${requestMethod} ${requestPath}`,
    );
    return;
  }

  internalKeyMetrics.recordDriftAlert(
    evalResult.exception?.exceptionId,
    evalResult.code,
    `${requestMethod} ${requestPath}`,
  );
  internalKeyMetrics.recordUnauthorizedAttempt(
    evalResult.code,
    `${requestMethod} ${requestPath}`,
  );
  internalKeyAuditRecorder.recordDrift(evalResult, {
    header: INTERNAL_KEY_HEADER,
    route: `${requestMethod} ${requestPath}`,
  });

  logger.warn(
    `[AUTH_INTERNAL_KEY_DRIFT_ALERT] code=${evalResult.code} reason=${evalResult.reason} exceptionId=${evalResult.exception?.exceptionId} keyState=${evalResult.keyState} route=${requestMethod} ${requestPath}`,
  );

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
  requireScopedInternalKey(request, expectedKey, {
    header: INTERNAL_KEY_HEADER,
    requiredEnv: "DRTS_INTERNAL_KEY",
  });
}

/**
 * Enforce a purpose-bound server credential for a sensitive internal route.
 * Keeping the header and secret separate prevents a general control-plane key
 * from being replayed against a public referral handoff endpoint.
 */
export function requireScopedInternalKey(
  request: RequestLike,
  expectedKey: string | undefined,
  options: { header: string; requiredEnv: string },
): void {
  const rawPath = request.originalUrl ?? request.url ?? "";
  const requestPath = stripQueryString(rawPath);
  const requestMethod = request.method ?? "GET";
  const configuredKey = expectedKey?.trim();

  if (!configuredKey) {
    throw new ApiRequestError(
      503,
      "INTERNAL_KEY_NOT_CONFIGURED",
      `${options.header} validation is not configured for this environment.`,
      {
        route: requestPath,
        method: requestMethod,
        requiredEnv: options.requiredEnv,
      },
    );
  }

  const providedKey = normalizeHeaderValue(request.headers?.[options.header]);
  if (!providedKey) {
    throw new ApiRequestError(
      401,
      "INTERNAL_KEY_REQUIRED",
      `${options.header} header is required for this environment.`,
      {
        route: requestPath,
        method: requestMethod,
      },
    );
  }

  const previousKey = process.env[`${options.requiredEnv}_PREVIOUS`]?.trim();
  const previousKeyExpiresAt = process.env[`${options.requiredEnv}_PREVIOUS_EXPIRES_AT`]?.trim();
  const revokedKeys = parseCsvKeys(process.env[`${options.requiredEnv}_REVOKED_KEYS`]);

  const evalResult = evaluateInternalKey(providedKey, configuredKey, {
    headerName: options.header,
    requestPath,
    requestMethod,
    previousKey,
    previousKeyExpiresAt,
    revokedKeys,
  });

  if (evalResult.valid) {
    if (evalResult.keyState === "rotated_previous") {
      internalKeyMetrics.recordRotationPreviousUsed(
        evalResult.exception?.exceptionId,
        evalResult.exception?.owner,
      );
    }
    internalKeyAuditRecorder.recordUsage(evalResult, {
      header: options.header,
      route: `${requestMethod} ${requestPath}`,
    });
    const usageSignal =
      evalResult.exception?.usageSignal ?? "AUTH_SCOPED_INTERNAL_KEY_USED";
    logger.log(
      `[${usageSignal}] exceptionId=${evalResult.exception?.exceptionId} keyState=${evalResult.keyState} owner=${evalResult.exception?.owner} header=${options.header} route=${requestMethod} ${requestPath}`,
    );
    return;
  }

  internalKeyMetrics.recordDriftAlert(
    evalResult.exception?.exceptionId,
    evalResult.code,
    `${requestMethod} ${requestPath}`,
  );
  internalKeyMetrics.recordUnauthorizedAttempt(
    evalResult.code,
    `${requestMethod} ${requestPath}`,
  );
  internalKeyAuditRecorder.recordDrift(evalResult, {
    header: options.header,
    route: `${requestMethod} ${requestPath}`,
  });

  logger.warn(
    `[AUTH_SCOPED_INTERNAL_KEY_DRIFT_ALERT] code=${evalResult.code} reason=${evalResult.reason} exceptionId=${evalResult.exception?.exceptionId} keyState=${evalResult.keyState} header=${options.header} route=${requestMethod} ${requestPath}`,
  );

  throw new ApiRequestError(
    401,
    "INTERNAL_KEY_INVALID",
    `${options.header} header is invalid for this environment.`,
    {
      route: requestPath,
      method: requestMethod,
    },
  );
}

@Injectable()
export class InternalKeyMiddleware implements NestMiddleware {
  constructor(
    @Optional() private readonly securityEventsService?: SecurityEventsService,
  ) {}

  use(request: RequestLike, _response: unknown, next: () => void) {
    if (this.securityEventsService) {
      internalKeyAuditRecorder.setSecurityEventsService(
        this.securityEventsService,
      );
    }
    if (isInternalKeyEnforcementDisabled()) {
      next();
      return;
    }
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
    next();
  }
}
