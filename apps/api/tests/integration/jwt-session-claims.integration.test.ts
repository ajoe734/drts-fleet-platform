import { generateKeyPairSync, randomUUID } from "node:crypto";

import * as jwt from "jsonwebtoken";
import { Reflector } from "@nestjs/core";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseService } from "../../src/common/db";
import {
  type AuthenticatedRequestLike,
  BootstrapAuthGuard,
} from "../../src/common/auth";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverDeviceSessionService } from "../../src/modules/auth/driver-device-session.service";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { RegulatoryRegistryService } from "../../src/modules/regulatory-registry/regulatory-registry.service";

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_ENV_KEYS = [
  "JWT_SECRET",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "JWT_ISSUER",
  "JWT_AUDIENCE",
  "JWT_ALGORITHM",
  "JWT_ALGORITHMS",
  "JWT_POLICY_VERSION",
] as const;
const ORIGINAL_JWT_ENV = Object.fromEntries(
  JWT_ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof JWT_ENV_KEYS)[number], string | undefined>;

async function deleteSessionTestData(
  database: DatabaseService,
  sessionIds: string[],
  principalIds: string[],
) {
  if (sessionIds.length > 0) {
    await database.query(
      `DELETE FROM iam.identity_refresh_families WHERE session_id = ANY($1::text[])`,
      [sessionIds],
    );
    await database.query(
      `DELETE FROM iam.identity_sessions WHERE session_id = ANY($1::text[])`,
      [sessionIds],
    );
  }
  if (principalIds.length > 0) {
    await database.query(
      `
        DELETE FROM iam.identity_role_bindings
        WHERE membership_id IN (
          SELECT membership_id
          FROM iam.identity_memberships
          WHERE principal_id = ANY($1::text[])
        )
      `,
      [principalIds],
    );
    await database.query(
      `DELETE FROM iam.identity_memberships WHERE principal_id = ANY($1::text[])`,
      [principalIds],
    );
    await database.query(
      `DELETE FROM iam.identity_principals WHERE principal_id = ANY($1::text[])`,
      [principalIds],
    );
  }
}

function restoreJwtEnv() {
  for (const key of JWT_ENV_KEYS) {
    const original = ORIGINAL_JWT_ENV[key];
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

function configureHs256Env() {
  process.env.JWT_SECRET = "integration_jwt_secret_key_32chars_minimum!";
  delete process.env.JWT_PRIVATE_KEY;
  delete process.env.JWT_PUBLIC_KEY;
  process.env.JWT_ISSUER = "https://auth.drts.internal";
  process.env.JWT_AUDIENCE = "https://api.drts.internal";
  process.env.JWT_ALGORITHMS = "HS256";
  delete process.env.JWT_ALGORITHM;
  process.env.JWT_POLICY_VERSION = "auth.jwt-session.integration.v1";
}

function toBase64Url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createUnsignedJwt(payload: Record<string, unknown>) {
  const header = { alg: "none", typ: "JWT" };
  return `${toBase64Url(header)}.${toBase64Url(payload)}.`;
}

function normalizeAudience(aud: string | string[] | undefined) {
  if (!aud) {
    return [];
  }

  return Array.isArray(aud) ? aud : [aud];
}

function createExecutionContext(request: AuthenticatedRequestLike) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => function handler() {},
    getClass: () => class GuardTarget {},
  } as never;
}

