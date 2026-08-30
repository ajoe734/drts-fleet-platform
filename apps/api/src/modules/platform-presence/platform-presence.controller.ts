import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type {
  PlatformPresenceSummary,
  SetPlatformOfflineCommand,
  SetPlatformOnlineCommand,
} from "@drts/contracts";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PlatformPresenceService } from "./platform-presence.service";

@Controller("platform-presence")
export class PlatformPresenceController {
  constructor(private readonly service: PlatformPresenceService) {}

  private resolveDriverId(
    identity: BootstrapRequestIdentity | null,
    requestedDriverId?: string,
  ) {
    if (identity?.realm === "driver" || identity?.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (!actorId) {
        throw new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "DRIVER_IDENTITY_REQUIRED",
          "Driver identity actorId is required.",
        );
      }
      const normalizedDriverId = requestedDriverId?.trim();
      if (normalizedDriverId && normalizedDriverId !== actorId) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "DRIVER_IDENTITY_MISMATCH",
          "Driver identity may only access its own platform presence.",
          { actorId, requestedDriverId: normalizedDriverId },
        );
      }
      return actorId;
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

  @Get()
  @RequireRealms("system", "platform", "ops", "driver")
  @RequireScopes("driver:read")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);

    const summary = await this.service.summary(driverId);
    return toApiSuccessEnvelope<PlatformPresenceSummary>(summary, requestId);
  }

  @Post("online")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async setOnline(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: SetPlatformOnlineCommand,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);

    const rec = await this.service.setOnline(
      driverId,
      body.platformCode,
      body.tokenExpiresAt ?? null,
    );
    return toApiSuccessEnvelope(rec, requestId);
  }

  @Post("offline")
  @RequireRealms("system", "driver")
  @RequireScopes("driver:write")
  async setOffline(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: SetPlatformOfflineCommand,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);

    const rec = await this.service.setOffline(driverId, body.platformCode);
    return toApiSuccessEnvelope(rec, requestId);
  }
}
