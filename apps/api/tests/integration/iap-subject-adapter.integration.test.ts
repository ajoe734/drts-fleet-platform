import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import jwt from "jsonwebtoken";

import { SnakeCaseExceptionFilter } from "../../src/common/snake-case.exception-filter";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { DriverDeviceSessionService } from "../../src/modules/auth/driver-device-session.service";
import { WorkforceIdentityService } from "../../src/modules/auth/workforce-identity.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../src/modules/security-events/security-events.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

@Module({
  controllers: [AuthController],
  providers: [
    JwtAuthService,
    IdentityRepository,
    SecurityEventsService,
    WorkforceIdentityService,
    {
      provide: TenantPartnerService,
      useValue: {},
    },
    {
      provide: DriverDeviceSessionService,
      useValue: {},
    },
  ],
})
class IapSubjectAdapterIntegrationTestModule {}

function signWorkforceAssertion(input: {
  sub?: string;
  email?: string;
  active?: boolean;
  groups?: string[];
  audience?: string;
}) {
  return jwt.sign(
    {
      sub: input.sub ?? "workforce-subject-001",
      email: input.email ?? "admin@platform.drts",
      email_verified: true,
      active: input.active ?? true,
      groups: input.groups ?? ["drts-platform-superadmin"],
    },
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET!,
    {
      algorithm: "HS256",
      issuer: "https://cloud.google.com/iap",
      audience: input.audience ?? "drts-control-plane",
    },
  );
}

