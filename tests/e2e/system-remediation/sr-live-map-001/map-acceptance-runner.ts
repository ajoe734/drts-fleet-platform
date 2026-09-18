/**
 * SR-LIVE-ENTRY-MAP-RUNNER-001: map profile.
 *
 * Orchestrates the existing, unmodified `verify-google-map-provider-live.mjs`
 * (Geocoding, Routes, and Maps JS live checks) against an explicit,
 * allowlisted test origin. Makes zero billed provider calls until
 * candidate SHA, target allowlist, credentials, and an explicit test
 * authorization flag are all present — see `validateMapRunnerInputs`. This
 * file never contacts a network itself when imported for tests: `main()` —
 * the only place a real subprocess is spawned — only runs when this file is
 * executed directly, matching the GitHub-hosted workflow's invocation. Unit
 * tests import `validateMapRunnerInputs` and `runMapAcceptance` directly and
 * inject a fake `invokeVerifier`.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { redactObject, redactPii, UatEvidenceRecorder, type UatEvidenceBundle } from "../shared";

const CANDIDATE_SHA_PATTERN = /^[0-9a-f]{40}$/;

export class MapRunnerInputError extends Error {}

export interface MapRunnerConfig {
  candidateSha: string;
  workflowSha: string;
  testOrigin: string;
  geocodingKey: string;
  routesKey: string;
  browserKey: string;
  authorizedRouteLabel: string;
  timeoutMs: number;
}

export type MapRunnerEnv = Record<string, string | undefined>;

function requireString(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new MapRunnerInputError(`${name} is required and must be non-empty.`);
  }
  return trimmed;
}

function requireCsv(value: string | undefined, name: string): string[] {
  const raw = requireString(value, name);
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    throw new MapRunnerInputError(`${name} must contain at least one entry.`);
  }
  return items;
}

function requireAllowedOrigin(value: string | undefined, name: string, allowedTargets: string[]): string {
  const origin = requireString(value, name).replace(/\/$/, "");
  if (!allowedTargets.includes(origin)) {
    throw new MapRunnerInputError(
      `${name} "${origin}" is not present in DRTS_LIVE_MAP_ALLOWED_TARGETS. Live map acceptance never falls back to a historical staging default origin.`,
    );
  }
  return origin;
}

function requireExplicitAuthorization(value: string | undefined): void {
  if (value?.trim() !== "true") {
    throw new MapRunnerInputError(
      'DRTS_LIVE_MAP_TEST_AUTHORIZED must be exactly "true" — live map acceptance makes no billed provider calls until test authorization is explicitly granted for this run.',
    );
  }
}

export function validateMapRunnerInputs(env: MapRunnerEnv): MapRunnerConfig {
  const candidateSha = requireString(env.DRTS_CANDIDATE_SHA, "DRTS_CANDIDATE_SHA");
  if (!CANDIDATE_SHA_PATTERN.test(candidateSha)) {
    throw new MapRunnerInputError(
      `DRTS_CANDIDATE_SHA must be a full 40-character lowercase commit SHA, got: "${candidateSha}"`,
    );
  }
  const workflowSha = requireString(env.WORKFLOW_SHA, "WORKFLOW_SHA");

  requireExplicitAuthorization(env.DRTS_LIVE_MAP_TEST_AUTHORIZED);

  const allowedTargets = requireCsv(env.DRTS_LIVE_MAP_ALLOWED_TARGETS, "DRTS_LIVE_MAP_ALLOWED_TARGETS").map(
    (origin) => origin.replace(/\/$/, ""),
  );
  const testOrigin = requireAllowedOrigin(env.DRTS_LIVE_MAP_TEST_ORIGIN, "DRTS_LIVE_MAP_TEST_ORIGIN", allowedTargets);

  const geocodingKey = requireString(env.GOOGLE_MAPS_GEOCODING_API_KEY, "GOOGLE_MAPS_GEOCODING_API_KEY");
  const routesKey = requireString(env.GOOGLE_MAPS_ROUTES_API_KEY, "GOOGLE_MAPS_ROUTES_API_KEY");
  const browserKey = requireString(env.GOOGLE_MAPS_BROWSER_KEY, "GOOGLE_MAPS_BROWSER_KEY");

  const authorizedRouteLabels = requireCsv(
    env.DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABELS,
    "DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABELS",
  );
  const authorizedRouteLabel = requireString(
    env.DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL,
    "DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL",
  );
  if (!authorizedRouteLabels.includes(authorizedRouteLabel)) {
    throw new MapRunnerInputError(
      `DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABEL "${authorizedRouteLabel}" is not present in the explicit DRTS_LIVE_MAP_AUTHORIZED_ROUTE_LABELS allowlist for this run.`,
    );
  }

  const timeoutRaw = env.DRTS_LIVE_MAP_TIMEOUT_MS?.trim();
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new MapRunnerInputError(`DRTS_LIVE_MAP_TIMEOUT_MS must be a positive number, got: "${timeoutRaw}"`);
  }

  return {
    candidateSha,
    workflowSha,
    testOrigin,
    geocodingKey,
    routesKey,
    browserKey,
    authorizedRouteLabel,
    timeoutMs,
  };
}

export interface VerifierRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type VerifierInvoker = (config: MapRunnerConfig) => Promise<VerifierRunResult>;

export interface MapRunnerDeps {
  invokeVerifier: VerifierInvoker;
  recorder: UatEvidenceRecorder;
}

export interface MapRunnerResult {
  status: "passed" | "failed";
  reasons: string[];
  evidence: UatEvidenceBundle;
}

// verify-google-map-provider-live.mjs's own success markers. Requiring every
// one to be present distinguishes a partial/skipped result (e.g. the
// subprocess crashing after the geocoding check but before routes/browser
// maps run) from a genuine full pass.
const REQUIRED_VERIFIER_MARKERS = [
  "LIVE_GEOCODING_SMOKE=PASS",
  "LIVE_ROUTES_SMOKE=PASS",
  "LIVE_BROWSER_MAPS_SMOKE=PASS",
];

export async function runMapAcceptance(config: MapRunnerConfig, deps: MapRunnerDeps): Promise<MapRunnerResult> {
  const reasons: string[] = [];
  deps.recorder.setCandidateSha(config.candidateSha);
  deps.recorder.recordResourceId("map-route-label", config.authorizedRouteLabel);

  if (config.workflowSha !== config.candidateSha) {
    reasons.push(
      `Checked-out workflow SHA "${config.workflowSha}" does not match the requested candidate SHA "${config.candidateSha}".`,
    );
  }

  const verifierResult = await deps.invokeVerifier(config);
  deps.recorder.recordConsole("info", redactPii(verifierResult.stdout));
  if (verifierResult.stderr.trim().length > 0) {
    deps.recorder.recordConsole("warn", redactPii(verifierResult.stderr));
  }

  if (verifierResult.exitCode !== 0) {
    reasons.push(
      `verify-google-map-provider-live.mjs exited with code ${verifierResult.exitCode} (live map provider checks failed).`,
    );
  }

  const missingMarkers = REQUIRED_VERIFIER_MARKERS.filter((marker) => !verifierResult.stdout.includes(marker));
  if (missingMarkers.length > 0) {
    reasons.push(
      `verify-google-map-provider-live.mjs produced a partial/skipped result; missing checks: ${missingMarkers.join("; ")}.`,
    );
  }

  deps.recorder.recordHttpCall({
    method: "RUN",
    url: config.testOrigin,
    statusCode: verifierResult.exitCode === 0 && missingMarkers.length === 0 ? 200 : 500,
    durationMs: verifierResult.durationMs,
    actorRole: "map-provider-smoke",
  });

  for (const reason of reasons) {
    deps.recorder.recordError(reason);
  }

  const status: "passed" | "failed" = reasons.length === 0 ? "passed" : "failed";
  const evidence = deps.recorder.finalize(status);
  return { status, reasons, evidence };
}

async function realInvokeVerifier(config: MapRunnerConfig): Promise<VerifierRunResult> {
  const scriptPath = resolve(process.cwd(), "operations/verification/verify-google-map-provider-live.mjs");
  const startedAt = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        GOOGLE_MAPS_GEOCODING_API_KEY: config.geocodingKey,
        GOOGLE_MAPS_ROUTES_API_KEY: config.routesKey,
        GOOGLE_MAPS_BROWSER_KEY: config.browserKey,
        MAP_PROVIDER_SMOKE_ORIGIN: config.testOrigin,
        MAP_PROVIDER_TIMEOUT_MS: String(config.timeoutMs),
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (exitCode) =>
      resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr, durationMs: Date.now() - startedAt }),
    );
  });
}

async function main(): Promise<void> {
  const config = validateMapRunnerInputs(process.env);
  const recorder = new UatEvidenceRecorder({
    taskId: "sr-live-map-001",
    candidateSha: config.candidateSha,
  });
  const result = await runMapAcceptance(config, {
    invokeVerifier: realInvokeVerifier,
    recorder,
  });

  const outputPath = resolve(
    process.env.DRTS_LIVE_MAP_EVIDENCE_PATH?.trim() || ".artifacts/live-map-acceptance/evidence-map.json",
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(redactObject(result.evidence), null, 2), "utf-8");

  console.log(`Map acceptance status: ${result.status}`);
  for (const reason of result.reasons) {
    console.error(`  [FAIL] ${reason}`);
  }
  process.exitCode = result.status === "passed" ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(`Map acceptance runner crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
