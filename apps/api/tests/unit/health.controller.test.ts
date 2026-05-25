import "reflect-metadata";

import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { UiHealthEnvelope } from "@drts/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { SnakeCaseInterceptor } from "../../src/common/snake-case.interceptor";
import { HealthController } from "../../src/health/health.controller";
import { HealthService } from "../../src/health/health.service";

const runningApps: Array<{
  close: () => Promise<void>;
}> = [];

afterEach(async () => {
  await Promise.all(runningApps.splice(0).map((app) => app.close()));
});

describe("HealthController routing", () => {
  it.each([
    [
      "healthy",
      {
        status: "healthy",
        degradedServices: [],
        lastCheckedAt: "2026-05-25T00:00:00.000Z",
      },
      {
        status: "healthy",
        degraded_services: [],
        last_checked_at: "2026-05-25T00:00:00.000Z",
      },
    ],
    [
      "degraded",
      {
        status: "degraded",
        degradedServices: [
          {
            service: "sandbox",
            impact: "Platform forwarding delayed",
            severity: "warning",
          },
        ],
        lastCheckedAt: "2026-05-25T00:00:00.000Z",
      },
      {
        status: "degraded",
        degraded_services: [
          {
            service: "sandbox",
            impact: "Platform forwarding delayed",
            severity: "warning",
          },
        ],
        last_checked_at: "2026-05-25T00:00:00.000Z",
      },
    ],
    [
      "down",
      {
        status: "down",
        degradedServices: [
          {
            service: "sandbox",
            impact: "Platform forwarding unavailable",
            severity: "critical",
          },
        ],
        lastCheckedAt: "2026-05-25T00:00:00.000Z",
      },
      {
        status: "down",
        degraded_services: [
          {
            service: "sandbox",
            impact: "Platform forwarding unavailable",
            severity: "critical",
          },
        ],
        last_checked_at: "2026-05-25T00:00:00.000Z",
      },
    ],
  ] satisfies Array<[string, UiHealthEnvelope, Record<string, unknown>]>)(
    "serves the %s health envelope from /api/health",
    async (_label, envelope, expectedWireBody) => {
      const { baseUrl } = await startHealthApp(envelope);

      const response = await fetch(`${baseUrl}/api/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(expectedWireBody);
    },
  );

  it("does not expose the raw /health route when the global api prefix is enabled", async () => {
    const { baseUrl } = await startHealthApp({
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: "2026-05-25T00:00:00.000Z",
    });

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(404);
  });
});

async function startHealthApp(envelope: UiHealthEnvelope) {
  @Module({
    controllers: [HealthController],
    providers: [
      {
        provide: HealthService,
        useValue: {
          getHealthEnvelope: () => envelope,
        } satisfies Pick<HealthService, "getHealthEnvelope">,
      },
    ],
  })
  class TestHealthModule {}

  const app = await NestFactory.create(TestHealthModule, {
    logger: false,
  });
  runningApps.push(app);

  app.useGlobalInterceptors(new SnakeCaseInterceptor());
  app.setGlobalPrefix("api");
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") {
    throw new Error("Expected http server to bind to an ephemeral port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}
