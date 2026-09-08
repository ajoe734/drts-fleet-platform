import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { expect, it, vi } from "vitest";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import { SnakeCaseExceptionFilter } from "../../../../apps/api/src/common/snake-case.exception-filter";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";

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
  const service = new TenantPartnerService(new AuditNotificationService(), repository);
  // Inherit the actual controller routes; unrelated collaborators are unused.
  class CredentialHttpController extends TenantPartnerController {
    constructor() {
      super(service, undefined as never, undefined as never, jwt, undefined as never);
    }
  }
  @Module({ controllers: [CredentialHttpController] })
  class CredentialHttpModule {}
  const app = await NestFactory.create(CredentialHttpModule, { logger: false, abortOnError: false });
  app.useGlobalGuards(new BootstrapAuthGuard(new Reflector(), jwt, undefined, undefined, undefined, undefined, new StepUpProofService()));
  app.useGlobalFilters(new SnakeCaseExceptionFilter());
  app.setGlobalPrefix("api");
  try {
    const tenantId = `qa-http-${randomUUID()}`;
    const key = await service.issueApiKey(tenantId, { keyName: "HTTP read acceptance", scopes: ["tenant:read"] });
    const before = (await repository.loadState()).apiKeys.filter(row => row.tenantId === tenantId);
    expect(before).toHaveLength(1);
    const principalId = `qa-http-principal-${randomUUID()}`;
    const issued = await jwt.issueSessionToken({
      authMode: "jwt_bearer", actorType: "tenant_admin", actorId: principalId,
      principalId, realm: "tenant", tenantId, roleFamilies: ["tenant"],
      roles: ["tenant_admin"], scopes: ["tenant:read"], requestId: null,
    }, { principalId, subject: `tenant:${principalId}`, ensurePrincipal: true });
    expect((await identityRepository.getSession(issued.sessionId))?.status).toBe("active");
    await app.listen(0, "127.0.0.1");
    const endpoint = `${await app.getUrl()}/api/tenant/api-keys`;
    const headers = { authorization: `Bearer ${issued.token}`, "x-tenant-id": tenantId, "content-type": "application/json" };
    const anonymous = await fetch(endpoint);
    expect(anonymous.status).toBe(401);
    const read = await fetch(endpoint, { headers });
    expect(read.status).toBe(200);
    const payload = await read.json();
    expect(JSON.stringify(payload)).toContain(key.apiKey.apiKeyId);
    expect(JSON.stringify(payload)).not.toContain(key.plaintextKey);
    expect(JSON.stringify(payload)).not.toContain("keyHash");
    const denied = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ keyName: "Must not exist", scopes: ["tenant:read"] }) });
    expect(denied.status).toBe(403);
    const failure = await denied.json();
    expect(JSON.stringify(failure)).toContain("SCOPE");
    const after = (await repository.loadState()).apiKeys.filter(row => row.tenantId === tenantId);
    expect(after).toEqual(before);
    console.log("SR-QA-WEBHOOK-001 auth HTTP resources", JSON.stringify({ tenantId, principalId, sessionId: issued.sessionId, apiKeyId: key.apiKey.apiKeyId, anonymousStatus: anonymous.status, readStatus: read.status, deniedWriteStatus: denied.status, failure, databaseUnchanged: true }));
  } finally {
    await app.close();
    service.onModuleDestroy();
    await db.onModuleDestroy();
    vi.unstubAllEnvs();
  }
}, 30000);
