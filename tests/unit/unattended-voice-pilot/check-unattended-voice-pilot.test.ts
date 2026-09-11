import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  runPilotAcceptanceGate,
  getApplicableAcs,
  validateShaConsistency,
  validateCohort,
  validateAuthorization,
  validateDrills,
} from "../../../operations/verification/check-unattended-voice-pilot.mjs";

const EXPECTED_SHA = "a".repeat(40);
const OTHER_SHA = "b".repeat(40);

const FIXTURE_MANIFEST = {
  acceptance_criteria: [
    { ac_id: "UV-AC-001", status_category: "pending" },
    { ac_id: "UV-AC-032", status_category: "pass" },
    { ac_id: "UV-AC-034", status_category: "live" },
    { ac_id: "UV-AC-038", status_category: "conditional" },
  ],
};

function buildValidEvidence(overrides: Record<string, unknown> = {}) {
  const base = {
    candidate_sha: EXPECTED_SHA,
    submitted_at: new Date().toISOString(),
    dev_deploy: { sha: EXPECTED_SHA, run_url: "https://ci.example/dev-deploy/123" },
    operational_acceptance: { sha: EXPECTED_SHA, run_url: "https://ci.example/ops-accept/123" },
    pilot_operational_authorization: {
      authorized: true,
      approver: "ops-lead@example.com",
      approved_at: new Date().toISOString(),
      reference: "AUTH-UV-PILOT-20260911-001",
    },
    enabled_scope: {
      languages: ["zh-TW"],
      routes: ["airport-express"],
      model_profiles: ["twm_llm_twm"],
    },
    ac_evidence: [
      { ac_id: "UV-AC-032", result: "pass", mode: "fixture", run_sha: EXPECTED_SHA, evidence_ref: "operations/verification/unattended-voice-eval.mjs#run-1" },
      { ac_id: "UV-AC-034", result: "pass", mode: "live", run_sha: EXPECTED_SHA, evidence_ref: "docs/04-uat/unattended-voice-live-telephony-evidence.md#uv-ac-034" },
      { ac_id: "UV-AC-038", result: "pass", mode: "fixture", run_sha: EXPECTED_SHA, evidence_ref: "operations/verification/unattended-voice-eval.mjs#run-2" },
    ],
    cohort: {
      window_start: new Date(Date.now() - 3600_000).toISOString(),
      window_end: new Date().toISOString(),
      total_incoming_calls: 100,
      per_language: {
        "zh-TW": { total: 100, human_exceptions: 4 },
      },
      human_exception_count: 4,
      human_exception_rate: 0.04,
    },
    language_route_model_profile_signoff: [
      {
        language: "zh-TW",
        route: "airport-express",
        model_profile: "twm_llm_twm",
        approver: "ops-lead@example.com",
        approved_at: new Date().toISOString(),
      },
    ],
    staffing_callback_drill_evidence: {
      drill_date: new Date().toISOString(),
      executor: "ops-oncall@example.com",
      scenario: "callback queue overflow",
      outcome: "pass",
      artifact_ref: "docs/03-runbooks/unattended-voice-operations.md#drill-1",
    },
    kill_switch_rollback_drill_evidence: {
      drill_date: new Date().toISOString(),
      executor: "ops-oncall@example.com",
      scenario: "kill-switch rollback",
      outcome: "pass",
      artifact_ref: "docs/03-runbooks/unattended-voice-operations.md#drill-2",
    },
  };
  return { ...base, ...overrides };
}

describe("UV-EXEC-029-PILOT-RUNNER: getApplicableAcs", () => {
  it("excludes pending ACs and keeps conditional/live/pass", () => {
    const applicable = getApplicableAcs(FIXTURE_MANIFEST);
    expect(applicable.map((ac: { ac_id: string }) => ac.ac_id).sort()).toEqual(["UV-AC-032", "UV-AC-034", "UV-AC-038"]);
  });
});

