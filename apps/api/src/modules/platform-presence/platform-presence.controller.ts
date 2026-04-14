import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import type {
  PlatformPresenceSummary,
  SetPlatformOfflineCommand,
  SetPlatformOnlineCommand,
} from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PlatformPresenceService } from "./platform-presence.service";

@Controller("platform-presence")
export class PlatformPresenceController {
  constructor(private readonly service: PlatformPresenceService) {}

  @Get()
  @RequireRealms("driver", "platform", "ops")
  async getSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId =
      identity?.actorType === "driver_user" && identity.actorId
        ? identity.actorId
        : "demo-driver"; // fallback for smoke

    const summary = await this.service.summary(driverId);
    return toApiSuccessEnvelope<PlatformPresenceSummary>(summary, requestId);
  }

  @Post("online")
  @RequireRealms("driver", "platform", "ops")
  async setOnline(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: SetPlatformOnlineCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId =
      identity?.actorType === "driver_user" && identity.actorId
        ? identity.actorId
        : "demo-driver";

    const rec = await this.service.setOnline(
      driverId,
      body.platformCode,
      body.tokenExpiresAt ?? null,
    );
    return toApiSuccessEnvelope(rec, requestId);
  }

  @Post("offline")
  @RequireRealms("driver", "platform", "ops")
  async setOffline(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: SetPlatformOfflineCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId =
      identity?.actorType === "driver_user" && identity.actorId
        ? identity.actorId
        : "demo-driver";

    const rec = await this.service.setOffline(driverId, body.platformCode);
    return toApiSuccessEnvelope(rec, requestId);
  }
}
