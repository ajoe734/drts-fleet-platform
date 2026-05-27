import { Controller, Get, Headers, HttpStatus, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type {
  DriverPlatformPresenceSummary,
  DriverWorkspaceSummary,
} from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { DriverAppSummaryService } from "./driver-app-summary.service";

@Controller("driver")
export class DriverAppSummaryController {
  constructor(private readonly summaryService: DriverAppSummaryService) {}

  private resolveDriverId(
    identity: BootstrapRequestIdentity | null,
    requestedDriverId?: string,
  ) {
    if (identity?.actorType === "driver_user" && identity.actorId) {
      return identity.actorId;
    }

    const normalizedDriverId = requestedDriverId?.trim();
    if (normalizedDriverId) {
      return normalizedDriverId;
    }

    throw new ApiRequestError(
      HttpStatus.BAD_REQUEST,
      "DRIVER_ID_REQUIRED",
      "driverId query is required when the caller is not a driver bootstrap identity.",
    );
  }

  @Get("workspace/summary")
  @RequireRealms("driver", "platform", "ops")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getWorkspaceSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);
    const summary = await this.summaryService.getWorkspaceSummary(driverId);
    return toApiSuccessEnvelope<DriverWorkspaceSummary>(summary, requestId);
  }

  @Get("platform-presence/summary")
  @RequireRealms("driver", "platform", "ops")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getPlatformPresenceSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);
    const summary =
      await this.summaryService.getPlatformPresenceSummary(driverId);
    return toApiSuccessEnvelope<DriverPlatformPresenceSummary>(
      summary,
      requestId,
    );
  }
}
