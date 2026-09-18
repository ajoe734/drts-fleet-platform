import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MapRunnerInputError,
  runMapAcceptance,
  validateMapRunnerInputs,
  type MapRunnerConfig,
  type MapRunnerEnv,
  type VerifierRunResult,
} from "../../../e2e/system-remediation/sr-live-map-001/map-acceptance-runner";
import { UatEvidenceRecorder } from "../../../e2e/system-remediation/shared";

const VALID_SHA = "c".repeat(40);
const OTHER_SHA = "d".repeat(40);

function baseEnv(overrides: Partial<MapRunnerEnv> = {}): MapRunnerEnv {
  return {
    DRTS_CANDIDATE_SHA: VALID_SHA,
    WORKFLOW_SHA: VALID_SHA,
    DRTS_LIVE_MAP_TEST_AUTHORIZED: "true",
    DRTS_LIVE_MAP_ALLOWED_TARGETS: "https://ops.dev.drts-fleet.example.com",
    DRTS_LIVE_MAP_TEST_ORIGIN: "https://ops.dev.drts-fleet.example.com",
    GOOGLE_MAPS_GEOCODING_API_KEY: "real-geocoding-key",
    GOOGLE_MAPS_ROUTES_API_KEY: "real-routes-key",
    GOOGLE_MAPS_BROWSER_KEY: "real-browser-key",
    DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABELS: "taipei-station-to-xinyi",
    DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL: "taipei-station-to-xinyi",
    ...overrides,
  };
}

const PASSING_STDOUT = "LIVE_GEOCODING_SMOKE=PASS\nLIVE_ROUTES_SMOKE=PASS\nLIVE_BROWSER_MAPS_SMOKE=PASS\n";

function passingVerifierResult(): VerifierRunResult {
  return { exitCode: 0, stdout: PASSING_STDOUT, stderr: "", durationMs: 250 };
}

describe("validateMapRunnerInputs", () => {
  it("accepts a fully valid configuration", () => {
    const config = validateMapRunnerInputs(baseEnv());
    expect(config.candidateSha).toBe(VALID_SHA);
    expect(config.testOrigin).toBe("https://ops.dev.drts-fleet.example.com");
  });

  it("fails closed when DRTS_CANDIDATE_SHA is missing", () => {
    expect(() => validateMapRunnerInputs(baseEnv({ DRTS_CANDIDATE_SHA: undefined }))).toThrow(MapRunnerInputError);
  });

  it("rejects a malformed candidate SHA (wrong SHA)", () => {
    expect(() => validateMapRunnerInputs(baseEnv({ DRTS_CANDIDATE_SHA: "abc123" }))).toThrow(/40-character/);
  });

  it("rejects a test origin outside the explicit allowlist (wrong target)", () => {
    expect(() =>
      validateMapRunnerInputs(baseEnv({ DRTS_LIVE_MAP_TEST_ORIGIN: "https://attacker.example.com" })),
    ).toThrow(/DRTS_LIVE_MAP_ALLOWED_TARGETS/);
  });

  it("fails closed when test authorization flag is absent (absent authorization)", () => {
    expect(() => validateMapRunnerInputs(baseEnv({ DRTS_LIVE_MAP_TEST_AUTHORIZED: undefined }))).toThrow(
      /DRTS_LIVE_MAP_TEST_AUTHORIZED/,
    );
  });

  it("fails closed when test authorization flag is not exactly \"true\" (absent authorization)", () => {
    expect(() => validateMapRunnerInputs(baseEnv({ DRTS_LIVE_MAP_TEST_AUTHORIZED: "yes" }))).toThrow(
      MapRunnerInputError,
    );
  });

  it("fails closed when a provider credential is missing (absent authorization)", () => {
    expect(() => validateMapRunnerInputs(baseEnv({ GOOGLE_MAPS_ROUTES_API_KEY: undefined }))).toThrow(
      /GOOGLE_MAPS_ROUTES_API_KEY/,
    );
  });

  it("rejects a route label outside the explicit authorized allowlist (wrong target)", () => {
    expect(() =>
      validateMapRunnerInputs(baseEnv({ DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL: "unauthorized-label" })),
    ).toThrow(/allowlist/);
  });

  it("rejects a non-positive timeout override", () => {
    expect(() => validateMapRunnerInputs(baseEnv({ DRTS_LIVE_MAP_TIMEOUT_MS: "-5" }))).toThrow(
      /DRTS_LIVE_MAP_TIMEOUT_MS/,
    );
  });
});

