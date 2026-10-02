import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "../..");

const workflowPath = path.join(repoRoot, ".github/workflows/deploy-dev.yml");
const registryDocPath = path.join(
  repoRoot,
  "docs/02-architecture/internal-key-exceptions.md",
);

// Pulls the literal `run: |` shell body out of a step, by its `name:` line,
// so tests can execute the *actual* workflow shell logic (with mocked
// external commands) instead of only pattern-matching the YAML text.
function extractStepRunBody(workflow: string, stepNameHeader: string): string {
  const stepStart = workflow.indexOf(stepNameHeader);
  if (stepStart === -1) {
    throw new Error(`step not found: ${stepNameHeader}`);
  }
  const runMarker = "run: |\n";
  const runStart = workflow.indexOf(runMarker, stepStart);
  if (runStart === -1) {
    throw new Error(`run block not found for step: ${stepNameHeader}`);
  }
  const bodyStart = runStart + runMarker.length;
  const nextStepMarker = "\n      - name:";
  const nextStepIndex = workflow.indexOf(nextStepMarker, bodyStart);
  const bodyEnd = nextStepIndex === -1 ? workflow.length : nextStepIndex;
  return workflow
    .slice(bodyStart, bodyEnd)
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
}

// Runs an extracted step body under bash with the real `gcloud`/`sleep`
// commands replaced, so the collision-retry logic can be exercised without
// calling Google or sleeping for real. The mock enforces the actual gcloud
// *contract* this step depends on (CI-DEPLOY-DEV-WIF-ASSERTION-COLLISION-
// 20261002 F3): `gcloud auth print-identity-token` rejects a Direct-WIF
// (no-service-account) base credential for `--audiences`/`--include-email`
// unless `--impersonate-service-account=<email>` is also present (gcloud's
// own auth_util.ValidIdTokenCredential / IsImpersonationCredential checks,
// verified against the installed Cloud SDK at
// /snap/google-cloud-cli/current/lib/googlecloudsdk/command_lib/auth/auth_util.py
// and surface/auth/print_identity_token.py). A mock that accepted any
// invocation whose first two words are "auth print-identity-token" would
// pass even for the F3-broken command, so this one additionally checks the
// full argv.
function runStepBody(
  body: string,
  opts: {
    env: Record<string, string>;
    mockGcloudResponses: string[];
    requireImpersonateServiceAccount?: string;
  },
): {
  status: number | null;
  stdout: string;
  stderr: string;
  githubOutput: string;
  gcloudCallCount: number;
} {
  const outDir = mkdtempSync(path.join(tmpdir(), "wif-collision-test-"));
  const githubOutputPath = path.join(outDir, "github_output");
  const callCountPath = path.join(outDir, "gcloud_call_count");
  const responsesPath = path.join(outDir, "gcloud_responses");

  writeFileSync(githubOutputPath, "");
  writeFileSync(callCountPath, "0");
  writeFileSync(responsesPath, opts.mockGcloudResponses.join("\n") + "\n");

  const requiredImpersonation = opts.requireImpersonateServiceAccount;
  const impersonationGuard = requiredImpersonation
    ? `
  local saw_flag=0
  for arg in "$@"; do
    if [[ "$arg" == "--impersonate-service-account=${requiredImpersonation}" ]]; then
      saw_flag=1
    fi
  done
  if [[ "$saw_flag" -ne 1 ]]; then
    echo "ERROR: (gcloud.auth.print-identity-token) Invalid account type for \\\`--audiences\\\`. Requires valid service account." >&2
    return 1
  fi
`
    : "";

  const harness = `
set -uo pipefail
RESPONSES_FILE="${responsesPath}"
CALL_COUNT_FILE="${callCountPath}"
gcloud() {
  if [[ "$1" == "auth" && "$2" == "print-identity-token" ]]; then
${impersonationGuard}
    local n
    n="$(cat "$CALL_COUNT_FILE")"
    n=$((n + 1))
    echo "$n" > "$CALL_COUNT_FILE"
    sed -n "$n"p "$RESPONSES_FILE"
    return 0
  fi
  return 1
}
sleep() { :; }
${body}
`;

  const result = spawnSync("bash", ["-c", harness], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_OUTPUT: githubOutputPath, ...opts.env },
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    githubOutput: readFileSync(githubOutputPath, "utf8"),
    gcloudCallCount: Number(readFileSync(callCountPath, "utf8").trim() || "0"),
  };
}

