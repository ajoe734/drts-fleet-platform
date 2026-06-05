import { Controller, Get, Headers } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";

@Controller("vehicle-eligibility")
export class VehicleEligibilityController {
  @Get("health")
  getHealth(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        module: "vehicle-eligibility" as const,
        status: "scaffolded" as const,
      },
      requestId,
    );
  }
}
