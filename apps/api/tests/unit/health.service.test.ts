import { describe, expect, it } from "vitest";

import { HealthService } from "../../src/health/health.service";

describe("HealthService", () => {
  it("returns a healthy UiHealthEnvelope when all dependencies are healthy", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        {
          platformCode: "sandbox",
          status: "healthy",
        },
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: expect.any(String),
    });
  });

  it("returns degraded with warning services when a dependency is degraded", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        {
          platformCode: "sandbox",
          status: "degraded",
        },
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "degraded",
      degradedServices: [
        {
          service: "sandbox",
          impact: "Platform forwarding delayed",
          severity: "warning",
        },
      ],
      lastCheckedAt: expect.any(String),
    });
  });

  it("returns down with critical services when a dependency is down", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        {
          platformCode: "sandbox",
          status: "down",
        },
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "down",
      degradedServices: [
        {
          service: "sandbox",
          impact: "Platform forwarding unavailable",
          severity: "critical",
        },
      ],
      lastCheckedAt: expect.any(String),
    });
  });
});
