import { Controller, Get, Header } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { OpenRoute } from "../common/auth";
import { internalKeyMetrics } from "../common/auth/internal-key-metrics";
import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";

@Controller("metrics")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class MetricsController {
  @Get()
  @OpenRoute()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  getMetrics() {
    return internalKeyMetrics.toPrometheusFormat();
  }
}
