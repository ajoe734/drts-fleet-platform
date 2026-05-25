import { buildHealthPayload } from "../../../apps/api/src/health/health.controller";

describe("HealthController Payload Builder", () => {
  it("should return healthy status when no dependencies", () => {
    const payload = buildHealthPayload();
    expect(payload).toEqual(
      expect.objectContaining({
        service: "api",
        status: "ok",
        degradedServices: [],
      }),
    );
    expect(payload).toHaveProperty("timestamp");
  });

  it("should return degraded status when low/medium/high severity dependency", () => {
    const payload = buildHealthPayload([
      { name: "db", severity: "medium", message: "latency" },
    ]);
    expect(payload).toEqual(
      expect.objectContaining({
        status: "degraded",
        degradedServices: [
          { name: "db", severity: "medium", message: "latency" },
        ],
      }),
    );
  });

  it("should return down status when critical severity dependency", () => {
    const payload = buildHealthPayload([
      { name: "db", severity: "critical", message: "down" },
    ]);
    expect(payload.status).toBe("down");
    expect(payload.degradedServices).toHaveLength(1);
    expect(payload.degradedServices[0].severity).toBe("critical");
  });
});
