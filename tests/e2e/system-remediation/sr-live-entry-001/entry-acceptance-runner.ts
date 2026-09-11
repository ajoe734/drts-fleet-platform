/**
 * SR-LIVE-ENTRY-MAP-RUNNER-001: entry profile.
 *
 * Orchestrates the existing, unmodified `verify-iam-staging-live.mjs`
 * against an explicit, allowlisted deployed target plus an additional
 * positive/negative realm-role HTTP boundary check driven entirely by
 * deployment-issued role sessions (never fixture/demo personas). This file
 * never contacts a network itself when imported for tests: `main()` — the
 * only place real subprocess/fetch calls happen — only runs when this file
 * is executed directly (`pnpm exec tsx .../entry-acceptance-runner.ts`),
 * matching the GitHub-hosted workflow's invocation. Unit tests import
 * `validateEntryRunnerInputs` and `runEntryAcceptance` directly and inject
 * fake `invokeVerifier`/`checkRoleBoundary` implementations.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BASELINE_PERSONAS,
  redactObject,
  redactPii,
  UatEvidenceRecorder,
  type UatEvidenceBundle,
} from "../shared";

const CANDIDATE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const FIXTURE_ROLE_MARKERS = ["demo", "fixture", "mock", "sample", "sandbox"];
const FIXTURE_PERSONA_NAMES = new Set(
  Object.values(BASELINE_PERSONAS).flatMap((persona) => [
    persona.key,
    ...persona.roles,
  ]),
);

export class EntryRunnerInputError extends Error {}

export interface EntryRunnerConfig {
  candidateSha: string;
  workflowSha: string;
  apiOrigin: string;
  tenantOrigin: string;
  platformOrigin: string;
  opsOrigin: string;
  roleSessionToken: string;
  authorizedRole: string;
  positiveRoute: string;
  positiveExpectedStatus: number;
  negativeRoute: string;
  negativeExpectedStatus: number;
}

export type EntryRunnerEnv = Record<string, string | undefined>;

function requireString(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new EntryRunnerInputError(`${name} is required and must be non-empty.`);
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
    throw new EntryRunnerInputError(`${name} must contain at least one entry.`);
  }
  return items;
}

function requireAllowedOrigin(
  value: string | undefined,
  name: string,
  allowedTargets: string[],
): string {
  const origin = requireString(value, name).replace(/\/$/, "");
  if (!allowedTargets.includes(origin)) {
    throw new EntryRunnerInputError(
      `${name} "${origin}" is not present in DRTS_LIVE_ENTRY_ALLOWED_TARGETS. Live acceptance never falls back to a historical staging default.`,
    );
  }
  return origin;
}

function requirePositiveInteger(value: string | undefined, name: string): number {
  const raw = requireString(value, name);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 599) {
    throw new EntryRunnerInputError(`${name} must be a valid HTTP status code, got: ${raw}`);
  }
  return parsed;
}

function assertNotFixtureRole(role: string): void {
  const lowered = role.toLowerCase();
  if (FIXTURE_PERSONA_NAMES.has(role) || FIXTURE_ROLE_MARKERS.some((marker) => lowered.includes(marker))) {
    throw new EntryRunnerInputError(
      `DRTS_LIVE_ENTRY_AUTHORIZED_ROLE "${role}" looks like a fixture/demo persona; live-mode entry acceptance requires a real deployment-issued role, not a UAT fixture.`,
    );
  }
}

export function validateEntryRunnerInputs(env: EntryRunnerEnv): EntryRunnerConfig {
  const candidateSha = requireString(env.DRTS_CANDIDATE_SHA, "DRTS_CANDIDATE_SHA");
  if (!CANDIDATE_SHA_PATTERN.test(candidateSha)) {
    throw new EntryRunnerInputError(
      `DRTS_CANDIDATE_SHA must be a full 40-character lowercase commit SHA, got: "${candidateSha}"`,
    );
  }
  const workflowSha = requireString(env.WORKFLOW_SHA, "WORKFLOW_SHA");

  const allowedTargets = requireCsv(env.DRTS_LIVE_ENTRY_ALLOWED_TARGETS, "DRTS_LIVE_ENTRY_ALLOWED_TARGETS").map(
    (origin) => origin.replace(/\/$/, ""),
  );
  const apiOrigin = requireAllowedOrigin(env.DRTS_LIVE_ENTRY_API_ORIGIN, "DRTS_LIVE_ENTRY_API_ORIGIN", allowedTargets);
  const tenantOrigin = requireAllowedOrigin(
    env.DRTS_LIVE_ENTRY_TENANT_ORIGIN,
    "DRTS_LIVE_ENTRY_TENANT_ORIGIN",
    allowedTargets,
  );
  const platformOrigin = requireAllowedOrigin(
    env.DRTS_LIVE_ENTRY_PLATFORM_ORIGIN,
    "DRTS_LIVE_ENTRY_PLATFORM_ORIGIN",
    allowedTargets,
  );
  const opsOrigin = requireAllowedOrigin(env.DRTS_LIVE_ENTRY_OPS_ORIGIN, "DRTS_LIVE_ENTRY_OPS_ORIGIN", allowedTargets);

  const roleSessionToken = requireString(
    env.DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN,
    "DRTS_LIVE_ENTRY_ROLE_SESSION_TOKEN",
  );

  const authorizedRoles = requireCsv(env.DRTS_LIVE_ENTRY_AUTHORIZED_ROLES, "DRTS_LIVE_ENTRY_AUTHORIZED_ROLES");
  const authorizedRole = requireString(env.DRTS_LIVE_ENTRY_AUTHORIZED_ROLE, "DRTS_LIVE_ENTRY_AUTHORIZED_ROLE");
  assertNotFixtureRole(authorizedRole);
  if (!authorizedRoles.includes(authorizedRole)) {
    throw new EntryRunnerInputError(
      `DRTS_LIVE_ENTRY_AUTHORIZED_ROLE "${authorizedRole}" is not present in the explicit DRTS_LIVE_ENTRY_AUTHORIZED_ROLES allowlist for this run.`,
    );
  }

  const positiveRoute = requireString(env.DRTS_LIVE_ENTRY_POSITIVE_ROUTE, "DRTS_LIVE_ENTRY_POSITIVE_ROUTE");
  const positiveExpectedStatus = requirePositiveInteger(
    env.DRTS_LIVE_ENTRY_POSITIVE_EXPECTED_STATUS,
    "DRTS_LIVE_ENTRY_POSITIVE_EXPECTED_STATUS",
  );
  const negativeRoute = requireString(env.DRTS_LIVE_ENTRY_NEGATIVE_ROUTE, "DRTS_LIVE_ENTRY_NEGATIVE_ROUTE");
  const negativeExpectedStatus = requirePositiveInteger(
    env.DRTS_LIVE_ENTRY_NEGATIVE_EXPECTED_STATUS,
    "DRTS_LIVE_ENTRY_NEGATIVE_EXPECTED_STATUS",
  );

  return {
    candidateSha,
    workflowSha,
    apiOrigin,
    tenantOrigin,
    platformOrigin,
    opsOrigin,
    roleSessionToken,
    authorizedRole,
    positiveRoute,
    positiveExpectedStatus,
    negativeRoute,
    negativeExpectedStatus,
  };
}

export interface VerifierRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type VerifierInvoker = (config: EntryRunnerConfig) => Promise<VerifierRunResult>;

export interface RoleBoundaryResult {
  positiveStatus: number;
  negativeStatus: number;
  deployedCandidateSha: string | null;
}

export type RoleBoundaryChecker = (config: EntryRunnerConfig) => Promise<RoleBoundaryResult>;

export interface EntryRunnerDeps {
  invokeVerifier: VerifierInvoker;
  checkRoleBoundary: RoleBoundaryChecker;
  recorder: UatEvidenceRecorder;
}

export interface EntryRunnerResult {
  status: "passed" | "failed";
  reasons: string[];
  evidence: UatEvidenceBundle;
}

// verify-iam-staging-live.mjs's own console section headers. Requiring every
// one of these to be present is how a partial/skip result (e.g. the
// subprocess crashing mid-run) is distinguished from a genuine full pass.
const REQUIRED_VERIFIER_MARKERS = [
  "Proving Live Cloud API Health",
  "Proving Live Strict Unauthenticated Rejection",
  "Proving Live Tenant Console Session Boundary",
  "Proving Live Tenant Console OIDC Authorization Initiation",
  "Proving Live Tenant Console Mutating CSRF",
  "Proving Live Platform Admin & Ops Console Workforce Gateways",
  "Proving Live Zero Sensitive Secret",
];

const VERIFIER_SUMMARY_PATTERN =
  /Live Staging Verification Complete: (\d+) assertions passed, (\d+) failures\./;

export async function runEntryAcceptance(
  config: EntryRunnerConfig,
  deps: EntryRunnerDeps,
): Promise<EntryRunnerResult> {
  const reasons: string[] = [];
  deps.recorder.setCandidateSha(config.candidateSha);
  deps.recorder.recordRole(config.authorizedRole);

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
    reasons.push(`verify-iam-staging-live.mjs exited with code ${verifierResult.exitCode} (live IAM checks failed).`);
  }

  const missingMarkers = REQUIRED_VERIFIER_MARKERS.filter(
    (marker) => !verifierResult.stdout.includes(marker),
  );
  if (missingMarkers.length > 0) {
    reasons.push(
      `verify-iam-staging-live.mjs produced a partial/skipped result; missing checks: ${missingMarkers.join("; ")}.`,
    );
  }

  const summaryMatch = verifierResult.stdout.match(VERIFIER_SUMMARY_PATTERN);
  if (!summaryMatch) {
    reasons.push(
      "verify-iam-staging-live.mjs did not print a completion summary; treating the run as incomplete/skipped.",
    );
  } else if (Number(summaryMatch[2]) > 0) {
    reasons.push(`verify-iam-staging-live.mjs reported ${summaryMatch[2]} failing assertion(s).`);
  }

  const boundary = await deps.checkRoleBoundary(config);
  deps.recorder.recordHttpCall({
    method: "GET",
    url: `${config.apiOrigin}${config.positiveRoute}`,
    statusCode: boundary.positiveStatus,
    durationMs: 0,
    actorRole: config.authorizedRole,
  });
  deps.recorder.recordHttpCall({
    method: "GET",
    url: `${config.apiOrigin}${config.negativeRoute}`,
    statusCode: boundary.negativeStatus,
    durationMs: 0,
    actorRole: "unauthorized",
  });

  if (boundary.positiveStatus !== config.positiveExpectedStatus) {
    reasons.push(
      `Authorized role "${config.authorizedRole}" received HTTP ${boundary.positiveStatus} on ${config.positiveRoute}, expected ${config.positiveExpectedStatus}.`,
    );
  }
  if (boundary.negativeStatus !== config.negativeExpectedStatus) {
    reasons.push(
      `Unauthorized negative-boundary request to ${config.negativeRoute} received HTTP ${boundary.negativeStatus}, expected ${config.negativeExpectedStatus}.`,
    );
  }
  if (boundary.deployedCandidateSha !== config.candidateSha) {
    reasons.push(
      `Deployed candidate SHA header reported "${boundary.deployedCandidateSha ?? "(missing)"}", expected "${config.candidateSha}".`,
    );
  }

  for (const reason of reasons) {
    deps.recorder.recordError(reason);
  }

  const status: "passed" | "failed" = reasons.length === 0 ? "passed" : "failed";
  const evidence = deps.recorder.finalize(status);
  return { status, reasons, evidence };
}

async function realInvokeVerifier(config: EntryRunnerConfig): Promise<VerifierRunResult> {
  const scriptPath = resolve(process.cwd(), "operations/verification/verify-iam-staging-live.mjs");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [
        scriptPath,
        "--sha",
        config.candidateSha,
        "--api-origin",
        config.apiOrigin,
        "--tenant-origin",
        config.tenantOrigin,
        "--platform-origin",
        config.platformOrigin,
        "--ops-origin",
        config.opsOrigin,
      ],
      { env: process.env },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => resolvePromise({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
}

async function realCheckRoleBoundary(config: EntryRunnerConfig): Promise<RoleBoundaryResult> {
  const positiveRes = await fetch(new URL(config.positiveRoute, config.apiOrigin), {
    headers: { authorization: `Bearer ${config.roleSessionToken}` },
    redirect: "manual",
  });
  const negativeRes = await fetch(new URL(config.negativeRoute, config.apiOrigin), {
    redirect: "manual",
  });
  return {
    positiveStatus: positiveRes.status,
    negativeStatus: negativeRes.status,
    deployedCandidateSha: positiveRes.headers.get("x-drts-candidate-sha"),
  };
}

async function main(): Promise<void> {
  const config = validateEntryRunnerInputs(process.env);
  const recorder = new UatEvidenceRecorder({
    taskId: "sr-live-entry-001",
    candidateSha: config.candidateSha,
  });
  const result = await runEntryAcceptance(config, {
    invokeVerifier: realInvokeVerifier,
    checkRoleBoundary: realCheckRoleBoundary,
    recorder,
  });

  const outputPath = resolve(
    process.env.DRTS_LIVE_ENTRY_EVIDENCE_PATH?.trim() || ".artifacts/live-entry-acceptance/evidence-entry.json",
  );
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(redactObject(result.evidence), null, 2), "utf-8");

  console.log(`Entry acceptance status: ${result.status}`);
  for (const reason of result.reasons) {
    console.error(`  [FAIL] ${reason}`);
  }
  process.exitCode = result.status === "passed" ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error(`Entry acceptance runner crashed: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
