import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const harnessPath = path.join(repoRoot, "tests/e2e/run-e2e-hermetic.sh");
const testRoot = mkdtempSync(path.join(os.tmpdir(), "e2e-hermetic-harness-"));

function runHarnessLibrary(
  body: string,
  env: NodeJS.ProcessEnv = {},
): SpawnSyncReturns<string> {
  return spawnSync(
    "bash",
    [
      "-c",
      ["export HERMETIC_HARNESS_LIBRARY_ONLY=1", 'source "$1"', body].join(
        "\n",
      ),
      "bash",
      harnessPath,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "",
        HERMETIC_LOG_DIR: path.join(testRoot, "logs"),
        ...env,
      },
    },
  );
}

afterAll(() => {
  rmSync(testRoot, { force: true, recursive: true });
});

describe("run-e2e-hermetic harness", () => {
  it("derives an isolated database name from the worktree root and honors overrides", () => {
    const defaultResult = runHarnessLibrary(
      'printf "%s\\n%s\\n" "$DATABASE_URL" "$(worktree_db_name)"',
    );
    expect(defaultResult.status).toBe(0);

    const expectedDatabaseName = `drts_fleet_platform_${createHash("sha1")
      .update(repoRoot)
      .digest("hex")
      .slice(0, 8)}`;
    expect(defaultResult.stdout.trim().split("\n")).toEqual([
      `postgresql://postgres:postgres@localhost:5432/${expectedDatabaseName}`,
      expectedDatabaseName,
    ]);

    const explicitDatabaseUrl =
      "postgresql://runner:secret@db.internal:6432/explicit_e2e";
    const overrideResult = runHarnessLibrary('printf "%s\\n" "$DATABASE_URL"', {
      DATABASE_URL: explicitDatabaseUrl,
    });
    expect(overrideResult.status).toBe(0);
    expect(overrideResult.stdout.trim()).toBe(explicitDatabaseUrl);
  });

  it("keeps success and failure logs and reports bounded timeout status", () => {
    const logDir = path.join(testRoot, "durable-logs");
    const result = runHarnessLibrary(
      [
        `run_logged_timeout success 2 "${logDir}/success.log" bash -c 'printf "success-output\\\\n"'`,
        `if run_logged_timeout failure 2 "${logDir}/failure.log" bash -c 'printf "failure-output\\\\n"; exit 7'; then`,
        "  failure_status=0",
        "else",
        "  failure_status=$?",
        "fi",
        "if command -v timeout >/dev/null 2>&1; then",
        `  if run_logged_timeout timeout 1 "${logDir}/timeout.log" bash -c 'sleep 2'; then`,
        "    timeout_status=0",
        "  else",
        "    timeout_status=$?",
        "  fi",
        "else",
        "  timeout_status=unavailable",
        "fi",
        'printf "failure=%s timeout=%s\\n" "$failure_status" "$timeout_status"',
      ].join("\n"),
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("failure=7");
    expect(result.stdout).toMatch(/timeout=(124|unavailable)/);
    expect(readFileSync(path.join(logDir, "success.log"), "utf8")).toBe(
      "success-output\n",
    );
    expect(readFileSync(path.join(logDir, "failure.log"), "utf8")).toBe(
      "failure-output\n",
    );
    expect(existsSync(path.join(logDir, "timeout.log"))).toBe(true);
  }, 10_000);

  it("repairs unhealthy local node_modules only when auto-repair is enabled", () => {
    const helperPath = path.join(testRoot, "node-modules-helper.py");
    const markerPath = path.join(testRoot, "node-modules-repaired");
    writeFileSync(
      helperPath,
      [
        "#!/usr/bin/env python3",
        "import os",
        "import pathlib",
        "import sys",
        "if sys.argv[1] == 'check':",
        "    raise SystemExit(1)",
        "pathlib.Path(os.environ['REPAIR_MARKER']).write_text('repaired\\n')",
      ].join("\n"),
    );
    chmodSync(helperPath, 0o755);

    const repairedResult = runHarnessLibrary("ensure_local_node_modules", {
      HERMETIC_AUTO_REPAIR_NODE_MODULES: "1",
      HERMETIC_NODE_MODULES_HELPER: helperPath,
      REPAIR_MARKER: markerPath,
    });
    expect(repairedResult.status).toBe(0);
    expect(repairedResult.stdout).toContain(
      "repairing local node_modules for this worktree",
    );
    expect(readFileSync(markerPath, "utf8")).toBe("repaired\n");

    rmSync(markerPath);
    const disabledResult = runHarnessLibrary(
      "if ensure_local_node_modules; then exit 99; fi",
      {
        HERMETIC_AUTO_REPAIR_NODE_MODULES: "0",
        HERMETIC_NODE_MODULES_HELPER: helperPath,
        REPAIR_MARKER: markerPath,
      },
    );
    expect(disabledResult.status).toBe(0);
    expect(disabledResult.stdout).toContain(
      "local node_modules health check failed",
    );
    expect(existsSync(markerPath)).toBe(false);
  });

  it("wires migrate, seed, build, and suite commands through bounded durable logs", () => {
    const source = readFileSync(harnessPath, "utf8");

    expect(source).toContain('"$HERMETIC_DB_MIGRATE_TIMEOUT_SECONDS"');
    expect(source).toContain("-db-migrate.log");
    expect(source).toContain('"$HERMETIC_DB_SEED_TIMEOUT_SECONDS"');
    expect(source).toContain("-db-seed.log");
    expect(source).toContain('"$HERMETIC_API_BUILD_TIMEOUT_SECONDS"');
    expect(source).toContain("-api-build.log");
    expect(source).toContain('"$HERMETIC_SUITE_TIMEOUT_SECONDS"');
    expect(source).toContain("-suite.log");
  });
});
