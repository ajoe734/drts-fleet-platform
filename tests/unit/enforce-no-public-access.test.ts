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

const repoRoot = path.resolve(__dirname, "..", "..");
const enforceScript = path.join(
  repoRoot,
  "operations/deployment/enforce-no-public-access.sh",
);
const deployWorkflow = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const temporaryDirectories: string[] = [];

const policyWithPublicBinding = JSON.stringify({
  bindings: [
    { role: "roles/run.invoker", members: ["serviceAccount:runtime@example.iam.gserviceaccount.com"] },
    { role: "roles/run.invoker", members: ["allUsers"] },
  ],
  etag: "etag-1",
  version: 1,
});

const policyWithoutPublicBinding = JSON.stringify({
  bindings: [
    { role: "roles/run.invoker", members: ["serviceAccount:runtime@example.iam.gserviceaccount.com"] },
  ],
  etag: "etag-2",
  version: 1,
});

const policyWithNoBindingsAtAll = JSON.stringify({ etag: "etag-3", version: 1 });

const malformedPolicyJson = '{"bindings":[';
const emptyPolicyJson = "";

function runEnforce(options: {
  policyJson: string;
  getIamPolicyExitCode?: number;
  getIamPolicyStderr?: string;
  removeExitCode?: number;
  removeStderr?: string;
}) {
  const directory = mkdtempSync(path.join(tmpdir(), "enforce-no-public-access-test-"));
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

if [[ "$*" == *"get-iam-policy"* ]]; then
  if ((MOCK_GET_IAM_POLICY_EXIT_CODE != 0)); then
    printf '%s\\n' "$MOCK_GET_IAM_POLICY_STDERR" >&2
    exit "$MOCK_GET_IAM_POLICY_EXIT_CODE"
  fi
  printf '%s\\n' "$MOCK_POLICY_JSON"
  exit 0
fi

if [[ "$*" == *"remove-iam-policy-binding"* ]]; then
  if ((MOCK_REMOVE_EXIT_CODE != 0)); then
    printf '%s\\n' "$MOCK_REMOVE_STDERR" >&2
    exit "$MOCK_REMOVE_EXIT_CODE"
  fi
  exit 0
fi

echo "unexpected gcloud command: $*" >&2
exit 99
`,
  );
  chmodSync(mockGcloud, 0o755);

  const result = spawnSync(
    "bash",
    [enforceScript, "drts-dev-platform-admin-web", "us-central1", "nodal-alloy-503700-s3"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
        MOCK_GCLOUD_LOG_FILE: commandLogFile,
        MOCK_POLICY_JSON: options.policyJson,
        MOCK_GET_IAM_POLICY_EXIT_CODE: String(options.getIamPolicyExitCode ?? 0),
        MOCK_GET_IAM_POLICY_STDERR: options.getIamPolicyStderr ?? "",
        MOCK_REMOVE_EXIT_CODE: String(options.removeExitCode ?? 0),
        MOCK_REMOVE_STDERR: options.removeStderr ?? "",
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

describe("CI-DEPLOY-DEV-PRIVATE-CONSOLES-20261005: enforce-no-public-access.sh", () => {
  it("removes the allUsers run.invoker binding when it is present", () => {
    const result = runEnforce({ policyJson: policyWithPublicBinding });

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "run services get-iam-policy drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --format=json",
      "run services remove-iam-policy-binding drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --member allUsers --role roles/run.invoker",
    ]);
    expect(result.stdout).toContain("Removing public allUsers run.invoker binding");
  });

  it("targets only the allUsers member on roles/run.invoker, preserving other principals", () => {
    const result = runEnforce({ policyJson: policyWithPublicBinding });

    expect(result.status).toBe(0);
    const removeCommand = result.commands.find((command) =>
      command.includes("remove-iam-policy-binding"),
    );
    expect(removeCommand).toContain("--member allUsers");
    expect(removeCommand).toContain("--role roles/run.invoker");
    // A scoped remove-iam-policy-binding call, not a full-policy
    // set-iam-policy rewrite, so other bound principals are untouched.
    expect(result.commands.some((command) => command.includes("set-iam-policy"))).toBe(false);
  });

  it("is a verified no-op when the binding is already absent (e.g. after a redeploy already retracted it)", () => {
    const result = runEnforce({ policyJson: policyWithoutPublicBinding });

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "run services get-iam-policy drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --format=json",
    ]);
    expect(result.stdout).toContain("already absent");
  });

  it("is a verified no-op when the service has no bindings at all", () => {
    const result = runEnforce({ policyJson: policyWithNoBindingsAtAll });

    expect(result.status).toBe(0);
    expect(result.commands).toHaveLength(1);
    expect(result.stdout).toContain("already absent");
  });

  it("fails closed when reading the IAM policy fails (auth/permission error)", () => {
    const result = runEnforce({
      policyJson: policyWithPublicBinding,
      getIamPolicyExitCode: 1,
      getIamPolicyStderr: "ERROR: (gcloud.run.services.get-iam-policy) PERMISSION_DENIED",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PERMISSION_DENIED");
    // Must not fall through to treating a read failure as "binding absent".
    expect(result.commands).toHaveLength(1);
    expect(result.commands.some((command) => command.includes("remove-iam-policy-binding"))).toBe(
      false,
    );
  });

  it("fails closed when removing a present binding fails for a reason other than absence", () => {
    const result = runEnforce({
      policyJson: policyWithPublicBinding,
      removeExitCode: 1,
      removeStderr: "ERROR: (gcloud.run.services.remove-iam-policy-binding) PERMISSION_DENIED",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PERMISSION_DENIED");
    expect(result.commands).toEqual([
      "run services get-iam-policy drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --format=json",
      "run services remove-iam-policy-binding drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --member allUsers --role roles/run.invoker",
    ]);
  });

  it("fails closed when the IAM policy JSON is malformed, instead of reporting a verified absence", () => {
    const result = runEnforce({ policyJson: malformedPolicyJson });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing to treat this as a verified absence");
    // Must not fall through to the "already absent" success branch, and
    // must not attempt a removal against an unparseable policy.
    expect(result.stdout).not.toContain("already absent");
    expect(result.commands).toEqual([
      "run services get-iam-policy drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --format=json",
    ]);
  });

  it("fails closed when the IAM policy JSON is empty, instead of reporting a verified absence", () => {
    const result = runEnforce({ policyJson: emptyPolicyJson });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("refusing to treat this as a verified absence");
    expect(result.stdout).not.toContain("already absent");
    expect(result.commands).toEqual([
      "run services get-iam-policy drts-dev-platform-admin-web --region us-central1 --project nodal-alloy-503700-s3 --format=json",
    ]);
  });

  it("requires service, region and project arguments", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "enforce-no-public-access-usage-"));
    temporaryDirectories.push(directory);
    const result = spawnSync("bash", [enforceScript, "drts-dev-platform-admin-web"], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });

  it("is wired into all four newly-private console enforcement steps instead of a raw gcloud call", () => {
    const source = readFileSync(deployWorkflow, "utf8");

    expect(source).not.toContain("remove-iam-policy-binding is idempotent");
    expect(source).not.toContain('gcloud run services remove-iam-policy-binding "${{');

    for (const [service, output, flagOutput] of [
      ["platform-admin-web", "platform_admin_service", "platform_admin_exposure_flag"],
      ["ops-console-web", "ops_console_service", "ops_console_exposure_flag"],
      ["fleet-partner-portal-web", "fleet_partner_portal_service", "fleet_partner_portal_exposure_flag"],
      ["channel-partner-portal-web", "channel_partner_portal_service", "channel_partner_portal_exposure_flag"],
    ] as const) {
      expect(source).toContain(`Enforce no public access — ${service}`);
      expect(source).toContain(
        `if: \${{ needs.prepare.outputs.${flagOutput} == '--no-allow-unauthenticated' }}`,
      );
      const stepIndex = source.indexOf(`Enforce no public access — ${service}`);
      const nextStepIndex = source.indexOf("\n      - name:", stepIndex + 1);
      const stepBody = source.slice(stepIndex, nextStepIndex === -1 ? undefined : nextStepIndex);
      expect(stepBody).toContain("./operations/deployment/enforce-no-public-access.sh");
      expect(stepBody).toContain(`needs.prepare.outputs.${output}`);
    }
  });
});
