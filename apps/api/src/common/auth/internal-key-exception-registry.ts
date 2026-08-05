import { ApiRequestError } from "../api-envelope";

export interface InternalKeyExceptionMetadata {
  exceptionId: string;
  owner: string;
  purpose: string;
  scope: string[];
  ttl: string;
  expiresAt: string;
  networkBoundary: string;
  rotationCadence: string;
  usageSignal: string;
  removalDate: string;
  removalPlan: string;
  header: string;
  envVar: string;
  rotationEnvVar?: string;
  revokedKeysEnvVar?: string;
  status: "active" | "deprecated" | "expired" | "revoked";
}

export const INTERNAL_KEY_EXCEPTION_REGISTRY: InternalKeyExceptionMetadata[] = [
  {
    exceptionId: "INTERNAL_KEY_EXCP_001",
    owner: "referral-team",
    purpose:
      "Scoped server-to-server referral embed handoff artifact issuance and consumption",
    scope: [
      "POST partner/ingress/referral-embed-handoff",
      "POST partner/ingress/referral-embed-handoff/consume",
      "POST partner/ingress/referral-embed-handoff/consent",
    ],
    ttl: "2026-10-31T23:59:59Z",
    expiresAt: "2026-10-31T23:59:59Z",
    networkBoundary: "internal-vpc-to-api-ingress",
    rotationCadence: "30d",
    usageSignal: "AUTH_SCOPED_INTERNAL_KEY_USED",
    removalDate: "2026-10-31",
    removalPlan:
      "Migrate referral-embed-web BFF caller to IAM-SVC-001 WIF token exchange",
    header: "x-drts-referral-handoff-key",
    envVar: "DRTS_REFERRAL_EMBED_HANDOFF_KEY",
    rotationEnvVar: "DRTS_REFERRAL_EMBED_HANDOFF_KEY_PREVIOUS",
    revokedKeysEnvVar: "DRTS_REFERRAL_EMBED_HANDOFF_KEY_REVOKED_KEYS",
    status: "active",
  },
  {
    exceptionId: "INTERNAL_KEY_EXCP_003",
    owner: "sre-ops",
    purpose: "Staging emergency break-glass local operations key",
    scope: [
      "GET health",
      "POST ops/*",
    ],
    ttl: "2026-08-31T23:59:59Z",
    expiresAt: "2026-08-31T23:59:59Z",
    networkBoundary: "staging-break-glass-only",
    rotationCadence: "7d",
    usageSignal: "AUTH_BREAKGLASS_INTERNAL_KEY_USED",
    removalDate: "2026-08-31",
    removalPlan:
      "Replace with IAM-BG-001 break-glass two-person approval and short session token",
    header: "x-drts-internal-key",
    envVar: "DRTS_INTERNAL_KEY",
    rotationEnvVar: "DRTS_INTERNAL_KEY_PREVIOUS",
    revokedKeysEnvVar: "DRTS_INTERNAL_KEY_REVOKED_KEYS",
    status: "active",
  },
  {
    exceptionId: "INTERNAL_KEY_EXCP_002",
    owner: "control-plane-ops",
    purpose:
      "Legacy control-plane proxy serverless fallback key when GCP WIF identity assertion is absent in transitional environment",
    scope: [
      "* *",
      "POST partner/ingress/handoff",
      "POST auth/token",
    ],
    ttl: "2026-09-15T23:59:59Z",
    expiresAt: "2026-09-15T23:59:59Z",
    networkBoundary: "control-plane-proxy-to-api",
    rotationCadence: "14d",
    usageSignal: "AUTH_LEGACY_INTERNAL_KEY_USED",
    removalDate: "2026-09-15",
    removalPlan:
      "Full deprecation of DRTS_INTERNAL_KEY fallback in favor of mandatory WIF workload identity assertion headers on all control-plane proxies",
    header: "x-drts-internal-key",
    envVar: "DRTS_INTERNAL_KEY",
    rotationEnvVar: "DRTS_INTERNAL_KEY_PREVIOUS",
    revokedKeysEnvVar: "DRTS_INTERNAL_KEY_REVOKED_KEYS",
    status: "active",
  },
];

export function validateExceptionMetadata(
  exception: InternalKeyExceptionMetadata,
): void {
  const requiredFields: Array<keyof InternalKeyExceptionMetadata> = [
    "exceptionId",
    "owner",
    "purpose",
    "scope",
    "ttl",
    "expiresAt",
    "networkBoundary",
    "rotationCadence",
    "usageSignal",
    "removalDate",
    "removalPlan",
    "header",
    "envVar",
  ];

  for (const field of requiredFields) {
    const val = exception[field];
    if (val === undefined || val === null) {
      throw new ApiRequestError(
        500,
        "INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE",
        `INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE: Internal key exception ${exception.exceptionId ?? "unknown"} is missing required metadata field '${field}'.`,
      );
    }
    if (typeof val === "string" && val.trim() === "") {
      throw new ApiRequestError(
        500,
        "INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE",
        `INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE: Internal key exception ${exception.exceptionId} has empty metadata field '${field}'.`,
      );
    }
    if (Array.isArray(val) && val.length === 0) {
      throw new ApiRequestError(
        500,
        "INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE",
        `INTERNAL_KEY_EXCEPTION_METADATA_INCOMPLETE: Internal key exception ${exception.exceptionId} has empty array scope.`,
      );
    }
  }

  const expiresTime = Date.parse(exception.expiresAt);
  if (Number.isNaN(expiresTime)) {
    throw new ApiRequestError(
      500,
      "INTERNAL_KEY_EXCEPTION_METADATA_INVALID",
      `INTERNAL_KEY_EXCEPTION_METADATA_INVALID: Internal key exception ${exception.exceptionId} has invalid ISO expiresAt date: ${exception.expiresAt}`,
    );
  }
}

