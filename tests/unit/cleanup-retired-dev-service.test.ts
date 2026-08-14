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
const cleanupScript = path.join(
  repoRoot,
  "operations/deployment/cleanup-retired-dev-service.sh",
);
const deployWorkflow = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const temporaryDirectories: string[] = [];

const intendedServices = [
  "drts-dev-api",
  "drts-dev-platform-admin-web",
  "drts-dev-ops-console-web",
  "drts-dev-fleet-partner-portal-web",
  "drts-dev-tenant-console-web",
  "drts-dev-bank-console-web",
  "drts-dev-referral-embed-web",
  "drts-dev-enterprise-dispatch-web",
  "drts-channel-partner-portal-web",
] as const;
const retiredService = "drts-passenger-web";

function runCleanup(action: string, inventory: readonly string[] = []) {
  const directory = mkdtempSync(path.join(tmpdir(), "retired-service-test-"));
  temporaryDirectories.push(directory);

  const binDirectory = path.join(directory, "bin");
  mkdirSync(binDirectory);
  const commandLogFile = path.join(directory, "gcloud.log");
  writeFileSync(commandLogFile, "");

  const mockGcloud = path.join(binDirectory, "gcloud");
  writeFileSync(
    mockGcloud,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_GCLOUD_LOG_FILE"

if [[ "$*" == *"run services list"* ]]; then
  printf '%s\n' "$MOCK_CLOUD_RUN_INVENTORY"
  exit 0
fi

if [[ "$*" == *"run services delete"* ]]; then
  exit 0
fi

echo "unexpected gcloud command: $*" >&2
exit 99
`,
  );
  chmodSync(mockGcloud, 0o755);

  const result = spawnSync(
    "bash",
    [cleanupScript, action, "drts-dev-ray-tw-20260730", "us-central1"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
        MOCK_CLOUD_RUN_INVENTORY: inventory.join("\n"),
        MOCK_GCLOUD_LOG_FILE: commandLogFile,
      },
    },
  );

  const commands = readFileSync(commandLogFile, "utf8")
    .split("\n")
    .filter(Boolean);

  return { ...result, commands };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("retired Cloud Run service cleanup", () => {
  it("wires the exact workflow_dispatch choices and calls the guarded helper", () => {
    const source = readFileSync(deployWorkflow, "utf8");

    expect(source).toMatch(
      /retired_service_cleanup:\n[\s\S]*?default: "none"[\s\S]*?options:\n\s+- "none"\n\s+- "delete-drts-passenger-web"/,
    );
    expect(source).toContain(
      "./operations/deployment/cleanup-retired-dev-service.sh",
    );
    expect(source).toContain(
      "RETIRED_SERVICE_CLEANUP: ${{ inputs.retired_service_cleanup || 'none' }}",
    );
    const uiSmokeJob = source.indexOf("\n  ui-smoke:");
    const cleanupJob = source.indexOf("\n  retired-service-cleanup:");
    expect(uiSmokeJob).toBeGreaterThan(-1);
    expect(cleanupJob).toBeGreaterThan(uiSmokeJob);
    expect(source.slice(uiSmokeJob, cleanupJob)).toContain(
      "needs: [prepare, health-check]",
    );
    expect(source.slice(cleanupJob)).toContain(
      "needs: [prepare, health-check, ui-smoke]",
    );
    expect(source.slice(cleanupJob)).toContain(
      "needs.ui-smoke.result == 'success'",
    );
    expect(
      source
        .split("\n")
        .filter((line) => line.includes("passenger-web"))
        .map((line) => line.trim()),
    ).toEqual([
      'description: "Fail-closed cleanup for the retired passenger service. Delete is allowed only when the regional Cloud Run inventory is exactly the intended 9 active services plus drts-passenger-web."',
      '- "delete-drts-passenger-web"',
      'export DRTS_DEV_PASSENGER_BASE_URL="https://drts-dev-passenger-web-${cloud_run_suffix}"',
    ]);
    expect(source).toContain(
      'export DRTS_DEV_CONCIERGE_BASE_URL="https://drts-dev-concierge-portal-web-${cloud_run_suffix}"',
    );
  });

  it("does not query or delete anything for none", () => {
    const result = runCleanup("none");

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([]);
    expect(result.stdout).toContain("cleanup disabled");
  });

  it("deletes exactly drts-passenger-web only for the exact allowed inventory", () => {
    const result = runCleanup("delete-drts-passenger-web", [
      retiredService,
      ...[...intendedServices].reverse(),
    ]);

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "run services list --platform=managed --region us-central1 --project drts-dev-ray-tw-20260730 --format=value(metadata.name)",
      "run services delete drts-passenger-web --platform=managed --region us-central1 --project drts-dev-ray-tw-20260730 --quiet",
    ]);
  });

  it.each(intendedServices)(
    "fails closed when intended service %s is missing",
    (missingService) => {
      const result = runCleanup("delete-drts-passenger-web", [
        ...intendedServices.filter((service) => service !== missingService),
        retiredService,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing services:");
      expect(result.stderr).toContain(missingService);
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toContain("run services list");
    },
  );

  it("fails closed when Concierge is present", () => {
    const result = runCleanup("delete-drts-passenger-web", [
      ...intendedServices,
      retiredService,
      "drts-concierge-portal-web",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected services:");
    expect(result.stderr).toContain("drts-concierge-portal-web");
    expect(result.commands).toHaveLength(1);
  });

  it("fails closed when any other extra service is present", () => {
    const result = runCleanup("delete-drts-passenger-web", [
      ...intendedServices,
      retiredService,
      "drts-dev-unexpected-web",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("drts-dev-unexpected-web");
    expect(result.commands).toHaveLength(1);
  });

  it("fails closed when drts-passenger-web is absent", () => {
    const result = runCleanup("delete-drts-passenger-web", intendedServices);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("drts-passenger-web");
    expect(result.commands).toHaveLength(1);
  });

  it("rejects unsupported actions without calling gcloud", () => {
    const result = runCleanup("delete-something-else", [
      ...intendedServices,
      retiredService,
    ]);

    expect(result.status).toBe(2);
    expect(result.commands).toEqual([]);
  });
});
