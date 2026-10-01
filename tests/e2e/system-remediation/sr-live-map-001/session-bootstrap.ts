import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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

export const MAP_OBSERVER_ID = "live-map-observer";
type BootstrapDeps = {
  fetch: typeof fetch;
  readGoogleIdToken: () => string;
  readInternalKey: () => string;
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
    stage: "internal-key",
    sessions: [] as Array<{
      realm: string;
      actor_type: string;
      actor_id: string;
      scopes: string[];
      expires_in: string;
    }>,
  };
  try {
    const idToken = deps.readGoogleIdToken().trim();
    assert(idToken && !/[\r\n]/.test(idToken));
    deps.mask(idToken);
    const request = async <T>(path: string, init: RequestInit): Promise<T> => {
      const url = `${config.apiOrigin}/api/${path}`;
      assertAllowedUrl(url, config.allowedTargets);
      const response = await deps.fetch(url, {
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
        identity: { realm: string; actorType: string; actorId: string; scopes: string[] };
      };
    }>("auth/session", {
      headers: { authorization: `Bearer ${observerIssued.token}` },
    });
    assert(session.data.active);
    assert.equal(session.data.identity.realm, "ops");
    assert.equal(session.data.identity.actorType, "ops_observer");
    assert.equal(session.data.identity.actorId, MAP_OBSERVER_ID);
    assert.deepEqual([...session.data.identity.scopes].sort(), ["regulatory:read"]);
    
    verified.push({ name: "DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN", token: observerIssued.token });
    evidence.sessions.push({
      realm: "ops",
      actor_type: "ops_observer",
      actor_id: MAP_OBSERVER_ID,
      scopes: ["regulatory:read"],
      expires_in: observerIssued.expiresIn,
    });

    // 2. Get a temp platform session with driver:provision to issue driver invite
    evidence.stage = `driver:invite-setup`;
    const tempOpsIssued = await request<{ token: string; expiresIn: string }>(
      "auth/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-drts-internal-key": deps.readInternalKey().trim(),
          "x-actor-type": "platform_admin",
          "x-actor-id": "principal_platform_admin_default",
          "x-realm": "platform",
          "x-scopes": "driver:provision",
        },
        body: "{}",
      },
    );
    
    evidence.stage = `driver:issue-invite`;
    const invite = await request<{ data: { registrationCode: string } }>(
      "auth/driver/device/invite",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${tempOpsIssued.token}`,
        },
        body: JSON.stringify({ driverId: config.driverId }),
      },
    );
    const registrationCode = invite.data.registrationCode;
    deps.mask(registrationCode);
    
    evidence.stage = `driver:register-device`;
    const deviceId = `live-map-run-${Date.now()}`;
    const driverSession = await request<{ data: { accessToken: { token: string; expiresIn: string } } }>(
      "auth/driver/device/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ registrationCode, deviceId }),
      },
    );
    const driverToken = driverSession.data.accessToken.token;
    deps.mask(driverToken);
    
    evidence.stage = `driver:verify-session`;
    session = await request<{
      data: {
        active: boolean;
        identity: { realm: string; actorType: string; actorId: string; scopes: string[] };
      };
    }>("auth/session", {
      headers: { authorization: `Bearer ${driverToken}` },
    });
    assert(session.data.active);
    assert.equal(session.data.identity.realm, "driver");
    assert.equal(session.data.identity.actorType, "driver_user");
    assert.equal(session.data.identity.actorId, config.driverId);
    assert.deepEqual([...session.data.identity.scopes].sort(), ["driver:read"]);
    
    verified.push({ name: "DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN", token: driverToken });
    evidence.sessions.push({
      realm: "driver",
      actor_type: "driver_user",
      actor_id: config.driverId,
      scopes: ["driver:read"],
      expires_in: driverSession.data.accessToken.expiresIn,
    });
    
    // Neither token reaches subsequent steps unless both session checks pass.
    for (const { name, token } of verified) deps.exportSession(name, token);
    deps.exportSession("DRTS_LIVE_MAP_DRIVER_DEVICE_ID", deviceId);
    
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

async function main() {
  validateCoverageTargets(process.env);
  if (process.argv.includes("--preflight")) return;
  const project = required(process.env, "DEV_GCP_PROJECT_ID");
  const envPath = required(process.env, "GITHUB_ENV");
  await bootstrapMapSessions(process.env, {
    fetch,
    readGoogleIdToken: () =>
      execFileSync(
        "gcloud",
        [
          "auth",
          "print-identity-token",
          `--audiences=${process.env.DRTS_LIVE_MAP_API_ORIGIN}`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    readInternalKey: () =>
      execFileSync(
        "gcloud",
        [
          "secrets",
          "versions",
          "access",
          "latest",
          "--secret=drts-dev-jwt-secret",
          `--project=${project}`,
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
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
