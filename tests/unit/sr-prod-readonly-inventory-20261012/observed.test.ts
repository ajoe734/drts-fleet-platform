import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const c = require(
  process.env.INVENTORY_COLLECTOR_UNDER_TEST ||
    "../../../operations/verification/production-readonly-inventory/collector.cjs",
);
const { fixture, SHA, SENTINEL } = require("./fixture.cjs");
const NUMBER = "405416046689";
function ownedNumeric() {
  const f = fixture({}, c);
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
