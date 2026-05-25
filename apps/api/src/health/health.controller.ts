import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type {
  UiHealthEnvelope,
  UiHealthDegradedService,
} from "@drts/contracts";
import type { DegradedService } from "@drts/shared-types";

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

  const degradedServices: UiHealthDegradedService[] = dependencies.map((d) => ({
    service: d.name,
    impact: d.message,
    severity: d.severity === "critical" ? "critical" : "warning",
  }));

  return {
    status,
    lastCheckedAt: new Date().toISOString(),
    degradedServices,
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
