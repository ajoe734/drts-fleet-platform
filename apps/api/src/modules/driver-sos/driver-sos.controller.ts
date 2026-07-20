import { Body, Controller, Headers, Post } from "@nestjs/common";

import type { SubmitDriverSosEventCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { DriverSosService } from "./driver-sos.service";

@RequireRealms("driver")
@Controller("driver/sos-events")
export class DriverSosController {
  constructor(private readonly driverSosService: DriverSosService) {}

  @Post()
  async submitSosEvent(
    @Body() command: SubmitDriverSosEventCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.driverSosService.submitSosEvent(command, identity, requestId),
      requestId,
    );
  }
}
