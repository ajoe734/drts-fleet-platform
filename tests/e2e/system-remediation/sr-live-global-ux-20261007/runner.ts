import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { strict as assert, AssertionError } from "node:assert";
import {
  cases,
  recipeKey,
  type Deployment,
  type Inventory,
  type ManualEvidence,
  type Plan,
  type Session,
  type Applicability,
} from "./model";
import { fullSha, hash, inventoryAt, sourceAt } from "./inventory";
import {
  gate,
  origin,
  validateDeployment,
  validatePlan,
  validateSessions,
  validateApplicability,
  isolatedHeaders,
} from "./guards";

export const output =
  process.env.GLOBAL_UX_OUTPUT ?? ".artifacts/live-global-ux";
export const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(file, "utf8")) as T;
export const writeJson = (file: string, value: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
};
export const required = (name: string): string => {
  const value = process.env[name]?.trim();
  assert(value, `missing ${name}`);
  return value;
};
function gcloud(...args: string[]): unknown {
  return JSON.parse(
    execFileSync("gcloud", [...args, "--format=json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
}

export function collectDeployment(inventory: Inventory): Deployment {
  const project = required("DEV_GCP_PROJECT_ID");
  const region = required("DEV_GCP_REGION");
  const services = [
    ...inventory.surfaces,
    { app: "api", service: "drts-dev-api" },
  ].map((s) => {
    const service = gcloud(
      "run",
      "services",
      "describe",
      s.service,
      "--project",
      project,
      "--region",
      region,
    ) as {
      status: {
        url: string;
        traffic: Array<{ revisionName: string; percent: number }>;
      };
    };
    const revisions = service.status.traffic
      .filter((t) => t.percent > 0)
      .map((t) => {
        const revision = gcloud(
          "run",
          "revisions",
          "describe",
          t.revisionName,
          "--project",
          project,
          "--region",
          region,
        ) as {
          spec: {
            containers: Array<{
              image: string;
              env: Array<{ name: string; value?: string }>;
            }>;
          };
        };
        const container = revision.spec.containers[0]!;
        return {
          name: t.revisionName,
          percent: t.percent,
          sha:
            container.env.find((e) => e.name === "DRTS_CANDIDATE_SHA")?.value ??
            "",
          image: container.image,
        };
      });
    return {
      app: s.app,
      service: s.service,
      origin: origin(service.status.url),
      revisions,
    };
  });
  const deployment = {
    project,
    region,
    runtimeSha: inventory.runtimeSha,
    observedAt: new Date().toISOString(),
    services,
  };
  validateDeployment(deployment, inventory, project, region);
  return deployment;
}

export function reviewedApplicability(
  harnessSha: string,
  inventory: Inventory,
) {
  const rules = JSON.parse(
    sourceAt(
      harnessSha,
      "tests/e2e/system-remediation/sr-live-global-ux-20261007/applicability.json",
    ),
  ) as Applicability[];
  validateApplicability(rules, inventory);
  return rules;
}
export function scaffoldPlan(inventory: Inventory): Plan {
  const recipes: Plan["recipes"] = {};
  const screen = inventory.screens.find(
    (s) => s.id === "enterprise-dispatch-web:/auth-required",
  );
  if (screen) {
    const dictionary = sourceAt(
      inventory.runtimeSha,
      "apps/enterprise-dispatch-web/lib/translations.ts",
    );
    assert(
      dictionary.includes(
        '"gate.authRequired.title": "Sign-in required again"',
      ) && dictionary.includes('"gate.authRequired.title": "需要重新登入"'),
      "example source strings changed",
    );
    for (const role of screen.roles)
      recipes[recipeKey({ screen, role, state: "default" })] = {
        route: "/auth-required",
        finalPath: "/auth-required",
        ready: "h1",
        expectedStatus: 200,
        stateProof: {
          selector: "h1",
          text: { "zh-TW": "需要重新登入", "en-US": "Sign-in required again" },
          source: screen.source,
        },
        steps: { "zh-TW": [], "en-US": [] },
        formats: { "zh-TW": [], "en-US": [] },
        noFormatsReason:
          "EnterpriseGatePage auth-required has instructions/actions, no date or money amount; verify against frozen source during review.",
        mask: [],
      };
  }
  return {
    runtimeSha: inventory.runtimeSha,
    approvalRef: "",
    expiresAt: "1970-01-01T00:00:00Z",
    sandboxOnly: true,
    recipes,
  };
}
async function prepare() {
  assert(
    process.env.GITHUB_ACTIONS === "true" &&
      process.env.GLOBAL_UX_HOSTED === "authorized-shared-dev",
    "hosted execution only",
  );
  const harnessSha = required("HARNESS_SHA");
  const runtimeSha = required("RUNTIME_SHA");
  assert(
    fullSha(harnessSha) && fullSha(runtimeSha),
    "full immutable SHAs required",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    harnessSha,
    "checkout mismatch",
  );
  const inventory = inventoryAt(runtimeSha);
  const applicability = reviewedApplicability(harnessSha, inventory);
  writeJson(`${output}/inventory.json`, inventory);
  const planFile = required("GLOBAL_UX_PLAN");
  const planHash = hash(readFileSync(planFile));
  assert.equal(
    planHash,
    required("PLAN_SHA256"),
    "fixture plan digest mismatch",
  );
  const plan = readJson<Plan>(planFile);
  validatePlan(plan, inventory);
  const deployment = collectDeployment(inventory);
  writeJson(`${output}/deployment-before.json`, deployment);
  const sessions = readJson<Session[]>(required("GLOBAL_UX_SESSIONS"));
  validateSessions(sessions, deployment, inventory);
  // Invoker credentials are origin-bound transport credentials, never application identities.
  const tokens: Record<string, string> = {};
  for (const service of deployment.services) {
    tokens[service.origin] = execFileSync(
      "gcloud",
      [
        "auth",
        "print-identity-token",
        `--audiences=${service.origin}`,
        `--impersonate-service-account=${required("GLOBAL_UX_INVOKER_SA")}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  }
  writeJson(required("GLOBAL_UX_TOKENS"), tokens);
  const api = deployment.services.find((s) => s.app === "api")!.origin;
  const health = await fetch(new URL("/api/health", api), {
    headers: isolatedHeaders(api, api, tokens[api], {}),
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  assert(
    health.ok && health.headers.get("x-drts-candidate-sha") === runtimeSha,
    "API health runtime SHA unavailable/mismatched",
  );
  const healthBody = (await health.json()) as { candidateSha?: string };
  assert.equal(
    healthBody.candidateSha,
    runtimeSha,
    "API health body runtime mismatch",
  );
  writeJson(`${output}/api-health.json`, {
    status: "passed",
    runtimeSha,
    origin: api,
  });
  const all = cases(inventory);
  writeJson(`${output}/binding.json`, {
    harnessSha,
    runId: required("GITHUB_RUN_ID") + "/" + required("GITHUB_RUN_ATTEMPT"),
    planHash,
  });
  writeJson(`${output}/readiness.json`, {
    status: "prepared",
    totalCases: all.length,
    missingRecipes: [
      ...new Set(
        all
          .filter(
            (c) =>
              !plan.recipes[recipeKey(c)] &&
              !applicability.some((rule) => rule.key === recipeKey(c)),
          )
          .map(recipeKey),
      ),
    ],
    manual: "pending",
    design: "unverified",
  });
}

function finish() {
  const inventory = readJson<Inventory>(`${output}/inventory.json`);
  const before = readJson<Deployment>(`${output}/deployment-before.json`);
  const after = collectDeployment(inventory);
  writeJson(`${output}/deployment-after.json`, after);
  assert.deepEqual(
    after.services,
    before.services,
    "runtime changed during suite",
  );
  const binding = readJson<{
    harnessSha: string;
    runId: string;
    planHash: string;
  }>(`${output}/binding.json`);
  const rows = readdirSync(`${output}/cases`)
    .filter((f) => f.endsWith(".json"))
    .map((f) =>
      readJson<Parameters<typeof gate>[1][number]>(`${output}/cases/${f}`),
    );
  writeJson(`${output}/case-summary.json`, {
    expected: cases(inventory).length,
    received: rows.length,
    statuses: Object.fromEntries(
      ["passed", "failed", "blocked", "skipped", "not_applicable"].map(
        (status) => [
          status,
          rows.filter((row) => row.status === status).length,
        ],
      ),
    ),
    liveAcceptance: "pending-gate",
  });
  const planFile = required("GLOBAL_UX_PLAN");
  assert.equal(
    hash(readFileSync(planFile)),
    binding.planHash,
    "plan changed during suite",
  );
  const plan = readJson<Plan>(planFile);
  validatePlan(plan, inventory);
  const applicability = reviewedApplicability(binding.harnessSha, inventory);
  for (const c of cases(inventory)) {
    const row = rows.find((row) => row.id === c.id);
    if (row?.status === "passed")
      assert.equal(
        row.route,
        plan.recipes[recipeKey(c)]?.route,
        "evidence route does not match reviewed plan",
      );
  }
  const manual = readJson<ManualEvidence[]>(required("GLOBAL_UX_MANUAL"));
  const artifactRoot = path.resolve(required("GLOBAL_UX_ARTIFACT_ROOT"));
  const evidence = gate(
    inventory,
    rows,
    manual,
    binding,
    (file) => {
      assert(
        !path.isAbsolute(file) && !file.split(/[\\/]/).includes(".."),
        "artifact path escaped bundle",
      );
      const candidate = realpathSync(path.resolve(artifactRoot, file));
      assert(
        candidate.startsWith(artifactRoot + path.sep),
        "artifact escaped root",
      );
      return readFileSync(candidate);
    },
    applicability,
  );
  writeJson(`${output}/acceptance.json`, evidence);
}

// Import-safe for repository unit checks; only the explicit CLI entry mutates artifacts.
if (process.argv[1]?.endsWith("/runner.ts")) {
  void (async () => {
    if (process.argv[2] === "prepare") await prepare();
    else if (process.argv[2] === "gate") finish();
    else if (process.argv[2] === "inventory")
      writeJson(
        `${output}/inventory.json`,
        inventoryAt(required("RUNTIME_SHA")),
      );
    else if (process.argv[2] === "scaffold") {
      const inventory = inventoryAt(required("RUNTIME_SHA"));
      writeJson(`${output}/inventory.json`, inventory);
      writeJson(`${output}/plan.draft.json`, scaffoldPlan(inventory));
      writeJson(`${output}/recipe-obligations.json`, [
        ...new Set(cases(inventory).map(recipeKey)),
      ]);
    } else throw new Error("expected prepare, gate, inventory or scaffold");
  })().catch((error: unknown) => {
    // Raw exceptions from navigation/gcloud may contain URLs, credentials or PII.
    writeJson(`${output}/failure-${process.argv[2]}.json`, {
      status: "blocked",
      phase: process.argv[2],
      reason:
        error instanceof AssertionError
          ? error.message.split("\n")[0]
          : "Required input/source/cloud readback unavailable; inspect protected inputs. Raw errors suppressed to protect credentials.",
    });
    process.exitCode = 1;
  });
}
