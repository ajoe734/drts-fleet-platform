import { Body, Controller, Get, Headers, Logger, Optional, Param, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CanonicalIdentitySessionRecord,
  CreatePartnerBootstrapSessionCommand,
  DriverDeviceProvisioningSession,
  CreateTenantBootstrapSessionCommand,
  IamCallbackSessionExchangeCommand,
  IamSessionRevokeCommand,
  IdentityContext,
  IssueDriverDeviceInvitationCommand,
  PartnerBootstrapSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
  TenantBootstrapSession,
  TenantOidcSessionExchangeCommand,
  TenantPortalProfile,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import { getTenantRoleScopes, AUTH_SCOPE_PRESETS, AUTH_TENANT_ROLE_SCOPE_PRESETS } from "../../common/auth/auth.constants";
import {
  toPublicPartnerAuthError,
  toPublicTenantAuthError,
} from "../../common/iam-error-codes";
import {
  isJwtKeyMaterialNotConfiguredError,
  JwtAuthService,
} from "../../common/auth/jwt-auth.service";
import { validateInternalKey } from "../../common/auth/internal-key.middleware";
import { extractBootstrapRequestIdentity } from "../../common/auth/auth.extractor";
import type { AuthBootstrapHeaders, AuthRealm, AuthActorType } from "../../common/auth/auth.types";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  DEV_MFA_WAIVED_AMR,
  hasTrustedMfa,
  isDevWorkforceMfaWaiverEnabled,
} from "../../common/auth/trusted-mfa.policy";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { extractIapJwtAssertion } from "@drts/control-plane-auth";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { IAPSubjectAdapter } from "./iap-subject.adapter";
import { OidcPkceService } from "./oidc-pkce.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";
import { IdentityRepository } from "../identity/identity.repository";
import {
  maskSessionRecord,
  validateCsrfHeader,
} from "./session-masking.utility";
import {
  extractWorkloadIdentityExchangeNonce,
  extractRequestedWorkloadTokenAudience,
  extractWorkloadIdentityAssertion,
  ServiceWorkloadIdentityAdapter,
} from "./service-workload-identity.adapter";
import {
  extractGoogleWorkloadIdentityAssertion,
  GoogleWorkloadIdentityAdapter,
  isCiTenantActorGateEnabled,
  resolveCiTenantActorGrant,
  isGoogleWorkloadIdentityNotConfigured,
  isGoogleWorkloadIdentityPrincipalNotRegistered,
} from "./google-workload-identity.adapter";
import { IdempotencyService } from "../../common/idempotency";

interface TokenRequest {
  headers: AuthBootstrapHeaders & { "x-drts-internal-key"?: string };
  method?: string;
  originalUrl?: string;
  url?: string;
}

type JwtExpiresIn = NonNullable<
  Extract<
    NonNullable<Parameters<JwtAuthService["sign"]>[1]>["expiresIn"],
    string
  >
>;

const TENANT_BOOTSTRAP_EXPIRES_IN: JwtExpiresIn = "8h";
const TENANT_BOOTSTRAP_FIXTURE_MODE = "fixture";
const TENANT_BOOTSTRAP_FIXTURE_MODE_ENV = "DRTS_TENANT_BOOTSTRAP_MODE" as const;

function resolveBootstrapTokenAssurance(identity: BootstrapRequestIdentity): {
  amr?: string[];
  acr?: string;
} {
  switch (identity.actorType) {
    case "platform_admin":
    case "ops_user":
      // Bootstrap headers (`x-actor-type: platform_admin|ops_user`) are a dev
      // fixture, not a verified IAP assertion: stamping `verified_iap_workforce`
      // / `aal2` here was a fabricated MFA claim (ENTRY-IAP-WORKFORCE-AUTH-20261005).
      // The real IAP path (`issueToken`'s `rawAssertion` branch) derives amr/acr
      // from `IAPSubjectAdapter.resolveSubject`'s verified assertion instead.
      // An explicit, audited dev waiver is the only way this identity clears
      // the workforce step-up gate without a real MFA signal; see
      // `isDevWorkforceMfaWaiverEnabled` in trusted-mfa.policy.ts.
      return isDevWorkforceMfaWaiverEnabled()
        ? { amr: [DEV_MFA_WAIVED_AMR] }
        : {};
    case "tenant_admin":
      return {
        amr: ["tenant_bootstrap_fixture"],
        acr: "aal1",
      };
    case "partner_api_key":
      return {
        amr: ["partner_api_key"],
        acr: "aal1",
      };
    default:
      return {};
  }
}

