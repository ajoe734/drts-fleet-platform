import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";

export function buildHealthPayload() {
  return {
    service: "api",
    status: "ok",
    mode: "phase1_foundation",
    execution_mode: "supervisor_managed_execution",
    timestamp: new Date().toISOString(),
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
