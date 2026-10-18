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

// Regression coverage for .local/passenger-bureau-gap-correction-20261018/
// entry-R3-routing-review/findings.json (ENTRY-R3-UNMATCHED-HOST-DEFAULT and
// ENTRY-R3-UNKNOWN-GUARD-POLICY): this exercises the real setup helper
// against a stubbed `gcloud` on PATH, with no network or live GCP project.

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const setupScript = path.join(
  repoRoot,
  "operations/deployment/passenger-bureau-entry/setup-passenger-public-entry.sh",
);

const service = "drts-dev-passenger-app-web";
const region = "us-central1";
const project = "drts-dev-devcc-20260825";
const host = "bureau.smarttransport.tw";
const publicBackend = `${service}-public-entry`;
const guardBackend = `${service}-review-driver-guard`;

const temporaryDirectories: string[] = [];

function mockGcloudScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$MOCK_GCLOUD_LOG_FILE"

if [[ "$1 $2" == "projects describe" ]]; then
  echo "$MOCK_PROJECT_NUMBER"
  exit 0
fi

case "$*" in
  *"network-endpoint-groups list"*|*"backend-services list"*|*"ssl-certificates list"*|*"addresses list"*|*"target-https-proxies list"*|*"forwarding-rules list"*)
    # Empty result = resource does not exist yet.
    exit 0
    ;;
esac

if [[ "$*" == *"iap web get-iam-policy"* ]]; then
  if [[ "\${MOCK_GUARD_POLICY_EXIT_CODE:-0}" != "0" ]]; then
    printf '%s\\n' "\${MOCK_GUARD_POLICY_STDERR:-}" >&2
    exit "\${MOCK_GUARD_POLICY_EXIT_CODE}"
  fi
  printf '%s' "$MOCK_GUARD_POLICY_JSON"
  exit 0
fi

if [[ "$*" == *"url-maps import"* ]]; then
  for a in "$@"; do
    case "$a" in
      --source=*) cp "\${a#--source=}" "$MOCK_URLMAP_CAPTURE_FILE" ;;
    esac
  done
  exit 0
fi

if [[ "$*" == *"addresses describe"* ]]; then
  echo "$MOCK_STATIC_IP"
  exit 0
fi

