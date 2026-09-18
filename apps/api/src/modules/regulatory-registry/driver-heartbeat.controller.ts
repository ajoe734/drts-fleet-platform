import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";

import type { DriverLocationHeartbeatBatchRequest } from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  isDriverIdentityMatching,
  normalizeDriverId,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { RegulatoryRegistryService } from "./regulatory-registry.service";

@Controller("driver")
export class DriverHeartbeatController {
  constructor(
    private readonly regulatoryRegistryService: RegulatoryRegistryService,
  ) {}

  @Post("location-heartbeats/batch")
  @RequireRealms("system", "driver")
  async recordHeartbeatBatch(
    @Body() request: DriverLocationHeartbeatBatchRequest,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (actorId && Array.isArray(request?.items)) {
        for (const item of request.items) {
          if (item?.driverId && !isDriverIdentityMatching(actorId, item.driverId)) {
            throw new ApiRequestError(
              HttpStatus.FORBIDDEN,
              "DRIVER_IDENTITY_MISMATCH",
              "Driver identity may only submit location heartbeats for itself.",
              { actorId, itemDriverId: item.driverId },
            );
          }
        }
      }
    }

    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.recordDriverLocationBatch(request),
      requestId,
    );
  }

  @Get("tracking-status")
  @RequireRealms("system", "platform", "ops", "driver")
  async getTrackingStatus(
    @Query("driverId") requestedDriverId?: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null = null,
    @Headers("x-request-id") requestId?: string,
  ) {
    let effectiveDriverId = requestedDriverId?.trim();
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (
        effectiveDriverId &&
        actorId &&
        !isDriverIdentityMatching(actorId, effectiveDriverId)
      ) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "DRIVER_IDENTITY_MISMATCH",
          "Driver identity may only view its own tracking status.",
          { actorId, requestedDriverId: effectiveDriverId },
        );
      }
      effectiveDriverId = normalizeDriverId(actorId) ?? effectiveDriverId;
    }

    return toApiSuccessEnvelope(
      await this.regulatoryRegistryService.getDriverTrackingStatus(
        effectiveDriverId ?? "",
      ),
      requestId,
    );
  }
}