describe("UV-EXEC-029-PILOT-RUNNER: runPilotAcceptanceGate", () => {
  const tempDir = path.join(os.tmpdir(), "uv-exec-029-pilot-runner-tests");
  let manifestPath: string;

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    manifestPath = path.join(tempDir, `manifest-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(FIXTURE_MANIFEST), "utf-8");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeEvidence(evidence: unknown) {
    const evidencePath = path.join(tempDir, `evidence-${Date.now()}-${Math.random()}.json`);
    fs.writeFileSync(evidencePath, JSON.stringify(evidence), "utf-8");
    return evidencePath;
  }

  it("accepts a fully compliant pilot evidence bundle", () => {
    const evidencePath = writeEvidence(buildValidEvidence());
    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.report?.required_acceptance).toEqual({
      pilot_operational_authorization: true,
      dev_deploy_run_url: true,
      dev_deploy_sha: true,
      operational_acceptance_run_url: true,
      operational_acceptance_sha: true,
      all_applicable_ac_evidence: true,
      human_exception_rate_full_cohort: true,
      language_route_model_profile_signoff: true,
      staffing_callback_drill_evidence: true,
      kill_switch_rollback_drill_evidence: true,
    });
  });

  it("rejects evidence missing an applicable AC (partial AC coverage)", () => {
    const evidence = buildValidEvidence();
    evidence.ac_evidence = evidence.ac_evidence.filter((e: any) => e.ac_id !== "UV-AC-034");
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("AC_MISSING:UV-AC-034");
    expect(result.report?.required_acceptance.all_applicable_ac_evidence).toBe(false);
  });

  it("rejects a wrong candidate SHA", () => {
    const evidence = buildValidEvidence({ candidate_sha: OTHER_SHA });
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures.some((f: string) => f.startsWith("SHA_MISMATCH:candidate_sha"))).toBe(true);
  });

  it("rejects an AC evidence entry stamped with a different run SHA than the candidate", () => {
    const evidence = buildValidEvidence();
    evidence.ac_evidence = evidence.ac_evidence.map((e: any) =>
      e.ac_id === "UV-AC-032" ? { ...e, run_sha: OTHER_SHA } : e,
    );
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain(`AC_WRONG_SHA:UV-AC-032:expected=${EXPECTED_SHA}:actual=${OTHER_SHA}`);
  });

  it("rejects a live-category AC claimed via fixture-only mode", () => {
    const evidence = buildValidEvidence();
    evidence.ac_evidence = evidence.ac_evidence.map((e: any) =>
      e.ac_id === "UV-AC-034" ? { ...e, mode: "fixture" } : e,
    );
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("AC_FIXTURE_ONLY_FOR_LIVE_CATEGORY:UV-AC-034");
  });

  it("rejects a full-cohort denominator mismatch (per-language sum below reported total)", () => {
    const evidence = buildValidEvidence();
    (evidence.cohort as any).total_incoming_calls = 500;
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("COHORT_DENOMINATOR_MISMATCH:per_language_sum=100:total_incoming_calls=500");
    expect(result.report?.required_acceptance.human_exception_rate_full_cohort).toBe(false);
  });

  it("rejects a human exception rate computed from a subset instead of the full cohort", () => {
    const evidence = buildValidEvidence();
    (evidence.cohort as any).human_exception_rate = 0.4;
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures.some((f: string) => f.startsWith("COHORT_HUMAN_EXCEPTION_RATE_NOT_FULL_COHORT"))).toBe(true);
  });

  it("rejects a bare authorization string instead of a structured approval", () => {
    const evidence = buildValidEvidence({ pilot_operational_authorization: "approved by ops" });
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("AUTHORIZATION_IS_BARE_STRING_NOT_STRUCTURED_APPROVAL");
    expect(result.report?.required_acceptance.pilot_operational_authorization).toBe(false);
  });

  it("rejects missing authorization entirely", () => {
    const evidence = buildValidEvidence();
    delete (evidence as any).pilot_operational_authorization;
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("AUTHORIZATION_MISSING");
  });

  it("rejects missing staffing/callback drill evidence", () => {
    const evidence = buildValidEvidence();
    delete (evidence as any).staffing_callback_drill_evidence;
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("STAFFING_CALLBACK_DRILL_MISSING");
    expect(result.report?.required_acceptance.staffing_callback_drill_evidence).toBe(false);
  });

  it("rejects missing kill-switch/rollback drill evidence", () => {
    const evidence = buildValidEvidence();
    delete (evidence as any).kill_switch_rollback_drill_evidence;
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("KILL_SWITCH_ROLLBACK_DRILL_MISSING");
  });

  it("rejects a drill outcome that did not pass", () => {
    const evidence = buildValidEvidence();
    (evidence.staffing_callback_drill_evidence as any).outcome = "fail";
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("STAFFING_CALLBACK_DRILL_OUTCOME_NOT_PASS:outcome=fail");
  });

  it("rejects missing language/route/model-profile signoff for an enabled language", () => {
    const evidence = buildValidEvidence();
    evidence.language_route_model_profile_signoff = [];
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({ manifestPath, evidencePath, expectedSha: EXPECTED_SHA });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("SIGNOFF_LIST_EMPTY");
    expect(result.failures).toContain("SIGNOFF_MISSING_FOR_LANGUAGE:zh-TW");
    expect(result.failures).toContain("SIGNOFF_MISSING_FOR_MODEL_PROFILE:twm_llm_twm");
  });

  it("rejects stale evidence submitted before the max age window", () => {
    const evidence = buildValidEvidence({
      submitted_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    });
    const evidencePath = writeEvidence(evidence);

    const result = runPilotAcceptanceGate({
      manifestPath,
      evidencePath,
      expectedSha: EXPECTED_SHA,
      maxAgeHours: 168,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.some((f: string) => f.startsWith("EVIDENCE_STALE"))).toBe(true);
  });

  it("fails closed when the evidence file does not exist", () => {
    const result = runPilotAcceptanceGate({
      manifestPath,
      evidencePath: path.join(tempDir, "does-not-exist.json"),
      expectedSha: EXPECTED_SHA,
    });

    expect(result.ok).toBe(false);
    expect(result.failures.some((f: string) => f.startsWith("EVIDENCE_NOT_FOUND"))).toBe(true);
    expect(result.report).toBeNull();
  });

});

describe("UV-EXEC-029-PILOT-RUNNER: focused validators", () => {
  it("validateShaConsistency flags missing and mismatched fields independently", () => {
    const failures = validateShaConsistency(
      { candidate_sha: EXPECTED_SHA, dev_deploy: { sha: OTHER_SHA }, operational_acceptance: {} },
      EXPECTED_SHA,
    );
    expect(failures).toContain("SHA_MISMATCH:dev_deploy_sha:expected=" + EXPECTED_SHA + ":actual=" + OTHER_SHA);
    expect(failures).toContain("SHA_MISSING:operational_acceptance_sha");
    expect(failures).not.toContain("SHA_MISSING:candidate_sha");
  });

  it("validateShaConsistency fails closed when no expected SHA can be resolved at all", () => {
    const failures = validateShaConsistency({ candidate_sha: EXPECTED_SHA }, null);
    expect(failures).toEqual([
      "SHA_UNRESOLVED: no valid expected candidate SHA available; pass --expected-sha or run inside a git checkout",
    ]);
  });

  it("validateCohort rejects an unknown language key", () => {
    const failures = validateCohort(
      {
        cohort: {
          total_incoming_calls: 10,
          per_language: { "fr-FR": { total: 10, human_exceptions: 0 } },
          human_exception_count: 0,
          human_exception_rate: 0,
        },
      },
      new Set(["fr-FR"]),
    );
    expect(failures).toContain("COHORT_UNKNOWN_LANGUAGE:fr-FR");
  });

  it("validateAuthorization requires a valid AUTH-UV-PILOT reference format", () => {
    const failures = validateAuthorization({
      pilot_operational_authorization: {
        authorized: true,
        approver: "ops",
        approved_at: new Date().toISOString(),
        reference: "not-a-valid-ref",
      },
    });
    expect(failures).toContain("AUTHORIZATION_REFERENCE_INVALID");
  });

  it("validateDrills reports both drill fields independently when both are absent", () => {
    const failures = validateDrills({}, 720, new Date());
    expect(failures).toContain("STAFFING_CALLBACK_DRILL_MISSING");
    expect(failures).toContain("KILL_SWITCH_ROLLBACK_DRILL_MISSING");
  });
});
