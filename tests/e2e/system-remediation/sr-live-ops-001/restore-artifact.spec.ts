import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

// Hosted acceptance/operator only. No browser fixture or local product server.
// A successful restore run proves neither capacity nor controlled restart.
test("retrieves a successful candidate-bound restore artifact and checks readback and cleanup", () => {
  test.setTimeout(120_000);
  const candidate = process.env.CANDIDATE_SHA ?? "";
  const runId = process.env.OPS_DRILL_RUN_ID ?? "";
  expect(candidate).toMatch(/^[0-9a-f]{40}$/);
  expect(runId).toMatch(/^[0-9]+$/);
  const run = JSON.parse(
    execFileSync(
      "gh",
      ["api", `repos/ajoe734/drts-fleet-platform/actions/runs/${runId}`],
      { encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] },
    ),
  );
  expect(run.path).toBe(".github/workflows/live-ops-restore-drill.yml");
  expect(run.event).toBe("workflow_dispatch");
  expect(run.head_branch).toBe("main");
  expect(run.status).toBe("completed");
  expect(run.conclusion).toBe("success");
  const attempt = String(run.run_attempt);
  expect(attempt).toMatch(/^[1-9][0-9]*$/);
  const folder = mkdtempSync(path.join(tmpdir(), "ops-drill-artifact-"));
  try {
    execFileSync(
      "gh",
      [
        "run",
        "download",
        runId,
        "--repo",
        "ajoe734/drts-fleet-platform",
        "--name",
        `sr-live-ops-${candidate}-${runId}-${attempt}`,
        "--dir",
        folder,
      ],
      { timeout: 45_000, stdio: ["ignore", "pipe", "pipe"] },
    );
    execFileSync(
      "python3",
      [
        "infra/gcp/dev/ops-drill/validate_live_evidence.py",
        "--folder",
        folder,
        "--candidate",
        candidate,
        "--run-id",
        runId,
        "--attempt",
        attempt,
      ],
      { timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] },
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
