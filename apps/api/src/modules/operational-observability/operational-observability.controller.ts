import { Controller, Get, Headers } from "@nestjs/common";

import type { OperationalObservabilitySnapshot } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms, RequireScopes } from "../../common/auth";
import { OperationalObservabilityService } from "./operational-observability.service";

@Controller("operational-observability")
export class OperationalObservabilityController {
  constructor(
    private readonly operationalObservabilityService: OperationalObservabilityService,
  ) {}

  @Get()
  @RequireRealms("platform", "ops")
  @RequireScopes("audit:read")
  getSnapshot(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope<OperationalObservabilitySnapshot>(
      this.operationalObservabilityService.getSnapshot(),
      requestId,
    );
  }
}
