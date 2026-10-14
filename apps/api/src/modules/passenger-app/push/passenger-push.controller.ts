import { Body, Controller, Delete, Param, Post } from "@nestjs/common";
import {
  CurrentIdentity,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import { PassengerPushService } from "./passenger-push.service";

@Controller("passenger-app/push-devices")
@RequireRealms("passenger")
export class PassengerPushController {
  constructor(private readonly push: PassengerPushService) {}
  @Post()
  async register(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Body() body: unknown,
  ) {
    return toApiSuccessEnvelope(await this.push.register(identity, body));
  }
  @Delete(":deviceId")
  async unregister(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("deviceId") deviceId: string,
  ) {
    return toApiSuccessEnvelope(await this.push.unregister(identity, deviceId));
  }
}
