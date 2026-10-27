import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type {
  AgencyBootstrapSession,
  IamCallbackSessionExchangeCommand,
  IdentityContext,
  PartnerBootstrapSession,
  TenantBootstrapSession,
  TenantPortalProfile,
} from "@drts/contracts";

import { getIamFleetRoleScopes } from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { hasTrustedMfa } from "../../common/auth/trusted-mfa.policy";
import type { AuthActorType, AuthRealm } from "../../common/auth/auth.types";
import {
  getAgencyRoleScopes,
  getTenantRoleScopes,
} from "../../common/auth/auth.constants";
import { AgencyDirectoryRepository } from "../agency-access/agency-directory.repository";
import { SecurityEventsService } from "../security-events/security-events.service";
import {
  IdentityRepository,
  parseAgencyScopeRef,
} from "../identity/identity.repository";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { PartnerUserIdentityLinkRepository } from "../tenant-partner/partner-user-identity-link.repository";
import {
  detectAuthEnvironment,
  isOrdinaryLoginMfaRequired,
  resolveOrdinaryLoginMfaPolicy,
} from "../../config/auth-startup-config";
import { ConsumedOidcStateRepository } from "./consumed-oidc-state.repository";
import {
  GOOGLE_OIDC_ENDPOINTS,
  isGoogleOidcIssuer,
  OidcIdTokenVerifier,
} from "./oidc-id-token-verifier";

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
  invitationTokenHash?: string;
  /** BUREAU-R13: agency named by an agency invitation login. */
  agencyId?: string | null;
  createdAt: number;
  expiresAt: number;
}