describe("SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001: deploy-dev WIF assertion reuse", () => {
  it("mints a separate Google identity token for each of the two operational POST /api/auth/token calls", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    const mintSteps = workflow.match(/id: id_token_api_operational(_ops)?\n/g);
    expect(mintSteps).not.toBeNull();
    expect(mintSteps).toHaveLength(2);

    expect(workflow).toContain(
      "GOOGLE_ID_TOKEN_TENANT_ADMIN: ${{ steps.id_token_api_operational.outputs.id_token }}",
    );
    expect(workflow).toContain(
      "GOOGLE_ID_TOKEN_TENANT_OPS: ${{ steps.id_token_api_operational_ops.outputs.id_token }}",
    );

    // Neither curl call may fall back to a bare, shared `GOOGLE_ID_TOKEN`
    // variable -- that was the reuse bug (GoogleWorkloadIdentityAdapter
    // rejects a replayed assertion hash with WORKLOAD_ASSERTION_REPLAYED).
    expect(workflow).not.toMatch(/\$\{GOOGLE_ID_TOKEN\}/);

    const headerAssertions = workflow.match(
      /x-drts-google-id-token: \$\{GOOGLE_ID_TOKEN_TENANT_(ADMIN|OPS)\}/g,
    );
    expect(headerAssertions).not.toBeNull();
    expect(headerAssertions).toContain(
      "x-drts-google-id-token: ${GOOGLE_ID_TOKEN_TENANT_ADMIN}",
    );
    expect(headerAssertions).toContain(
      "x-drts-google-id-token: ${GOOGLE_ID_TOKEN_TENANT_OPS}",
    );
    // The two live POST /api/auth/token calls must not send the same
    // assertion variable twice.
    expect(new Set(headerAssertions).size).toBe(2);
  });

  it("no longer sends the legacy x-drts-internal-key for caller #9 (SEC-INTERNAL-KEY-WIF-MIGRATION-20260930: INTERNAL_KEY_EXCP_002 retired)", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).not.toMatch(/x-drts-internal-key: \$\{internal_key\}/);
    expect(workflow).not.toContain(
      'internal_key="$(gcloud secrets versions access latest',
    );
  });
});

