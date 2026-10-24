import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import type {
  RecordReferralMonthlyGovernanceOutcomeCommand,
  ReferralMonthlyRatingQuery,
} from "@drts/contracts";
import { toApiSuccessEnvelope } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
} from "../../common/auth/auth.decorators";
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

  @Get("reports/referral-monthly-ratings/governance")
  @RequireRealms("platform", "ops")
  @RequireScopes("reports:read")
  async readGovernance(
    @Query() query: ReferralMonthlyRatingQuery,
    @CurrentIdentity() _identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.readGovernance(query),
      requestId,
    );
  }

  @Post("reports/referral-monthly-ratings/governance/evaluate")
  @RequireRealms("platform", "ops")
  @RequireScopes("reports:write")
  async evaluateGovernance(
    @Body() body: Partial<ReferralMonthlyRatingQuery> | undefined,
    @Query() query: Partial<ReferralMonthlyRatingQuery> | undefined,
    @CurrentIdentity() identity?: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const mergedQuery = {
      ...(query ?? {}),
      ...(body ?? {}),
    } as ReferralMonthlyRatingQuery;
    return toApiSuccessEnvelope(
      await this.service.evaluateGovernance(mergedQuery, {
        identity: identity ?? null,
        auditEvaluation: true,
        ...(requestId ? { requestId } : {}),
      }),
      requestId,
    );
  }

  @Post("reports/referral-monthly-ratings/governance/outcomes")
  @RequireRealms("platform", "ops")
  @RequireScopes("reports:write")
  async recordOutcome(
    @Body() body: RecordReferralMonthlyGovernanceOutcomeCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.recordOutcome(body, identity, requestId),
      requestId,
    );
  }

  @Post("reports/referral-monthly-ratings/governance/records/:recordId/outcome")
  @RequireRealms("platform", "ops")
  @RequireScopes("reports:write")
  async recordOutcomeByRecordId(
    @Param("recordId") recordId: string,
    @Body() body: Omit<RecordReferralMonthlyGovernanceOutcomeCommand, "recordId">,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.service.recordOutcome(
        { ...body, recordId },
        identity,
        requestId,
      ),
      requestId,
    );
  }
}
