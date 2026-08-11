import type {
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentitySessionRecord,
  CanonicalPrincipalType,
  IdentityContext,
} from "@drts/contracts";
import {
  DEFAULT_CONTROL_PLANE_JWT_AUDIENCE,
  DEFAULT_CONTROL_PLANE_JWT_ISSUER,
} from "@drts/control-plane-auth";
import { Injectable, Logger, Optional } from "@nestjs/common";
import * as jwt from "jsonwebtoken";

import { IdentityRepository } from "../../modules/identity/identity.repository";
import { RegulatoryRegistryService } from "../../modules/regulatory-registry/regulatory-registry.service";
import { TenantPartnerService } from "../../modules/tenant-partner/tenant-partner.service";
import { ApiRequestError } from "../api-envelope";
import { getTenantRoleScopes } from "./auth.constants";
import {
  JwtKeyRetiredError,
  JwtUnknownKeyError,
  SigningKeyRing,
} from "./signing-key-ring";
import type {
  AuthActorType,
  AuthRealm,
  AuthRoleFamily,
  BootstrapRequestIdentity,
} from "./auth.types";

export interface JwtIdentityPayload {
  sub: string | null;
  actorType: AuthActorType;
  realm: AuthRealm;
  tenantId: string | null;
  principalId?: string | null;
  membershipId?: string | null;
  partnerId?: string | null;
  partnerProgramId?: string | null;
  partnerEntrySlug?: string | null;
  roleFamilies: AuthRoleFamily[];
  roles: string[];
  scopes: string[];
  sid?: string | undefined;
  jti?: string | undefined;
  tokenVersion?: number | undefined;
  auth_time?: number | undefined;
  amr?: string[] | undefined;
  acr?: string | undefined;
  policyVersion?: string | undefined;
  iss?: string | undefined;
  aud?: string | string[] | undefined;
  iat?: number | undefined;
  exp?: number | undefined;
  controlPlaneProxy?: boolean | undefined;
  workloadExchangeNonceHash?: string | undefined;
  drtsPassengerId?: string | null;
  driverBindingId?: string | null;
  driverDeviceId?: string | null;
  breakGlassGrantId?: string | undefined;
}

export interface IssuedJwtSessionToken {
  token: string;
  sessionId: string;
  tokenId: string;
  tokenVersion: number;
  authTime: string;
  amr: string[];
  acr: string;
  policyVersion: string;
  expiresIn: JwtExpiresIn;
  expiresAt: string;
}

type JwtExpiresIn = Extract<NonNullable<jwt.SignOptions["expiresIn"]>, string>;

type JwtSignIdentityBase =
  | Pick<
      BootstrapRequestIdentity,
      | "authMode"
      | "actorType"
      | "actorId"
      | "principalId"
      | "membershipId"
      | "subject"
      | "realm"
      | "tenantId"
      | "partnerId"
      | "partnerProgramId"
      | "partnerEntrySlug"
      | "sessionId"
      | "tokenId"
      | "tokenVersion"
      | "authTime"
      | "amr"
      | "acr"
      | "policyVersion"
      | "issuer"
      | "audience"
      | "issuedAt"
      | "expiresAt"
      | "roleFamilies"
      | "roles"
      | "scopes"
      | "requestId"
      | "breakGlassGrantId"
    >
  | IdentityContext;

type JwtSignIdentity = JwtSignIdentityBase & {
  principalId?: string | null;
  membershipId?: string | null;
  subject?: string | null;
  sessionId?: string | null;
  tokenId?: string | null;
  tokenVersion?: number | null;
  authTime?: string | null;
  amr?: string[];
  acr?: string | null;
  policyVersion?: string | null;
  issuer?: string | null;
  audience?: string[] | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  workloadExchangeNonceHash?: string | null;
  drtsPassengerId?: string | null;
  driverBindingId?: string | null;
  driverDeviceId?: string | null;
  breakGlassGrantId?: string | null;
};

