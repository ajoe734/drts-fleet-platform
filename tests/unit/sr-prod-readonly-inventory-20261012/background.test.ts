import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const c = require(
  process.env.INVENTORY_COLLECTOR_UNDER_TEST ||
    "../../../operations/verification/production-readonly-inventory/collector.cjs",
);
const { fixture, SHA, SENTINEL } = require("./fixture.cjs");
const shared = {
  PROD_ARTIFACT_REGISTRY:
    "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts",
  PROD_ARTIFACT_PROJECT_ID: "drts-dev-devcc-20260825",
  PROD_ARTIFACT_REGION: "us-central1",
  PROD_ARTIFACT_REPOSITORY: "drts",
};
function background(overrides = {}) {
  const f = fixture(overrides, c);
  const serviceOp = f.plan.operations.find(
    (op: any) => op.kind === "service" && op.id === "api",
  );
  const service = f.responses.get(new URL(serviceOp.url).pathname).body;
  const revision = f.responses.get(`/v2/${service.latestReadyRevision}`).body;
  service.scaling = {
    minInstanceCount: 0,
    maxInstanceCount: 2147483647,
    manualInstanceCount: 2,
    scalingMode: "MANUAL",
  };
  service.template.scaling = { minInstanceCount: 1, maxInstanceCount: 4 };
  service.template.containers[0].resources = { cpuIdle: true };
  revision.scaling = { minInstanceCount: 0, maxInstanceCount: 8 };
  revision.containers[0].resources = { cpuIdle: false };
  return { ...f, serviceOp, service, revision };
}
function observed(report: any, kind: string) {
  return report.records.find(
    (r: any) => r.kind === kind && r.id.startsWith("api"),
  );
}
function saved(report: any) {
  return JSON.parse(c.serialize(report));
}
const countPaths = [
  ["service", "scaling", "minInstanceCount"],
  ["service", "scaling", "maxInstanceCount"],
  ["service", "scaling", "manualInstanceCount"],
  ["service", "template", "scaling", "minInstanceCount"],
  ["service", "template", "scaling", "maxInstanceCount"],
  ["revision", "scaling", "minInstanceCount"],
  ["revision", "scaling", "maxInstanceCount"],
];
function setPath(root: any, path: string[], value: any) {
  const parent = path.slice(0, -1).reduce((obj, key) => obj[key], root);
  parent[path.at(-1)!] = value;
}
afterEach(() => vi.unstubAllGlobals());

