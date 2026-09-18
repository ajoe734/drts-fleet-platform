// Real Postgres/AppModule fixture seeding for SR-QA-TENANT-001.
//
// TenantPartnerModule (users/addresses/passengers/cost-centers/approval-rules
// /SLA/quota) IS registered in the real root apps/api/src/app.module.ts
// (confirmed by reading app.module.ts's imports array directly), unlike the
// SR-HOST-FE-001 case where HostViewModule had no root registration. There is
// therefore no wiring gap to route around here: this seed boots the real,
// unmodified, compiled full AppModule against a real migrated Postgres — the
// same approach already reviewed and merged for
// tests/e2e/system-remediation/sr-qa-webhook-001-fix-tenant-binding/
// appmodule-tenant-binding.test.ts, which seeds tenant admin sessions through
// this exact TenantPartnerService/JwtAuthService call shape. This file reuses
// that shape rather than reinventing it, and adds one more persona
// (tenant_viewer, which the IAM policy catalog grants tenant:sla:read without
// tenant:sla:write) so the SLA acceptance spec can assert an authenticated
// read-only rejection on write, not merely an authentication failure.
//
// All classes are loaded from the compiled apps/api/dist/ output (built once
// by the dedicated workflow), never reimplemented here, so the
// guard/service/repository behavior under test is the actual candidate
// product code.

