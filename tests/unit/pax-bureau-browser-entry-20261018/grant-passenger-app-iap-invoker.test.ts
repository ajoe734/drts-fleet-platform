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

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const grantScript = path.join(
  repoRoot,
  "operations/deployment/passenger-bureau-entry/grant-passenger-app-iap-invoker.sh",
);
const deployWorkflow = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const temporaryDirectories: string[] = [];

function runGrant(
  args: string[],
  opts: {
    projectNumber?: string;
    enableExitCode?: number;
    enableStderr?: string;
    identityExitCode?: number;
    identityStderr?: string;
    addExitCode?: number;
    addStderr?: string;
  } = {},
) {
  const {
    projectNumber = "123456789012",
    enableExitCode = 0,
    enableStderr = "",
    identityExitCode = 0,
    identityStderr = "",
    addExitCode = 0,
    addStderr = "",
  } = opts;

  const directory = mkdtempSync(
    path.join(tmpdir(), "grant-passenger-app-iap-invoker-test-"),
  );
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
printf '%s\\n' "$*" >> "$MOCK_GCLOUD_LOG_FILE"

if [[ "$1 $2" == "projects describe" ]]; then
  printf '%s\\n' "$MOCK_PROJECT_NUMBER"
  exit 0
fi

if [[ "$1 $2" == "services enable" ]]; then
  if ((MOCK_ENABLE_EXIT_CODE != 0)); then
    printf '%s\\n' "$MOCK_ENABLE_STDERR" >&2
    exit "$MOCK_ENABLE_EXIT_CODE"
  fi
  exit 0
fi

if [[ "$1 $2 $3 $4" == "beta services identity create" ]]; then
  if ((MOCK_IDENTITY_EXIT_CODE != 0)); then
    printf '%s\\n' "$MOCK_IDENTITY_STDERR" >&2
    exit "$MOCK_IDENTITY_EXIT_CODE"
  fi
  exit 0
fi

if [[ "$*" == *"add-iam-policy-binding"* ]]; then
  if ((MOCK_ADD_EXIT_CODE != 0)); then
    printf '%s\\n' "$MOCK_ADD_STDERR" >&2
    exit "$MOCK_ADD_EXIT_CODE"
  fi
  exit 0
fi

echo "unexpected gcloud command: $*" >&2
exit 99
`,
  );
  chmodSync(mockGcloud, 0o755);

  const result = spawnSync("bash", [grantScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      MOCK_GCLOUD_LOG_FILE: commandLogFile,
      MOCK_PROJECT_NUMBER: projectNumber,
      MOCK_ENABLE_EXIT_CODE: String(enableExitCode),
      MOCK_ENABLE_STDERR: enableStderr,
      MOCK_IDENTITY_EXIT_CODE: String(identityExitCode),
      MOCK_IDENTITY_STDERR: identityStderr,
      MOCK_ADD_EXIT_CODE: String(addExitCode),
      MOCK_ADD_STDERR: addStderr,
    },
  });

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

describe("PAX-BUREAU-BROWSER-ENTRY-20261018: grant-passenger-app-iap-invoker.sh", () => {
  it("grants roles/run.invoker only to the Cloud IAP service agent for this project", () => {
    const result = runGrant(
      ["drts-dev-passenger-app-web", "us-central1", "drts-dev-devcc-20260825"],
      { projectNumber: "987654321098" },
    );

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "projects describe drts-dev-devcc-20260825 --format=value(projectNumber)",
      "services enable iap.googleapis.com --project=drts-dev-devcc-20260825 --quiet",
      "beta services identity create --service=iap.googleapis.com --project=drts-dev-devcc-20260825 --quiet",
      "run services add-iam-policy-binding drts-dev-passenger-app-web --region us-central1 --project drts-dev-devcc-20260825 --member serviceAccount:service-987654321098@gcp-sa-iap.iam.gserviceaccount.com --role roles/run.invoker",
    ]);
  });

  it("ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP: enables iap.googleapis.com before the first service-identity call, so a brand-new project that never used IAP before does not fail with the API disabled", () => {
    const result = runGrant([
      "drts-dev-passenger-app-web",
      "us-central1",
      "drts-dev-devcc-20260825",
    ]);

    expect(result.status).toBe(0);
    const enableIndex = result.commands.findIndex((c) =>
      c.startsWith("services enable iap.googleapis.com"),
    );
    const identityIndex = result.commands.findIndex((c) =>
      c.startsWith("beta services identity create"),
    );
    expect(enableIndex).toBeGreaterThan(-1);
    expect(identityIndex).toBeGreaterThan(enableIndex);
  });

  it("ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP: a project where iap.googleapis.com is already enabled is not treated as an error (idempotent re-enable on every run)", () => {
    // The stubbed `gcloud services enable` always exits 0 regardless of
    // whether the API was already on, exactly like the real command; this
    // documents that calling it again on an already-activated project is a
    // normal, successful no-op rather than a path this script needs to branch
    // around.
    const first = runGrant([
      "drts-dev-passenger-app-web",
      "us-central1",
      "drts-dev-devcc-20260825",
    ]);
    const second = runGrant([
      "drts-dev-passenger-app-web",
      "us-central1",
      "drts-dev-devcc-20260825",
    ]);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(
      second.commands.some((c) =>
        c.startsWith("services enable iap.googleapis.com"),
      ),
    ).toBe(true);
  });

  it("ENTRY-R11-FIRST-ACTIVATION-API-BOOTSTRAP: fails closed when iap.googleapis.com cannot be enabled, without attempting the service-identity create or the grant", () => {
    const result = runGrant(
      ["drts-dev-passenger-app-web", "us-central1", "drts-dev-devcc-20260825"],
      {
        enableExitCode: 7,
        enableStderr:
          "ERROR: (gcloud.services.enable) PERMISSION_DENIED: caller lacks serviceusage.services.enable",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("serviceusage.services.enable");
    expect(
      result.commands.some((c) => c.startsWith("beta services identity create")),
    ).toBe(false);
    expect(
      result.commands.some((c) => c.includes("add-iam-policy-binding")),
    ).toBe(false);
  });

  it("ENTRY-R11-COLD-BETA-SDK-NOPROMPT: the service-identity create call is noninteractive (--quiet), so a cold Cloud SDK that has never installed the beta component group does not hang on an unanswerable install prompt", () => {
    const result = runGrant([
      "drts-dev-passenger-app-web",
      "us-central1",
      "drts-dev-devcc-20260825",
    ]);

    expect(result.status).toBe(0);
    const identityCommand = result.commands.find((c) =>
      c.startsWith("beta services identity create"),
    );
    expect(identityCommand).toBeDefined();
    expect(identityCommand).toContain("--quiet");
  });

  it("ensures the IAP service identity exists (idempotent create) before granting, so a project whose IAP identity was never bootstrapped does not fail the grant", () => {
    const result = runGrant([
      "drts-dev-passenger-app-web",
      "us-central1",
      "drts-dev-devcc-20260825",
    ]);

    expect(result.status).toBe(0);
    const identityIndex = result.commands.findIndex((c) =>
      c.startsWith("beta services identity create"),
    );
    const grantIndex = result.commands.findIndex((c) =>
      c.includes("add-iam-policy-binding"),
    );
    expect(identityIndex).toBeGreaterThan(-1);
    expect(grantIndex).toBeGreaterThan(identityIndex);
  });

  it("fails closed when the IAP service identity cannot be created, without attempting the grant", () => {
    const result = runGrant(
      ["drts-dev-passenger-app-web", "us-central1", "drts-dev-devcc-20260825"],
      {
        identityExitCode: 44,
        identityStderr:
          "SIMULATED CLEAN PROJECT: IAP service account does not exist before service identity creation.",
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("IAP service account does not exist");
    expect(
      result.commands.some((c) => c.includes("add-iam-policy-binding")),
    ).toBe(false);
  });

  it("never grants allUsers or allAuthenticatedUsers", () => {
    const result = runGrant([
      "drts-dev-passenger-app-web",
      "us-central1",
      "drts-dev-devcc-20260825",
    ]);

    expect(result.status).toBe(0);
    for (const command of result.commands) {
      expect(command).not.toContain("allUsers");
      expect(command).not.toContain("allAuthenticatedUsers");
    }
  });

  it("refuses to proceed when the project number cannot be resolved", () => {
    const result = runGrant(
      ["drts-dev-passenger-app-web", "us-central1", "drts-dev-devcc-20260825"],
      { projectNumber: "not-a-number" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Could not resolve a numeric project number");
    expect(
      result.commands.some((c) => c.includes("add-iam-policy-binding")),
    ).toBe(false);
  });

  it("fails closed when the add-iam-policy-binding call itself fails", () => {
    const result = runGrant(
      ["drts-dev-passenger-app-web", "us-central1", "drts-dev-devcc-20260825"],
      { addExitCode: 1, addStderr: "ERROR: PERMISSION_DENIED" },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PERMISSION_DENIED");
  });

  it("requires all three arguments", () => {
    const result = spawnSync(
      "bash",
      [grantScript, "drts-dev-passenger-app-web", "us-central1"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("is wired into deploy-dev.yml as an opt-in step gated on DEV_PAX_BUREAU_ENTRY_HOST, after deploy + no-public-access enforcement", () => {
    const source = readFileSync(deployWorkflow, "utf8");

    expect(source).toContain(
      "DEV_PAX_BUREAU_ENTRY_HOST: ${{ vars.DEV_PAX_BUREAU_ENTRY_HOST }}",
    );
    expect(source).toContain(
      "Grant Cloud IAP service agent run.invoker — passenger-app-web",
    );

    const stepIndex = source.indexOf(
      "Grant Cloud IAP service agent run.invoker — passenger-app-web",
    );
    expect(stepIndex).toBeGreaterThan(-1);
    const nextStepIndex = source.indexOf("\n      - name:", stepIndex + 1);
    const stepBody = source.slice(
      stepIndex,
      nextStepIndex === -1 ? undefined : nextStepIndex,
    );
    expect(stepBody).toContain(
      "if: ${{ needs.prepare.outputs.passenger_app_exposure_flag == '--no-allow-unauthenticated' && env.DEV_PAX_BUREAU_ENTRY_HOST != '' }}",
    );
    expect(stepBody).toContain(
      "./operations/deployment/passenger-bureau-entry/grant-passenger-app-iap-invoker.sh",
    );
    expect(stepBody).toContain("needs.prepare.outputs.passenger_app_service");

    const deployIndex = source.indexOf("Deploy — passenger-app-web");
    const enforceIndex = source.indexOf(
      "Enforce no public access — passenger-app-web",
    );
    expect(deployIndex).toBeGreaterThan(-1);
    expect(enforceIndex).toBeGreaterThan(deployIndex);
    expect(stepIndex).toBeGreaterThan(enforceIndex);

    expect(source).toContain(
      'env_vars="${env_vars},PAX_BUREAU_ENTRY_HOST=${DEV_PAX_BUREAU_ENTRY_HOST:-}"',
    );
  });
});
