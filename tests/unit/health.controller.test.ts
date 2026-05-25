import { describe, it, expect } from "vitest";
import { buildHealthPayload } from "../../apps/api/src/health/health.controller";
import type { DegradedService } from "@drts/shared-types";

describe("HealthController", () => {
  it("should return healthy status when no dependencies are degraded", () => {
    const payload = buildHealthPayload([]);
    expect(payload.status).toBe("healthy");
    expect(payload.degradedServices).toHaveLength(0);
    expect(payload.lastCheckedAt).toBeDefined();
  });

  it("should return degraded status when there are non-critical degraded dependencies", () => {
    const dependencies: DegradedService[] = [
      { name: "db", severity: "low", message: "latency" },
    ];
    const payload = buildHealthPayload(dependencies);
    expect(payload.status).toBe("degraded");
    expect(payload.degradedServices).toHaveLength(1);
  });

  it("should return down status when there are critical degraded dependencies", () => {
    const dependencies: DegradedService[] = [
      { name: "db", severity: "critical", message: "down" },
    ];
    const payload = buildHealthPayload(dependencies);
    expect(payload.status).toBe("down");
    expect(payload.degradedServices).toHaveLength(1);
  });
});