export function isExceptionExpired(
  exception: InternalKeyExceptionMetadata,
  now: Date = new Date(),
): boolean {
  const expiresTime = Date.parse(exception.expiresAt);
  if (Number.isNaN(expiresTime)) {
    return true;
  }
  return now.getTime() > expiresTime;
}

function stripQueryString(path: string): string {
  const queryStart = path.indexOf("?");
  return queryStart >= 0 ? path.slice(0, queryStart) : path;
}

export function normalizeRequestPath(path: string): string {
  return stripQueryString(path)
    .replace(/^\/+/, "")
    .replace(/^api\/+/, "")
    .replace(/\/+$/, "");
}

export function matchesScope(
  scopePattern: string,
  requestMethod?: string,
  requestPath?: string,
): boolean {
  if (!requestMethod || !requestPath) {
    return true;
  }

  const spaceIndex = scopePattern.indexOf(" ");
  if (spaceIndex === -1) {
    if (scopePattern === "*") return true;
    return false;
  }

  const patternMethod = scopePattern.slice(0, spaceIndex).trim().toUpperCase();
  const rawPatternPath = scopePattern.slice(spaceIndex + 1).trim();
  const patternPath = normalizeRequestPath(rawPatternPath);

  if (patternMethod !== "*" && requestMethod.toUpperCase() !== patternMethod) {
    return false;
  }

  const normReqPath = normalizeRequestPath(requestPath);

  if (patternPath === "*" || patternPath === "**" || rawPatternPath === "*") {
    return true;
  }

  if (patternPath === normReqPath) {
    return true;
  }

  if (patternPath.endsWith("/*")) {
    const prefix = patternPath.slice(0, -2);
    return normReqPath === prefix || normReqPath.startsWith(prefix + "/");
  }

  if (patternPath.endsWith("/**")) {
    const prefix = patternPath.slice(0, -3);
    return normReqPath === prefix || normReqPath.startsWith(prefix + "/");
  }

  if (patternPath.includes("*")) {
    const regexStr = "^" + patternPath.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$";
    const regex = new RegExp(regexStr);
    return regex.test(normReqPath);
  }

  return false;
}

export function findMatchingExceptions(
  headerName: string,
  requestPath?: string,
  requestMethod?: string,
  registry: InternalKeyExceptionMetadata[] = INTERNAL_KEY_EXCEPTION_REGISTRY,
): InternalKeyExceptionMetadata[] {
  const normalizedHeader = headerName.trim().toLowerCase();
  const matches: InternalKeyExceptionMetadata[] = [];

  for (const entry of registry) {
    if (entry.header.toLowerCase() !== normalizedHeader) {
      continue;
    }

    if (requestPath && requestMethod) {
      const scopeMatches = entry.scope.some((pattern) =>
        matchesScope(pattern, requestMethod, requestPath),
      );
      if (scopeMatches) {
        matches.push(entry);
      }
    } else {
      matches.push(entry);
    }
  }

  // Sort candidate exceptions so specific route scope matches precede generic wildcard ("* *") patterns
  matches.sort((a, b) => {
    const aHasWildcard = a.scope.some((s) => s === "* *" || s === "*");
    const bHasWildcard = b.scope.some((s) => s === "* *" || s === "*");
    if (aHasWildcard && !bHasWildcard) return 1;
    if (!aHasWildcard && bHasWildcard) return -1;
    return 0;
  });

  return matches;
}

export function findMatchingException(
  headerName: string,
  requestPath?: string,
  requestMethod?: string,
  registry: InternalKeyExceptionMetadata[] = INTERNAL_KEY_EXCEPTION_REGISTRY,
): InternalKeyExceptionMetadata | null {
  const candidates = findMatchingExceptions(headerName, requestPath, requestMethod, registry);
  return candidates[0] ?? null;
}

