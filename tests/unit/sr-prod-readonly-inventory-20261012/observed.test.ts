import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const c = require(
  process.env.INVENTORY_COLLECTOR_UNDER_TEST ||
    "../../../operations/verification/production-readonly-inventory/collector.cjs",
);
const { fixture, SHA, SENTINEL } = require("./fixture.cjs");
const NUMBER = "405416046689";
function ownedNumeric(overrides = {}) {
  const f = fixture(overrides, c);
  for (const [path, response] of f.responses) {
    if (path.startsWith("/v3/projects/"))
      response.body.name = `projects/${NUMBER}`;
    if (path.startsWith("/v2/") && !path.endsWith(":getIamPolicy"))
      response.body = JSON.parse(
        JSON.stringify(response.body).replaceAll(
          `projects/${c.TARGET.project}/`,
          `projects/${NUMBER}/`,
        ),
      );
  }
  return f;
}
function service(f: any) {
  const op = f.plan.operations.find((o: any) => o.id === "api");
  return f.responses.get(new URL(op.url).pathname).body;
}
function record(report: any, id = "api") {
  return report.records.find((r: any) => r.id === id);
}
describe("independently anchored observed Cloud Run names", () => {
  it("accepts anchored numeric service/job/revision names through actual collect and serializer", async () => {
    const f = ownedNumeric();
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.collection).toBe("complete");
    expect(report.requests).toBe(64);
    for (const r of report.records.filter((r: any) =>
      ["service", "job", "revision"].includes(r.kind),
    )) {
      expect(r.status).toBe("observed");
      expect(r.data.name).toContain(`projects/${NUMBER}/`);
      expect(r.resource).toContain(`projects/${c.TARGET.project}/`);
    }
    expect(c.serialize(report)).toContain(`projects/${NUMBER}/`);
    for (const d of f.calls) {
      expect(d.method).toBe("GET");
      expect(d.url).toContain(c.TARGET.project);
      expect(d.url).not.toContain(`projects/${NUMBER}/`);
    }
  });
  it("keeps literal-project positive complete", async () => {
    const f = fixture({}, c);
    expect((await c.collect(f.env, SHA, f.transport)).collection).toBe(
      "complete",
    );
  });
  it.each(["missing", "403", "404", "foreign", "unexpected", "name-missing"])(
    "never derives numeric ownership from service names when project anchor is %s",
    async (mode) => {
      const f = ownedNumeric();
      const project = f.responses.get(`/v3/projects/${c.TARGET.project}`);
      if (mode === "missing") delete project.body.state;
      if (mode === "name-missing") delete project.body.name;
      if (mode === "403" || mode === "404") project.status = Number(mode);
      if (mode === "foreign") project.body.projectId = "foreign-project";
      if (mode === "unexpected") project.body[SENTINEL] = SENTINEL;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(record(report).status).toBe("blocked");
      expect(record(report).diagnosis).toBe("RESOURCE_IDENTITY");
      expect(
        report.records.filter((r: any) => r.kind === "revision"),
      ).toHaveLength(0);
      expect(c.serialize(report)).not.toContain(SENTINEL);
    },
  );
  it.each([
    `projects/999999999/locations/us-central1/services/prod-api`,
    `projects/foreign/locations/us-central1/services/prod-api`,
    `projects/${NUMBER}/locations/europe-west1/services/prod-api`,
    `projects/${NUMBER}/locations/us-central1/services/other`,
    `projects/${NUMBER}/locations/us-central1/jobs/prod-api`,
    `projects/${NUMBER}/locations/us-central1/services/prod-api/../other`,
    `projects/${NUMBER}/locations/us-central1/services/prod-api%2fother`,
    `projects/${NUMBER}/locations/us-central1/services/${"a".repeat(64)}`,
    `projects/0${NUMBER}/locations/us-central1/services/prod-api`,
  ])("rejects unrelated or unsafe service name %s", async (name) => {
    const f = ownedNumeric();
    service(f).name = name;
    const report = await c.collect(f.env, SHA, f.transport);
    expect(record(report).status).toBe("blocked");
    expect(record(report, "api:partial")).toBeUndefined();
    expect(f.calls.some((d: any) => d.url.includes("/services/other/"))).toBe(
      false,
    );
    expect(() => c.serialize(report)).not.toThrow();
  });
  it.each(["latestReadyRevision", "latestCreatedRevision", "traffic"])(
    "binds %s to immediate configured service parent",
    async (field) => {
      const f = ownedNumeric();
      const foreign = `projects/${NUMBER}/locations/us-central1/services/other/revisions/prod-api-00001`;
      if (field === "traffic") service(f).trafficStatuses[0].revision = foreign;
      else service(f)[field] = foreign;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(record(report)).toMatchObject({
        status: "blocked",
        diagnosis: "REVISION_PARENT",
      });
      expect(f.calls.some((d: any) => d.url.includes("/services/other/"))).toBe(
        false,
      );
    },
  );
  it("accepts mixed owned spellings with the same canonical parent", async () => {
    const f = ownedNumeric();
    service(f).latestCreatedRevision = service(f).latestReadyRevision.replace(
      NUMBER,
      c.TARGET.project,
    );
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.collection).toBe("complete");
    expect(() => c.serialize(report)).not.toThrow();
  });
  it("revalidates numeric anchor and parent at independent serialization", async () => {
    const f = ownedNumeric();
    const report = await c.collect(f.env, SHA, f.transport);
    for (const mutation of [
      "remove-anchor",
      "foreign-anchor",
      "duplicate-anchor",
      "wrong-parent",
      "wrong-resource",
    ]) {
      const changed = structuredClone(report);
      const project = record(changed, "project");
      if (mutation === "remove-anchor")
        changed.records = changed.records.filter(
          (r: any) => r.id !== "project",
        );
      if (mutation === "foreign-anchor")
        project.data.projectId = "foreign-project";
      if (mutation === "duplicate-anchor") changed.records.push(project);
      if (mutation === "wrong-parent")
        record(changed).data.latestReadyRevision =
          `projects/${NUMBER}/locations/us-central1/services/other/revisions/other-00001`;
      if (mutation === "wrong-resource")
        record(changed).resource =
          `projects/${c.TARGET.project}/locations/us-central1/services/other`;
      expect(() => c.serialize(changed)).toThrow();
    }
  });
});

