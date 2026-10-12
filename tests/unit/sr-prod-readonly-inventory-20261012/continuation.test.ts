import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const collectorPath = require.resolve(
  process.env.INVENTORY_COLLECTOR_UNDER_TEST ||
    "../../../operations/verification/production-readonly-inventory/collector.cjs",
);
const c = require(collectorPath);
const { fixture, SHA, SENTINEL } = require("./fixture.cjs");
const shared = {
  PROD_ARTIFACT_REGISTRY:
    "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts",
  PROD_ARTIFACT_PROJECT_ID: "drts-dev-devcc-20260825",
  PROD_ARTIFACT_REGION: "us-central1",
  PROD_ARTIFACT_REPOSITORY: "drts",
};
async function invoke(env: any, options: any = {}) {
  const artifacts = new Map<string, string>();
  const logs: string[] = [];
  const transport = vi.fn();
  let status = 0;
  await c.main({
    env,
    args: ["guard"],
    git: () => SHA,
    write: (name: string, contents: string) => artifacts.set(name, contents),
    transport,
    log: (message: string) => logs.push(message),
    exitCode: (value: number) => {
      status = value;
    },
    ...options,
  });
  return { artifacts, logs, status, transport };
}

describe("actual configured shared registry continuation", () => {
  it("collects Prod core with zero foreign registry requests and blocked availability/lineage", async () => {
    const f = fixture(shared, c);
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.collection).toBe("incomplete");
    expect(report.requests).toBe(62);
    expect(f.calls).toHaveLength(62);
    for (const call of f.calls) {
      expect(call.method).toBe("GET");
      expect(call.url).toContain(c.TARGET.project);
      expect(call.url).not.toContain("drts-dev-devcc-20260825");
      expect(new URL(call.url).hostname).not.toBe(
        "artifactregistry.googleapis.com",
      );
    }
    for (const id of ["artifact-repository", "artifact-images"])
      expect(report.records.find((r: any) => r.id === id)).toMatchObject({
        status: "blocked",
        code: "SHARED_REGISTRY_NOT_AUTHORIZED",
      });
    expect(
      report.records.filter((r: any) => r.kind === "service"),
    ).toHaveLength(10);
    expect(
      report.records.filter((r: any) => r.kind === "revision"),
    ).toHaveLength(10);
    expect(
      report.records.find((r: any) => r.id === "api").data.template
        .containers[0].image,
    ).toContain(shared.PROD_ARTIFACT_REGISTRY);
    expect(report.runtimeProvenance).toBe("unverified");
    expect(c.serialize(report)).not.toContain(SENTINEL);
  });
  it.each([
    ["PROD_ARTIFACT_REGISTRY", "us-central1-docker.pkg.dev/foreign/drts"],
    [
      "PROD_ARTIFACT_REGISTRY",
      "europe-west1-docker.pkg.dev/drts-dev-devcc-20260825/drts",
    ],
    [
      "PROD_ARTIFACT_REGISTRY",
      "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/unknown",
    ],
    [
      "PROD_ARTIFACT_REGISTRY",
      "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts/extra",
    ],
    ["PROD_ARTIFACT_PROJECT_ID", c.TARGET.project],
    ["PROD_ARTIFACT_PROJECT_ID", ""],
    ["PROD_ARTIFACT_REGION", "europe-west1"],
    ["PROD_ARTIFACT_REPOSITORY", "unknown"],
  ])(
    "rejects unknown or inconsistent registry %s=%s before requests",
    async (key, value) => {
      const f = fixture();
      Object.assign(f.env, shared, { [key]: value });
      await expect(c.collect(f.env, SHA, f.transport)).rejects.toThrow(
        "ARTIFACT_TARGET_REJECTED",
      );
      const run = await invoke(f.env);
      expect(run.status).toBe(1);
      expect(JSON.parse(run.artifacts.get("guard-diagnostic")!).code).toBe(
        "ARTIFACT_TARGET_REJECTED",
      );
      expect(f.calls).toHaveLength(0);
      expect(run.transport).not.toHaveBeenCalled();
    },
  );
  it("rejects inconsistent same-project selectors and accepts explicit consistent selectors", async () => {
    const f = fixture({
      PROD_ARTIFACT_REGISTRY: `us-central1-docker.pkg.dev/${c.TARGET.project}/drts`,
      PROD_ARTIFACT_PROJECT_ID: c.TARGET.project,
      PROD_ARTIFACT_REGION: c.TARGET.region,
      PROD_ARTIFACT_REPOSITORY: "drts",
    });
    expect((await c.collect(f.env, SHA, f.transport)).collection).toBe(
      "complete",
    );
    f.env.PROD_ARTIFACT_PROJECT_ID = shared.PROD_ARTIFACT_PROJECT_ID;
    expect(() => c.inventory(f.env)).toThrow("ARTIFACT_TARGET_REJECTED");
  });
  it("recognizes the exact existing tuple through original rail selector precedence", async () => {
    const f = fixture({ ...shared, PROD_ARTIFACT_REGISTRY: "" });
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.collection).toBe("incomplete");
    expect(
      f.calls.every(
        (d: any) => !d.url.includes("artifactregistry.googleapis.com"),
      ),
    ).toBe(true);
  });
  it.each([403, 404])(
    "retains Prod observations and shared blocked records after HTTP %s",
    async (status) => {
      const f = fixture(shared);
      const op = f.plan.operations.find((o: any) => o.kind === "sql");
      f.responses.set(new URL(op.url).pathname, {
        status,
        body: { error: SENTINEL },
      });
      const report = await c.collect(f.env, SHA, f.transport);
      expect(report.records.find((r: any) => r.id === "cloudsql").code).toBe(
        status === 403 ? "PERMISSION_DENIED" : "MISSING",
      );
      expect(
        report.records.filter((r: any) => r.status === "observed").length,
      ).toBeGreaterThan(50);
      expect(
        report.records.find((r: any) => r.id === "artifact-images").status,
      ).toBe("blocked");
      expect(c.serialize(report)).not.toContain(SENTINEL);
    },
  );
  it.each(["api", "api:prod-api-00001", "migration"])(
    "compares configured reference against actual Prod image for %s",
    async (id) => {
      const f = fixture(shared);
      const op = id.includes(":")
        ? {
            url: `https://run.googleapis.com/v2/projects/${c.TARGET.project}/locations/${c.TARGET.region}/services/prod-api/revisions/prod-api-00001`,
          }
        : f.plan.operations.find((o: any) => o.id === id);
      const body = f.responses.get(new URL(op.url).pathname).body;
      const template =
        id === "migration"
          ? body.template.template
          : id.includes(":")
            ? body
            : body.template;
      template.containers[0].image = `us-central1-docker.pkg.dev/${c.TARGET.project}/drts/api@sha256:${"c".repeat(64)}`;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(report.records.find((r: any) => r.id === id).status).toBe(
        "blocked",
      );
      expect(report.collection).toBe("incomplete");
      expect(() => c.serialize(report)).not.toThrow();
    },
  );
  it("keeps observed mock provider and absent storage/public-entry configuration unverified", async () => {
    const f = fixture({
      ...shared,
      PROD_MAP_PROVIDER_BACKEND: "mock",
      PROD_DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "",
      PROD_REMITTANCE_PROOF_STORAGE_PROVIDER: "",
      PROD_PUBLIC_ENTRY_CONFIG_JSON: "",
    });
    const report = await c.collect(f.env, SHA, f.transport);
    for (const id of [
      "map-provider",
      "DOCUMENT_ARTIFACT",
      "REMITTANCE_PROOF",
      "public-entry-config",
    ])
      expect(report.records.find((r: any) => r.id === id)?.code).toBe(
        "CONFIG_UNVERIFIED",
      );
    expect(f.env.PROD_MAP_PROVIDER_BACKEND).toBe("mock");
    expect(report.collection).toBe("incomplete");
  });
});

