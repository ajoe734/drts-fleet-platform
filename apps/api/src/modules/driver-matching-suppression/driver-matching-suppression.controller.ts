import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";

import type {
  ActionReceipt,
  CreateDriverMatchingSuppressionCommand,
  DriverMatchingSuppression,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { DriverMatchingSuppressionService } from "./driver-matching-suppression.service";

@Controller()
export class DriverMatchingSuppressionController {
  constructor(
    private readonly driverMatchingSuppressionService: DriverMatchingSuppressionService,
  ) {}

  @Post("ops/drivers/:driverId/matching-suppression")
  @RequireRealms("ops")
  createSuppression(
    @Param("driverId") driverId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: CreateDriverMatchingSuppressionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope<DriverMatchingSuppression>(
      this.driverMatchingSuppressionService.createSuppression(
        driverId,
        command,
        this.requireOpsIdentity(identity),
        requestId,
      ),
      requestId,
    );
  }

  @Get("driver/matching-suppression")
  @RequireRealms("driver")
  listSuppressions(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.driverMatchingSuppressionService.listForDriver(
          this.requireDriverIdentity(identity),
        ),
      },
      requestId,
    );
  }

  @Post("ops/drivers/:driverId/matching-suppression/:suppressionId/release")
  @RequireRealms("ops")
  releaseSuppression(
    @Param("driverId") driverId: string,
    @Param("suppressionId") suppressionId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope<ActionReceipt>(
      this.driverMatchingSuppressionService.releaseSuppression(
        driverId,
        suppressionId,
        this.requireOpsIdentity(identity),
        requestId,
      ),
      requestId,
    );
  }

  private requireOpsIdentity(identity: BootstrapRequestIdentity | null) {
    if (identity?.actorType === "ops_user" && identity.actorId?.trim()) {
      return {
        actorId: identity.actorId.trim(),
        actorType: "ops_user" as const,
      };
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "MATCHING_SUPPRESSION_OPS_ACTOR_REQUIRED",
      "Driver matching suppression routes require an ops_user identity.",
      {
        actorType: identity?.actorType ?? null,
        actorId: identity?.actorId ?? null,
      },
    );
  }

  private requireDriverIdentity(identity: BootstrapRequestIdentity | null) {
    if (identity?.actorType === "driver_user" && identity.actorId?.trim()) {
      return identity.actorId.trim();
    }

    throw new ApiRequestError(
      HttpStatus.FORBIDDEN,
      "MATCHING_SUPPRESSION_DRIVER_ACTOR_REQUIRED",
      "Driver matching suppression routes require a driver_user identity.",
      {
        actorType: identity?.actorType ?? null,
        actorId: identity?.actorId ?? null,
      },
    );
  }
}
