import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";
import type { HealthDependencyProbe } from "./health.types";

/**
 * Default dependency probes wired into `/health` and `/api/health`.
 *
 * Empty for the Phase 1 foundation: no external dependency is currently
 * probed, so the platform reports `healthy` with an empty
 * `degradedServices[]`. Register real probes (DB ping, forwarder adapter
 * health, …) here and both routes pick them up without further changes.
 */
export const defaultHealthProbes: HealthDependencyProbe[] = [];

/**
 * Construct a `HealthService` backed by the default probe set. Used by the
 * raw `/api/health` route in `main.ts`, which lives outside Nest DI.
 */
export function createHealthService(): HealthService {
  return new HealthService(defaultHealthProbes);
}

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: HealthService,
      useFactory: createHealthService,
    },
  ],
  exports: [HealthService],
})
export class HealthModule {}
