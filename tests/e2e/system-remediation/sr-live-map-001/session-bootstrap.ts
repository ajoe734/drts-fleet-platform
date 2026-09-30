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
    const internalKey = deps.readInternalKey().trim();
    assert(internalKey && !/[\r\n]/.test(internalKey));
    deps.mask(internalKey);
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
    const sessions = [
      {
        realm: "driver",
        actorType: "driver_user",
        actorId: config.driverId,
        scopes: ["driver:read"],
        name: "DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN",
      },
      {
        realm: "ops",
        actorType: "ops_user",
        actorId: MAP_OBSERVER_ID,
        scopes: ["regulatory:read"],
        name: "DRTS_LIVE_MAP_OBSERVER_SESSION_TOKEN",
      },
    ];
    const verified: Array<{ name: string; token: string }> = [];
    for (const subject of sessions) {
      evidence.stage = `${subject.realm}:issue`;
      const issued = await request<{ token: string; expiresIn: string }>(
        "auth/token",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-drts-internal-key": internalKey,
            "x-actor-type": subject.actorType,
            "x-actor-id": subject.actorId,
            "x-realm": subject.realm,
            "x-scopes": subject.scopes.join(","),
          },
          body: "{}",
        },
      );
      assert(
        typeof issued.token === "string" &&
          issued.token.length > 0 &&
          !/\s/.test(issued.token),
      );
      deps.mask(issued.token);
      // The supported dev issuer currently fixes user sessions to 8h. Do not
      // locally sign/shorten a JWT or misrepresent this as a 15-minute token.
      assert(/^(?:[1-9]\d*[sm]|[1-8]h)$/.test(issued.expiresIn));
      const duration =
        Number.parseInt(issued.expiresIn, 10) *
        ({ s: 1, m: 60, h: 3600 }[issued.expiresIn.slice(-1)] ?? 0);
      assert(duration >= 300 && duration <= 8 * 3600);
      evidence.stage = `${subject.realm}:verify-session`;
      const session = await request<{
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
        headers: { authorization: `Bearer ${issued.token}` },
      });
      assert(session.data.active);
      const identity = session.data.identity;
      assert.equal(identity.realm, subject.realm);
      assert.equal(identity.actorType, subject.actorType);
      assert.equal(identity.actorId, subject.actorId);
      assert.deepEqual([...identity.scopes].sort(), [...subject.scopes].sort());
      verified.push({ name: subject.name, token: issued.token });
      evidence.sessions.push({
        realm: subject.realm,
        actor_type: subject.actorType,
        actor_id: subject.actorId,
        scopes: subject.scopes,
        expires_in: issued.expiresIn,
      });
    }
    // Neither token reaches subsequent steps unless both session checks pass.
    for (const { name, token } of verified) deps.exportSession(name, token);
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