describe("IAP subject adapter integration", () => {
  const originalEnv = { ...process.env };
  let baseUrl: string;
  let closeApplication: (() => Promise<void>) | undefined;
  let jwtAuthService: JwtAuthService;
  let securityEventsService: SecurityEventsService;
  let identityRepository: IdentityRepository;

  beforeAll(async () => {
    const app = await NestFactory.create(
      IapSubjectAdapterIntegrationTestModule,
      {
        logger: false,
      },
    );
    app.useGlobalFilters(new SnakeCaseExceptionFilter());
    await app.listen(0, "127.0.0.1");

    const address = app.getHttpServer().address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected an ephemeral HTTP server address.");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
    jwtAuthService = app.get(JwtAuthService);
    securityEventsService = app.get(SecurityEventsService);
    identityRepository = app.get(IdentityRepository);
    closeApplication = async () => {
      await app.close();
    };
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    const repositoryState = identityRepository as unknown as {
      fallbackPrincipals: Map<string, Record<string, unknown>>;
      fallbackMemberships: Map<string, Record<string, unknown>>;
      fallbackRoleBindings: Map<string, Record<string, unknown>>;
    };
    repositoryState.fallbackPrincipals.clear();
    repositoryState.fallbackMemberships.clear();
    repositoryState.fallbackRoleBindings.clear();
  });

  afterAll(async () => {
    await closeApplication?.();
  });

  it("resolves verified workforce membership and ignores spoofed role headers", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "platform_admin",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          groups: ["drts-platform-superadmin"],
        }),
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
        "x-roles": "viewer",
      },
    });

    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      token: string;
      expiresIn: string;
    };
    expect(payload.expiresIn).toBe("8h");

    const verified = jwtAuthService.verify(payload.token);
    expect(verified).toMatchObject({
      actorType: "platform_admin",
      sub: "pa-admin-001",
      roles: ["superadmin"],
    });
    expect(verified?.roles).not.toContain("viewer");
  });

  it("rejects forged assertions when only JWT_SECRET is configured", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";
    delete process.env.DRTS_WORKFORCE_ASSERTION_SECRET;
    delete process.env.DRTS_WORKFORCE_ASSERTION_PUBLIC_KEY;

    const forgedAssertion = jwt.sign(
      {
        sub: "workforce-forged-001",
        email: "admin@platform.drts",
        email_verified: true,
        active: true,
        groups: ["drts-platform-superadmin"],
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        issuer: "https://cloud.google.com/iap",
        audience: "drts-control-plane",
      },
    );

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "platform_admin",
        "x-goog-iap-jwt-assertion": forgedAssertion,
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "AUTH_SESSION_EXCHANGE_DENIED",
        details: {
          reason_code: "iap_assertion_verifier_unconfigured",
        },
      },
    });
  });

  it("rejects workforce assertions with the wrong audience", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "platform_admin",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          audience: "wrong-audience",
        }),
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          reason_code: "wrong_workforce_audience",
        },
      },
    });
  });

  it("rejects inactive workforce users", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "ops_user",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          active: false,
          email: "ops@platform.drts",
          groups: ["drts-ops-user"],
        }),
        "x-goog-authenticated-user-email":
          "accounts.google.com:ops@platform.drts",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          reason_code: "inactive_workforce_user",
        },
      },
    });
  });

  it("rejects verified workforce assertions that omit the subject", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const assertion = jwt.sign(
      {
        email: "admin@platform.drts",
        email_verified: true,
        active: true,
        groups: ["drts-platform-superadmin"],
      },
      process.env.DRTS_WORKFORCE_ASSERTION_SECRET,
      {
        algorithm: "HS256",
        issuer: "https://cloud.google.com/iap",
        audience: "drts-control-plane",
      },
    );

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "platform_admin",
        "x-goog-iap-jwt-assertion": assertion,
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          reason_code: "workforce_subject_missing",
        },
      },
    });
    expect(identityRepository.listPrincipals()).toEqual([]);
    expect(identityRepository.listMemberships()).toEqual([]);
    expect(identityRepository.listRoleBindings()).toEqual([]);
  });

  it("applies least privilege on group drift and records an alert event", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.JWT_ISSUER = "drts-tests";
    process.env.JWT_AUDIENCE = "drts-api";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const baseHeaders = {
      "x-drts-internal-key": "internal-secret",
      "x-drts-control-plane-actor-type": "platform_admin",
      "x-goog-authenticated-user-email":
        "accounts.google.com:admin@platform.drts",
    };

    const initialResponse = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          sub: "workforce-drift-001",
          groups: ["drts-platform-superadmin"],
        }),
      },
    });
    expect(initialResponse.status).toBe(201);

    const downgradedResponse = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          sub: "workforce-drift-001",
          groups: ["drts-platform-viewer"],
        }),
      },
    });
    expect(downgradedResponse.status).toBe(201);

    const downgradedPayload = (await downgradedResponse.json()) as {
      token: string;
    };
    const verified = jwtAuthService.verify(downgradedPayload.token);
    expect(verified?.roles).toEqual(["viewer"]);
    expect(verified?.scopes).toContain("foundation:read");
    expect(verified?.scopes).not.toContain("foundation:write");

    const events = await securityEventsService.listEvents(null, {
      eventType: "workforce_membership.drift_detected",
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "workforce_membership.drift_detected",
          reasonCode: "least_privilege_applied",
          outcome: "success",
        }),
      ]),
    );
  });

  it("rejects ops exchange when group drift removes the ops grant but leaves platform access", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const subject = "workforce-cross-realm-001";
    const sharedHeaders = {
      "x-drts-internal-key": "internal-secret",
      "x-goog-authenticated-user-email": "accounts.google.com:ops@platform.drts",
    };

    const initialResponse = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        ...sharedHeaders,
        "x-drts-control-plane-actor-type": "platform_admin",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          sub: subject,
          email: "ops@platform.drts",
          groups: ["drts-platform-superadmin", "drts-ops-user"],
        }),
      },
    });
    expect(initialResponse.status).toBe(201);

    const downgradedResponse = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        ...sharedHeaders,
        "x-drts-control-plane-actor-type": "ops_user",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          sub: subject,
          email: "ops@platform.drts",
          groups: ["drts-platform-superadmin"],
        }),
        "x-roles": "operator",
      },
    });

    expect(downgradedResponse.status).toBe(403);
    await expect(downgradedResponse.json()).resolves.toMatchObject({
      error: {
        details: {
          reason_code: "realm_membership_missing",
        },
      },
    });
  });

  it("rejects unknown platform role bindings from the workforce group catalog", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";
    process.env.DRTS_WORKFORCE_GROUP_ROLE_BINDINGS = JSON.stringify({
      "drts-platform-auditor": {
        realm: "platform",
        actorType: "platform_admin",
        roleCode: "auditor",
      },
    });

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "platform_admin",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          sub: "workforce-unknown-role-001",
          groups: ["drts-platform-auditor"],
        }),
        "x-goog-authenticated-user-email":
          "accounts.google.com:admin@platform.drts",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          reason_code: "unmapped_workforce_subject",
        },
      },
    });
    expect(identityRepository.listPrincipals()).toEqual([]);
    expect(identityRepository.listMemberships()).toEqual([]);
    expect(identityRepository.listRoleBindings()).toEqual([]);
  });

  it("rejects ops exchange when a durable ops membership exists without any active role binding", async () => {
    process.env.JWT_SECRET = "inner-jwt-secret";
    process.env.DRTS_INTERNAL_KEY = "internal-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_SECRET = "workforce-secret";
    process.env.DRTS_WORKFORCE_ASSERTION_AUDIENCE = "drts-control-plane";

    const repositoryState = identityRepository as unknown as {
      fallbackPrincipals: Map<string, Record<string, unknown>>;
      fallbackMemberships: Map<string, Record<string, unknown>>;
      fallbackRoleBindings: Map<string, Record<string, unknown>>;
    };
    const principalId = "principal_cross_realm_orphan_001";
    const sourcePrefix = "workforce_subject:40ef3c46be0461bb380b7d82";

    repositoryState.fallbackPrincipals.set(`${sourcePrefix}:principal`, {
      principalId,
      sourceRef: `${sourcePrefix}:principal`,
      issuer: "https://cloud.google.com/iap",
      subject: "workforce-cross-realm-003",
      principalType: "human",
      email: "ops@platform.drts",
      emailVerified: true,
      displayName: "Ops User",
      status: "active",
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    repositoryState.fallbackMemberships.set(`${sourcePrefix}:membership:platform`, {
      membershipId: "membership_platform_cross_realm_003",
      sourceRef: `${sourcePrefix}:membership:platform`,
      principalId,
      realm: "platform",
      scopeRef: "platform:global",
      tenantId: null,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    repositoryState.fallbackMemberships.set(`${sourcePrefix}:membership:ops`, {
      membershipId: "membership_ops_cross_realm_003",
      sourceRef: `${sourcePrefix}:membership:ops`,
      principalId,
      realm: "ops",
      scopeRef: "ops:global",
      tenantId: null,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    });
    repositoryState.fallbackRoleBindings.set(
      `${sourcePrefix}:role_binding:platform`,
      {
        roleBindingId: "role_binding_platform_cross_realm_003",
        sourceRef: `${sourcePrefix}:role_binding:platform`,
        membershipId: "membership_platform_cross_realm_003",
        roleCode: "superadmin",
        grantedByPrincipalId: null,
        approvalId: null,
        validFrom: "2026-08-02T00:00:00.000Z",
        validTo: null,
        createdAt: "2026-08-02T00:00:00.000Z",
        updatedAt: "2026-08-02T00:00:00.000Z",
      },
    );

    const response = await fetch(`${baseUrl}/auth/token`, {
      method: "POST",
      headers: {
        "x-drts-internal-key": "internal-secret",
        "x-drts-control-plane-actor-type": "ops_user",
        "x-goog-iap-jwt-assertion": signWorkforceAssertion({
          sub: "workforce-cross-realm-003",
          email: "ops@platform.drts",
          groups: ["drts-platform-superadmin", "drts-ops-user"],
        }),
        "x-goog-authenticated-user-email":
          "accounts.google.com:ops@platform.drts",
        "x-roles": "operator",
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        details: {
          reason_code: "inactive_membership",
        },
      },
    });
    expect(identityRepository.listMemberships()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: "membership_ops_cross_realm_003",
          realm: "ops",
          status: "suspended",
        }),
      ]),
    );
    expect(identityRepository.listRoleBindings()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: "membership_ops_cross_realm_003",
        }),
      ]),
    );
  });
});
