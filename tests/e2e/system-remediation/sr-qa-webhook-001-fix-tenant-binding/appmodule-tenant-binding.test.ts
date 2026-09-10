import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StoredTenantApiKeyRecord } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import type { AppModule as AppModuleType } from "../../../../apps/api/src/app.module";
import type { DatabaseService as DatabaseServiceType } from "../../../../apps/api/src/common/db";
import type { JwtAuthService as JwtAuthServiceType } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import type { StepUpProofService as StepUpProofServiceType } from "../../../../apps/api/src/common/auth/step-up-proof.service";
import type { TenantPartnerController as TenantPartnerControllerType } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import type { TenantPartnerService as TenantPartnerServiceType } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import type { TenantPartnerRepository as TenantPartnerRepositoryType } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import type { BillingSettlementService as BillingSettlementServiceType } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import type { OwnedMobilityService as OwnedMobilityServiceType } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import type { IdempotencyService as IdempotencyServiceType } from "../../../../apps/api/src/common/idempotency";
import type { IdentityRepository as IdentityRepositoryType } from "../../../../apps/api/src/modules/identity/identity.repository";
import type { AuditNotificationService as AuditNotificationServiceType } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";

const distAppModuleUrl = new URL(
  "../../../../apps/api/dist/app.module.js",
  import.meta.url,
);
const distAppModulePath = fileURLToPath(distAppModuleUrl);
// CI unit/smoke jobs collect this harness before the separate API build job.
// Build this checkout on every run so missing or stale dist cannot determine
// acceptance results. This compiles only; it does not start an HTTP server.
execFileSync("pnpm", ["--filter", "@drts/api...", "build"], {
  cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
  stdio: "pipe",
  timeout: 120_000,
});
if (!existsSync(distAppModulePath)) {
  throw new Error(
    `Candidate compiled build not found at ${distAppModulePath}. Run 'pnpm --filter @drts/api build' before running full AppModule E2E tests.`,
  );
}

const apiRequire = createRequire(
  new URL("../../../../apps/api/package.json", import.meta.url),
);
apiRequire("reflect-metadata");
interface INestAppLike {
  get<T = any>(token: unknown): T;
  setGlobalPrefix(prefix: string): void;
  useGlobalPipes(...pipes: unknown[]): void;
  useGlobalFilters(...filters: unknown[]): void;
  useGlobalInterceptors(...interceptors: unknown[]): void;
  useGlobalGuards(...guards: unknown[]): void;
  listen(port: number | string, ...args: any[]): Promise<any>;
  init(): Promise<unknown>;
  getUrl(): Promise<string>;
  close(): Promise<void>;
}

const { NestFactory } = apiRequire("@nestjs/core") as {
  NestFactory: {
    createApplicationContext(
      moduleCls: unknown,
      options?: { logger?: boolean },
    ): Promise<{
      get<T = any>(token: unknown): T;
      close(): Promise<void>;
    }>;
    create(
      moduleCls: unknown,
      options?: { logger?: boolean; abortOnError?: boolean },
    ): Promise<INestAppLike>;
  };
};

// Load candidate compiled module and all DI tokens consistently to ensure emitted decorator metadata is used
const { AppModule } = apiRequire("./dist/app.module.js") as {
  AppModule: typeof AppModuleType;
};
const { DatabaseService } = apiRequire("./dist/common/db") as {
  DatabaseService: typeof DatabaseServiceType;
};
const { JwtAuthService } = apiRequire(
  "./dist/common/auth/jwt-auth.service.js",
) as {
  JwtAuthService: typeof JwtAuthServiceType;
};
const { StepUpProofService } = apiRequire(
  "./dist/common/auth/step-up-proof.service.js",
) as {
  StepUpProofService: typeof StepUpProofServiceType;
};
const { TenantPartnerController } = apiRequire(
  "./dist/modules/tenant-partner/tenant-partner.controller.js",
) as {
  TenantPartnerController: typeof TenantPartnerControllerType;
};
const { TenantPartnerService } = apiRequire(
  "./dist/modules/tenant-partner/tenant-partner.service.js",
) as {
  TenantPartnerService: typeof TenantPartnerServiceType;
};
const { TenantPartnerRepository } = apiRequire(
  "./dist/modules/tenant-partner/tenant-partner.repository.js",
) as {
  TenantPartnerRepository: typeof TenantPartnerRepositoryType;
};
const { BillingSettlementService } = apiRequire(
  "./dist/modules/billing-settlement/billing-settlement.service.js",
) as {
  BillingSettlementService: typeof BillingSettlementServiceType;
};
const { OwnedMobilityService } = apiRequire(
  "./dist/modules/owned-mobility/owned-mobility.service.js",
) as {
  OwnedMobilityService: typeof OwnedMobilityServiceType;
};
const { IdempotencyService } = apiRequire("./dist/common/idempotency") as {
  IdempotencyService: typeof IdempotencyServiceType;
};
const { IdentityRepository } = apiRequire(
  "./dist/modules/identity/identity.repository.js",
) as {
  IdentityRepository: typeof IdentityRepositoryType;
};
const { AuditNotificationService } = apiRequire(
  "./dist/modules/audit-notification/audit-notification.service.js",
) as {
  AuditNotificationService: typeof AuditNotificationServiceType;
};