export interface IssueSessionTokenOptions {
  expiresIn?: JwtExpiresIn;
  sessionId?: string;
  principalId?: string | null;
  membershipId?: string | null;
  subject?: string | null;
  authTime?: string | null;
  amr?: string[];
  acr?: string;
  policyVersion?: string | null;
  tokenVersion?: number;
  ensurePrincipal?: boolean;
  idleExpiresAt?: string | null;
  absoluteExpiresAt?: string;
  audience?: string[] | null;
  workloadExchangeNonceHash?: string | null;
  breakGlassGrantId?: string | null;
}

const SIGN_KEY_REQUIRED_ENV = ["JWT_PRIVATE_KEY", "JWT_SECRET"] as const;
const VERIFY_KEY_REQUIRED_ENV = [
  "JWT_PUBLIC_KEY",
  "JWT_PRIVATE_KEY",
  "JWT_SECRET",
] as const;
const SIGN_KEY_MATERIAL_ERROR_MESSAGE =
  "JWT key material environment variable is not set (neither JWT_PRIVATE_KEY nor JWT_SECRET)";
const VERIFY_KEY_MATERIAL_ERROR_MESSAGE =
  "JWT key material environment variable is not set (neither JWT_PUBLIC_KEY, JWT_PRIVATE_KEY, nor JWT_SECRET)";

const DEFAULT_EXPIRES_IN: JwtExpiresIn = "8h";
const SERVICE_EXPIRES_IN: JwtExpiresIn = "15m";
const DEFAULT_POLICY_VERSION = "auth.jwt-session.v1";
// Shared with the control-plane web apps, which mint the proxy token this
// service verifies. Keeping one copy stops the minted and expected claims from
// drifting apart.
const DEFAULT_JWT_ISSUER = DEFAULT_CONTROL_PLANE_JWT_ISSUER;
const DEFAULT_JWT_AUDIENCE = DEFAULT_CONTROL_PLANE_JWT_AUDIENCE;

const HMAC_ALGORITHMS = new Set<jwt.Algorithm>(["HS256", "HS384", "HS512"]);
const ASYMMETRIC_ALGORITHMS = new Set<jwt.Algorithm>([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
]);

export class JwtKeyMaterialNotConfiguredError extends Error {
  public readonly code = "JWT_KEY_MATERIAL_NOT_CONFIGURED";
  public readonly requiredEnv: readonly string[];

  constructor(message: string, requiredEnv: readonly string[]) {
    super(message);
    this.name = "JwtKeyMaterialNotConfiguredError";
    this.requiredEnv = [...requiredEnv];
  }
}

export function isJwtKeyMaterialNotConfiguredError(
  error: unknown,
): error is JwtKeyMaterialNotConfiguredError {
  return error instanceof JwtKeyMaterialNotConfiguredError;
}

function arraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function normalizeAudience(
  value: string | string[] | null | undefined,
): string[] | null {
  if (!value) {
    return null;
  }

  const raw = Array.isArray(value) ? value : [value];
  const normalized = raw
    .flatMap((entry) => entry.split(/[;,]/))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

function parseJwtDurationMillis(expiresIn: JwtExpiresIn): number {
  const normalized = expiresIn.trim();
  const match = normalized.match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new Error(`Unsupported JWT expiresIn value: ${expiresIn}`);
  }

  const magnitudeText = match[1];
  const unitText = match[2];
  if (!magnitudeText || !unitText) {
    throw new Error(`Unsupported JWT expiresIn value: ${expiresIn}`);
  }

  const magnitude = Number(magnitudeText);
  const unit = unitText.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  const multiplier = multipliers[unit];
  if (!multiplier) {
    throw new Error(`Unsupported JWT expiresIn unit: ${expiresIn}`);
  }

  return magnitude * multiplier;
}

function unique(values: readonly string[] | null | undefined): string[] {
  return [
    ...new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  ];
}

@Injectable()
export class JwtAuthService {
  private readonly logger = new Logger(JwtAuthService.name);

  constructor(
    @Optional() private readonly identityRepository?: IdentityRepository,
    @Optional() private readonly tenantPartnerService?: TenantPartnerService,
    @Optional()
    private readonly regulatoryRegistryService?: RegulatoryRegistryService,
  ) {}

