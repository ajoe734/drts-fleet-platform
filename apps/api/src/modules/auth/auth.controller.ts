import { Body, Controller, Headers, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  CreateTenantBootstrapSessionCommand,
  IdentityContext,
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
import { getTenantRoleScopes } from "../../common/auth/auth.constants";
import { JwtAuthService } from "../../common/auth/jwt-auth.service";
import { validateInternalKey } from "../../common/auth/internal-key.middleware";
import { extractBootstrapRequestIdentity } from "../../common/auth/auth.extractor";
import type { AuthBootstrapHeaders } from "../../common/auth/auth.types";
import { OPEN_ROUTE_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { TenantPartnerService } from "../tenant-partner/tenant-partner.service";

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

@Controller("auth")
export class AuthController {
  constructor(
    private readonly jwtAuthService: JwtAuthService,
    private readonly tenantPartnerService: TenantPartnerService,
  ) {}

  @Post("token")
  issueToken(@Req() request: TokenRequest): {
    token: string;
    expiresIn: string;
  } {
    // Require internal key to issue tokens
    validateInternalKey(request, process.env.DRTS_INTERNAL_KEY);

    const identity = extractBootstrapRequestIdentity(request.headers, {
      allowAnonymous: false,
      method: request.method,
      requestUrl: request.originalUrl ?? request.url,
    });

    if (!identity) {
      throw new ApiRequestError(
        400,
        "IDENTITY_REQUIRED",
        "Bootstrap identity headers (x-actor-type, x-actor-id, x-realm) are required.",
        {},
      );
    }

    const expiresIn: JwtExpiresIn =
      identity.actorType === "system" ? "1h" : "8h";
    const token = this.signJwt(identity, expiresIn);
    return { token, expiresIn };
  }

  @OpenRoute()
  @Throttle(OPEN_ROUTE_RATE_LIMIT)
  @Post("tenant/bootstrap-session")
  issueTenantBootstrapSession(
    @Body() command: CreateTenantBootstrapSessionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const normalizedEmail = command.email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new ApiRequestError(400, "FIELD_REQUIRED", "email is required.", {
        field: "email",
      });
    }

    const tenantId =
      command.tenantId?.trim() ||
      this.tenantPartnerService.getDefaultTenantId();
    const existingUser =
      this.tenantPartnerService
        .listTenantUsers(tenantId)
        .find((user) => user.email === normalizedEmail) ?? null;

    if (existingUser?.status === "suspended") {
      throw new ApiRequestError(
        403,
        "TENANT_USER_SUSPENDED",
        "The tenant user is suspended and cannot start a portal session.",
        {
          email: normalizedEmail,
          tenantId,
        },
      );
    }

    if (!existingUser) {
      throw new ApiRequestError(
        403,
        "TENANT_USER_NOT_INVITED",
        "No active tenant user was found for this email.",
        {
          email: normalizedEmail,
          tenantId,
        },
      );
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
        authMode: "bootstrap_headers",
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

    return toApiSuccessEnvelope(session, requestId);
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
      if (
        error instanceof Error &&
        error.message.includes("JWT_SECRET environment variable is not set")
      ) {
        throw new ApiRequestError(
          503,
          "JWT_NOT_CONFIGURED",
          "JWT session issuance is not configured for this environment.",
          {
            requiredEnv: "JWT_SECRET",
          },
        );
      }

      throw error;
    }
  }
}