// Ordinary unit/smoke jobs expose an unmigrated shared DATABASE_URL.
// Acceptance must explicitly select a migrated, dedicated test database.
const acceptanceDatabaseUrl = process.env.DRTS_TENANT_BINDING_DATABASE_URL;
if (process.env.DRTS_WEBHOOK_AUTH_EVIDENCE && !acceptanceDatabaseUrl) {
  throw new Error("Acceptance evidence requires DRTS_TENANT_BINDING_DATABASE_URL");
}

describe("SR-QA-WEBHOOK-001-FIX-TENANT-BINDING: Full AppModule / PG E2E Harness", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("verifies AppModule composition, controller binding, and real DI wiring without requiring server startup", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    // 1. Verify AppModule composition
    const imports = Reflect.getMetadata("imports", AppModule) || [];
    expect(imports.length).toBeGreaterThan(0);

    // 2. Verify controller prototypes
    const controllerPrototype = TenantPartnerController.prototype;
    expect(controllerPrototype.listApiKeys).toBeDefined();
    expect(controllerPrototype.issueApiKey).toBeDefined();
    expect(controllerPrototype.rotateApiKey).toBeDefined();
    expect(controllerPrototype.revokeApiKey).toBeDefined();

    // 3. Assert constructor dependency injection metadata (self:paramtypes)
    // Ensures Nest DI can resolve dependencies even without TypeScript runtime metadata emission
    const controllerSelfParams: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata("self:paramtypes", TenantPartnerController) || [];
    expect(
      controllerSelfParams.some(
        (p) => p.index === 0 && p.param === TenantPartnerService,
      ),
    ).toBe(true);
    expect(
      controllerSelfParams.some(
        (p) => p.index === 1 && p.param === BillingSettlementService,
      ),
    ).toBe(true);
    expect(
      controllerSelfParams.some(
        (p) => p.index === 2 && p.param === OwnedMobilityService,
      ),
    ).toBe(true);
    expect(
      controllerSelfParams.some(
        (p) => p.index === 3 && p.param === JwtAuthService,
      ),
    ).toBe(true);
    expect(
      controllerSelfParams.some(
        (p) => p.index === 4 && p.param === IdempotencyService,
      ),
    ).toBe(true);
    expect(
      controllerSelfParams.some(
        (p) => p.index === 5 && p.param === IdentityRepository,
      ),
    ).toBe(true);
    expect(
      controllerSelfParams.some(
        (p) => p.index === 6 && p.param === AuditNotificationService,
      ),
    ).toBe(true);

    // Also assert TypeScript emitted design:paramtypes
    const controllerDesignParams: unknown[] =
      Reflect.getMetadata("design:paramtypes", TenantPartnerController) || [];
    expect(controllerDesignParams[0]).toBe(TenantPartnerService);
    expect(controllerDesignParams[1]).toBe(BillingSettlementService);
    expect(controllerDesignParams[2]).toBe(OwnedMobilityService);
    expect(controllerDesignParams[3]).toBe(JwtAuthService);
    expect(controllerDesignParams[4]).toBe(IdempotencyService);
    expect(controllerDesignParams[5]).toBe(IdentityRepository);
    expect(controllerDesignParams[6]).toBe(AuditNotificationService);

    // 4. Assert service constructor dependency injection metadata
    const serviceSelfParams: Array<{ index: number; param: unknown }> =
      Reflect.getMetadata("self:paramtypes", TenantPartnerService) || [];
    expect(
      serviceSelfParams.some(
        (p) => p.index === 0 && p.param === AuditNotificationService,
      ),
    ).toBe(true);
    expect(
      serviceSelfParams.some(
        (p) => p.index === 1 && p.param === TenantPartnerRepository,
      ),
    ).toBe(true);

    // 5. Assert real full AppModule DI container resolution without server startup
    vi.stubEnv(
      "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
      "test-secret-that-is-at-least-32-chars-long",
    );
    vi.stubEnv("JWT_SECRET", "test-secret-that-is-at-least-32-chars-long");

    const fullAppCtx = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    try {
      const resolvedController = fullAppCtx.get(TenantPartnerController);
      expect(resolvedController).toBeDefined();
      const resolvedService = fullAppCtx.get(TenantPartnerService);
      expect(resolvedService).toBeDefined();
      expect(fullAppCtx.get(DatabaseService)).toBeDefined();
      expect(fullAppCtx.get(JwtAuthService)).toBeDefined();
      expect(fullAppCtx.get(TenantPartnerRepository)).toBeDefined();
      expect(fullAppCtx.get(StepUpProofService)).toBeDefined();

      // Verify real DI container injected dependencies
      expect(
        (resolvedController as unknown as { tenantPartnerService: unknown })
          .tenantPartnerService,
      ).toBe(resolvedService);
    } finally {
      await fullAppCtx.close();
    }
  });

  it.runIf(Boolean(acceptanceDatabaseUrl))(
    "C111: Full AppModule with two real tenant JWTs rejects cross-tenant GET, rejects mutations, and preserves same-tenant lifecycle",
    async () => {
      const url = new URL(acceptanceDatabaseUrl!);
      expect(["postgres:", "postgresql:"]).toContain(url.protocol);
      vi.stubEnv("DATABASE_URL", acceptanceDatabaseUrl);
      expect(["127.0.0.1", "localhost"]).toContain(url.hostname);

      vi.stubEnv(
        "CONTROLLED_DOWNLOAD_SIGNING_SECRET",
        randomUUID() + randomUUID(),
      );
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
        await app.init();
        const victimTenantId = `qa-victim-${randomUUID()}`;
        const otherTenantId = `qa-other-${randomUUID()}`;
        const victimPrincipalId = `qa-victim-principal-${randomUUID()}`;
        const otherPrincipalId = `qa-other-principal-${randomUUID()}`;

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

        // Seed with the verified victim actor required by security-event auditing.
        const initialKey = await service.issueApiKey(
          victimTenantId,
          { keyName: "Victim Initial Key", scopes: ["tenant:read"] },
          undefined,
          victimIdentity,
        );
        const victimKeyId = initialKey.apiKey.apiKeyId;

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
        const exposedVictimKeyId =
          JSON.stringify(crossTenantPayload).includes(victimKeyId);
        expect(exposedVictimKeyId).toBe(false);
        expect(JSON.stringify(crossTenantPayload)).toContain(
          "TENANT_SCOPE_MISMATCH",
        );

        // 5. CROSS-TENANT MUTATIONS VERIFICATION
        // Capture DB state before attacks
        const dbStateBeforeAttacks = (
          await repository.loadState()
        ).apiKeys.filter(
          (k: StoredTenantApiKeyRecord) => k.tenantId === victimTenantId,
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
        expect(JSON.stringify(crossIssuePayload)).toContain(
          "TENANT_SCOPE_MISMATCH",
        );

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
        expect(JSON.stringify(crossRotatePayload)).toContain(
          "TENANT_SCOPE_MISMATCH",
        );

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
        expect(JSON.stringify(crossRevokePayload)).toContain(
          "TENANT_SCOPE_MISMATCH",
        );

        // DB state for victim tenant remains untouched by cross-tenant attacks (complete record comparison)
        const dbStateAfterAttacks = (
          await repository.loadState()
        ).apiKeys.filter(
          (k: StoredTenantApiKeyRecord) => k.tenantId === victimTenantId,
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
        const postWithProof = async (
          path: string,
          body: Record<string, unknown>,
        ) => {
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
          const json = (await response.json()) as {
            data: Record<string, unknown>;
          };
          return json.data;
        };

        const created = (await postWithProof("", {
          keyName: "HTTP Lifecycle Key",
          scopes: ["tenant:read"],
        })) as {
          api_key?: { api_key_id?: string };
          apiKey?: { apiKeyId?: string };
        };
        const createdId =
          created.api_key?.api_key_id ?? created.apiKey?.apiKeyId;
        expect(createdId).toBeDefined();

        const rotated = (await postWithProof(`/${createdId}/rotate`, {
          keyName: "HTTP Rotated Key",
          overlapDays: 7,
        })) as {
          api_key?: { api_key_id?: string };
          apiKey?: { apiKeyId?: string };
        };
        const rotatedId =
          rotated.api_key?.api_key_id ?? rotated.apiKey?.apiKeyId;
        expect(rotatedId).toBeDefined();

        // Verify intermediate lifecycle state right after rotation, before
        // the new key's own explicit revoke below: the newly issued key is
        // live, the rotated-from key holds its overlap window, and rotation
        // legitimately retires every other still-live credential on this
        // tenant (the pre-existing victim key from the attack phase) under
        // the single-live-credential rotation policy in
        // TenantPartnerService#rotateApiKey. This is a distinct, later,
        // same-tenant mutation and does not affect the attack-phase
        // immutability already proven by `dbStateAfterAttacks` above.
        const stateAfterRotate = (
          await repository.loadState()
        ).apiKeys.filter(
          (k: StoredTenantApiKeyRecord) => k.tenantId === victimTenantId,
        );
        const rotatedKeyAfterRotate = stateAfterRotate.find(
          (k: StoredTenantApiKeyRecord) => k.apiKeyId === rotatedId,
        );
        expect(rotatedKeyAfterRotate?.status).toBe("active");
        expect(rotatedKeyAfterRotate?.revokedAt).toBeNull();
        const createdKeyAfterRotate = stateAfterRotate.find(
          (k: StoredTenantApiKeyRecord) => k.apiKeyId === createdId,
        );
        expect(createdKeyAfterRotate?.status).toBe("overlap_active");
        const victimKeyAfterRotate = stateAfterRotate.find(
          (k: StoredTenantApiKeyRecord) => k.apiKeyId === victimKeyId,
        );
        expect(victimKeyAfterRotate?.status).toBe("revoked");
        expect(victimKeyAfterRotate?.revokeReason).toBe("credential_rotated");
        expect(victimKeyAfterRotate?.revokedAt).not.toBeNull();

        await postWithProof(`/${rotatedId}/revoke`, {});

        // Verify SQL persistence and record state (active, overlap_active, revoked)
        interface Phase1ApiKeyRow {
          api_key_id: string;
          tenant_id: string;
          revoked_at: string | null;
          created_at: string;
          record: StoredTenantApiKeyRecord;
        }

        const persisted = (await db.query(
          "SELECT api_key_id, tenant_id, revoked_at, created_at, record FROM admin.phase1_tenant_api_keys WHERE tenant_id = $1 ORDER BY created_at ASC",
          [victimTenantId],
        )) as { rows: Phase1ApiKeyRow[] };
        expect(persisted.rows.length).toBeGreaterThanOrEqual(3);

        const rowMap = new Map<string, Phase1ApiKeyRow>(
          persisted.rows.map((r: Phase1ApiKeyRow) => [r.api_key_id, r]),
        );
        expect(rowMap.has(victimKeyId)).toBe(true);
        expect(rowMap.has(createdId!)).toBe(true);
        expect(rowMap.has(rotatedId!)).toBe(true);

        const initialRow = rowMap.get(victimKeyId)!;
        const initialRecord = initialRow.record;
        // Same-tenant rotation above legitimately retired this pre-existing
        // key (see the post-rotate assertions above); assert the exact SQL
        // timestamp/reason of that retirement rather than an untouched
        // "active" state, so a real regression in rotation's retirement
        // logic still fails this test instead of being silently accepted.
        expect(initialRecord.status).toBe("revoked");
        expect(initialRecord.revokeReason).toBe("credential_rotated");
        expect(initialRow.revoked_at).not.toBeNull();

        const createdRow = rowMap.get(createdId!)!;
        const createdRecord = createdRow.record;
        expect(createdRecord.status).toBe("overlap_active");

        const rotatedRow = rowMap.get(rotatedId!)!;
        const rotatedRecord = rotatedRow.record;
        expect(rotatedRecord.status).toBe("revoked");
        expect(rotatedRow.revoked_at).not.toBeNull();

        if (process.env.DRTS_WEBHOOK_AUTH_EVIDENCE) {
          const evidence = {
            baseSha: execFileSync("git", ["rev-parse", "HEAD"], {
              encoding: "utf8",
            }).trim(),
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
