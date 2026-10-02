import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCoverageTargets, type LiveEnv } from "./live-map-config";
import { verifyLiveDeployment } from "./deployment-check";
import {
  createMapSessionRequest,
  issueMapProvisioningSession,
  readMapGoogleIdToken,
  verifyMapProvisioningSession,
  type BootstrapDeps,
} from "./session-bootstrap";

type TeardownDeps = Pick<BootstrapDeps, "fetch" | "readGoogleIdToken" | "mask">;

export async function teardownMapSessions(env: LiveEnv, deps: TeardownDeps) {
  const config = validateCoverageTargets(env);
  const registrationCode = env.DRTS_LIVE_MAP_INVITE_CODE;
  if (!registrationCode) return;
  try {
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
    const response = await request<{ data: { revoked: boolean } }>(
      "auth/driver/device/invite/revoke",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ registrationCode }),
      },
    );
    // Revoking a consumed invite also revokes its binding and refresh family.
    assert.equal(response.data.revoked, true);
  } catch {
    throw new Error(
      "Map session cleanup failed; no credential details retained",
    );
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  teardownMapSessions(process.env, {
    fetch,
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
