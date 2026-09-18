import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EntryRunnerInputError,
  runEntryAcceptance,
  validateEntryRunnerInputs,
  type EntryRunnerConfig,
  type EntryRunnerEnv,
  type RoleBoundaryResult,
  type VerifierRunResult,
} from "../../../e2e/system-remediation/sr-live-entry-001/entry-acceptance-runner";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";

const VALID_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

function baseEnv(overrides: Partial<EntryRunnerEnv> = {}): EntryRunnerEnv {
  return {
    DRTS_CANDIDATE_SHA: VALID_SHA,
    WORKFLOW_SHA: VALID_SHA,
    DRTS_LIVE_ENTRY_ALLOWED_TARGETS:
      "https://api.dev.drts-fleet.example.com,https://tenant.dev.drts-fleet.example.com,https://platform.dev.drts-fleet.example.com,https://ops.dev.drts-fleet.example.com",
    DRTS_LIVE_ENTRY_API_ORIGIN: "https://api.dev.drts-fleet.example.com",
    DRTS_LIVE_ENTRY_TENANT_ORIGIN: "https://tenant.dev.drts-fleet.example.com",
    DRTS_LIVE_ENTRY_PLATFORM_ORIGIN: "https://platform.dev.drts-fleet.example.com",
    DRTS_LIVE_ENTRY_OPS_ORIGIN: "https://ops.dev.drts-fleet.example.com",
    DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN: "real-deployment-issued-session-token",
    DRTS_LIVE_ENTRY_AUTHORIZED_ROLES: "ops_dispatcher_live,tenant_admin_live",
    DRTS_LIVE_ENTRY_AUTHORIZED_ROLE: "ops_dispatcher_live",
    DRTS_LIVE_ENTRY_POSITIVE_ROUTE: "/ops/dispatch/board",
    DRTS_LIVE_ENTRY_POSITIVE_EXPECTED_STATUS: "200",
    DRTS_LIVE_ENTRY_NEGATIVE_ROUTE: "/ops/dispatch/board",
    DRTS_LIVE_ENTRY_NEGATIVE_EXPECTED_STATUS: "401",
    ...overrides,
  };
}

const PASSING_VERIFIER_STDOUT = `
[1/7] Proving Live Cloud API Health & Endpoint Connectivity...
[2/7] Proving Live Strict Unauthenticated Rejection on Protected API Routes (G6)...
[3/7] Proving Live Tenant Console Session Boundary without Demo Credentials (G1, G2)...
[4/7] Proving Live Tenant Console OIDC Authorization Initiation (G1, G7)...
[5/7] Proving Live Tenant Console Mutating CSRF & Same-Origin Enforcement (G3)...
[6/7] Proving Live Platform Admin & Ops Console Workforce Gateways...
[7/7] Proving Live Zero Sensitive Secret & Token Leakage (G2, G8)...
Live Staging Verification Complete: 12 assertions passed, 0 failures.
`;

function passingVerifierResult(): VerifierRunResult {
  return { exitCode: 0, stdout: PASSING_VERIFIER_STDOUT, stderr: "" };
}

function passingBoundaryResult(candidateSha: string): RoleBoundaryResult {
  return { positiveStatus: 200, negativeStatus: 401, deployedCandidateSha: candidateSha };
}

describe("validateEntryRunnerInputs", () => {
  it("accepts a fully valid configuration", () => {
    const config = validateEntryRunnerInputs(baseEnv());
    expect(config.candidateSha).toBe(VALID_SHA);
    expect(config.apiOrigin).toBe("https://api.dev.drts-fleet.example.com");
  });

  it("fails closed when DRTS_CANDIDATE_SHA is missing", () => {
    const env = baseEnv({ DRTS_CANDIDATE_SHA: undefined });
    expect(() => validateEntryRunnerInputs(env)).toThrow(EntryRunnerInputError);
  });

  it("rejects a malformed / non-40-hex candidate SHA (wrong SHA)", () => {
    const env = baseEnv({ DRTS_CANDIDATE_SHA: "not-a-real-sha" });
    expect(() => validateEntryRunnerInputs(env)).toThrow(/40-character/);
  });

  it("rejects a target origin outside the explicit allowlist (wrong target)", () => {
    const env = baseEnv({ DRTS_LIVE_ENTRY_API_ORIGIN: "https://attacker.example.com" });
    expect(() => validateEntryRunnerInputs(env)).toThrow(/DRTS_LIVE_ENTRY_ALLOWED_TARGETS/);
  });

  it("rejects a historical-default-shaped origin that is not in the allowlist", () => {
    const env = baseEnv({ DRTS_LIVE_ENTRY_API_ORIGIN: "https://api.staging.drts-fleet.cctech-support.com" });
    expect(() => validateEntryRunnerInputs(env)).toThrow(EntryRunnerInputError);
  });

  it("fails closed when the role session token is absent (absent authorization)", () => {
    const env = baseEnv({ DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN: undefined });
    expect(() => validateEntryRunnerInputs(env)).toThrow(/DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN/);
  });

  it("rejects a role not present in the explicit authorized-role allowlist (wrong role)", () => {
    const env = baseEnv({ DRTS_LIVE_ENTRY_AUTHORIZED_ROLE: "platform_admin_live" });
    expect(() => validateEntryRunnerInputs(env)).toThrow(/allowlist/);
  });

  it("rejects a fixture/demo persona role even if it were placed in the allowlist (wrong role)", () => {
    const env = baseEnv({
      DRTS_LIVE_ENTRY_AUTHORIZED_ROLES: "ops_dispatcher_live,demo_admin",
      DRTS_LIVE_ENTRY_AUTHORIZED_ROLE: "demo_admin",
    });
    expect(() => validateEntryRunnerInputs(env)).toThrow(/fixture\/demo persona/);
  });

  it("rejects a baseline UAT fixture persona role name (wrong role)", () => {
    const env = baseEnv({
      DRTS_LIVE_ENTRY_AUTHORIZED_ROLES: "platform_admin",
      DRTS_LIVE_ENTRY_AUTHORIZED_ROLE: "platform_admin",
    });
    expect(() => validateEntryRunnerInputs(env)).toThrow(EntryRunnerInputError);
  });

  it("rejects a non-numeric expected status code", () => {
    const env = baseEnv({ DRTS_LIVE_ENTRY_POSITIVE_EXPECTED_STATUS: "ok" });
    expect(() => validateEntryRunnerInputs(env)).toThrow(/HTTP status code/);
  });
});