describe("JWT Session Claims Integration", () => {
  const databases: DatabaseService[] = [];
  const createdSessionIds = new Set<string>();
  const createdPrincipalIds = new Set<string>();

  afterEach(async () => {
    restoreJwtEnv();

    if (
      DATABASE_URL &&
      (createdSessionIds.size > 0 || createdPrincipalIds.size > 0)
    ) {
      const cleanupDb = new DatabaseService();
      try {
        await deleteSessionTestData(
          cleanupDb,
          Array.from(createdSessionIds),
          Array.from(createdPrincipalIds),
        );
      } finally {
        createdSessionIds.clear();
        createdPrincipalIds.clear();
        await cleanupDb.onModuleDestroy();
      }
    }

    for (const db of databases.splice(0)) {
      await db.onModuleDestroy();
    }
  });

  it("issues required claims and verifies an active durable session", async () => {
    expect(DATABASE_URL).toBeTruthy();
    configureHs256Env();

    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);
    const service = new JwtAuthService(repo);

    const principalId = `principal_claims_${randomUUID()}`;
    const actorId = `tenant-user-${randomUUID()}`;
    createdPrincipalIds.add(principalId);

    const issued = await service.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId,
        principalId,
        realm: "tenant",
        tenantId: "tenant-integration",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read", "tenant:write"],
        requestId: null,
      },
      {
        principalId,
        subject: `tenant:${actorId}`,
        ensurePrincipal: true,
        authTime: "2026-08-02T00:00:00.000Z",
        tokenVersion: Date.now(),
      },
    );

    createdSessionIds.add(issued.sessionId);

    const payload = await service.verifyAccessToken(issued.token);
    expect(payload).not.toBeNull();
    expect(payload?.sid).toBe(issued.sessionId);
    expect(payload?.jti).toBe(issued.tokenId);
    expect(payload?.tokenVersion).toBe(issued.tokenVersion);
    expect(payload?.auth_time).toBe(
      Date.parse("2026-08-02T00:00:00.000Z") / 1000,
    );
    expect(payload?.amr).toEqual(["tenant_bootstrap_fixture"]);
    expect(payload?.acr).toBe("aal1");
    expect(payload?.policyVersion).toBe("auth.jwt-session.integration.v1");
    expect(payload?.iss).toBe("https://auth.drts.internal");
    expect(normalizeAudience(payload?.aud)).toEqual([
      "https://api.drts.internal",
    ]);

    const session = await repo.getSession(issued.sessionId);
    expect(session?.status).toBe("active");
    expect(session?.currentTokenId).toBe(issued.tokenId);
    expect(session?.tokenVersion).toBe(issued.tokenVersion);
    expect(session?.policyVersion).toBe("auth.jwt-session.integration.v1");
  });

  it("accepts a refreshed driver bearer on protected routes with durable session claims", async () => {
    expect(DATABASE_URL).toBeTruthy();
    configureHs256Env();

    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);
    const auditNotificationService = new AuditNotificationService();
    const driverProfileService = new DriverProfileService(
      auditNotificationService,
    );
    const regulatoryRegistryService = new RegulatoryRegistryService(
      new OpsDispatchEventsService(new EventEmitter2()),
      auditNotificationService,
      driverProfileService,
    );
    const jwtAuthService = new JwtAuthService(
      repo,
      undefined,
      regulatoryRegistryService,
    );
    const driverDeviceSessionService = new DriverDeviceSessionService(
      jwtAuthService,
      driverProfileService,
      regulatoryRegistryService,
      undefined,
      repo,
    );

    const registered = await driverDeviceSessionService.register({
      registrationCode: "driver-demo-001",
      deviceId: `driver-device-${randomUUID()}`,
      deviceLabel: "JWT Session Claims Integration",
    });

    createdSessionIds.add(registered.bindingId);
    createdPrincipalIds.add(registered.driverId);

    const refreshed = await driverDeviceSessionService.refresh({
      refreshToken: registered.refreshToken,
      deviceId: registered.deviceId,
    });

    const guard = new BootstrapAuthGuard(
      new Reflector(),
      jwtAuthService,
      driverDeviceSessionService,
    );
    const request: AuthenticatedRequestLike = {
      headers: {
        authorization: `Bearer ${refreshed.accessToken}`,
      },
      method: "GET",
      originalUrl: "/api/driver/profile",
    };

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);

    expect(request.identity).toMatchObject({
      actorId: refreshed.driverId,
      realm: "driver",
      sessionId: refreshed.bindingId,
    });

    const payload = await jwtAuthService.verifyAccessToken(
      refreshed.accessToken,
    );
    expect(payload).not.toBeNull();
    expect(payload?.driverBindingId).toBe(refreshed.bindingId);
    expect(payload?.driverDeviceId).toBe(refreshed.deviceId);

    const session = await repo.getSession(refreshed.bindingId);
    expect(session?.currentTokenId).toBe(payload?.jti);
    expect(session?.tokenVersion).toBe(payload?.tokenVersion);
    expect(session?.deviceSummary).toMatchObject({
      deviceId: refreshed.deviceId,
    });
  });

  it("rejects alg=none tokens and signed tokens missing required session claims", async () => {
    configureHs256Env();
    const service = new JwtAuthService();

    const unsignedToken = createUnsignedJwt({
      sub: "tenant-user",
      actorType: "tenant_admin",
      realm: "tenant",
      tenantId: "tenant-integration",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["tenant:read"],
      sid: `sid_${randomUUID()}`,
      jti: `jti_${randomUUID()}`,
      tokenVersion: Date.now(),
      auth_time: 1_754_092_800,
      amr: ["tenant_bootstrap_fixture"],
      acr: "aal1",
      policyVersion: "auth.jwt-session.integration.v1",
      iss: "https://auth.drts.internal",
      aud: "https://api.drts.internal",
    });

    expect(await service.verifyAccessToken(unsignedToken)).toBeNull();

    const missingClaimsToken = jwt.sign(
      {
        sub: "tenant-user",
        actorType: "tenant_admin",
        realm: "tenant",
        tenantId: "tenant-integration",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        tokenVersion: Date.now(),
      },
      process.env.JWT_SECRET!,
      {
        algorithm: "HS256",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      },
    );

    expect(await service.verifyAccessToken(missingClaimsToken)).toBeNull();
  });

  it("rejects stale tokenVersion even when the session id and token id still match", async () => {
    expect(DATABASE_URL).toBeTruthy();
    configureHs256Env();

    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);
    const service = new JwtAuthService(repo);

    const principalId = `principal_stale_${randomUUID()}`;
    const actorId = `tenant-user-${randomUUID()}`;
    createdPrincipalIds.add(principalId);

    const issued = await service.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId,
        principalId,
        realm: "tenant",
        tenantId: "tenant-stale",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        requestId: null,
      },
      {
        principalId,
        subject: `tenant:${actorId}`,
        ensurePrincipal: true,
        authTime: "2026-08-02T00:00:00.000Z",
        tokenVersion: Date.now(),
      },
    );

    createdSessionIds.add(issued.sessionId);

    const session = await repo.getSession(issued.sessionId);
    expect(session).not.toBeNull();

    await repo.createSession({
      ...session!,
      tokenVersion: session!.tokenVersion + 1,
      updatedAt: new Date().toISOString(),
    });

    expect(await service.verifyAccessToken(issued.token)).toBeNull();
  });

  it("invalidates a platform session when its principal is suspended", async () => {
    expect(DATABASE_URL).toBeTruthy();
    configureHs256Env();

    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);
    const service = new JwtAuthService(repo);
    const principalId = `principal_platform_${randomUUID()}`;
    const membershipId = `membership_platform_${randomUUID()}`;
    const roleBindingId = `role_binding_platform_${randomUUID()}`;
    const issuedAt = "2026-08-02T00:00:00.000Z";
    createdPrincipalIds.add(principalId);

    await repo.upsertWorkforceIdentity(
      {
        principalId,
        sourceRef: `test:${principalId}`,
        issuer: "test_issuer",
        subject: `test_subject_${principalId}`,
        principalType: "human",
        email: `${principalId}@example.test`,
        emailVerified: true,
        displayName: "Platform Session Test",
        status: "active",
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      {
        membershipId,
        sourceRef: `test:${membershipId}`,
        principalId,
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      [
        {
          roleBindingId,
          sourceRef: `test:${roleBindingId}`,
          membershipId,
          roleCode: "platform_admin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: issuedAt,
          validTo: null,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        },
      ],
    );

    const issued = await service.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: principalId,
        principalId,
        membershipId,
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["platform:read"],
        requestId: null,
      },
      {
        principalId,
        membershipId,
        subject: `test_subject_${principalId}`,
        ensurePrincipal: false,
        authTime: issuedAt,
        tokenVersion: Date.parse(issuedAt),
      },
    );
    createdSessionIds.add(issued.sessionId);

    expect(await service.verifyAccessToken(issued.token)).not.toBeNull();

    await repo.upsertWorkforceIdentity(
      {
        principalId,
        sourceRef: `test:${principalId}`,
        issuer: "test_issuer",
        subject: `test_subject_${principalId}`,
        principalType: "human",
        email: `${principalId}@example.test`,
        emailVerified: true,
        displayName: "Platform Session Test",
        status: "suspended",
        createdAt: issuedAt,
        updatedAt: "2026-08-02T00:01:00.000Z",
      },
      {
        membershipId,
        sourceRef: `test:${membershipId}`,
        principalId,
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      [
        {
          roleBindingId,
          sourceRef: `test:${roleBindingId}`,
          membershipId,
          roleCode: "platform_admin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: issuedAt,
          validTo: null,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        },
      ],
    );

    expect(await service.verifyAccessToken(issued.token)).toBeNull();
  });

  it("invalidates a platform session within 60 seconds when its durable membership role binding changes", async () => {
    expect(DATABASE_URL).toBeTruthy();
    configureHs256Env();

    const db = new DatabaseService();
    databases.push(db);
    const repo = new IdentityRepository(db);
    const service = new JwtAuthService(repo);
    const principalId = `principal_platform_membership_${randomUUID()}`;
    const membershipId = `membership_platform_membership_${randomUUID()}`;
    const roleBindingId = `role_binding_platform_membership_${randomUUID()}`;
    const issuedAt = "2026-08-02T00:00:00.000Z";
    const changedAt = "2026-08-02T00:00:30.000Z";
    createdPrincipalIds.add(principalId);

    await repo.upsertWorkforceIdentity(
      {
        principalId,
        sourceRef: `test:${principalId}`,
        issuer: "test_issuer",
        subject: `test_subject_${principalId}`,
        principalType: "human",
        email: `${principalId}@example.test`,
        emailVerified: true,
        displayName: "Platform Membership Session Test",
        status: "active",
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      {
        membershipId,
        sourceRef: `test:${membershipId}`,
        principalId,
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      [
        {
          roleBindingId,
          sourceRef: `test:${roleBindingId}`,
          membershipId,
          roleCode: "platform_admin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: issuedAt,
          validTo: null,
          createdAt: issuedAt,
          updatedAt: issuedAt,
        },
      ],
    );

    const issued = await service.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: principalId,
        principalId,
        membershipId,
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["platform:read"],
        requestId: null,
      },
      {
        principalId,
        membershipId,
        subject: `test_subject_${principalId}`,
        ensurePrincipal: false,
        authTime: issuedAt,
        tokenVersion: Date.parse(issuedAt),
      },
    );
    createdSessionIds.add(issued.sessionId);

    expect(await service.verifyAccessToken(issued.token)).not.toBeNull();

    await repo.upsertWorkforceIdentity(
      {
        principalId,
        sourceRef: `test:${principalId}`,
        issuer: "test_issuer",
        subject: `test_subject_${principalId}`,
        principalType: "human",
        email: `${principalId}@example.test`,
        emailVerified: true,
        displayName: "Platform Membership Session Test",
        status: "active",
        createdAt: issuedAt,
        updatedAt: issuedAt,
      },
      {
        membershipId,
        sourceRef: `test:${membershipId}`,
        principalId,
        realm: "platform",
        scopeRef: "platform:control_plane",
        tenantId: null,
        partnerId: null,
        status: "active",
        invitedByPrincipalId: null,
        invitationId: null,
        createdAt: issuedAt,
        updatedAt: changedAt,
      },
      [
        {
          roleBindingId,
          sourceRef: `test:${roleBindingId}`,
          membershipId,
          roleCode: "superadmin",
          grantedByPrincipalId: null,
          approvalId: null,
          validFrom: issuedAt,
          validTo: null,
          createdAt: issuedAt,
          updatedAt: changedAt,
        },
      ],
    );

    expect(await service.verifyAccessToken(issued.token)).toBeNull();
  });

  it("rejects algorithm-confusion tokens when asymmetric keys are configured", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    delete process.env.JWT_SECRET;
    process.env.JWT_PRIVATE_KEY = privateKey.export({
      type: "pkcs1",
      format: "pem",
    }) as string;
    process.env.JWT_PUBLIC_KEY = publicKey.export({
      type: "pkcs1",
      format: "pem",
    }) as string;
    process.env.JWT_ISSUER = "https://auth.drts.internal";
    process.env.JWT_AUDIENCE = "https://api.drts.internal";
    process.env.JWT_ALGORITHMS = "RS256";
    delete process.env.JWT_ALGORITHM;

    const service = new JwtAuthService();
    const maliciousToken = jwt.sign(
      {
        sub: "tenant-user",
        actorType: "tenant_admin",
        realm: "tenant",
        tenantId: "tenant-integration",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        sid: `sid_${randomUUID()}`,
        tokenVersion: Date.now(),
        auth_time: 1_754_092_800,
        amr: ["tenant_bootstrap_fixture"],
        acr: "aal1",
        policyVersion: "auth.jwt-session.integration.v1",
      },
      process.env.JWT_PUBLIC_KEY!,
      {
        algorithm: "HS256",
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        jwtid: `jti_${randomUUID()}`,
      },
    );

    expect(await service.verifyAccessToken(maliciousToken)).toBeNull();
  });
});
