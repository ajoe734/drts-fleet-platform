import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";
import jwt from "../../apps/api/node_modules/jsonwebtoken";

import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../apps/api/src/common/auth/auth.constants";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { JwtSessionClaimsService } from "../../apps/api/src/modules/auth/jwt-session-claims.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { signTestIapJwtAssertion } from "@drts/control-plane-auth";

const INTERNAL_KEY = "test_internal_key_123";
const JWT_SECRET = "jwt_session_claims_integration_secret_32_chars!";
const IAP_SECRET = "jwt_session_claims_iap_secret_32_chars!!";
const IAP_AUDIENCE = "/projects/1122334455/apps/drts-control-plane-prod";

function signAssertion(payload: Record<string, unknown>): string {
  return signTestIapJwtAssertion(
    {
      iss: "https://cloud.google.com/iap",
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: IAP_AUDIENCE,
      ...payload,
    },
    IAP_SECRET,
  );
}

function createAuditNotificationService() {
  return {
    recordAuditLog() {},
  } as any;
}

function createGuard(
  jwtSessionClaimsService: JwtSessionClaimsService,
  driverDeviceSessionService?: DriverDeviceSessionService,
) {
  const reflector = {
    getAllAndOverride: () => undefined,
  } as any;

  return new BootstrapAuthGuard(
    reflector,
    new JwtAuthService(),
    jwtSessionClaimsService,
    driverDeviceSessionService,
  );
}

function createBearerContext(token: string, url = "/api/ops/orders") {
  const request: any = {
    headers: {
      authorization: `Bearer ${token}`,
    },
    method: "GET",
    url,
  };
  return {
    request,
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => {},
      getClass: () => class {},
    } as any,
  };
}

