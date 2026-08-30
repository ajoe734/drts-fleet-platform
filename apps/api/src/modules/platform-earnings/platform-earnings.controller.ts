import { Controller, Get, Headers, HttpStatus, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  isDriverIdentityMatching,
  normalizeDriverId,
} from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import { PlatformEarningsService } from "./platform-earnings.service";

@RequireRealms("system", "platform", "ops", "driver")
@Controller("platform-earnings")
export class PlatformEarningsController {
  constructor(private readonly service: PlatformEarningsService) {}

  private resolveDriverId(
    identity: BootstrapRequestIdentity | null,
    requestedDriverId?: string,
  ): string {
    if (!identity) {
      throw new ApiRequestError(
        HttpStatus.UNAUTHORIZED,
        "AUTH_REQUIRED",
        "Authenticated identity is required.",
      );
    }
    const normalized = requestedDriverId?.trim();
    if (identity.realm === "driver" || identity.actorType === "driver_user") {
      const actorId = identity.actorId;
      if (!actorId) {
        throw new ApiRequestError(
          HttpStatus.UNAUTHORIZED,
          "DRIVER_IDENTITY_REQUIRED",
          "Driver identity actorId is required.",
        );
      }
      if (normalized && !isDriverIdentityMatching(actorId, normalized)) {
        throw new ApiRequestError(
          HttpStatus.FORBIDDEN,
          "DRIVER_IDENTITY_MISMATCH",
          "Driver identity may only view its own platform earnings.",
          { actorId, requestedDriverId: normalized },
        );
      }
      return normalizeDriverId(actorId)!;
    }

    if (normalized) {
      return normalized;
    }

    return identity.actorId || "demo-driver";
  }

  @Get("summary")
  @RequireScopes("driver:read")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);
    const summary = await this.service.summary(driverId);
    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("by-platform")
  @RequireScopes("driver:read")
  @Throttle(READ_HEAVY_RATE_LIMIT)
  async getByPlatform(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query("driverId") requestedDriverId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity, requestedDriverId);
    const breakdown = await this.service.byPlatform(driverId);
    return toApiSuccessEnvelope(breakdown, requestId);
  }
}