describe("safe real main guard diagnostic", () => {
  it.each(["same-project", "shared"])(
    "runs actual main %s collection with bounded external GET fixtures",
    async (mode) => {
      const f = fixture(mode === "shared" ? shared : {});
      const run = await invoke(
        { ...f.env, PROD_INVENTORY_ACCESS_TOKEN: SENTINEL },
        { args: ["collect"], transport: f.transport },
      );
      const report = JSON.parse(run.artifacts.get("metadata")!);
      expect(run.status).toBe(mode === "shared" ? 1 : 0);
      expect(report.collection).toBe(
        mode === "shared" ? "incomplete" : "complete",
      );
      expect(report.requests).toBe(mode === "shared" ? 62 : 64);
      expect(
        f.calls.every(
          (d: any) => d.method === "GET" && d.url.includes(c.TARGET.project),
        ),
      ).toBe(true);
      expect(run.artifacts.get("metadata")).not.toContain(SENTINEL);
    },
  );
  it("persists filtered success before authentication with no Google requests", async () => {
    const f = fixture(shared);
    const run = await invoke({
      ...f.env,
      PROD_INVENTORY_ACCESS_TOKEN: SENTINEL,
    });
    expect(run.status).toBe(0);
    const saved = run.artifacts.get("guard-diagnostic")!;
    expect(JSON.parse(saved)).toMatchObject({
      phase: "pre-auth",
      result: "passed",
      code: "GUARD_PASSED",
      authAttempts: 0,
      googleRequests: 0,
    });
    expect(run.transport).not.toHaveBeenCalled();
    expect(run.logs).toHaveLength(0);
    expect(saved).not.toContain(SENTINEL);
    expect(saved).not.toContain(f.env.PROD_DEPLOYER_IDENTITY);
  });
  const cases: [string, string, string][] = [
    ["DEFINITION_SHA", SENTINEL, "DEFINITION_SHA_MISMATCH"],
    ["GITHUB_SHA", SENTINEL, "DEFINITION_SHA_MISMATCH"],
    ["EXPECTED_PRODUCT_SHA", SENTINEL, "PRODUCT_SHA_REQUIRED"],
    ["GITHUB_REF", "refs/heads/dev", "SOURCE_REF_REJECTED"],
    ["GITHUB_EVENT_NAME", SENTINEL, "UNPROTECTED_DISPATCH"],
    ["PROD_GCP_PROJECT_ID", SENTINEL, "TARGET_MISMATCH"],
    ["PROD_GCP_REGION", SENTINEL, "TARGET_MISMATCH"],
    ["PROD_GCP_RUNTIME_SERVICE_ACCOUNT", SENTINEL, "TARGET_MISMATCH"],
    ["PROD_GCP_CLOUDSQL_INSTANCE", SENTINEL, "TARGET_MISMATCH"],
    ["GITHUB_REPOSITORY", SENTINEL, "RUN_IDENTITY_REJECTED"],
    ["GITHUB_RUN_ID", SENTINEL, "RUN_IDENTITY_REJECTED"],
    ["PROD_DEPLOYER_IDENTITY", SENTINEL, "PROD_IDENTITY_REQUIRED"],
    ["PROD_DEPLOYER_IDENTITY", c.TARGET.runtime, "PROD_IDENTITY_REQUIRED"],
    [
      "PROD_DEPLOYER_IDENTITY",
      "dev@drts-dev-devcc-20260825.iam.gserviceaccount.com",
      "PROD_IDENTITY_REQUIRED",
    ],
    ["PROD_GCP_API_SERVICE", "partner-booking", "RETIRED_SURFACE_REJECTED"],
    ["PROD_GCP_API_SERVICE", "prod-platform-admin-web", "DUPLICATE_SERVICE"],
    ["PROD_PUBLIC_ENTRY_CONFIG_JSON", SENTINEL, "CONFIG_REJECTED"],
  ];
  it.each(cases)("filters %s failure to %s/%s", async (key, value, code) => {
    const f = fixture(shared);
    const run = await invoke({
      ...f.env,
      [key]: value,
      PROD_INVENTORY_ACCESS_TOKEN: SENTINEL,
    });
    const saved = run.artifacts.get("guard-diagnostic")!;
    expect(run.status).toBe(1);
    expect(JSON.parse(saved)).toMatchObject({
      phase: "pre-auth",
      result: "blocked",
      code,
      authAttempts: 0,
      googleRequests: 0,
    });
    expect(saved + run.logs.join("\n")).not.toContain(SENTINEL);
    expect(saved).not.toContain(f.env.PROD_DEPLOYER_IDENTITY);
    expect(run.transport).not.toHaveBeenCalled();
    expect(run.artifacts.has("metadata")).toBe(false);
  });
  it.each(["mismatch", "missing", "ancestry"])(
    "filters source %s failures without git stdout/stderr",
    async (mode) => {
      const run = await invoke(fixture(shared).env, {
        git: (args: string[]) => {
          if (args[1] === "HEAD") return SHA;
          if (
            mode === "missing" ||
            (mode === "ancestry" && args[0] === "merge-base")
          )
            throw Object.assign(new Error(SENTINEL), {
              stderr: SENTINEL,
              stdout: SENTINEL,
            });
          return mode === "mismatch" ? "b".repeat(40) : SHA;
        },
      });
      expect(JSON.parse(run.artifacts.get("guard-diagnostic")!).code).toBe(
        "SOURCE_PROVENANCE_REJECTED",
      );
      expect(
        [...run.artifacts.values()].join("") + run.logs.join(""),
      ).not.toContain(SENTINEL);
      expect(run.transport).not.toHaveBeenCalled();
    },
  );
  it("uses a fixed unknown code for unexpected exceptions and hostile metadata", async () => {
    const env = Object.fromEntries(
      Object.keys(fixture().env).map((key) => [key, SENTINEL]),
    );
    const run = await invoke(env, {
      git: () => {
        throw Object.assign(new Error(SENTINEL), {
          code: SENTINEL,
          stack: SENTINEL,
        });
      },
    });
    const saved = run.artifacts.get("guard-diagnostic")!;
    const report = JSON.parse(saved);
    expect(report.code).toBe("UNKNOWN_GUARD_FAILURE");
    expect(
      Object.values(report.identity).every((v) => v === "unverified"),
    ).toBe(true);
    expect(saved + run.logs.join("")).not.toContain(SENTINEL);
    for (const unsafe of [
      { ...report, stack: SENTINEL },
      { ...report, code: SENTINEL },
      { ...report, authAttempts: 1 },
      { ...report, googleRequests: 1 },
      { ...report, result: "passed" },
      { ...report, identity: { ...report.identity, ref: SENTINEL } },
    ])
      expect(() => c.serializeDiagnostic(unsafe)).toThrow();
  });
  it("does not assert zero auth for failed collect validation", async () => {
    const run = await invoke(
      { ...fixture().env, PROD_DEPLOYER_IDENTITY: SENTINEL },
      { args: ["collect"] },
    );
    expect(JSON.parse(run.artifacts.get("guard-diagnostic")!)).toMatchObject({
      phase: "collect-validation",
      authAttempts: "unverified",
      googleRequests: 0,
    });
    expect(run.status).toBe(1);
  });
  it("never treats a thrown success code as a passed guard", async () => {
    const run = await invoke(fixture().env, {
      git: () => {
        throw Object.assign(new Error(SENTINEL), { code: "GUARD_PASSED" });
      },
    });
    expect(JSON.parse(run.artifacts.get("guard-diagnostic")!)).toMatchObject({
      result: "blocked",
      code: "UNKNOWN_GUARD_FAILURE",
    });
    expect(run.status).toBe(1);
    expect(run.transport).not.toHaveBeenCalled();
  });
  it("retains AUTH_REQUIRED and shared blocked evidence without a fallback identity", async () => {
    const f = fixture(shared);
    const run = await invoke(
      {
        ...f.env,
        GOOGLE_APPLICATION_CREDENTIALS: SENTINEL,
        DEV_WIF_SERVICE_ACCOUNT: SENTINEL,
      },
      { args: ["collect"] },
    );
    const report = JSON.parse(run.artifacts.get("metadata")!);
    expect(run.status).toBe(1);
    expect(report.collection).toBe("incomplete");
    expect(report.requests).toBe(0);
    expect(report.records.map((r: any) => r.code)).toEqual([
      "SHARED_REGISTRY_NOT_AUTHORIZED",
      "SHARED_REGISTRY_NOT_AUTHORIZED",
      "AUTH_REQUIRED",
    ]);
    expect(run.transport).not.toHaveBeenCalled();
    expect(run.artifacts.get("metadata")).not.toContain(SENTINEL);
  });
  it("uses actual main collection and preserves partial metadata after transport failure", async () => {
    const f = fixture(shared);
    const run = await invoke(
      { ...f.env, PROD_INVENTORY_ACCESS_TOKEN: SENTINEL },
      {
        args: ["collect"],
        transport: (d: any) => {
          if (d.url.includes("sqladmin.googleapis.com"))
            throw Object.assign(new Error(SENTINEL), { code: SENTINEL });
          return f.transport(d);
        },
      },
    );
    const saved = run.artifacts.get("metadata")!;
    expect(run.status).toBe(1);
    expect(
      JSON.parse(saved).records.find((r: any) => r.id === "cloudsql").code,
    ).toBe("REQUEST_FAILED");
    expect(saved + run.logs.join("")).not.toContain(SENTINEL);
  });
});