describe("JWT session claims integration", () => {
  it("invalidates tenant bearer tokens after role or status changes", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";
    process.env.NODE_ENV = "test";

    const securityEventsService = new SecurityEventsService();
    const tenantPartnerService = new TenantPartnerService(
      createAuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
    );
    const jwtSessionClaimsService = new JwtSessionClaimsService(
      tenantPartnerService,
    );
    const controller = new AuthController(
      new JwtAuthService(),
      tenantPartnerService,
      {} as never,
      jwtSessionClaimsService,
      securityEventsService,
    );

    const session = controller.issueTenantBootstrapSession({
      email: "ops@acme.example",
      tenantId: "tenant-demo-001",
    });
    const guard = createGuard(jwtSessionClaimsService);
    const firstPass = createBearerContext(session.data.accessToken);

    await expect(guard.canActivate(firstPass.context)).resolves.toBe(true);

    tenantPartnerService.updateTenantUserRole(
      "tenant-demo-001",
      "tenant-user-demo-002",
      {
        roleCode: "tenant_viewer",
        status: "suspended",
      },
      "req-tenant-role-change",
    );

    const secondPass = createBearerContext(session.data.accessToken);
    await expect(guard.canActivate(secondPass.context)).rejects.toMatchObject({
      code: "JWT_SESSION_INVALIDATED",
    });

    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
    delete process.env.NODE_ENV;
  });

  it("rejects alg none and algorithm confusion attempts", async () => {
    const jwtAuthService = new JwtAuthService();
    const jwtSessionClaimsService = new JwtSessionClaimsService();
    const identity = {
      authMode: "jwt_bearer" as const,
      actorType: "system" as const,
      actorId: "svc-orders",
      realm: "system" as const,
      tenantId: null,
      roleFamilies: [],
      roles: ["dispatch_service"],
      scopes: ["dispatch:read"],
      requestId: null,
    };
    const sessionClaims = jwtSessionClaimsService.buildClaims(identity);

    const unsignedToken = jwt.sign(
      {
        sub: identity.actorId,
        actorType: identity.actorType,
        realm: identity.realm,
        tenantId: identity.tenantId,
        roleFamilies: identity.roleFamilies,
        roles: identity.roles,
        scopes: identity.scopes,
        ...sessionClaims,
      },
      "",
      { algorithm: "none" },
    );
    expect(jwtAuthService.verify(unsignedToken)).toBeNull();

    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    process.env.JWT_PRIVATE_KEY = privateKey.export({
      type: "pkcs1",
      format: "pem",
    }) as string;
    process.env.JWT_PUBLIC_KEY = publicKey.export({
      type: "pkcs1",
      format: "pem",
    }) as string;

    const forgedToken = jwt.sign(
      {
        sub: identity.actorId,
        actorType: identity.actorType,
        realm: identity.realm,
        tenantId: identity.tenantId,
        roleFamilies: identity.roleFamilies,
        roles: identity.roles,
        scopes: identity.scopes,
        ...sessionClaims,
      },
      process.env.JWT_PUBLIC_KEY,
      { algorithm: "HS256" },
    );
    expect(jwtAuthService.verify(forgedToken)).toBeNull();

    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
  });

  it("invalidates control-plane bearer tokens after membership drift but survives service restart", async () => {
    process.env.DRTS_INTERNAL_KEY = INTERNAL_KEY;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.IAP_EXPECTED_AUDIENCE = IAP_AUDIENCE;
    process.env.IAP_JWT_SECRET = IAP_SECRET;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);
    const tenantPartnerService = new TenantPartnerService(
      createAuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
      identityRepo,
    );
    const jwtSessionClaimsService = new JwtSessionClaimsService(
      tenantPartnerService,
      identityRepo,
    );
    const driverDeviceSessionService = new DriverDeviceSessionService(
      new JwtAuthService(),
      null as any,
      jwtSessionClaimsService,
      null as any,
    );
    const controller = new AuthController(
      new JwtAuthService(),
      tenantPartnerService,
      driverDeviceSessionService,
      jwtSessionClaimsService,
      securityEventsService,
      adapter,
    );

    const tokenResponse = await controller.issueToken({
      headers: {
        "x-drts-internal-key": INTERNAL_KEY,
        "x-goog-iap-jwt-assertion": signAssertion({
          sub: "restart_subject_001",
          email: "restart-admin@platform.drts",
          gcp_ia_groups: ["platform-admins@platform.drts"],
        }),
      },
    });
    const issuedPayload = new JwtAuthService().verify(tokenResponse.token);
    expect(issuedPayload?.membershipId).toBeTruthy();
    expect(issuedPayload?.sub).toBeTruthy();

    const guardBeforeRestart = createGuard(
      new JwtSessionClaimsService(tenantPartnerService, identityRepo),
    );
    const firstPass = createBearerContext(
      tokenResponse.token,
      "/api/platform-admin/dispatch-recovery",
    );
    await expect(guardBeforeRestart.canActivate(firstPass.context)).resolves.toBe(
      true,
    );

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: issuedPayload!.sub!,
        sourceRef: "iap_subject:restart_subject_001",
        issuer: "google_iap",
        subject: "restart_subject_001",
        principalType: "human",
        email: "restart-admin@platform.drts",
        emailVerified: true,
        displayName: "Restart Admin",
        status: "active",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:01:00.000Z",
      },
      {
        membershipId: issuedPayload!.membershipId!,
        sourceRef: "iap_membership:restart_subject_001",
        principalId: issuedPayload!.sub!,
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "suspended",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:02:00.000Z",
      },
      [
        {
          roleBindingId: "role_binding_iap_restart_subject_001",
          sourceRef: "role_binding_iap_restart_subject_001",
          membershipId: issuedPayload!.membershipId!,
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: "2026-08-02T00:00:00.000Z",
          validTo: null,
          createdAt: "2026-08-02T00:00:00.000Z",
          updatedAt: "2026-08-02T00:02:00.000Z",
        },
      ],
    );

    const guardAfterRestart = createGuard(
      new JwtSessionClaimsService(tenantPartnerService, identityRepo),
    );
    const secondPass = createBearerContext(
      tokenResponse.token,
      "/api/platform-admin/dispatch-recovery",
    );
    await expect(guardAfterRestart.canActivate(secondPass.context)).rejects.toMatchObject(
      {
        code: "JWT_SESSION_INVALIDATED",
      },
    );

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.IAP_EXPECTED_AUDIENCE;
    delete process.env.IAP_JWT_SECRET;
  });

  it("invalidates control-plane bearer tokens after principal status drift", async () => {
    process.env.DRTS_INTERNAL_KEY = INTERNAL_KEY;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.IAP_EXPECTED_AUDIENCE = IAP_AUDIENCE;
    process.env.IAP_JWT_SECRET = IAP_SECRET;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);
    const tenantPartnerService = new TenantPartnerService(
      createAuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
      identityRepo,
    );
    const jwtSessionClaimsService = new JwtSessionClaimsService(
      tenantPartnerService,
      identityRepo,
    );
    const controller = new AuthController(
      new JwtAuthService(),
      tenantPartnerService,
      {} as never,
      jwtSessionClaimsService,
      securityEventsService,
      adapter,
    );

    const tokenResponse = await controller.issueToken({
      headers: {
        "x-drts-internal-key": INTERNAL_KEY,
        "x-goog-iap-jwt-assertion": signAssertion({
          sub: "principal_drift_subject_001",
          email: "principal-drift-admin@platform.drts",
          gcp_ia_groups: ["platform-admins@platform.drts"],
        }),
      },
    });

    const payload = new JwtAuthService().verify(tokenResponse.token);
    expect(payload?.membershipId).toBeTruthy();
    expect(payload?.sub).toBeTruthy();

    const guardBeforeDrift = createGuard(
      new JwtSessionClaimsService(tenantPartnerService, identityRepo),
    );
    const firstPass = createBearerContext(
      tokenResponse.token,
      "/api/platform-admin/dispatch-recovery",
    );
    await expect(guardBeforeDrift.canActivate(firstPass.context)).resolves.toBe(
      true,
    );

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: payload!.sub!,
        sourceRef: "iap_subject:principal_drift_subject_001",
        issuer: "google_iap",
        subject: "principal_drift_subject_001",
        principalType: "human",
        email: "principal-drift-admin@platform.drts",
        emailVerified: true,
        displayName: "Principal Drift Admin",
        status: "suspended",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:03:00.000Z",
      },
      {
        membershipId: payload!.membershipId!,
        sourceRef: "iap_membership:principal_drift_subject_001",
        principalId: payload!.sub!,
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
      [
        {
          roleBindingId: "role_binding_principal_drift_subject_001",
          sourceRef: "role_binding_principal_drift_subject_001",
          membershipId: payload!.membershipId!,
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: "2026-08-02T00:00:00.000Z",
          validTo: null,
          createdAt: "2026-08-02T00:00:00.000Z",
          updatedAt: "2026-08-02T00:03:00.000Z",
        },
      ],
    );

    const guardAfterDrift = createGuard(
      new JwtSessionClaimsService(tenantPartnerService, identityRepo),
    );
    const secondPass = createBearerContext(
      tokenResponse.token,
      "/api/platform-admin/dispatch-recovery",
    );
    await expect(guardAfterDrift.canActivate(secondPass.context)).rejects.toMatchObject(
      {
        code: "JWT_SESSION_INVALIDATED",
      },
    );

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.IAP_EXPECTED_AUDIENCE;
    delete process.env.IAP_JWT_SECRET;
  });

  it("invalidates control-plane bearer tokens after durable token revocation", async () => {
    process.env.DRTS_INTERNAL_KEY = INTERNAL_KEY;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.IAP_EXPECTED_AUDIENCE = IAP_AUDIENCE;
    process.env.IAP_JWT_SECRET = IAP_SECRET;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);
    const tenantPartnerService = new TenantPartnerService(
      createAuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
      identityRepo,
    );
    const jwtSessionClaimsService = new JwtSessionClaimsService(
      tenantPartnerService,
      identityRepo,
    );
    const controller = new AuthController(
      new JwtAuthService(),
      tenantPartnerService,
      {} as never,
      jwtSessionClaimsService,
      securityEventsService,
      adapter,
      identityRepo,
    );

    const tokenResponse = await controller.issueToken({
      headers: {
        "x-drts-internal-key": INTERNAL_KEY,
        "x-goog-iap-jwt-assertion": signAssertion({
          sub: "revoked_subject_001",
          email: "revoked-admin@platform.drts",
          gcp_ia_groups: ["platform-admins@platform.drts"],
        }),
      },
    });

    const payload = new JwtAuthService().verify(tokenResponse.token);
    expect(payload?.jti).toBeTruthy();
    expect(payload?.membershipId).toBeTruthy();

    await identityRepo.revokeAuthSessionByTokenId(
      payload!.jti,
      "manual_logout",
    );

    const guard = createGuard(jwtSessionClaimsService);
    const ctx = createBearerContext(
      tokenResponse.token,
      "/api/platform-admin/dispatch-recovery",
    );
    await expect(guard.canActivate(ctx.context)).rejects.toMatchObject({
      code: "JWT_SESSION_INVALIDATED",
    });

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.IAP_EXPECTED_AUDIENCE;
    delete process.env.IAP_JWT_SECRET;
  });

  it("binds non-IAP control-plane fallback tokens to durable membership state", async () => {
    process.env.DRTS_INTERNAL_KEY = INTERNAL_KEY;
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.NODE_ENV = "test";

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const tenantPartnerService = new TenantPartnerService(
      createAuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
      identityRepo,
    );
    const jwtSessionClaimsService = new JwtSessionClaimsService(
      tenantPartnerService,
      identityRepo,
    );

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_fallback_platform_001",
        sourceRef: "iap_subject:fallback_platform_001",
        issuer: "google_iap",
        subject: "fallback_platform_001",
        principalType: "human",
        email: "fallback-admin@platform.drts",
        emailVerified: true,
        displayName: "Fallback Admin",
        status: "active",
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
      {
        membershipId: "membership_fallback_platform_001",
        sourceRef: "iap_membership:fallback_platform_001",
        principalId: "principal_fallback_platform_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
      [
        {
          roleBindingId: "role_binding_fallback_platform_001",
          sourceRef: "role_binding_fallback_platform_001",
          membershipId: "membership_fallback_platform_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: "2026-08-02T00:00:00.000Z",
          validTo: null,
          createdAt: "2026-08-02T00:00:00.000Z",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    );

    const controller = new AuthController(
      new JwtAuthService(),
      tenantPartnerService,
      {} as never,
      jwtSessionClaimsService,
      securityEventsService,
      undefined,
      identityRepo,
    );

    const tokenResponse = await controller.issueToken({
      headers: {
        "x-drts-internal-key": INTERNAL_KEY,
        "x-actor-type": "platform_admin",
        "x-actor-id": "principal_fallback_platform_001",
        "x-realm": "platform",
        "x-roles": "ops_user",
        "x-scopes": "dispatch:read",
      },
    });

    const payload = new JwtAuthService().verify(tokenResponse.token);
    expect(payload?.membershipId).toBe("membership_fallback_platform_001");
    expect(payload?.roles).toEqual(["superadmin"]);
    expect(payload?.scopes).toContain("foundation:write");

    const guard = createGuard(jwtSessionClaimsService);
    const ctx = createBearerContext(
      tokenResponse.token,
      "/api/platform-admin/dispatch-recovery",
    );
    await expect(guard.canActivate(ctx.context)).resolves.toBe(true);

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.NODE_ENV;
  });

  it("preserves realm isolation for bearer tokens after JWT issuance", async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";
    process.env.NODE_ENV = "test";

    const securityEventsService = new SecurityEventsService();
    const tenantPartnerService = new TenantPartnerService(
      createAuditNotificationService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      securityEventsService,
    );
    const jwtSessionClaimsService = new JwtSessionClaimsService(
      tenantPartnerService,
    );
    const controller = new AuthController(
      new JwtAuthService(),
      tenantPartnerService,
      {} as never,
      jwtSessionClaimsService,
      securityEventsService,
    );

    const session = controller.issueTenantBootstrapSession({
      email: "viewer@acme.example",
      tenantId: "tenant-demo-001",
    });
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === AUTH_ALLOWED_REALMS_KEY) return ["ops"];
        if (key === AUTH_REQUIRED_SCOPES_KEY) return ["dispatch:read"];
        return undefined;
      },
    } as any;
    const guard = new BootstrapAuthGuard(
      reflector,
      new JwtAuthService(),
      jwtSessionClaimsService,
    );
    const ctx = createBearerContext(session.data.accessToken, "/api/ops/orders");

    await expect(guard.canActivate(ctx.context)).rejects.toMatchObject({
      code: "AUTH_REALM_DENIED",
    });

    delete process.env.JWT_SECRET;
    delete process.env.DRTS_TENANT_BOOTSTRAP_MODE;
    delete process.env.NODE_ENV;
  });
});
