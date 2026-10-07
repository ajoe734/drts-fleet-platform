import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { cases, recipeKey, type Deployment, type Inventory, type ManualEvidence, type Plan, type Session } from "./model";
import { fullSha, hash, inventoryAt } from "./inventory";
import { gate, origin, validateDeployment, validatePlan, validateSessions } from "./guards";

export const output = ".artifacts/live-global-ux";
export const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
export const writeJson = (file: string, value: unknown) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); };
export const required = (name: string): string => { const value = process.env[name]?.trim(); assert(value, `missing ${name}`); return value; };
function gcloud(...args: string[]): unknown { return JSON.parse(execFileSync("gcloud", [...args, "--format=json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }

export function collectDeployment(inventory: Inventory): Deployment {
  const project = required("DEV_GCP_PROJECT_ID"); const region = required("DEV_GCP_REGION");
  const services = [...inventory.surfaces, { app: "api", service: "drts-dev-api" }].map(s => {
    const service = gcloud("run", "services", "describe", s.service, "--project", project, "--region", region) as { status: { url: string; traffic: Array<{ revisionName: string; percent: number }> } };
    const revisions = service.status.traffic.filter(t => t.percent > 0).map(t => {
      const revision = gcloud("run", "revisions", "describe", t.revisionName, "--project", project, "--region", region) as { spec: { containers: Array<{ image: string; env: Array<{ name: string; value?: string }> }> } };
      const container = revision.spec.containers[0]!;
      return { name: t.revisionName, percent: t.percent, sha: container.env.find(e => e.name === "DRTS_CANDIDATE_SHA")?.value ?? "", image: container.image };
    });
    return { app: s.app, service: s.service, origin: origin(service.status.url), revisions };
  });
  const deployment = { project, region, runtimeSha: inventory.runtimeSha, observedAt: new Date().toISOString(), services };
  validateDeployment(deployment, inventory, project, region);
  return deployment;
}

function prepare() {
  assert(process.env.GITHUB_ACTIONS === "true" && process.env.GLOBAL_UX_HOSTED === "authorized-shared-dev", "hosted execution only");
  const harnessSha = required("HARNESS_SHA"); const runtimeSha = required("RUNTIME_SHA");
  assert(fullSha(harnessSha) && fullSha(runtimeSha), "full immutable SHAs required");
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), harnessSha, "checkout mismatch");
  const inventory = inventoryAt(runtimeSha);
  writeJson(`${output}/inventory.json`, inventory);
  const planFile = required("GLOBAL_UX_PLAN"); const planHash = hash(readFileSync(planFile));
  assert.equal(planHash, required("PLAN_SHA256"), "fixture plan digest mismatch");
  const plan = readJson<Plan>(planFile); validatePlan(plan, inventory);
  const deployment = collectDeployment(inventory); writeJson(`${output}/deployment-before.json`, deployment);
  const sessions = readJson<Session[]>(required("GLOBAL_UX_SESSIONS")); validateSessions(sessions, deployment, inventory);
  // Invoker credentials are origin-bound transport credentials, never application identities.
  const tokens: Record<string, string> = {};
  for (const service of deployment.services) {
    tokens[service.origin] = execFileSync("gcloud", ["auth", "print-identity-token", `--audiences=${service.origin}`, `--impersonate-service-account=${required("GLOBAL_UX_INVOKER_SA")}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  }
  writeJson(required("GLOBAL_UX_TOKENS"), tokens);
  const all = cases(inventory);
  writeJson(`${output}/binding.json`, { harnessSha, runId: required("GITHUB_RUN_ID") + "/" + required("GITHUB_RUN_ATTEMPT"), planHash });
  writeJson(`${output}/readiness.json`, { status: "prepared", totalCases: all.length, missingRecipes: [...new Set(all.filter(c => !plan.recipes[recipeKey(c)]).map(recipeKey))], manual: "pending", design: "unverified" });
}

function finish() {
  const inventory = readJson<Inventory>(`${output}/inventory.json`);
  const before = readJson<Deployment>(`${output}/deployment-before.json`);
  const after = collectDeployment(inventory); writeJson(`${output}/deployment-after.json`, after);
  assert.deepEqual(after.services, before.services, "runtime changed during suite");
  const binding = readJson<{ harnessSha: string; runId: string; planHash: string }>(`${output}/binding.json`);
  const rows = readdirSync(`${output}/cases`).filter(f => f.endsWith(".json")).map(f => readJson<Parameters<typeof gate>[1][number]>(`${output}/cases/${f}`));
  const manual = readJson<ManualEvidence[]>(required("GLOBAL_UX_MANUAL"));
  const artifactRoot = path.resolve(required("GLOBAL_UX_ARTIFACT_ROOT"));
  const evidence = gate(inventory, rows, manual, binding, file => {
    assert(!path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."), "artifact path escaped bundle");
    const candidate = path.resolve(artifactRoot, file);
    assert(candidate.startsWith(artifactRoot + path.sep), "artifact escaped root");
    return readFileSync(candidate);
  });
  writeJson(`${output}/acceptance.json`, evidence);
}

// Import-safe for repository unit checks; only the explicit CLI entry mutates artifacts.
if (process.argv[1]?.endsWith("/runner.ts")) {
  try {
    if (process.argv[2] === "prepare") prepare();
    else if (process.argv[2] === "gate") finish();
    else if (process.argv[2] === "inventory") writeJson(`${output}/inventory.json`, inventoryAt(required("RUNTIME_SHA")));
    else throw new Error("expected prepare, gate or inventory");
  } catch {
    // Raw exceptions from navigation/gcloud may contain URLs, credentials or PII.
    writeJson(`${output}/failure-${process.argv[2]}.json`, { status: "blocked", phase: process.argv[2], reason: "Precondition/evidence gate failed; inspect protected inputs and retained sanitized readiness/case artifacts." });
    process.exitCode = 1;
  }
}
