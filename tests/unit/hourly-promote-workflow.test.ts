import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const workflowPath = path.join(
  repoRoot,
  ".github/workflows/hourly-promote.yml",
);

function workflow() {
  return readFileSync(workflowPath, "utf8");
}

describe("hourly publish promotion safety", () => {
  it("rejects conflicting immutable snapshots before opening a promote PR", () => {
    const source = workflow();
    const reconciliationGate = source.indexOf("- name: Reconciliation gate");
    const openPromotePr = source.indexOf("- name: Open promote PR");

    expect(reconciliationGate).toBeGreaterThan(-1);
    expect(reconciliationGate).toBeLessThan(openPromotePr);
    expect(source).toContain('git merge-tree --write-tree origin/main "$sha"');
    expect(source).toContain("immutable publish branches are never rewritten");
    expect(source).toContain("steps.reconcile.outputs.skip != 'true'");
  });

  it("requires the latest exact-SHA dev deployment to be successful", () => {
    const source = workflow();
    const deployGate = source.indexOf("- name: Verified dev deployment gate");
    const openPromotePr = source.indexOf("- name: Open promote PR");

    expect(deployGate).toBeGreaterThan(-1);
    expect(deployGate).toBeLessThan(openPromotePr);
    expect(source).toContain(
      "actions/workflows/deploy-dev.yml/runs?branch=${encoded_branch}&per_page=100",
    );
    expect(source).toContain(
      'select(.head_sha == $sha and .status == "completed")',
    );
    expect(source).toContain("sort_by(.run_started_at)");
    expect(source).toContain('if [ "$conclusion" != "success" ]');
    expect(source).toContain("steps.deployed.outputs.skip != 'true'");
  });

  it("starts and cleans up PostGIS for the inline smoke acceptance", () => {
    const source = workflow();
    const publishChecks = source.slice(
      source.indexOf("- name: Publish required checks on promote SHA"),
      source.indexOf("- name: Wait for required PR checks to register"),
    );
    const databaseStart = publishChecks.indexOf("up -d postgres");
    const smokeRun = publishChecks.indexOf('"Smoke acceptance"');

    expect(databaseStart).toBeGreaterThan(-1);
    expect(databaseStart).toBeLessThan(smokeRun);
    expect(publishChecks).toContain("exec -T postgres pg_isready -U postgres");
    expect(publishChecks).toContain(
      "DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/drts_fleet_platform",
    );
    expect(publishChecks).toContain("down --volumes --remove-orphans");
  });
});
