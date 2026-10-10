import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerFareService } from "./passenger-fare.service";

@Controller("passenger-app")
@RequireRealms("passenger")
export class PassengerFareController {
  constructor(private readonly faresService: PassengerFareService) {}

  @Get("fares")
  @OpenRoute()
  async fares(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(await this.faresService.fares(), requestId);
  }

  @Post("quotes")
  async quote(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Body() body: unknown,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.faresService.quote(identity, body, requestId),
      requestId,
    );
  }
}
