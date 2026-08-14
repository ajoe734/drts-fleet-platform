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
const mapScript = path.join(
  repoRoot,
  "operations/deployment/map-domain-service.sh",
);
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

  const createLogFile = path.join(directory, "create.log");
  writeFileSync(createLogFile, "");

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
    if [ -n "${"$"}{MOCK_CREATE_LOG_FILE:-}" ]; then
      printf 'CREATE: %s\\n' "$*" >> "${"$"}{MOCK_CREATE_LOG_FILE}"
    fi
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
    [
      mapScript,
      "api.smarttransport.tw",
      "drts-dev-api",
      "us-central1",
      "drts-dev-ray-tw-20260730",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: envPath,
        MOCK_DESCRIBE_STDOUT: options.describeStdout ?? "",
        MOCK_DESCRIBE_STDERR: options.describeStderr ?? "",
        MOCK_DESCRIBE_EXIT_CODE: String(options.describeExitCode ?? 0),
        MOCK_CREATE_LOG_FILE: createLogFile,
      },
    },
  );

  const createLogContent = readFileSync(createLogFile, "utf8").trim();
  const createInvocationCount = createLogContent
    ? createLogContent.split("\n").length
    : 0;

  return {
    ...result,
    createLogContent,
    createInvocationCount,
  };
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
    expect(result.stdout).toContain(
      "Domain mapping already targets drts-dev-api; skipping create.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed if domain mapping points to a different service", () => {
    const result = runMapDomain({
      describeStdout: "drts-dev-other-service",
      describeExitCode: 0,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to mutate a live mapping");
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("creates domain mapping when domain resource is not found (resource format)", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(1);
    expect(result.createLogContent).toBe(
      "CREATE: --quiet beta run domain-mappings create --service drts-dev-api --domain api.smarttransport.tw --region us-central1 --project drts-dev-ray-tw-20260730",
    );
  });

  it("fails closed without creating when describe succeeds with empty output", () => {
    const result = runMapDomain({
      describeStdout: "",
      describeExitCode: 0,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to create a domain mapping from an empty, multiline, or malformed describe result.",
    );
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when describe succeeds with multiline output", () => {
    const result = runMapDomain({
      describeStdout: "drts-dev-api\nunexpected-second-line",
      describeExitCode: 0,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to create a domain mapping from an empty, multiline, or malformed describe result.",
    );
    expect(result.createInvocationCount).toBe(0);
  });

  it("creates domain mapping when domain resource is not found (bracket format)", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(1);
    expect(result.createLogContent).toBe(
      "CREATE: --quiet beta run domain-mappings create --service drts-dev-api --domain api.smarttransport.tw --region us-central1 --project drts-dev-ray-tw-20260730",
    );
  });

  it("creates domain mapping for the Cloud Run DOMAIN_MAPPING does-not-exist response", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist. This command is authenticated as deployer@example.com using the credentials in /tmp/gha-creds.json, specified by the [auth/credential_file_override] property.",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(1);
    expect(result.createLogContent).toBe(
      "CREATE: --quiet beta run domain-mappings create --service drts-dev-api --domain api.smarttransport.tw --region us-central1 --project drts-dev-ray-tw-20260730",
    );
  });

  it("fails closed without creating when project NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Project [invalid-project] not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when service account NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Service account [sa@project.iam.gserviceaccount.com] not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when region NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Region [moon-1] not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when domain regex metacharacter substitution does not match literally", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'apiXsmarttransportXtw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when command not found happens", () => {
    const result = runMapDomain({
      describeStderr: "bash: gcloud: command not found",
      describeExitCode: 127,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when INTERNAL error is returned even if requested domain is mentioned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) INTERNAL: An internal error occurred for api.smarttransport.tw. Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when INVALID_ARGUMENT error is returned even if requested domain is mentioned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) INVALID_ARGUMENT: Invalid domain api.smarttransport.tw. Resource 'api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when UNKNOWN error is returned even if requested domain is mentioned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) UNKNOWN: An unknown error occurred for api.smarttransport.tw. Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when UNKNOWN wraps a DOMAIN_MAPPING does-not-exist message", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) UNKNOWN: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when the DOMAIN_MAPPING does-not-exist response names the wrong region", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'europe-west1' in project 'drts-dev-ray-tw-20260730' does not exist.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when the DOMAIN_MAPPING does-not-exist response names the wrong project", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'wrong-project' does not exist.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when the DOMAIN_MAPPING does-not-exist response names the wrong domain", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'evil.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when a mixed permission error follows an otherwise valid missing mapping", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist. Permission denied while reading API metadata.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when a mixed authentication error follows an otherwise valid missing mapping", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist. Authentication failed.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when a mixed API error follows an otherwise valid missing mapping", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist. Domain Mappings API disabled.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when the resource kind is not DOMAIN_MAPPING", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'SERVICE' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when a kindless resource claims the domain does not exist", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' does not exist.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when API_NOT_ENABLED is embedded in the authentication context", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist. This command is authenticated as API_NOT_ENABLED using the credentials in /tmp/gha-creds.json, specified by the [auth/credential_file_override] property.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed when QUOTA_EXCEEDED is embedded in the authentication context", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' of kind 'DOMAIN_MAPPING' in region 'us-central1' in project 'drts-dev-ray-tw-20260730' does not exist. This command is authenticated as deployer@example.com using the credentials in /tmp/QUOTA_EXCEEDED.json, specified by the [auth/credential_file_override] property.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when ABORTED error is returned even if requested domain is mentioned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) ABORTED: Operation aborted for api.smarttransport.tw. Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when gcloud domain-mappings describe command header is missing", () => {
    const result = runMapDomain({
      describeStderr:
        "NOT_FOUND: Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when WARNING prefix precedes NOT_FOUND header", () => {
    const result = runMapDomain({
      describeStderr:
        "WARNING: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when WARNING line precedes NOT_FOUND header on next line", () => {
    const result = runMapDomain({
      describeStderr:
        "WARNING: Some gcloud warning message\nERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when NOT_FOUND header is for unrelated-backend resource while mentioning requested domain elsewhere", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'unrelated-backend' was not found. Requested domain api.smarttransport.tw.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("creates domain mapping when valid requested-domain NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(1);
  });

  it("fails closed without creating when domain has trailing extension (api.smarttransport.tw.evil)", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'api.smarttransport.tw.evil' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("fails closed without creating when domain has leading subdomain prefix (evil.api.smarttransport.tw)", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Resource 'evil.api.smarttransport.tw' was not found.",
      describeExitCode: 1,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Refusing to proceed: error output does not match domain-not-found for api.smarttransport.tw.",
    );
    expect(result.stdout).not.toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(0);
  });

  it("creates domain mapping when exact bracketed requested-domain NOT_FOUND is returned", () => {
    const result = runMapDomain({
      describeStderr:
        "ERROR: (gcloud.beta.run.domain-mappings.describe) NOT_FOUND: Cannot find domain mapping for [api.smarttransport.tw].",
      describeExitCode: 1,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("created domain mapping");
    expect(result.createInvocationCount).toBe(1);
  });
});