describe("spawned actual CLI diagnostics", () => {
  it.each(["pass", "identity", "source", "unknown", "rail"])(
    "writes only allowlisted diagnostic for %s without auth",
    (mode) => {
      const parent = resolve(".local/prod-inventory-continuation");
      mkdirSync(parent, { recursive: true });
      const cwd = mkdtempSync(`${parent}/cli-`);
      try {
        writeFileSync(
          `${cwd}/git`,
          `#!${process.execPath}\nif (process.env.TEST_GIT_ERROR === 'unknown' || (process.env.TEST_GIT_ERROR === 'source' && process.argv[3] !== 'HEAD')) { console.error(process.env.TEST_SENTINEL); process.exit(1); } console.log(process.env.TEST_GIT_SHA);\n`,
          { mode: 0o700 },
        );
        const f = fixture(shared);
        let cliPath = collectorPath;
        if (mode === "rail") {
          cpSync(
            resolve("operations/verification/production-release-rail"),
            `${cwd}/production-release-rail`,
            { recursive: true },
          );
          mkdirSync(`${cwd}/production-readonly-inventory`);
          cpSync(
            collectorPath,
            `${cwd}/production-readonly-inventory/collector.cjs`,
          );
          cliPath = `${cwd}/production-readonly-inventory/collector.cjs`;
          const rail = `${cwd}/production-release-rail/rail.cjs`;
          writeFileSync(
            rail,
            readFileSync(rail, "utf8") + "\n// changed lineage\n",
          );
        }
        const result = spawnSync(process.execPath, [cliPath, "guard"], {
          cwd,
          encoding: "utf8",
          timeout: 5000,
          env: {
            ...process.env,
            ...f.env,
            PROD_DEPLOYER_IDENTITY:
              mode === "identity" ? SENTINEL : f.env.PROD_DEPLOYER_IDENTITY,
            TEST_GIT_ERROR: mode,
            TEST_GIT_SHA: SHA,
            TEST_SENTINEL: SENTINEL,
            PROD_INVENTORY_ACCESS_TOKEN: SENTINEL,
            PATH: `${cwd}:${process.env.PATH}`,
          },
        });
        expect(result.status).toBe(mode === "pass" ? 0 : 1);
        const file = `${cwd}/.artifacts/production-readonly-inventory/guard-diagnostic.json`;
        expect(
          existsSync(file),
          "failed guard must persist diagnostic evidence",
        ).toBe(true);
        const saved = readFileSync(file, "utf8");
        const report = JSON.parse(saved);
        expect(report.code).toBe(
          {
            pass: "GUARD_PASSED",
            identity: "PROD_IDENTITY_REQUIRED",
            source: "SOURCE_PROVENANCE_REJECTED",
            unknown: "UNKNOWN_GUARD_FAILURE",
            rail: "RAIL_LINEAGE_CHANGED",
          }[mode],
        );
        expect(report).toMatchObject({
          phase: "pre-auth",
          authAttempts: 0,
          googleRequests: 0,
        });
        expect(saved + result.stdout + result.stderr).not.toContain(SENTINEL);
        expect(saved).not.toContain(f.env.PROD_DEPLOYER_IDENTITY);
        expect(statSync(file).mode & 0o777).toBe(0o600);
      } finally {
        rmSync(cwd, { recursive: true, force: true });
      }
    },
  );
});
