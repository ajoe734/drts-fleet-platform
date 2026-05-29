import { Injectable } from "@nestjs/common";

import type { UiHealthEnvelope } from "@drts/contracts";

import type {
  HealthDependencyProbe,
  HealthDependencyProbeResult,
  UiHealthDegradedService,
} from "./health.types";

/** Clock seam so tests can assert a deterministic `lastCheckedAt`. */
export type HealthClock = () => Date;

/**
 * Computes the `UiHealthEnvelope` (Q-X12) for `/api/health`.
 *
 * Responsibilities:
 *   - run every registered dependency probe (sync or async, fault-isolated)
 *   - fold the per-dependency states into `degradedServices[]` via the
 *     degraded-service taxonomy (see `health.types.ts`)
 *   - derive the overall `status` from the worst observed severity:
 *       any `critical` → `down`; else any `warning` → `degraded`; else
 *       `healthy`
 *
 * With no probes registered the platform reports `healthy` with an empty
 * `degradedServices[]` — an honest "nothing is known to be wrong" rather
 * than a fabricated all-green dependency list. Real probes (DB, forwarder
 * adapters) can be registered without touching the aggregation logic.
 */
@Injectable()
export class HealthService {
  private readonly probes: HealthDependencyProbe[];
  private readonly now: HealthClock;

  constructor(
    probes: HealthDependencyProbe[] = [],
    now: HealthClock = () => new Date(),
  ) {
    this.probes = probes;
    this.now = now;
  }

  async getHealth(): Promise<UiHealthEnvelope> {
    const results = await Promise.all(
      this.probes.map((probe) => this.runProbe(probe)),
    );
    return HealthService.buildEnvelope(results, this.now().toISOString());
  }

  /**
   * Run a single probe, converting any thrown error into a `critical`
   * result so one misbehaving probe degrades only its own dependency
   * instead of failing the whole health response.
   */
  private async runProbe(
    probe: HealthDependencyProbe,
  ): Promise<HealthDependencyProbeResult> {
    try {
      return await probe.check();
    } catch (error) {
      return {
        service: probe.service,
        state: "critical",
        impact: `Health probe threw: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /**
   * Pure folder from probe results to the wire envelope. Exposed for unit
   * tests and for the raw `/api/health` route in `main.ts`.
   */
  static buildEnvelope(
    results: HealthDependencyProbeResult[],
    lastCheckedAt: string,
  ): UiHealthEnvelope {
    const degradedServices: UiHealthDegradedService[] = results
      .filter((result) => result.state !== "ok")
      .map((result) => ({
        service: result.service,
        impact: result.impact,
        severity: result.state === "critical" ? "critical" : "warning",
      }));

    const hasCritical = degradedServices.some(
      (service) => service.severity === "critical",
    );

    const status: UiHealthEnvelope["status"] = hasCritical
      ? "down"
      : degradedServices.length > 0
        ? "degraded"
        : "healthy";

    return { status, degradedServices, lastCheckedAt };
  }
}
