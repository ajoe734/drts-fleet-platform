import { Controller, Get, Headers, HttpStatus, Query } from "@nestjs/common";
import type { ServiceProductType } from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { VehicleEligibilityService } from "./vehicle-eligibility.service";

@Controller()
export class VehicleEligibilityController {
  constructor(
    private readonly vehicleEligibilityService: VehicleEligibilityService,
  ) {}

  @Get("ops/dispatch/eligible-supply")
  listEligibleSupply(
    @Query("serviceProduct") serviceProduct?: ServiceProductType,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (!serviceProduct?.trim()) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "SERVICE_PRODUCT_REQUIRED",
        "serviceProduct query is required.",
      );
    }

    return toApiSuccessEnvelope(
      {
        items: this.vehicleEligibilityService.listEligibleSupply(serviceProduct),
      },
      requestId,
    );
  }

  @Get("driver/eligible-products")
  listDriverEligibleProducts(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId =
      identity?.actorType === "driver_user" && identity.actorId
        ? identity.actorId
        : requestedDriverId?.trim();

    if (!driverId) {
      throw new ApiRequestError(
        HttpStatus.BAD_REQUEST,
        "DRIVER_ID_REQUIRED",
        "driverId query is required when the caller is not a driver bootstrap identity.",
      );
    }

    return toApiSuccessEnvelope(
      {
        items: this.vehicleEligibilityService.listDriverEligibleProducts(
          driverId,
        ),
      },
      requestId,
    );
  }
}
