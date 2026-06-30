import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { buildMapProviderHealthReport } from "../common/map-provider";
import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";

export function buildHealthPayload(env: NodeJS.ProcessEnv = process.env) {
  return {
    service: "api",
    status: "ok",
    mode: "phase1_foundation",
    execution_mode: "supervisor_managed_execution",
    timestamp: new Date().toISOString(),
    mapProvider: buildMapProviderHealthReport(env),
  };
}

@Controller("health")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class HealthController {
  @Get()
  getHealth() {
    return buildHealthPayload();
  }
}