describe("fixed safe diagnosis and independent partial observations", () => {
  it.each([
    ["image", "IMAGE_CONTRACT"],
    ["runtime", "RUNTIME_IDENTITY"],
    ["expected-image", "EXPECTED_IMAGE"],
  ] as const)(
    "retains owned safe fields while %s stays blocked",
    async (field, diagnosis) => {
      const f = ownedNumeric();
      const body = service(f);
      body.template.containers[0].resources = { cpuIdle: false };
      body.template.scaling = {
        minInstanceCount: 0,
        maxInstanceCount: 2147483647,
      };
      body.scaling = { manualInstanceCount: 0, scalingMode: "MANUAL" };
      if (field === "image")
        body.template.containers[0].image = `https://user:${SENTINEL}@evil.invalid/image`;
      if (field === "runtime")
        body.template.serviceAccount = `${SENTINEL}@foreign.iam.gserviceaccount.com`;
      if (field === "expected-image")
        body.template.containers[0].image = `us-central1-docker.pkg.dev/${c.TARGET.project}/other/api@sha256:${"c".repeat(64)}`;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(record(report)).toMatchObject({
        status: "blocked",
        diagnosis,
        observedResource: body.name,
      });
      const partial = record(report, "api:partial");
      expect(partial).toMatchObject({
        status: "partial",
        diagnosis,
        data: {
          name: body.name,
          ingress: body.ingress,
          scaling: body.scaling,
          template: {
            scaling: body.template.scaling,
            containers: [{ resources: { cpuIdle: false } }],
          },
        },
      });
      expect(partial.data.template.serviceAccount).toBeUndefined();
      expect(partial.data.template.containers[0].image).toBeUndefined();
      expect(report.collection).toBe("incomplete");
      expect(report.runtimeProvenance).toBe("unverified");
      expect(report.effectiveIamPermissions).toBe("unverified");
      const saved = c.serialize(report);
      expect(saved).not.toContain(SENTINEL);
      expect(saved).not.toContain("evil.invalid");
      expect(saved).not.toContain("/other/api");
      expect(
        f.calls.every(
          (d: any) => d.method === "GET" && d.url.includes(c.TARGET.project),
        ),
      ).toBe(true);
      expect(
        f.calls.filter((d: any) =>
          d.url.includes("/services/prod-api/revisions/"),
        ),
      ).toHaveLength(0);
    },
  );
  it.each(["revision", "job"])(
    "classifies %s legacy fields without retaining unsafe values",
    async (kind) => {
      const f = ownedNumeric();
      const path =
        kind === "revision"
          ? `/v2/projects/${c.TARGET.project}/locations/us-central1/services/prod-api/revisions/prod-api-00001`
          : new URL(f.plan.operations.find((o: any) => o.kind === "job").url)
              .pathname;
      const body = f.responses.get(path).body;
      const template = kind === "job" ? body.template.template : body;
      template.serviceAccount = SENTINEL;
      if (kind === "revision") {
        template.containers[0].resources = { cpuIdle: true };
        template.scaling = { minInstanceCount: 0 };
      }
      const report = await c.collect(f.env, SHA, f.transport);
      const id = kind === "job" ? "migration" : "api:prod-api-00001";
      expect(record(report, id)).toMatchObject({
        status: "blocked",
        diagnosis: "RUNTIME_IDENTITY",
      });
      if (kind === "revision")
        expect(record(report, `${id}:partial`)).toMatchObject({
          status: "partial",
          data: {
            scaling: { minInstanceCount: 0 },
            containers: [{ resources: { cpuIdle: true } }],
          },
        });
      else expect(record(report, `${id}:partial`)).toBeUndefined();
      expect(c.serialize(report)).not.toContain(SENTINEL);
    },
  );
  it("leaves absent/default background observations unknown in partial data", async () => {
    const f = ownedNumeric();
    service(f).template.containers[0].image = SENTINEL;
    const report = await c.collect(f.env, SHA, f.transport);
    const partial = record(report, "api:partial");
    expect(partial.data.scaling).toBeUndefined();
    expect(partial.data.template.scaling).toBeUndefined();
    expect(partial.data.template.containers).toEqual([{}]);
    expect(() => c.serialize(report)).not.toThrow();
  });
  it.each([
    "missing-image",
    "missing-runtime",
    "missing-ingress",
    "bool",
    "int32",
    "enum",
    "traffic",
    "extra",
    "unknown-error",
  ])("classifies %s with no raw or invented field names", async (mode) => {
    const f = ownedNumeric();
    const body = service(f);
    let expected = "TYPE_OR_SCHEMA";
    if (mode === "missing-image") {
      delete body.template.containers[0].image;
      expected = "MISSING_REQUIRED_FIELDS";
    }
    if (mode === "missing-runtime") {
      delete body.template.serviceAccount;
      expected = "MISSING_REQUIRED_FIELDS";
    }
    if (mode === "missing-ingress") {
      delete body.ingress;
      expected = "MISSING_REQUIRED_FIELDS";
    }
    if (mode === "bool")
      body.template.containers[0].resources = { cpuIdle: SENTINEL };
    if (mode === "int32") body.scaling = { minInstanceCount: 2147483648 };
    if (mode === "enum") body.scaling = { scalingMode: SENTINEL };
    if (mode === "traffic") {
      body.trafficStatuses[0].percent = 101;
      expected = "TRAFFIC";
    }
    if (mode === "extra") {
      body.template[SENTINEL] = SENTINEL;
      expected = "UNEXPECTED_FIELDS";
    }
    const transport =
      mode === "unknown-error"
        ? async (d: any) => {
            if (new URL(d.url).pathname.endsWith("/services/prod-api"))
              throw Object.assign(Error(SENTINEL), {
                diagnosis: SENTINEL,
                observedResource: SENTINEL,
              });
            return f.transport(d);
          }
        : f.transport;
    if (mode === "unknown-error") expected = "UNKNOWN";
    const report = await c.collect(f.env, SHA, transport);
    expect(record(report)).toMatchObject({
      status: "blocked",
      diagnosis: expected,
    });
    expect(record(report, "api:partial")).toBeUndefined();
    expect(c.serialize(report)).not.toContain(SENTINEL);
  });
  it.each([
    "foreign-name",
    "foreign-parent",
    "bad-cpu",
    "bad-count",
    "bad-mode",
    "bad-traffic",
    "extra-key",
  ])("image failure does not hide %s in partial data", async (mode) => {
    const f = ownedNumeric();
    const body = service(f);
    body.template.containers[0].image = SENTINEL;
    if (mode === "foreign-name")
      body.name = body.name.replace(NUMBER, "999999999");
    if (mode === "foreign-parent")
      body.latestReadyRevision = body.latestReadyRevision.replace(
        "services/prod-api/",
        "services/other/",
      );
    if (mode === "bad-cpu")
      body.template.containers[0].resources = { cpuIdle: SENTINEL };
    if (mode === "bad-count") body.scaling = { minInstanceCount: -1 };
    if (mode === "bad-mode") body.scaling = { scalingMode: SENTINEL };
    if (mode === "bad-traffic") body.trafficStatuses[0].percent = 101;
    if (mode === "extra-key") body.template[SENTINEL] = SENTINEL;
    const report = await c.collect(f.env, SHA, f.transport);
    expect(record(report).status).toBe("blocked");
    expect(record(report, "api:partial")).toBeUndefined();
    expect(c.serialize(report)).not.toContain(SENTINEL);
  });
  it.each([403, 404])(
    "keeps HTTP %s truthful and never reads partial data from error bodies",
    async (status) => {
      const f = ownedNumeric();
      f.responses.set(
        `/v2/projects/${c.TARGET.project}/locations/us-central1/services/prod-api`,
        { status, body: service(f) },
      );
      const report = await c.collect(f.env, SHA, f.transport);
      expect(record(report)).toMatchObject({
        status: "blocked",
        httpStatus: status,
        code: status === 403 ? "PERMISSION_DENIED" : "MISSING",
        diagnosis: "UNKNOWN",
      });
      expect(record(report, "api:partial")).toBeUndefined();
      expect(() => c.serialize(report)).not.toThrow();
    },
  );
  it("independent serializer rejects forged partials, unsafe values and diagnostic content", async () => {
    const f = ownedNumeric();
    service(f).template.containers[0].image = SENTINEL;
    const report = await c.collect(f.env, SHA, f.transport);
    for (const mode of [
      "image",
      "runtime",
      "cpu",
      "count",
      "diagnosis",
      "diagnostic-extra",
      "raw-name",
      "no-anchor",
      "no-block",
      "no-resource",
      "wrong-parent",
      "complete",
    ] as const) {
      const changed = structuredClone(report);
      const partial = record(changed, "api:partial");
      if (mode === "image")
        partial.data.template.containers[0].image = SENTINEL;
      if (mode === "runtime") partial.data.template.serviceAccount = SENTINEL;
      if (mode === "cpu")
        partial.data.template.containers[0].resources = { cpuIdle: SENTINEL };
      if (mode === "count")
        partial.data.scaling = { minInstanceCount: 2147483648 };
      if (mode === "diagnosis") record(changed).diagnosis = SENTINEL;
      if (mode === "diagnostic-extra")
        record(changed).diagnosticFields = { [SENTINEL]: SENTINEL };
      if (mode === "raw-name") record(changed).observedResource = SENTINEL;
      if (mode === "no-anchor")
        changed.records = changed.records.filter(
          (r: any) => r.kind !== "project",
        );
      if (mode === "no-block")
        changed.records = changed.records.filter((r: any) => r.id !== "api");
      if (mode === "no-resource") delete partial.resource;
      if (mode === "wrong-parent")
        partial.data.latestCreatedRevision =
          partial.data.latestCreatedRevision.replace(
            "services/prod-api/",
            "services/other/",
          );
      if (mode === "complete") changed.collection = "complete";
      expect(() => c.serialize(changed)).toThrow();
    }
  });
});

