import { Controller, Get, Headers } from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";

@Controller("service-products")
export class ServiceProductController {
  @Get("health")
  getHealth(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        module: "service-product" as const,
        status: "scaffolded" as const,
      },
      requestId,
    );
  }
}
