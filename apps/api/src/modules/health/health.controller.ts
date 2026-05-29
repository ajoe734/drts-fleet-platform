import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import type { UiHealthEnvelope } from "@drts/contracts";

import { RATE_LIMIT_SKIP_DEFAULT } from "../../common/throttling/rate-limit.constants";
import { HealthService } from "./health.service";

/**
 * Liveness + degraded-service endpoint.
 *
 * Served at `/health` (the global `api` prefix is excluded for this route
 * in `main.ts`). The UI-facing `/api/health` alias is registered directly
 * on the HTTP adapter in `main.ts` and shares the same `HealthService`, so
 * both routes emit an identical `UiHealthEnvelope` on the wire.
 */
@Controller("health")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth(): Promise<UiHealthEnvelope> {
    return this.healthService.getHealth();
  }
}
