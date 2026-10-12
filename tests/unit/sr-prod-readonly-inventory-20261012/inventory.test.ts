import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
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
      report.records.find((r: any) => r.id === "api-policy").data
        .unconditionalDeployerInvoker,
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
      expect(spy.mock.calls[0]?.[1]?.redirect).toBe("error");
      await expect(
        c.hostedTransport({ ...descriptor, method: "POST" }, "MASKED_TOKEN"),
      ).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
describe("official Google HTTP method boundary", () => {
  it("never issues a GET for POST-only service-account getIamPolicy", () => {
    const f = fixture();
    // iam discovery v1 revision 20261002 explicitly declares POST for this
    // method; Cloud Run v2 revision 20261002 declares GET on services policies.
    expect(
      f.plan.operations.some(
        (op: any) =>
          new URL(op.url).hostname === "iam.googleapis.com" &&
          new URL(op.url).pathname.endsWith(":getIamPolicy"),
      ),
    ).toBe(false);
    expect(
      f.plan.operations.filter((op: any) => op.kind === "policy"),
    ).toHaveLength(10);
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
    const diagnostic = steps.find((s: any) =>
      s.with?.path?.endsWith("guard-diagnostic.json"),
    );
    expect(guardIndex).toBeLessThan(steps.indexOf(diagnostic));
    expect(steps.indexOf(diagnostic)).toBeLessThan(steps.indexOf(auth));
    expect(diagnostic.if).toBe(
      "always() && (steps.guard.outcome == 'success' || steps.guard.outcome == 'failure')",
    );
    expect(diagnostic.with["if-no-files-found"]).toBe("error");
    expect(auth.if).toBe("success() && steps.guard.outcome == 'success'");
    const collection = steps.find((s: any) =>
      s.run?.endsWith("collector.cjs collect"),
    );
    expect(collection.if).toBe("always() && steps.guard.outcome == 'success'");
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

describe("bounded failure cases", () => {
  it("rejects fallback dev/user identity even if ambient credentials exist", async () => {
    const f = fixture();
    f.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/ambient.json";
    f.env.DEV_WIF_SERVICE_ACCOUNT = "dev@other.iam.gserviceaccount.com";
    delete f.env.PROD_DEPLOYER_IDENTITY;
    await expect(c.collect(f.env, SHA, f.transport)).rejects.toThrow(
      "PROD_IDENTITY_REQUIRED",
    );
    expect(f.calls).toHaveLength(0);
  });
  it("bounds pagination at five distinct pages and serializes 500 selected version items", async () => {
    const f = fixture(),
      op = f.plan.operations.find((o: any) => o.kind === "versions"),
      path = new URL(op.url).pathname;
    const report = await c.collect(f.env, SHA, async (d: any) => {
      if (new URL(d.url).pathname !== path) return f.transport(d);
      const page = Number(new URL(d.url).searchParams.get("pageToken") || 1);
      return {
        status: 200,
        body: {
          versions: Array.from({ length: 100 }, (_, i) => ({
            name: `projects/${c.TARGET.project}/secrets/${op.id}/versions/${(page - 1) * 100 + i + 1}`,
            state: "ENABLED",
          })),
          ...(page < 5 ? { nextPageToken: String(page + 1) } : {}),
        },
      };
    });
    expect(report.collection).toBe("complete");
    expect(
      report.records.find((r: any) => r.id === op.id).data.items,
    ).toHaveLength(500);
    expect(() => c.serialize(report)).not.toThrow();
  });
  it("stops at the request budget and preserves a serializable incomplete report", async () => {
    const f = fixture();
    f.env.PROD_REMITTANCE_PROOF_STORAGE_PROVIDER = "s3";
    for (const key of [...c.OPTIONAL_SECRETS, ...c.ARTIFACT_SECRETS])
      f.env[`PROD_${key}_SECRET`] = `selected-${key.toLowerCase()}`;
    const report = await c.collect(f.env, SHA, async (d: any) => {
      const u = new URL(d.url);
      if (u.pathname.endsWith("/versions")) {
        const page = Number(u.searchParams.get("pageToken") || 1),
          name = u.pathname.slice(4);
        return {
          status: 200,
          body: {
            versions: [{ name: `${name}/1`, state: "ENABLED" }],
            ...(page < 5 ? { nextPageToken: String(page + 1) } : {}),
          },
        };
      }
      if (u.pathname.includes("/revisions/")) {
        const service = f.plan.services.find((v: any) =>
          u.pathname.includes(`/services/${v.name}/`),
        );
        return {
          status: 200,
          body: {
            name: u.pathname.slice(4),
            containers: [
              {
                image: `${f.plan.registry}/${service.id}@sha256:${"c".repeat(64)}`,
              },
            ],
            serviceAccount: c.TARGET.runtime,
          },
        };
      }
      const response = await f.transport(d);
      if (
        u.pathname.includes("/services/") &&
        !u.pathname.endsWith(":getIamPolicy")
      ) {
        const name = response.body.name;
        response.body.trafficStatuses = Array.from({ length: 10 }, (_, i) => ({
          revision:
            i === 0
              ? response.body.latestReadyRevision
              : `${name}/revisions/prod-rev-${i}`,
          percent: 10,
        }));
      }
      return response;
    });
    expect(report.collection).toBe("incomplete");
    expect(report.requests).toBe(c.LIMITS.requests);
    expect(
      report.records.some((r: any) => r.code === "REQUEST_BOUND_EXCEEDED"),
    ).toBe(true);
    expect(() => c.serialize(report)).not.toThrow();
  });
  it("enforces the collection deadline and keeps earlier filtered observations", async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      let first = true;
      const report = await c.collect(f.env, SHA, async (d: any) => {
        const result = await f.transport(d);
        if (first) {
          first = false;
          vi.setSystemTime(Date.now() + c.LIMITS.collectionMs);
        }
        return result;
      });
      expect(report.requests).toBe(1);
      expect(report.collection).toBe("incomplete");
      expect(
        report.records.some((r: any) => r.code === "COLLECTION_TIMEOUT"),
      ).toBe(true);
      expect(() => c.serialize(report)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects an arbitrary GET at the hosted boundary and caps response bytes", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: (async function* () {
        yield Buffer.alloc(c.LIMITS.bytes + 1);
      })(),
    });
    vi.stubGlobal("fetch", spy);
    try {
      await expect(
        c.hostedTransport(
          { method: "GET", url: "https://provider.example.invalid" },
          "MASKED",
        ),
      ).rejects.toThrow();
      expect(spy).not.toHaveBeenCalled();
      const f = fixture();
      await expect(
        c.hostedTransport(
          c.requestDescriptor(f.plan, f.plan.operations[0]),
          "MASKED",
        ),
      ).rejects.toThrow("RESPONSE_BOUND_EXCEEDED");
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("marks a foreign runtime, secret version owner or missing IAP identity unverified", async () => {
    for (const kind of ["service", "versions", "backends"]) {
      const f = fixture(),
        op = f.plan.operations.find((o: any) => o.kind === kind),
        body = f.responses.get(new URL(op.url).pathname).body;
      if (kind === "service")
        body.template.serviceAccount = "dev@other.iam.gserviceaccount.com";
      if (kind === "versions")
        body.versions[0].name =
          "projects/" + c.TARGET.project + "/secrets/foreign/versions/1";
      if (kind === "backends") delete body.items[0].iap.oauth2ClientId;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(report.collection).toBe("incomplete");
      expect(() => c.serialize(report)).not.toThrow();
    }
  });
});

describe("verified Google discovery contract snapshot", () => {
  it("uses GET paths and selectors checked against the official selected API versions", async () => {
    const contracts = JSON.parse(
      readFileSync(
        "operations/verification/production-readonly-inventory/api-contracts.json",
        "utf8",
      ),
    ).methods;
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const f = fixture();
    await c.collect(f.env, SHA, f.transport);
    for (const request of f.calls) {
      const u = new URL(request.url),
        url = u.origin + u.pathname;
      const matches = contracts.filter(
        (m: any) =>
          new RegExp(
            "^" +
              (m.baseUrl + m.path)
                .split(/(\{[^}]+\})/)
                .map((p: string) =>
                  p.startsWith("{")
                    ? p.startsWith("{+")
                      ? "[^?]+"
                      : "[^/?]+"
                    : escape(p),
                )
                .join("") +
              "$",
          ).test(url) && m.verifiedSelector === u.searchParams.get("fields"),
      );
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every((m: any) => m.httpMethod === request.method)).toBe(
        true,
      );
    }
  });
});

describe("secret version canonical project identity", () => {
  it("rejects foreign numeric projects and accepts only the observed project number", async () => {
    for (const project of ["123456789", "999999999"]) {
      const f = fixture(),
        op = f.plan.operations.find((o: any) => o.kind === "versions");
      const response = f.responses.get(new URL(op.url).pathname);
      response.body.versions[0].name = `projects/${project}/secrets/${op.id}/versions/1`;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(report.collection).toBe(
        project === "123456789" ? "complete" : "incomplete",
      );
    }
  });
});

describe("actual CLI failure logging", () => {
  it("withholds credentials in guard failure before any hosted authentication", () => {
    const f = fixture();
    const result = spawnSync(
      process.execPath,
      [
        "operations/verification/production-readonly-inventory/collector.cjs",
        "collect",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          ...f.env,
          DEFINITION_SHA: "wrong",
          PROD_INVENTORY_ACCESS_TOKEN: SENTINEL,
        },
        timeout: 5000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(SENTINEL);
    expect(result.stderr).toContain("credential details withheld");
  });
});
