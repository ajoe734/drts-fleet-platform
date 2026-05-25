import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { UiHealthEnvelope } from "@drts/contracts";

import { RATE_LIMIT_SKIP_DEFAULT } from "../common/throttling/rate-limit.constants";
import { HealthService } from "./health.service";
import { SkipSnakeCase } from "../common/skip-snake-case.decorator";

@Controller("health")
@SkipThrottle(RATE_LIMIT_SKIP_DEFAULT)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @SkipSnakeCase()
  async getHealth(): Promise<UiHealthEnvelope> {
    return await this.healthService.getHealth();
  }
}
