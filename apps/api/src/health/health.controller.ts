import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { UiHealthEnvelope } from "@drts/contracts";

import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";
import { HealthService } from "./health.service";

@Controller("health")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async getHealth(): Promise<UiHealthEnvelope> {
    return await this.healthService.getHealth();
  }
}