import { createRequire } from "node:module";
import { existsSync, appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const API_DIR = path.resolve(REPO_ROOT, "apps/api");
const API_DIST = path.resolve(API_DIR, "dist");

interface JwtSignIdentityLike {
  authMode: "jwt_bearer";
  actorType: string;
  actorId: string;
  principalId: string;
  realm: string;
  tenantId: string | null;
  roleFamilies: string[];
  roles: string[];
  scopes: string[];
  tokenVersion: number;
  requestId: null;
  sessionId: string;
  authTime: string;
  amr?: string[];
  acr?: string;
}

export interface TenantUatFixtures {
  tenantA: string;
  tenantB: string;
  tokenA: string;
  tokenB: string;
  tokenReadonlyA: string;
  tokenPlatform: string;
  /** Disposable mailbox received by the actual GitHub-hosted Mailpit SMTP service. */
  userEmail: string;
}

/**
 * Seeds two disposable tenants (A, B) each with an active tenant_admin user
 * and mints real, durable-state-valid JWTs for them, plus a third read-only
 * (tenant_viewer) session scoped to tenant A. Every write goes through the
 * authoritative TenantPartnerService — no table is written to directly and
 * no identity/session check is bypassed.
 */
export async function seedTenantUatFixtures(): Promise<TenantUatFixtures> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL must be set for SR-QA-TENANT-001 acceptance seeding.",
    );
  }

  const apiRequire = createRequire(path.resolve(API_DIR, "package.json"));
  apiRequire("reflect-metadata");
  const { NestFactory } = apiRequire("@nestjs/core") as {
    NestFactory: {
      createApplicationContext(
        moduleCls: unknown,
        options?: { logger?: boolean },
      ): Promise<{
        get<T = unknown>(token: unknown): T;
        close(): Promise<void>;
      }>;
    };
  };
  const { AppModule } = apiRequire("./dist/app.module.js") as {
    AppModule: unknown;
  };
  const { JwtAuthService } = apiRequire(
    "./dist/common/auth/jwt-auth.service.js",
  ) as { JwtAuthService: unknown };
  const { TenantPartnerService } = apiRequire(
    "./dist/modules/tenant-partner/tenant-partner.service.js",
  ) as { TenantPartnerService: unknown };
  const { TenantsService } = apiRequire(
    "./dist/modules/platform-admin/tenants.service.js",
  ) as { TenantsService: unknown };
  const { DatabaseService } = apiRequire(
    "./dist/common/db/database.service.js",
  ) as { DatabaseService: unknown };
  const { getTenantRoleScopes } = apiRequire(
    "./dist/common/auth/auth.constants.js",
  ) as { getTenantRoleScopes: (roleCode: string) => readonly string[] | null };

  const appCtx = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const jwt = appCtx.get(JwtAuthService) as {
      issueSessionToken(
        identity: JwtSignIdentityLike,
        options: Record<string, unknown>,
      ): Promise<{ token: string }>;
    };
    const service = appCtx.get(TenantPartnerService) as {
      createTenantUser(
        tenantId: string,
        command: { email: string; displayName: string; roleCode: string },
        requestId?: string,
        identity?: unknown,
      ): Promise<{ userId: string }>;
      updateTenantUserRole(
        tenantId: string,
        userId: string,
        command: { roleCode: string; status?: string },
        requestId?: string,
        identity?: unknown,
      ): unknown;
      findTenantUser(
        tenantId: string,
        userId: string,
      ): { userId: string; roleCode: string; updatedAt: string } | undefined;
    };

    const bootstrapIdentity = {
      actorType: "system" as const,
      actorId: "qa-tenant-uat-harness-bootstrap",
      realm: "system" as const,
      authMode: "bootstrap_headers" as const,
      roleFamilies: ["platform" as const],
      roles: [],
      scopes: ["foundation:read", "foundation:write"],
      tenantId: null,
    };

    // iam.identity_invitations.issuer_principal_id has a real FK to
    // iam.identity_principals; the bootstrap actor must be a registered
    // principal before it can issue the tenant-user invitations created by
    // seedActiveTenantUser below (same requirement documented in
    // appmodule-tenant-binding.test.ts).
    const platformSession = await jwt.issueSessionToken(
      {
        ...bootstrapIdentity,
        authMode: "jwt_bearer",
        amr: ["mfa", "totp"],
        acr: "aal2",
      } as never,
      {
        principalId: bootstrapIdentity.actorId,
        subject: `system:${bootstrapIdentity.actorId}`,
        amr: ["mfa", "totp"],
        acr: "aal2",
        ensurePrincipal: true,
        sessionId: `sid-bootstrap-${randomUUID()}`,
        authTime: new Date().toISOString(),
      },
    );

    const seedActiveTenantUser = async (
      tenantId: string,
      label: string,
      roleCode: string,
    ) => {
      const email = `${label}-${randomUUID()}@qa-tenant-uat.example`;
      const created = await service.createTenantUser(
        tenantId,
        { email, displayName: `QA ${label}`, roleCode },
        `req-qa-tenant-uat-${label}-seed-${randomUUID()}`,
        bootstrapIdentity,
      );
      await service.updateTenantUserRole(
        tenantId,
        created.userId,
        { roleCode, status: "active" },
        `req-qa-tenant-uat-${label}-activate-${randomUUID()}`,
        bootstrapIdentity,
      );
      const user = service.findTenantUser(tenantId, created.userId);
      if (!user) {
        throw new Error(
          `SR-QA-TENANT-001 seed: failed to re-read seeded user ${created.userId} for tenant ${tenantId}`,
        );
      }
      return user;
    };

    const mintSession = async (
      tenantId: string,
      user: { userId: string; roleCode: string; updatedAt: string },
    ) => {
      const scopes = getTenantRoleScopes(user.roleCode);
      if (!scopes) {
        throw new Error(
          `SR-QA-TENANT-001 seed: no scope preset for roleCode ${user.roleCode}`,
        );
      }
      const now = new Date().toISOString();
      const sessionId = `sid-qa-tenant-uat-${randomUUID()}`;
      const issued = await jwt.issueSessionToken(
        {
          authMode: "jwt_bearer",
          actorType: "tenant_admin",
          actorId: user.userId,
          principalId: user.userId,
          realm: "tenant",
          tenantId,
          roleFamilies: ["tenant"],
          roles: [user.roleCode],
          scopes: [...scopes],
          tokenVersion: Date.parse(user.updatedAt),
          requestId: null,
          sessionId,
          authTime: now,
          amr: ["mfa", "totp"],
          acr: "aal2",
        },
        {
          principalId: user.userId,
          subject: `tenant:${user.userId}`,
          ensurePrincipal: true,
          sessionId,
          authTime: now,
          amr: ["mfa", "totp"],
          acr: "aal2",
        },
      );
      return issued.token;
    };

    const tenants = appCtx.get(TenantsService) as {
      create(command: { name: string; code: string }): { id: string };
    };
    const db = appCtx.get(DatabaseService) as {
      query(sql: string, parameters: unknown[]): Promise<{ rows: unknown[] }>;
    };
    const tenantA = tenants.create({
      name: "QA Tenant A",
      code: `qa-a-${randomUUID()}`,
    }).id;
    const tenantB = tenants.create({
      name: "QA Tenant B",
      code: `qa-b-${randomUUID()}`,
    }).id;
    // Await actual persisted resources before starting the separate HTTP server.
    for (const tenant of [tenantA, tenantB]) {
      let durable = false;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const result = await db.query(
          "SELECT tenant_id FROM admin.phase1_platform_tenants WHERE tenant_id = $1",
          [tenant],
        );
        if (result.rows.length === 1) {
          durable = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!durable) throw new Error("Tenant fixture did not persist");
    }

    const adminA = await seedActiveTenantUser(
      tenantA,
      "admin-a",
      "tenant_admin",
    );
    const adminB = await seedActiveTenantUser(
      tenantB,
      "admin-b",
      "tenant_admin",
    );
    const readonlyA = await seedActiveTenantUser(
      tenantA,
      "readonly-a",
      "tenant_viewer",
    );

    const tokenA = await mintSession(tenantA, adminA);
    const tokenB = await mintSession(tenantB, adminB);
    const tokenReadonlyA = await mintSession(tenantA, readonlyA);

    return {
      tenantA,
      tenantB,
      tokenA,
      tokenB,
      tokenReadonlyA,
      tokenPlatform: platformSession.token,
      userEmail: `sr-qa-tenant-001-${randomUUID()}@qa-tenant-uat.example`,
    };
  } finally {
    await appCtx.close();
  }
}

