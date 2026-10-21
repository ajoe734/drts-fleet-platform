import { Controller, Get, Headers, Query } from "@nestjs/common";
import type { ReferralMonthlyRatingQuery } from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth/auth.decorators";
import { ReferralMonthlyRatingService } from "./referral-monthly-rating.service";

@Controller()
export class ReferralMonthlyRatingController {
  constructor(private readonly service: ReferralMonthlyRatingService) {}

  @Get("reports/referral-monthly-ratings")
  @RequireRealms("platform", "ops")
  async read(
    @Query() query: ReferralMonthlyRatingQuery,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(await this.service.read(query), requestId);
  }
}