describe("runEntryAcceptance", () => {
  let recorder: UatEvidenceRecorder;
  let config: EntryRunnerConfig;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    config = validateEntryRunnerInputs(baseEnv());
    recorder = new UatEvidenceRecorder({ taskId: "sr-live-entry-001", candidateSha: config.candidateSha });
    // Guardrail: the pure orchestration function must never itself reach the
    // network. If it does, this spy throws and the test fails loudly.
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("runEntryAcceptance must not contact the network directly; use injected deps.");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("passes when the checked-out SHA, verifier, and role boundary are all fully correct", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(config.candidateSha));

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("passed");
    expect(result.reasons).toEqual([]);
    expect(invokeVerifier).toHaveBeenCalledWith(config);
    expect(checkRoleBoundary).toHaveBeenCalledWith(config);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails when the checked-out workflow SHA does not match the candidate SHA (wrong SHA)", async () => {
    const drifted: EntryRunnerConfig = { ...config, workflowSha: OTHER_SHA };
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(drifted.candidateSha));

    const result = await runEntryAcceptance(drifted, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/does not match the requested candidate SHA/);
  });

  it("fails when verify-iam-staging-live.mjs exits non-zero", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue({ exitCode: 1, stdout: PASSING_VERIFIER_STDOUT, stderr: "boom" });
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(config.candidateSha));

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/exited with code 1/);
  });

  it("fails on a partial verifier result missing required check sections (partial/skip)", async () => {
    const partialStdout = PASSING_VERIFIER_STDOUT.split("[5/7]")[0] as string;
    const invokeVerifier = vi.fn().mockResolvedValue({ exitCode: 0, stdout: partialStdout, stderr: "" });
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(config.candidateSha));

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/partial\/skipped result/);
  });

  it("fails when the verifier's own summary reports failing assertions", async () => {
    const failingStdout = PASSING_VERIFIER_STDOUT.replace(
      "Live Staging Verification Complete: 12 assertions passed, 0 failures.",
      "Live Staging Verification Complete: 10 assertions passed, 2 failures.",
    );
    const invokeVerifier = vi.fn().mockResolvedValue({ exitCode: 1, stdout: failingStdout, stderr: "" });
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(config.candidateSha));

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/2 failing assertion/);
  });

  it("fails when the authorized role does not receive the expected positive status (wrong role boundary)", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());
    const checkRoleBoundary = vi
      .fn()
      .mockResolvedValue({ positiveStatus: 403, negativeStatus: 401, deployedCandidateSha: config.candidateSha });

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/received HTTP 403/);
  });

  it("fails when the negative boundary is not rejected as expected (wrong role escalation)", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());
    const checkRoleBoundary = vi
      .fn()
      .mockResolvedValue({ positiveStatus: 200, negativeStatus: 200, deployedCandidateSha: config.candidateSha });

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/negative-boundary request/);
  });

  it("fails when the deployed candidate SHA header does not match the requested candidate (wrong target/deploy)", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(OTHER_SHA));

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/Deployed candidate SHA header reported/);
  });

  it("records redacted evidence and never leaks the raw role session token into evidence", async () => {
    const secretToken = config.roleSessionToken;
    const invokeVerifier = vi
      .fn()
      .mockResolvedValue({ exitCode: 0, stdout: `${PASSING_VERIFIER_STDOUT}\nBearer ${secretToken}`, stderr: "" });
    const checkRoleBoundary = vi.fn().mockResolvedValue(passingBoundaryResult(config.candidateSha));

    const result = await runEntryAcceptance(config, { invokeVerifier, checkRoleBoundary, recorder });

    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain(secretToken);
  });
});