function writeGithubEnv(fixtures: TenantUatFixtures): void {
  const identities = Object.entries({
    adminA: fixtures.tokenA,
    adminB: fixtures.tokenB,
    readonlyA: fixtures.tokenReadonlyA,
    platform: fixtures.tokenPlatform,
  }).map(([role, token]) => {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"),
    ) as { exp?: number; sub?: string };
    if (!payload.exp || payload.exp * 1000 <= Date.now())
      throw new Error("Seeded session is already expired");
    return {
      role,
      principalSubject: payload.sub,
      expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
  });
  const directory = path.resolve(REPO_ROOT, ".artifacts/tenant-uat-acceptance");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    path.join(directory, "identity-fixtures.json"),
    JSON.stringify(
      {
        candidateSha: process.env.CANDIDATE_SHA,
        tenantA: fixtures.tenantA,
        tenantB: fixtures.tenantB,
        identities,
      },
      null,
      2,
    ),
  );
  const lines = [
    `DRTS_UAT_TENANT_A=${fixtures.tenantA}`,
    `DRTS_UAT_TENANT_B=${fixtures.tenantB}`,
    `DRTS_UAT_TOKEN_A=${fixtures.tokenA}`,
    `DRTS_UAT_TOKEN_B=${fixtures.tokenB}`,
    `DRTS_UAT_TOKEN_READONLY_A=${fixtures.tokenReadonlyA}`,
    `DRTS_UAT_TOKEN_PLATFORM=${fixtures.tokenPlatform}`,
    `DRTS_UAT_USER_EMAIL=${fixtures.userEmail}`,
  ];
  const githubEnvPath = process.env.GITHUB_ENV;
  if (githubEnvPath) {
    for (const token of [
      fixtures.tokenA,
      fixtures.tokenB,
      fixtures.tokenReadonlyA,
      fixtures.tokenPlatform,
    ]) {
      console.log(`::add-mask::${token}`);
    }
    appendFileSync(githubEnvPath, lines.join("\n") + "\n");
  }
  for (const line of lines) {
    // Never print the bearer tokens to the job log; only the env var names
    // that were set, matching the harness's PII/secret redaction posture.
    const [key] = line.split("=", 1);
    console.log(`Seeded ${key}`);
  }
}

async function main() {
  if (!existsSync(path.resolve(API_DIST, "app.module.js"))) {
    throw new Error("Build the immutable candidate before seeding");
  }
  const fixtures = await seedTenantUatFixtures();
  writeGithubEnv(fixtures);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
