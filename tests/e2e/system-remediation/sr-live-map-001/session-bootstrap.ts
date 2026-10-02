import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyLiveDeployment } from "./deployment-check";
import {
  assertAllowedUrl,
  required,
  validateCoverageTargets,
  writeEvidence,
  type LiveEnv,
} from "./live-map-config";
import { normalizeApiResponse } from "./wire-response";

export const MAP_PROVISIONER_ID = "dev-live-map";
export const MAP_OBSERVER_ID = "live-map-observer";
export type BootstrapDeps = {
  fetch: typeof fetch;
  readGoogleIdToken: (purpose: "observer" | "provisioning") => string;
  mask: (value: string) => void;
  exportSession: (name: string, value: string) => void;
  save: (name: string, evidence: unknown) => void;
};

export async function bootstrapMapSessions(env: LiveEnv, deps: BootstrapDeps) {
  // Also invoked before WIF auth in the workflow. No secret reads or HTTP
  // issuance until authorization, hosted runner and exact origins are valid.
  const config = validateCoverageTargets(env);
  await verifyLiveDeployment(env, deps.fetch, (evidence) =>
    deps.save("deployment", evidence),
  );
  const evidence = {
    candidate_sha: config.candidateSha,
    status: "failed",
    stage: "google-workload-identity",
    sessions: [] as Array<{
      realm: string;
      actor_type: string;
      actor_id: string;
      scopes: string[];
      expires_in: string;
    }>,
  };
  try {
    const idToken = deps.readGoogleIdToken("observer").trim();
    assert(idToken && !/[\r\n]/.test(idToken));
    deps.mask(idToken);
    const request = createMapSessionRequest(config, deps.fetch);
    const verified: Array<{ name: string; token: string }> = [];

    // 1. Get an observer session for ops
    evidence.stage = `ops:issue`;
    const observerIssued = await request<{ token: string; expiresIn: string }>(
      "auth/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-drts-google-id-token": idToken,
          "x-actor-type": "ops_observer",
          "x-actor-id": MAP_OBSERVER_ID,
          "x-realm": "ops",
        },
        body: "{}",
      },
    );
    assert(
      typeof observerIssued.token === "string" &&
        observerIssued.token.length > 0 &&
        !/\s/.test(observerIssued.token),
    );
    deps.mask(observerIssued.token);
    assert(/^(?:[1-9]\d*[sm]|[1-8]h)$/.test(observerIssued.expiresIn));

    evidence.stage = `ops:verify-session`;
    let session = await request<{
      data: {
        active: boolean;
        identity: {
          realm: string;
          actorType: string;
          actorId: string;
          scopes: string[];
        };
      };
    }>("auth/session", {
      headers: { authorization: `Bearer ${observerIssued.token}` },
    });
    assert(session.data.active);
    assert.equal(session.data.identity.realm, "ops");
    assert.equal(session.data.identity.actorType, "ops_observer");
    assert.equal(session.data.identity.actorId, MAP_OBSERVER_ID);
    assert.deepEqual(
      [...session.data.identity.scopes].sort(),
      ["regulatory:read"].sort(),
    );

    verified.push({
      name: "DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN",
      token: observerIssued.token,
    });
    evidence.sessions.push({
      realm: "ops",
      actor_type: "ops_observer",
      actor_id: MAP_OBSERVER_ID,
      scopes: ["regulatory:read"],
      expires_in: observerIssued.expiresIn,
    });

    // 2. Exchange a separate assertion for the fixed-driver service grant.
    evidence.stage = `driver:invite-setup`;
    const provisioner = await issueMapProvisioningSession(
      config.driverId,
      request,
      deps,
    );

    evidence.stage = `driver:issue-invite`;
    const invite = await request<{ data: { registrationCode: string } }>(
      "auth/driver/device/invite",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${provisioner.token}`,
        },
        body: JSON.stringify({ driverId: config.driverId }),
      },
    );
    const registrationCode = invite.data.registrationCode;
    assert(
      typeof registrationCode === "string" &&
        registrationCode &&
        !/\s/.test(registrationCode),
    );
    deps.mask(registrationCode);
    // Cleanup must remain possible even if device registration/session checks fail.
    deps.exportSession(
      "DRTS_LIVE_MAP_PROVISIONER_SESSION_TOKEN",
      provisioner.token,
    );
    deps.exportSession("DRTS_LIVE_MAP_INVITE_CODE", registrationCode);

    try {
      evidence.stage = `driver:register-device`;
      const deviceId = `live-map-run-${Date.now()}`;
      const driverSession = await request<{
        data: { accessToken: string; expiresIn: string };
      }>("auth/driver/device/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ registrationCode, deviceId }),
      });
      const driverToken = driverSession.data.accessToken;
      deps.mask(driverToken);

      evidence.stage = `driver:verify-session`;
      session = await request<{
        data: {
          active: boolean;
          identity: {
            realm: string;
            actorType: string;
            actorId: string;
            scopes: string[];
          };
        };
      }>("auth/session", {
        headers: { authorization: `Bearer ${driverToken}` },
      });
      assert(session.data.active);
      assert.equal(session.data.identity.realm, "driver");
      assert.equal(session.data.identity.actorType, "driver_user");
      assert.equal(session.data.identity.actorId, config.driverId);
      assert.deepEqual([...session.data.identity.scopes].sort(), [
        "driver:read",
      ]);

      verified.push({
        name: "DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN",
        token: driverToken,
      });
      evidence.sessions.push({
        realm: "driver",
        actor_type: "driver_user",
        actor_id: config.driverId,
        scopes: ["driver:read"],
        expires_in: driverSession.data.expiresIn,
      });

      // Neither token reaches subsequent steps unless both session checks pass.
      for (const { name, token } of verified) deps.exportSession(name, token);
      deps.exportSession("DRTS_LIVE_MAP_DRIVER_DEVICE_ID", deviceId);
    } catch (error) {
      try {
        await request("auth/driver/device/invite/revoke", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${provisioner.token}`,
          },
          body: JSON.stringify({ registrationCode }),
        });
      } catch {
        // Best effort cleanup, do not mask original error
      }
      throw error;
    }

    evidence.status = "passed";
    evidence.stage = "complete";
  } catch {
    throw new Error(
      `Map session bootstrap failed at ${evidence.stage}; no credential details retained`,
    );
  } finally {
    deps.save("sessions", evidence);
  }
}

