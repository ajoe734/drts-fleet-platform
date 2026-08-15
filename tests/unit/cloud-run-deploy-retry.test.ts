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
import { getIamTenantRoleScopes } from "../../packages/contracts/src/iam-policy-catalog";

const repoRoot = path.resolve(__dirname, "../..");
const deployScript = path.join(
  repoRoot,
  "operations/deployment/deploy-cloud-run-service.sh",
);
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
      workflow.match(/operations\/deployment\/deploy-cloud-run-service\.sh/g),
    ).toHaveLength(9);
    expect(workflow).not.toMatch(/^\s+gcloud run deploy/m);
    // Retired surfaces must never be built or deployed. The candidate-bound
    // acceptance job may still derive their former service URLs to prove the
    // retired/paused response contract against the deployed candidate.
    expect(workflow).not.toMatch(/(?:Deploy|Build & push) — .*concierge/i);
    expect(
      workflow
        .split("\n")
        .filter((line) => line.includes("passenger-web"))
        .map((line) => line.trim()),
    ).toEqual([
      'description: "Fail-closed cleanup for the retired passenger service. Delete is allowed only when the regional Cloud Run inventory is exactly the intended 9 active services plus drts-passenger-web."',
      '- "delete-drts-passenger-web"',
      'export DRTS_DEV_PASSENGER_BASE_URL="https://drts-dev-passenger-web-${cloud_run_suffix}"',
    ]);
    expect(workflow).toContain(
      'export DRTS_DEV_CONCIERGE_BASE_URL="https://drts-dev-concierge-portal-web-${cloud_run_suffix}"',
    );
    expect(workflow).not.toMatch(/Deploy — .*passenger/i);
    expect(workflow).not.toMatch(/Build & push — .*passenger/i);

    const domainWorkflow = readFileSync(
      path.join(repoRoot, ".github/workflows/domain-mappings-dev.yml"),
      "utf8",
    );
    expect(domainWorkflow).not.toContain("concierge.smarttransport.tw");
    expect(domainWorkflow).not.toContain("ride.smarttransport.tw");
    expect(domainWorkflow).toContain("uses: actions/checkout@v4");
    expect(domainWorkflow).toContain(
      "./operations/deployment/map-domain-service.sh",
    );
    expect(domainWorkflow).not.toContain(
      "./operations/deployment/map-domain-service.sh book.smarttransport.tw",
    );
  });

  it("declares the explicit non-production auth mode required by API startup", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );

    const apiEnvStart = workflow.indexOf("- name: Build API env vars");
    const apiEnvEnd = workflow.indexOf("\n      - name:", apiEnvStart + 1);
    const apiEnv = workflow.slice(apiEnvStart, apiEnvEnd);

    expect(apiEnv).toContain("DRTS_ENV=development");
    expect(apiEnv).toContain("AUTH_MODE=explicit");
  });

  it("issues the candidate Tenant session with the canonical tenant_admin scopes", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );
    const sessionStart = workflow.indexOf(
      "- name: Issue deployment-machine Tenant acceptance session",
    );
    const sessionEnd = workflow.indexOf("\n      - uses:", sessionStart);
    const sessionStep = workflow.slice(sessionStart, sessionEnd);
    const scopes = getIamTenantRoleScopes("tenant_admin");

    expect(scopes).not.toBeNull();
    expect(sessionStep).toContain("x-actor-id: tenant-user-demo-001");
    expect(sessionStep).toContain(`x-scopes: ${scopes?.join(" ")}`);
  });

  it("enables public demo login only on the Bank Console deployment", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );
    const deploymentBlock = (service: string) => {
      const start = workflow.indexOf(`- name: Deploy — ${service}`);
      const end = workflow.indexOf("\n      - name:", start + 1);

      expect(start, `${service} deploy step`).toBeGreaterThan(-1);
      return workflow.slice(start, end);
    };

    expect(deploymentBlock("bank-console-web")).toContain(
      "BANK_CONSOLE_DEMO_LOGIN=true",
    );
    for (const service of [
      "platform-admin-web",
      "ops-console-web",
      "fleet-partner-portal-web",
      "tenant-console-web",
      "referral-embed-web",
      "enterprise-dispatch-web",
      "channel-partner-portal-web",
    ]) {
      expect(deploymentBlock(service), service).not.toContain(
        "BANK_CONSOLE_DEMO_LOGIN",
      );
    }
  });

  it("mounts a stable Bank Console session secret in every Dev deploy entrypoint", () => {
    const devWorkflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );
    const deploymentBlock = (service: string) => {
      const start = devWorkflow.indexOf(`- name: Deploy — ${service}`);
      const end = devWorkflow.indexOf("\n      - name:", start + 1);

      expect(start, `${service} deploy step`).toBeGreaterThan(-1);
      return devWorkflow.slice(start, end);
    };

    expect(deploymentBlock("bank-console-web")).toContain(
      "BANK_SESSION_SECRET=",
    );
    expect(devWorkflow.match(/BANK_SESSION_SECRET=/g)).toHaveLength(1);
    expect(devWorkflow).not.toContain("DRTS_PARTNER_SESSION_SECRET=");

    for (const service of [
      "platform-admin-web",
      "ops-console-web",
      "fleet-partner-portal-web",
      "tenant-console-web",
      "referral-embed-web",
      "enterprise-dispatch-web",
      "channel-partner-portal-web",
    ]) {
      expect(deploymentBlock(service), service).not.toContain(
        "BANK_SESSION_SECRET=",
      );
    }

    const bankWorkflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-bank-console.yml"),
      "utf8",
    );
    expect(bankWorkflow).toContain("BANK_SESSION_SECRET=");

    const genericWorkflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-web-app.yml"),
      "utf8",
    );
    expect(genericWorkflow).toContain(
      'inputs.app_dir }}" == "apps/bank-console-web"',
    );
    expect(genericWorkflow).toContain("BANK_SESSION_SECRET=");
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

  it("uses candidate-bound operational acceptance as the sole deployed browser gate", () => {
    const workflow = readFileSync(
      path.join(repoRoot, ".github/workflows/deploy-dev.yml"),
      "utf8",
    );
    const retiredCleanupStart = workflow.indexOf("  retired-service-cleanup:");
    const candidateAcceptanceStart = workflow.indexOf(
      "  operational-candidate-acceptance:",
    );
    const candidateAcceptance = workflow.slice(candidateAcceptanceStart);

    expect(workflow).not.toContain("  ui-smoke:");
    expect(workflow).not.toContain("Run UI smoke against deployed dev");
    expect(workflow).not.toContain("playwright.dev-runtime-matrix.config.ts");
    expect(retiredCleanupStart).toBeGreaterThan(-1);
    expect(candidateAcceptanceStart).toBeGreaterThan(retiredCleanupStart);
    expect(
      workflow.slice(retiredCleanupStart, candidateAcceptanceStart),
    ).toContain("needs: [prepare, health-check]");
    expect(candidateAcceptance).toContain(
      "needs: [prepare, build-push, health-check, retired-service-cleanup]",
    );
    expect(candidateAcceptance).toContain(
      "needs.retired-service-cleanup.result == 'success'",
    );
    expect(candidateAcceptance).toContain(
      "operations/verification/run-operational-browser-acceptance.sh",
    );
    expect(candidateAcceptance).toContain(
      "Issue deployment-machine Tenant acceptance session",
    );
    expect(candidateAcceptance).toContain(
      "DRTS_OPERATIONAL_TENANT_SESSION_TOKEN",
    );
    expect(candidateAcceptance).toContain("x-actor-id: tenant-user-demo-001");
    const lineContinuation = "\\";
    expect(candidateAcceptance).toContain(
      [
        `--header 'x-actor-type: tenant_admin' ${lineContinuation}`,
        `--header 'x-actor-id: tenant-user-demo-001' ${lineContinuation}`,
      ].join("\n            "),
    );
    expect(workflow).toContain("DRTS_INTERNAL_KEY_ENFORCED=false");
    expect(workflow).toContain("AUTH_ALLOWED_ORIGINS=${auth_allowed_origins}");
    expect(workflow).not.toContain(
      "Authenticate to GCP for failure diagnostics",
    );
    expect(workflow).not.toContain("gcloud logging read");
  });
});
