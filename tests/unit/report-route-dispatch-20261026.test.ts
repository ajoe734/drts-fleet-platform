import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../../apps/api/src/app.module";

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url),
);
const { NestContainer } = require("@nestjs/core/injector/container");
const { MetadataScanner } = require("@nestjs/core/metadata-scanner");
const { GraphInspector } = require("@nestjs/core/inspector/graph-inspector");
const { DependenciesScanner } = require("@nestjs/core/scanner");
const { PATH_METADATA, METHOD_METADATA } = require("@nestjs/common/constants");
const { RequestMethod } = require("@nestjs/common");
const adapterRequire = createRequire(
  require.resolve("@nestjs/platform-express/package.json"),
);
const { Router } = adapterRequire("express");

interface Selection {
  controller: string;
  handler: string;
  params: Record<string, string>;
}

let router: ReturnType<typeof Router>;

beforeAll(async () => {
  // Follow the production scanner's module/controller insertion order. This
  // constructs metadata only: no providers, lifecycle hooks, app or listener.
  const container = new NestContainer();
  const metadata = new MetadataScanner();
  await new DependenciesScanner(
    container,
    metadata,
    new GraphInspector(container),
  ).scan(AppModule);

  router = Router();
  for (const module of container.getModules().values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      const prefix = Reflect.getMetadata(PATH_METADATA, controller) ?? "";
      for (const handler of metadata.getAllMethodNames(controller.prototype)) {
        const method = controller.prototype[handler];
        const path = Reflect.getMetadata(PATH_METADATA, method);
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, method);
        if (path === undefined || requestMethod === undefined) continue;
        const verb = RequestMethod[requestMethod].toLowerCase();
        if (verb !== "get" && verb !== "post") continue;
        for (const part of Array.isArray(path) ? path : [path]) {
          const fullPath = `${prefix}/${part}`.replace(/^\/+|\/+$/g, "");
          if (!fullPath.startsWith("reports/")) continue;
          router[verb](
            `/api/${fullPath}`,
            (request: {
              params: Record<string, string>;
              selected: (selection: Selection) => void;
            }) => {
              request.selected({
                controller: controller.name,
                handler,
                params: { ...request.params },
              });
            },
          );
        }
      }
    }
  }
}, 30_000);

function select(
  method: "GET" | "POST",
  url: string,
): Promise<Selection | null> {
  // Exercise Express matching directly, without an HTTP server or socket.
  return new Promise((resolve, reject) => {
    router.handle(
      { method, url, headers: {}, selected: resolve },
      {},
      (error: unknown) => (error ? reject(error) : resolve(null)),
    );
  });
}

describe("production report routes dispatch to their actual controllers", () => {
  it.each([
    [
      "daily-dispatch-records",
      "ReportingController",
      "listDailyDispatchRecords",
    ],
    [
      "dispatchable-supply-snapshots",
      "ReportingController",
      "listDispatchableSupplySnapshots",
    ],
    [
      "monthly-operations-summaries",
      "ReportingController",
      "listMonthlyOperationsSummaries",
    ],
    ["referral-monthly-ratings", "ReferralMonthlyRatingController", "read"],
  ])(
    "GET reports/%s selects the static data reader",
    async (path, controller, handler) => {
      expect(
        await select("GET", `/api/reports/${path}?tenantId=owned-tenant`),
      ).toEqual({
        controller,
        handler,
        params: {},
      });
    },
  );

  it("keeps the existing job detail and artifact URLs", async () => {
    const jobId = "report_job_existing-owned-job";
    expect(await select("GET", `/api/reports/${jobId}`)).toEqual({
      controller: "ReportingFilingController",
      handler: "getReportJob",
      params: { jobId },
    });
    expect(await select("GET", `/api/reports/${jobId}/artifact`)).toEqual({
      controller: "ReportingFilingController",
      handler: "downloadReportArtifact",
      params: { jobId },
    });
  });

  it("keeps the static job list ahead of the job ID parameter", async () => {
    expect(await select("GET", "/api/reports/jobs")).toEqual({
      controller: "ReportingFilingController",
      handler: "listReportJobs",
      params: {},
    });
  });

  it("keeps the original summary preview and governance readers", async () => {
    expect(
      await select("GET", "/api/reports/operations-summary/preview"),
    ).toMatchObject({
      controller: "ReportingController",
      handler: "previewSixMonthOperationsSummary",
    });
    expect(
      await select("GET", "/api/reports/referral-monthly-ratings/governance"),
    ).toMatchObject({
      controller: "ReferralMonthlyRatingController",
      handler: "readGovernance",
    });
  });

  it("keeps the original rebuild and job creation POST routes", async () => {
    expect(
      await select("POST", "/api/reports/daily-dispatch-records/rebuild"),
    ).toMatchObject({
      controller: "ReportingController",
      handler: "rebuildDailyDispatchRecords",
    });
    expect(await select("POST", "/api/reports/jobs")).toMatchObject({
      controller: "ReportingFilingController",
      handler: "createReportJob",
    });
  });
});
