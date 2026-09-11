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
// All classes are loaded from the compiled apps/api/dist/ output (built by
// buildTenantUatAcceptanceCandidate below), never reimplemented here, so the
// guard/service/repository behavior under test is the actual candidate
// product code.

import { createRequire } from "node:module";
import { existsSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const API_DIR = path.resolve(REPO_ROOT, "apps/api");
const API_DIST = path.resolve(API_DIR, "dist");

export function buildTenantUatAcceptanceCandidate(): void {
  execFileSync("pnpm", ["--filter", "@drts/api...", "build"], {
    cwd: REPO_ROOT,
    stdio: "pipe",
    timeout: 180_000,
  });
  const distAppModulePath = path.resolve(API_DIST, "app.module.js");
  if (!existsSync(distAppModulePath)) {
    throw new Error(
      `Candidate compiled build not found at ${distAppModulePath}. Run 'pnpm --filter @drts/api build' before seeding SR-QA-TENANT-001 acceptance fixtures.`,
    );
  }
}

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
  /** Fictional, undeliverable-by-design mailbox for the users.spec.ts create-user case; CI has no real receiver, see docs/04-uat/.../SR-QA-TENANT-001.md */
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
      ): Promise<{ get<T = unknown>(token: unknown): T; close(): Promise<void> }>;
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
      scopes: [],
      tenantId: null,
    };

    // iam.identity_invitations.issuer_principal_id has a real FK to
    // iam.identity_principals; the bootstrap actor must be a registered
    // principal before it can issue the tenant-user invitations created by
    // seedActiveTenantUser below (same requirement documented in
    // appmodule-tenant-binding.test.ts).
    await jwt.issueSessionToken(bootstrapIdentity as never, {
      principalId: bootstrapIdentity.actorId,
      subject: `system:${bootstrapIdentity.actorId}`,
      ensurePrincipal: true,
      sessionId: `sid-bootstrap-${randomUUID()}`,
      authTime: new Date().toISOString(),
    });

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

    const tenantA = `qa-tenant-uat-a-${randomUUID()}`;
    const tenantB = `qa-tenant-uat-b-${randomUUID()}`;

    const adminA = await seedActiveTenantUser(tenantA, "admin-a", "tenant_admin");
    const adminB = await seedActiveTenantUser(tenantB, "admin-b", "tenant_admin");
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
      userEmail: `sr-qa-tenant-001-${randomUUID()}@qa-tenant-uat.example`,
    };
  } finally {
    await appCtx.close();
  }
}

function writeGithubEnv(fixtures: TenantUatFixtures): void {
  const lines = [
    `DRTS_UAT_TENANT_A=${fixtures.tenantA}`,
    `DRTS_UAT_TENANT_B=${fixtures.tenantB}`,
    `DRTS_UAT_TOKEN_A=${fixtures.tokenA}`,
    `DRTS_UAT_TOKEN_B=${fixtures.tokenB}`,
    `DRTS_UAT_TOKEN_READONLY_A=${fixtures.tokenReadonlyA}`,
    `DRTS_UAT_USER_EMAIL=${fixtures.userEmail}`,
  ];
  const githubEnvPath = process.env.GITHUB_ENV;
  if (githubEnvPath) {
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
  buildTenantUatAcceptanceCandidate();
  const fixtures = await seedTenantUatFixtures();
  writeGithubEnv(fixtures);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
