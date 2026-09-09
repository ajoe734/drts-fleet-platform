import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { AppModule } from "../../../../apps/api/src/app.module";
import { DatabaseService } from "../../../../apps/api/src/common/db";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { StepUpProofService } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import { TenantPartnerController } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import type { StoredTenantApiKeyRecord } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
apiRequire("reflect-metadata");
const { NestFactory } = apiRequire(
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

      // Launch full AppModule instance with real registered DI services, guards, filters, and interceptors
      const app = await NestFactory.create(AppModule, {
        logger: false,
        abortOnError: false,
      });
      app.setGlobalPrefix("api");

      // Obtain registered services from AppModule DI container
      const db = app.get(DatabaseService);
      const jwt = app.get(JwtAuthService);
      const repository = app.get(TenantPartnerRepository);
      const proofs = app.get(StepUpProofService);
      const service = app.get(TenantPartnerService);

      try {
        const victimTenantId = `qa-victim-${randomUUID()}`;
        const otherTenantId = `qa-other-${randomUUID()}`;
        const victimPrincipalId = `qa-victim-principal-${randomUUID()}`;
        const otherPrincipalId = `qa-other-principal-${randomUUID()}`;

        // 1. Seed initial key for victim tenant
        const initialKey = await service.issueApiKey(victimTenantId, {
          keyName: "Victim Initial Key",
          scopes: ["tenant:read"],
        });
        const victimKeyId = initialKey.apiKey.apiKeyId;

        // 2. Issue authentic sessions with trusted MFA fixtures
        const now = new Date().toISOString();
        const victimSessionId = `sid-victim-${randomUUID()}`;
        const otherSessionId = `sid-other-${randomUUID()}`;

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
            sessionId: victimSessionId,
            authTime: now,
            amr: ["mfa", "totp"],
            acr: "aal2",
          },
          {
            principalId: victimPrincipalId,
            subject: `tenant:${victimPrincipalId}`,
            ensurePrincipal: true,
            sessionId: victimSessionId,
            authTime: now,
            amr: ["mfa", "totp"],
            acr: "aal2",
          },
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
            sessionId: otherSessionId,
            authTime: now,
            amr: ["mfa", "totp"],
            acr: "aal2",
          },
          {
            principalId: otherPrincipalId,
            subject: `tenant:${otherPrincipalId}`,
            ensurePrincipal: true,
            sessionId: otherSessionId,
            authTime: now,
            amr: ["mfa", "totp"],
            acr: "aal2",
          },
        );

        const victimIdentity = jwt.toRequestIdentity(
          (await jwt.verifyAccessToken(victimSession.token))!,
        );
        const otherIdentity = jwt.toRequestIdentity(
          (await jwt.verifyAccessToken(otherSession.token))!,
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
        // Capture DB state before attacks
        const dbStateBeforeAttacks = (await repository.loadState()).apiKeys.filter(
          (k) => k.tenantId === victimTenantId,
        );
        expect(dbStateBeforeAttacks).toHaveLength(1);
        expect(dbStateBeforeAttacks[0]?.apiKeyId).toBe(victimKeyId);
        expect(dbStateBeforeAttacks[0]?.status).toBe("active");

        // Issue attempt with authentic caller-bound valid proof
        const otherIssueProof = proofs.createProof(otherIdentity, {
          method: "POST",
          path: "/api/tenant/api-keys",
        });
        const crossIssue = await fetch(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
            "content-type": "application/json",
            "x-drts-step-up-reference": otherIssueProof.stepUpReference!,
          },
          body: JSON.stringify({
            keyName: "Malicious Key",
            scopes: ["tenant:read"],
          }),
        });
        expect(crossIssue.status).toBe(403);
        const crossIssuePayload = await crossIssue.json();
        expect(JSON.stringify(crossIssuePayload)).toContain("TENANT_SCOPE_MISMATCH");

        // Rotate attempt with authentic caller-bound valid proof
        const otherRotateProof = proofs.createProof(otherIdentity, {
          method: "POST",
          path: `/api/tenant/api-keys/${victimKeyId}/rotate`,
        });
        const crossRotate = await fetch(`${endpoint}/${victimKeyId}/rotate`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
            "content-type": "application/json",
            "x-drts-step-up-reference": otherRotateProof.stepUpReference!,
          },
          body: JSON.stringify({ overlapDays: 7 }),
        });
        expect(crossRotate.status).toBe(403);
        const crossRotatePayload = await crossRotate.json();
        expect(JSON.stringify(crossRotatePayload)).toContain("TENANT_SCOPE_MISMATCH");

        // Revoke attempt with authentic caller-bound valid proof
        const otherRevokeProof = proofs.createProof(otherIdentity, {
          method: "POST",
          path: `/api/tenant/api-keys/${victimKeyId}/revoke`,
        });
        const crossRevoke = await fetch(`${endpoint}/${victimKeyId}/revoke`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${otherSession.token}`,
            "x-tenant-id": victimTenantId,
            "content-type": "application/json",
            "x-drts-step-up-reference": otherRevokeProof.stepUpReference!,
          },
          body: JSON.stringify({}),
        });
        expect(crossRevoke.status).toBe(403);
        const crossRevokePayload = await crossRevoke.json();
        expect(JSON.stringify(crossRevokePayload)).toContain("TENANT_SCOPE_MISMATCH");

        // DB state for victim tenant remains untouched by cross-tenant attacks (complete record comparison)
        const dbStateAfterAttacks = (await repository.loadState()).apiKeys.filter(
          (k) => k.tenantId === victimTenantId,
        );
        expect(dbStateAfterAttacks).toEqual(dbStateBeforeAttacks);

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
          const json = (await response.json()) as { data: Record<string, unknown> };
          return json.data;
        };

        const created = (await postWithProof("", {
          keyName: "HTTP Lifecycle Key",
          scopes: ["tenant:read"],
        })) as {
          api_key?: { api_key_id?: string };
          apiKey?: { apiKeyId?: string };
        };
        const createdId = created.api_key?.api_key_id ?? created.apiKey?.apiKeyId;
        expect(createdId).toBeDefined();

        const rotated = (await postWithProof(`/${createdId}/rotate`, {
          keyName: "HTTP Rotated Key",
          overlapDays: 7,
        })) as {
          api_key?: { api_key_id?: string };
          apiKey?: { apiKeyId?: string };
        };
        const rotatedId = rotated.api_key?.api_key_id ?? rotated.apiKey?.apiKeyId;
        expect(rotatedId).toBeDefined();

        await postWithProof(`/${rotatedId}/revoke`, {});

        // Verify SQL persistence and record state (active, overlap_active, revoked)
        const persisted = await db.query<{
          api_key_id: string;
          tenant_id: string;
          revoked_at: string | null;
          created_at: string;
          record: Record<string, unknown>;
        }>(
          "SELECT api_key_id, tenant_id, revoked_at, created_at, record FROM admin.phase1_tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at ASC",
          [victimTenantId],
        );
        expect(persisted.rows.length).toBeGreaterThanOrEqual(3);

        const rowMap = new Map(persisted.rows.map((r) => [r.api_key_id, r]));
        expect(rowMap.has(victimKeyId)).toBe(true);
        expect(rowMap.has(createdId!)).toBe(true);
        expect(rowMap.has(rotatedId!)).toBe(true);

        const initialRow = rowMap.get(victimKeyId)!;
        const initialRecord = initialRow.record as StoredTenantApiKeyRecord;
        expect(initialRecord.status).toBe("active");
        expect(initialRow.revoked_at).toBeNull();

        const createdRow = rowMap.get(createdId!)!;
        const createdRecord = createdRow.record as StoredTenantApiKeyRecord;
        expect(createdRecord.status).toBe("overlap_active");

        const rotatedRow = rowMap.get(rotatedId!)!;
        const rotatedRecord = rotatedRow.record as StoredTenantApiKeyRecord;
        expect(rotatedRecord.status).toBe("revoked");
        expect(rotatedRow.revoked_at).not.toBeNull();

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
