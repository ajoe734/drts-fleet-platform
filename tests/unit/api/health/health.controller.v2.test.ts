import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "../../../../apps/api/src/health/health.service";

describe("HealthController - buildHealthPayload", () => {
  it("should return healthy status when no dependencies provided", () => {
    const payload = buildHealthPayload([]);
    expect(payload.status).toBe("healthy");
    expect(payload.degradedServices).toHaveLength(0);
  });

  it("should return degraded status when low severity dependency provided", () => {
    const payload = buildHealthPayload([
      { service: "db", severity: "low", impact: "latency" },
    ]);
    expect(payload.status).toBe("degraded");
    expect(payload.degradedServices).toHaveLength(1);
    expect(payload.degradedServices[0].severity).toBe("low");
  });

  it("should return down status when critical severity dependency provided", () => {
    const payload = buildHealthPayload([
      { service: "cache", severity: "critical", impact: "down" },
    ]);
    expect(payload.status).toBe("down");
    expect(payload.degradedServices).toHaveLength(1);
    expect(payload.degradedServices[0].severity).toBe("critical");
  });
});
