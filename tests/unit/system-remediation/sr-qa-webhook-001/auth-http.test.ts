import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { InternalKeyMiddleware } from "../../../../apps/api/src/common/auth/internal-key.middleware";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import { SnakeCaseExceptionFilter } from "../../../../apps/api/src/common/snake-case.exception-filter";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
apiRequire("reflect-metadata");
const { Module } = apiRequire(
  "@nestjs/common",
) as typeof import("../../../../apps/api/node_modules/@nestjs/common");
const { NestFactory, Reflector } = apiRequire(
  "@nestjs/core",
) as typeof import("../../../../apps/api/node_modules/@nestjs/core");

it("C111: durable bearer reads a persisted key over HTTP and denied writes leave DB unchanged", async () => {
  const url = new URL(process.env.DATABASE_URL ?? "http://unconfigured");
  expect(url.pathname).toMatch(/^\/sr_qa_webhook_001_/);
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  vi.stubEnv("JWT_SECRET", randomUUID() + randomUUID());
  vi.stubEnv("JWT_ALGORITHMS", "HS256");
  const db = new DatabaseService();
  const identityRepository = new IdentityRepository(db);
  const jwt = new JwtAuthService(identityRepository);
  const repository = new TenantPartnerRepository(db);
  const service = new TenantPartnerService(
    new AuditNotificationService(),
    repository,
  );
  // Inherit the actual controller routes; unrelated collaborators are unused.
  class CredentialHttpController extends TenantPartnerController {
    constructor() {
      super(
        service,
        undefined as never,
        undefined as never,
        jwt,
        undefined as never,
      );
    }
  }
  Reflect.defineMetadata("design:paramtypes", [], CredentialHttpController);
  @Module({ controllers: [CredentialHttpController] })
  class CredentialHttpModule {
    configure(consumer: import("../../../../apps/api/node_modules/@nestjs/common").MiddlewareConsumer) {
      consumer.apply(InternalKeyMiddleware).forRoutes(CredentialHttpController);
    }
  }
  const app = await NestFactory.create(CredentialHttpModule, {
    logger: false,
    abortOnError: false,
  });
  const proofs = new StepUpProofService();
  app.useGlobalGuards(
    new BootstrapAuthGuard(
      new Reflector(),
      jwt,
      undefined,
      undefined,
      undefined,
      undefined,
      proofs,
    ),
  );
  app.useGlobalFilters(new SnakeCaseExceptionFilter());
  app.setGlobalPrefix("api");
  try {
    const tenantId = `qa-http-${randomUUID()}`;
    const key = await service.issueApiKey(tenantId, {
      keyName: "HTTP read acceptance",
      scopes: ["tenant:read"],
    });
    await expect
      .poll(async () =>
        (await repository.loadState()).apiKeys.some(
          (row) => row.apiKeyId === key.apiKey.apiKeyId,
        ),
      )
      .toBe(true);
    const before = (await repository.loadState()).apiKeys.filter(
      (row) => row.tenantId === tenantId,
    );
    expect(before).toHaveLength(1);
    const principalId = `qa-http-principal-${randomUUID()}`;
    const issued = await jwt.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: principalId,
        principalId,
        realm: "tenant",
        tenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        requestId: null,
      },
      { principalId, subject: `tenant:${principalId}`, ensurePrincipal: true },
    );
    expect(
      (await identityRepository.getSession(issued.sessionId))?.status,
    ).toBe("active");
    await app.listen(0, "127.0.0.1");
    const endpoint = `${await app.getUrl()}/api/tenant/api-keys`;
    const headers = {
      authorization: `Bearer ${issued.token}`,
      "x-tenant-id": tenantId,
      "content-type": "application/json",
    };
    const anonymous = await fetch(endpoint);
    expect(anonymous.status).toBe(401);
    const read = await fetch(endpoint, { headers });
    expect(read.status).toBe(200);
    const payload = await read.json();
    expect(JSON.stringify(payload)).toContain(key.apiKey.apiKeyId);
    expect(JSON.stringify(payload)).not.toContain(key.plaintextKey);
    expect(JSON.stringify(payload)).not.toContain("keyHash");
    const denied = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        keyName: "Must not exist",
        scopes: ["tenant:read"],
      }),
    });
    expect(denied.status).toBe(403);
    const failure = await denied.json();
    expect(JSON.stringify(failure)).toContain("AUTH_SCOPE_DENIED");
    const writer = await jwt.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: principalId,
        principalId,
        realm: "tenant",
        tenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read", "tenant:write"],
        requestId: null,
      },
      { principalId, subject: `tenant:${principalId}`, ensurePrincipal: true },
    );
    const noProof = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, authorization: `Bearer ${writer.token}` },
      body: JSON.stringify({
        keyName: "No proof must not write",
        scopes: ["tenant:read"],
      }),
    });
    expect(noProof.status).toBe(403);
    const proofFailure = await noProof.json();
    expect(JSON.stringify(proofFailure)).toContain("STEP_UP_REQUIRED");
    const after = (await repository.loadState()).apiKeys.filter(
      (row) => row.tenantId === tenantId,
    );
    expect(after).toEqual(before);
    // Local issuer precondition only: this does not exercise a deployed MFA challenge.
    const writerPayload = await jwt.verifyAccessToken(writer.token);
    expect(writerPayload).not.toBeNull();
    const writerIdentity = jwt.toRequestIdentity(writerPayload!);
    const post = async (path: string, body: Record<string, unknown>) => {
      const proof = proofs.createProof(writerIdentity, {
        method: "POST",
        path: `/api/tenant/api-keys${path}`,
      });
      const response = await fetch(`${endpoint}${path}`, {
        method: "POST",
        headers: {
          ...headers,
          authorization: `Bearer ${writer.token}`,
          "x-drts-step-up-reference": proof.stepUpReference!,
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
      return (await response.json()).data;
    };
    const created = await post("", {
      keyName: "HTTP lifecycle acceptance",
      scopes: ["tenant:read"],
    });
    const createdId = created.apiKey.apiKeyId;
    const rotated = await post(`/${createdId}/rotate`, {
      keyName: "HTTP rotated acceptance",
      overlapDays: 7,
    });
    const rotatedId = rotated.apiKey.apiKeyId;
    await expect.poll(async () => {
      const rows = (await repository.loadState()).apiKeys;
      return rows.find((row) => row.apiKeyId === createdId)?.supersededByApiKeyId;
    }).toBe(rotatedId);
    await post(`/${rotatedId}/revoke`, {});
    await expect.poll(async () =>
      (await repository.loadState()).apiKeys.find(
        (row) => row.apiKeyId === rotatedId,
      )?.status,
    ).toBe("revoked");
    const persisted = await db.query<{ record: Record<string, unknown> }>(
      "SELECT record FROM admin.phase1_tenant_api_keys WHERE tenant_id = $1",
      [tenantId],
    );
    expect(persisted.rows).toHaveLength(3);
    for (const secret of [created.plaintextKey, rotated.plaintextKey]) {
      expect(typeof secret).toBe("string");
      expect(JSON.stringify(persisted.rows)).not.toContain(secret);
    }
    const finalRead = await fetch(endpoint, { headers });
    expect(finalRead.status).toBe(200);
    const finalPayload = JSON.stringify(await finalRead.json());
    expect(finalPayload).toContain(rotatedId);
    expect(finalPayload).toContain("revoked");
    expect(finalPayload).not.toContain(created.plaintextKey);
    expect(finalPayload).not.toContain(rotated.plaintextKey);
    const otherTenantId = `qa-http-other-${randomUUID()}`;
    const otherPrincipalId = `qa-http-other-principal-${randomUUID()}`;
    const otherSession = await jwt.issueSessionToken(
      {
        authMode: "jwt_bearer",
        actorType: "tenant_admin",
        actorId: otherPrincipalId,
        principalId: otherPrincipalId,
        realm: "tenant",
        tenantId: otherTenantId,
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
        scopes: ["tenant:read"],
        requestId: null,
      },
      { principalId: otherPrincipalId, subject: `tenant:${otherPrincipalId}`, ensurePrincipal: true },
    );
    const crossTenantRead = await fetch(endpoint, {
      headers: { ...headers, authorization: `Bearer ${otherSession.token}` },
    });
    const crossTenantPayload = JSON.stringify(await crossTenantRead.json());
    const crossTenant = {
      authenticatedTenantId: otherTenantId,
      requestedTenantId: tenantId,
      sessionId: otherSession.sessionId,
      status: crossTenantRead.status,
      exposedVictimKeyId: crossTenantPayload.includes(createdId),
    };
    const evidence = {
      baseSha: execFileSync("git", ["merge-base", "HEAD", "origin/dev"], {
        encoding: "utf8",
      }).trim(),
      executionSha: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      recordedAt: new Date().toISOString(),
      scope:
        "Local inherited production controller routes, real auth guard/JWT and PostgreSQL. HTTP issue/rotate/revoke with product-issued local session and proof; full AppModule middleware and deployed MFA not verified.",
      tenantId,
      principalId,
      sessionId: issued.sessionId,
      writerSessionId: writer.sessionId,
      apiKeyId: key.apiKey.apiKeyId,
      isolatedDatabase: url.pathname.slice(1),
      anonymousStatus: anonymous.status,
      readStatus: read.status,
      deniedWriteStatus: denied.status,
      failure,
      missingProofStatus: noProof.status,
      proofFailure,
      rejectedWritesDatabaseUnchanged: true,
      httpCreatedApiKeyId: createdId,
      httpRotatedApiKeyId: rotatedId,
      httpLifecycleStatuses: [201, 201, 201],
      persistedRevoked: true,
      crossTenant,
    };
    console.log(
      "SR-QA-WEBHOOK-001 auth HTTP resources",
      JSON.stringify(evidence),
    );
    if (process.env.DRTS_WEBHOOK_AUTH_EVIDENCE)
      writeFileSync(
        process.env.DRTS_WEBHOOK_AUTH_EVIDENCE,
        JSON.stringify(evidence, null, 2) + "\n",
      );
    expect(crossTenantRead.status, JSON.stringify(crossTenant)).toBe(403);
    expect(crossTenant.exposedVictimKeyId).toBe(false);
  } finally {
    await app.close();
    service.onModuleDestroy();
    await db.onModuleDestroy();
    vi.unstubAllEnvs();
  }
}, 30000);