describe("literal legacy field old-to-new exported-function regressions", () => {
  it("diagnoses literal legacy image without raw field content", async () => {
    const f = fixture({}, c);
    service(f).template.containers[0].image = SENTINEL;
    const report = await c.collect(f.env, SHA, f.transport);
    expect(record(report)).toMatchObject({
      status: "blocked",
      code: "MALFORMED_METADATA",
      diagnosis: "IMAGE_CONTRACT",
    });
    expect(c.serialize(report)).not.toContain(SENTINEL);
  });
  it("retains literal owned independent CPU/scaling in explicit partial record", async () => {
    const f = fixture({}, c);
    const body = service(f);
    body.template.containers[0].image = SENTINEL;
    body.template.containers[0].resources = { cpuIdle: false };
    body.template.scaling = { minInstanceCount: 0, maxInstanceCount: 7 };
    const report = await c.collect(f.env, SHA, f.transport);
    expect(record(report, "api:partial")).toMatchObject({
      status: "partial",
      data: {
        template: {
          containers: [{ resources: { cpuIdle: false } }],
          scaling: { minInstanceCount: 0, maxInstanceCount: 7 },
        },
      },
    });
    expect(c.serialize(report)).not.toContain(SENTINEL);
  });
});

describe("all resource consumers retain ownership and request authority", () => {
  it.each(["job", "revision"])(
    "rejects wrong %s name independently of service success",
    async (kind) => {
      for (const mutation of [
        "foreign-project",
        "wrong-region",
        "wrong-resource",
        "wrong-kind",
        "extra-segment",
      ] as const) {
        const f = ownedNumeric();
        const path =
          kind === "job"
            ? new URL(f.plan.operations.find((o: any) => o.kind === "job").url)
                .pathname
            : `/v2/projects/${c.TARGET.project}/locations/us-central1/services/prod-api/revisions/prod-api-00001`;
        const body = f.responses.get(path).body;
        if (mutation === "foreign-project")
          body.name = body.name.replace(NUMBER, "999999999");
        if (mutation === "wrong-region")
          body.name = body.name.replace("us-central1", "europe-west1");
        if (mutation === "wrong-resource")
          body.name = body.name.replace(
            kind === "job" ? "drts-prod-migrate" : "prod-api-00001",
            "other",
          );
        if (mutation === "wrong-kind")
          body.name = body.name.replace(
            kind === "job" ? "/jobs/" : "/services/",
            kind === "job" ? "/services/" : "/jobs/",
          );
        if (mutation === "extra-segment") body.name += "/extra";
        const report = await c.collect(f.env, SHA, f.transport);
        expect(
          record(report, kind === "job" ? "migration" : "api:prod-api-00001")
            .status,
        ).toBe("blocked");
        expect(report.collection).toBe("incomplete");
        expect(() => c.serialize(report)).not.toThrow();
      }
    },
  );
  it.each(["latestReadyRevision", "latestCreatedRevision", "traffic"])(
    "rejects unanchored numeric %s before revision GET",
    async (field) => {
      const f = ownedNumeric();
      const foreign = service(f).latestReadyRevision.replace(
        NUMBER,
        "999999999",
      );
      if (field === "traffic") service(f).trafficStatuses[0].revision = foreign;
      else service(f)[field] = foreign;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(record(report)).toMatchObject({
        status: "blocked",
        diagnosis: "RESOURCE_IDENTITY",
      });
      expect(f.calls.every((d: any) => !d.url.includes("999999999"))).toBe(
        true,
      );
      expect(
        f.calls.some((d: any) =>
          d.url.includes("/services/prod-api/revisions/"),
        ),
      ).toBe(false);
    },
  );
  it.each(["missing-anchor", "failed-anchor", "foreign-anchor"])(
    "rejects numeric partial observations with %s even on image failure",
    async (mode) => {
      const f = ownedNumeric();
      const project = f.responses.get(`/v3/projects/${c.TARGET.project}`);
      if (mode === "missing-anchor") delete project.body.name;
      if (mode === "failed-anchor") project.status = 403;
      if (mode === "foreign-anchor") project.body.projectId = "foreign";
      service(f).template.containers[0].image = SENTINEL;
      service(f).template.containers[0].resources = { cpuIdle: true };
      const report = await c.collect(f.env, SHA, f.transport);
      expect(record(report).status).toBe("blocked");
      expect(record(report, "api:partial")).toBeUndefined();
      expect(record(report).observedResource).toBeUndefined();
      expect(c.serialize(report)).not.toContain(SENTINEL);
    },
  );
  it("does not grant shared registry GETs for numeric resource responses", async () => {
    const f = ownedNumeric({
      PROD_ARTIFACT_REGISTRY:
        "us-central1-docker.pkg.dev/drts-dev-devcc-20260825/drts",
      PROD_ARTIFACT_PROJECT_ID: "drts-dev-devcc-20260825",
      PROD_ARTIFACT_REGION: "us-central1",
      PROD_ARTIFACT_REPOSITORY: "drts",
    });
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.collection).toBe("incomplete");
    expect(report.requests).toBe(62);
    expect(record(report, "artifact-images").code).toBe(
      "SHARED_REGISTRY_NOT_AUTHORIZED",
    );
    expect(record(report).status).toBe("observed");
    expect(
      f.calls.every(
        (d: any) =>
          !d.url.includes("drts-dev-devcc-20260825") &&
          !d.url.includes("artifactregistry.googleapis.com"),
      ),
    ).toBe(true);
    expect(() => c.serialize(report)).not.toThrow();
  });
  it("deduplicates aliases for the same revision without substituting observed spelling", async () => {
    const f = ownedNumeric();
    service(f).latestCreatedRevision = service(f).latestReadyRevision.replace(
      NUMBER,
      c.TARGET.project,
    );
    const report = await c.collect(f.env, SHA, f.transport);
    expect(report.requests).toBe(64);
    expect(record(report).data.latestCreatedRevision).toContain(
      c.TARGET.project,
    );
    expect(record(report).data.latestReadyRevision).toContain(NUMBER);
    expect(
      report.records.filter((r: any) => r.id === "api:prod-api-00001"),
    ).toHaveLength(1);
    expect(() => c.serialize(report)).not.toThrow();
  });
  it("does not accept a transport-provided observedResource as trusted diagnosis", async () => {
    const f = ownedNumeric();
    const report = await c.collect(f.env, SHA, async (d: any) => {
      if (new URL(d.url).pathname.endsWith("/services/prod-api"))
        throw Object.assign(Error(SENTINEL), {
          observedResource: service(f).name,
          diagnosis: "IMAGE_CONTRACT",
        });
      return f.transport(d);
    });
    expect(record(report)).toMatchObject({
      status: "blocked",
      code: "REQUEST_FAILED",
      diagnosis: "UNKNOWN",
    });
    expect(record(report).observedResource).toBeUndefined();
    expect(c.serialize(report)).not.toContain(SENTINEL);
  });
});

