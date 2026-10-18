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
import { DatabaseService } from "../../../common/db/database.service";
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
import { ReviewSupplyService } from "./review-supply.service";

@Controller("ops/review-demo")
export class ReviewDemoOpsController {
  constructor(private readonly supply: ReviewSupplyService) {}

  @Get("config")
  @RequireRealms("ops", "platform", "system")
  config() {
    return toApiSuccessEnvelope({ enabled: reviewDemoEnabled(process.env) });
  }

  @Post("prepare")
  @RequireRealms("ops", "platform", "system")
  async prepare() {
    if (!reviewDemoEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Rehearsal is not enabled.");
    return toApiSuccessEnvelope(await this.supply.prepare());
  }
}

@Controller("passenger-app/review-demo")
export class ReviewDemoController {
  constructor(
    private readonly otp: PassengerOtpService,
    private readonly sms: ReviewSmsPort,
    private readonly accounts: PassengerAccountService,
    private readonly bookings: PassengerBookingService,
    private readonly charges: PaymentChargeService,
    private readonly database: DatabaseService,
  ) {}

  private enabled() {
    if (!reviewDemoEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Rehearsal is not enabled.");
  }

  @Get("config")
  @OpenRoute()
  config() {
    return toApiSuccessEnvelope({
      enabled: reviewDemoEnabled(process.env),
      opsUrl: process.env.PAX_REVIEW_OPS_URL || "",
    });
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

  @Get("rides/:id/record")
  @RequireRealms("passenger")
  async record(
    @CurrentIdentity() identity: RequestIdentity | null,
    @Param("id") id: string,
  ) {
    this.enabled();
    const { account } = await this.accounts.getMe(identity);
    const ride = await this.bookings.getRide(account.drtsPassengerId, id);
    // Read actual persisted trip/charge facts only, after the ordinary account
    // and booking ownership check. Never manufacture a formal receipt row.
    const trip = await this.database.query<{ record: Record<string, unknown> }>(
      `SELECT record FROM ops.phase1_driver_tasks WHERE order_id=$1 AND status='completed' ORDER BY updated_at DESC LIMIT 1`,
      [id],
    );
    const charge = await this.database.query(
      `SELECT payment_id,status,attempt_count,retry_at,last_error_code FROM passenger.payment_charge_records WHERE order_id=$1 AND drts_passenger_id=$2`,
      [id, account.drtsPassengerId],
    );
    const consent = await this.database.query(
      "SELECT contact_requested,complaint_case_no FROM passenger.rating_consents WHERE order_id=$1 AND drts_passenger_id=$2",
      [id, account.drtsPassengerId],
    );
    const actual = trip.rows[0]?.record;
    return toApiSuccessEnvelope({
      notice: "演練紀錄・非正式憑證。外部資格、圖資、GPS、付款及通知均為模擬。",
      ride,
      trip: actual
        ? {
            taskId: actual.taskId,
            actualDistanceKm: actual.actualDistanceKm,
            actualDurationSec: actual.actualDurationSec,
            startedAt: actual.startedAt,
            completedAt: actual.completedAt,
          }
        : null,
      charge: charge.rows[0] ?? null,
      consent: consent.rows[0] ?? null,
    });
  }
}