# create / update / add-backend / add-iam-policy-binding / proxy / forwarding-rule
exit 0
`;
}

function runSetup(
  args: string[],
  opts: {
    guardPolicyExitCode?: number;
    guardPolicyStderr?: string;
    guardPolicyJson?: string;
  } = {},
) {
  const {
    guardPolicyExitCode = 0,
    guardPolicyStderr = "",
    guardPolicyJson = '{"bindings":[]}',
  } = opts;

  const directory = mkdtempSync(
    path.join(tmpdir(), "setup-passenger-public-entry-test-"),
  );
  temporaryDirectories.push(directory);

  const binDirectory = path.join(directory, "bin");
  mkdirSync(binDirectory);
  const commandLogFile = path.join(directory, "gcloud.log");
  writeFileSync(commandLogFile, "");
  const urlmapCaptureFile = path.join(directory, "urlmap.yaml");

  const mockGcloud = path.join(binDirectory, "gcloud");
  writeFileSync(mockGcloud, mockGcloudScript());
  chmodSync(mockGcloud, 0o755);

  const mockJq = spawnSync("which", ["jq"], { encoding: "utf8" });
  if (mockJq.status !== 0) {
    throw new Error("jq must be available on PATH to run this test");
  }

  const result = spawnSync("bash", [setupScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
      MOCK_GCLOUD_LOG_FILE: commandLogFile,
      MOCK_PROJECT_NUMBER: "123456789012",
      MOCK_STATIC_IP: "203.0.113.10",
      MOCK_GUARD_POLICY_EXIT_CODE: String(guardPolicyExitCode),
      MOCK_GUARD_POLICY_STDERR: guardPolicyStderr,
      MOCK_GUARD_POLICY_JSON: guardPolicyJson,
      MOCK_URLMAP_CAPTURE_FILE: urlmapCaptureFile,
    },
  });

  const commands = readFileSync(commandLogFile, "utf8")
    .split("\n")
    .filter(Boolean);

  let urlmapYaml: string | null = null;
  try {
    urlmapYaml = readFileSync(urlmapCaptureFile, "utf8");
  } catch {
    urlmapYaml = null;
  }

  return { ...result, commands, urlmapYaml };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("PAX-BUREAU-BROWSER-ENTRY-20261018: setup-passenger-public-entry.sh", () => {
  it("ENTRY-R3-UNKNOWN-GUARD-POLICY: fails closed when the guard policy read itself fails, before any public grant or URL-map import", () => {
    const result = runSetup([service, region, project, host], {
      guardPolicyExitCode: 1,
      guardPolicyStderr: "ERROR: (gcloud.iap.web.get-iam-policy) PERMISSION_DENIED",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("PERMISSION_DENIED");
    expect(
      result.commands.some((c) => c.includes("add-iam-policy-binding")),
    ).toBe(false);
    expect(result.commands.some((c) => c.includes("url-maps import"))).toBe(
      false,
    );
    expect(result.urlmapYaml).toBeNull();
  });

  it("ENTRY-R3-UNKNOWN-GUARD-POLICY: fails closed when the guard policy is malformed JSON, before any public grant or URL-map import", () => {
    const result = runSetup([service, region, project, host], {
      guardPolicyJson: "not-json",
    });

    expect(result.status).not.toBe(0);
    expect(result.status).not.toBe(1);
    expect(result.stderr).toContain(
      "Failed to evaluate the IAP policy for " + guardBackend,
    );
    expect(
      result.commands.some((c) => c.includes("add-iam-policy-binding")),
    ).toBe(false);
    expect(result.commands.some((c) => c.includes("url-maps import"))).toBe(
      false,
    );
  });

  it("refuses to proceed when the guard backend already grants anonymous IAP access", () => {
    const result = runSetup([service, region, project, host], {
      guardPolicyJson: JSON.stringify({
        bindings: [
          {
            role: "roles/iap.httpsResourceAccessor",
            members: ["allUsers"],
          },
        ],
      }),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("already grants anonymous IAP access");
    expect(
      result.commands.some((c) => c.includes("add-iam-policy-binding")),
    ).toBe(false);
    expect(result.commands.some((c) => c.includes("url-maps import"))).toBe(
      false,
    );
  });

  it("a genuinely empty guard policy is not mistaken for a failure, and provisioning proceeds", () => {
    const result = runSetup([service, region, project, host], {
      guardPolicyJson: '{"bindings":[]}',
    });

    expect(result.status).toBe(0);
    expect(
      result.commands.some(
        (c) =>
          c.includes("add-iam-policy-binding") &&
          c.includes(`--service=${publicBackend}`) &&
          c.includes("--member=allUsers"),
      ),
    ).toBe(true);
    expect(result.commands.some((c) => c.includes("url-maps import"))).toBe(
      true,
    );
  });

  it("ENTRY-R3-UNMATCHED-HOST-DEFAULT: the generated URL map's top-level default routes unmatched Host to the guard backend, never the public backend", () => {
    const result = runSetup([service, region, project, host]);

    expect(result.status).toBe(0);
    expect(result.urlmapYaml).not.toBeNull();
    const yaml = result.urlmapYaml as string;

    const topLevelDefaultMatch = yaml.match(/^defaultService: (.+)$/m);
    expect(topLevelDefaultMatch).not.toBeNull();
    expect(topLevelDefaultMatch?.[1]).toBe(
      `projects/${project}/global/backendServices/${guardBackend}`,
    );
    expect(topLevelDefaultMatch?.[1]).not.toContain(publicBackend);

    // The host-scoped path matcher's own default (for everything except the
    // driver/control paths) is the public backend.
    const pathMatcherDefaultMatch = yaml.match(
      /pathMatchers:[\s\S]*?defaultService: (.+)$/m,
    );
    expect(pathMatcherDefaultMatch?.[1]).toBe(
      `projects/${project}/global/backendServices/${publicBackend}`,
    );

    // The driver/dispatch-control paths stay routed to the guard backend.
    expect(yaml).toContain("/review-driver");
    expect(yaml).toContain("/api/review-driver-api/*");
    const pathRulesSection = yaml.slice(yaml.indexOf("pathRules:"));
    expect(pathRulesSection).toContain(
      `service: projects/${project}/global/backendServices/${guardBackend}`,
    );

    // The configured host only appears in hostRules, not as a defaultService.
    expect(yaml).toContain(`- "${host}"`);
  });

  it("refuses an implausible hostname without calling gcloud at all", () => {
    const result = runSetup([service, region, project, "not a host"]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("not a plausible DNS hostname");
    expect(result.commands).toHaveLength(0);
  });

  it("requires all four arguments", () => {
    const result = spawnSync("bash", [setupScript, service, region, project], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage:");
  });
});
