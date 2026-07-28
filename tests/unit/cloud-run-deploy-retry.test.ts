import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const deployScript = path.join(repoRoot, "scripts/deploy-cloud-run-service.sh");
const temporaryDirectories: string[] = [];

function runDeploy(options: {
  failures: number;
  error: string;
  maxAttempts?: number;
  exitCode?: number;
}) {
  const directory = mkdtempSync(path.join(tmpdir(), "cloud-run-deploy-retry-"));
  temporaryDirectories.push(directory);

  const binDirectory = path.join(directory, "bin");
  const countFile = path.join(directory, "count");
  const mockGcloud = path.join(binDirectory, "gcloud");

  mkdirSync(binDirectory);
  writeFileSync(countFile, "0\n");
  writeFileSync(
    mockGcloud,
    `#!/usr/bin/env bash
set -euo pipefail
count="$(cat "$MOCK_COUNT_FILE")"
count=$((count + 1))
printf '%s\n' "$count" >"$MOCK_COUNT_FILE"
if ((count <= MOCK_FAILURES)); then
  printf '%s\n' "$MOCK_ERROR" >&2
  exit "$MOCK_EXIT_CODE"
fi
printf 'deployed %s\n' "$*"
`,
  );
  chmodSync(mockGcloud, 0o755);

  const result = spawnSync(
    "bash",
    [deployScript, "drts-dev-api", "--region", "us-central1"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
        MOCK_COUNT_FILE: countFile,
        MOCK_FAILURES: String(options.failures),
        MOCK_ERROR: options.error,
        MOCK_EXIT_CODE: String(options.exitCode ?? 1),
        CLOUD_RUN_DEPLOY_RETRY_MAX_ATTEMPTS: String(options.maxAttempts ?? 8),
        CLOUD_RUN_DEPLOY_RETRY_BASE_DELAY_SECONDS: "0",
        CLOUD_RUN_DEPLOY_RETRY_MAX_DELAY_SECONDS: "0",
      },
    },
  );

  return {
    ...result,
    attempts: Number(readFileSync(countFile, "utf8").trim()),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cloud Run deploy quota retry", () => {
  it("retries regional CPU quota failures and preserves deploy arguments", () => {
    const result = runDeploy({
      failures: 2,
      error:
        "ERROR: Quota exceeded for total allowable CPU per project per region.",
    });

    expect(result.status).toBe(0);
    expect(result.attempts).toBe(3);
    expect(result.stdout).toContain("attempt 2/8");
    expect(result.stdout).toContain(
      "deployed run deploy drts-dev-api --region us-central1",
    );
  });

  it("does not retry unrelated deployment failures", () => {
    const result = runDeploy({
      failures: 5,
      error: "ERROR: Revision failed to become ready.",
      exitCode: 17,
    });

    expect(result.status).toBe(17);
    expect(result.attempts).toBe(1);
    expect(result.stdout).not.toContain("retrying deploy");
  });

  it("returns the deployment failure after the quota retry limit", () => {
    const result = runDeploy({
      failures: 5,
      error:
        "ERROR: Quota exceeded for total allowable CPU per project per region.",
      maxAttempts: 3,
    });

    expect(result.status).toBe(1);
    expect(result.attempts).toBe(3);
  });

  it("routes every dev service deployment through the retry wrapper", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );

    expect(
      workflow.match(/scripts\/deploy-cloud-run-service\.sh/g),
    ).toHaveLength(12);
    expect(workflow).not.toMatch(/^\s+gcloud run deploy/m);
  });

  it("keeps every dev web revision usable within the low-quota profile", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );

    const webSteps = [
      "platform-admin-web",
      "ops-console-web",
      "fleet-partner-portal-web",
      "tenant-console-web",
      "bank-console-web",
      "referral-embed-web",
      "concierge-portal-web",
      "passenger-web",
      "partner-booking-web",
      "enterprise-dispatch-web",
      "channel-partner-portal-web",
    ];

    for (const step of webSteps) {
      const start = workflow.indexOf(`- name: Deploy — ${step}`);
      const end = workflow.indexOf("\n      - name:", start + 1);
      const block = workflow.slice(start, end);

      expect(start, `${step} deploy step`).toBeGreaterThan(-1);
      expect(block, step).toContain("--cpu 1");
      expect(block, step).toContain("--concurrency 80");
      expect(block, step).toContain("--execution-environment gen1");
      expect(block, step).toContain("--no-cpu-boost");
      expect(block, step).toContain("--max-instances 1");
      expect(block, step).not.toContain("--no-deploy-health-check");
    }

    const apiStart = workflow.indexOf("- name: Deploy — api");
    const apiEnd = workflow.indexOf("\n      - name:", apiStart + 1);
    expect(workflow.slice(apiStart, apiEnd)).not.toContain("--concurrency 80");
  });

  it("runs focused business-flow smoke before the high-volume matrix", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );
    const uiSmokeStart = workflow.indexOf(
      "- name: Run UI smoke against deployed dev",
    );
    const uiSmokeEnd = workflow.indexOf(
      "- name: Upload Playwright report on failure",
      uiSmokeStart,
    );
    const uiSmoke = workflow.slice(uiSmokeStart, uiSmokeEnd);
    const matrixIndex = uiSmoke.indexOf(
      "playwright.dev-runtime-matrix.config.ts",
    );
    const googleMapIndex = uiSmoke.indexOf(
      "playwright.google-map-live.config.ts",
    );

    expect(googleMapIndex).toBeGreaterThan(-1);
    expect(matrixIndex).toBeGreaterThan(
      uiSmoke.indexOf("playwright.ops-console-parity.config.ts"),
    );
    expect(matrixIndex).toBeGreaterThan(
      uiSmoke.indexOf("playwright.partner-booking-surfaces.config.ts"),
    );
    expect(matrixIndex).toBeGreaterThan(googleMapIndex);
    expect(uiSmoke).toContain("smoke_status=0");
    expect(uiSmoke).toContain(
      'PLAYWRIGHT_HTML_OUTPUT_DIR="playwright-report/${suite}"',
    );
    expect(uiSmoke).toContain("--reporter=list,html");
    expect(uiSmoke).toContain('--output "test-results/${suite}"');
    expect(uiSmoke).toContain('exit "${smoke_status}"');
    expect(uiSmoke.match(/run_suite playwright\./g)).toHaveLength(12);
    expect(workflow).not.toContain(
      "Authenticate to GCP for failure diagnostics",
    );
    expect(workflow).not.toContain("gcloud logging read");
  });
});
