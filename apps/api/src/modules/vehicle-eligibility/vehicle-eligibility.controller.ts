import { Body, Controller, Get, Headers, Put } from "@nestjs/common";

import type { UpdateVehicleEligibilityMatrixCommand } from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { VehicleEligibilityService } from "./vehicle-eligibility.service";

@Controller("admin/vehicle-eligibility-matrix")
export class VehicleEligibilityController {
  constructor(
    private readonly vehicleEligibilityService: VehicleEligibilityService,
  ) {}

  @Get()
  listMatrix(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.vehicleEligibilityService.listMatrix(),
      },
      requestId,
    );
  }

  @Put()
  updateMatrix(
    @Body() command: UpdateVehicleEligibilityMatrixCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.vehicleEligibilityService.updateMatrix(
          command,
          {
            actorId: identity?.actorId ?? null,
            actorType: identity?.actorType ?? "system",
            tenantId: identity?.tenantId ?? null,
          },
          requestId,
        ),
      },
      requestId,
    );
  }
}
