import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

describe("deployment architecture guards", () => {
  it("keeps tenant acceptance users under the migration chain only", () => {
    const seedMigration = readFileSync(
      path.join(
        repoRoot,
        "infra/migrations/V0029__tenant_user_roles_demo_seed.sql",
      ),
      "utf8",
    );
    const reconciliationMigration = readFileSync(
      path.join(
        repoRoot,
        "infra/migrations/V0085__reconcile_tenant_acceptance_roles.sql",
      ),
      "utf8",
    );
    const demoSeed = readFileSync(
      path.join(repoRoot, "infra/seeds/S0002__demo_operational_seed.sql"),
      "utf8",
    );

    for (const actorId of [
      "10000000-0000-0000-0000-000000000901",
      "10000000-0000-0000-0000-000000000902",
    ]) {
      expect(seedMigration).toContain(actorId);
      expect(reconciliationMigration).toContain(actorId);
      expect(demoSeed).not.toContain(actorId);
    }
  });

  it("gives Cloud Run revisions a bounded cold-start readiness window", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );

    expect(workflow).toContain("--retry-all-errors");
    expect(workflow).toContain("--retry 10");
  });

  it("consumes the canonical snake-case auth session wire contract", () => {
    const verifier = readFileSync(
      path.join(
        repoRoot,
        "apps/tenant-console-web/lib/auth/verified-tenant-session.server.ts",
      ),
      "utf8",
    );
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );

    expect(verifier).toContain("identity?.tenant_id");
    expect(verifier).not.toContain("identity?.tenantId");
    expect(workflow).toContain(".data.identity.tenant_id == $tenant_id");
    expect(workflow).not.toContain(".data.identity.tenantId");
  });

  it("does not use network-idle as an operational readiness signal", () => {
    const acceptance = readFileSync(
      path.join(repoRoot, "tests/e2e/operational-browser-acceptance.spec.ts"),
      "utf8",
    );

    expect(acceptance).not.toContain("networkidle");
  });
});
