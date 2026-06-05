import { Controller, Get, Headers } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";

@Controller("fleet-partners")
export class FleetPartnerController {
  @Get("health")
  getHealth(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        module: "fleet-partner" as const,
        status: "scaffolded" as const,
      },
      requestId,
    );
  }
}
