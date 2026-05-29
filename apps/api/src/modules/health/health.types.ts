import type { UiHealthDegradedService } from "@drts/contracts";

/**
 * Degraded-service taxonomy (UI-BE-002).
 *
 * Each backend dependency reports one of three operational states. The
 * health service maps these onto the `UiHealthEnvelope` contract:
 *
 *   - `ok`       → dependency healthy, omitted from `degradedServices`
 *   - `warning`  → dependency degraded but the platform stays usable;
 *                  surfaced with `severity: "warning"`
 *   - `critical` → dependency unavailable / hard failure; surfaced with
 *                  `severity: "critical"` and forces overall `down`
 *
 * The state → severity mapping is intentionally narrow so the contract's
 * `UiHealthDegradedService.severity` ("warning" | "critical") is always
 * satisfied without inventing a third banner tone.
 */
export type HealthDependencyState = "ok" | "warning" | "critical";

/**
 * Single dependency probe result. `service` is the stable machine key the
 * UI maps to a label/tone; `impact` is the human-readable consequence the
 * degraded banner renders when the dependency is not `ok`.
 */
export interface HealthDependencyProbeResult {
  service: string;
  state: HealthDependencyState;
  impact: string;
}

/**
 * A registered dependency probe. Probes may be sync or async so adapters
 * backed by network checks (DB ping, forwarder adapter health, …) can be
 * wired in later without changing the aggregation contract.
 */
export interface HealthDependencyProbe {
  readonly service: string;
  check(): HealthDependencyProbeResult | Promise<HealthDependencyProbeResult>;
}

/**
 * Re-export the contract degraded entry so callers in this module import
 * a single surface.
 */
export type { UiHealthDegradedService };
