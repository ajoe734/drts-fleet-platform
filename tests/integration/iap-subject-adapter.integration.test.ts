import { describe, expect, it } from "vitest";

import { signTestIapJwtAssertion } from "@drts/control-plane-auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const INTEGRATION_TEST_SECRET = "iap_integration_test_secret_key_32chars!";
const INTEGRATION_AUDIENCE =
  "/projects/1122334455/apps/drts-control-plane-prod";

function signAssertion(payload: Record<string, unknown>): string {
  return signTestIapJwtAssertion(
    {
      iss: "https://cloud.google.com/iap",
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: INTEGRATION_AUDIENCE,
      ...payload,
    },
    INTEGRATION_TEST_SECRET,
  );
}

describe("IAP Subject Adapter Integration Negative Matrix & Resolution", () => {
  it("resolves IAP workforce subject and persists durable identity in repository", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const token = signAssertion({
      sub: "google_subject_integ_001",
      email: "ops-lead@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const resolution = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: INTEGRATION_AUDIENCE,
        jwtSecretOrPublicKey: INTEGRATION_TEST_SECRET,
        autoProvision: true,
      },
    );

    expect(resolution.principal.issuer).toBe("google_iap");
    expect(resolution.principal.email).toBe("ops-lead@platform.drts");
    expect(resolution.membership.realm).toBe("ops");
    expect(resolution.effectiveRoles).toContain("operator");

    const savedPrincipal = await identityRepo.findPrincipalBySubject(
      "google_iap",
      "google_subject_integ_001",
    );
    expect(savedPrincipal).not.toBeNull();
    expect(savedPrincipal?.email).toBe("ops-lead@platform.drts");
  });

  it("verifies negative matrix: missing assertion with spoofed role headers fails", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    let error: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        {
          "x-goog-authenticated-user-email": "hacker@evil.com",
          "x-roles": "superadmin,platform_admin",
        },
        {
          expectedAudience: INTEGRATION_AUDIENCE,
          jwtSecretOrPublicKey: INTEGRATION_TEST_SECRET,
          strictIapMode: true,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        error = err;
      }
    }

    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(401);
    expect(error?.code).toBe("IAP_ASSERTION_MISSING");

    const deniedEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.denied",
    });
    expect(
      deniedEvents.some(
        (e) => e.reasonCode === "spoofed_header_without_assertion",
      ),
    ).toBe(true);
  });

  it("verifies negative matrix: wrong audience fails closed with 403 IAP_AUDIENCE_MISMATCH", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const wrongAudToken = signAssertion({
      sub: "google_subject_integ_002",
      email: "user@platform.drts",
      aud: "wrong-audience-uri",
    });

    let error: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": wrongAudToken },
        {
          expectedAudience: INTEGRATION_AUDIENCE,
          jwtSecretOrPublicKey: INTEGRATION_TEST_SECRET,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        error = err;
      }
    }

    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(403);
    expect(error?.code).toBe("IAP_AUDIENCE_MISMATCH");
  });

  it("verifies negative matrix: inactive workforce user fails closed with 403 IAP_WORKFORCE_USER_INACTIVE", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_inactive_integ",
        sourceRef: "iap_subject:inactive_subject_001",
        issuer: "google_iap",
        subject: "inactive_subject_001",
        principalType: "human",
        email: "inactive@platform.drts",
        emailVerified: true,
        displayName: "Inactive Ops User",
        status: "locked",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_inactive_integ",
        sourceRef: "iap_membership:inactive_subject_001",
        principalId: "principal_inactive_integ",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "locked",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [],
    );

    const token = signAssertion({
      sub: "inactive_subject_001",
      email: "inactive@platform.drts",
    });

    let error: ApiRequestError | null = null;
    try {
      await adapter.resolveSubject(
        { "x-goog-iap-jwt-assertion": token },
        {
          expectedAudience: INTEGRATION_AUDIENCE,
          jwtSecretOrPublicKey: INTEGRATION_TEST_SECRET,
        },
      );
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        error = err;
      }
    }

    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(403);
    expect(error?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");
  });

  it("verifies group drift: missing admin group downgrades role and logs security alert", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_group_drift_integ",
        sourceRef: "iap_subject:group_drift_subject_001",
        issuer: "google_iap",
        subject: "group_drift_subject_001",
        principalType: "human",
        email: "demoted-admin@platform.drts",
        emailVerified: true,
        displayName: "Demoted Admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_group_drift_platform_integ",
        sourceRef: "iap_membership:group_drift_subject_001_platform",
        principalId: "principal_group_drift_integ",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_superadmin_integ",
          sourceRef: "rb_superadmin_integ",
          membershipId: "membership_group_drift_platform_integ",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_group_drift_integ",
        sourceRef: "iap_subject:group_drift_subject_001",
        issuer: "google_iap",
        subject: "group_drift_subject_001",
        principalType: "human",
        email: "demoted-admin@platform.drts",
        emailVerified: true,
        displayName: "Demoted Admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_group_drift_ops_integ",
        sourceRef: "iap_membership:group_drift_subject_001_ops",
        principalId: "principal_group_drift_integ",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_ops_user_integ",
          sourceRef: "rb_ops_user_integ",
          membershipId: "membership_group_drift_ops_integ",
          roleCode: "ops_user",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    const token = signAssertion({
      sub: "group_drift_subject_001",
      email: "demoted-admin@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const resolution = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: INTEGRATION_AUDIENCE,
        jwtSecretOrPublicKey: INTEGRATION_TEST_SECRET,
      },
    );

    expect(resolution.driftDetected).toBe(true);
    expect(resolution.effectiveRoles).not.toContain("superadmin");
    expect(resolution.effectiveRoles).toEqual(["ops_user"]);
    expect(resolution.membership.realm).toBe("ops");
    expect(resolution.membership.membershipId).toBe(
      "membership_group_drift_ops_integ",
    );

    const driftEvents = await securityEventsService.listEvents(null, {
      eventType: "iap_group_drift.detected",
    });
    expect(driftEvents.length).toBeGreaterThan(0);
    expect(driftEvents[0]?.actorId).toBe("principal_group_drift_integ");
  });

  it("verifies AuthController /auth/token uses IAPSubjectAdapter runtime resolution and ignores spoofed headers", async () => {
    process.env.DRTS_INTERNAL_KEY = "test_internal_key_123";
    process.env.JWT_SECRET = INTEGRATION_TEST_SECRET;
    process.env.IAP_EXPECTED_AUDIENCE = INTEGRATION_AUDIENCE;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const jwtAuthService = new JwtAuthService();
    const tenantPartnerService = new TenantPartnerService(
      securityEventsService as any,
    );
    const driverDeviceSessionService = new DriverDeviceSessionService(
      jwtAuthService,
      null as any,
      null as any,
    );
    const authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      driverDeviceSessionService,
      securityEventsService,
      adapter,
    );

    const token = signAssertion({
      sub: "runtime_iap_sub_001",
      email: "runtime-admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    const request = {
      headers: {
        "x-drts-internal-key": "test_internal_key_123",
        "x-goog-iap-jwt-assertion": token,
        "x-roles": "spoofed_role",
        "x-scopes": "spoofed:scope",
      },
    };

    await expect(authController.issueToken(request)).rejects.toMatchObject({
      code: "IAP_ASSERTION_INVALID",
    });

    process.env.IAP_JWT_SECRET = INTEGRATION_TEST_SECRET;
    const result = await authController.issueToken(request);

    expect(result.token).toBeTruthy();
    const payload = jwtAuthService.verify(result.token);
    expect(payload?.actorType).toBe("platform_admin");
    expect(payload?.roles).toContain("superadmin");
    expect(payload?.roles).not.toContain("spoofed_role");

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.IAP_JWT_SECRET;
    delete process.env.IAP_EXPECTED_AUDIENCE;
  });

  it("verifies AuthController /auth/token fails closed in strict IAP mode without assertion", async () => {
    process.env.DRTS_INTERNAL_KEY = "test_internal_key_123";
    process.env.STRICT_IAP_MODE = "true";

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const jwtAuthService = new JwtAuthService();
    const tenantPartnerService = new TenantPartnerService(
      securityEventsService as any,
    );
    const driverDeviceSessionService = new DriverDeviceSessionService(
      jwtAuthService,
      null as any,
      null as any,
    );
    const authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      driverDeviceSessionService,
      securityEventsService,
      adapter,
    );

    let error: ApiRequestError | null = null;
    try {
      await authController.issueToken({
        headers: {
          "x-drts-internal-key": "test_internal_key_123",
          "x-actor-type": "platform_admin",
          "x-actor-id": "spoofed-id",
        },
      });
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        error = err;
      }
    }

    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(401);
    expect(error?.code).toBe("IAP_ASSERTION_MISSING");

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.STRICT_IAP_MODE;
  });

  it("verifies BootstrapAuthGuard enforces durable membership and group drift when receiving x-goog-iap-jwt-assertion", async () => {
    process.env.IAP_EXPECTED_AUDIENCE = INTEGRATION_AUDIENCE;
    process.env.IAP_JWT_SECRET = INTEGRATION_TEST_SECRET;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const reflector = {
      getAllAndOverride: () => undefined,
    } as any;
    const guard = new BootstrapAuthGuard(
      reflector,
      new JwtAuthService(),
      undefined,
      undefined,
      adapter,
    );

    const token = signAssertion({
      sub: "guard_iap_sub_001",
      email: "admin-guard@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    const mockRequest: any = {
      headers: {
        "x-goog-iap-jwt-assertion": token,
      },
      method: "GET",
      url: "/api/platform-admin/health",
    };

    const context: any = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => () => {},
      getClass: () => class {},
    };

    const allowed = await guard.canActivate(context);
    expect(allowed).toBe(true);
    expect(mockRequest.identity).toBeDefined();
    expect(mockRequest.identity.actorType).toBe("platform_admin");
    expect(mockRequest.identity.roles).toContain("superadmin");

    delete process.env.IAP_EXPECTED_AUDIENCE;
    delete process.env.IAP_JWT_SECRET;
  });

  it("verifies AuthController /auth/token allows system realm calls in strict IAP mode without IAP assertion", async () => {
    process.env.DRTS_INTERNAL_KEY = "test_internal_key_123";
    process.env.JWT_SECRET = INTEGRATION_TEST_SECRET;
    process.env.STRICT_IAP_MODE = "true";

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const jwtAuthService = new JwtAuthService();
    const tenantPartnerService = new TenantPartnerService(
      securityEventsService as any,
    );
    const driverDeviceSessionService = new DriverDeviceSessionService(
      jwtAuthService,
      null as any,
      null as any,
    );
    const authController = new AuthController(
      jwtAuthService,
      tenantPartnerService,
      driverDeviceSessionService,
      securityEventsService,
      adapter,
    );

    const result = await authController.issueToken({
      headers: {
        "x-drts-internal-key": "test_internal_key_123",
        "x-actor-type": "system",
        "x-actor-id": "system-service-01",
        "x-realm": "system",
      },
    });

    expect(result.token).toBeTruthy();
    const payload = jwtAuthService.verify(result.token);
    expect(payload?.actorType).toBe("system");
    expect(payload?.realm).toBe("system");
    expect(payload?.sub).toBe("system-service-01");

    delete process.env.DRTS_INTERNAL_KEY;
    delete process.env.JWT_SECRET;
    delete process.env.STRICT_IAP_MODE;
  });

  it("verifies BootstrapAuthGuard denies platform-only route access when group drift downgrades identity to ops realm", async () => {
    process.env.IAP_EXPECTED_AUDIENCE = INTEGRATION_AUDIENCE;
    process.env.IAP_JWT_SECRET = INTEGRATION_TEST_SECRET;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_drift_guard_001",
        sourceRef: "iap_subject:drift_guard_sub",
        issuer: "google_iap",
        subject: "drift_guard_sub",
        principalType: "human",
        email: "drift-guard@platform.drts",
        emailVerified: true,
        displayName: "Drift Guard User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_drift_guard_001",
        sourceRef: "iap_membership:drift_guard_sub",
        principalId: "principal_drift_guard_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_drift_guard_001",
          sourceRef: "rb_drift_guard_001",
          membershipId: "membership_drift_guard_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_drift_guard_001",
        sourceRef: "iap_subject:drift_guard_sub",
        issuer: "google_iap",
        subject: "drift_guard_sub",
        principalType: "human",
        email: "drift-guard@platform.drts",
        emailVerified: true,
        displayName: "Drift Guard User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_drift_guard_ops_001",
        sourceRef: "iap_membership:drift_guard_sub_ops",
        principalId: "principal_drift_guard_001",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_drift_guard_ops_001",
          sourceRef: "rb_drift_guard_ops_001",
          membershipId: "membership_drift_guard_ops_001",
          roleCode: "ops_user",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === "auth:allowed_realms") return ["platform"];
        if (key === "auth:required_scopes") return ["billing:write"];
        return undefined;
      },
    } as any;

    const guard = new BootstrapAuthGuard(
      reflector,
      new JwtAuthService(),
      undefined,
      undefined,
      adapter,
    );

    const token = signAssertion({
      sub: "drift_guard_sub",
      email: "drift-guard@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const mockRequest: any = {
      headers: {
        "x-goog-iap-jwt-assertion": token,
      },
      method: "POST",
      url: "/api/platform-admin/billing-settlement/recovery",
    };

    const context: any = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => () => {},
      getClass: () => class {},
    };

    let error: ApiRequestError | null = null;
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      if (err instanceof ApiRequestError) {
        error = err;
      }
    }

    expect(error).not.toBeNull();
    expect(error?.getStatus()).toBe(403);
    expect(error?.code).toBe("AUTH_REALM_DENIED");
    expect(mockRequest.identity.realm).toBe("ops");
    expect(mockRequest.identity.actorType).toBe("ops_user");

    delete process.env.IAP_EXPECTED_AUDIENCE;
    delete process.env.IAP_JWT_SECRET;
  });

  it("verifies integration: role bindings validFrom/validTo lifecycle filtering and ops security events classification", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const nowMs = Date.now();
    const pastTime = new Date(nowMs - 3600 * 1000).toISOString();
    const futureTime = new Date(nowMs + 3600 * 1000).toISOString();

    // User with 1 active ops binding and 1 expired platform binding
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_mixed_bindings_001",
        sourceRef: "iap_subject:mixed_sub_001",
        issuer: "google_iap",
        subject: "mixed_sub_001",
        principalType: "human",
        email: "mixed@platform.drts",
        emailVerified: true,
        displayName: "Mixed Bindings User",
        status: "active",
        createdAt: pastTime,
        updatedAt: pastTime,
      },
      {
        membershipId: "membership_mixed_ops_001",
        sourceRef: "iap_membership:mixed_sub_001_ops",
        principalId: "principal_mixed_bindings_001",
        realm: "ops",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: pastTime,
        updatedAt: pastTime,
      },
      [
        {
          roleBindingId: "rb_mixed_ops_active",
          sourceRef: "rb_mixed_ops_active",
          membershipId: "membership_mixed_ops_001",
          roleCode: "operator",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: pastTime,
          validTo: futureTime, // Active!
          createdAt: pastTime,
          updatedAt: pastTime,
        },
      ],
    );

    // Also add expired platform admin binding on platform membership
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_mixed_bindings_001",
        sourceRef: "iap_subject:mixed_sub_001",
        issuer: "google_iap",
        subject: "mixed_sub_001",
        principalType: "human",
        email: "mixed@platform.drts",
        emailVerified: true,
        displayName: "Mixed Bindings User",
        status: "active",
        createdAt: pastTime,
        updatedAt: pastTime,
      },
      {
        membershipId: "membership_mixed_platform_001",
        sourceRef: "iap_membership:mixed_sub_001_platform",
        principalId: "principal_mixed_bindings_001",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: pastTime,
        updatedAt: pastTime,
      },
      [
        {
          roleBindingId: "rb_mixed_platform_expired",
          sourceRef: "rb_mixed_platform_expired",
          membershipId: "membership_mixed_platform_001",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: new Date(nowMs - 7200 * 1000).toISOString(),
          validTo: pastTime, // Expired!
          createdAt: pastTime,
          updatedAt: pastTime,
        },
      ],
    );

    const token = signAssertion({
      sub: "mixed_sub_001",
      email: "mixed@platform.drts",
      gcp_ia_groups: ["ops-users@platform.drts"],
    });

    const resolution = await adapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": token },
      {
        expectedAudience: INTEGRATION_AUDIENCE,
        jwtSecretOrPublicKey: INTEGRATION_TEST_SECRET,
      },
    );

    // Expired superadmin role should be ignored; only active operator role remains
    expect(resolution.effectiveRoles).toEqual(["operator"]);
    expect(resolution.membership.realm).toBe("ops");

    const events = await securityEventsService.listEvents(null, {
      eventType: "iap_subject.resolved",
    });
    const opsEvent = events.find(
      (e) => e.actorId === "principal_mixed_bindings_001",
    );
    expect(opsEvent).toBeDefined();
    expect(opsEvent?.actorType).toBe("ops_user");
    expect(opsEvent?.realm).toBe("ops");
  });

  it("verifies BootstrapAuthGuard fails closed with 403 when ops surface is requested but user has no durable ops membership", async () => {
    process.env.IAP_EXPECTED_AUDIENCE = INTEGRATION_AUDIENCE;
    process.env.IAP_JWT_SECRET = INTEGRATION_TEST_SECRET;

    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const adapter = new IAPSubjectAdapter(identityRepo, securityEventsService);

    const now = new Date().toISOString();
    await identityRepo.upsertWorkforceIdentity(
      {
        principalId: "principal_ops_surface_downgrade",
        sourceRef: "iap_subject:ops_surface_sub",
        issuer: "google_iap",
        subject: "ops_surface_sub",
        principalType: "human",
        email: "platform-admin-on-ops@platform.drts",
        emailVerified: true,
        displayName: "Platform Admin Ops User",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        membershipId: "membership_ops_surface_platform",
        sourceRef: "iap_membership:ops_surface_sub_platform",
        principalId: "principal_ops_surface_downgrade",
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: now,
        updatedAt: now,
      },
      [
        {
          roleBindingId: "rb_ops_surface_superadmin",
          sourceRef: "rb_ops_surface_superadmin",
          membershipId: "membership_ops_surface_platform",
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: now,
          validTo: null,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );

    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === "auth:allowed_realms") return ["ops"];
        if (key === "auth:required_scopes") return ["dispatch:read"];
        return undefined;
      },
    } as any;

    const guard = new BootstrapAuthGuard(
      reflector,
      new JwtAuthService(),
      undefined,
      undefined,
      adapter,
    );

    const token = signAssertion({
      sub: "ops_surface_sub",
      email: "platform-admin-on-ops@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
    });

    // Ops console proxy mints assertions with x-realm: ops / x-actor-type: ops_user header
    const mockRequest: any = {
      headers: {
        "x-goog-iap-jwt-assertion": token,
        "x-realm": "ops",
        "x-actor-type": "ops_user",
      },
      method: "GET",
      url: "/api/ops/dispatch-queue",
    };

    const context: any = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: () => () => {},
      getClass: () => class {},
    };

    let caughtError: any = null;
    try {
      await guard.canActivate(context);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiRequestError);
    expect(caughtError?.getStatus()).toBe(403);
    expect(caughtError?.code).toBe("IAP_WORKFORCE_USER_INACTIVE");

    delete process.env.IAP_EXPECTED_AUDIENCE;
    delete process.env.IAP_JWT_SECRET;
  });
});
