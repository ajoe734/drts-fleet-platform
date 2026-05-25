import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "../../src/health/health.controller";

describe("HealthController - buildHealthPayload", () => {
  it("should return healthy status when no dependencies provided", () => {
    const payload = buildHealthPayload([]);
    expect(payload.status).toBe("ok");
    expect(payload.degradedServices).toHaveLength(0);
  });

  it("should return degraded status when low severity dependency provided", () => {
    const payload = buildHealthPayload([
      { name: "db", severity: "low", message: "latency" },
    ]);
    expect(payload.status).toBe("degraded");
    expect(payload.degradedServices).toHaveLength(1);
    expect(payload.degradedServices[0].severity).toBe("low");
  });

  it("should return down status when critical severity dependency provided", () => {
    const payload = buildHealthPayload([
      { name: "cache", severity: "critical", message: "down" },
    ]);
    expect(payload.status).toBe("down");
    expect(payload.degradedServices).toHaveLength(1);
    expect(payload.degradedServices[0].severity).toBe("critical");
  });
});