describe("CI-DEPLOY-DEV-WIF-ASSERTION-COLLISION-20261002: the two operational-acceptance mints are provably distinct, not just two separate steps", () => {
  const opsStepHeader =
    "name: Mint identity token — API operational acceptance (Tenant Ops)";
  const FAKE_SA = "ci-deployer@example.iam.gserviceaccount.com";

  it("mints the Tenant Ops token with gcloud after the Tenant Admin mint, not with a second auth@v2 action", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    const adminMintIndex = workflow.indexOf("id: id_token_api_operational\n");
    const opsMintIndex = workflow.indexOf("id: id_token_api_operational_ops");

    expect(adminMintIndex).toBeGreaterThan(-1);
    expect(opsMintIndex).toBeGreaterThan(-1);
    expect(adminMintIndex).toBeLessThan(opsMintIndex);

    const opsStepStart = workflow.indexOf(opsStepHeader);
    const opsStepEnd = workflow.indexOf(
      "\n      - name: Issue deployment-machine Tenant acceptance session",
      opsStepStart,
    );
    const opsStepBody = workflow.slice(opsStepStart, opsStepEnd);

    // A second `uses: google-github-actions/auth@v2` here is exactly the
    // clock-synchronization bug: it cannot compare the resulting token
    // against the Tenant Admin token, only guess at timing via this
    // runner's own clock, which does not share a clock with Google's
    // token-issuing service.
    expect(opsStepBody).not.toContain("uses: google-github-actions/auth@v2");
    expect(opsStepBody).toContain(
      "gcloud auth print-identity-token --impersonate-service-account=",
    );
    expect(opsStepBody).toContain("--audiences=");
    // SERVICE_ACCOUNT must be threaded in via env, the same expression every
    // other auth@v2 step in this workflow uses, not a hardcoded account.
    expect(opsStepBody).toContain(
      "SERVICE_ACCOUNT: ${{ env.DEV_WIF_SERVICE_ACCOUNT || env.WIF_SERVICE_ACCOUNT }}",
    );
  });

  it("F3 regression guard: the job-level 'Authenticate to GCP' step for this job does not set service_account (would make the later --impersonate-service-account call self-impersonation)", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    const jobStart = workflow.indexOf("  operational-candidate-acceptance:");
    expect(jobStart).toBeGreaterThan(-1);
    const authStepHeader = "- name: Authenticate to GCP";
    const authStepStart = workflow.indexOf(authStepHeader, jobStart);
    expect(authStepStart).toBeGreaterThan(-1);
    const authStepEnd = workflow.indexOf(
      "- name: Set up Cloud SDK",
      authStepStart,
    );
    const authStepBody = workflow.slice(authStepStart, authStepEnd);

    expect(authStepBody).not.toContain("service_account:");
    expect(authStepBody).toContain("workload_identity_provider:");
  });

  it("F3 follow-up regression guard: the intervening Tenant Admin mint step does not overwrite the base Direct-WIF credential the Ops step depends on", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    // google-github-actions/auth@v2 defaults both `create_credentials_file`
    // and `export_environment_variables` to true (action.yml), so a
    // `service_account:`-bearing step between "Authenticate to GCP" and the
    // Ops step silently replaces CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE /
    // GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_GHA_CREDS_PATH with a new,
    // already-impersonated credential file -- the Ops step's
    // `--impersonate-service-account` call would then be the service
    // account impersonating itself. Checking only the first "Authenticate to
    // GCP" step (as the prior test does) misses this: it is the ordered
    // *chain* of credential writers up to the Ops step that matters, not
    // any single step in isolation.
    const adminStepHeader =
      "- name: Mint identity token — API operational acceptance (Tenant Admin)";
    const opsStepHeader =
      "- name: Mint identity token — API operational acceptance (Tenant Ops)";
    const adminStepStart = workflow.indexOf(adminStepHeader);
    const opsStepStart = workflow.indexOf(opsStepHeader);
    expect(adminStepStart).toBeGreaterThan(-1);
    expect(opsStepStart).toBeGreaterThan(adminStepStart);

    const adminStepBody = workflow.slice(adminStepStart, opsStepStart);

    // It must still mint the id_token this job actually consumes.
    expect(adminStepBody).toContain("token_format: id_token");
    // It must not become a new base credential for later steps.
    expect(adminStepBody).toContain("create_credentials_file: false");
    expect(adminStepBody).toContain("export_environment_variables: false");

    // No other `service_account:`-bearing auth@v2 step may sit between
    // "Authenticate to GCP" and the Ops step without the same guard --
    // otherwise it would reintroduce the same self-impersonation failure
    // even if the named Tenant Admin step above stays fixed.
    const jobStart = workflow.indexOf("  operational-candidate-acceptance:");
    const authStepStart = workflow.indexOf(
      "- name: Authenticate to GCP",
      jobStart,
    );
    // Strip comment lines first -- this workflow documents the fix in `#`
    // prose that itself mentions `create_credentials_file: false`, which
    // would otherwise double-count against the real YAML keys below.
    const interveningCode = workflow
      .slice(authStepStart, opsStepStart)
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    const serviceAccountSteps = interveningCode.match(
      /service_account: \$\{\{[^}]*\}\}/g,
    );
    expect(serviceAccountSteps).not.toBeNull();
    expect(
      interveningCode.match(/create_credentials_file: false/g),
    ).toHaveLength(serviceAccountSteps?.length ?? 0);
    expect(
      interveningCode.match(/export_environment_variables: false/g),
    ).toHaveLength(serviceAccountSteps?.length ?? 0);
  });

  it("extracted shell: re-mints and compares actual token bytes until distinct, not just a fixed number of retries or a time guess", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const body = extractStepRunBody(workflow, opsStepHeader);

    // Simulates a real collision: the first two `gcloud` mints come back
    // byte-identical to the already-minted Tenant Admin token (the actual
    // failure mode from Supervisor's run 36988770406), and only the third
    // mint is distinct. The mock also enforces the F3 credential contract
    // (--impersonate-service-account must be present), so this test would
    // fail against the pre-F3-fix command just as much as against a
    // fixed-time-guess reimplementation.
    const result = runStepBody(body, {
      env: {
        GOOGLE_ID_TOKEN_TENANT_ADMIN: "FAKE_ADMIN_TOKEN_abc123",
        OPS_TOKEN_AUDIENCE: "https://example.test/api",
        SERVICE_ACCOUNT: FAKE_SA,
      },
      requireImpersonateServiceAccount: FAKE_SA,
      mockGcloudResponses: [
        "FAKE_ADMIN_TOKEN_abc123",
        "FAKE_ADMIN_TOKEN_abc123",
        "FAKE_OPS_TOKEN_xyz789",
      ],
    });

    expect(result.status).toBe(0);
    expect(result.gcloudCallCount).toBe(3);
    expect(result.githubOutput).toContain("id_token=FAKE_OPS_TOKEN_xyz789");
    expect(result.githubOutput).not.toContain("FAKE_ADMIN_TOKEN_abc123");
  });

  it("extracted shell: fails closed (not just a generic non-zero exit) when gcloud rejects the credential type, e.g. a regression that drops --impersonate-service-account", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const body = extractStepRunBody(workflow, opsStepHeader);

    // Mock requires a *different* service account than the one the step
    // actually passes, reproducing gcloud's real WrongAccountTypeError
    // rejection path (auth_util.ValidIdTokenCredential /
    // IsImpersonationCredential) for every attempt.
    const result = runStepBody(body, {
      env: {
        GOOGLE_ID_TOKEN_TENANT_ADMIN: "FAKE_ADMIN_TOKEN_abc123",
        OPS_TOKEN_AUDIENCE: "https://example.test/api",
        SERVICE_ACCOUNT: FAKE_SA,
      },
      requireImpersonateServiceAccount:
        "some-other-account@example.iam.gserviceaccount.com",
      mockGcloudResponses: ["unused"],
    });

    expect(result.status).not.toBe(0);
    expect(result.githubOutput).not.toContain("id_token=");
  });

  it("extracted shell: fails the job instead of looping forever if gcloud keeps returning the same token", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const body = extractStepRunBody(workflow, opsStepHeader);

    const result = runStepBody(body, {
      env: {
        GOOGLE_ID_TOKEN_TENANT_ADMIN: "FAKE_ADMIN_TOKEN_abc123",
        OPS_TOKEN_AUDIENCE: "https://example.test/api",
        SERVICE_ACCOUNT: FAKE_SA,
      },
      requireImpersonateServiceAccount: FAKE_SA,
      mockGcloudResponses: new Array(5).fill("FAKE_ADMIN_TOKEN_abc123"),
    });

    expect(result.status).not.toBe(0);
    expect(result.gcloudCallCount).toBe(5);
    expect(result.githubOutput).not.toContain("id_token=");
    expect(result.stderr).toContain("::error::");
  });

  it("extracted shell: never prints a raw token or payload outside the add-mask registration lines", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const body = extractStepRunBody(workflow, opsStepHeader);

    const adminToken = "FAKE_ADMIN_TOKEN_abc123";
    const opsToken = "FAKE_OPS_TOKEN_xyz789";
    const result = runStepBody(body, {
      env: {
        GOOGLE_ID_TOKEN_TENANT_ADMIN: adminToken,
        OPS_TOKEN_AUDIENCE: "https://example.test/api",
        SERVICE_ACCOUNT: FAKE_SA,
      },
      requireImpersonateServiceAccount: FAKE_SA,
      mockGcloudResponses: [opsToken],
    });

    expect(result.status).toBe(0);
    const offendingLines = result.stdout
      .split("\n")
      .filter(
        (line) =>
          (line.includes(adminToken) || line.includes(opsToken)) &&
          !line.startsWith("::add-mask::"),
      );
    expect(offendingLines).toEqual([]);
  });
});

