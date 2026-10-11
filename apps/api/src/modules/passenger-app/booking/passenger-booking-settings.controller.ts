import { Controller, Get, Headers } from "@nestjs/common";
import { OpenRoute, RequireRealms } from "../../../common/auth/auth.decorators";
import { toApiSuccessEnvelope } from "../../../common/api-envelope";
import { PassengerBookingService } from "./passenger-booking.service";

@Controller("passenger-app")
@RequireRealms("passenger")
export class PassengerBookingSettingsController {
  constructor(private readonly service: PassengerBookingService) {}

  @Get("booking-settings")
  @OpenRoute()
  getSettings(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(this.service.getBookingSettings(), requestId);
  }
}
