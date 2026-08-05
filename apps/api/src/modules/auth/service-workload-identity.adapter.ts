import { createHash } from "node:crypto";

import type { CanonicalIdentityPrincipalRecord } from "@drts/contracts";
import { Injectable } from "@nestjs/common";
import * as jwt from "jsonwebtoken";

import { ApiRequestError } from "../../common/api-envelope";
import { IdentityRepository } from "../identity/identity.repository";

type HeaderValue = string | string[] | undefined;
type HeaderRecord = Record<string, HeaderValue>;

type WorkloadIdentityPayload = jwt.JwtPayload & {
  sub?: string;
  aud?: string | string[];
  iss?: string;
  jti?: string;
};

interface RegisteredServicePrincipal {
  principalId: string;
  actorId?: string | null;
  subject: string;
  issuer?: string | null;
  displayName?: string | null;
  roles?: string[] | null;
  scopes: string[];
  allowedTokenAudiences?: string[] | null;
  defaultTokenAudience?: string | null;
}

interface WorkloadIdentityConfig {
  issuers: string[];
  audiences: string[];
  algorithms: jwt.Algorithm[];
  jwtSecretOrPublicKey: string;
  maxAssertionLifetimeSeconds: number;
  servicePrincipals: RegisteredServicePrincipal[];
}

export interface ResolvedWorkloadServiceIdentity {
  principalId: string;
  actorId: string;
  subject: string;
  issuer: string;
  displayName: string | null;
  roles: string[];
  scopes: string[];
  tokenAudience: string;
  authTime: string;
  tokenVersion: number;
  exchangeNonceHash: string;
}

export const WORKLOAD_IDENTITY_ASSERTION_HEADER = "x-drts-workload-assertion";
export const WORKLOAD_IDENTITY_EXCHANGE_NONCE_HEADER =
  "x-drts-workload-exchange-nonce";
export const WORKLOAD_TOKEN_AUDIENCE_HEADER = "x-drts-token-audience";
const DEFAULT_MAX_ASSERTION_LIFETIME_SECONDS = 15 * 60;
const ALLOWED_WORKLOAD_IDENTITY_ALGORITHMS = new Set<jwt.Algorithm>([
  "HS256",
  "HS384",
  "HS512",
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
]);
const HMAC_WORKLOAD_IDENTITY_ALGORITHMS = new Set<jwt.Algorithm>([
  "HS256",
  "HS384",
  "HS512",
]);
const ASYMMETRIC_WORKLOAD_IDENTITY_ALGORITHMS = new Set<jwt.Algorithm>([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
  "PS256",
  "PS384",
  "PS512",
]);

function normalizeHeaderValue(value: HeaderValue): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return typeof value === "string" ? value.trim() : "";
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