describe("SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001: WIF registry operator doc audience accuracy", () => {
  it("no longer tells ops to register the token-exchange audience for the Google-assertion callers", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    // The old (wrong) instruction set both entries' audience directly
    // beneath the "Both entries need `principalId`" line. That adjacency
    // must be gone -- the string itself may still appear elsewhere as
    // quoted history of the bug (e.g. in this task's own before/after
    // evidence row), which is fine.
    expect(doc).not.toMatch(
      /Both entries need `principalId`[^\n]*\n[^\n]*\nallowedTokenAudiences: \["https:\/\/auth\.dev\.drts\.internal\/token-exchange"\]/,
    );
    expect(doc).toContain(
      "**Audience correction (`SEC-INTERNAL-KEY-WIF-OPS-READINESS-20261001`):**",
    );
    expect(doc).toMatch(
      /line above previously said both entries need\n`allowedTokenAudiences: \["https:\/\/auth\.dev\.drts\.internal\/token-exchange"\]`/,
    );
  });

  it("documents the actual minted audience (API Cloud Run origin) for both registry entries", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain("Audience correction");
    expect(doc).toContain("WORKLOAD_AUDIENCE_MISMATCH");
    expect(doc).toContain("apps/partner-booking-web/lib/api-client.ts:100-104");
    expect(doc).toContain("needs.health-check.outputs.api");
    expect(doc).toContain("DEV_IAP_CLIENT_ID");
  });

  it("SEC-INTERNAL-KEY-WIF-MIGRATION-20260930 removed INTERNAL_KEY_EXCP_002 and its legacy internal-key fallback from the workflow", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    // deploy-dev.yml's operational-acceptance step no longer reads or sends
    // the legacy internal key; the Google assertion is its only credential.
    expect(workflow).not.toContain("x-drts-internal-key:");
  });
});

