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
  it("promotes the snapshot as a tree commit on main instead of a history merge", () => {
    // Every promotion lands as a squash, so main and dev share no recent
    // history and a merge of the publish branch head conflicts on everything
    // both sides touched since the old merge-base (41 files by 2026-09-21).
    // The gate therefore builds ONE commit: parent = main HEAD, tree = the
    // snapshot. Its merge-base is main, so it cannot conflict.
    const source = workflow();
    const reconciliationGate = source.indexOf("- name: Reconciliation gate");
    const openPromotePr = source.indexOf("- name: Open promote PR");
    const gate = source.slice(reconciliationGate, openPromotePr);

    expect(reconciliationGate).toBeGreaterThan(-1);
    expect(reconciliationGate).toBeLessThan(openPromotePr);
    expect(gate).not.toContain("git merge-tree");
    expect(gate).toContain('git read-tree "$sha"');
    expect(gate).toContain('git commit-tree "$tree" -p "$main_sha"');
    expect(gate).toContain('promote_branch="promote/$ver"');
    expect(gate).toContain("immutable publish branches are never rewritten");
    expect(gate).toContain('echo "promote_sha=$promote_sha" >> "$GITHUB_OUTPUT"');
    expect(source).toContain("steps.reconcile.outputs.skip != 'true'");
  });

  it("keeps main's guarded dashboard mirror files when the snapshot differs", () => {
    // The runbook's §4.2 rule: a tree replacement must not clobber the five
    // generated mirror files that main is allowed to carry differently.
    const source = workflow();
    const gate = source.slice(
      source.indexOf("- name: Reconciliation gate"),
      source.indexOf("- name: Open promote PR"),
    );

    for (const file of [
      "ai-status.json",
      "ai-activity-log.jsonl",
      "current-work.md",
      "orchestrator-state.json",
      "approval-queue.json",
    ]) {
      expect(gate).toContain(file);
    }
    expect(gate).toContain('path="tools/development-orchestrator/dashboard/$f"');
    expect(gate).toContain('git update-index --cacheinfo "100644,$blob,$path"');
  });

  it("opens, checks and merges the promote commit, never the publish head", () => {
    const source = workflow();
    const openPromotePr = source.slice(
      source.indexOf("- name: Open promote PR"),
      source.indexOf("- name: Publish required checks on promote SHA"),
    );
    const publishChecks = source.slice(
      source.indexOf("- name: Publish required checks on promote SHA"),
      source.indexOf("- name: Wait for required PR checks to register"),
    );

    expect(openPromotePr).toContain('--head "$promote_branch"');
    expect(openPromotePr).not.toContain('--head "$src"');
    expect(publishChecks).toContain('sha="${{ steps.reconcile.outputs.promote_sha }}"');
    expect(publishChecks).not.toContain('sha="${{ steps.pick.outputs.sha }}"');
    // A PAT is what lets the promote branch carry dev's workflow edits.
    expect(source).toContain("token: ${{ secrets.PUBLISH_TOKEN || secrets.GITHUB_TOKEN }}");
  });

  it("waits on what branch protection reads, not on who published the check", () => {
    // Two attempts to tie the wait to this run both timed out with three green
    // checks on the PR: details_url (GitHub stores the check run's own URL and
    // discards ours) and the ids create_check returned (assigned to an array
    // inside $(...), so only ever set in a subshell). With a reproducible
    // promote commit the question is simply whether the required names are
    // green on this head.
    const source = workflow();
    const wait = source.slice(
      source.indexOf("- name: Wait for required PR checks to register"),
      source.indexOf("- name: Merge inline"),
    );

    expect(wait).toContain("map(select(.name == $n)) | last // empty");
    expect(wait).not.toContain(".detailsUrl");
    expect(wait).not.toContain("check_ids");
    expect(wait).toContain('required=("Commit trailers" "Runtime mirror guard" "Smoke acceptance")');
    expect(wait).toContain('if [ "$status" != "COMPLETED" ]');
    expect(wait).toContain('elif [ "$conclusion" != "SUCCESS" ]');
  });

  it("builds a reproducible promote commit so a retry keeps the checks it already has", () => {
    const source = workflow();
    const gate = source.slice(
      source.indexOf("- name: Reconciliation gate"),
      source.indexOf("- name: Open promote PR"),
    );
    const publishChecks = source.slice(
      source.indexOf("- name: Publish required checks on promote SHA"),
      source.indexOf("- name: Wait for required PR checks to register"),
    );

    expect(gate).toContain('snapshot_date=$(git log -1 --format=%cI "$sha")');
    expect(gate).toContain('GIT_AUTHOR_DATE="$snapshot_date" GIT_COMMITTER_DATE="$snapshot_date"');
    // …and having made it reproducible, do not pay ten minutes to re-derive
    // checks that already passed on this very SHA.
    expect(publishChecks).toContain("are already green on ${sha:0:12}; reusing them.");
    expect(publishChecks).toContain('repos/$GITHUB_REPOSITORY/commits/$sha/check-runs');
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
