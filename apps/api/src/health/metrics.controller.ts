import { Controller, Get, Header } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { RequireRealms } from "../common/auth";
import { internalKeyMetrics } from "../common/auth/internal-key-metrics";
import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";
import { iamSecurityMetrics } from "../observability/iam-security-metrics";

@Controller("metrics")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class MetricsController {
  @Get()
  @RequireRealms("ops", "platform")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  getMetrics() {
    const internalKey = internalKeyMetrics.toPrometheusFormat();
    const iamSecurity = iamSecurityMetrics.toPrometheusFormat();
    return [internalKey, iamSecurity].filter(Boolean).join("\n\n");
  }
}

