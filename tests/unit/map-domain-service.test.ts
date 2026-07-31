import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");
const mapScript = path.join(repoRoot, "scripts/map-domain-service.sh");
const temporaryDirectories: string[] = [];

function runMapDomain(options: {
  describeStdout?: string;
  describeStderr?: string;
  describeExitCode?: number;
  commandNotFound?: boolean;
}) {
  const directory = mkdtempSync(path.join(tmpdir(), "map-domain-test-"));
  temporaryDirectories.push(directory);

  const binDirectory = path.join(directory, "bin");
  mkdirSync(binDirectory);

  if (!options.commandNotFound) {
    const mockGcloud = path.join(binDirectory, "gcloud");
    writeFileSync(
      mockGcloud,
      `#!/usr/bin/env bash
set -euo pipefail

case "$*" in
  *"domain-mappings describe"*)
    if [ -n "\${MOCK_DESCRIBE_STDOUT:-}" ]; then
      printf '%s\\n' "$MOCK_DESCRIBE_STDOUT"
    fi
    if [ -n "\${MOCK_DESCRIBE_STDERR:-}" ]; then
      printf '%s\\n' "$MOCK_DESCRIBE_STDERR" >&2
    fi
    exit "\${MOCK_DESCRIBE_EXIT_CODE:-0}"
    ;;
  *"domain-mappings create"*)
    printf 'created domain mapping %s\\n' "$*"
    exit 0
    ;;
esac
`,
    );
    chmodSync(mockGcloud, 0o755);
  }

  const envPath = options.commandNotFound
    ? "/usr/bin:/bin"
    : `${binDirectory}:${process.env.PATH ?? ""}`;

  const result = spawnSync(
    "bash",
    [mapScript, "api.smarttransport.tw", "drts-dev-api", "us-central1", "drts-dev-ray-tw-20260730"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: envPath,
        MOCK_DESCRIBE_STDOUT: options.describeStdout ?? "",
        MOCK_DESCRIBE_STDERR: options.describeStderr ?? "",
        MOCK_DESCRIBE_EXIT_CODE: String(options.describeExitCode ?? 0),
      },
    },
  );

  return result;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cloud Run domain mapping helper", () => {
  it("skips creation if domain mapping already points to expected service", () => {
    const result = runMapDomain({
      describeStdout: "drts-dev-api",
      describeExitCode: 0,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Domain mapping already targets drts-dev-api; skipping create.");
    expect(result.stdout).not.toContain("created domain mapping");
  });

  it("fails closed if domain mapping points to a different service", () => {
    const result = runMapDomain({
      describeStdout: "drts-dev-other-service",
      describeExitCode: 0,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to mutate a live mapping");
    expect(result.stdout).not.toContain("created domain mapping");
  });

  it("creates domain mapping when domain resource is not found (resource format)", () => {
    const result = runMapDomain({
      describeStderr: "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
  });

  it("creates domain mapping when domain resource is not found (bracket format)", () => {
    const result = runMapDomain({
      describeStderr: "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
  });

  it("fails closed without creating when project NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr: "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Project [invalid-project] not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.");
    expect(result.stdout).not.toContain("created domain mapping");
  });

  it("fails closed without creating when service account NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr: "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Service account [sa@project.iam.gserviceaccount.com] not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.");
    expect(result.stdout).not.toContain("created domain mapping");
  });

  it("fails closed without creating when region NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr: "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Region [moon-1] not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.");
    expect(result.stdout).not.toContain("created domain mapping");
  });

  it("fails closed without creating when command not found happens", () => {
    const result = runMapDomain({
      describeStderr: "bash: gcloud: command not found",
      describeExitCode: 127,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.");
    expect(result.stdout).not.toContain("created domain mapping");
  });
});