export function parseCsvKeys(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export interface KeyEvaluationResult {
  valid: boolean;
  code?: string;
  reason?: string;
  exception?: InternalKeyExceptionMetadata;
  keyState?: "active" | "rotated_previous" | "expired" | "revoked" | "undocumented" | "invalid";
}

export interface EvaluateInternalKeyOptions {
  headerName: string;
  requestPath?: string | undefined;
  requestMethod?: string | undefined;
  previousKey?: string | undefined;
  previousKeyExpiresAt?: string | Date | undefined;
  revokedKeys?: string[] | undefined;
  now?: Date | undefined;
  environment?: string | undefined;
  registry?: InternalKeyExceptionMetadata[] | undefined;
}

export function evaluateInternalKey(
  providedKey: string,
  expectedKey: string | undefined,
  options: EvaluateInternalKeyOptions,
): KeyEvaluationResult {
  const registry = options.registry ?? INTERNAL_KEY_EXCEPTION_REGISTRY;
  const now = options.now ?? new Date();
  const candidates = findMatchingExceptions(
    options.headerName,
    options.requestPath,
    options.requestMethod,
    registry,
  );

  if (candidates.length === 0) {
    return {
      valid: false,
      code: "INTERNAL_KEY_UNDOCUMENTED",
      reason: `No documented exception metadata found for header '${options.headerName}' matching route ${options.requestMethod ?? "GET"} ${options.requestPath ?? "*"}.`,
      keyState: "undocumented",
    };
  }

  const rawEnv = options.environment ?? process.env.DRTS_ENV ?? process.env.APP_ENV ?? process.env.NODE_ENV ?? "local";
  const isProduction = ["prod", "production"].includes(rawEnv.trim().toLowerCase());

  let boundaryViolationCandidate: InternalKeyExceptionMetadata | null = null;
  let expiredCandidate: InternalKeyExceptionMetadata | null = null;
  let invalidKeyCandidate: InternalKeyExceptionMetadata | null = null;

  for (const exception of candidates) {
    // Validate complete metadata
    try {
      validateExceptionMetadata(exception);
    } catch {
      continue;
    }

    // Check network boundary
    if (isProduction && exception.networkBoundary === "staging-break-glass-only") {
      boundaryViolationCandidate = boundaryViolationCandidate ?? exception;
      continue;
    }

    // Check expiration
    if (isExceptionExpired(exception, now)) {
      expiredCandidate = expiredCandidate ?? exception;
      continue;
    }

    // Check revocation
    const revokedSet = new Set(options.revokedKeys ?? []);
    if (revokedSet.has(providedKey)) {
      return {
        valid: false,
        code: "INTERNAL_KEY_REVOKED",
        reason: `Provided internal key for exception ${exception.exceptionId} has been revoked.`,
        exception,
        keyState: "revoked",
      };
    }

    // Check primary key match
    if (expectedKey && timingSafeMatch(providedKey, expectedKey)) {
      return {
        valid: true,
        exception,
        keyState: "active",
      };
    }

    // Check rotation previous key match and check rotation overlap key expiry
    if (options.previousKey && timingSafeMatch(providedKey, options.previousKey)) {
      if (options.previousKeyExpiresAt) {
        const prevExpiresTime =
          typeof options.previousKeyExpiresAt === "string"
            ? Date.parse(options.previousKeyExpiresAt)
            : options.previousKeyExpiresAt.getTime();
        if (!Number.isNaN(prevExpiresTime) && now.getTime() > prevExpiresTime) {
          return {
            valid: false,
            code: "INTERNAL_KEY_EXPIRED",
            reason: `Rotation overlap key for exception ${exception.exceptionId} has expired.`,
            exception,
            keyState: "expired",
          };
        }
      }
      return {
        valid: true,
        exception,
        keyState: "rotated_previous",
      };
    }

    invalidKeyCandidate = invalidKeyCandidate ?? exception;
  }

  if (invalidKeyCandidate) {
    return {
      valid: false,
      code: "INTERNAL_KEY_INVALID",
      reason: `Provided key does not match active or rotation overlap keys for ${invalidKeyCandidate.exceptionId}.`,
      exception: invalidKeyCandidate,
      keyState: "invalid",
    };
  }

  if (expiredCandidate) {
    return {
      valid: false,
      code: "INTERNAL_KEY_EXPIRED",
      reason: `Internal key exception ${expiredCandidate.exceptionId} expired on ${expiredCandidate.expiresAt}.`,
      exception: expiredCandidate,
      keyState: "expired",
    };
  }

  if (boundaryViolationCandidate) {
    return {
      valid: false,
      code: "INTERNAL_KEY_BOUNDARY_VIOLATION",
      reason: `Internal key exception ${boundaryViolationCandidate.exceptionId} is restricted to network boundary '${boundaryViolationCandidate.networkBoundary}' and cannot be used in production.`,
      exception: boundaryViolationCandidate,
      keyState: "invalid",
    };
  }

  const fallbackCandidate = candidates[0];
  if (fallbackCandidate) {
    return {
      valid: false,
      code: "INTERNAL_KEY_INVALID",
      reason: `Provided key does not match active or rotation overlap keys for ${fallbackCandidate.exceptionId}.`,
      exception: fallbackCandidate,
      keyState: "invalid",
    };
  }

  return {
    valid: false,
    code: "INTERNAL_KEY_UNDOCUMENTED",
    reason: `No documented exception metadata found for header '${options.headerName}' matching route ${options.requestMethod ?? "GET"} ${options.requestPath ?? "*"}.`,
    keyState: "undocumented",
  };
}

function timingSafeMatch(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
