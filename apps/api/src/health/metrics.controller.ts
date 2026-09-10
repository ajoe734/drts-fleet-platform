import { Controller, Get, Header, Optional } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { RequireRealms } from "../common/auth";
import { internalKeyMetrics } from "../common/auth/internal-key-metrics";
import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";
import { iamSecurityMetrics } from "../observability/iam-security-metrics";
import { voiceAlertMetrics } from "../observability/voice-alert-metrics";
import { VoiceBookingMetricsService } from "../observability/voice-booking-metrics.service";

@Controller("metrics")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class MetricsController {
  constructor(
    @Optional()
    private readonly voiceMetricsService?: VoiceBookingMetricsService,
  ) {}

  @Get()
  @RequireRealms("ops", "platform")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async getMetrics() {
    if (this.voiceMetricsService) {
      await this.voiceMetricsService.syncActiveAlertMetrics();
    }
    const internalKey = internalKeyMetrics.toPrometheusFormat();
    const iamSecurity = iamSecurityMetrics.toPrometheusFormat();
    const voiceAlerts = voiceAlertMetrics.toPrometheusFormat();
    return [internalKey, iamSecurity, voiceAlerts].filter(Boolean).join("\n\n");
  }
}