describe("runMapAcceptance", () => {
  let recorder: UatEvidenceRecorder;
  let config: MapRunnerConfig;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    config = validateMapRunnerInputs(baseEnv());
    recorder = new UatEvidenceRecorder({ taskId: "sr-live-map-001", candidateSha: config.candidateSha });
    // Guardrail: the pure orchestration function must never itself make a
    // billed provider call. If it does, this spy throws and the test fails.
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      throw new Error("runMapAcceptance must not contact the network directly; use the injected invokeVerifier.");
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("passes when the checked-out SHA matches and the verifier reports all three checks passing", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());

    const result = await runMapAcceptance(config, { invokeVerifier, recorder });

    expect(result.status).toBe("passed");
    expect(result.reasons).toEqual([]);
    expect(invokeVerifier).toHaveBeenCalledWith(config);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.evidence.httpCalls[0]?.statusCode).toBe(200);
  });

  it("fails when the checked-out workflow SHA does not match the candidate SHA (wrong SHA)", async () => {
    const drifted: MapRunnerConfig = { ...config, workflowSha: OTHER_SHA };
    const invokeVerifier = vi.fn().mockResolvedValue(passingVerifierResult());

    const result = await runMapAcceptance(drifted, { invokeVerifier, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/does not match the requested candidate SHA/);
  });

  it("fails when verify-google-map-provider-live.mjs exits non-zero", async () => {
    const invokeVerifier = vi
      .fn()
      .mockResolvedValue({ exitCode: 1, stdout: PASSING_STDOUT, stderr: "geocoding failed", durationMs: 100 });

    const result = await runMapAcceptance(config, { invokeVerifier, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/exited with code 1/);
  });

  it("fails on a partial result missing one of the three required checks (partial/skip)", async () => {
    const partialStdout = "LIVE_GEOCODING_SMOKE=PASS\nLIVE_ROUTES_SMOKE=PASS\n";
    const invokeVerifier = vi.fn().mockResolvedValue({ exitCode: 0, stdout: partialStdout, stderr: "", durationMs: 100 });

    const result = await runMapAcceptance(config, { invokeVerifier, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.join(" ")).toMatch(/partial\/skipped result/);
    expect(result.reasons.join(" ")).toMatch(/LIVE_BROWSER_MAPS_SMOKE=PASS/);
    expect(result.evidence.httpCalls[0]?.statusCode).toBe(500);
  });

  it("fails when the verifier crashes and produces zero markers (skip)", async () => {
    const invokeVerifier = vi
      .fn()
      .mockResolvedValue({ exitCode: 1, stdout: "", stderr: "GOOGLE_MAPS_GEOCODING_API_KEY is required", durationMs: 5 });

    const result = await runMapAcceptance(config, { invokeVerifier, recorder });

    expect(result.status).toBe("failed");
    expect(result.reasons.length).toBeGreaterThan(1);
  });

  it("records redacted evidence and never leaks the raw provider keys into evidence", async () => {
    const invokeVerifier = vi.fn().mockResolvedValue({
      exitCode: 0,
      stdout: `${PASSING_STDOUT}\napiKey=${config.geocodingKey}`,
      stderr: "",
      durationMs: 100,
    });

    const result = await runMapAcceptance(config, { invokeVerifier, recorder });

    const serialized = JSON.stringify(result.evidence);
    expect(serialized).not.toContain(config.geocodingKey);
  });
});
