import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../../common/api-envelope";
import {
  CurrentIdentity,
  OpenRoute,
  RequireRealms,
} from "../../../common/auth/auth.decorators";
import type { RequestIdentity } from "../../../common/auth/auth.types";
import { PassengerAccountService } from "../account/passenger-account.service";
import { PassengerBookingService } from "../booking/passenger-booking.service";
import { PassengerOtpService } from "../otp/passenger-otp.service";
import {
  otpClientIp,
  type OtpHttpRequest,
} from "../otp/passenger-otp.controller";
import { PaymentChargeService } from "../payment/payment-charge.service";
import { reviewDemoEnabled } from "./review-demo.config";
import { ReviewSmsPort } from "./review-sms.port";

@Controller("passenger-app/review-demo")
export class ReviewDemoController {
  constructor(
    private readonly otp: PassengerOtpService,
    private readonly sms: ReviewSmsPort,
    private readonly accounts: PassengerAccountService,
    private readonly bookings: PassengerBookingService,
    private readonly charges: PaymentChargeService,
  ) {}

  private enabled() {
    if (!reviewDemoEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Rehearsal is not enabled.");
  }

  @Get("config")
  @OpenRoute()
  config() {
    return toApiSuccessEnvelope({ enabled: reviewDemoEnabled(process.env) });
  }

  @Post("otp")
  @OpenRoute()
  async requestOtp(@Body() body: unknown, @Req() request: OtpHttpRequest) {
    this.enabled();
    const target = (body as { target?: unknown } | null)?.target;
    if (
      typeof target !== "string" ||
      !/^09000000[0-9]{2}$/.test(target) ||
      Object.keys(body as object).some((key) => key !== "target")
    )
      throw new ApiRequestError(
        400,
        "validation_error",
        "Choose a rehearsal phone.",
      );
    // Use the ordinary OTP entry, not an account/session shortcut.
    const result = await this.otp.request(
      { provider: "phone", purpose: "login", target },
      null,
      otpClientIp(
        request,
        Number(process.env.PASSENGER_OTP_TRUSTED_PROXY_HOPS ?? 0),
      ),
    );
    return toApiSuccessEnvelope({
      ...result,
      code: this.sms.collect(`+886${target.slice(1)}`),
      simulatedDelivery: true,
    });
  }

  @Post("rides/:id/retry-payment")
  @RequireRealms("passenger")
  async retryPayment(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") id: string,
  ) {
    this.enabled();
    const { account } = await this.accounts.getMe(identity);
    // The normal read checks durable ownership before the existing executor.
    await this.bookings.getRide(account.drtsPassengerId, id);
    await this.charges.processOrder(id);
    return toApiSuccessEnvelope(
      await this.bookings.getRide(account.drtsPassengerId, id),
    );
  }
}
