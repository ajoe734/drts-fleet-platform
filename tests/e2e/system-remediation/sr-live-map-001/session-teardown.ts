import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  required,
  validateCoverageTargets,
  writeEvidence,
  type LiveEnv,
} from "./live-map-config";
import { verifyLiveDeployment } from "./deployment-check";
import {
  createMapSessionRequest,
  issueMapProvisioningSession,
  readMapGoogleIdToken,
  verifyMapProvisioningSession,
  type BootstrapDeps,
} from "./session-bootstrap";

import { revokeMapInvitation } from "./session-cleanup";

type TeardownDeps = Pick<
  BootstrapDeps,
  "fetch" | "readGoogleIdToken" | "mask"
> & {
  save: (evidence: unknown) => void;
};

export async function teardownMapSessions(env: LiveEnv, deps: TeardownDeps) {
  const config = validateCoverageTargets(env);
  const evidence = {
    candidate_sha: config.candidateSha,
    deployed_sha: config.deployedSha,
    status: "failed",
    driver_id: config.driverId,
    recovery: "consumed-invitation",
    revoked: false,
  };
  try {
    const registrationCode = required(env, "DRTS_LIVE_MAP_INVITE_CODE");
    await verifyLiveDeployment(env, deps.fetch, () => {});
    const request = createMapSessionRequest(config, deps.fetch);
    let token = env.DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN;
    if (token) {
      try {
        await verifyMapProvisioningSession(config.driverId, request, token);
      } catch {
        token = undefined;
      }
    }
    // If acceptance ran longer than 15m, exchange a fresh Google assertion.
    token ??= (
      await issueMapProvisioningSession(config.driverId, request, deps)
    ).token;
    await revokeMapInvitation(env, deps.fetch, token, registrationCode);
    evidence.revoked = true;
    evidence.status = "passed";
  } catch {
    throw new Error(
      "Map session cleanup failed; no credential details retained",
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
    readGoogleIdToken: (purpose) => readMapGoogleIdToken(process.env, purpose),
    mask: (value) =>
      console.log(
        `::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
      ),
  }).catch(() => {
    console.error("Map session cleanup failed; no credential details retained");
    process.exitCode = 1;
  });
}