export interface OidcLoginUrlResult {
  authorizationUrl: string;
  state: string;
  stateToken: string;
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
  private readonly idTokenVerifier = new OidcIdTokenVerifier();

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly tenantPartnerService: TenantPartnerService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    private readonly partnerUserIdentityLinkRepo: PartnerUserIdentityLinkRepository = new PartnerUserIdentityLinkRepository(),
    @Optional()
    private readonly consumedStateRepo: ConsumedOidcStateRepository = new ConsumedOidcStateRepository(),
    @Optional()
    private readonly identityRepository?: IdentityRepository,
    @Optional()
    private readonly agencyDirectoryRepository?: AgencyDirectoryRepository,
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
   * Helper: encrypt OIDC state record to create an opaque, tamper-proof state token
   */
  public createSignedStateToken(record: OidcStateRecord): string {
    const secret =
      process.env.COOKIE_SECRET ||
      process.env.JWT_SECRET ||
      "drts_oidc_state_secret_key_32bytes_min";
    const key = createHash("sha256").update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const payloadStr = JSON.stringify(record);
    const encrypted = Buffer.concat([
      cipher.update(payloadStr, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${this.base64UrlEncode(iv)}.${this.base64UrlEncode(encrypted)}.${this.base64UrlEncode(authTag)}`;
  }

  /**
   * Helper: decrypt and verify opaque OIDC state token
   */
  public verifyStateToken(stateToken: string): OidcStateRecord | null {
    try {
      const secret =
        process.env.COOKIE_SECRET ||
        process.env.JWT_SECRET ||
        "drts_oidc_state_secret_key_32bytes_min";
      const key = createHash("sha256").update(secret).digest();
      const parts = stateToken.split(".");
      if (parts.length !== 3) return null;
      const [ivB64, encryptedB64, authTagB64] = parts;
      const iv = Buffer.from(ivB64!, "base64url");
      const encrypted = Buffer.from(encryptedB64!, "base64url");
      const authTag = Buffer.from(authTagB64!, "base64url");
      if (iv.length !== 12 || authTag.length !== 16) return null;

      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
      const jsonStr = decrypted.toString("utf8");
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
  public validateRedirectUri(
    redirectUri: string | null | undefined,
  ): string | null {
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
      invitationToken?: string;
      agencyId?: string | null;
    },
  ): OidcLoginUrlResult {
    if (process.env.OIDC_ENABLED === "false") {
      throw new ApiRequestError(
        503,
        "AUTH_OIDC_UNAVAILABLE",
        "OIDC login is not configured on this deployment.",
      );
    }
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
      ...((realm === "tenant" || realm === "agency") && options?.invitationToken
        ? {
            invitationTokenHash: createHash("sha256")
              .update(options.invitationToken)
              .digest("hex"),
          }
        : {}),
      ...(realm === "agency"
        ? { agencyId: options?.agencyId?.trim() || null }
        : {}),
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
      process.env.OIDC_AUTHORIZATION_ENDPOINT ??
      (isGoogleOidcIssuer(issuerUrl)
        ? GOOGLE_OIDC_ENDPOINTS.authorization
        : `${issuerUrl}/oauth2/v1/authorize`);

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
    const { claims, stateRecord } = await this.validateAndExchangeCode(
      command,
      "tenant",
      meta,
    );

    return this.issueVerifiedTenantSession(
      claims,
      {
        tenantId: stateRecord.tenantId || command.tenantId?.trim() || null,
        invitationTokenHash: stateRecord.invitationTokenHash,
      },
      meta,
    );
  }

  public async exchangeTenantIdTokenSession(
    command: { idToken: string; tenantId?: string | null },
    meta?: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<TenantBootstrapSession> {
    const claims = await this.idTokenVerifier.verify(
      command.idToken,
      undefined,
      true,
    );
    return this.issueVerifiedTenantSession(
      claims as unknown as OidcClaims,
      { tenantId: command.tenantId },
      meta,
    );
  }

  private async issueVerifiedTenantSession(
    claims: OidcClaims,
    options: {
      tenantId?: string | null | undefined;
      invitationTokenHash?: string | undefined;
    },
    meta?: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<TenantBootstrapSession> {
    // Shared with ENTRY-IAP: never interpret the flag as an MFA assertion.
    const waiverConfigured = process.env.DRTS_DEV_MFA_WAIVED === "true";
    const environment = detectAuthEnvironment();
    if (
      waiverConfigured &&
      (environment === "staging" || environment === "production")
    ) {
      throw new ApiRequestError(
        503,
        "AUTH_CONFIGURATION_INVALID",
        "DRTS_DEV_MFA_WAIVED is forbidden in staging and production.",
      );
    }
    if (
      typeof claims.email !== "string" ||
      !claims.email.trim() ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim()
    ) {
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "OIDC subject and email are required.",
      );
    }

    // Enforce email_verified === true for tenant session exchange
    if (claims.email_verified !== true) {
      const fallbackTenant =
        options.tenantId?.trim() || claims.tenant_id?.trim() || null;
      this.recordSecurityEvent({
        eventType: "tenant_oidc_session.denied",
        outcome: "denied",
        realm: "tenant",
        tenantId: fallbackTenant,
        subjectId: claims.sub,
        reasonCode: "EMAIL_NOT_VERIFIED",
        maskedContext: {
          email: claims.email,
          sub: claims.sub,
          email_verified: claims.email_verified,
        },
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject email is not verified by OIDC provider.",
      );
    }

    // Resolve tenant user identity strictly by immutable subject binding primary key
    const subjectId = claims.sub.trim();
    const normalizedEmail = claims.email.trim().toLowerCase();
    const requestedTenantId =
      options.tenantId?.trim() || claims.tenant_id?.trim();
    const proof = {
      issuer: claims.iss,
      subject: subjectId,
      email: normalizedEmail,
      tenantId: requestedTenantId || null,
    };
    if (options.invitationTokenHash) {
      await this.tenantPartnerService.acceptTenantOidcInvitation(
        options.invitationTokenHash,
        proof,
        meta?.requestId,
      );
      this.recordSecurityEvent({
        eventType: "tenant_oidc_invitation.bound",
        outcome: "success",
        realm: "tenant",
        tenantId: requestedTenantId || null,
        subjectId,
        meta,
      });
    }
    const existingUser =
      await this.tenantPartnerService.findTenantUserByOidcIdentity(proof);
    const targetTenantId = existingUser?.tenantId || requestedTenantId || "";

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
    const profile: TenantPortalProfile = {
      id: existingUser.userId,
      tenantId: targetTenantId,
      fullName: existingUser.displayName,
      email: normalizedEmail,
      roleCode: existingUser.roleCode,
    };

    const scopes = getTenantRoleScopes(existingUser.roleCode);
    const scopesList = [...(scopes ?? [])];

    // Bind the durable role to whatever the canonical active-grant projection
    // says *right now* for this exact membership. A dual-approved privileged
    // role request only ever mutates that projection (never the durable
    // TenantUserRole), so without this lookup an active grant would silently
    // issue a session that still carries the pre-elevation role.
    let effectiveRoleCode = existingUser.roleCode;
    let effectiveScopesList = scopesList;
    let tenantPrivilegedGrantId: string | null = null;
    // The canonical principal/membership behind this legacy tenant user is
    // the same identity the dual-approval flow revokes sessions for
    // (revokeSessionsByPrincipal(targetUserId)) and the same identity any
    // active grant targets. Every session issued for this legacy user must
    // carry that canonical principalId/membershipId -- never the legacy
    // existingUser.userId -- or a post-approval revocation silently misses
    // sessions issued before (or without) this lookup succeeding.
    let canonicalPrincipalId: string | null = null;
    let canonicalMembershipId: string | null = null;
    const membershipId =
      await this.identityRepository?.findMembershipIdForLegacyTenantUser(
        existingUser.userId,
      );
    if (membershipId) {
      const membership =
        await this.identityRepository?.findMembershipById(membershipId);
      if (membership?.principalId) {
        canonicalPrincipalId = membership.principalId;
        canonicalMembershipId = membershipId;
      }
      const activeGrants =
        (await this.identityRepository?.findActivePrivilegedGrantsForMembership(
          membershipId,
        )) ?? [];
      const applicableGrant = activeGrants[0];
      if (applicableGrant) {
        const grantScopes = getTenantRoleScopes(applicableGrant.roleCode);
        if (grantScopes) {
          effectiveRoleCode = applicableGrant.roleCode;
          effectiveScopesList = [...grantScopes];
          tenantPrivilegedGrantId = applicableGrant.grantId;
        }
      }
    }

    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "tenant_admin",
      actorId: existingUser.userId,
      realm: "tenant",
      tenantId: targetTenantId,
      roleFamilies: ["tenant"],
      roles: [effectiveRoleCode],
      scopes: effectiveScopesList,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    // Extract & enforce MFA claims
    const amr = claims.amr ?? [];
    const acr = claims.acr ?? "";
    const authTime = claims.auth_time ?? Math.floor(Date.now() / 1000);
    const mfaVerified = hasTrustedMfa({ amr, acr });
    // The MFA gate must bind to the role actually being issued (which may
    // be elevated by an active privileged-role grant), not the durable
    // membership roleCode a grant deliberately leaves unchanged.
    const mfaRequired =
      isOrdinaryLoginMfaRequired() ||
      ["tenant_admin", "tenant_ops_admin"].includes(effectiveRoleCode);
    const mfaPolicy = resolveOrdinaryLoginMfaPolicy();
    const mfaWaived = mfaRequired && !mfaVerified && waiverConfigured;
    if (mfaWaived) {
      if (!this.securityEventsService)
        throw new ApiRequestError(
          503,
          "AUTH_AUDIT_UNAVAILABLE",
          "Security events are required for a dev MFA waiver.",
        );
      await this.recordSecurityEvent({
        eventType: "tenant_oidc_session.mfa_waived",
        requirePersistence: true,
        outcome: "success",
        realm: "tenant",
        tenantId: targetTenantId,
        actorId: existingUser.userId,
        subjectId,
        reasonCode: "DEV_MFA_WAIVED",
        afterSummary: {
          flag: "DRTS_DEV_MFA_WAIVED",
          environment,
          mfaVerified: false,
        },
        meta,
      });
    }

    if (mfaRequired && !mfaVerified && !mfaWaived) {
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

    const sessionTokenOptions = {
      authMode: "jwt_bearer" as const,
      actorType: "tenant_admin" as const,
      actorId: existingUser.userId,
      principalId: canonicalPrincipalId ?? existingUser.userId,
      membershipId: canonicalMembershipId,
      subject: claims.sub,
      realm: "tenant" as const,
      tenantId: targetTenantId,
      roleFamilies: ["tenant" as const],
      roles: [effectiveRoleCode],
      scopes: effectiveScopesList,
      tokenVersion: Date.parse(existingUser.updatedAt),
      authTime: new Date(authTime * 1000).toISOString(),
      amr,
      acr,
      policyVersion: "v1",
      requestId: meta?.requestId ?? null,
      tenantPrivilegedGrantId,
    };

    let token: string;
    let issuedSessionId: string | undefined;
    let issuedTokenId: string | undefined;
    if (typeof (this.jwtAuthService as any).issueSessionToken === "function") {
      const issued = await this.jwtAuthService.issueSessionToken(
        sessionTokenOptions,
        { expiresIn: "8h" },
      );
      token = issued.token;
      issuedSessionId = issued.sessionId;
      issuedTokenId = issued.tokenId;
      (identity as any).sessionId = issuedSessionId;
      (identity as any).tokenId = issuedTokenId;
      (identity as any).tokenVersion = sessionTokenOptions.tokenVersion;
      (identity as any).authTime = sessionTokenOptions.authTime;
      (identity as any).amr = amr;
      (identity as any).acr = acr;
      (identity as any).policyVersion = "v1";
    } else {
      token = this.jwtAuthService.sign(sessionTokenOptions, {
        expiresIn: "8h",
      });
    }

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
      tokenId: issuedTokenId ?? null,
      afterSummary: {
        sub: claims.sub,
        email: normalizedEmail,
        amr,
        acr,
        authTime,
        mfaVerified,
        mfaPolicy,
      },
      meta,
    });

    return session;
  }

  /**
   * BUREAU-R13 §3: exchange an agency callback. The state token must have
   * been issued for the `agency` realm (validateAndExchangeCode), so a
   * tenant/partner state can never mint an agency session.
   */
  public async exchangeAgencyCallbackSession(
    command: IamCallbackSessionExchangeCommand,
    meta?: {
      sourceIp?: string;
      userAgent?: string;
      requestId?: string;
      stateToken?: string;
    },
  ): Promise<AgencyBootstrapSession> {
    const { claims, stateRecord } = await this.validateAndExchangeCode(
      command,
      "agency",
      meta,
    );
    return this.issueVerifiedAgencySession(
      claims,
      {
        agencyId: stateRecord.agencyId ?? null,
        invitationTokenHash: stateRecord.invitationTokenHash,
      },
      meta,
    );
  }

  private denyAgencySession(
    reasonCode: string,
    claims: Pick<OidcClaims, "sub">,
    meta:
      | { sourceIp?: string; userAgent?: string; requestId?: string }
      | undefined,
    message: string,
  ): never {
    this.recordSecurityEvent({
      eventType: "agency_oidc_session.denied",
      outcome: "denied",
      realm: "agency",
      subjectId: claims.sub ?? null,
      reasonCode,
      meta,
    });
    throw new ApiRequestError(403, "AUTH_SESSION_EXCHANGE_DENIED", message);
  }

  private async issueVerifiedAgencySession(
    claims: OidcClaims,
    options: {
      agencyId: string | null;
      invitationTokenHash?: string | undefined;
    },
    meta?: { sourceIp?: string; userAgent?: string; requestId?: string },
  ): Promise<AgencyBootstrapSession> {
    // Same dev-waiver contract as tenant: never an MFA assertion, and
    // forbidden outright in staging/production (D2: no new MFA setting).
    const waiverConfigured = process.env.DRTS_DEV_MFA_WAIVED === "true";
    const environment = detectAuthEnvironment();
    if (
      waiverConfigured &&
      (environment === "staging" || environment === "production")
    ) {
      throw new ApiRequestError(
        503,
        "AUTH_CONFIGURATION_INVALID",
        "DRTS_DEV_MFA_WAIVED is forbidden in staging and production.",
      );
    }
    if (!this.identityRepository || !this.agencyDirectoryRepository) {
      throw new ApiRequestError(
        503,
        "AUTH_AGENCY_UNAVAILABLE",
        "Agency identity authority is not available.",
      );
    }
    if (
      typeof claims.email !== "string" ||
      !claims.email.trim() ||
      typeof claims.sub !== "string" ||
      !claims.sub.trim() ||
      typeof claims.iss !== "string" ||
      !claims.iss.trim()
    ) {
      this.denyAgencySession(
        "OIDC_CLAIMS_MISSING",
        claims,
        meta,
        "OIDC issuer, subject and email are required.",
      );
    }
    if (claims.email_verified !== true) {
      this.denyAgencySession(
        "EMAIL_NOT_VERIFIED",
        claims,
        meta,
        "Subject email is not verified by OIDC provider.",
      );
    }
    const subject = claims.sub.trim();
    const issuer = claims.iss.trim();
    const email = claims.email.trim().toLowerCase();

    if (options.invitationTokenHash) {
      // Check the invited agency before the proof can be consumed.
      const pending = await this.identityRepository.findInvitationByTokenHash(
        options.invitationTokenHash,
      );
      const invitedAgencyId =
        pending?.realm === "agency"
          ? parseAgencyScopeRef(pending.scopeRef)
          : null;
      const invitedAgency = invitedAgencyId
        ? await this.agencyDirectoryRepository.findById(invitedAgencyId)
        : null;
      if (!invitedAgency || invitedAgency.status !== "active") {
        this.denyAgencySession(
          "AGENCY_INVITATION_INVALID",
          claims,
          meta,
          "The agency invitation is not valid.",
        );
      }
      const accepted = await this.identityRepository.acceptAgencyOidcInvitation(
        options.invitationTokenHash,
        { issuer, subject, email, agencyId: options.agencyId },
      );
      if (!accepted) {
        this.denyAgencySession(
          "AGENCY_INVITATION_INVALID",
          claims,
          meta,
          "The agency invitation is not valid.",
        );
      }
      this.recordSecurityEvent({
        eventType: "agency_oidc_invitation.bound",
        outcome: "success",
        realm: "agency",
        actorType: "agency_user",
        actorId: accepted.principal.principalId,
        subjectId: subject,
        meta,
      });
    }

    // Login binds strictly to the verified (issuer, sub); never by email.
    const principal = await this.identityRepository.findPrincipalBySubject(
      issuer,
      subject,
    );
    if (!principal || principal.status !== "active") {
      this.denyAgencySession(
        principal ? "IAM_PRINCIPAL_NOT_ACTIVE" : "USER_NOT_FOUND",
        claims,
        meta,
        "Subject does not correspond to an active agency user.",
      );
    }
    const snapshot =
      await this.identityRepository.findAgencyMembershipForPrincipal(
        principal.principalId,
      );
    if (!snapshot) {
      this.denyAgencySession(
        "IAM_MEMBERSHIP_NOT_ACTIVE",
        claims,
        meta,
        "Subject has no active agency membership.",
      );
    }
    if (options.agencyId && options.agencyId !== snapshot.agencyId) {
      this.denyAgencySession(
        "CROSS_AGENCY_SESSION_FORBIDDEN",
        claims,
        meta,
        "Subject is not a member of the requested agency.",
      );
    }
    const agency = await this.agencyDirectoryRepository.findById(
      snapshot.agencyId,
    );
    if (!agency || agency.status !== "active") {
      this.denyAgencySession(
        "AGENCY_NOT_ACTIVE",
        claims,
        meta,
        "The agency is not active.",
      );
    }
    const now = Date.now();
    const binding = snapshot.roleBindings.find(
      (candidate) =>
        Boolean(getAgencyRoleScopes(candidate.roleCode)) &&
        Boolean(candidate.validTo) &&
        Date.parse(candidate.validFrom) <= now &&
        now < Date.parse(candidate.validTo!),
    );
    if (!binding) {
      this.denyAgencySession(
        "AGENCY_ACCESS_EXPIRED",
        claims,
        meta,
        "The agency access period is not active.",
      );
    }
    const scopes = [...(getAgencyRoleScopes(binding.roleCode) ?? [])];

    const amr = claims.amr ?? [];
    const acr = claims.acr ?? "";
    const authTime = claims.auth_time ?? Math.floor(now / 1000);
    const mfaVerified = hasTrustedMfa({ amr, acr });
    // D2: the existing ordinary-login policy applies unchanged; production
    // enforcement for agencies remains an open decision.
    const mfaRequired = isOrdinaryLoginMfaRequired();
    const mfaPolicy = resolveOrdinaryLoginMfaPolicy();
    const mfaWaived = mfaRequired && !mfaVerified && waiverConfigured;
    if (mfaWaived) {
      if (!this.securityEventsService)
        throw new ApiRequestError(
          503,
          "AUTH_AUDIT_UNAVAILABLE",
          "Security events are required for a dev MFA waiver.",
        );
      await this.recordSecurityEvent({
        eventType: "agency_oidc_session.mfa_waived",
        requirePersistence: true,
        outcome: "success",
        realm: "agency",
        actorType: "agency_user",
        actorId: principal.principalId,
        subjectId: subject,
        reasonCode: "DEV_MFA_WAIVED",
        afterSummary: {
          flag: "DRTS_DEV_MFA_WAIVED",
          environment,
          mfaVerified: false,
        },
        meta,
      });
    }
    if (mfaRequired && !mfaVerified && !mfaWaived) {
      this.denyAgencySession(
        "IAM_MFA_REQUIRED",
        claims,
        meta,
        "Subject authentication claims lack required multi-factor authentication (MFA) proof.",
      );
    }

    // Same fingerprint JwtAuthService.validateAgencyDurableState recomputes.
    const tokenVersion = Math.max(
      ...[
        principal.updatedAt,
        snapshot.membership.updatedAt,
        ...snapshot.roleBindings.map((candidate) => candidate.updatedAt),
      ].map((timestamp) => Date.parse(timestamp)),
    );
    const issued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "agency_user",
        actorId: principal.principalId,
        principalId: principal.principalId,
        membershipId: snapshot.membership.membershipId,
        subject,
        realm: "agency",
        tenantId: null,
        agencyId: snapshot.agencyId,
        roleFamilies: ["agency"],
        roles: [binding.roleCode],
        scopes,
        tokenVersion,
        authTime: new Date(authTime * 1000).toISOString(),
        amr,
        acr,
        policyVersion: "v1",
        requestId: meta?.requestId ?? null,
      },
      {
        expiresIn: "8h",
        ensurePrincipal: false,
        tokenVersion,
      },
    );

    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "agency_user",
      actorId: principal.principalId,
      principalId: principal.principalId,
      membershipId: snapshot.membership.membershipId,
      realm: "agency",
      tenantId: null,
      agencyId: snapshot.agencyId,
      roleFamilies: ["agency"],
      roles: [binding.roleCode],
      scopes,
      sessionId: issued.sessionId,
      tokenId: issued.tokenId,
      tokenVersion,
      authTime: issued.authTime,
      amr,
      acr,
      policyVersion: issued.policyVersion,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    this.recordSecurityEvent({
      eventType: "agency_oidc_session.issued",
      outcome: "success",
      realm: "agency",
      actorType: "agency_user",
      actorId: principal.principalId,
      subjectId: subject,
      tokenId: issued.tokenId,
      afterSummary: {
        agencyId: snapshot.agencyId,
        roleCode: binding.roleCode,
        amr,
        acr,
        authTime,
        mfaVerified,
        mfaPolicy,
      },
      meta,
    });

    return {
      accessToken: issued.token,
      tokenType: "Bearer",
      expiresIn: "8h",
      identity,
      agency: { agencyId: agency.agencyId, displayName: agency.displayName },
      roleCode: binding.roleCode,
      accessValidTo: binding.validTo!,
    };
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

    if (claims.email_verified !== true) {
      const fallbackPartner =
        command.partnerId?.trim() ||
        claims.partner_id?.trim() ||
        stateRecord?.partnerId?.trim() ||
        null;
      this.recordSecurityEvent({
        eventType: "partner_oidc_session.denied",
        outcome: "denied",
        realm: "partner",
        partnerId: fallbackPartner,
        subjectId: claims.sub,
        reasonCode: "EMAIL_NOT_VERIFIED",
        meta,
      });
      throw new ApiRequestError(
        403,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Subject email is not verified by OIDC provider.",
      );
    }

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

    const partnerEntries =
      this.tenantPartnerService.listPartnerEntries(entrySlug);
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
    const mfaVerified = amr.some((m) =>
      ["mfa", "otp", "totp", "hwk", "sms", "swk", "pin"].includes(
        m.toLowerCase(),
      ),
    );
    // Named, auditable policy switch — see isOrdinaryLoginMfaRequired in
    // auth-startup-config.ts. v1 product decision (2026-09-15): ordinary
    // partner login does not require an MFA-bearing amr claim.
    const mfaRequired = isOrdinaryLoginMfaRequired();
    const mfaPolicy = resolveOrdinaryLoginMfaPolicy();

    if (mfaRequired && !mfaVerified) {
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

    // An active Referral link is not a Fleet staff grant. Resolve only the
    // exact linked canonical human and its manager-created bounded membership.
    const principal = await this.identityRepository?.findPrincipalById(
      linkRecord.drtsPassengerId,
    );
    if (principal && principal.status !== "active") {
      throw new ApiRequestError(
        403,
        "IAM_PRINCIPAL_NOT_ACTIVE",
        "Linked principal is not active.",
      );
    }
    const memberships =
      matchedEntry.partnerType === "fleet_partner" &&
      principal?.status === "active" &&
      principal.principalType === "human" &&
      principal.sourceRef ===
        `jwt_principal:partner:${linkRecord.drtsPassengerId}`
        ? await this.identityRepository?.findMembershipsByPrincipalId(
            principal.principalId,
          )
        : [];
    const managedMembership = memberships?.find(
      (candidate) =>
        candidate.realm === "partner" &&
        candidate.scopeRef === `fleet:${matchedEntry.entrySlug}` &&
        candidate.partnerId === matchedEntry.partnerId &&
        candidate.sourceRef ===
          `fleet_member:${matchedEntry.entrySlug}:${linkRecord.drtsPassengerId}`,
    );
    // A disabled membership never silently falls back to a fresh human grant.
    const roleBindings =
      managedMembership?.status === "active"
        ? await this.identityRepository!.findRoleBindingsByMembershipId(
            managedMembership.membershipId,
          )
        : [];
    const now = Date.now();
    const activeRoles = roleBindings.filter(
      (binding) =>
        Boolean(getIamFleetRoleScopes(binding.roleCode)) &&
        binding.sourceRef ===
          `fleet_role:${matchedEntry.entrySlug}:${linkRecord.drtsPassengerId}` &&
        Number.isFinite(Date.parse(binding.validFrom)) &&
        Date.parse(binding.validFrom) <= now &&
        (!binding.validTo ||
          (Number.isFinite(Date.parse(binding.validTo)) &&
            now < Date.parse(binding.validTo))),
    );
    const managedRole = activeRoles.length === 1 ? activeRoles[0] : null;
    const scopes = managedRole
      ? [...getIamFleetRoleScopes(managedRole.roleCode)!]
      : ["partner:read", "partner:write"];
    // The entry slug identifies the linked subject; the canonical Fleet
    // master identifies the business selector and owned records.
    const canonicalPartnerId = managedRole
      ? matchedEntry.partnerId
      : matchedEntry.entrySlug;
    // Preserve the legacy restricted entry role label for existing consumers;
    // it is not a Fleet human grant and has no business scopes.
    const roles = managedRole ? [managedRole.roleCode] : ["partner_admin"];
    const managedVersion =
      managedRole && principal && managedMembership
        ? Math.max(
            ...[
              matchedEntry.updatedAt,
              principal.updatedAt,
              managedMembership.updatedAt,
              ...roleBindings.map((binding) => binding.updatedAt),
            ].map((stamp) => Date.parse(stamp)),
          )
        : Date.parse(matchedEntry.updatedAt);
    const identity: IdentityContext = {
      authMode: "jwt_bearer",
      actorType: "partner_user",
      actorId: linkRecord.drtsPassengerId ?? `partner_user_${claims.sub}`,
      realm: "partner",
      tenantId:
        matchedEntry.tenantId ?? this.tenantPartnerService.getDefaultTenantId(),
      partnerId: canonicalPartnerId,
      partnerEntrySlug: matchedEntry.entrySlug,
      roleFamilies: ["partner"],
      roles,
      scopes,
      ...(managedRole && principal && managedMembership
        ? {
            principalId: principal.principalId,
            membershipId: managedMembership.membershipId,
          }
        : {}),
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };

    // The partner entry version is the durable-state fingerprint checked by
    // JwtAuthService.verifyAccessToken. A bare signed JWT lacks the canonical
    // session claims and cannot be read back via /api/auth/session.
    const issued = await this.jwtAuthService.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "partner_user",
        actorId: identity.actorId,
        principalId: identity.actorId,
        // The verified IdP sub selects the entry-scoped link above and stays
        // in the OIDC audit. Canonical principals use the link's stable ID:
        // two valid entries for one IdP sub must not collide on the global
        // identity_principals UNIQUE(issuer, subject) constraint.
        subject: identity.actorId,
        realm: "partner",
        tenantId: identity.tenantId,
        partnerId: canonicalPartnerId,
        partnerEntrySlug: matchedEntry.entrySlug,
        roleFamilies: ["partner"],
        roles,
        scopes,
        membershipId: managedRole ? managedMembership!.membershipId : null,
        requestId: meta?.requestId ?? null,
      },
      {
        expiresIn: "8h",
        ensurePrincipal: !managedRole,
        tokenVersion: managedVersion,
        authTime: new Date(
          (claims.auth_time ?? Math.floor(Date.now() / 1000)) * 1000,
        ).toISOString(),
        amr,
        acr: claims.acr ?? "",
        policyVersion: "v1",
      },
    );
    identity.principalId = identity.actorId;
    identity.partnerEntrySlug = matchedEntry.entrySlug;
    identity.sessionId = issued.sessionId;
    identity.tokenId = issued.tokenId;
    identity.tokenVersion = issued.tokenVersion;
    identity.authTime = issued.authTime;
    identity.amr = issued.amr;
    identity.acr = issued.acr;
    identity.policyVersion = issued.policyVersion;

    const session: PartnerBootstrapSession = {
      accessToken: issued.token,
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
      actorType: "partner_user",
      subjectId: claims.sub,
      tokenId: issued.tokenId,
      afterSummary: {
        sub: claims.sub,
        amr,
        mfaVerified,
        mfaPolicy,
      },
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

    // 2. State & Nonce verification
    const stateToken = meta?.stateToken?.trim();
    if (!stateToken || typeof stateToken !== "string") {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing OIDC state token header. Managed HttpOnly BFF boundary requires x-oidc-state-token header.",
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

    // PKCE Verifier Resolution (command verifier or stored in stateRecord)
    const verifier = (
      command.pkceVerifier?.trim() ||
      (command as any).codeVerifier?.trim() ||
      stateRecord.codeVerifier ||
      ""
    ).trim();
    if (!verifier) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "PKCE verifier is missing.",
      );
    }

    if (verifier.length < 43 || verifier.length > 128) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "PKCE code verifier length must be between 43 and 128 characters.",
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

    if (
      (stateRecord.tenantId &&
        command.tenantId?.trim() &&
        command.tenantId.trim() !== stateRecord.tenantId) ||
      (stateRecord.partnerId &&
        command.partnerId?.trim() &&
        command.partnerId.trim() !== stateRecord.partnerId)
    ) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Callback scope does not match login state.",
      );
    }

    // Check state reuse & consume globally
    const isFreshState = await this.consumedStateRepo.consumeState(
      command.state,
      stateRecord.expiresAt,
    );
    if (!isFreshState) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "OIDC state parameter has already been used.",
      );
    }

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

    // 1. Check if a real OIDC token endpoint is configured and mock mode is disabled.
    // In real provider mode, EVERY code must be exchanged with the real IdP token endpoint via HTTP POST.
    const tokenEndpoint =
      process.env.OIDC_TOKEN_ENDPOINT ??
      (process.env.OIDC_ISSUER
        ? isGoogleOidcIssuer(process.env.OIDC_ISSUER)
          ? GOOGLE_OIDC_ENDPOINTS.token
          : `${process.env.OIDC_ISSUER}/oauth2/v1/token`
        : null);

    const isMockMode = process.env.OIDC_MOCK_MODE === "true";
    const environment = detectAuthEnvironment();
    const syntheticExchangeAllowed =
      isMockMode && (environment === "local" || environment === "test");

    if (tokenEndpoint && !isMockMode) {
      return await this.exchangeRealOidcTokenEndpoint(
        command,
        stateRecord,
        tokenEndpoint,
      );
    }

    if (!syntheticExchangeAllowed) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        isMockMode
          ? "OIDC mock mode is not available in this environment."
          : "OIDC provider token endpoint is not configured.",
      );
    }

    // 2. Offline synthetic test codes require an explicit local/test mock mode.
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

    if (
      code.includes("unverified_email") ||
      code.includes("email_not_verified")
    ) {
      return {
        sub: "sub_unverified_email",
        iss: process.env.OIDC_ISSUER ?? "https://auth.staging.drts.internal",
        aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
        email: "unverified@acme.example",
        email_verified: false,
        amr: ["pwd", "mfa"],
        acr: "urn:mace:incommon:iap:silver",
        auth_time: Math.floor(Date.now() / 1000),
        nonce: stateRecord?.nonce,
      };
    }

    if (
      code.includes("unbound_tenant_subject") ||
      code.includes("unbound_email")
    ) {
      return {
        sub: "sub_unbound_tenant_user_9999",
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

    if (
      code.includes("brand_new_partner_subject") ||
      code.includes("unbound")
    ) {
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

    // Default / happy path synthetic claims (for offline tests)
    const defaultSub = code.includes("partner")
      ? `sub_oidc_${createHash("sha256").update(code).digest("hex").slice(0, 12)}`
      : "sub_oidc_admin_acme";

    return {
      sub: defaultSub,
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
    const verifier = (
      command.pkceVerifier?.trim() ||
      (command as any).codeVerifier?.trim() ||
      stateRecord?.codeVerifier ||
      ""
    ).trim();
    params.set("code_verifier", verifier);

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
        // Provider error bodies can echo authorization codes, client details, or
        // token material. Keep the diagnostic stable and secret-free.
        this.logger.error(
          `OIDC token exchange failed with HTTP status ${response.status}.`,
        );
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

      if (
        !tokenData.id_token ||
        typeof tokenData.id_token !== "string" ||
        !tokenData.id_token.trim()
      ) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "OIDC provider response missing required id_token.",
        );
      }

      const claimsFromToken = await this.verifyAndDecodeIdToken(
        tokenData.id_token,
        stateRecord,
      );

      if (!claimsFromToken.sub) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          "OIDC ID token missing required principal subject claim ('sub').",
        );
      }

      const userinfoEndpoint =
        process.env.OIDC_USERINFO_ENDPOINT ??
        (process.env.OIDC_ISSUER
          ? isGoogleOidcIssuer(process.env.OIDC_ISSUER)
            ? GOOGLE_OIDC_ENDPOINTS.userinfo
            : `${process.env.OIDC_ISSUER}/oauth2/v1/userinfo`
          : null);

      let userinfoClaims: Partial<OidcClaims> = {};
      if (userinfoEndpoint && tokenData.access_token) {
        try {
          const userinfoRes = await fetch(userinfoEndpoint, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          if (userinfoRes.ok) {
            userinfoClaims = (await userinfoRes.json()) as Partial<OidcClaims>;
          }
        } catch {
          // Do not log endpoint/error details; either can contain sensitive data.
          this.logger.warn("OIDC userinfo request failed.");
        }
      }

      if (
        Object.keys(userinfoClaims).length > 0 &&
        userinfoClaims.sub !== claimsFromToken.sub
      ) {
        throw new ApiRequestError(
          400,
          "AUTH_SESSION_EXCHANGE_DENIED",
          `OIDC userinfo subject '${userinfoClaims.sub}' does not match ID token subject '${claimsFromToken.sub}'.`,
        );
      }

      const mergedClaims: OidcClaims = {
        sub: claimsFromToken.sub,
        iss:
          claimsFromToken.iss ||
          process.env.OIDC_ISSUER ||
          "https://auth.staging.drts.internal",
        aud: claimsFromToken.aud || clientId,
        email: claimsFromToken.email || userinfoClaims.email || "",
        email_verified:
          claimsFromToken.email_verified ??
          (!claimsFromToken.email ||
          userinfoClaims.email === claimsFromToken.email
            ? (userinfoClaims.email_verified ?? false)
            : false),
        amr: claimsFromToken.amr ?? [],
        acr: claimsFromToken.acr,
        auth_time: claimsFromToken.auth_time || Math.floor(Date.now() / 1000),
        nonce: claimsFromToken.nonce,
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
        "OIDC token exchange request failed.",
      );
    }
  }

  public async verifyAndDecodeIdToken(
    idToken: string,
    stateRecord?: OidcStateRecord | null,
  ): Promise<Partial<OidcClaims>> {
    const claims = await this.idTokenVerifier.verify(
      idToken,
      stateRecord?.nonce,
    );
    return {
      ...claims,
      aud: process.env.OIDC_CLIENT_ID ?? "drts-bff-client",
    } as Partial<OidcClaims>;
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
    requirePersistence?: boolean;
    outcome: "success" | "denied";
    realm: AuthRealm;
    tenantId?: string | null;
    partnerId?: string | null;
    actorId?: string | null;
    actorType?: AuthActorType | null;
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

    const resolvedActorType: AuthActorType =
      params.actorType ??
      (params.actorId
        ? params.realm === "partner"
          ? "partner_user"
          : params.realm === "agency"
            ? "agency_user"
            : "tenant_admin"
        : "system");

    const write = params.requirePersistence
      ? this.securityEventsService?.recordEventRequired.bind(
          this.securityEventsService,
        )
      : this.securityEventsService?.recordEvent.bind(
          this.securityEventsService,
        );
    return write?.({
      actorId: params.actorId ?? null,
      actorType: resolvedActorType,
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
