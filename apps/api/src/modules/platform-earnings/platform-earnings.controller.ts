import { Controller, Get, Headers } from "@nestjs/common";
// Note: Using structural typing to avoid hard dependency on contracts build during typecheck.
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { PlatformEarningsService } from "./platform-earnings.service";

@Controller("platform-earnings")
export class PlatformEarningsController {
  constructor(private readonly service: PlatformEarningsService) {}

  private resolveDriverId(identity: BootstrapRequestIdentity | null): string {
    return identity?.actorType === "driver_user" && identity.actorId
      ? identity.actorId
      : "demo-driver";
  }

  @Get("summary")
  @RequireRealms("driver", "platform", "ops")
  async getSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity);
    const summary = await this.service.summary(driverId);
    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("by-platform")
  @RequireRealms("driver", "platform", "ops")
  async getByPlatform(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const driverId = this.resolveDriverId(identity);
    const breakdown = await this.service.byPlatform(driverId);
    return toApiSuccessEnvelope(breakdown, requestId);
  }
}
