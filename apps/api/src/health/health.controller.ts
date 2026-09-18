import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { OpenRoute } from "../common/auth";
import { buildMapProviderHealthReport } from "../common/map-provider";
import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";

import { getCandidateSha } from "../common/candidate-sha.middleware";

export function buildHealthPayload(env: NodeJS.ProcessEnv = process.env) {
  return {
    service: "api",
    status: "ok",
    candidateSha: getCandidateSha(env),
    mode: "phase1_foundation",
    execution_mode: "supervisor_managed_execution",
    timestamp: new Date().toISOString(),
    mapProvider: buildMapProviderHealthReport(env),
  };
}

@Controller("health")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class HealthController {
  @OpenRoute()
  @Get()
  getHealth() {
    return buildHealthPayload();
  }
}
