import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { strict as assert, AssertionError } from "node:assert";
import {
  cases,
  manualChecks,
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
  assertNonSecretBytes,
  gate,
  origin,
  safeRelativePath,
  validateDeployment,
  validateInputManual,
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

function safeWorkspaceSubpath(value: string, label: string): string {
  assert(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 240 &&
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !/[\\\0\r\n]/.test(value),
    `unsafe ${label} path`,
  );
  const segments = value.split("/");
  for (const seg of segments) {
    assert(
      seg.length > 0 && seg !== "." && seg !== ".." && seg !== ".git",
      `unsafe ${label} path`,
    );
  }
  const normalized = segments.join("/");
  assert(
    normalized !== ".local/global-ux-private" &&
      !normalized.startsWith(".local/global-ux-private/"),
    "private credential directory rejected",
  );
  const root = realpathSync(process.cwd());
  const resolved = path.resolve(root, normalized);
  assert(
    resolved.startsWith(root + path.sep),
    `${label} escaped repository root`,
  );
  return normalized;
}

function collectInputArtifacts(
  rootDir: string,
  prefix = "",
  files = new Map<string, Buffer>(),
): Map<string, Buffer> {
  const dirStat = lstatSync(rootDir);
  assert(!dirStat.isSymbolicLink(), "input bundle must not contain symlinks");
  assert(dirStat.isDirectory(), "artifacts entry must be a directory");
  const entries = readdirSync(rootDir);
  if (prefix) assert(entries.length > 0, "empty directory in input artifacts");
  for (const entry of entries) {
    assert(!entry.startsWith("."), "hidden file in input bundle");
    const fullPath = path.join(rootDir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    const st = lstatSync(fullPath);
    assert(!st.isSymbolicLink(), "input bundle must not contain symlinks");
    if (st.isDirectory()) {
      collectInputArtifacts(fullPath, relPath, files);
    } else {
      assert(st.isFile(), "unsupported file type in input bundle");
      const safeRel = safeRelativePath(relPath, "artifact");
      const bytes = readFileSync(fullPath);
      assertNonSecretBytes(bytes, "artifact");
      files.set(safeRel, bytes);
    }
  }
  return files;
}

export function materializeGitInput(
  inputRef: string,
  inputDir: string,
  destinationDir: string,
) {
  assert(fullSha(inputRef), "inputRef must be immutable full SHA");
  const cleanDir = safeWorkspaceSubpath(inputDir, "input directory");
  const listing = execFileSync(
    "git",
    ["ls-tree", "-r", "-z", `${inputRef}:${cleanDir}`],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  const records = listing.split("\0").filter(Boolean);
  assert(records.length > 0, "empty git input directory");
  rmSync(destinationDir, { recursive: true, force: true });
  mkdirSync(destinationDir, { recursive: true });
  for (const record of records) {
    const tabIndex = record.indexOf("\t");
    assert(tabIndex > 0, "malformed git tree entry");
    const meta = record.slice(0, tabIndex).trim().split(/\s+/);
    const relPath = record.slice(tabIndex + 1);
    const [mode, type, blob] = meta;
    assert(
      (mode === "100644" || mode === "100755") &&
        type === "blob" &&
        blob &&
        fullSha(blob),
      "input bundle must not contain symlinks or submodules",
    );
    assert(
      relPath === "plan.json" ||
        relPath === "manual.json" ||
        relPath.startsWith("artifacts/"),
      `unexpected input bundle entry: ${relPath}`,
    );
    if (relPath.startsWith("artifacts/")) {
      safeRelativePath(relPath.slice("artifacts/".length), "artifact");
    }
    const bytes = execFileSync("git", ["cat-file", "blob", blob], {
      maxBuffer: 50 * 1024 * 1024,
    });
    const target = path.join(destinationDir, relPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, bytes, { mode: 0o600 });
  }
}

export function packageInput(options: {
  sourceDir: string;
  bundleDir: string;
  harnessSha: string;
  runtimeSha: string;
  expectedPlanSha256: string;
  inventory?: Inventory;
  applicability?: Applicability[];
  runId?: string;
}) {
  assert(
    fullSha(options.harnessSha) && fullSha(options.runtimeSha),
    "full immutable SHAs required",
  );
  assert(
    /^[a-f0-9]{64}$/.test(options.expectedPlanSha256),
    "invalid plan sha256",
  );
  assert(existsSync(options.sourceDir), "input source directory missing");
  const sourceStat = lstatSync(options.sourceDir);
  assert(
    !sourceStat.isSymbolicLink(),
    "input bundle must not contain symlinks",
  );
  assert(sourceStat.isDirectory(), "input source must be a directory");
  const resolvedSource = realpathSync(options.sourceDir);
  const resolvedBundle = path.resolve(options.bundleDir);
  assert(
    resolvedSource !== resolvedBundle &&
      !resolvedSource.startsWith(resolvedBundle + path.sep) &&
      !resolvedBundle.startsWith(resolvedSource + path.sep),
    "input source and bundle output directories must be distinct",
  );
  const entries = readdirSync(options.sourceDir);
  for (const entry of entries) {
    assert(
      entry === "plan.json" || entry === "manual.json" || entry === "artifacts",
      `unexpected input bundle entry: ${entry}`,
    );
    const st = lstatSync(path.join(options.sourceDir, entry));
    assert(!st.isSymbolicLink(), "input bundle must not contain symlinks");
  }
  assert(
    entries.includes("plan.json") && entries.includes("manual.json"),
    "input bundle requires plan.json and manual.json",
  );
  const planFile = path.join(options.sourceDir, "plan.json");
  const manualFile = path.join(options.sourceDir, "manual.json");
  assert(
    lstatSync(planFile).isFile() && lstatSync(manualFile).isFile(),
    "plan.json and manual.json must be regular files",
  );
  const planBytes = readFileSync(planFile);
  assertNonSecretBytes(planBytes, "plan.json");
  const planSha256 = hash(planBytes);
  assert.equal(
    planSha256,
    options.expectedPlanSha256,
    "fixture plan digest mismatch",
  );
  const plan = JSON.parse(planBytes.toString("utf8")) as Plan;
  assert(
    plan &&
      typeof plan === "object" &&
      !Array.isArray(plan) &&
      Object.keys(plan).sort().join(",") ===
        "approvalRef,expiresAt,recipes,runtimeSha,sandboxOnly",
    "unexpected plan fields",
  );
  const inventory = options.inventory ?? inventoryAt(options.runtimeSha);
  const applicability =
    options.applicability ??
    reviewedApplicability(options.harnessSha, inventory);
  validatePlan(plan, inventory);

  const manualBytes = readFileSync(manualFile);
  assertNonSecretBytes(manualBytes, "manual.json");
  const manualSha256 = hash(manualBytes);
  const manual = JSON.parse(manualBytes.toString("utf8")) as ManualEvidence[];
  const artifacts = entries.includes("artifacts")
    ? collectInputArtifacts(path.join(options.sourceDir, "artifacts"))
    : new Map<string, Buffer>();
  const referenced = validateInputManual(
    manual,
    inventory,
    { harnessSha: options.harnessSha, planHash: planSha256 },
    (file) => {
      const bytes = artifacts.get(file);
      assert(bytes, "manual artifact missing/corrupt");
      return bytes;
    },
    applicability,
  );
  for (const file of artifacts.keys()) {
    assert(referenced.has(file), `unreferenced input artifact: ${file}`);
  }

  rmSync(options.bundleDir, { recursive: true, force: true });
  mkdirSync(path.join(options.bundleDir, "artifacts"), { recursive: true });
  writeFileSync(path.join(options.bundleDir, "plan.json"), planBytes, {
    mode: 0o600,
  });
  writeFileSync(path.join(options.bundleDir, "manual.json"), manualBytes, {
    mode: 0o600,
  });
  for (const [rel, bytes] of artifacts.entries()) {
    const destination = path.join(options.bundleDir, "artifacts", rel);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { mode: 0o600 });
  }
  assert.equal(
    hash(readFileSync(path.join(options.bundleDir, "plan.json"))),
    planSha256,
    "packaged plan.json digest mismatch",
  );
  assert.equal(
    hash(readFileSync(path.join(options.bundleDir, "manual.json"))),
    manualSha256,
    "packaged manual.json digest mismatch",
  );
  for (const [rel, bytes] of artifacts.entries()) {
    assert.equal(
      hash(readFileSync(path.join(options.bundleDir, "artifacts", rel))),
      hash(bytes),
      "packaged artifact digest mismatch",
    );
  }

  const allCases = cases(inventory);
  const applicableCases = allCases.filter(
    (c) => !applicability.some((rule) => rule.key === recipeKey(c)),
  );
  const applicableRecipeKeys = [...new Set(applicableCases.map(recipeKey))];
  const missingRecipes = applicableRecipeKeys.filter(
    (key) => !plan.recipes[key],
  );
  const completeManualCases = manual.filter(
    (m) =>
      m.checks.length === manualChecks.length &&
      m.checks.every((check) => check.status === "passed"),
  ).length;

  return {
    status: "packaged-input-only" as const,
    artifactName: "global-ux-input" as const,
    bundleRunId: options.runId ?? process.env.GITHUB_RUN_ID ?? "local",
    harnessSha: options.harnessSha,
    runtimeSha: inventory.runtimeSha,
    planSha256,
    planBytes: planBytes.length,
    manualSha256,
    manualBytes: manualBytes.length,
    artifacts: [...artifacts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, bytes]) => ({
        path: file,
        bytes: bytes.length,
        sha256: hash(bytes),
      })),
    totalCases: allCases.length,
    applicableCases: applicableCases.length,
    configuredRecipes: Object.keys(plan.recipes).length,
    missingRecipeCount: missingRecipes.length,
    manualEvidenceRows: manual.length,
    completeManualCases,
    missingManualCases: applicableCases.length - completeManualCases,
    liveAcceptance: "not-run" as const,
  };
}