  private getSignKey(): {
    signKey: string;
    algorithm: jwt.Algorithm;
    kid: string;
  } {
    try {
      const active = new SigningKeyRing().getActiveSigningKey();
      return {
        signKey: active.signKey,
        algorithm: active.algorithm,
        kid: active.kid,
      };
    } catch (err) {
      if (err instanceof JwtKeyMaterialNotConfiguredError) {
        throw err;
      }
      throw new JwtKeyMaterialNotConfiguredError(
        `${SIGN_KEY_MATERIAL_ERROR_MESSAGE}: ${(err as Error).message}`,
        SIGN_KEY_REQUIRED_ENV,
      );
    }
  }

  private getVerifyKey(
    kid?: string,
    tokenAlg?: string,
  ): { verifyKey: string; algorithm: jwt.Algorithm; kid: string } {
    try {
      const resolved = new SigningKeyRing().resolveVerifyKey(kid, tokenAlg);
      return {
        verifyKey: resolved.verifyKey,
        algorithm: resolved.algorithm,
        kid: resolved.kid,
      };
    } catch (err) {
      if (
        err instanceof JwtKeyRetiredError ||
        err instanceof JwtUnknownKeyError
      ) {
        throw err;
      }
      throw new JwtKeyMaterialNotConfiguredError(
        VERIFY_KEY_MATERIAL_ERROR_MESSAGE,
        VERIFY_KEY_REQUIRED_ENV,
      );
    }
  }

  private isAsymmetricKeyConfigured(): boolean {
    return new SigningKeyRing().isAsymmetricConfigured();
  }

  private getIssuer(): string | undefined {
    return (
      process.env.JWT_ISSUER?.trim() ||
      process.env.OIDC_ISSUER?.trim() ||
      DEFAULT_JWT_ISSUER
    );
  }

  private getAudienceOption(): string | string[] | undefined {
    const normalized = normalizeAudience(
      process.env.JWT_AUDIENCE ||
        process.env.OIDC_AUDIENCE ||
        DEFAULT_JWT_AUDIENCE,
    );
    if (!normalized) {
      return undefined;
    }
    return normalized.length === 1 ? normalized[0] : normalized;
  }

  private getAudienceList(): string[] | null {
    return normalizeAudience(
      process.env.JWT_AUDIENCE ||
        process.env.OIDC_AUDIENCE ||
        DEFAULT_JWT_AUDIENCE,
    );
  }

  private getAlgorithms(): jwt.Algorithm[] {
    const raw = process.env.JWT_ALGORITHMS || process.env.JWT_ALGORITHM;
    const defaultAlgorithm: jwt.Algorithm = this.isAsymmetricKeyConfigured()
      ? "RS256"
      : "HS256";

    const configured = raw
      ? raw
          .split(/[;,]/)
          .map((algorithm) => algorithm.trim().toUpperCase())
          .filter((algorithm) => algorithm.length > 0)
      : [defaultAlgorithm];

    if (configured.some((algorithm) => algorithm === "NONE")) {
      throw new Error("JWT algorithms must not include alg=none.");
    }

    const allowed = configured as jwt.Algorithm[];
    const hasHmac = allowed.some((algorithm) => HMAC_ALGORITHMS.has(algorithm));
    const hasAsymmetric = allowed.some((algorithm) =>
      ASYMMETRIC_ALGORITHMS.has(algorithm),
    );

    if (hasHmac && hasAsymmetric) {
      throw new Error(
        "JWT algorithms must not mix symmetric and asymmetric families.",
      );
    }

    if (this.isAsymmetricKeyConfigured() && hasHmac) {
      throw new Error(
        "JWT algorithm confusion protection rejected HMAC algorithms with asymmetric key material.",
      );
    }

    if (!this.isAsymmetricKeyConfigured() && hasAsymmetric) {
      throw new Error(
        "JWT algorithm confusion protection rejected asymmetric algorithms without asymmetric key material.",
      );
    }

    return allowed;
  }

