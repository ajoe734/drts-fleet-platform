import { describe, it, expect } from "vitest";
import { buildHealthPayload } from "../../../../apps/api/src/health/health.controller";

describe("buildHealthPayload", () => {
  it("should return healthy status when no dependencies", () => {
    const payload = buildHealthPayload([]);
    expect(payload.status).toBe("ok");
    expect(payload.degradedServices).toHaveLength(0);
  });

  it("should return degraded status when dependencies have low severity", () => {
    const payload = buildHealthPayload([
      { name: "db", severity: "low", message: "latency" },
    ]);
    expect(payload.status).toBe("degraded");
    expect(payload.degradedServices).toHaveLength(1);
    expect(payload.degradedServices[0]!.name).toBe("db");
  });

  it("should return down status when dependencies have critical severity", () => {
    const payload = buildHealthPayload([
      { name: "redis", severity: "critical", message: "down" },
    ]);
    expect(payload.status).toBe("down");
    expect(payload.degradedServices[0]!.name).toBe("redis");
  });
});
