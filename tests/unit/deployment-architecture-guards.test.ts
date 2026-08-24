import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

describe("deployment architecture guards", () => {
  it("keeps tenant acceptance users under the migration chain only", () => {
    const migration = readFileSync(
      path.join(
        repoRoot,
        "infra/migrations/V0029__tenant_user_roles_demo_seed.sql",
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
      expect(migration).toContain(actorId);
      expect(demoSeed).not.toContain(actorId);
    }
  });

  it("does not use network-idle as an operational readiness signal", () => {
    const acceptance = readFileSync(
      path.join(repoRoot, "tests/e2e/operational-browser-acceptance.spec.ts"),
      "utf8",
    );

    expect(acceptance).not.toContain("networkidle");
  });
});