  private buildJwtOptions(
    expiresIn: JwtExpiresIn | undefined,
    jwtId?: string,
    keyInfo?: { algorithm: jwt.Algorithm; kid: string },
    audienceOverride?: string[] | null,
  ): jwt.SignOptions {
    const issuer = this.getIssuer();
    const overrideAudience = normalizeAudience(audienceOverride);
    const audience =
      overrideAudience && overrideAudience.length > 0
        ? overrideAudience
        : normalizeAudience(this.getAudienceOption());
    const algorithms = this.getAlgorithms();
    const options: jwt.SignOptions = {
      algorithm: keyInfo?.algorithm ?? algorithms[0],
      ...(keyInfo?.kid ? { keyid: keyInfo.kid } : {}),
      ...(jwtId ? { jwtid: jwtId } : {}),
    };

    if (expiresIn) {
      options.expiresIn = expiresIn;
    }
    if (issuer) {
      options.issuer = issuer;
    }
    if (audience && audience.length > 0) {
      options.audience = Array.isArray(audience)
        ? ([...audience] as [string, ...string[]])
        : audience;
    }

    return options;
  }

  private buildJwtVerifyOptions(
    allowedAlgos?: jwt.Algorithm[],
  ): jwt.VerifyOptions {
    const issuer = this.getIssuer();
    const audience = this.getAudienceOption();
    const options: jwt.VerifyOptions = {
      algorithms: allowedAlgos ?? this.getAlgorithms(),
    };

    if (issuer) {
      options.issuer = issuer;
    }
    if (audience) {
      options.audience = Array.isArray(audience)
        ? audience.length === 1
          ? audience[0]
          : ([...audience] as [string, ...string[]])
        : audience;
    }

    return options;
  }