function normalizeAudience(
  value: string | string[] | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  const raw = Array.isArray(value) ? value : [value];
  return unique(
    raw.flatMap((entry) =>
      entry
        .split(/[;,]/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeAlgorithms(
  raw: string | undefined,
  jwtSecretOrPublicKey: string,
): jwt.Algorithm[] {
  const configured = splitCsv(raw);
  const algorithms =
    configured.length > 0
      ? configured
      : [looksLikePem(jwtSecretOrPublicKey) ? "RS256" : "HS256"];
  const invalid = algorithms.filter(
    (algorithm): algorithm is string =>
      !ALLOWED_WORKLOAD_IDENTITY_ALGORITHMS.has(algorithm as jwt.Algorithm),
  );
  if (invalid.length > 0) {
    throw new ApiRequestError(
      503,
      "WORKLOAD_IDENTITY_NOT_CONFIGURED",
      "Workload identity verification algorithms are invalid for this environment.",
      {
        invalidAlgorithms: invalid,
      },
    );
  }
  return algorithms as jwt.Algorithm[];
}

function looksLikePem(value: string): boolean {
  return /BEGIN (PUBLIC KEY|CERTIFICATE|RSA PUBLIC KEY)/.test(value);
}

function validateAlgorithmKeyMaterialPairing(
  algorithms: readonly jwt.Algorithm[],
  jwtSecretOrPublicKey: string,
): void {
  const hasHmac = algorithms.some((algorithm) =>
    HMAC_WORKLOAD_IDENTITY_ALGORITHMS.has(algorithm),
  );
  const hasAsymmetric = algorithms.some((algorithm) =>
    ASYMMETRIC_WORKLOAD_IDENTITY_ALGORITHMS.has(algorithm),
  );
  const hasAsymmetricKeyMaterial = looksLikePem(jwtSecretOrPublicKey);

  if (hasHmac && hasAsymmetric) {
    throw new ApiRequestError(
      503,
      "WORKLOAD_IDENTITY_NOT_CONFIGURED",
      "Workload identity verification algorithms must not mix symmetric and asymmetric families.",
    );
  }

  if (hasAsymmetricKeyMaterial && hasHmac) {
    throw new ApiRequestError(
      503,
      "WORKLOAD_IDENTITY_NOT_CONFIGURED",
      "Workload identity HMAC algorithms cannot be used with asymmetric key material.",
    );
  }

  if (!hasAsymmetricKeyMaterial && hasAsymmetric) {
    throw new ApiRequestError(
      503,
      "WORKLOAD_IDENTITY_NOT_CONFIGURED",
      "Workload identity asymmetric algorithms require PEM-encoded public key or certificate material.",
    );
  }
}

function toVerifyOptionList(
  values: readonly string[],
): string | [string, ...string[]] | undefined {
  if (values.length === 0) {
    return undefined;
  }
  if (values.length === 1) {
    return values[0];
  }
  return [...values] as [string, ...string[]];
}

function hashAssertion(assertion: string): string {
  return createHash("sha256").update(assertion).digest("hex");
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) {
      return true;
    }
  }
  return false;
}

function normalizePositiveInteger(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function extractWorkloadIdentityAssertion(
  headers: HeaderRecord | undefined,
): string | null {
  return (
    normalizeHeaderValue(headers?.[WORKLOAD_IDENTITY_ASSERTION_HEADER]) || null
  );
}

export function extractWorkloadIdentityExchangeNonce(
  headers: HeaderRecord | undefined,
): string | null {
  const value = normalizeHeaderValue(
    headers?.[WORKLOAD_IDENTITY_EXCHANGE_NONCE_HEADER],
  );
  return value || null;
}

export function extractRequestedWorkloadTokenAudience(
  headers: HeaderRecord | undefined,
): string | null {
  const value = normalizeHeaderValue(headers?.[WORKLOAD_TOKEN_AUDIENCE_HEADER]);
  return value || null;
}

@Injectable()
export class ServiceWorkloadIdentityAdapter {
  constructor(private readonly identityRepository: IdentityRepository) {}

  async resolveSubject(
    headers: HeaderRecord,
    options?: {
      requestedTokenAudience?: string | null;
      exchangeNonce?: string | null;
    },
  ): Promise<ResolvedWorkloadServiceIdentity> {
    const assertion = extractWorkloadIdentityAssertion(headers);
    if (!assertion) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_MISSING",
        "Missing required workload identity bearer assertion.",
      );
    }

    const config = this.loadConfig(process.env);
    const payload = this.verifyAssertion(assertion, config);
    const issuer = payload.iss?.trim();
    const subject = payload.sub?.trim();
    const assertionId = payload.jti?.trim();
    const temporalClaims = this.resolveTemporalClaims(payload, config);
    const authTime = this.resolveAuthTime(payload);

    if (!issuer || !subject || !assertionId) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Workload identity assertion is missing required issuer, subject, or jti claims.",
      );
    }

    const principal = this.resolveRegisteredPrincipal(
      config.servicePrincipals,
      issuer,
      subject,
    );
    const tokenAudience = this.resolveTokenAudience(
      principal,
      options?.requestedTokenAudience,
    );
    const exchangeNonce = this.requireExchangeNonce(options?.exchangeNonce);
    const exchangeNonceHash = hashAssertion(exchangeNonce);

    const replayAccepted =
      await this.identityRepository.consumeWorkloadIdentityAssertion({
        assertionHash: hashAssertion(`${issuer}\0${assertionId}`),
        issuer,
        subject,
        exchangeAudience: this.resolveMatchedExchangeAudience(
          payload,
          config.audiences,
        ),
        tokenAudience,
        exchangeNonceHash,
        principalId: principal.principalId,
        expiresAt: temporalClaims.expiresAt,
      });
    if (!replayAccepted) {
      throw new ApiRequestError(
        409,
        "WORKLOAD_ASSERTION_REPLAYED",
        "Workload identity assertion has already been consumed.",
      );
    }

    const existingPrincipal =
      await this.identityRepository.findPrincipalBySubject(issuer, subject);
    if (
      existingPrincipal &&
      existingPrincipal.principalId !== principal.principalId
    ) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_PRINCIPAL_CONFLICT",
        "Registered workload principal conflicts with existing durable identity.",
        {
          principalId: principal.principalId,
          existingPrincipalId: existingPrincipal.principalId,
        },
      );
    }

    const principalRecord: CanonicalIdentityPrincipalRecord = {
      principalId: principal.principalId,
      sourceRef: `workload_identity:${principal.principalId}`,
      issuer,
      subject,
      principalType: "service",
      email: null,
      emailVerified: false,
      displayName: principal.displayName ?? null,
      status: "active",
      createdAt: existingPrincipal?.createdAt ?? authTime,
      updatedAt: authTime,
    };
    await this.identityRepository.ensurePrincipalRecord(principalRecord);

    return {
      principalId: principal.principalId,
      actorId: principal.actorId?.trim() || principal.principalId,
      subject,
      issuer,
      displayName: principal.displayName ?? null,
      roles: unique(principal.roles ?? []),
      scopes: unique(principal.scopes),
      tokenAudience,
      authTime,
      tokenVersion: Date.parse(authTime),
      exchangeNonceHash,
    };
  }

  private loadConfig(
    env: Record<string, string | undefined>,
  ): WorkloadIdentityConfig {
    const issuers = unique(splitCsv(env.WORKLOAD_IDENTITY_ISSUER));
    const audiences = unique(
      splitCsv(
        env.WORKLOAD_IDENTITY_AUDIENCE ??
          env.WORKLOAD_IDENTITY_EXCHANGE_AUDIENCE,
      ),
    );
    const jwtSecretOrPublicKey =
      env.WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY?.trim() ?? "";
    const rawRegistry = env.WORKLOAD_IDENTITY_SERVICE_PRINCIPALS?.trim() ?? "";
    const maxAssertionLifetimeSeconds =
      normalizePositiveInteger(
        env.WORKLOAD_IDENTITY_MAX_ASSERTION_LIFETIME_SECONDS,
      ) ?? DEFAULT_MAX_ASSERTION_LIFETIME_SECONDS;

    if (
      issuers.length === 0 ||
      audiences.length === 0 ||
      !jwtSecretOrPublicKey ||
      !rawRegistry
    ) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_NOT_CONFIGURED",
        "Workload identity validation is not configured for this environment.",
        {
          requiredEnv: [
            "WORKLOAD_IDENTITY_ISSUER",
            "WORKLOAD_IDENTITY_AUDIENCE",
            "WORKLOAD_IDENTITY_JWT_SECRET_OR_PUBLIC_KEY",
            "WORKLOAD_IDENTITY_SERVICE_PRINCIPALS",
          ],
        },
      );
    }

    let servicePrincipals: RegisteredServicePrincipal[];
    try {
      const parsed = JSON.parse(rawRegistry) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("service principal registry must be a JSON array");
      }
      servicePrincipals = parsed as RegisteredServicePrincipal[];
    } catch (error) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_NOT_CONFIGURED",
        "Workload identity service principal registry is not valid JSON.",
        {
          detail: error instanceof Error ? error.message : String(error),
        },
      );
    }

    if (servicePrincipals.length === 0) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_NOT_CONFIGURED",
        "Workload identity service principal registry is empty.",
      );
    }

    const invalidPrincipal = servicePrincipals.find(
      (principal) =>
        !principal.principalId?.trim() ||
        !principal.subject?.trim() ||
        !principal.issuer?.trim(),
    );
    if (invalidPrincipal) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_NOT_CONFIGURED",
        "Workload identity service principal registry entries must declare principalId, subject, and issuer.",
        {
          principalId: invalidPrincipal.principalId ?? null,
          subject: invalidPrincipal.subject ?? null,
        },
      );
    }

    const algorithms = normalizeAlgorithms(
      env.WORKLOAD_IDENTITY_JWT_ALGORITHMS,
      jwtSecretOrPublicKey,
    );
    validateAlgorithmKeyMaterialPairing(algorithms, jwtSecretOrPublicKey);

    return {
      issuers,
      audiences,
      algorithms,
      jwtSecretOrPublicKey,
      maxAssertionLifetimeSeconds,
      servicePrincipals,
    };
  }

  private verifyAssertion(
    assertion: string,
    config: WorkloadIdentityConfig,
  ): WorkloadIdentityPayload {
    try {
      const issuer = toVerifyOptionList(config.issuers);
      const audience = toVerifyOptionList(config.audiences);
      return jwt.verify(assertion, config.jwtSecretOrPublicKey, {
        algorithms: config.algorithms,
        maxAge: config.maxAssertionLifetimeSeconds,
        ...(issuer ? { issuer } : {}),
        ...(audience ? { audience } : {}),
      }) as WorkloadIdentityPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/audience/i.test(message)) {
        throw new ApiRequestError(
          403,
          "WORKLOAD_AUDIENCE_MISMATCH",
          "Workload identity assertion audience does not match this environment.",
        );
      }
      if (/issuer/i.test(message)) {
        throw new ApiRequestError(
          403,
          "WORKLOAD_ISSUER_MISMATCH",
          "Workload identity assertion issuer does not match this environment.",
        );
      }
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Workload identity assertion is invalid or expired.",
      );
    }
  }

  private resolveRegisteredPrincipal(
    registry: RegisteredServicePrincipal[],
    issuer: string,
    subject: string,
  ): RegisteredServicePrincipal {
    const match =
      registry.find(
        (entry) =>
          entry.subject?.trim() === subject && entry.issuer?.trim() === issuer,
      ) ?? null;
    if (!match || !match.principalId?.trim()) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_PRINCIPAL_NOT_REGISTERED",
        "Verified workload identity is not registered for service token exchange.",
      );
    }
    return match;
  }

  private resolveTokenAudience(
    principal: RegisteredServicePrincipal,
    requestedTokenAudience: string | null | undefined,
  ): string {
    const allowed = unique(
      principal.allowedTokenAudiences ??
        (principal.defaultTokenAudience
          ? [principal.defaultTokenAudience]
          : process.env.JWT_AUDIENCE
            ? [process.env.JWT_AUDIENCE]
            : []),
    );

    if (allowed.length === 0) {
      throw new ApiRequestError(
        503,
        "WORKLOAD_IDENTITY_NOT_CONFIGURED",
        "Registered workload principal does not have an allowed token audience.",
        {
          principalId: principal.principalId,
        },
      );
    }

    const requested = requestedTokenAudience?.trim() ?? "";
    if (!requested) {
      const defaultAudience = principal.defaultTokenAudience?.trim() ?? "";
      if (defaultAudience && !allowed.includes(defaultAudience)) {
        throw new ApiRequestError(
          503,
          "WORKLOAD_IDENTITY_NOT_CONFIGURED",
          "Registered workload principal default audience must be included in its allowed token audiences.",
          {
            principalId: principal.principalId,
            defaultAudience,
            allowedAudiences: allowed,
          },
        );
      }
      return defaultAudience || allowed[0]!;
    }

    if (!allowed.includes(requested)) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_TOKEN_AUDIENCE_DENIED",
        "Requested service token audience is not allowed for this workload principal.",
        {
          principalId: principal.principalId,
          requestedAudience: requested,
          allowedAudiences: allowed,
        },
      );
    }

    return requested;
  }

  private requireExchangeNonce(rawNonce: string | null | undefined): string {
    const nonce = rawNonce?.trim() ?? "";
    if (!nonce) {
      throw new ApiRequestError(
        400,
        "WORKLOAD_EXCHANGE_NONCE_REQUIRED",
        "Workload identity token exchange requires a caller-generated exchange nonce.",
      );
    }

    if (nonce.length > 256 || containsControlCharacters(nonce)) {
      throw new ApiRequestError(
        400,
        "WORKLOAD_EXCHANGE_NONCE_INVALID",
        "Workload identity exchange nonce is invalid.",
      );
    }

    return nonce;
  }

  private resolveMatchedExchangeAudience(
    payload: WorkloadIdentityPayload,
    configuredAudiences: readonly string[],
  ): string {
    const matched =
      normalizeAudience(payload.aud).find((audience) =>
        configuredAudiences.includes(audience),
      ) ?? configuredAudiences[0];
    if (!matched) {
      throw new ApiRequestError(
        403,
        "WORKLOAD_AUDIENCE_MISMATCH",
        "Workload identity assertion audience does not match this environment.",
      );
    }
    return matched;
  }

  private resolveTemporalClaims(
    payload: WorkloadIdentityPayload,
    config: WorkloadIdentityConfig,
  ): {
    expiresAt: string;
  } {
    if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Workload identity assertion is missing an issued-at claim.",
      );
    }

    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Workload identity assertion is missing an expiry claim.",
      );
    }

    const lifetimeSeconds = payload.exp - payload.iat;
    if (
      lifetimeSeconds <= 0 ||
      lifetimeSeconds > config.maxAssertionLifetimeSeconds
    ) {
      throw new ApiRequestError(
        401,
        "WORKLOAD_ASSERTION_INVALID",
        "Workload identity assertion lifetime exceeds the configured maximum.",
      );
    }

    return {
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  }

  private resolveAuthTime(payload: WorkloadIdentityPayload): string {
    const issuedAt =
      typeof payload.iat === "number" && Number.isFinite(payload.iat)
        ? payload.iat * 1000
        : Date.now();
    return new Date(issuedAt).toISOString();
  }
}