function packageCli() {
  const harnessSha = required("HARNESS_SHA");
  const runtimeSha = required("RUNTIME_SHA");
  const expectedPlanSha256 = required("PLAN_SHA256");
  assert(
    fullSha(harnessSha) && fullSha(runtimeSha),
    "full immutable SHAs required",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    harnessSha,
    "checkout mismatch",
  );
  const inputDir = safeWorkspaceSubpath(
    process.env.GLOBAL_UX_INPUT_SOURCE?.trim() ||
      "tests/e2e/system-remediation/sr-live-global-ux-20261007/input",
    "input directory",
  );
  const bundleDir = safeWorkspaceSubpath(
    process.env.GLOBAL_UX_INPUT_BUNDLE?.trim() ||
      ".local/global-ux-input-bundle",
    "bundle directory",
  );
  const inputRef = process.env.GLOBAL_UX_INPUT_REF?.trim();
  const stagingDir = ".local/global-ux-input-staging";
  try {
    let sourceDir = inputDir;
    if (inputRef && inputRef !== harnessSha) {
      materializeGitInput(inputRef, inputDir, stagingDir);
      sourceDir = stagingDir;
    } else if (inputRef === harnessSha && !existsSync(inputDir)) {
      materializeGitInput(inputRef, inputDir, stagingDir);
      sourceDir = stagingDir;
    }
    const receipt = packageInput({
      sourceDir,
      bundleDir,
      harnessSha,
      runtimeSha,
      expectedPlanSha256,
    });
    writeJson(`${output}/input-package.json`, receipt);
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
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
    } else if (
      process.argv[2] === "package" ||
      process.argv[2] === "package-input"
    )
      packageCli();
    else
      throw new Error(
        "expected prepare, gate, inventory, scaffold or package-input",
      );
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