  private createOpaqueId(prefix: string): string {
    const value =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}_${value.replace(/-/g, "")}`;
  }

  private resolvePolicyVersion(explicitPolicyVersion?: string | null): string {
    return (
      explicitPolicyVersion?.trim() ||
      process.env.JWT_POLICY_VERSION?.trim() ||
      DEFAULT_POLICY_VERSION
    );
  }

  private resolveDefaultAmr(identity: JwtSignIdentity): string[] {
    switch (identity.actorType) {
      case "platform_admin":
      case "ops_user":
        return ["verified_iap_workforce"];
      case "tenant_admin":
        return ["tenant_bootstrap_fixture"];
      case "partner_api_key":
        return ["partner_api_key"];
      case "referral_passenger":
        return ["referral_handoff"];
      case "driver_user":
        return ["driver_device"];
      default:
        return ["internal_key"];
    }
  }

  private resolveDefaultAcr(identity: JwtSignIdentity): string {
    switch (identity.actorType) {
      case "platform_admin":
      case "ops_user":
        return "aal2";
      default:
        return "aal1";
    }
  }

  private resolvePrincipalType(
    identity: JwtSignIdentity,
  ): CanonicalPrincipalType {
    switch (identity.actorType) {
      case "system":
        return "service";
      case "partner_api_key":
        return "partner_machine";
      default:
        return "human";
    }
  }

  private buildPrincipalRecord(
    identity: JwtSignIdentity,
    principalId: string,
    subject: string,
    issuedAt: string,
  ): CanonicalIdentityPrincipalRecord {
    return {
      principalId,
      sourceRef: `jwt_principal:${identity.realm}:${principalId}`,
      issuer: this.getIssuer() ?? `drts_${identity.realm}`,
      subject,
      principalType: this.resolvePrincipalType(identity),
      email: null,
      emailVerified: false,
      displayName: null,
      status: "active",
      createdAt: issuedAt,
      updatedAt: issuedAt,
    };
  }

  private buildPayloadAuthTime(
    authTime: string | null | undefined,
  ): number | undefined {
    if (!authTime) {
      return undefined;
    }

    return Math.floor(Date.parse(authTime) / 1000);
  }

  private coerceJwtPayload(payload: jwt.JwtPayload): JwtIdentityPayload {
    return {
      ...(payload as JwtIdentityPayload),
      amr: unique((payload.amr as string[] | undefined) ?? []),
      aud: payload.aud as string | string[] | undefined,
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      jti: payload.jti,
      workloadExchangeNonceHash:
        typeof payload.workloadExchangeNonceHash === "string"
          ? payload.workloadExchangeNonceHash
          : undefined,
    };
  }

  private hasRequiredSessionClaims(payload: JwtIdentityPayload): boolean {
    return Boolean(
      payload.sid &&
      payload.jti &&
      Number.isFinite(payload.tokenVersion) &&
      typeof payload.auth_time === "number" &&
      payload.auth_time > 0 &&
      payload.amr &&
      payload.amr.length > 0 &&
      payload.acr &&
      payload.policyVersion &&
      payload.iss &&
      payload.aud,
    );
  }

  private hasAnySessionClaim(payload: JwtIdentityPayload): boolean {
    return Boolean(
      payload.sid ||
      payload.jti ||
      payload.tokenVersion !== undefined ||
      payload.auth_time !== undefined ||
      (payload.amr?.length ?? 0) > 0 ||
      payload.acr ||
      payload.policyVersion,
    );
  }

  private computeWorkforceTokenVersion(timestamps: readonly string[]): number {
    return Math.max(...timestamps.map((timestamp) => Date.parse(timestamp)));
  }

  async issueSessionToken(
    identity: JwtSignIdentity,
    options?: IssueSessionTokenOptions,
  ): Promise<IssuedJwtSessionToken> {
    const expiresIn =
      options?.expiresIn ??
      (identity.actorType === "system"
        ? SERVICE_EXPIRES_IN
        : DEFAULT_EXPIRES_IN);
    const issuedAt = new Date().toISOString();
    const authTime = options?.authTime ?? identity.authTime ?? issuedAt;
    const sessionId =
      options?.sessionId ?? identity.sessionId ?? this.createOpaqueId("sid");
    const tokenId = identity.tokenId ?? this.createOpaqueId("jti");
    const tokenVersion =
      options?.tokenVersion ?? identity.tokenVersion ?? Date.parse(issuedAt);
    const policyVersion = this.resolvePolicyVersion(
      options?.policyVersion ?? identity.policyVersion,
    );
    const amr = unique(
      options?.amr ?? identity.amr ?? this.resolveDefaultAmr(identity),
    );
    const acr =
      options?.acr ?? identity.acr ?? this.resolveDefaultAcr(identity);
    const principalId =
      options?.principalId ?? identity.principalId ?? identity.actorId;
    const membershipId = options?.membershipId ?? identity.membershipId ?? null;
    const optionAudience = normalizeAudience(options?.audience);
    const identityAudience = normalizeAudience(identity.audience);
    const audience =
      optionAudience && optionAudience.length > 0
        ? optionAudience
        : identityAudience && identityAudience.length > 0
          ? identityAudience
          : this.getAudienceList();
    const issuer = this.getIssuer() ?? null;
    const workloadExchangeNonceHash =
      options?.workloadExchangeNonceHash ??
      identity.workloadExchangeNonceHash ??
      null;
    const breakGlassGrantId =
      options?.breakGlassGrantId ?? identity.breakGlassGrantId ?? null;
    const subject =
      options?.subject ??
      identity.subject ??
      (principalId
        ? `${identity.realm}:${identity.actorType}:${principalId}`
        : null);
    const expiresAt = new Date(
      Date.parse(issuedAt) + parseJwtDurationMillis(expiresIn),
    ).toISOString();
    const absoluteExpiresAt = options?.absoluteExpiresAt ?? expiresAt;

    if (
      this.identityRepository &&
      principalId &&
      (options?.ensurePrincipal ?? !membershipId)
    ) {
      await this.identityRepository.ensurePrincipalRecord(
        this.buildPrincipalRecord(
          identity,
          principalId,
          subject ?? principalId,
          issuedAt,
        ),
      );
    }

    if (this.identityRepository && principalId) {
      const session: CanonicalIdentitySessionRecord = {
        sessionId,
        sourceRef: `jwt_session:${sessionId}`,
        principalId,
        membershipId,
        realm: identity.realm,
        actorType: identity.actorType,
        actorId: identity.actorId,
        tenantId: identity.tenantId,
        partnerId: identity.partnerId ?? null,
        partnerProgramId: identity.partnerProgramId ?? null,
        partnerEntrySlug: identity.partnerEntrySlug ?? null,
        currentTokenId: tokenId,
        roles: [...identity.roles],
        scopes: [...identity.scopes],
        policyVersion,
        acr,
        audience,
        issuer,
        subject,
        status: "active",
        authTime,
        authMethods: amr,
        tokenVersion,
        idleExpiresAt: options?.idleExpiresAt ?? null,
        absoluteExpiresAt,
        revokedAt: null,
        revokedByPrincipalId: null,
        revokeReason: null,
        deviceSummary: {
          ...(identity.driverBindingId
            ? { bindingId: identity.driverBindingId }
            : {}),
          ...(identity.driverDeviceId
            ? { deviceId: identity.driverDeviceId }
            : {}),
        },
        riskSummary: {
          ...(breakGlassGrantId ? { breakGlassGrantId } : {}),
          ...(workloadExchangeNonceHash
            ? {
                workloadExchangeNonceHash,
              }
            : {}),
        },
        createdAt: issuedAt,
        updatedAt: issuedAt,
      };
      await this.identityRepository.createSession(session);
    }

    const token = this.sign(
      {
        ...identity,
        principalId,
        membershipId,
        subject,
        sessionId,
        tokenId,
        tokenVersion,
        authTime,
        amr,
        acr,
        policyVersion,
        issuer,
        audience,
        issuedAt,
        expiresAt,
        workloadExchangeNonceHash,
        breakGlassGrantId,
      },
      { expiresIn, jwtId: tokenId },
    );

    return {
      token,
      sessionId,
      tokenId,
      tokenVersion,
      authTime,
      amr,
      acr,
      policyVersion,
      expiresIn,
      expiresAt,
    };
  }

  async revokeCurrentSession(
    sessionId: string,
    reason = "user_logout",
    revokedByPrincipalId?: string,
  ): Promise<CanonicalIdentitySessionRecord | null> {
    if (!this.identityRepository || !sessionId) {
      return null;
    }
    return this.identityRepository.revokeSession(
      sessionId,
      reason,
      revokedByPrincipalId,
    );
  }

  async revokeAllSessionsForPrincipal(
    principalId: string,
    reason = "user_logout_all",
    revokedByPrincipalId?: string,
  ): Promise<number> {
    if (!this.identityRepository || !principalId) {
      return 0;
    }
    return this.identityRepository.revokeAllSessionsForPrincipal(
      principalId,
      reason,
      revokedByPrincipalId,
    );
  }

  async revokeSessionSelf(
    sessionId: string,
    callerPrincipalId: string,
    reason = "user_self_revocation",
  ): Promise<{ revoked: boolean; sessionId: string; status: string }> {
    if (!this.identityRepository) {
      throw new ApiRequestError(
        503,
        "IDENTITY_REPOSITORY_UNAVAILABLE",
        "Identity repository is not available.",
      );
    }
    const session = await this.identityRepository.getSession(sessionId);
    if (!session) {
      throw new ApiRequestError(404, "SESSION_NOT_FOUND", "Session not found.");
    }

    const sessionActorId =
      session.principalId ||
      ((session.deviceSummary as { bindingId?: string } | undefined)?.bindingId ?? null);

    if (
      session.principalId !== callerPrincipalId &&
      sessionActorId !== callerPrincipalId
    ) {
      throw new ApiRequestError(
        403,
        "SESSION_REVOCATION_FORBIDDEN",
        "Self-service session revocation endpoint cannot revoke another user's session.",
        { sessionId, callerPrincipalId, sessionPrincipalId: session.principalId },
      );
    }

    const revoked = await this.identityRepository.revokeSession(
      sessionId,
      reason,
      callerPrincipalId,
    );
    return {
      revoked: true,
      sessionId,
      status: revoked?.status ?? "revoked",
    };
  }

  sign(
    identity: JwtSignIdentity,
    opts?: { expiresIn?: JwtExpiresIn; jwtId?: string },
  ): string {
    const payload: JwtIdentityPayload = {
      sub: identity.actorId,
      actorType: identity.actorType,
      realm: identity.realm,
      tenantId: identity.tenantId,
      principalId: identity.principalId ?? null,
      membershipId: identity.membershipId ?? null,
      partnerId: identity.partnerId ?? null,
      partnerProgramId: identity.partnerProgramId ?? null,
      partnerEntrySlug: identity.partnerEntrySlug ?? null,
      roleFamilies: identity.roleFamilies,
      roles: identity.roles,
      scopes: identity.scopes,
      sid: identity.sessionId ?? undefined,
      tokenVersion: identity.tokenVersion ?? undefined,
      auth_time: this.buildPayloadAuthTime(identity.authTime),
      amr: unique(identity.amr),
      acr: identity.acr ?? undefined,
      policyVersion: identity.policyVersion ?? undefined,
      workloadExchangeNonceHash:
        identity.workloadExchangeNonceHash ?? undefined,
      breakGlassGrantId: identity.breakGlassGrantId ?? undefined,
      drtsPassengerId: identity.drtsPassengerId ?? null,
      driverBindingId: identity.driverBindingId ?? null,
      driverDeviceId: identity.driverDeviceId ?? null,
    };
    const expiresIn =
      opts?.expiresIn ??
      (identity.actorType === "system"
        ? SERVICE_EXPIRES_IN
        : DEFAULT_EXPIRES_IN);

    const activeKey = this.getSignKey();

    return jwt.sign(
      payload,
      activeKey.signKey,
      this.buildJwtOptions(
        expiresIn,
        opts?.jwtId ?? identity.tokenId ?? undefined,
        activeKey,
        identity.audience,
      ),
    );
  }

  verify(token: string): JwtIdentityPayload | null {
    try {
      const decoded = jwt.decode(token, { complete: true }) as {
        header?: { alg?: string; kid?: string };
      } | null;
      const algorithm = decoded?.header?.alg?.toUpperCase();
      const kid = decoded?.header?.kid;
      if (!algorithm || algorithm === "NONE") {
        return null;
      }

      if (!this.getAlgorithms().includes(algorithm as jwt.Algorithm)) {
        return null;
      }

      const verifyKeyInfo = this.getVerifyKey(kid, algorithm);

      const verified = jwt.verify(
        token,
        verifyKeyInfo.verifyKey,
        this.buildJwtVerifyOptions([verifyKeyInfo.algorithm]),
      ) as jwt.JwtPayload;
      return this.coerceJwtPayload(verified);
    } catch (err) {
      this.logger.debug(`JWT verification failed: ${(err as Error).message}`);
      return null;
    }
  }

  async verifyAccessToken(
    token: string,
    options?: { allowControlPlaneProxyToken?: boolean },
  ): Promise<JwtIdentityPayload | null> {
    const payload = this.verify(token);
    if (!payload) {
      return null;
    }

    const isControlPlaneProxyToken =
      options?.allowControlPlaneProxyToken === true &&
      payload.controlPlaneProxy === true &&
      (payload.actorType === "ops_user" ||
        payload.actorType === "platform_admin") &&
      (payload.realm === "ops" || payload.realm === "platform");
    const isSessionlessControlPlaneProxyToken =
      isControlPlaneProxyToken && !this.hasAnySessionClaim(payload);
    if (!this.hasRequiredSessionClaims(payload)) {
      // The proxy token is purpose-bound, signed, and short-lived. It is not a
      // user session and therefore has no durable session record to resolve.
      return isSessionlessControlPlaneProxyToken ? payload : null;
    }

    if (!this.identityRepository || !payload.sid) {
      return payload;
    }

    const session = await this.identityRepository.getSession(payload.sid);
    if (!session || session.status !== "active") {
      return null;
    }

    if (
      session.currentTokenId &&
      payload.jti &&
      session.currentTokenId !== payload.jti
    ) {
      return null;
    }

    if (session.tokenVersion !== payload.tokenVersion) {
      return null;
    }

    const durableStateValid = await this.validateDurableState(payload, session);
    return durableStateValid ? payload : null;
  }

  private async validateDurableState(
    payload: JwtIdentityPayload,
    session: CanonicalIdentitySessionRecord,
  ): Promise<boolean> {
    if (payload.actorType === "driver_user") {
      if (!payload.sub || payload.driverBindingId !== session.sessionId) {
        return false;
      }
      try {
        this.regulatoryRegistryService?.assertDriverAuthEligible(payload.sub);
      } catch {
        return false;
      }
      const sessionDeviceId =
        (session.deviceSummary as { deviceId?: string } | undefined)
          ?.deviceId ?? null;
      return payload.driverDeviceId === sessionDeviceId;
    }

    if (payload.realm === "tenant") {
      if (!this.tenantPartnerService || !payload.tenantId || !payload.sub) {
        return true;
      }

      const user = this.tenantPartnerService.findTenantUser(
        payload.tenantId,
        payload.sub,
      );
      if (!user || user.status !== "active") {
        return false;
      }

      const currentScopes = getTenantRoleScopes(user.roleCode);
      if (!currentScopes) {
        return false;
      }

      return (
        Date.parse(user.updatedAt) === payload.tokenVersion &&
        payload.roles[0] === user.roleCode &&
        arraysEqual(payload.scopes, currentScopes)
      );
    }

    if (payload.realm === "partner") {
      if (!this.tenantPartnerService || !payload.partnerEntrySlug) {
        return true;
      }

      try {
        const entry = this.tenantPartnerService.getPartnerEntry(
          payload.partnerEntrySlug,
        );
        return Date.parse(entry.updatedAt) === payload.tokenVersion;
      } catch {
        return false;
      }
    }

    if (payload.realm === "platform" || payload.realm === "ops") {
      if (!this.identityRepository) {
        return true;
      }

      const principalId = payload.principalId ?? payload.sub;
      if (!principalId) {
        return false;
      }

      const principal =
        await this.identityRepository.findPrincipalById(principalId);
      if (!principal || principal.status !== "active") {
        return false;
      }

      const memberships =
        await this.identityRepository.findMembershipsByPrincipalId(principalId);
      const membership = memberships.find(
        (candidate) =>
          candidate.membershipId === payload.membershipId &&
          candidate.realm === payload.realm,
      );
      if (!membership || membership.status !== "active") {
        return false;
      }

      const roleBindings =
        await this.identityRepository.findRoleBindingsByMembershipId(
          membership.membershipId,
        );
      const timestamps = [
        principal.updatedAt,
        membership.updatedAt,
        ...roleBindings.map((binding) => binding.updatedAt),
      ];

      return (
        this.computeWorkforceTokenVersion(timestamps) === payload.tokenVersion
      );
    }

    return true;
  }

  toRequestIdentity(payload: JwtIdentityPayload): BootstrapRequestIdentity {
    return {
      authMode: "jwt_bearer",
      actorType: payload.actorType,
      actorId: payload.sub,
      principalId: payload.principalId ?? payload.sub,
      membershipId: payload.membershipId ?? null,
      subject: payload.sub,
      realm: payload.realm,
      tenantId: payload.tenantId,
      partnerId: payload.partnerId ?? null,
      partnerProgramId: payload.partnerProgramId ?? null,
      partnerEntrySlug: payload.partnerEntrySlug ?? null,
      drtsPassengerId: payload.drtsPassengerId ?? null,
      sessionId: payload.sid ?? null,
      tokenId: payload.jti ?? null,
      tokenVersion: payload.tokenVersion ?? null,
      authTime:
        typeof payload.auth_time === "number"
          ? new Date(payload.auth_time * 1000).toISOString()
          : null,
      amr: unique(payload.amr),
      acr: payload.acr ?? null,
      policyVersion: payload.policyVersion ?? null,
      issuer: payload.iss ?? null,
      audience: normalizeAudience(payload.aud) ?? null,
      issuedAt:
        typeof payload.iat === "number"
          ? new Date(payload.iat * 1000).toISOString()
          : null,
      expiresAt:
        typeof payload.exp === "number"
          ? new Date(payload.exp * 1000).toISOString()
          : null,
      breakGlassGrantId: payload.breakGlassGrantId ?? null,
      roleFamilies: payload.roleFamilies,
      roles: payload.roles,
      scopes: payload.scopes,
      requestId: null,
    };
  }
}
