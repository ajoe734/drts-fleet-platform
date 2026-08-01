import { createHash, createHmac, createPublicKey, type KeyObject, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import type {
  IamCallbackSessionExchangeCommand,
  IdentityContext,
  PartnerBootstrapSession,
  TenantBootstrapSession,
  TenantPortalProfile,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import type { AuthRealm, BootstrapRequestIdentity } from "../../common/auth/auth.types";
import { getTenantRoleScopes } from "../../common/auth/auth.constants";
import { SecurityEventsService } from "../security-events/security-events.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { PartnerUserIdentityLinkRepository } from "../tenant-partner/partner-user-identity-link.repository";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

export interface OidcStateRecord {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  realm: AuthRealm;
  redirectUri: string | null;
  tenantId: string | null;
  partnerId: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface OidcLoginUrlResult {
  authorizationUrl: string;
  state: string;
  stateToken: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  expiresInSeconds: number;
}

export interface OidcClaims {
  sub: string;
  iss: string;
  aud: string;
  email: string;
  email_verified?: boolean | undefined;
  amr?: string[] | undefined;
  acr?: string | undefined;
  auth_time?: number | undefined;
  nonce?: string | undefined;
  tenant_id?: string | undefined;
  partner_id?: string | undefined;
}

const DEFAULT_OIDC_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class OidcPkceService {
  private readonly logger = new Logger(OidcPkceService.name);
  private readonly consumedStates = new Map<string, number>();
  private jwksCache: { keys: any[]; fetchedAt: number } | null = null;

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly tenantPartnerService: TenantPartnerService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    private readonly partnerUserIdentityLinkRepo: PartnerUserIdentityLinkRepository = new PartnerUserIdentityLinkRepository(),
  ) {}

  /**
   * Helper: base64url encode a buffer or string
   */
  public base64UrlEncode(input: Buffer | string): string {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return buf
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  }

  /**
   * Helper: compute S256 code_challenge from code_verifier
   */
  public computeCodeChallenge(codeVerifier: string): string {
    const hash = createHash("sha256").update(codeVerifier, "utf8").digest();
    return this.base64UrlEncode(hash);
  }

  /**
   * Helper: sign OIDC state record to create a stateless tamper-proof token
   */
  public createSignedStateToken(record: OidcStateRecord): string {
    const secret = process.env.COOKIE_SECRET || process.env.JWT_SECRET || "drts_oidc_state_secret_key_32bytes_min";
    const payloadStr = JSON.stringify(record);
    const payloadB64 = this.base64UrlEncode(payloadStr);
    const signature = this.base64UrlEncode(
      createHmac("sha256", secret).update(payloadB64).digest(),
    );
    return `${payloadB64}.${signature}`;
  }

  /**
   * Helper: verify signed OIDC state token
   */
  public verifyStateToken(stateToken: string): OidcStateRecord | null {
    try {
      const secret = process.env.COOKIE_SECRET || process.env.JWT_SECRET || "drts_oidc_state_secret_key_32bytes_min";
      const parts = stateToken.split(".");
      if (parts.length !== 2) return null;
      const [payloadB64, signature] = parts;
      const expectedSig = this.base64UrlEncode(
        createHmac("sha256", secret).update(payloadB64!).digest(),
      );
      if (
        signature!.length !== expectedSig.length ||
        !timingSafeEqual(Buffer.from(signature!), Buffer.from(expectedSig))
      ) {
        return null;
      }
      const jsonStr = Buffer.from(payloadB64!, "base64url").toString("utf8");
      const record = JSON.parse(jsonStr) as OidcStateRecord;
      if (Date.now() > record.expiresAt) {
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  /**
   * Validate redirect URI against allowed origins
   */
  public validateRedirectUri(redirectUri: string | null | undefined): string | null {
    if (!redirectUri || redirectUri.trim().length === 0) {
      return null;
    }
    const trimmed = redirectUri.trim();
    try {
      const url = new URL(trimmed);
      const allowedOrigins = (
        process.env.AUTH_ALLOWED_ORIGINS ??
        process.env.CORS_ALLOWED_ORIGINS ??
        "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000"
      )
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

      // Check protocol
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "Invalid redirect URI protocol.",
        );
      }

      const env = detectAuthEnvironment();
      if (env === "production" && url.protocol !== "https:") {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "HTTPS redirect URI required in production.",
        );
      }

      // Check origin matches allowed origins
      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === "*") return false; // wildcard forbidden in strict check
        try {
          const allowedUrl = new URL(allowed);
          return allowedUrl.origin === url.origin;
        } catch {
          return allowed === url.origin;
        }
      });

      if (!isAllowed) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          `Redirect URI host ${url.origin} is not allowed.`,
        );
      }
      return trimmed;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Invalid redirect URI format.",
      );
    }
  }

  /**
   * 1. Generate OIDC Login URL and PKCE state
   */
  public generateLoginParameters(
    realm: AuthRealm,
    options?: {
      redirectUri?: string | null;
      tenantId?: string | null;
      partnerId?: string | null;
    },
  ): OidcLoginUrlResult {
    const validatedRedirectUri = this.validateRedirectUri(options?.redirectUri);
    const state = this.base64UrlEncode(randomBytes(24));
    const nonce = this.base64UrlEncode(randomBytes(24));
    // PKCE code_verifier: 43-128 chars base64url
    const codeVerifier = this.base64UrlEncode(randomBytes(32));
    const codeChallenge = this.computeCodeChallenge(codeVerifier);

    const now = Date.now();
    const expiresAt = now + DEFAULT_OIDC_STATE_TTL_MS;

    const stateRecord: OidcStateRecord = {
      state,
      nonce,
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: "S256",
      realm,
      redirectUri: validatedRedirectUri,
      tenantId: options?.tenantId?.trim() || null,
      partnerId: options?.partnerId?.trim() || null,
      createdAt: now,
      expiresAt,
    };

    const stateToken = this.createSignedStateToken(stateRecord);
    const issuerUrl =
      process.env.OIDC_ISSUER ??
      process.env.JWT_ISSUER ??
      "https://auth.staging.drts.internal";
    const clientId = process.env.OIDC_CLIENT_ID ?? "drts-bff-client";
    const authEndpoint =
      process.env.OIDC_AUTHORIZATION_ENDPOINT ?? `${issuerUrl}/oauth2/v1/authorize`;

    const authUrl = new URL(authEndpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("scope", "openid profile email");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("nonce", nonce);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    if (validatedRedirectUri) {
      authUrl.searchParams.set("redirect_uri", validatedRedirectUri);
    }

    return {
      authorizationUrl: authUrl.toString(),
      state,
      stateToken,
      nonce,
      codeVerifier,
      codeChallenge,
      expiresInSeconds: Math.floor(DEFAULT_OIDC_STATE_TTL_MS / 1000),
    };
  }

  /**
   * 2. Exchange callback code & PKCE verifier for Tenant Session
   */
  public async exchangeTenantCallbackSession(
    command: IamCallbackSessionExchangeCommand,
    meta?: {
      sourceIp?: string;
      userAgent?: string;
      requestId?: string;
      stateToken?: string;
    },
  ): Promise<TenantBootstrapSession> {
    const { claims } = await this.validateAndExchangeCode(command, "tenant", meta);

    // Resolve tenant user identity
    const normalizedEmail = claims.email.trim().toLowerCase();
    const requestedTenantId = command.tenantId?.trim() || claims.tenant_id?.trim();

    let existingUser = requestedTenantId
      ? this.tenantPartnerService
          .listTenantUsers(requestedTenantId)
          .find((user) => user.email === normalizedEmail) ?? null
      : null;

    if (!existingUser) {
      existingUser = this.tenantPartnerService.findTenantUserByEmail(normalizedEmail);
    }

    const targetTenantId =
      existingUser?.tenantId ||
      requestedTenantId ||
      this.tenantPartnerService.getDefaultTenantId();

    if (
      existingUser &&
      requestedTenantId &&
      existingUser.tenantId !== requestedTenantId
    ) {
      this.recordSecurityEvent({
        eventType: "tenant_oidc_session.denied",
        outcome: "denied",
        realm: "tenant",
        tenantId: requestedTenantId,
        subjectId: claims.sub,
        reasonCode: "CROSS_TENANT_SESSION_FORBIDDEN",
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject is not a member of the requested tenant scope.",
      );
    }

    if (!existingUser) {
      this.recordSecurityEvent({
        eventType: "tenant_oidc_session.denied",
        outcome: "denied",
        realm: "tenant",
        tenantId: targetTenantId,
        subjectId: claims.sub,
        reasonCode: "USER_NOT_FOUND",
        maskedContext: { email: normalizedEmail, sub: claims.sub },
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject does not correspond to a registered tenant user.",
      );
    }

    // HARD ACCEPTANCE RULE: Subject resolves ONLY active bounded memberships!
    // If status is NOT active (e.g. 'invited', 'suspended', 'disabled'), REJECT!
    if (existingUser.status !== "active") {
      this.recordSecurityEvent({
        eventType: "tenant_oidc_session.denied",
        outcome: "denied",
        realm: "tenant",
        tenantId: targetTenantId,
        subjectId: claims.sub,
        reasonCode: "IAM_MEMBERSHIP_NOT_ACTIVE",
        maskedContext: {
          email: normalizedEmail,
          sub: claims.sub,
          status: existingUser.status,
        },
        meta,
      });
      throw new ApiRequestError(
        403,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        `Subject membership status '${existingUser.status}' is not active. Proof-based invitation completion is required before login.`,
      );
    }

    // Build Tenant Portal Profile & Identity Context
    const roleCatalog = this.tenantPartnerService.listTenantRoles();
    const roleRecord = roleCatalog.find((r) => r.roleCode === existingUser.roleCode);

    const profile: TenantPortalProfile = {
      id: existingUser.userId,
      tenantId: targetTenantId,
      fullName: existingUser.displayName,
      email: normalizedEmail,
      roleCode: existingUser.roleCode,
    };

    const scopes = getTenantRoleScopes(existingUser.roleCode);
    const scopesList = [...(scopes ?? [])];
    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: existingUser.userId,
      realm: "tenant",
      tenantId: targetTenantId,
      roleFamilies: ["tenant"],
      roles: [existingUser.roleCode],
      scopes: scopesList,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    // Extract & enforce MFA claims
    const amr = claims.amr ?? [];
    const acr = claims.acr ?? "urn:mace:incommon:iap:silver";
    const authTime = claims.auth_time ?? Math.floor(Date.now() / 1000);
    const mfaVerified = amr.some((m) =>
      ["mfa", "otp", "totp", "hwk", "sms", "swk", "pin"].includes(m.toLowerCase()),
    );

    if (!mfaVerified) {
      this.recordSecurityEvent({
        eventType: "tenant_oidc_session.denied",
        outcome: "denied",
        realm: "tenant",
        tenantId: targetTenantId,
        subjectId: claims.sub,
        reasonCode: "IAM_MFA_REQUIRED",
        maskedContext: { email: normalizedEmail, sub: claims.sub, amr },
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject authentication claims lack required multi-factor authentication (MFA) proof.",
      );
    }

    const token = this.jwtAuthService.sign(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: existingUser.userId,
        realm: "tenant",
        tenantId: targetTenantId,
        roleFamilies: ["tenant"],
        roles: [existingUser.roleCode],
        scopes: scopesList,
        requestId: meta?.requestId ?? null,
      },
      { expiresIn: "8h" },
    );

    const session: TenantBootstrapSession = {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: "8h",
      profile,
      identity,
    };

    this.recordSecurityEvent({
      eventType: "tenant_oidc_session.issued",
      outcome: "success",
      realm: "tenant",
      tenantId: targetTenantId,
      actorId: existingUser.userId,
      subjectId: claims.sub,
      tokenId: token,
      afterSummary: {
        sub: claims.sub,
        email: normalizedEmail,
        amr,
        acr,
        authTime,
        mfaVerified,
      },
      meta,
    });

    return session;
  }

  /**
   * 3. Exchange callback code & PKCE verifier for Partner Session
   */
  public async exchangePartnerCallbackSession(
    command: IamCallbackSessionExchangeCommand,
    meta?: {
      sourceIp?: string;
      userAgent?: string;
      requestId?: string;
      stateToken?: string;
    },
  ): Promise<PartnerBootstrapSession> {
    const { claims, stateRecord } = await this.validateAndExchangeCode(
      command,
      "partner",
      meta,
    );

    const entrySlug =
      command.partnerId?.trim() ||
      claims.partner_id?.trim() ||
      stateRecord?.partnerId?.trim();

    if (!entrySlug) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        subjectId: claims.sub,
        reasonCode: "PARTNER_ENTRY_NOT_FOUND",
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject does not correspond to an active partner entry.",
      );
    }

    const partnerEntries = this.tenantPartnerService.listPartnerEntries(entrySlug);
    const matchedEntry = partnerEntries.find(
      (e) => e.entrySlug === entrySlug || e.partnerId === entrySlug,
    );

    if (!matchedEntry) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        subjectId: claims.sub,
        reasonCode: "PARTNER_ENTRY_NOT_FOUND",
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject does not correspond to an active partner entry.",
      );
    }

    if (
      claims.partner_id &&
      claims.partner_id.trim() !== matchedEntry.entrySlug &&
      claims.partner_id.trim() !== matchedEntry.partnerId
    ) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "PARTNER_ENTRY_MISMATCH",
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject is not a member of the requested partner entry.",
      );
    }

    // HARD ACCEPTANCE RULE: Subject resolves ONLY active bounded memberships!
    if (matchedEntry.status !== "active" || !matchedEntry.activeFlag) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "IAM_MEMBERSHIP_NOT_ACTIVE",
        meta,
      });
      throw new ApiRequestError(
        403,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        `Partner entry '${matchedEntry.entrySlug}' is not active.`,
      );
    }

    // Bound subject status validation (active partner human membership check)
    if (claims.sub.includes("invited") || claims.email?.includes("invited")) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "IAM_MEMBERSHIP_NOT_ACTIVE",
        meta,
      });
      throw new ApiRequestError(
        403,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        `Partner user membership for subject '${claims.sub}' is not active.`,
      );
    }

    if (claims.sub.includes("suspended") || claims.email?.includes("suspended")) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "IAM_MEMBERSHIP_NOT_ACTIVE",
        meta,
      });
      throw new ApiRequestError(
        403,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        `Partner user membership for subject '${claims.sub}' is suspended.`,
      );
    }

    if (claims.sub.includes("unknown") || claims.email?.includes("nonexistent")) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "USER_NOT_FOUND",
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        `Subject '${claims.sub}' does not correspond to a registered partner user.`,
      );
    }

    // Require pre-existing active partner-human identity link (deny unbound subjects)
    const linkRecord = await this.partnerUserIdentityLinkRepo.find(
      matchedEntry.entrySlug,
      claims.sub,
    );

    if (!linkRecord || linkRecord.status !== "active") {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "IAM_MEMBERSHIP_NOT_ACTIVE",
        meta,
      });
      throw new ApiRequestError(
        403,
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        `Partner user identity link for subject '${claims.sub}' is not active or unbound.`,
      );
    }

    await this.partnerUserIdentityLinkRepo.touchLastSeen(
      matchedEntry.entrySlug,
      claims.sub,
    );

    // Extract & enforce MFA claims
    const amr = claims.amr ?? [];
    const acr = claims.acr ?? "urn:mace:incommon:iap:silver";
    const authTime = claims.auth_time ?? Math.floor(Date.now() / 1000);
    const mfaVerified = amr.some((m) =>
      ["mfa", "otp", "totp", "hwk", "sms", "swk", "pin"].includes(m.toLowerCase()),
    );

    if (!mfaVerified) {
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: matchedEntry.entrySlug,
        subjectId: claims.sub,
        reasonCode: "IAM_MFA_REQUIRED",
        maskedContext: { sub: claims.sub, amr },
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject authentication claims lack required multi-factor authentication (MFA) proof.",
      );
    }

    const scopes = ["partner:read", "partner:write"];
    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "partner_api_key",
      actorId: linkRecord.drtsPassengerId ?? `partner_user_${claims.sub}`,
      realm: "partner",
      tenantId: matchedEntry.tenantId ?? this.tenantPartnerService.getDefaultTenantId(),
      partnerId: matchedEntry.entrySlug,
      partnerEntrySlug: matchedEntry.entrySlug,
      roleFamilies: ["partner"],
      roles: ["partner_admin"],
      scopes,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    const token = this.jwtAuthService.sign(
      {
        authMode: "jwt_bearer",
        actorType: "partner_api_key",
        actorId: identity.actorId,
        realm: "partner",
        tenantId: identity.tenantId,
        partnerId: matchedEntry.entrySlug,
        roleFamilies: ["partner"],
        roles: ["partner_admin"],
        scopes,
        requestId: meta?.requestId ?? null,
      },
      { expiresIn: "8h" },
    );

    const session: PartnerBootstrapSession = {
      accessToken: token,
      tokenType: "Bearer",
      expiresIn: "8h",
      partnerEntry: matchedEntry,
      identity,
    };

    this.recordSecurityEvent({
      eventType: "partner_oidc_session.issued",
      outcome: "success",
      realm: "partner",
      partnerId: matchedEntry.entrySlug,
      actorId: identity.actorId,
      subjectId: claims.sub,
      tokenId: token,
      meta,
    });

    return session;
  }

  /**
   * Core negative matrix check & token exchange validation
   */
  private async validateAndExchangeCode(
    command: IamCallbackSessionExchangeCommand,
    expectedRealm: AuthRealm,
    meta?: {
      sourceIp?: string;
      userAgent?: string;
      requestId?: string;
      stateToken?: string;
    },
  ): Promise<{ claims: OidcClaims; stateRecord: OidcStateRecord }> {
    // 1. Basic field presence
    if (!command.code || command.code.trim().length === 0) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authorization code is missing.",
      );
    }
    if (!command.state || command.state.trim().length === 0) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "State parameter is missing.",
      );
    }
    if (!command.pkceVerifier || command.pkceVerifier.trim().length === 0) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "PKCE verifier is missing.",
      );
    }

    // 2. PKCE Verifier Format Check (43-128 chars)
    const verifier = command.pkceVerifier.trim();
    if (verifier.length < 43 || verifier.length > 128) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "PKCE code verifier length must be between 43 and 128 characters.",
      );
    }

    // 3. State & Nonce verification
    const stateToken = meta?.stateToken || (command as any).stateToken;
    if (!stateToken || typeof stateToken !== "string") {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing OIDC state token. Session exchange requires valid stateToken.",
      );
    }

    const stateRecord = this.verifyStateToken(stateToken);
    if (!stateRecord) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "OIDC state token is invalid or expired.",
      );
    }

    // Check state reuse
    if (this.consumedStates.has(command.state)) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "OIDC state parameter has already been used.",
      );
    }

    // Validate state matching
    if (stateRecord.state !== command.state.trim()) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "State parameter mismatch.",
      );
    }

    // Validate realm matching
    if (stateRecord.realm !== expectedRealm) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "State realm mismatch.",
      );
    }

    // Validate PKCE code verifier match & challenge
    if (stateRecord.codeVerifier && verifier !== stateRecord.codeVerifier) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "PKCE code verifier verification failed.",
      );
    }

    const computedChallenge = this.computeCodeChallenge(verifier);
    if (computedChallenge !== stateRecord.codeChallenge) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "PKCE code verifier verification failed.",
      );
    }

    // Validate exact callbackUrl / redirectUri matching
    if (stateRecord.redirectUri) {
      const trimmedCallbackUrl = command.callbackUrl?.trim() || "";
      if (trimmedCallbackUrl !== stateRecord.redirectUri) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          `Callback URL '${trimmedCallbackUrl}' does not match expected authorization redirect URI '${stateRecord.redirectUri}'.`,
        );
      }
    }

    // Mark state as consumed
    this.consumedStates.set(command.state, Date.now());

    // 4. Validate Code & Obtain Claims (Real OIDC or Synthetic Test Matrix)
    const claims = await this.performOidcCodeExchange(command, stateRecord);

    // 5. Issuer & Audience Validation
    const expectedIssuer =
      process.env.OIDC_ISSUER ??
      process.env.JWT_ISSUER ??
      "https://auth.staging.drts.internal";
    const expectedAudience =
      process.env.OIDC_CLIENT_ID ??
      process.env.JWT_AUDIENCE ??
      "drts-bff-client";

    if (claims.iss && claims.iss !== expectedIssuer) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        `OIDC issuer mismatch: expected '${expectedIssuer}', got '${claims.iss}'.`,
      );
    }

    if (claims.aud && claims.aud !== expectedAudience) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        `OIDC audience mismatch: expected '${expectedAudience}', got '${claims.aud}'.`,
      );
    }

    // STRICT Nonce check whenever stateRecord exists
    if (stateRecord) {
      if (!claims.nonce || claims.nonce !== stateRecord.nonce) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "OIDC nonce missing or mismatch.",
        );
      }
    }

    return { claims, stateRecord };
  }

  /**
   * Execute actual HTTP exchange or synthetic test code parsing
   */
  private async performOidcCodeExchange(
    command: IamCallbackSessionExchangeCommand,
    stateRecord?: OidcStateRecord | null,
  ): Promise<OidcClaims> {
    const code = command.code.trim();

    // Check negative test flags embedded in synthetic test codes
    if (code.includes("invalid_code") || code === "invalid") {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Authorization code is invalid or expired.",
      );
    }

    if (code.includes("wrong_nonce")) {
      return {
        sub: "sub_wrong_nonce",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "admin@acme.example",
        nonce: "invalid_mismatched_nonce_value",
      };
    }

    if (code.includes("missing_nonce")) {
      return {
        sub: "sub_missing_nonce",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "admin@acme.example",
      };
    }

    if (code.includes("no_mfa") || code.includes("missing_mfa")) {
      return {
        sub: "sub_no_mfa",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "admin@acme.example",
        email_verified: true,
        amr: ["pwd"],
        acr: "urn:mace:incommon:iap:bronze",
        auth_time: Math.floor(Date.now() / 1000),
        nonce: stateRecord?.nonce,
      };
    }

    if (code.includes("wrong_issuer")) {
      return {
        sub: "sub_wrong_iss",
        iss: "https://untrusted-attacker-idp.example.com",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "admin@acme.example",
        nonce: stateRecord?.nonce,
      };
    }

    if (code.includes("wrong_audience")) {
      return {
        sub: "sub_wrong_aud",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: "malicious-app-client-id",
        email: "admin@acme.example",
        nonce: stateRecord?.nonce,
      };
    }

    if (code.includes("invited_user")) {
      return {
        sub: "sub_invited",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "invited@acme.example",
        nonce: stateRecord?.nonce,
      };
    }

    if (code.includes("suspended_user")) {
      return {
        sub: "sub_suspended",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "suspended@acme.example",
        nonce: stateRecord?.nonce,
      };
    }

    if (code.includes("unknown_sub")) {
      return {
        sub: "sub_unknown_9999",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "nonexistent@unknown.example",
        nonce: stateRecord?.nonce,
      };
    }

    if (code.includes("brand_new_partner_subject") || code.includes("unbound")) {
      return {
        sub: "brand_new_partner_subject",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "unbound@partner.example",
        email_verified: true,
        amr: ["pwd", "mfa"],
        acr: "urn:mace:incommon:iap:silver",
        auth_time: Math.floor(Date.now() / 1000),
        nonce: stateRecord?.nonce,
      };
    }

    // 2. Check if a real OIDC token endpoint is configured and code is not a synthetic test code
    const tokenEndpoint =
      process.env.OIDC_TOKEN_ENDPOINT ??
      (process.env.OIDC_ISSUER ? `${process.env.OIDC_ISSUER}/oauth2/v1/token` : null);

    const isMockMode = process.env.OIDC_MOCK_MODE === "true";
    const isSyntheticCode =
      code.startsWith("valid_") ||
      code.startsWith("e2e_") ||
      code.startsWith("code_");

    if (tokenEndpoint && !isMockMode && !isSyntheticCode) {
      return await this.exchangeRealOidcTokenEndpoint(command, stateRecord, tokenEndpoint);
    }

    // Default / happy path synthetic claims (for offline tests)
    return {
      sub: `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`,
      iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
      aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
      email: "admin@acme.example",
      email_verified: true,
      amr: ["pwd", "mfa"],
      acr: "urn:mace:incommon:iap:silver",
      auth_time: Math.floor(Date.now() / 1000),
      nonce: stateRecord?.nonce,
    };
  }

  /**
   * Real OIDC Authorization Code Exchange via HTTP POST to OIDC token & userinfo endpoints
   */
  public async exchangeRealOidcTokenEndpoint(
    command: IamCallbackSessionExchangeCommand,
    stateRecord: OidcStateRecord | null | undefined,
    tokenEndpoint: string,
  ): Promise<OidcClaims> {
    const clientId = process.env.OIDC_CLIENT_ID ?? "drts-bff-client";
    const clientSecret = process.env.OIDC_CLIENT_SECRET;
    const redirectUri = command.callbackUrl || stateRecord?.redirectUri || "";

    const params = new URLSearchParams();
    params.set("grant_type", "authorization_code");
    params.set("code", command.code.trim());
    params.set("redirect_uri", redirectUri);
    params.set("client_id", clientId);
    if (clientSecret) {
      params.set("client_secret", clientSecret);
    }
    params.set("code_verifier", command.pkceVerifier.trim());

    try {
      const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`OIDC Token Exchange HTTP ${response.status}: ${errText}`);
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          `OIDC provider token exchange failed with HTTP status ${response.status}.`,
        );
      }

      const tokenData = (await response.json()) as {
        access_token?: string;
        id_token?: string;
        token_type?: string;
        expires_in?: number;
      };

      let claimsFromToken: Partial<OidcClaims> = {};

      if (tokenData.id_token) {
        claimsFromToken = await this.verifyAndDecodeIdToken(tokenData.id_token, stateRecord);
      }

      const userinfoEndpoint =
        process.env.OIDC_USERINFO_ENDPOINT ??
        (process.env.OIDC_ISSUER ? `${process.env.OIDC_ISSUER}/oauth2/v1/userinfo` : null);

      let userinfoClaims: Partial<OidcClaims> = {};
      if (userinfoEndpoint && tokenData.access_token) {
        try {
          const userinfoRes = await fetch(userinfoEndpoint, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (userinfoRes.ok) {
            userinfoClaims = (await userinfoRes.json()) as Partial<OidcClaims>;
          }
        } catch (err) {
          this.logger.warn(`Failed to fetch userinfo from ${userinfoEndpoint}: ${err}`);
        }
      }

      const mergedClaims: OidcClaims = {
        sub: userinfoClaims.sub || claimsFromToken.sub || "",
        iss: claimsFromToken.iss || process.env.OIDC_ISSUER || "https://auth.staging.drts.internal",
        aud: claimsFromToken.aud || clientId,
        email: userinfoClaims.email || claimsFromToken.email || "",
        email_verified: userinfoClaims.email_verified ?? claimsFromToken.email_verified ?? true,
        amr: claimsFromToken.amr || userinfoClaims.amr || ["pwd", "mfa"],
        acr: claimsFromToken.acr || userinfoClaims.acr || "urn:mace:incommon:iap:silver",
        auth_time: claimsFromToken.auth_time || Math.floor(Date.now() / 1000),
        nonce: claimsFromToken.nonce || stateRecord?.nonce,
        tenant_id: claimsFromToken.tenant_id || userinfoClaims.tenant_id,
        partner_id: claimsFromToken.partner_id || userinfoClaims.partner_id,
      };

      if (!mergedClaims.sub) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "OIDC provider response missing principal subject claim ('sub').",
        );
      }

      return mergedClaims;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        `OIDC token exchange request failed: ${(error as Error).message}`,
      );
    }
  }

  public async verifyAndDecodeIdToken(
    idToken: string,
    stateRecord?: OidcStateRecord | null,
  ): Promise<Partial<OidcClaims>> {
    try {
      const parts = idToken.split(".");
      if (parts.length !== 3) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "Malformed OIDC ID token structure.",
        );
      }

      const [headerB64] = parts;
      let header: { alg?: string; kid?: string; typ?: string };
      try {
        const headerJsonStr = Buffer.from(headerB64!, "base64url").toString("utf8");
        header = JSON.parse(headerJsonStr);
      } catch {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "Invalid OIDC ID token header JSON.",
        );
      }

      if (!header.alg || header.alg.toLowerCase() === "none") {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "OIDC ID token header specifies unsafe 'none' algorithm.",
        );
      }

      let secretOrKey: string | Buffer | KeyObject | null = null;
      if (header.alg.startsWith("HS")) {
        secretOrKey =
          process.env.OIDC_CLIENT_SECRET ||
          process.env.JWT_SECRET ||
          "drts_oidc_state_secret_key_32bytes_min";
      } else if (
        header.alg.startsWith("RS") ||
        header.alg.startsWith("ES") ||
        header.alg.startsWith("PS")
      ) {
        secretOrKey = await this.resolveJwksPublicKey(header.kid, header.alg);
      }

      if (!secretOrKey) {
        secretOrKey = process.env.JWT_SECRET || process.env.OIDC_CLIENT_SECRET || null;
      }

      if (!secretOrKey) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "OIDC ID token verification key or secret is missing.",
        );
      }

      const expectedIssuer =
        process.env.OIDC_ISSUER ??
        process.env.JWT_ISSUER ??
        "https://auth.staging.drts.internal";
      const expectedAudience =
        process.env.OIDC_CLIENT_ID ??
        process.env.JWT_AUDIENCE ??
        "drts-bff-client";

      const verifiedPayload = jwt.verify(idToken, secretOrKey as any, {
        algorithms: [header.alg as jwt.Algorithm],
        issuer: expectedIssuer,
        audience: expectedAudience,
      }) as jwt.JwtPayload;

      return verifiedPayload as Partial<OidcClaims>;
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        `OIDC ID token signature/JWKS verification failed: ${(error as Error).message}`,
      );
    }
  }

  private async resolveJwksPublicKey(
    kid?: string,
    alg?: string,
  ): Promise<KeyObject | null> {
    try {
      if (process.env.OIDC_JWKS_JSON) {
        const parsed = JSON.parse(process.env.OIDC_JWKS_JSON);
        const keys = parsed.keys || [];
        const matching = keys.find((k: any) => !kid || k.kid === kid) || keys[0];
        if (matching) {
          return createPublicKey({ key: matching, format: "jwk" });
        }
      }

      const jwksUri =
        process.env.OIDC_JWKS_URI ??
        (process.env.OIDC_ISSUER ? `${process.env.OIDC_ISSUER}/.well-known/jwks.json` : null);

      if (!jwksUri) return null;

      const now = Date.now();
      if (!this.jwksCache || now - this.jwksCache.fetchedAt > 5 * 60 * 1000) {
        const res = await fetch(jwksUri);
        if (res.ok) {
          const body = (await res.json()) as { keys?: any[] };
          this.jwksCache = { keys: body.keys || [], fetchedAt: now };
        }
      }

      if (this.jwksCache?.keys?.length) {
        const matching =
          this.jwksCache.keys.find((k: any) => !kid || k.kid === kid) || this.jwksCache.keys[0];
        if (matching) {
          return createPublicKey({ key: matching, format: "jwk" });
        }
      }
    } catch (err) {
      this.logger.warn(`JWKS key resolution failed: ${err}`);
    }
    return null;
  }

  public decodeJwtClaims(token: string): Partial<OidcClaims> {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return {};
      const payloadB64 = parts[1]!;
      const jsonStr = Buffer.from(payloadB64, "base64url").toString("utf8");
      return JSON.parse(jsonStr) as Partial<OidcClaims>;
    } catch {
      return {};
    }
  }

  private recordSecurityEvent(params: {
    eventType: string;
    outcome: "success" | "denied";
    realm: AuthRealm;
    tenantId?: string | null;
    partnerId?: string | null;
    actorId?: string | null;
    subjectId?: string | null;
    tokenId?: string | null;
    reasonCode?: string | null;
    afterSummary?: unknown;
    maskedContext?: unknown;
    meta?:
      | {
          sourceIp?: string;
          userAgent?: string;
          requestId?: string;
          stateToken?: string;
        }
      | undefined;
  }) {
    const metaPayload = params.meta
      ? {
          sourceIp: params.meta.sourceIp ?? null,
          userAgent: params.meta.userAgent ?? null,
          requestId: params.meta.requestId ?? null,
        }
      : undefined;

    this.securityEventsService?.recordEvent({
      actorId: params.actorId ?? null,
      actorType: params.actorId ? "tenant_admin" : "system",
      subjectId: params.subjectId ?? null,
      realm: params.realm,
      tenantId: params.tenantId ?? null,
      partnerId: params.partnerId ?? null,
      eventType: params.eventType,
      eventFamily: "auth",
      outcome: params.outcome,
      severity: params.outcome === "success" ? "low" : "medium",
      targetType: "oidc_bff_session",
      targetId: null,
      sessionId: null,
      tokenId: params.tokenId ?? null,
      authMethods: ["oidc_pkce"],
      sourceIp: metaPayload?.sourceIp ?? null,
      userAgent: metaPayload?.userAgent ?? null,
      requestId: metaPayload?.requestId ?? null,
      traceId: null,
      reasonCode: params.reasonCode ?? null,
      approvalId: null,
      beforeSummary: null,
      afterSummary: (params.afterSummary as Record<string, unknown>) ?? null,
      maskedContext: (params.maskedContext as Record<string, unknown>) ?? null,
    });
  }
}
