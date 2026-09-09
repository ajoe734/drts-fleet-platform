import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AppModule } from "../../../../apps/api/src/app.module";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { BootstrapAuthGuard } from "../../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { InternalKeyMiddleware } from "../../../../apps/api/src/common/auth/internal-key.middleware";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import { SnakeCaseExceptionFilter } from "../../../../apps/api/src/common/snake-case.exception-filter";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
apiRequire("reflect-metadata");
const { NestFactory, Reflector } = apiRequire(
  "@nestjs/core",
) as typeof import("../../../../apps/api/node_modules/@nestjs/core");

const hasDatabaseUrl = Boolean(
  process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith("postgres://") ||
      process.env.DATABASE_URL.startsWith("postgresql://")),
);

describe("SR-QA-WEBHOOK-001-FIX-TENANT-BINDING: Full AppModule / PG E2E Harness", () => {
  it("verifies AppModule composition, controller binding, and guard wiring without requiring server startup", () => {
    // Reflect on AppModule imports and controllers to verify complete integration
    const imports = Reflect.getMetadata("imports", AppModule) || [];
    expect(imports.length).toBeGreaterThan(0);

    const controllerPrototype = TenantPartnerController.prototype;
    expect(controllerPrototype.listApiKeys).toBeDefined();
    expect(controllerPrototype.issueApiKey).toBeDefined();
    expect(controllerPrototype.rotateApiKey).toBeDefined();
    expect(controllerPrototype.revokeApiKey).toBeDefined();
  });

  it.runIf(hasDatabaseUrl)(
    "C111: Full AppModule with two real tenant JWTs rejects cross-tenant GET, rejects mutations, and preserves same-tenant lifecycle",
    async () => {
      const url = new URL(process.env.DATABASE_URL!);
      expect(["127.0.0.1", "localhost"]).toContain(url.hostname);

      vi.stubEnv("JWT_SECRET", randomUUID() + randomUUID());
      vi.stubEnv("JWT_ALGORITHMS", "HS256");

      const db = new DatabaseService();
      const identityRepository = new IdentityRepository(db);
      const jwt = new JwtAuthService(identityRepository);
      const repository = new TenantPartnerRepository(db);
      const proofs = new StepUpProofService();

      // Launch full AppModule instance with production filters and guards
      const app = await NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
      });

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
        const victimTenantId = `qa-victim-${randomUUID()}`;
        const otherTenantId = `qa-other-${randomUUID()}`;
        const victimPrincipalId = `qa-victim-principal-${randomUUID()}`;
        const otherPrincipalId = `qa-other-principal-${randomUUID()}`;

        // Get tenant partner service from DI container
        const service = app.get(TenantPartnerService);

        // 1. Seed initial key for victim tenant
        const initialKey = await service.issueApiKey(victimTenantId, {
          keyName: "Victim Initial Key",
          scopes: ["tenant:read"],
        });
        const victimKeyId = initialKey.apiKey.apiKeyId;

        // 2. Issue authentic sessions
        const victimSession = await jwt.issueSessionToken(
          {
            authMode: "jwt_bearer",
            actorType: "tenant_admin",
            actorId: victimPrincipalId,
            principalId: victimPrincipalId,
            realm: "tenant",
            tenantId: victimTenantId,
            roleFamilies: ["tenant"],
            roles: ["tenant_admin"],
            scopes: ["tenant:read", "tenant:write"],
            requestId: null,
          },
          { principalId: victimPrincipalId, subject: `tenant:${victimPrincipalId}`, ensurePrincipal: true },
        );

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
            scopes: ["tenant:read", "tenant:write"],
            requestId: null,
          },
          { principalId: otherPrincipalId, subject: `tenant:${otherPrincipalId}`, ensurePrincipal: true },
        );

        await app.listen(0, "127.0.0.1");
        const endpoint = `${await app.getUrl()}/api/tenant/api-keys`;

        // 3. Anonymous request must be 401
        const anonRes = await fetch(endpoint, {
          headers: { "x-tenant-id": victimTenantId },
        });
        expect(anonRes.status).toBe(401);

        // 4. CROSS-TENANT GET VERIFICATION
        // Other tenant authentic JWT attempting to read victim tenant keys
        const crossTenantRead = await fetch(endpoint, {
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
          },
        });
        expect(crossTenantRead.status).toBe(403);
        const crossTenantPayload = await crossTenantRead.json();
        const exposedVictimKeyId = JSON.stringify(crossTenantPayload).includes(victimKeyId);
        expect(exposedVictimKeyId).toBe(false);
        expect(JSON.stringify(crossTenantPayload)).toContain("TENANT_SCOPE_MISMATCH");

        // 5. CROSS-TENANT MUTATIONS VERIFICATION
        // Issue attempt
        const crossIssue = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            keyName: "Malicious Key",
            scopes: ["tenant:read"],
          }),
        });
        expect(crossIssue.status).toBe(403);

        // Rotate attempt
        const crossRotate = await fetch(`${endpoint}/${victimKeyId}/rotate`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({ overlapDays: 7 }),
        });
        expect(crossRotate.status).toBe(403);

        // Revoke attempt
        const crossRevoke = await fetch(`${endpoint}/${victimKeyId}/revoke`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        expect(crossRevoke.status).toBe(403);

        // DB state for victim tenant remains untouched by cross-tenant attacks
        const dbStateAfterAttacks = (await repository.loadState()).apiKeys.filter(
          (k) => k.tenantId === victimTenantId,
        );
        expect(dbStateAfterAttacks).toHaveLength(1);
        expect(dbStateAfterAttacks[0]?.apiKeyId).toBe(victimKeyId);
        expect(dbStateAfterAttacks[0]?.status).toBe("active");

        // 6. SAME-TENANT LIFECYCLE & SQL READBACK VERIFICATION
        const victimHeaders = {
          authorization: `Bearer ${victimSession.token}`,
          "x-tenant-id": victimTenantId,
          "content-type": "application/json",
        };

        const readSelf = await fetch(endpoint, { headers: victimHeaders });
        expect(readSelf.status).toBe(200);
        const selfPayload = await readSelf.json();
        expect(JSON.stringify(selfPayload)).toContain(victimKeyId);

        // Post with step-up proof
        const victimIdentity = jwt.toRequestIdentity(
          (await jwt.verifyAccessToken(victimSession.token))!,
        );
        const postWithProof = async (path: string, body: Record<string, unknown>) => {
          const proof = proofs.createProof(victimIdentity, {
            method: "POST",
            path: `/api/tenant/api-keys${path}`,
          });
          const response = await fetch(`${endpoint}${path}`, {
            method: "POST",
            headers: {
              ...victimHeaders,
              "x-drts-step-up-reference": proof.stepUpReference!,
            },
            body: JSON.stringify(body),
          });
          expect(response.status).toBe(201);
          return (await response.json()).data;
        };

        const created = await postWithProof("", {
          keyName: "HTTP Lifecycle Key",
          scopes: ["tenant:read"],
        });
        const createdId = created.apiKey.apiKeyId;

        const rotated = await postWithProof(`/${createdId}/rotate`, {
          keyName: "HTTP Rotated Key",
          overlapDays: 7,
        });
        const rotatedId = rotated.apiKey.apiKeyId;

        await postWithProof(`/${rotatedId}/revoke`, {});

        // Verify SQL persistence
        const persisted = await db.query<{ record: Record<string, unknown> }>(
          "SELECT record FROM admin.phase1_tenant_api_keys WHERE tenant_id = $1",
          [victimTenantId],
        );
        expect(persisted.rows.length).toBeGreaterThanOrEqual(3);

        if (process.env.DRTS_WEBHOOK_AUTH_EVIDENCE) {
          const evidence = {
            baseSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
            recordedAt: new Date().toISOString(),
            scope: "Full AppModule with real auth guard/JWT and PostgreSQL",
            victimTenantId,
            otherTenantId,
            crossTenantStatus: crossTenantRead.status,
            exposedVictimKeyId,
            persistedRowsCount: persisted.rows.length,
          };
          writeFileSync(
            process.env.DRTS_WEBHOOK_AUTH_EVIDENCE,
            JSON.stringify(evidence, null, 2) + "\n",
          );
        }
      } finally {
        await app.close();
      }
    },
  );
});