describe("background observations through actual GET, collection and serialization", () => {
  it("selects permitted background fields on existing service/revision GETs only", async () => {
    const f = fixture({}, c);
    await c.collect(f.env, SHA, f.transport);
    for (const d of f.calls) {
      const fields = new URL(d.url).searchParams.get("fields")!;
      expect(d.method).toBe("GET");
      expect(fields).not.toMatch(
        /env|annotations|labels|limits|startupCpuBoost/,
      );
      if (d.url.includes("/services/") && !d.url.includes(":getIamPolicy")) {
        expect(fields).toContain("containers(image,resources(cpuIdle))");
        expect(fields).toContain("scaling(minInstanceCount,maxInstanceCount)");
        if (!d.url.includes("/revisions/"))
          expect(fields).toContain(
            "scaling(minInstanceCount,maxInstanceCount,manualInstanceCount,scalingMode)",
          );
        else expect(fields).not.toMatch(/manualInstanceCount|scalingMode/);
      } else expect(fields).not.toMatch(/cpuIdle|InstanceCount|scalingMode/);
    }
    expect(f.calls).toHaveLength(64);
  });
  it("retains typed service and actual revision observations through hosted transport", async () => {
    const f = background();
    const fetch = vi.fn(async (url: string, options: any) => {
      expect(options.method).toBe("GET");
      expect(options.redirect).toBe("error");
      expect(options.headers.Authorization).toBe(`Bearer ${SENTINEL}`);
      const response = f.responses.get(new URL(url).pathname);
      return new Response(JSON.stringify(response.body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetch);
    const report = await c.collect(f.env, SHA, (d: any) =>
      c.hostedTransport(d, SENTINEL),
    );
    const output = saved(report);
    expect(observed(output, "service").data).toEqual(f.service);
    expect(observed(output, "revision").data).toEqual(f.revision);
    expect(report.collection).toBe("complete");
    expect(report.runtimeProvenance).toBe("unverified");
    expect(report.effectiveIamPermissions).toBe("unverified");
    expect(c.serialize(report)).not.toContain(SENTINEL);
    expect(fetch).toHaveBeenCalledTimes(64);
  });
  it("serializes permitted observations independently of transport validation", async () => {
    const f = fixture({}, c);
    const report = await c.collect(f.env, SHA, f.transport);
    const typed = background();
    observed(report, "service").data = typed.service;
    observed(report, "revision").data = typed.revision;
    expect(observed(saved(report), "service").data).toEqual(typed.service);
    expect(observed(saved(report), "revision").data).toEqual(typed.revision);
  });
  it.each(["SCALING_MODE_UNSPECIFIED", "AUTOMATIC", "MANUAL"])(
    "preserves explicit mode %s, zero counts and both CPU booleans",
    async (mode) => {
      const f = background();
      f.service.scaling.scalingMode = mode;
      for (const path of countPaths) setPath(f, path, 0);
      const report = saved(await c.collect(f.env, SHA, f.transport));
      expect(observed(report, "service").data.scaling).toEqual({
        minInstanceCount: 0,
        maxInstanceCount: 0,
        manualInstanceCount: 0,
        scalingMode: mode,
      });
      expect(
        observed(report, "service").data.template.containers[0].resources,
      ).toEqual({ cpuIdle: true });
      expect(observed(report, "revision").data.containers[0].resources).toEqual(
        { cpuIdle: false },
      );
    },
  );
  it.each([false, true])(
    "retains explicit cpuIdle=%s at both locations",
    async (value) => {
      const f = background();
      f.service.template.containers[0].resources.cpuIdle = value;
      f.revision.containers[0].resources.cpuIdle = value;
      const output = saved(await c.collect(f.env, SHA, f.transport));
      expect(
        observed(output, "service").data.template.containers[0].resources
          .cpuIdle,
      ).toBe(value);
      expect(
        observed(output, "revision").data.containers[0].resources.cpuIdle,
      ).toBe(value);
    },
  );
  it.each(["missing", "empty", "partial"])(
    "keeps %s observations unknown without inserting defaults",
    async (mode) => {
      const f = fixture({}, c);
      const op = f.plan.operations.find(
        (o: any) => o.kind === "service" && o.id === "api",
      );
      const service = f.responses.get(new URL(op.url).pathname).body;
      const revision = f.responses.get(
        `/v2/${service.latestReadyRevision}`,
      ).body;
      if (mode !== "missing") {
        service.scaling = mode === "partial" ? { minInstanceCount: 0 } : {};
        service.template.scaling = {};
        service.template.containers[0].resources = {};
        revision.scaling = {};
        revision.containers[0].resources = {};
      }
      const output = saved(await c.collect(f.env, SHA, f.transport));
      expect(observed(output, "service").data).toEqual(service);
      expect(observed(output, "revision").data).toEqual(revision);
      const actual = observed(output, "service").data;
      expect(actual.scaling?.maxInstanceCount).toBeUndefined();
      expect(actual.scaling?.manualInstanceCount).toBeUndefined();
      expect(actual.scaling?.scalingMode).toBeUndefined();
      expect(actual.template.containers[0].resources?.cpuIdle).toBeUndefined();
      expect(
        observed(output, "revision").data.scaling?.maxInstanceCount,
      ).toBeUndefined();
      // Complete means the existing collection succeeded, not known background behavior.
      expect(output.collection).toBe("complete");
      expect(output.runtimeProvenance).toBe("unverified");
    },
  );
  it("keeps template, ready, created and serving revisions distinct in partial shared inventory", async () => {
    const f = background(shared);
    const ready = f.service.latestReadyRevision;
    const created = ready.replace(/00001$/, "00002");
    const serving = ready.replace(/00001$/, "00003");
    f.service.latestCreatedRevision = created;
    f.service.trafficStatuses = [{ revision: serving, percent: 100 }];
    for (const [name, cpuIdle, count, digest] of [
      [created, true, 2, "d"],
      [serving, false, 3, "e"],
    ] as const) {
      const data = structuredClone(f.revision);
      data.name = name;
      data.containers[0].image = `${f.plan.registry}/api@sha256:${digest.repeat(64)}`;
      data.containers[0].resources.cpuIdle = cpuIdle;
      data.scaling.minInstanceCount = count;
      f.responses.set(`/v2/${name}`, { status: 200, body: data });
    }
    const output = saved(await c.collect(f.env, SHA, f.transport));
    const revisions = output.records.filter(
      (r: any) => r.kind === "revision" && r.id.startsWith("api:"),
    );
    expect(revisions).toHaveLength(3);
    for (const name of [ready, created, serving])
      expect(revisions.find((r: any) => r.data.name === name).data).toEqual(
        f.responses.get(`/v2/${name}`).body,
      );
    expect(observed(output, "service").data).toEqual(f.service);
    expect(output.collection).toBe("incomplete");
    expect(output.runtimeProvenance).toBe("unverified");
    expect(f.calls).toHaveLength(64);
    expect(
      f.calls.every(
        (d: any) =>
          d.method === "GET" &&
          d.url.includes(c.TARGET.project) &&
          !d.url.includes("drts-dev-devcc-20260825"),
      ),
    ).toBe(true);
    for (const id of ["artifact-repository", "artifact-images"])
      expect(output.records.find((r: any) => r.id === id).code).toBe(
        "SHARED_REGISTRY_NOT_AUTHORIZED",
      );
  });
});

describe("background fields reject malformed and sensitive metadata", () => {
  const invalidCounts = [
    null,
    "0",
    -1,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    2147483648,
    Number.MAX_SAFE_INTEGER + 1,
  ];
  it.each(
    countPaths.flatMap((path) =>
      invalidCounts.map((value) => ({ path, value })),
    ),
  )(
    "rejects count $path=$value at collection and independent serializer",
    async ({ path, value }) => {
      const f = background();
      const baseline = await c.collect(f.env, SHA, f.transport);
      setPath(
        {
          service: observed(baseline, "service").data,
          revision: observed(baseline, "revision").data,
        },
        path,
        value,
      );
      expect(() => c.serialize(baseline)).toThrow("MALFORMED_METADATA");
      setPath(f, path, value);
      const output = saved(await c.collect(f.env, SHA, f.transport));
      expect(observed(output, path[0])).toMatchObject({
        status: "unverified",
        code: "MALFORMED_METADATA",
      });
      expect(output.collection).toBe("incomplete");
      expect(c.serialize(output)).not.toContain(SENTINEL);
    },
  );
  const invalidFields = [
    ...[null, "false", 0, 1, SENTINEL].flatMap((value) => [
      {
        path: [
          "service",
          "template",
          "containers",
          "0",
          "resources",
          "cpuIdle",
        ],
        value,
      },
      { path: ["revision", "containers", "0", "resources", "cpuIdle"], value },
    ]),
    ...[null, 0, "automatic", SENTINEL].map((value) => ({
      path: ["service", "scaling", "scalingMode"],
      value,
    })),
    ...[
      ["service", "scaling"],
      ["service", "template", "scaling"],
      ["service", "template", "containers", "0", "resources"],
      ["revision", "scaling"],
      ["revision", "containers", "0", "resources"],
    ].flatMap((path) => [null, [], SENTINEL].map((value) => ({ path, value }))),
  ];
  it.each(invalidFields)(
    "rejects typed field $path=$value at both boundaries",
    async ({ path, value }) => {
      const f = background();
      const baseline = await c.collect(f.env, SHA, f.transport);
      setPath(
        {
          service: observed(baseline, "service").data,
          revision: observed(baseline, "revision").data,
        },
        path,
        value,
      );
      expect(() => c.serialize(baseline)).toThrow("MALFORMED_METADATA");
      setPath(f, path, value);
      const output = saved(await c.collect(f.env, SHA, f.transport));
      expect(observed(output, path[0]).code).toBe("MALFORMED_METADATA");
      expect(c.serialize(output)).not.toContain(SENTINEL);
    },
  );
  it.each([
    ["service", "env"],
    ["service", "annotations"],
    ["service", "labels"],
    ["service", "scaling", "unknown"],
    ["service", "template", "scaling", "manualInstanceCount"],
    ["service", "template", "containers", "0", "env"],
    ["service", "template", "containers", "0", "resources", "limits"],
    ["revision", "containers", "0", "resources", "startupCpuBoost"],
    ["revision", "scaling", "scalingMode"],
    ["revision", "scaling", "cpuUtilization"],
    ["revision", "secret"],
  ])(
    "rejects unselected field %s at both boundaries and filters sentinels",
    async (...path) => {
      const f = background();
      const baseline = await c.collect(f.env, SHA, f.transport);
      setPath(
        {
          service: observed(baseline, "service").data,
          revision: observed(baseline, "revision").data,
        },
        path,
        SENTINEL,
      );
      expect(() => c.serialize(baseline)).toThrow("UNEXPECTED_FIELDS");
      setPath(f, path, SENTINEL);
      const output = saved(await c.collect(f.env, SHA, f.transport));
      expect(observed(output, path[0]).code).toBe("UNEXPECTED_FIELDS");
      expect(c.serialize(output)).not.toContain(SENTINEL);
    },
  );
  it.each([403, 404])(
    "preserves service observations with revision HTTP %s",
    async (status) => {
      const f = background();
      f.responses.set(`/v2/${f.revision.name}`, {
        status,
        body: { error: { message: SENTINEL } },
      });
      const output = saved(await c.collect(f.env, SHA, f.transport));
      expect(observed(output, "service").data).toEqual(f.service);
      expect(observed(output, "revision")).toMatchObject({
        status: status === 403 ? "blocked" : "unverified",
        code: status === 403 ? "PERMISSION_DENIED" : "MISSING",
      });
      expect(output.collection).toBe("incomplete");
      expect(
        output.records.filter(
          (r: any) => r.kind === "revision" && r.status === "observed",
        ),
      ).toHaveLength(9);
      expect(c.serialize(output)).not.toContain(SENTINEL);
    },
  );
});