describe("SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001: deploy-dev CI authorization actorType matches the documented registry grant", () => {
  it("both operational-acceptance POST /api/auth/token calls send the literal x-actor-type header actually documented for their ciTenantActorGrants entry", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    // Both calls (Tenant Admin actor ...901 and the Tenant Ops dispatch actor
    // ...902) send the same literal x-actor-type header; only x-actor-id
    // differs. The resulting *session role* for ...902 comes out as
    // tenant_ops_admin from the durable tenant-user fixture lookup, not from
    // this header -- so the registry's ciTenantActorGrants entry for ...902
    // must match the header's actual actorType (tenant_admin), not the
    // session's eventual role.
    const actorTypeHeaders = workflow.match(
      /x-actor-type: (tenant_admin|tenant_ops_admin)'/g,
    );
    expect(actorTypeHeaders).not.toBeNull();
    expect(actorTypeHeaders).toHaveLength(2);
    for (const header of actorTypeHeaders!) {
      expect(header).toBe("x-actor-type: tenant_admin'");
    }
  });

  it("documents both ciTenantActorGrants entries (actorId ...901 and ...902) with actorType tenant_admin, matching the workflow header", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain(
      '{tenantId: "10000000-0000-0000-0000-000000000201", actorType: "tenant_admin", actorId: "10000000-0000-0000-0000-000000000901"}',
    );
    expect(doc).toContain(
      '{tenantId: "10000000-0000-0000-0000-000000000201", actorType: "tenant_admin", actorId: "10000000-0000-0000-0000-000000000902"}',
    );
    // The old, wrong recommendation (a tenant_ops_admin *grant*, as opposed
    // to the still-correct tenant_ops_admin *resulting session role*) must
    // be gone from both places that previously stated it.
    expect(doc).not.toMatch(
      /\.\.\.000902` \/ `tenant_ops_admin` pair\) and sets/,
    );
    expect(doc).not.toMatch(
      /the `\.\.\.000902` \/ `tenant_ops_admin` pair, exactly as §7\.2 item 1 already specified\./,
    );
  });
});

describe("SEC-INTERNAL-KEY-WIF-PROXY-REPLAY-20261001: registry doc documents a pasteable two-entry registry JSON", () => {
  it("provides a directly pasteable WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS JSON array with the verified service accounts", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain(
      "drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    );
    expect(doc).toContain(
      "github-actions-deployer@drts-dev-devcc-20260825.iam.gserviceaccount.com",
    );
    expect(doc).toContain("WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS=");
    expect(doc).toMatch(/```json\n\[\s*\n\s*\{/);
  });

  it("tells ops to switch only Entry A's audience to DEV_IAP_CLIENT_ID, keeping Entry B on the API origin (deploy-dev.yml's CI mint steps never read that variable)", () => {
    const doc = readFileSync(registryDocPath, "utf8");
    const workflow = readFileSync(workflowPath, "utf8");

    // The wrong instruction said to switch *both* entries; that would make
    // Entry B's token audience stop matching its allowedTokenAudiences and
    // 403 every CI operational-acceptance call the moment ops set the var.
    expect(doc).not.toMatch(/switch both entries to `vars\.DEV_IAP_CLIENT_ID`/);
    expect(doc).toMatch(/only \*\*Entry A\*\*'s[\s\S]*must switch/);
    expect(doc).toMatch(/\*\*Entry B\*\* must stay on the live API origin/);

    // Lock the premise the corrected instruction depends on: both CI mint
    // steps stay keyed to the health-check API output, not an IAP client id.
    // The Tenant Admin mint still sets `id_token_audience` directly on the
    // auth@v2 action; the Tenant Ops mint (CI-DEPLOY-DEV-WIF-ASSERTION-
    // COLLISION-20261002) instead passes the same value through to its
    // `gcloud auth print-identity-token --audiences=` call via an
    // OPS_TOKEN_AUDIENCE env var -- same audience, different plumbing.
    const adminMintAudiences = workflow.match(
      /id_token_audience: \$\{\{ needs\.health-check\.outputs\.api \}\}/g,
    );
    const opsMintAudiences = workflow.match(
      /OPS_TOKEN_AUDIENCE: \$\{\{ needs\.health-check\.outputs\.api \}\}/g,
    );
    expect(adminMintAudiences).not.toBeNull();
    expect(adminMintAudiences).toHaveLength(1);
    expect(opsMintAudiences).not.toBeNull();
    expect(opsMintAudiences).toHaveLength(1);
    expect(workflow).not.toMatch(/id_token_audience:.*DEV_IAP_CLIENT_ID/);
    expect(workflow).not.toMatch(/OPS_TOKEN_AUDIENCE:.*DEV_IAP_CLIENT_ID/);
  });

  it("documents the live-map observer caller as an unresolved coordination blocker, not a silent Entry B widening or a duplicate-email entry", () => {
    const doc = readFileSync(registryDocPath, "utf8");

    expect(doc).toContain("live-map-observer");
    expect(doc).toContain("WORKLOAD_CI_TENANT_ACTOR_DENIED");
    expect(doc).toMatch(
      /coordinated with the live-map task owner|live-map task owner's agreement/,
    );
    // Must not instruct silently widening Entry B or duplicating its email.
    expect(doc).not.toMatch(
      /add (the )?observer (permission|grant) to (deployer )?(entry )?B/i,
    );
  });
});
