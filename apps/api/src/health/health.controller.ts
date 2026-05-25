import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { UiHealthEnvelope, DegradedService } from "@drts/shared-types";

import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";

export function buildHealthPayload(
  dependencies: DegradedService[] = [],
): UiHealthEnvelope {
  const status =
    dependencies.length === 0
      ? "healthy"
      : dependencies.some((d) => d.severity === "critical")
        ? "down"
        : "degraded";

  return {
    service: "api",
    status,
    mode: "phase1_foundation",
    execution_mode: "supervisor_managed_execution",
    lastCheckedAt: new Date().toISOString(),
    degradedServices: dependencies,
  };
}

@Controller("health")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class HealthController {
  @Get()
  getHealth(): UiHealthEnvelope {
    return buildHealthPayload();
  }
}