describe("required identity versus absent optional observations", () => {
  it.each(["service", "revision", "job"])(
    "distinguishes absent %s identity from malformed spelling",
    async (kind) => {
      const f = ownedNumeric();
      const path =
        kind === "revision"
          ? `/v2/projects/${c.TARGET.project}/locations/us-central1/services/prod-api/revisions/prod-api-00001`
          : new URL(f.plan.operations.find((o: any) => o.kind === kind).url)
              .pathname;
      delete f.responses.get(path).body.name;
      const report = await c.collect(f.env, SHA, f.transport);
      expect(
        record(
          report,
          kind === "service"
            ? "api"
            : kind === "job"
              ? "migration"
              : "api:prod-api-00001",
        ),
      ).toMatchObject({
        status: "blocked",
        code: "INSUFFICIENT_OBSERVATION",
        diagnosis: "MISSING_REQUIRED_FIELDS",
      });
      expect(() => c.serialize(report)).not.toThrow();
    },
  );
});

describe("unknown transport and diagnostic consistency", () => {
  it.each([null, "IMAGE_CONTRACT"])(
    "classifies primitive throw %s as unknown without output",
    async (thrown) => {
      const f = ownedNumeric();
      const report = await c.collect(f.env, SHA, async (d: any) => {
        if (new URL(d.url).pathname.endsWith("/services/prod-api"))
          throw thrown;
        return f.transport(d);
      });
      expect(record(report)).toMatchObject({
        status: "blocked",
        code: "REQUEST_FAILED",
        diagnosis: "UNKNOWN",
      });
      expect(record(report, "api:partial")).toBeUndefined();
      expect(() => c.serialize(report)).not.toThrow();
    },
  );
  it.each(["http", "code", "observed-spelling"])(
    "rejects inconsistent partial %s at serializer",
    async (mode) => {
      const f = ownedNumeric();
      service(f).template.containers[0].image = SENTINEL;
      const report = await c.collect(f.env, SHA, f.transport);
      const partial = record(report, "api:partial");
      if (mode === "http") partial.httpStatus = 403;
      if (mode === "code") {
        partial.code = "PERMISSION_DENIED";
        record(report).code = "PERMISSION_DENIED";
      }
      if (mode === "observed-spelling")
        record(report).observedResource = record(
          report,
        ).observedResource.replace(NUMBER, c.TARGET.project);
      expect(() => c.serialize(report)).toThrow();
    },
  );
});