function isStrictAuthEnvironment(): boolean {
  const environment = detectAuthEnvironment(process.env);
  return environment === "production" || environment === "staging";
}

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly driverDeviceSessionService: DriverDeviceSessionService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
    @Optional()
    private readonly iapSubjectAdapter?: IAPSubjectAdapter,
    @Optional()
    private readonly serviceWorkloadIdentityAdapter?: ServiceWorkloadIdentityAdapter,
    @Optional()
    private readonly identityRepository?: IdentityRepository,
    // Appended, and optional, so the positional contract the existing tests
    // construct this controller with is unchanged. The module always provides
    // it; `requireOidcPkceService` turns its absence into a clear failure
    // rather than a property access on undefined.
    @Optional()
    private readonly oidcPkceService?: OidcPkceService,
    // Appended, and optional, for the same reason as `oidcPkceService` above.
    @Optional()
    private readonly googleWorkloadIdentityAdapter?: GoogleWorkloadIdentityAdapter,
    @Optional()
    private readonly idempotencyService?: IdempotencyService,
  ) {}

  private requireOidcPkceService(): OidcPkceService {
    if (!this.oidcPkceService) {
      throw new ApiRequestError(
        503,
        "AUTH_OIDC_UNAVAILABLE",
        "OIDC login is not configured on this deployment.",
      );
    }
    return this.oidcPkceService;
  }

  private requireIdempotencyService(): IdempotencyService {
    if (!this.idempotencyService) {
      throw new ApiRequestError(
        500,
        "IDEMPOTENCY_UNAVAILABLE",
        "Idempotency service is required for this operation.",
      );
    }
    return this.idempotencyService;
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Get(":realm/login")
  getOidcLoginUrl(
    @Param("realm") realm: AuthRealm,
    @Query("redirect_uri") redirectUri?: string,
    @Query("tenant_id") tenantId?: string,
    @Query("partner_id") partnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (realm !== "tenant" && realm !== "partner") {
      throw new ApiRequestError(
        400,
        "AUTH_REALM_INVALID",
        `Unsupported OIDC realm '${realm}'. Only 'tenant' and 'partner' are supported.`,
      );
    }
    const result = this.requireOidcPkceService().generateLoginParameters(realm, {
      redirectUri: redirectUri ?? null,
      tenantId: tenantId ?? null,
      partnerId: partnerId ?? null,
    });
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/invitation-login")
  getTenantInvitationLoginUrl(
    @Body()
    command: {
      invitationToken: string;
      redirectUri: string;
      tenantId?: string;
    },
    @Headers("x-request-id") requestId?: string,
  ) {
    if (
      typeof command.invitationToken !== "string" ||
      !command.invitationToken.trim() ||
      command.invitationToken.length > 512
    ) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "Invitation token is required.",
      );
    }
    const result = this.requireOidcPkceService().generateLoginParameters(
      "tenant",
      {
        redirectUri: command.redirectUri,
        tenantId: command.tenantId || null,
        invitationToken: command.invitationToken.trim(),
      },
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/callback-session")
  async exchangeTenantCallbackSession(
    @Body() command: IamCallbackSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-oidc-state-token") stateTokenHeader?: string,
  ) {
    const stateToken = stateTokenHeader?.trim();
    if (!stateToken) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing x-oidc-state-token header. Managed HttpOnly BFF boundary requires state token in header.",
      );
    }
    const meta = this.buildMeta(
      forwardedFor,
      realIp,
      userAgent,
      requestId,
      stateToken,
    );
    try {
      const session = await this.requireOidcPkceService().exchangeTenantCallbackSession(
        command,
        meta,
      );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      throw toPublicTenantAuthError(error);
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("partner/callback-session")
  async exchangePartnerCallbackSession(
    @Body() command: IamCallbackSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
    @Headers("x-oidc-state-token") stateTokenHeader?: string,
  ) {
    const stateToken = stateTokenHeader?.trim();
    if (!stateToken) {
      throw new ApiRequestError(
        400,
        "AUTH_SESSION_EXCHANGE_DENIED",
        "Missing x-oidc-state-token header. Managed HttpOnly BFF boundary requires state token in header.",
      );
    }
    const meta = this.buildMeta(
      forwardedFor,
      realIp,
      userAgent,
      requestId,
      stateToken,
    );
    try {
      const session = await this.requireOidcPkceService().exchangePartnerCallbackSession(
        command,
        meta,
      );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      throw toPublicPartnerAuthError(error);
    }
  }

  private buildMeta(
    forwardedFor?: string,
    realIp?: string,
    userAgent?: string,
    requestId?: string,
    stateToken?: string,
  ) {
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);
    const meta: {
      sourceIp?: string;
      userAgent?: string;
      requestId?: string;
      stateToken?: string;
    } = {};
    if (sourceIp) meta.sourceIp = sourceIp;
    if (userAgent) meta.userAgent = userAgent;
    if (requestId) meta.requestId = requestId;
    if (stateToken) meta.stateToken = stateToken;
    return meta;
  }

  @Get("session")
  getAuthSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "Active session required.",
      );
    }
    return toApiSuccessEnvelope(
      {
        active: true,
        identity,
      },
      requestId,
    );
  }



  @OpenRoute()
  @Post("token")
  async issueToken(@Req() request: TokenRequest): Promise<{
    token: string;
    expiresIn: string;
  }> {
    const strictEnvironment = isStrictAuthEnvironment();
    const isStrictIap =
      process.env.STRICT_IAP_MODE === "true" || strictEnvironment;
    const rawWorkloadAssertion = extractWorkloadIdentityAssertion(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const rawAssertion = extractIapJwtAssertion(request.headers);
    const rawGoogleAssertion = extractGoogleWorkloadIdentityAssertion(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const bootstrapIdentity = extractBootstrapRequestIdentity(request.headers, {
      allowAnonymous: false,
      method: request.method,
      requestUrl: request.originalUrl ?? request.url,
      // This endpoint mints a durable iam.identity_sessions row below; it
      // must never fall back to the deterministic bootstrap:<actorId>
      // session id, or two independent exchanges for the same actor (e.g.
      // a mail bootstrap call and a running deploy acceptance session)
      // collide on one session row and the newer exchange revokes the
      // older, still-valid one.
      requireExplicitSessionId: true,
    });

    if (strictEnvironment && bootstrapIdentity && !rawGoogleAssertion) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
      );
    }

    if (rawWorkloadAssertion && bootstrapIdentity) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled when workload identity proof is provided.",
      );
    }

    if (rawGoogleAssertion && rawWorkloadAssertion) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Google workload identity proof cannot be combined with the service workload identity assertion.",
      );
    }

    if (rawWorkloadAssertion) {
      const requestedTokenAudience = extractRequestedWorkloadTokenAudience(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const exchangeNonce = extractWorkloadIdentityExchangeNonce(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const resolved =
        await this.serviceWorkloadIdentityAdapter?.resolveSubject(
          request.headers as Record<string, string | string[] | undefined>,
          {
            requestedTokenAudience,
            exchangeNonce,
          },
        );
      if (!resolved) {
        throw new ApiRequestError(
          503,
          "WORKLOAD_IDENTITY_NOT_CONFIGURED",
          "Workload identity validation is not configured for this environment.",
        );
      }

      const expiresIn: JwtExpiresIn = "15m";
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: "system",
          actorId: resolved.actorId,
          principalId: resolved.principalId,
          subject: resolved.subject,
          realm: "system",
          tenantId: null,
          roleFamilies: [],
          roles: resolved.roles,
          scopes: resolved.scopes,
          requestId:
            (request.headers["x-request-id"] as string | undefined) ?? null,
        },
        {
          expiresIn,
          principalId: resolved.principalId,
          subject: resolved.subject,
          ensurePrincipal: false,
          authTime: resolved.authTime,
          amr: ["workload_identity"],
          acr: "aal2",
          tokenVersion: resolved.tokenVersion,
          audience: [resolved.tokenAudience],
          workloadExchangeNonceHash: resolved.exchangeNonceHash,
        },
      );
      return { token: issued.token, expiresIn };
    }

    // Verified Google proof authorizes fixed tenant grants, direct ops actors,
    // or the driver-targeted provisioning session below. It never creates a
    // general platform-admin or system session from caller-supplied headers.
    // Transitional dual-send fallback remains for existing non-system callers
    // only when the registry/identity is absent; provisioning fails closed.
    let googleCiTenantActorVerified = false;
    let googleOpsActorVerified = false;
    if (rawGoogleAssertion) {
      if (!bootstrapIdentity) {
        throw new ApiRequestError(
          400,
          "IDENTITY_REQUIRED",
          "Bootstrap identity headers (x-actor-type, x-actor-id, x-realm) are required.",
          {},
        );
      }
      
      let resolvedGoogle = null;
      try {
        if (!this.googleWorkloadIdentityAdapter) {
          throw new ApiRequestError(
            503,
            "WORKLOAD_IDENTITY_GOOGLE_NOT_CONFIGURED",
            "Google workload identity validation is not configured for this environment.",
          );
        }
        resolvedGoogle = await this.googleWorkloadIdentityAdapter.verifyServicePrincipal(
          request.headers as Record<string, string | string[] | undefined>,
          {
            requestPath: request.originalUrl ?? request.url,
            requestMethod: request.method,
          },
        );
      } catch (error) {
        if (
          bootstrapIdentity.actorType !== "system" &&
          (isGoogleWorkloadIdentityNotConfigured(error) ||
          isGoogleWorkloadIdentityPrincipalNotRegistered(error))
        ) {
          // Registry not configured yet, or this caller's verified identity
          // has no registry entry yet: ignore the Google assertion and let
          // issuance fall back to the internal key below (same dual-send
          // transition safety as InternalKeyMiddleware). Any other failure
          // (bad signature, issuer/audience mismatch, replay, route scope
          // denial) for an already-registered principal stays fail-closed.
          resolvedGoogle = null;
        } else {
          throw error;
        }
      }

      if (resolvedGoogle) {
        if (bootstrapIdentity.actorType === "system") {
          const grant = resolvedGoogle.driverProvisioningGrant;
          if (!grant || !isCiTenantActorGateEnabled() || strictEnvironment ||
              bootstrapIdentity.realm !== "system" ||
              bootstrapIdentity.actorId !== resolvedGoogle.principalId ||
              bootstrapIdentity.tenantId || bootstrapIdentity.partnerId ||
              rawAssertion ||
              (request.headers["x-scopes"] && request.headers["x-scopes"] !== "driver:provision") ||
              request.headers["x-roles"] || request.headers["x-role-families"]) {
            throw new ApiRequestError(403, "WORKLOAD_DRIVER_PROVISIONING_DENIED",
              "The workload is not granted the requested driver provisioning session.");
          }
          // Never spread bootstrap headers here: all authority comes from the
          // verified registry grant, and the signed target survives JWT decode.
          const expiresIn: JwtExpiresIn = "15m";
          const issued = await this.issueJwtSession({
            authMode: "jwt_bearer", actorType: "system",
            actorId: resolvedGoogle.principalId, principalId: resolvedGoogle.principalId,
            realm: "system", tenantId: null, roleFamilies: [], roles: [],
            scopes: ["driver:provision"], requestId: null,
            driverProvisioningDriverId: grant.driverId,
          }, {
            expiresIn, ensurePrincipal: false,
            principalId: resolvedGoogle.principalId,
            subject: resolvedGoogle.principalId,
            authTime: resolvedGoogle.authTime,
            amr: ["google_workload_identity"], acr: "aal1",
          });
          return { token: issued.token, expiresIn };
        }
        if (
          (bootstrapIdentity.actorId === resolvedGoogle.principalId ||
           bootstrapIdentity.actorId === resolvedGoogle.actorId) &&
          resolvedGoogle.roles.includes(bootstrapIdentity.actorType) &&
          (bootstrapIdentity.actorType === "ops_user" || bootstrapIdentity.actorType === "ops_observer") &&
          bootstrapIdentity.realm === "ops" && !bootstrapIdentity.tenantId && !bootstrapIdentity.partnerId
        ) {
          // Direct authentication! The Google SA is asking for a token for ITSELF.
          googleCiTenantActorVerified = true;
          googleOpsActorVerified = true;
          bootstrapIdentity.principalId = resolvedGoogle.principalId;
          bootstrapIdentity.roleFamilies = ["ops"];
        } else if (isCiTenantActorGateEnabled() && bootstrapIdentity.realm === "tenant" && bootstrapIdentity.actorType === "tenant_admin") {
          const grant = resolveCiTenantActorGrant(resolvedGoogle, {
            tenantId: bootstrapIdentity.tenantId ?? "",
            actorType: bootstrapIdentity.actorType,
            actorId: bootstrapIdentity.actorId ?? "",
          });
          if (!grant) {
            throw new ApiRequestError(
              403,
              "WORKLOAD_CI_TENANT_ACTOR_DENIED",
              "Verified Google workload identity is not granted session issuance for the requested tenant actor.",
            );
          }
          googleCiTenantActorVerified = true;
        } else {
          throw new ApiRequestError(
            403,
            "WORKLOAD_CI_TENANT_ACTOR_DENIED",
            "Verified Google workload identity is not granted session issuance.",
          );
        }
      }
    }
    if (!googleCiTenantActorVerified) {
      // Require internal key to issue tokens when no workload proof is used.
      await validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);
    }

    if (rawAssertion && this.iapSubjectAdapter) {
      const expectedAudience =
        process.env.IAP_EXPECTED_AUDIENCE ||
        process.env.IAP_AUDIENCE ||
        process.env.JWT_AUDIENCE;
      const expectedIssuer = process.env.IAP_EXPECTED_ISSUER;
      const jwtSecretOrPublicKey =
        process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY || process.env.IAP_JWT_SECRET;

      const resolved = await this.iapSubjectAdapter.resolveSubject(
        request.headers,
        {
          strictIapMode: isStrictIap,
          ...(expectedAudience ? { expectedAudience } : {}),
          ...(expectedIssuer ? { expectedIssuer } : {}),
          ...(jwtSecretOrPublicKey ? { jwtSecretOrPublicKey } : {}),
        },
      );

      const identity: BootstrapRequestIdentity = {
        authMode: "jwt_bearer",
        actorType:
          resolved.membership.realm === "platform"
            ? "platform_admin"
            : "ops_user",
        actorId: resolved.principal.principalId,
        principalId: resolved.principal.principalId,
        membershipId: resolved.membership.membershipId,
        subject: resolved.principal.subject,
        realm: resolved.membership.realm as "platform" | "ops",
        tenantId: null,
        tokenVersion: resolved.tokenVersion,
        roleFamilies: [resolved.membership.realm as "platform" | "ops"],
        roles: resolved.effectiveRoles,
        scopes: resolved.effectiveScopes,
        requestId:
          (request.headers["x-request-id"] as string | undefined) ?? null,
      };

      const expiresIn: JwtExpiresIn = "8h";
      const issued = await this.issueJwtSession(identity, {
        expiresIn,
        principalId: resolved.principal.principalId,
        membershipId: resolved.membership.membershipId,
        subject: resolved.principal.subject,
        ensurePrincipal: false,
        authTime: resolved.authTime ?? null,
        amr: resolved.authMethods,
        acr: resolved.assurance,
        tokenVersion: resolved.tokenVersion,
      });
      return { token: issued.token, expiresIn };
    }

    const identity = bootstrapIdentity;

    if (!identity) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Bootstrap identity headers (x-actor-type, x-actor-id, x-realm) are required.",
        {},
      );
    }

    if (isStrictIap && !googleCiTenantActorVerified) {
      throw new ApiRequestError(
        401,
        "AUTH_BOOTSTRAP_HEADERS_FORBIDDEN",
        "Bootstrap identity headers are disabled in strict auth environments.",
      );
    }

    const tenantUser =
      identity.realm === "tenant" && identity.tenantId && identity.actorId
        ? this.tenantPartnerService.findTenantUser(
            identity.tenantId,
            identity.actorId,
          )
        : null;
    if (
      identity.realm === "tenant" &&
      (!tenantUser || tenantUser.status !== "active")
    ) {
      throw new ApiRequestError(
        401,
        "TENANT_SESSION_SUBJECT_INVALID",
        "The requested tenant session subject is not active.",
      );
    }

    const durableTenantScopes = tenantUser
      ? getTenantRoleScopes(tenantUser.roleCode)
      : undefined;
    if (tenantUser && !durableTenantScopes) {
      throw new ApiRequestError(
        403,
        "TENANT_ROLE_INVALID",
        "The requested tenant session role is not configured.",
      );
    }

    // Tenant session claims come from the durable user record, rather than
    // caller-controlled bootstrap headers, so later JWT verification agrees.
    const durableIdentity = tenantUser && durableTenantScopes
      ? {
          ...identity,
          roles: [tenantUser.roleCode],
          scopes: [...durableTenantScopes],
        }
      : identity;

    // Bootstrap issuance still ensures its principal and needs the post-write
    // timestamp. Google ops issuance instead preserves the verifier's principal
    // and signs the version of the existing durable rows.
    let workforceVersionTimestamps: string[] | undefined;
    let verifiedGoogleWorkforceVersion: number | undefined;
    if (
      (durableIdentity.realm === "ops" || durableIdentity.realm === "platform") &&
      !durableIdentity.membershipId &&
      durableIdentity.actorId
    ) {
      if (!this.identityRepository) {
        throw new ApiRequestError(500, "IDENTITY_REPOSITORY_UNAVAILABLE", "Identity repository is required for ops/platform session issuance.");
      }
      const principalToLookup = durableIdentity.principalId ?? durableIdentity.actorId;
      let verifiedGooglePrincipalUpdatedAt: string | undefined;
      if (googleOpsActorVerified) {
        const principal = await this.identityRepository.findPrincipalById(
          principalToLookup,
        );
        if (!principal || principal.status !== "active") {
          this.denyWorkloadSessionIdentity("principal_not_active");
        }
        verifiedGooglePrincipalUpdatedAt = principal.updatedAt;
      }
      const memberships = await this.identityRepository.findMembershipsByPrincipalId(principalToLookup);
      const membership = memberships.find((m) => m.realm === durableIdentity.realm && m.status === "active");
      if (!membership) {
        if (googleOpsActorVerified) {
          this.denyWorkloadSessionIdentity("membership_not_active");
        }
        throw new ApiRequestError(401, "MEMBERSHIP_NOT_FOUND", "The requested ops/platform session subject has no active membership.");
      }
      durableIdentity.membershipId = membership.membershipId;

      const roleBindings = await this.identityRepository.findRoleBindingsByMembershipId(membership.membershipId);
      const now = new Date();
      const activeBindings = roleBindings.filter(
        (b) => (!b.validTo || new Date(b.validTo) > now) && new Date(b.validFrom) <= now,
      );
      if (
        googleOpsActorVerified &&
        !activeBindings.some((binding) => binding.roleCode === durableIdentity.actorType)
      ) {
        this.denyWorkloadSessionIdentity("role_binding_not_active");
      }

      const allowedRoles = activeBindings.map((b) => b.roleCode);
      const allowedScopes = new Set<string>();
      for (const binding of activeBindings) {
        const presets = AUTH_SCOPE_PRESETS[binding.roleCode as AuthActorType] || AUTH_TENANT_ROLE_SCOPE_PRESETS[binding.roleCode];
        if (presets) {
          presets.forEach((s) => allowedScopes.add(s));
        }
      }

      durableIdentity.roles = allowedRoles;
      durableIdentity.scopes = Array.from(allowedScopes);
      // Mirrors the full (not just active-filtered) binding set that
      // validateDurableState recomputes from at verification time.
      workforceVersionTimestamps = [
        membership.updatedAt,
        ...roleBindings.map((b) => b.updatedAt),
      ];
      if (verifiedGooglePrincipalUpdatedAt) {
        verifiedGoogleWorkforceVersion = Math.max(
          ...[verifiedGooglePrincipalUpdatedAt, ...workforceVersionTimestamps].map(Date.parse),
        );
      }
    }

    const expiresIn: JwtExpiresIn =
      durableIdentity.actorType === "system" ? "15m" : "8h";
    const issuedAt = new Date().toISOString();
    const assurance = resolveBootstrapTokenAssurance(durableIdentity);
    const issued = await this.issueJwtSession(durableIdentity, {
      expiresIn,
      principalId: durableIdentity.principalId ?? durableIdentity.actorId,
      membershipId: durableIdentity.membershipId ?? null,
      subject: durableIdentity.subject ?? durableIdentity.actorId,
      // The Google verifier already persisted this principal under its own
      // source_ref. Bootstrap-upserting it again changes that authority and
      // collides with the principal_id PK in PostgreSQL (V0068).
      ensurePrincipal: !googleOpsActorVerified,
      authTime: issuedAt,
      ...(assurance.amr ? { amr: assurance.amr } : {}),
      ...(assurance.acr ? { acr: assurance.acr } : {}),
      tokenVersion: verifiedGoogleWorkforceVersion ?? (
        tenantUser ? Date.parse(tenantUser.updatedAt) : Date.parse(issuedAt)
      ),
      ...(workforceVersionTimestamps && !googleOpsActorVerified
        ? { workforceVersionTimestamps }
        : {}),
    });
    return { token: issued.token, expiresIn };
  }

  private denyWorkloadSessionIdentity(
    reason:
      | "principal_not_active"
      | "membership_not_active"
      | "role_binding_not_active",
  ): never {
    // Detailed reason stays server-side. Never include proof, tokens, headers,
    // database errors or caller identifiers in either the log or response.
    this.logger.warn(`[WORKLOAD_SESSION_IDENTITY_UNAVAILABLE] reason=${reason}`);
    throw new ApiRequestError(
      403,
      "WORKLOAD_SESSION_IDENTITY_UNAVAILABLE",
      "The verified workload cannot establish an active session.",
    );
  }

  @Post("driver/device/invite")
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("driver:provision") // Fits the control path requirement for driver identity overrides
  async issueDriverDeviceInvitation(
    @Body() command: IssueDriverDeviceInvitationCommand,
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
  ) {
    const driverId = identity?.driverProvisioningDriverId;
    if (driverId && (command.driverId !== driverId || command.registrationCode !== undefined || command.expiresInHours !== undefined)) {
      throw new ApiRequestError(403, "WORKLOAD_DRIVER_TARGET_DENIED", "Driver provisioning grant does not allow this invitation.");
    }
    const result = await this.requireIdempotencyService().execute({
      scope: identity?.driverProvisioningDriverId ? `auth:driver_invite:issue:${identity.principalId}:${identity.driverProvisioningDriverId}` : "auth:driver_invite:issue",
      idempotencyKey,
      required: false,
      requestPath: "auth/driver/device/invite",
      payload: command,
      execute: async () => this.driverDeviceSessionService.issueRegistrationInvitation(command),
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Post("driver/device/invite/revoke")
  @RequireRealms("system", "platform", "ops")
  @RequireScopes("driver:provision")
  async revokeDriverDeviceInvitation(
    @Body() command: { registrationCode: string },
    @Headers("x-idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
  ) {
    const result = await this.requireIdempotencyService().execute({
      scope: identity?.driverProvisioningDriverId ? `auth:driver_invite:revoke:${identity.principalId}:${identity.driverProvisioningDriverId}` : "auth:driver_invite:revoke",
      idempotencyKey,
      required: false,
      requestPath: "auth/driver/device/invite/revoke",
      payload: command,
      execute: async () => this.driverDeviceSessionService.revokeInvitation(command, identity?.driverProvisioningDriverId),
    });
    return toApiSuccessEnvelope(result.data, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("driver/device/register")
  async issueDriverDeviceSession(
    @Body() command: RegisterDriverDeviceCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = await this.driverDeviceSessionService.register(
      command,
      requestId,
    );
    return toApiSuccessEnvelope<DriverDeviceProvisioningSession>(
      session,
      requestId,
    );
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("driver/device/refresh")
  async refreshDriverDeviceSession(
    @Body() command: RefreshDriverDeviceSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = await this.driverDeviceSessionService.refresh(command);
    return toApiSuccessEnvelope<DriverDeviceProvisioningSession>(
      session,
      requestId,
    );
  }

  @Post("driver/device/revoke")
  @RequireRealms("system", "platform", "ops", "driver")
  async revokeDriverDeviceSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: RevokeDriverDeviceBindingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.driverDeviceSessionService.revoke(
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }



  @Post("sessions/revoke")
  async revokeSessionSelf(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: { sessionId?: string },
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "UNAUTHENTICATED",
        "Authentication is required to revoke session.",
      );
    }
    const sessionId = command?.sessionId?.trim();
    if (!sessionId) {
      throw new ApiRequestError(
        400,
        "FIELD_REQUIRED",
        "sessionId is required.",
      );
    }
    const callerPrincipalId = identity.principalId ?? identity.actorId;
    if (!callerPrincipalId) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Principal identity is required to revoke session.",
      );
    }
    const result = await this.jwtAuthService.revokeSessionSelf(
      sessionId,
      callerPrincipalId,
      "user_self_revocation",
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/oidc-session")
  async issueTenantOidcSession(
    @Body() command: TenantOidcSessionExchangeCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    try {
      const session =
        await this.requireOidcPkceService().exchangeTenantIdTokenSession(
          command,
          this.buildMeta(forwardedFor, realIp, userAgent, requestId),
        );
      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      throw toPublicTenantAuthError(error);
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/bootstrap-session")
  async issueTenantBootstrapSession(
    @Body() command: CreateTenantBootstrapSessionCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const normalizedEmail = command.email?.trim().toLowerCase() ?? null;
    const requestedTenantId = command.tenantId?.trim() || null;
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);

    try {
      if (!normalizedEmail) {
        throw new ApiRequestError(400, "FIELD_REQUIRED", "email is required.", {
          field: "email",
        });
      }

      this.assertTenantBootstrapFixtureModeEnabled();

      const tenantId =
        requestedTenantId || this.tenantPartnerService.getDefaultTenantId();
      const existingUser =
        this.tenantPartnerService
          .listTenantUsers(tenantId)
          .find((user) => user.email === normalizedEmail) ?? null;

      if (!existingUser) {
        const crossTenantUser =
          requestedTenantId &&
          this.tenantPartnerService.findTenantUserByEmail(normalizedEmail);
        if (crossTenantUser && crossTenantUser.tenantId !== tenantId) {
          throw this.buildTenantBootstrapDeniedError();
        }

        throw this.buildTenantBootstrapDeniedError();
      }

      if (!this.isTenantBootstrapEligibleStatus(existingUser.status)) {
        throw this.buildTenantBootstrapDeniedError();
      }

      const roleCatalog = this.tenantPartnerService.listTenantRoles();
      const resolvedRoleCode = this.resolveExistingUserRoleCode(
        roleCatalog,
        existingUser,
      );
      const profile = this.buildTenantPortalProfile(
        tenantId,
        normalizedEmail,
        existingUser,
        resolvedRoleCode,
      );
      const identity = this.buildIdentityContext(profile);
      const issuedAt = new Date().toISOString();
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: identity.actorType,
          actorId: identity.actorId,
          principalId: identity.actorId,
          subject: profile.id,
          realm: identity.realm,
          tenantId: identity.tenantId,
          roleFamilies: identity.roleFamilies,
          roles: identity.roles,
          scopes: identity.scopes,
          requestId: requestId ?? null,
        },
        {
          expiresIn: TENANT_BOOTSTRAP_EXPIRES_IN,
          principalId: identity.actorId,
          subject: profile.id,
          ensurePrincipal: true,
          authTime: issuedAt,
          amr: ["tenant_bootstrap_fixture"],
          acr: "aal1",
          tokenVersion: Date.parse(existingUser.updatedAt),
        },
      );
      const session: TenantBootstrapSession = {
        accessToken: issued.token,
        tokenType: "Bearer",
        expiresIn: TENANT_BOOTSTRAP_EXPIRES_IN,
        profile,
        identity,
      };

      this.securityEventsService?.recordEvent({
        actorId: identity.actorId,
        actorType: identity.actorType,
        subjectId: normalizedEmail,
        realm: "tenant",
        tenantId,
        partnerId: null,
        eventType: "tenant_bootstrap_session.issued",
        eventFamily: "auth",
        outcome: "success",
        severity: "low",
        targetType: "tenant_portal_session",
        targetId: profile.id,
        sessionId: issued.sessionId,
        tokenId: issued.tokenId,
        authMethods: issued.amr,
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: null,
        approvalId: null,
        beforeSummary: null,
        afterSummary: {
          actorId: identity.actorId,
          roleCode: profile.roleCode,
          tenantId,
        },
        maskedContext: {
          email: normalizedEmail,
        },
      });

      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      this.securityEventsService?.recordEvent({
        actorId: null,
        actorType: "system",
        subjectId: normalizedEmail,
        realm: "tenant",
        tenantId: requestedTenantId,
        partnerId: null,
        eventType: "tenant_bootstrap_session.denied",
        eventFamily: "auth",
        outcome: "denied",
        severity: "medium",
        targetType: "tenant_portal_session",
        targetId: null,
        sessionId: null,
        tokenId: null,
        authMethods: ["tenant_bootstrap_exchange"],
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: this.extractErrorCode(error),
        approvalId: null,
        beforeSummary: null,
        afterSummary: null,
        maskedContext: {
          email: normalizedEmail,
          requestedTenantId,
        },
      });
      throw toPublicTenantAuthError(error);
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("partner/bootstrap-session")
  async issuePartnerBootstrapSession(
    @Body() command: CreatePartnerBootstrapSessionCommand,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const sourceIp = this.resolveSourceIp(forwardedFor, realIp);

    try {
      const resolved = this.tenantPartnerService.authenticatePartnerBootstrap(
        command,
        requestId,
      );
      const issuedAt = new Date().toISOString();
      const issued = await this.issueJwtSession(
        {
          authMode: "jwt_bearer",
          actorType: resolved.identity.actorType,
          actorId: resolved.identity.actorId,
          principalId: resolved.identity.actorId,
          subject: resolved.identity.actorId,
          realm: resolved.identity.realm,
          tenantId: resolved.identity.tenantId,
          partnerId: resolved.identity.partnerId ?? null,
          partnerProgramId: resolved.identity.partnerProgramId ?? null,
          partnerEntrySlug: resolved.identity.partnerEntrySlug ?? null,
          roleFamilies: resolved.identity.roleFamilies,
          roles: resolved.identity.roles,
          scopes: resolved.identity.scopes,
          requestId: requestId ?? null,
        },
        {
          expiresIn: "1h",
          principalId: resolved.identity.actorId,
          subject: resolved.identity.actorId,
          ensurePrincipal: true,
          authTime: issuedAt,
          amr: ["partner_api_key"],
          acr: "aal1",
          tokenVersion: Date.parse(resolved.partnerEntry.updatedAt),
        },
      );
      const session: PartnerBootstrapSession = {
        accessToken: issued.token,
        tokenType: "Bearer",
        expiresIn: "1h",
        partnerEntry: resolved.partnerEntry,
        identity: {
          ...resolved.identity,
          authMode: "jwt_bearer",
        },
      };

      this.securityEventsService?.recordEvent({
        actorId: resolved.identity.actorId,
        actorType: resolved.identity.actorType,
        subjectId: resolved.identity.actorId,
        realm: "partner",
        tenantId: resolved.identity.tenantId,
        partnerId: resolved.identity.partnerId ?? null,
        eventType: "partner_bootstrap_session.issued",
        eventFamily: "auth",
        outcome: "success",
        severity: "low",
        targetType: "partner_entry",
        targetId: resolved.partnerEntry.entrySlug,
        sessionId: issued.sessionId,
        tokenId: issued.tokenId,
        authMethods: issued.amr,
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: null,
        approvalId: null,
        beforeSummary: null,
        afterSummary: {
          partnerEntrySlug: resolved.partnerEntry.entrySlug,
          partnerProgramId: resolved.identity.partnerProgramId ?? null,
        },
        maskedContext: {
          entrySlug: command.entrySlug,
          apiKey: command.apiKey,
        },
      });

      return toApiSuccessEnvelope(session, requestId);
    } catch (error) {
      this.securityEventsService?.recordEvent({
        actorId: null,
        actorType: "system",
        subjectId: command.entrySlug,
        realm: "partner",
        tenantId: null,
        partnerId: null,
        eventType: "partner_bootstrap_session.denied",
        eventFamily: "auth",
        outcome: "denied",
        severity: "medium",
        targetType: "partner_entry",
        targetId: command.entrySlug?.trim() || null,
        sessionId: null,
        tokenId: null,
        authMethods: ["partner_api_key"],
        sourceIp,
        userAgent: userAgent ?? null,
        requestId: requestId ?? null,
        traceId: null,
        reasonCode: this.extractErrorCode(error),
        approvalId: null,
        beforeSummary: null,
        afterSummary: null,
        maskedContext: {
          entrySlug: command.entrySlug,
          apiKey: command.apiKey,
        },
      });
      throw toPublicPartnerAuthError(error);
    }
  }

  @Post("logout")
  async logout(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body?: { reason?: string } | string,
    @Req() request?: TokenRequest | string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity || !identity.sessionId) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to perform logout.",
      );
    }

    const bodyObj = (typeof body === "object" && body !== null ? body : {}) as { reason?: string };
    const reqObj = (typeof request === "object" && request !== null ? request : {}) as TokenRequest;
    const reqHeaders = reqObj.headers as Record<string, string | string[] | undefined> | undefined;
    const effectiveRequestId = typeof body === "string" ? body : typeof request === "string" ? request : requestId;

    validateCsrfHeader(reqHeaders);

    const reason = bodyObj.reason?.trim() || "self_logout";
    const principalId = identity.principalId ?? identity.actorId ?? undefined;

    if (this.identityRepository) {
      await this.identityRepository.revokeSession(
        identity.sessionId,
        reason,
        principalId,
      );
    } else {
      await this.jwtAuthService.revokeCurrentSession(
        identity.sessionId,
        reason,
        principalId,
      );
    }

    const sourceIp = this.resolveSourceIp(
      reqHeaders?.["x-forwarded-for"] as string | undefined,
      reqHeaders?.["x-real-ip"] as string | undefined,
    );
    const userAgent =
      (reqHeaders?.["user-agent"] as string | undefined) ?? null;

    this.securityEventsService?.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.subject ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      eventType: "session.logout",
      eventFamily: "auth",
      outcome: "success",
      severity: "low",
      targetType: "session",
      targetId: identity.sessionId,
      sessionId: identity.sessionId ?? null,
      tokenId: identity.tokenId ?? null,
      authMethods: identity.amr ?? [],
      sourceIp,
      userAgent,
      requestId: effectiveRequestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { status: "active" },
      afterSummary: { status: "revoked" },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { revoked: true, loggedOut: true, sessionId: identity.sessionId },
      effectiveRequestId,
    );
  }

  @Post("logout-all")
  async logoutAll(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body?: { reason?: string } | string,
    @Req() request?: TokenRequest | string,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required for logout-all.",
      );
    }

    const bodyObj = (typeof body === "object" && body !== null ? body : {}) as { reason?: string };
    const reqObj = (typeof request === "object" && request !== null ? request : {}) as TokenRequest;
    const reqHeaders = reqObj.headers as Record<string, string | string[] | undefined> | undefined;
    const effectiveRequestId = typeof body === "string" ? body : typeof request === "string" ? request : requestId;

    validateCsrfHeader(reqHeaders);

    const principalId = identity.principalId ?? identity.actorId;
    if (!principalId) {
      throw new ApiRequestError(
        400,
        "PRINCIPAL_REQUIRED",
        "Principal identifier is required for logout-all.",
      );
    }
    const reason = bodyObj.reason?.trim() || "self_logout_all";
    let revokedCount = 0;
    const revokedSessionIds: string[] = [];

    if (this.identityRepository) {
      const activeSessions =
        await this.identityRepository.listSessionsByPrincipal(principalId);
      for (const session of activeSessions) {
        if (session.status === "active") {
          await this.identityRepository.revokeSession(
            session.sessionId,
            reason,
            principalId,
          );
          revokedCount++;
          revokedSessionIds.push(session.sessionId);
        }
      }
    } else if (identity.sessionId) {
      revokedCount = await this.jwtAuthService.revokeAllSessionsForPrincipal(
        principalId,
        reason,
        principalId,
      );
      revokedSessionIds.push(identity.sessionId);
    }

    const sourceIp = this.resolveSourceIp(
      reqHeaders?.["x-forwarded-for"] as string | undefined,
      reqHeaders?.["x-real-ip"] as string | undefined,
    );
    const userAgent =
      (reqHeaders?.["user-agent"] as string | undefined) ?? null;

    this.securityEventsService?.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.subject ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      eventType: "session.logout_all",
      eventFamily: "auth",
      outcome: "success",
      severity: "medium",
      targetType: "principal",
      targetId: principalId,
      sessionId: identity.sessionId ?? null,
      tokenId: identity.tokenId ?? null,
      authMethods: identity.amr ?? [],
      sourceIp,
      userAgent,
      requestId: effectiveRequestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { revokedCount },
      afterSummary: { revokedCount, sessionIds: revokedSessionIds },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      { loggedOutAll: true, revokedCount, sessionIds: revokedSessionIds },
      effectiveRequestId,
    );
  }

  @Get("sessions")
  async listSelfSessions(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to list sessions.",
      );
    }

    const principalId = identity.principalId ?? identity.actorId;
    let sessions: CanonicalIdentitySessionRecord[] = [];

    if (this.identityRepository && principalId) {
      sessions =
        await this.identityRepository.listSessionsByPrincipal(principalId);
    }

    const activeSessions = sessions.filter((s) => s.status === "active");
    const masked = activeSessions.map((session) =>
      maskSessionRecord(session, identity.sessionId),
    );

    return toApiSuccessEnvelope(masked, requestId);
  }

  @Post("sessions/:sid/revoke")
  async revokeSelfSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("sid") sid: string,
    @Body() command: IamSessionRevokeCommand,
    @Req() request: TokenRequest,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!identity) {
      throw new ApiRequestError(
        401,
        "AUTHENTICATION_REQUIRED",
        "An active authenticated session is required to revoke session.",
      );
    }

    validateCsrfHeader(
      request.headers as Record<string, string | string[] | undefined>,
    );

    if (!this.identityRepository) {
      throw new ApiRequestError(
        503,
        "IDENTITY_REPOSITORY_NOT_AVAILABLE",
        "Identity repository is not available.",
      );
    }

    const targetSession = await this.identityRepository.getSession(sid);
    if (!targetSession) {
      throw new ApiRequestError(
        404,
        "SESSION_NOT_FOUND",
        "Target session to revoke was not found.",
        { sid },
      );
    }

    if (
      command.expectedVersion !== undefined &&
      command.expectedVersion !== null
    ) {
      if (
        targetSession.status === "revoked" ||
        targetSession.tokenVersion !== command.expectedVersion
      ) {
        throw new ApiRequestError(
          409,
          "IAM_CONCURRENCY_CONFLICT",
          "Session token version mismatch or session already revoked.",
          {
            sid,
            expectedVersion: command.expectedVersion,
            currentVersion: targetSession.tokenVersion,
            status: targetSession.status,
          },
        );
      }
    }

    const callerPrincipalId = identity.principalId ?? identity.actorId;
    const isSelf = targetSession.principalId === callerPrincipalId;

    if (!isSelf) {
      const isPlatformOrOpsAdmin =
        (identity.realm === "platform" || identity.realm === "ops") &&
        (identity.actorType === "platform_admin" ||
          identity.roles.includes("platform_superadmin") ||
          identity.roles.includes("platform_user_admin") ||
          identity.roles.includes("ops_admin") ||
          identity.scopes.includes("platform:superadmin") ||
          identity.scopes.includes("identity:sessions:write") ||
          identity.scopes.includes("identity:users:write"));

      const isTenantAdmin =
        identity.realm === "tenant" &&
        (identity.actorType === "tenant_admin" ||
          identity.roles.includes("tenant_admin") ||
          identity.scopes.includes("identity:users:write") ||
          identity.scopes.includes("identity:sessions:write"));

      if (!isPlatformOrOpsAdmin && !isTenantAdmin) {
        throw new ApiRequestError(
          403,
          "AUTHZ_SCOPE_DENIED",
          "You are not authorized to revoke another user's session.",
        );
      }

      if (
        identity.realm === "tenant" &&
        targetSession.tenantId !== identity.tenantId
      ) {
        throw new ApiRequestError(
          403,
          "RESOURCE_SCOPE_DENIED",
          "Tenant administrators cannot revoke sessions outside their tenant boundary.",
        );
      }
    }

    const reason = command.reason?.trim() || "remote_revoke";
    const updated = await this.identityRepository.revokeSession(
      sid,
      reason,
      callerPrincipalId ?? undefined,
    );

    const sourceIp = this.resolveSourceIp(
      request.headers["x-forwarded-for"] as string | undefined,
      request.headers["x-real-ip"] as string | undefined,
    );
    const userAgent =
      (request.headers["user-agent"] as string | undefined) ?? null;

    this.securityEventsService?.recordEvent({
      actorId: identity.actorId,
      actorType: identity.actorType,
      subjectId: identity.subject ?? identity.actorId,
      realm: identity.realm,
      tenantId: identity.tenantId,
      partnerId: identity.partnerId ?? null,
      eventType: "session.revoke",
      eventFamily: "auth",
      outcome: "success",
      severity: "medium",
      targetType: "session",
      targetId: sid,
      sessionId: identity.sessionId ?? null,
      tokenId: identity.tokenId ?? null,
      authMethods: identity.amr ?? [],
      sourceIp,
      userAgent,
      requestId: requestId ?? null,
      traceId: null,
      reasonCode: reason,
      approvalId: null,
      beforeSummary: { status: targetSession.status },
      afterSummary: { status: "revoked" },
      maskedContext: null,
    });

    return toApiSuccessEnvelope(
      {
        revoked: true,
        sessionId: sid,
        session: updated ? maskSessionRecord(updated) : null,
      },
      requestId,
    );
  }

  private extractErrorCode(error: unknown) {
    if (!(error instanceof ApiRequestError)) {
      return null;
    }

    return (
      (error.getResponse() as { error?: { code?: string } })?.error?.code ??
      null
    );
  }

  private resolveSourceIp(
    forwardedFor?: string | null,
    realIp?: string | null,
  ) {
    return forwardedFor?.trim() || realIp?.trim() || null;
  }

  private assertTenantBootstrapFixtureModeEnabled() {
    if (this.isTenantBootstrapFixtureModeEnabled()) {
      return;
    }

    throw new ApiRequestError(
      403,
      "AUTH_SESSION_EXCHANGE_DENIED",
      "The authentication proof could not be matched to an active session exchange.",
      {},
    );
  }

  private isTenantBootstrapFixtureModeEnabled() {
    const environment = detectAuthEnvironment(process.env);
    if (environment !== "local" && environment !== "test") {
      return false;
    }

    const mode =
      process.env[TENANT_BOOTSTRAP_FIXTURE_MODE_ENV]?.trim().toLowerCase() ??
      "";
    return mode === TENANT_BOOTSTRAP_FIXTURE_MODE;
  }

  private buildTenantBootstrapDeniedError() {
    return new ApiRequestError(
      403,
      "AUTH_SESSION_EXCHANGE_DENIED",
      "The authentication proof could not be matched to an active session exchange.",
      {},
    );
  }

  private isTenantBootstrapEligibleStatus(status: string | null | undefined) {
    return status?.trim().toLowerCase() === "active";
  }

  private resolveExistingUserRoleCode(
    roleCatalog: TenantRoleCatalogRecord[],
    existingUser: TenantUserRoleRecord,
  ): string {
    const existingRoleCode = existingUser.roleCode?.trim();
    if (!existingRoleCode) {
      throw new ApiRequestError(
        500,
        "TENANT_USER_ROLE_MISCONFIGURED",
        "The tenant user is missing a supported role assignment.",
        {
          email: existingUser.email,
          tenantId: existingUser.tenantId,
        },
      );
    }

    const supportedRole = roleCatalog.some(
      (role) => role.roleCode === existingRoleCode,
    );
    if (!supportedRole) {
      throw new ApiRequestError(
        500,
        "TENANT_USER_ROLE_MISCONFIGURED",
        "The tenant user references an unsupported role assignment.",
        {
          email: existingUser.email,
          tenantId: existingUser.tenantId,
          roleCode: existingRoleCode,
        },
      );
    }

    return existingRoleCode;
  }

  private buildTenantPortalProfile(
    tenantId: string,
    email: string,
    existingUser: TenantUserRoleRecord,
    roleCode: string,
  ): TenantPortalProfile {
    const fullName =
      existingUser.displayName?.trim() || this.deriveFallbackDisplayName(email);

    return {
      id: existingUser.userId?.trim() || this.deriveActorId(email),
      tenantId,
      fullName,
      email,
      roleCode,
    };
  }

  private buildIdentityContext(profile: TenantPortalProfile): IdentityContext {
    const scopes = getTenantRoleScopes(profile.roleCode);
    if (!scopes) {
      throw new ApiRequestError(
        500,
        "TENANT_ROLE_SCOPE_MISCONFIGURED",
        "No scope preset is configured for the tenant role.",
        {
          roleCode: profile.roleCode,
        },
      );
    }

    return {
      actorType: "tenant_admin",
      actorId: profile.id,
      realm: "tenant",
      authMode: "jwt_bearer",
      roleFamilies: ["tenant"],
      roles: [profile.roleCode],
      scopes: [...scopes],
      tenantId: profile.tenantId,
      supportedExecutionModes: [
        "discussion_planning",
        "supervisor_managed_execution",
      ],
    };
  }

  private deriveFallbackDisplayName(email: string): string {
    const localPart = email.split("@", 1)[0]?.trim();
    if (!localPart) {
      return "Tenant User";
    }

    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(" ");
  }

  private deriveActorId(email: string): string {
    const slug =
      email
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "tenant-portal-user";
    return `tenant-portal-${slug}`;
  }

  private async issueJwtSession(
    identity: Parameters<JwtAuthService["issueSessionToken"]>[0],
    options?: Parameters<JwtAuthService["issueSessionToken"]>[1],
  ) {
    try {
      return await this.jwtAuthService.issueSessionToken(identity, options);
    } catch (error) {
      if (isJwtKeyMaterialNotConfiguredError(error)) {
        throw new ApiRequestError(
          503,
          "JWT_NOT_CONFIGURED",
          "JWT session issuance is not configured for this environment.",
          {
            requiredEnv: error.requiredEnv.join(" or "),
          },
        );
      }

      throw error;
    }
  }
}
