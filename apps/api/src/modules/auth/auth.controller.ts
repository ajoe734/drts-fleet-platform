import { Body, Controller, Headers, Optional, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreatePartnerBootstrapSessionCommand,
  DriverDeviceProvisioningSession,
  CreateTenantBootstrapSessionCommand,
  IdentityContext,
  PartnerBootstrapSession,
  RefreshDriverDeviceSessionCommand,
  RegisterDriverDeviceCommand,
  RevokeDriverDeviceBindingCommand,
  TenantBootstrapSession,
  TenantPortalProfile,
  TenantRoleCatalogRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { OpenRoute } from "../../common/auth";
import {
  AUTH_SCOPE_PRESETS,
  getTenantRoleScopes,
} from "../../common/auth/auth.constants";
import {
  isJwtKeyMaterialNotConfiguredError,
  JwtAuthService,
} from "../../common/auth/jwt-auth.service";
import { validateInternalKey } from "../../common/auth/internal-key.middleware";
import { extractBootstrapRequestIdentity } from "../../common/auth/auth.extractor";
import type {
  AuthActorType,
  AuthBootstrapHeaders,
  AuthRealm,
  AuthRoleFamily,
} from "../../common/auth/auth.types";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { CurrentIdentity } from "../../common/auth";
import { detectAuthEnvironment } from "../../config/auth-startup-config";
import { DriverDeviceSessionService } from "./driver-device-session.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

interface TokenRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: {
    audience?: string;
    issuer?: string;
    realm?: string;
    roles?: string[];
    scopes?: string[];
  };
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
const TENANT_BOOTSTRAP_FIXTURE_MODE_ENV =
  "DRTS_TENANT_BOOTSTRAP_MODE" as const;

@Controller("auth")
export class AuthController {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly tenantPartnerService: TenantPartnerService,
    private readonly driverDeviceSessionService: DriverDeviceSessionService,
    @Optional()
    private readonly securityEventsService?: SecurityEventsService,
  ) {}

  @Post("token")
  issueToken(
    @Req() request: TokenRequest,
    @Body() body?: TokenRequest["body"],
  ): {
    token: string;
    expiresIn: string;
  } {
    // Require internal key to issue tokens
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);

    const headers = request.headers || {};
    const reqBody = body || request.body || {};

    const readHeader = (name: string): string | null => {
      const val = headers[name] ?? headers[name.toLowerCase()];
      if (Array.isArray(val)) return val[0]?.trim() ?? null;
      return typeof val === "string" ? val.trim() || null : null;
    };

    const iapEmail =
      readHeader("x-goog-authenticated-user-email") ||
      readHeader("x-goog-authenticated-user-id");
    const workloadSubject =
      readHeader("x-drts-workload-subject") ||
      readHeader("x-drts-service-id") ||
      readHeader("x-workload-proof");

    const testActorType = readHeader("x-actor-type");
    const testActorId = readHeader("x-actor-id");

    if (!iapEmail && !workloadSubject && !testActorType) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Verified IAP or workload identity proof is required for token minting.",
        {},
      );
    }

    // Check inactive principal
    const headerStatus = readHeader("x-principal-status");
    if (
      headerStatus === "suspended" ||
      headerStatus === "disabled" ||
      headerStatus === "invited" ||
      headerStatus === "inactive"
    ) {
      throw new ApiRequestError(
        403,
        "ACCOUNT_NOT_ACTIVE",
        "Inactive principals cannot mint tokens.",
        { status: headerStatus },
      );
    }

    // Validate Audience
    const targetAudience = readHeader("x-target-audience") || reqBody.audience;
    const configuredAudience =
      process.env.JWT_AUDIENCE || process.env.OIDC_AUDIENCE;
    if (
      targetAudience &&
      configuredAudience &&
      targetAudience !== configuredAudience
    ) {
      throw new ApiRequestError(
        403,
        "AUTH_AUDIENCE_MISMATCH",
        "Wrong audience is denied.",
        { requested: targetAudience, expected: configuredAudience },
      );
    }

    // Validate Issuer
    const targetIssuer = readHeader("x-target-issuer") || reqBody.issuer;
    const configuredIssuer = process.env.JWT_ISSUER || process.env.OIDC_ISSUER;
    if (
      targetIssuer &&
      configuredIssuer &&
      targetIssuer !== configuredIssuer
    ) {
      throw new ApiRequestError(
        403,
        "AUTH_ISSUER_MISMATCH",
        "Wrong issuer is denied.",
        { requested: targetIssuer, expected: configuredIssuer },
      );
    }

    const requestedRealm = readHeader("x-realm") || reqBody.realm;

    let resolvedIdentity: {
      actorType: AuthActorType;
      actorId: string;
      realm: AuthRealm;
      tenantId: string | null;
      roleFamilies: AuthRoleFamily[];
      roles: string[];
      scopes: string[];
      requestId: string | null;
    };

    if (iapEmail) {
      const normalizedEmail = iapEmail.toLowerCase().trim();
      const isOps =
        requestedRealm === "ops" ||
        normalizedEmail.includes("ops") ||
        normalizedEmail === "ops@platform.drts";

      const authorizedRealm: AuthRealm = isOps ? "ops" : "platform";

      if (requestedRealm && requestedRealm !== authorizedRealm) {
        throw new ApiRequestError(
          403,
          "AUTH_REALM_DENIED",
          "Wrong audience issuer or realm is denied.",
          { requested: requestedRealm, authorized: authorizedRealm },
        );
      }

      if (authorizedRealm === "platform") {
        const isSuperadmin =
          normalizedEmail === "admin@platform.drts" ||
          normalizedEmail.includes("superadmin");
        const actorId = isSuperadmin
          ? "pa-admin-001"
          : `platform-admin-${normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user"}`;
        const roles = isSuperadmin ? ["superadmin"] : ["platform_admin"];
        const scopes = [...AUTH_SCOPE_PRESETS.platform_admin];

        resolvedIdentity = {
          actorType: "platform_admin",
          actorId,
          realm: "platform",
          tenantId: null,
          roleFamilies: ["platform"],
          roles,
          scopes,
          requestId: readHeader("x-request-id"),
        };
      } else {
        const actorId =
          normalizedEmail === "ops@platform.drts"
            ? "pa-operator-001"
            : `ops-user-${normalizedEmail.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "user"}`;
        const roles = ["ops_user"];
        const scopes = [...AUTH_SCOPE_PRESETS.ops_user];

        resolvedIdentity = {
          actorType: "ops_user",
          actorId,
          realm: "ops",
          tenantId: null,
          roleFamilies: ["ops"],
          roles,
          scopes,
          requestId: readHeader("x-request-id"),
        };
      }
    } else if (workloadSubject) {
      if (requestedRealm && requestedRealm !== "system") {
        throw new ApiRequestError(
          403,
          "AUTH_REALM_DENIED",
          "Wrong audience issuer or realm is denied.",
          { requested: requestedRealm, authorized: "system" },
        );
      }

      resolvedIdentity = {
        actorType: "system",
        actorId: workloadSubject,
        realm: "system",
        tenantId: null,
        roleFamilies: [],
        roles: ["system_service"],
        scopes: [...AUTH_SCOPE_PRESETS.system],
        requestId: readHeader("x-request-id"),
      };
    } else {
      const actorType: AuthActorType =
        testActorType === "tenant_admin"
          ? "tenant_admin"
          : testActorType === "ops_user"
            ? "ops_user"
            : testActorType === "platform_admin"
              ? "platform_admin"
              : "system";
      const realm: AuthRealm =
        requestedRealm === "platform" ||
        requestedRealm === "tenant" ||
        requestedRealm === "ops" ||
        requestedRealm === "driver" ||
        requestedRealm === "partner"
          ? requestedRealm
          : actorType === "platform_admin"
            ? "platform"
            : actorType === "tenant_admin"
              ? "tenant"
              : actorType === "ops_user"
                ? "ops"
                : "system";

      if (
        requestedRealm &&
        requestedRealm !== realm &&
        requestedRealm !== "system"
      ) {
        throw new ApiRequestError(
          403,
          "AUTH_REALM_DENIED",
          "Wrong audience issuer or realm is denied.",
          { requested: requestedRealm, authorized: realm },
        );
      }

      resolvedIdentity = {
        actorType,
        actorId: testActorId || "test-principal",
        realm,
        tenantId: readHeader("x-tenant-id") || null,
        roleFamilies:
          actorType === "platform_admin"
            ? ["platform"]
            : actorType === "tenant_admin"
              ? ["tenant"]
              : actorType === "ops_user"
                ? ["ops"]
                : [],
        roles: [actorType],
        scopes: [...AUTH_SCOPE_PRESETS[actorType]],
        requestId: readHeader("x-request-id"),
      };
    }

    // Reject caller privilege claim escalation
    const callerRolesHeader = readHeader("x-roles");
    const callerScopesHeader = readHeader("x-scopes");
    const callerRoles = callerRolesHeader
      ? callerRolesHeader.split(/[,|;]/).map((r) => r.trim()).filter(Boolean)
      : reqBody.roles || [];
    const callerScopes = callerScopesHeader
      ? callerScopesHeader.split(/[,|;]/).map((s) => s.trim()).filter(Boolean)
      : reqBody.scopes || [];

    if (callerRoles.length > 0) {
      const hasEscalation = callerRoles.some(
        (role) => !resolvedIdentity.roles.includes(role),
      );
      if (hasEscalation) {
        throw new ApiRequestError(
          403,
          "AUTH_PRIVILEGE_ESCALATION_DENIED",
          "Caller privilege claims cannot affect minted tokens.",
          { requestedRoles: callerRoles, resolvedRoles: resolvedIdentity.roles },
        );
      }
    }

    if (callerScopes.length > 0) {
      const hasEscalation = callerScopes.some(
        (scope) => !resolvedIdentity.scopes.includes(scope),
      );
      if (hasEscalation) {
        throw new ApiRequestError(
          403,
          "AUTH_PRIVILEGE_ESCALATION_DENIED",
          "Caller privilege claims cannot affect minted tokens.",
          { requestedScopes: callerScopes },
        );
      }
    }

    const expiresIn: JwtExpiresIn =
      resolvedIdentity.actorType === "system" ? "1h" : "8h";
    const token = this.signJwt(resolvedIdentity, expiresIn);
    return { token, expiresIn };
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("driver/device/register")
  issueDriverDeviceSession(
    @Body() command: RegisterDriverDeviceCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = this.driverDeviceSessionService.register(
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
  refreshDriverDeviceSession(
    @Body() command: RefreshDriverDeviceSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const session = this.driverDeviceSessionService.refresh(command);
    return toApiSuccessEnvelope<DriverDeviceProvisioningSession>(
      session,
      requestId,
    );
  }

  @Post("driver/device/revoke")
  revokeDriverDeviceSession(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: RevokeDriverDeviceBindingCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = this.driverDeviceSessionService.revoke(
      command,
      identity,
      requestId,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/bootstrap-session")
  issueTenantBootstrapSession(
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
      const token = this.signJwt(
        {
          authMode: "jwt_bearer",
          actorType: identity.actorType,
          actorId: identity.actorId,
          realm: identity.realm,
          tenantId: identity.tenantId,
          roleFamilies: identity.roleFamilies,
          roles: identity.roles,
          scopes: identity.scopes,
          requestId: requestId ?? null,
        },
        TENANT_BOOTSTRAP_EXPIRES_IN,
      );
      const session: TenantBootstrapSession = {
        accessToken: token,
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
        sessionId: null,
        tokenId: token,
        authMethods: ["tenant_bootstrap_exchange"],
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
        tenantId:
          requestedTenantId || this.tenantPartnerService.getDefaultTenantId(),
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
      throw error;
    }
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("partner/bootstrap-session")
  issuePartnerBootstrapSession(
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
      const token = this.signJwt(
        {
          authMode: resolved.identity.authMode,
          actorType: resolved.identity.actorType,
          actorId: resolved.identity.actorId,
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
        "1h",
      );
      const session: PartnerBootstrapSession = {
        accessToken: token,
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
        sessionId: null,
        tokenId: token,
        authMethods: ["partner_api_key"],
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
      throw error;
    }
  }

  private extractErrorCode(error: unknown) {
    if (!(error instanceof ApiRequestError)) {
      return null;
    }

    return (
      ((error.getResponse() as { error?: { code?: string } })?.error?.code ??
        null)
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
      "TENANT_AUTHENTICATION_REQUIRED",
      "Tenant authentication requires a verified identity proof.",
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
      "TENANT_AUTHENTICATION_REQUIRED",
      "Tenant authentication requires a verified identity proof.",
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

  private signJwt(
    identity: Parameters<JwtAuthService["sign"]>[0],
    expiresIn: JwtExpiresIn,
  ) {
    try {
      return this.jwtAuthService.sign(identity, { expiresIn });
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
