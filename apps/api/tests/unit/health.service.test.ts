import { describe, expect, it } from "vitest";

import { deepToSnakeCase } from "../../src/common/snake-case.interceptor";
import { HealthController } from "../../src/modules/health/health.controller";
import { HealthService } from "../../src/modules/health/health.service";
import type { HealthDependencyProbe } from "../../src/modules/health/health.types";

const FIXED_NOW = new Date("2026-05-29T03:30:00.000Z");
const clock = () => FIXED_NOW;

function probe(
  service: string,
  state: "ok" | "warning" | "critical",
  impact = `${service} impact`,
): HealthDependencyProbe {
  return { service, check: () => ({ service, state, impact }) };
}

describe("HealthService", () => {
  it("reports healthy with no degraded services when every probe is ok", async () => {
    const service = new HealthService(
      [probe("postgres", "ok"), probe("forwarder", "ok")],
      clock,
    );

    const envelope = await service.getHealth();

    expect(envelope).toEqual({
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: "2026-05-29T03:30:00.000Z",
    });
  });

  it("reports healthy with no probes registered (nothing known to be wrong)", async () => {
    const envelope = await new HealthService([], clock).getHealth();

    expect(envelope.status).toBe("healthy");
    expect(envelope.degradedServices).toEqual([]);
  });

  it("reports degraded when a dependency warns but none are critical", async () => {
    const service = new HealthService(
      [
        probe("postgres", "ok"),
        probe("forwarder", "warning", "Adapter latency elevated"),
      ],
      clock,
    );

    const envelope = await service.getHealth();

    expect(envelope.status).toBe("degraded");
    expect(envelope.degradedServices).toEqual([
      {
        service: "forwarder",
        impact: "Adapter latency elevated",
        severity: "warning",
      },
    ]);
  });

  it("reports down when any dependency is critical", async () => {
    const service = new HealthService(
      [
        probe("postgres", "critical", "Database connection refused"),
        probe("forwarder", "warning", "Adapter latency elevated"),
      ],
      clock,
    );

    const envelope = await service.getHealth();

    expect(envelope.status).toBe("down");
    // Both impacted dependencies are itemised; severity reflects each state.
    expect(envelope.degradedServices).toEqual([
      {
        service: "postgres",
        impact: "Database connection refused",
        severity: "critical",
      },
      {
        service: "forwarder",
        impact: "Adapter latency elevated",
        severity: "warning",
      },
    ]);
  });

  it("treats a thrown probe as a critical dependency instead of failing the response", async () => {
    const exploding: HealthDependencyProbe = {
      service: "audit-log",
      check: () => {
        throw new Error("probe boom");
      },
    };

    const envelope = await new HealthService([exploding], clock).getHealth();

    expect(envelope.status).toBe("down");
    expect(envelope.degradedServices).toEqual([
      {
        service: "audit-log",
        impact: "Health probe threw: probe boom",
        severity: "critical",
      },
    ]);
  });

  it("runs async probes", async () => {
    const asyncProbe: HealthDependencyProbe = {
      service: "queue",
      check: async () => ({
        service: "queue",
        state: "warning",
        impact: "Backlog growing",
      }),
    };

    const envelope = await new HealthService([asyncProbe], clock).getHealth();

    expect(envelope.status).toBe("degraded");
    expect(envelope.degradedServices[0]?.severity).toBe("warning");
  });

  it("serialises to the snake_case wire contract", async () => {
    const envelope = await new HealthService(
      [probe("postgres", "critical", "down")],
      clock,
    ).getHealth();

    expect(deepToSnakeCase(envelope)).toEqual({
      status: "down",
      degraded_services: [
        { service: "postgres", impact: "down", severity: "critical" },
      ],
      last_checked_at: "2026-05-29T03:30:00.000Z",
    });
  });
});

describe("HealthService.buildEnvelope", () => {
  it("is a pure fold from probe results to the envelope", () => {
    const envelope = HealthService.buildEnvelope(
      [
        { service: "a", state: "ok", impact: "" },
        { service: "b", state: "warning", impact: "slow" },
      ],
      "2026-05-29T03:30:00.000Z",
    );

    expect(envelope).toEqual({
      status: "degraded",
      degradedServices: [{ service: "b", impact: "slow", severity: "warning" }],
      lastCheckedAt: "2026-05-29T03:30:00.000Z",
    });
  });
});

describe("HealthController", () => {
  it("delegates to the health service", async () => {
    const service = new HealthService([probe("postgres", "ok")], clock);
    const controller = new HealthController(service);

    const envelope = await controller.getHealth();

    expect(envelope.status).toBe("healthy");
    expect(envelope.lastCheckedAt).toBe("2026-05-29T03:30:00.000Z");
  });
});
