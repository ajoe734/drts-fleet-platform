import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type LiveEnv = Record<string, string | undefined>;

export function required(env: LiveEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function origin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || url.pathname !== "/") {
    throw new Error("Live map targets must be HTTPS origins without credentials, paths or queries");
  }
  return url.origin;
}

export function validateLiveMapGate(env: LiveEnv) {
  if (env.DRTS_LIVE_MAP_TEST_AUTHORIZED !== "true") {
    throw new Error('DRTS_LIVE_MAP_TEST_AUTHORIZED must equal "true"');
  }
  if (env.GITHUB_ACTIONS !== "true" || env.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("Live map acceptance may run only on GitHub-hosted Actions runners");
  }
  const candidateSha = required(env, "DRTS_CANDIDATE_SHA");
  if (!/^[a-f0-9]{40}$/.test(candidateSha) || env.WORKFLOW_SHA !== candidateSha) {
    throw new Error("Candidate must be a full SHA matching the workflow SHA");
  }
  const allowedTargets = required(env, "DRTS_LIVE_MAP_ALLOWED_TARGETS").split(",").map((value) => origin(value.trim()));
  const requireTarget = (name: string) => {
    const target = origin(required(env, name));
    assertAllowedUrl(target, allowedTargets);
    return target;
  };
  return { candidateSha, allowedTargets, opsOrigin: requireTarget("DRTS_LIVE_MAP_TEST_ORIGIN"), requireTarget };
}

export function assertAllowedUrl(url: string, allowedTargets: string[]) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !allowedTargets.includes(parsed.origin)) {
    throw new Error("Request target is outside DRTS_LIVE_MAP_ALLOWED_TARGETS");
  }
}

export function validateCoverageInputs(env: LiveEnv) {
  const gate = validateLiveMapGate(env);
  const apiOrigin = gate.requireTarget("DRTS_LIVE_MAP_API_ORIGIN");
  assertAllowedUrl("https://maps.googleapis.com", gate.allowedTargets);
  const driverId = required(env, "DRTS_LIVE_MAP_TEST_DRIVER_ID");
  if (!/^live-map-[a-z0-9-]+$/.test(driverId)) {
    throw new Error("DRTS_LIVE_MAP_TEST_DRIVER_ID must be a dedicated live-map-* identity");
  }
  return {
    ...gate, apiOrigin, driverId,
    driverToken: required(env, "DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN"),
    observerToken: required(env, "DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN"),
    geocodingKey: required(env, "GOOGLE_MAPS_GEOCODING_API_KEY"),
  };
}

export function writeEvidence(path: string, evidence: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
}
