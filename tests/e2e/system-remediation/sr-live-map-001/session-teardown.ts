import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  required,
  validateCoverageTargets,
  writeEvidence,
  type LiveEnv,
} from "./live-map-config";
import { revokeMapInvitation } from "./session-cleanup";

export async function teardownMapSessions(
  env: LiveEnv,
  deps: {
    fetch: typeof fetch;
    save: (evidence: unknown) => void;
  },
) {
  const config = validateCoverageTargets(env);
  const evidence = {
    candidate_sha: config.candidateSha,
    status: "failed",
    driver_id: config.driverId,
    recovery: "consumed-invitation",
    revoked: false,
  };
  try {
    await revokeMapInvitation(
      env,
      deps.fetch,
      required(env, "DRTS_LIVE_MAP_CLEANUP_SESSION_TOKEN"),
      required(env, "DRTS_LIVE_MAP_INVITE_CODE"),
    );
    evidence.revoked = true;
    evidence.status = "passed";
  } catch {
    throw new Error(
      "Map session teardown failed; credentials and response withheld",
    );
  } finally {
    deps.save(evidence);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  teardownMapSessions(process.env, {
    fetch,
    save: (evidence) =>
      writeEvidence(
        ".artifacts/live-map-acceptance/evidence-cleanup.json",
        evidence,
      ),
  }).catch(() => {
    console.error(
      "Map session teardown failed; credentials and response withheld",
    );
    process.exitCode = 1;
  });
}
