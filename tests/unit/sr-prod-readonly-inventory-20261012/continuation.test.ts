import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
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
});
