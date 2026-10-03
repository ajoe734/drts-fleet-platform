import {
  Injectable,
  Logger,
  Optional,
  type NestMiddleware,
} from "@nestjs/common";

import { ApiRequestError } from "../api-envelope";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import {
  evaluateInternalKey,
  parseCsvKeys,
} from "./internal-key-exception-registry";
import { internalKeyMetrics } from "./internal-key-metrics";
import { internalKeyAuditRecorder } from "./internal-key-audit";
import { SecurityEventsService } from "../../modules/security-events/security-events.service";
import {
  extractGoogleWorkloadIdentityAssertion,
  GoogleWorkloadIdentityAdapter,
  isGoogleWorkloadIdentityNotConfigured,
  isGoogleWorkloadIdentityPrincipalNotRegistered,
} from "../../modules/auth/google-workload-identity.adapter";

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
const EXPLICIT_PUBLIC_ROUTE_KEYS = new Set([
  "GET identity/context",
  "GET tenant/roles",
  "POST auth/tenant/oidc-session",
  "POST auth/tenant/bootstrap-session",
  "POST auth/partner/bootstrap-session",
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

function isRemittanceProofGrantRequest(method: string, path: string): boolean {
  // This one GET endpoint authenticates its bearer grant in the controller
  // (signature, expiry, proof identity and clean scan) before serving bytes.
  // Durable V0098 rows use raw UUIDs; only the test-memory fallback adds
  // `remit-proof-`. Both still require the downstream signed-grant checks.
  // Do not admit uploads, grant issuance, other artifact kinds or child paths.
  return method.toUpperCase() === "GET" &&
    /^\/(?:api\/)?reimbursements\/proof-downloads\/remittance-proof\/(?:remit-proof-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(stripQueryString(path));
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

export async function validateInternalKey(
  request: RequestLike,
  expectedKey: string | undefined,
  options?: { googleWorkloadIdentityAdapter?: GoogleWorkloadIdentityAdapter },
): Promise<void> {
  const rawPath = request.originalUrl ?? request.url ?? "";
  const requestMethod = request.method ?? "GET";

  if (
    isHealthRequest(rawPath) ||
    isOptionsRequest(requestMethod) ||
    isExplicitPublicRequest(requestMethod, rawPath) ||
    isRemittanceProofGrantRequest(requestMethod, rawPath) ||
    hasBearerAuthorization(request)
  ) {
    return;
  }

  return verifyGoogleAssertionOrInternalKey(request, expectedKey, options);
}

/**
 * Core WIF-or-internal-key check shared by `validateInternalKey` (the
 * general InternalKeyMiddleware gate, which additionally bypasses health/
 * options/explicit-public routes and anything already carrying a Bearer
 * token verified downstream) and callers like
 * `TenantPartnerController.issuePartnerIngressHandoff`'s `allowInternalBootstrap`
 * branch, which have no such downstream Bearer verification and must not
 * inherit that bypass -- an arbitrary `Authorization: Bearer x` header must
 * not satisfy this check outside the general middleware's context.
 */
export async function verifyGoogleAssertionOrInternalKey(
  request: RequestLike,
  expectedKey: string | undefined,
  options?: {
    googleWorkloadIdentityAdapter?: GoogleWorkloadIdentityAdapter;
    // The general InternalKeyMiddleware gate treats an unconfigured internal
    // key as "nobody set up internal-key auth in this (non-strict) local/dev
    // environment, so don't enforce it" -- appropriate for its broad, every-
    // route coverage. A narrow, deliberate gate like
    // TenantPartnerController.issuePartnerIngressHandoff's
    // allowInternalBootstrap branch guards one sensitive operation and must
    // fail closed even in dev when no credential at all is configured or
    // presented, so it sets this to true.
    requireCredential?: boolean;
  },
): Promise<void> {
  const rawPath = request.originalUrl ?? request.url ?? "";
  const requestPath = stripQueryString(rawPath);
  const requestMethod = request.method ?? "GET";
  const strictEnvironment = Boolean(
    isStrictAuthEnvironment() || options?.requireCredential,
  );

  const configuredKey = expectedKey?.trim();

  const rawGoogleAssertion = extractGoogleWorkloadIdentityAssertion(
    request.headers,
  );
  if (rawGoogleAssertion && options?.googleWorkloadIdentityAdapter) {
    try {
      await options.googleWorkloadIdentityAdapter.verifyServicePrincipal(
        request.headers ?? {},
        {
          requestPath,
          requestMethod,
          // General proxied requests reuse one Google-minted identity token
          // for every concurrent call a page makes (the Cloud Run metadata
          // server caches and returns the same token for its whole validity
          // window), so this path must not treat repeat presentation of the
          // identical assertion as a replay. One-time consumption stays
          // enforced for session issuance (`POST /api/auth/token`), which
          // calls this adapter separately in `auth.controller.ts`.
          enforceReplayProtection: false,
        },
      );
      return;
    } catch (error) {
      // Registry not populated yet (ops rollout not complete), or this
      // caller's verified identity has no registry entry yet: fall back to
      // `x-drts-internal-key` below (INTERNAL_KEY_EXCP_002 is retired, so
      // that fallback now only succeeds if some *other* exception is ever
      // registered for that header). Any other error (bad signature, wrong
      // issuer/audience, route scope denial) is a genuine rejection for an
      // already-registered principal and must not be masked by falling
      // through.
      if (
        !isGoogleWorkloadIdentityNotConfigured(error) &&
        !isGoogleWorkloadIdentityPrincipalNotRegistered(error)
      ) {
        throw error;
      }
    }
  }

  if (!strictEnvironment && !configuredKey) {
    return;
  }

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

  const previousKey = process.env.DRTS_INTERNAL_KEY_PREVIOUS?.trim();
  const previousKeyExpiresAt =
    process.env.DRTS_INTERNAL_KEY_PREVIOUS_EXPIRES_AT?.trim();
  const revokedKeys = parseCsvKeys(process.env.DRTS_INTERNAL_KEY_REVOKED_KEYS);

  const evalResult = evaluateInternalKey(providedKey, configuredKey, {
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
    evalResult.exception,
  );
  internalKeyMetrics.recordUnauthorizedAttempt(
    evalResult.code,
    `${requestMethod} ${requestPath}`,
    evalResult.exception,
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
  const previousKeyExpiresAt =
    process.env[`${options.requiredEnv}_PREVIOUS_EXPIRES_AT`]?.trim();
  const revokedKeys = parseCsvKeys(
    process.env[`${options.requiredEnv}_REVOKED_KEYS`],
  );

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
    evalResult.exception,
  );
  internalKeyMetrics.recordUnauthorizedAttempt(
    evalResult.code,
    `${requestMethod} ${requestPath}`,
    evalResult.exception,
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
    @Optional()
    private readonly googleWorkloadIdentityAdapter?: GoogleWorkloadIdentityAdapter,
  ) {}

  async use(request: RequestLike, _response: unknown, next: () => void) {
    if (this.securityEventsService) {
      internalKeyAuditRecorder.setSecurityEventsService(
        this.securityEventsService,
      );
    }
    if (isInternalKeyEnforcementDisabled()) {
      next();
      return;
    }
    await validateInternalKey(request, process.env.DRTS_INTERNAL_KEY, {
      ...(this.googleWorkloadIdentityAdapter
        ? { googleWorkloadIdentityAdapter: this.googleWorkloadIdentityAdapter }
        : {}),
    });
    next();
  }
}
