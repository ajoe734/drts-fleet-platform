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
  "operations/deployment/cleanup-paused-partner-booking-service.sh",
);
const deployWorkflow = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const genericWebDeployWorkflow = path.join(
  repoRoot,
  ".github/workflows/deploy-web-app.yml",
);
const bankConsoleDeployWorkflow = path.join(
  repoRoot,
  ".github/workflows/deploy-bank-console.yml",
);
const fleetPortalDeployWorkflow = path.join(
  repoRoot,
  ".github/workflows/deploy-fleet-partner-portal.yml",
);
const temporaryDirectories: string[] = [];

const activeServices = [
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
const pausedService = "drts-dev-partner-booking-web";
const retiredService = "drts-passenger-web";

function runCleanup(inventory: readonly string[]) {
  const directory = mkdtempSync(path.join(tmpdir(), "paused-service-test-"));
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
    [cleanupScript, "drts-dev-ray-tw-20260730", "us-central1"],
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

describe("paused Partner Booking Cloud Run cleanup", () => {
  it("wires a mandatory cleanup between deploy and health check", () => {
    const source = readFileSync(deployWorkflow, "utf8");
    const cleanupJob = source.indexOf("\n  paused-partner-booking-cleanup:");
    const healthJob = source.indexOf("\n  health-check:");
    const exactActiveTargets = [
      ...source.matchAll(
        /^\s+assert_exact_active_service ([^ ]+) "\$[^ ]+" "([^"]+)"$/gm,
      ),
    ].map((match) => `${match[1]}|${match[2]}`);

    expect(source).toContain('DEV_PARTNER_BOOKING_STATE: "paused"');
    expect(source).toContain(
      "./operations/deployment/cleanup-paused-partner-booking-service.sh",
    );
    expect(exactActiveTargets).toEqual([
      "api|drts-dev-api",
      "platform-admin-web|drts-dev-platform-admin-web",
      "ops-console-web|drts-dev-ops-console-web",
      "fleet-partner-portal-web|drts-dev-fleet-partner-portal-web",
      "tenant-console-web|drts-dev-tenant-console-web",
      "bank-console-web|drts-dev-bank-console-web",
      "referral-embed-web|drts-dev-referral-embed-web",
      "enterprise-dispatch-web|drts-dev-enterprise-dispatch-web",
      "channel-partner-portal-web|drts-channel-partner-portal-web",
    ]);
    expect(cleanupJob).toBeGreaterThan(-1);
    expect(healthJob).toBeGreaterThan(cleanupJob);
    expect(source.slice(cleanupJob, healthJob)).toContain(
      "needs: [prepare, deploy]",
    );
    expect(source.slice(cleanupJob, healthJob)).toContain(
      "if: ${{ always() && needs.prepare.result == 'success' }}",
    );
    expect(source.slice(cleanupJob, healthJob)).not.toContain(
      "needs.deploy.result",
    );
    expect(source.slice(cleanupJob, healthJob)).not.toContain(
      "env.DEV_PARTNER_BOOKING_STATE",
    );
    expect(source.slice(cleanupJob, healthJob)).toContain(
      "ref: ${{ github.sha }}",
    );
    expect(source.slice(healthJob)).toContain(
      "needs: [prepare, deploy, paused-partner-booking-cleanup]",
    );
    expect(source.slice(healthJob)).toContain(
      "needs.paused-partner-booking-cleanup.result == 'success'",
    );
  });

  it("fail-closes every alternate dev web deployment rail", () => {
    const genericSource = readFileSync(genericWebDeployWorkflow, "utf8");
    const allowedTuples = [
      ...genericSource.matchAll(/^\s+"(apps\/[^"]+)"\) ;;$/gm),
    ].map((match) => match[1]);

    expect(allowedTuples).toEqual([
      "apps/platform-admin-web|platform-admin-web|drts-dev-platform-admin-web|3002",
      "apps/ops-console-web|ops-console-web|drts-dev-ops-console-web|3003",
      "apps/fleet-partner-portal-web|fleet-partner-portal-web|drts-dev-fleet-partner-portal-web|3007",
      "apps/tenant-console-web|tenant-console-web|drts-dev-tenant-console-web|3004",
      "apps/bank-console-web|bank-console-web|drts-dev-bank-console-web|3008",
      "apps/referral-embed-web|referral-embed-web|drts-dev-referral-embed-web|3014",
      "apps/enterprise-dispatch-web|enterprise-dispatch-web|drts-dev-enterprise-dispatch-web|3010",
      "apps/channel-partner-portal-web|channel-partner-portal-web|drts-channel-partner-portal-web|3013",
    ]);
    expect(genericSource).toContain('case "$requested_target" in');
    expect(genericSource).toContain(
      "Requested web deploy target is not in the exact active dev allowlist.",
    );
    expect(genericSource).not.toContain("partner-booking-web");
    expect(
      genericSource.indexOf("Validate active dev web target"),
    ).toBeLessThan(genericSource.indexOf("Checkout source"));

    const specializedWorkflows = [
      {
        source: readFileSync(bankConsoleDeployWorkflow, "utf8"),
        service: "drts-dev-bank-console-web",
      },
      {
        source: readFileSync(fleetPortalDeployWorkflow, "utf8"),
        service: "drts-dev-fleet-partner-portal-web",
      },
    ];

    for (const { source: specializedSource, service } of specializedWorkflows) {
      expect(specializedSource).toContain(`default: "${service}"`);
      expect(specializedSource).toContain(
        `if [[ "$REQUESTED_TARGET_SERVICE" != "${service}" ]]; then`,
      );
      expect(specializedSource).not.toContain("partner-booking-web");
      expect(
        specializedSource.indexOf("Validate active dev service target"),
      ).toBeLessThan(specializedSource.indexOf("Checkout source"));
    }
  });

  it.each([
    ["without the retired service", activeServices],
    ["with the retired service", [...activeServices, retiredService]],
  ])("deletes only Partner Booking %s", (_label, baseInventory) => {
    const result = runCleanup([pausedService, ...[...baseInventory].reverse()]);

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "run services list --platform=managed --region us-central1 --project drts-dev-ray-tw-20260730 --format=value(metadata.name)",
      "run services delete drts-dev-partner-booking-web --platform=managed --region us-central1 --project drts-dev-ray-tw-20260730 --quiet",
    ]);
  });

  it.each([
    ["without the retired service", activeServices],
    ["with the retired service", [...activeServices, retiredService]],
  ])("is idempotent when Partner Booking is absent %s", (_label, inventory) => {
    const result = runCleanup(inventory);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("already absent");
    expect(result.commands).toHaveLength(1);
  });

  it.each(activeServices)(
    "fails closed when active service %s is missing",
    (missingService) => {
      const result = runCleanup([
        ...activeServices.filter((service) => service !== missingService),
        pausedService,
      ]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing active services:");
      expect(result.stderr).toContain(missingService);
      expect(result.commands).toHaveLength(1);
    },
  );

  it("fails closed when an unknown service is present", () => {
    const result = runCleanup([
      ...activeServices,
      pausedService,
      "drts-concierge-portal-web",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected services:");
    expect(result.stderr).toContain("drts-concierge-portal-web");
    expect(result.commands).toHaveLength(1);
  });
});
