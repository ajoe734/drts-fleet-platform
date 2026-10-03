import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

// Keep the production Python workflow gate's regression checks in the ordinary
// CI Vitest discovery path as well as the manually dispatched live workflow.
it("rejects missing, partial, skipped and mismatched evidence (26 Python cases)", () => {
  const result = spawnSync(
    "python3",
    ["tests/unit/system-remediation/sr-live-map-001/evidence_gate_checks.py"],
    { encoding: "utf8" },
  );
  expect(result.stderr).toContain("Ran 26 tests");
  expect(result.status, result.stderr).toBe(0);
});

it("the real tsx entrypoint loads the production oracle and rejects absent authorization before networking", () => {
  const result = spawnSync(
    "./apps/api/node_modules/.bin/tsx",
    [
      "--tsconfig",
      "tests/e2e/system-remediation/sr-live-map-001/tsconfig.live.json",
      "tests/e2e/system-remediation/sr-live-map-001/coverage-runner.ts",
      "--preflight",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DRTS_LIVE_MAP_TEST_AUTHORIZED: "false" },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr.trim()).toBe(
    'DRTS_LIVE_MAP_TEST_AUTHORIZED must equal "true"',
  );
});
