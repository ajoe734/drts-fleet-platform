import assert from "node:assert/strict";
import {
  assertAllowedUrl,
  validateLiveMapGate,
  type LiveEnv,
} from "./live-map-config";
import { normalizeApiResponse } from "./wire-response";

export async function verifyLiveDeployment(
  env: LiveEnv,
  fetcher: typeof fetch,
  save: (evidence: unknown) => void,
) {
  const config = validateLiveMapGate(env);
  const apiOrigin = config.requireTarget("DRTS_LIVE_MAP_API_ORIGIN");
  const url = `${apiOrigin}/api/health`;
  assertAllowedUrl(url, config.allowedTargets);
  const evidence = {
    candidate_sha: config.candidateSha,
    deployed_sha: "",
    api_origin: apiOrigin,
    effective_backend: "",
    status: "failed",
  };
  try {
    const response = await fetcher(url, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    assert(response.ok);
    const health = normalizeApiResponse(await response.json()) as {
      candidateSha?: unknown;
      mapProvider?: { effectiveBackend?: unknown };
    };
    assert(
      typeof health.candidateSha === "string" &&
        /^[a-f0-9]{40}$/.test(health.candidateSha),
    );
    evidence.deployed_sha = health.candidateSha;
    evidence.effective_backend =
      health.mapProvider?.effectiveBackend === "google"
        ? "google"
        : "non-google";
    assert.equal(health.candidateSha, config.candidateSha);
    assert.equal(
      response.headers.get("x-drts-candidate-sha"),
      config.candidateSha,
    );
    assert.equal(health.mapProvider?.effectiveBackend, "google");
    evidence.status = "passed";
    return evidence;
  } catch {
    throw new Error(
      "Live API health must report this candidate SHA and Google backend; see deployment evidence",
    );
  } finally {
    save(evidence);
  }
}
