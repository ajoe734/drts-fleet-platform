import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const c = require("../../../operations/verification/production-readonly-inventory/collector.cjs");
const { fixture, SHA, PRODUCT, SENTINEL } = require("./fixture.cjs");
const yaml = require("yaml");
const workflow = yaml.parse(
  readFileSync(".github/workflows/production-readonly-inventory.yml", "utf8"),
);

describe("protected production inventory actual exported boundaries", () => {
  it("collects the complete original-rail inventory, revisions and actual LB join with no readiness inference", async () => {
    const f = fixture();
    const report = await c.collect(f.env, SHA, f.transport);
    const saved = c.serialize(report);
    expect(report.collection).toBe("complete");
    expect(report.identity.definitionSha).toBe(SHA);
    expect(report.identity.expectedProductSha).toBe(PRODUCT);
    expect(report.runtimeProvenance).toBe("unverified");
    expect(report.effectiveIamPermissions).toBe("unverified");
    expect(
      report.records.filter((r: any) => r.kind === "service"),
    ).toHaveLength(10);
    expect(
      report.records.filter((r: any) => r.kind === "revision"),
    ).toHaveLength(10);
    expect(report.records.filter((r: any) => r.kind === "iap")).toHaveLength(
      10,
    );
    expect(
      report.records.find((r: any) => r.id === "runtime-policy").data
        .unconditionalDeployerActAs,
    ).toBe(true);
    expect(saved).not.toContain(SENTINEL);
    expect(saved).not.toContain(f.env.PROD_DEPLOYER_IDENTITY);
    for (const call of f.calls) {
      expect(call.method).toBe("GET");
      const u = new URL(call.url);
      expect(u.searchParams.get("fields")).toBeTruthy();
      expect(u.searchParams.get("fields")).not.toMatch(
        /payload|oauth2ClientSecret|env\(|privateKey|\*/,
      );
      expect(u.pathname).not.toMatch(/:access|:execute|:setIamPolicy/);
    }
  });
  it.each([
    "PROD_GCP_PROJECT_ID",
    "PROD_GCP_REGION",
    "PROD_GCP_CLOUDSQL_INSTANCE",
    "PROD_GCP_RUNTIME_SERVICE_ACCOUNT",
    "DEFINITION_SHA",
    "GITHUB_SHA",
    "EXPECTED_PRODUCT_SHA",
    "GITHUB_EVENT_NAME",
    "INVENTORY_ENVIRONMENT",
    "GITHUB_REF",
    "GITHUB_REPOSITORY",
  ])("rejects wrong %s before any external request", async (key) => {
    const f = fixture();
    f.env[key] = "wrong";
    await expect(c.collect(f.env, SHA, f.transport)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  });
  it("rejects actual checkout mismatch and feature/tag refs", () => {
    const f = fixture();
    expect(() => c.guard(f.env, PRODUCT)).toThrow("DEFINITION_SHA_MISMATCH");
    for (const ref of [
      "refs/heads/dev",
      "refs/heads/main",
      "refs/heads/codex/example",
      "refs/tags/release/v2026.10.12.0",
    ])
      expect(() => c.guard({ ...f.env, GITHUB_REF: ref }, SHA)).toThrow(
        "SOURCE_REF_REJECTED",
      );
  });
  it("does not confuse equal source/product inputs with installed provenance", async () => {
    const f = fixture();
    f.env.EXPECTED_PRODUCT_SHA = SHA;
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.runtimeProvenance).toBe("unverified");
    expect(c.serialize(report)).not.toContain("installedProductSha");
  });
  it("checks exact release/publish companion commits and merged dev ancestry, not just ref spelling", () => {
    const identity = c.guard(fixture().env, SHA);
    const calls: any[] = [];
    c.releaseSourceGuard(identity, (args: string[]) => {
      calls.push(args);
      return SHA;
    });
    expect(calls).toHaveLength(4);
    expect(calls[3]).toEqual([
      "merge-base",
      "--is-ancestor",
      SHA,
      "refs/remotes/origin/dev",
    ]);
    expect(() => c.releaseSourceGuard(identity, () => PRODUCT)).toThrow(
      "SOURCE_PROVENANCE_REJECTED",
    );
    expect(() =>
      c.releaseSourceGuard(identity, (args: string[]) => {
        if (args[0] === "merge-base") throw Error("diverged");
        return SHA;
      }),
    ).toThrow();
  });
  it("rejects fake operations, arbitrary URL and selectors at actual request enforcement", () => {
    const f = fixture(),
      op = f.plan.operations[0];
    for (const url of [
      "https://secretmanager.googleapis.com/v1/projects/x/secrets/y/versions/1:access",
      "https://provider.example.invalid/pay",
      "https://run.googleapis.com/v2/projects/x:delete",
    ])
      expect(() => c.requestDescriptor(f.plan, { ...op, url })).toThrow(
        "OPERATION_REJECTED",
      );
    expect(() => c.requestDescriptor({ operations: [op] }, op)).toThrow(
      "OPERATION_REJECTED",
    );
    expect(Object.isFrozen(op)).toBe(true);
    expect(Object.isFrozen(c.schemas.backends.items[0].iap)).toBe(true);
    expect(() =>
      c.requestDescriptor(f.plan, { ...op, schemaKey: "payload.data" }),
    ).toThrow("OPERATION_REJECTED");
  });
  it.each([403, 404])(
    "keeps safe partial error metadata for HTTP %s",
    async (status) => {
      const f = fixture();
      f.responses.set(
        "/sql/v1beta4/projects/" + c.TARGET.project + "/instances/drts-prod-db",
        { status, body: { error: { message: SENTINEL } } },
      );
      const report = await c.collect(f.env, SHA, f.transport);
      expect(report.collection).toBe("incomplete");
      expect(report.records.find((r: any) => r.id === "cloudsql").code).toBe(
        status === 403 ? "PERMISSION_DENIED" : "MISSING",
      );
      expect(c.serialize(report)).not.toContain(SENTINEL);
      expect(
        report.records.some(
          (r: any) => r.kind === "service" && r.status === "observed",
        ),
      ).toBe(true);
    },
  );
  it("never stores error messages or unexpected sensitive fields at any nesting depth", async () => {
    for (const kind of [
      "project",
      "service",
      "versions",
      "backends",
      "policy",
    ]) {
      const f = fixture(),
        op = f.plan.operations.find((o: any) => o.kind === kind),
        path = new URL(op.url).pathname;
      const response = f.responses.get(path);
      response.body.payload = { data: SENTINEL };
      const report = await c.collect(f.env, SHA, f.transport);
      expect(report.collection).toBe("incomplete");
      expect(c.serialize(report)).not.toContain(SENTINEL);
    }
    const f = fixture(),
      op = f.plan.operations.find((o: any) => o.kind === "backends");
    f.responses.get(
      new URL(op.url).pathname,
    ).body.items[0].iap.oauth2ClientSecret = SENTINEL;
    const report = await c.collect(f.env, SHA, f.transport);
    expect(c.serialize(report)).not.toContain(SENTINEL);
    const failure = await c.collect(f.env, SHA, async () => {
      throw Error(SENTINEL);
    });
    expect(c.serialize(failure)).not.toContain(SENTINEL);
  });
  it("fails closed on missing observations and missing configured names rather than inventing resources", async () => {
    const f = fixture();
    delete f.env.PROD_GCP_API_SERVICE;
    delete f.env.PROD_MAP_PROVIDER_BACKEND;
    delete f.env.PROD_PUBLIC_ENTRY_CONFIG_JSON;
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.collection).toBe("incomplete");
    expect(report.records.find((r: any) => r.id === "api").code).toBe(
      "CONFIG_UNVERIFIED",
    );
    expect(
      f.calls.some((d: any) =>
        new URL(d.url).pathname.endsWith("/services/prod-api"),
      ),
    ).toBe(false);
    const g = fixture();
    g.responses.get(
      "/sql/v1beta4/projects/" + c.TARGET.project + "/instances/drts-prod-db",
    ).body = {};
    expect(
      (await c.collect(g.env, SHA, g.transport)).records.find(
        (r: any) => r.id === "cloudsql",
      ).code,
    ).toBe("INSUFFICIENT_OBSERVATION");
  });
  it("exhausts pagination and preserves filtered earlier pages on truncation without saving page tokens", async () => {
    const f = fixture(),
      op = f.plan.operations.find((o: any) => o.kind === "versions"),
      path = new URL(op.url).pathname;
    const report = await c.collect(f.env, SHA, async (d: any) => {
      if (new URL(d.url).pathname !== path) return f.transport(d);
      const token = new URL(d.url).searchParams.get("pageToken"),
        page = token ? Number(token.slice(1)) : 1;
      return {
        status: 200,
        body: {
          versions: [
            {
              name: `projects/${c.TARGET.project}/secrets/${op.id}/versions/${page}`,
              state: "ENABLED",
            },
          ],
          ...(page < 2 ? { nextPageToken: "p2" } : {}),
        },
      };
    });
    expect(report.collection).toBe("complete");
    expect(
      report.records.find((r: any) => r.id === op.id).data.items,
    ).toHaveLength(2);
    const truncated = await c.collect(f.env, SHA, async (d: any) =>
      new URL(d.url).pathname === path
        ? {
            status: 200,
            body: {
              versions: [
                {
                  name: `projects/${c.TARGET.project}/secrets/${op.id}/versions/1`,
                  state: "ENABLED",
                },
              ],
              nextPageToken: "SENSITIVE_PAGE_TOKEN",
            },
          }
        : f.transport(d),
    );
    expect(truncated.collection).toBe("incomplete");
    expect(truncated.records.find((r: any) => r.id === op.id).code).toBe(
      "PAGINATION_TRUNCATED",
    );
    expect(
      truncated.records.find((r: any) => r.id === op.id + ":partial").data.items
        .length,
    ).toBeGreaterThan(0);
    expect(c.serialize(truncated)).not.toContain("SENSITIVE_PAGE_TOKEN");
  });
  it("rejects serializer bypasses and readiness claims", async () => {
    const f = fixture(),
      report = await c.collect(f.env, SHA, f.transport);
    for (const changed of [
      { ...report, productionReady: true },
      { ...report, runtimeProvenance: "verified" },
      {
        ...report,
        records: [
          {
            id: "x",
            kind: "account",
            status: "observed",
            data: { privateKey: SENTINEL },
          },
        ],
      },
    ])
      expect(() => c.serialize(changed)).toThrow();
  });
  it("uses the real hosted GET transport, refuses redirects and mutation, and does not read error bodies", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => {
        throw Error(SENTINEL);
      },
    });
    vi.stubGlobal("fetch", spy);
    try {
      const f = fixture(),
        descriptor = c.requestDescriptor(f.plan, f.plan.operations[0]);
      expect(await c.hostedTransport(descriptor, "MASKED_TOKEN")).toEqual({
        status: 403,
      });
      expect(spy.mock.calls[0][1].redirect).toBe("error");
      await expect(
        c.hostedTransport({ ...descriptor, method: "POST" }, "MASKED_TOKEN"),
      ).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
describe("actual parsed workflow protection", () => {
  it("is manual-only with one protected minimal-permission production job and auth after guard", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(Object.keys(workflow.jobs)).toEqual(["inventory"]);
    const job = workflow.jobs.inventory;
    expect(job.environment).toBe("production");
    expect(job.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(job["timeout-minutes"]).toBe(15);
    const steps = job.steps,
      auth = steps.find((s: any) => s.id === "auth"),
      guardIndex = steps.findIndex((s: any) => s.id === "guard");
    expect(guardIndex).toBeLessThan(steps.indexOf(auth));
    expect(auth.with.workload_identity_provider).toBe(
      "${{ secrets.PROD_WIF_PROVIDER }}",
    );
    expect(auth.with.service_account).toBe(
      "${{ secrets.PROD_WIF_SERVICE_ACCOUNT }}",
    );
    expect(auth.with.create_credentials_file).toBe(false);
    expect(auth.with.export_environment_variables).toBe(false);
    expect(steps[0].with.ref).toBe("${{ github.sha }}");
    expect(steps[0].with["persist-credentials"]).toBe(false);
    expect(steps[0].with["fetch-depth"]).toBe(0);
    const raw = readFileSync(
      ".github/workflows/production-readonly-inventory.yml",
      "utf8",
    );
    expect(raw).not.toMatch(
      /DEV_WIF|STAGING_WIF|toJSON\(vars\)|deployments:|gcloud|docker|approvals|environment:\s*\$/,
    );
    expect(steps.at(-1).with.path).toBe(
      ".artifacts/production-readonly-inventory/metadata.json",
    );
    expect(steps.at(-1).if).toContain("always()");
  });
});