export type MapSessionRequest = <T>(
  path: string,
  init: RequestInit,
) => Promise<T>;
type SessionIdentity = {
  realm: string;
  actorType: string;
  actorId: string;
  scopes: string[];
  driverProvisioningDriverId?: string;
};

export function createMapSessionRequest(
  config: ReturnType<typeof validateCoverageTargets>,
  fetchImpl: typeof fetch,
): MapSessionRequest {
  return async <T>(path: string, init: RequestInit): Promise<T> => {
    const url = `${config.apiOrigin}/api/${path}`;
    assertAllowedUrl(url, config.allowedTargets);
    const response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    assert(response.ok);
    assert.equal(
      response.headers.get("x-drts-candidate-sha"),
      config.candidateSha,
    );
    return normalizeApiResponse(await response.json()) as T;
  };
}

export async function verifyMapProvisioningSession(
  driverId: string,
  request: MapSessionRequest,
  token: string,
) {
  const session = await request<{
    data: { active: boolean; identity: SessionIdentity };
  }>("auth/session", {
    headers: { authorization: `Bearer ${token}` },
  });
  assert(session.data.active);
  assert.equal(session.data.identity.realm, "system");
  assert.equal(session.data.identity.actorType, "system");
  assert.equal(session.data.identity.actorId, MAP_PROVISIONER_ID);
  assert.equal(session.data.identity.driverProvisioningDriverId, driverId);
  assert.deepEqual(session.data.identity.scopes, ["driver:provision"]);
}

export async function issueMapProvisioningSession(
  driverId: string,
  request: MapSessionRequest,
  deps: Pick<BootstrapDeps, "readGoogleIdToken" | "mask">,
) {
  const idToken = deps.readGoogleIdToken("provisioning").trim();
  assert(idToken && !/\s/.test(idToken));
  deps.mask(idToken);
  const issued = await request<{ token: string; expiresIn: string }>(
    "auth/token",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drts-google-id-token": idToken,
        "x-actor-type": "system",
        "x-actor-id": MAP_PROVISIONER_ID,
        "x-realm": "system",
      },
      body: "{}",
    },
  );
  assert(
    typeof issued.token === "string" &&
      issued.token &&
      !/\s/.test(issued.token),
  );
  deps.mask(issued.token);
  assert.equal(issued.expiresIn, "15m");
  await verifyMapProvisioningSession(driverId, request, issued.token);
  return issued;
}

export function readMapGoogleIdToken(
  env: LiveEnv,
  purpose: "observer" | "provisioning",
) {
  // The auth action mints Google ID tokens with verified email. The two
  // audiences keep the observer and provisioning one-time exchanges separate.
  return required(
    env,
    purpose === "observer"
      ? "DRTS_LIVE_MAP_GOOGLE_OBSERVER_ID_TOKEN"
      : "DRTS_LIVE_MAP_GOOGLE_PROVISIONING_ID_TOKEN",
  );
}

async function main() {
  validateCoverageTargets(process.env);
  if (process.argv.includes("--preflight")) return;
  const envPath = required(process.env, "GITHUB_ENV");
  await bootstrapMapSessions(process.env, {
    fetch,
    readGoogleIdToken: (purpose) => readMapGoogleIdToken(process.env, purpose),
    mask: (value) =>
      console.log(
        `::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`,
      ),
    exportSession: (name, value) =>
      appendFileSync(envPath, `${name}=${value}\n`),
    save: (name, evidence) =>
      writeEvidence(
        `.artifacts/live-map-acceptance/evidence-${name}.json`,
        evidence,
      ),
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    // Only validation and our own sanitized bootstrap errors reach logs.
    console.error(
      error instanceof Error ? error.message : "Map session bootstrap failed",
    );
    process.exitCode = 1;
  });
}
