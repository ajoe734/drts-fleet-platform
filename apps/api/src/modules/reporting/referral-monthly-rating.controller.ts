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
    const mergedQuery = this.mergeGovernanceQuery(query, body);
    return toApiSuccessEnvelope(
      await this.service.evaluateGovernance(mergedQuery, {
        ...(identity !== undefined ? { identity } : {}),
        auditEvaluation: true,
        ...(requestId ? { requestId } : {}),
      }),
      requestId,
    );
  }

  private mergeGovernanceQuery(
    query: Partial<ReferralMonthlyRatingQuery> | undefined,
    body: Partial<ReferralMonthlyRatingQuery> | undefined,
  ): ReferralMonthlyRatingQuery {
    const raw = {
      ...(query ?? {}),
      ...(body ?? {}),
    } as Record<string, unknown>;
    const periodMonth =
      (typeof raw.periodMonth === "string" ? raw.periodMonth : undefined) ??
      (typeof raw.period_month === "string" ? raw.period_month : "");
    const driverId =
      (typeof raw.driverId === "string" ? raw.driverId : undefined) ??
      (typeof raw.driver_id === "string" ? raw.driver_id : undefined);
    const tenantId =
      (typeof raw.tenantId === "string" ? raw.tenantId : undefined) ??
      (typeof raw.tenant_id === "string" ? raw.tenant_id : undefined);
    const partnerId =
      (typeof raw.partnerId === "string" ? raw.partnerId : undefined) ??
      (typeof raw.partner_id === "string" ? raw.partner_id : undefined);
    const partnerProgramId =
      (typeof raw.partnerProgramId === "string"
        ? raw.partnerProgramId
        : undefined) ??
      (typeof raw.partner_program_id === "string"
        ? raw.partner_program_id
        : undefined);
    const entrySlug =
      (typeof raw.entrySlug === "string" ? raw.entrySlug : undefined) ??
      (typeof raw.entry_slug === "string" ? raw.entry_slug : undefined);

    return {
      periodMonth,
      ...(driverId !== undefined ? { driverId } : {}),
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(partnerId !== undefined ? { partnerId } : {}),
      ...(partnerProgramId !== undefined ? { partnerProgramId } : {}),
      ...(entrySlug !== undefined ? { entrySlug } : {}),
    };
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
