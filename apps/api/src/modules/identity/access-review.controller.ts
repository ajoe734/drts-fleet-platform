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
  CreateAccessReviewCampaignCommand,
  IamAccessReviewDecisionCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { CurrentIdentity } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { AccessReviewService } from "./access-review.service";

function cleanQuery<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as T;
}

@Controller()
export class AccessReviewController {
  constructor(private readonly accessReviewService: AccessReviewService) {}

  @Get("platform-admin/access-reviews")
  async listPlatformAccessReviews(
    @Query("realm") realm?: string,
    @Query("tenantId") tenantId?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const campaigns = await this.accessReviewService.listCampaigns(
      cleanQuery({
        realm,
        tenantId,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
      identity as any,
    );
    return toApiSuccessEnvelope({ campaigns }, requestId);
  }

  @Post("platform-admin/access-reviews/campaigns")
  async createPlatformCampaign(
    @Body() command: CreateAccessReviewCampaignCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.accessReviewService.createCampaign(
      command,
      identity as any,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Get("platform-admin/access-reviews/campaigns/:id")
  async getPlatformCampaignDetail(
    @Param("id") campaignId: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const detail = await this.accessReviewService.getCampaign(
      campaignId,
      identity as any,
    );
    return toApiSuccessEnvelope(detail, requestId);
  }

  @Post("platform-admin/access-reviews/:reviewId/decision")
  async decidePlatformReview(
    @Param("reviewId") reviewId: string,
    @Body() command: IamAccessReviewDecisionCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.accessReviewService.decideReviewItem(
      reviewId,
      { ...command, reviewId },
      identity as any,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("platform-admin/access-reviews/overdue-sweep")
  async triggerOverdueSweep(@Headers("x-request-id") requestId?: string) {
    const summary = await this.accessReviewService.evaluateOverdueCampaigns();
    return toApiSuccessEnvelope(summary, requestId);
  }

  @Get("platform-admin/access-reviews/evidence")
  async queryPlatformEvidence(
    @Query("campaignId") campaignId?: string,
    @Query("reviewId") reviewId?: string,
    @Query("actorPrincipalId") actorPrincipalId?: string,
    @Query("targetPrincipalId") targetPrincipalId?: string,
    @Query("tenantId") tenantId?: string,
    @Query("decision") decision?: string,
    @Query("limit") limit?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const evidence = await this.accessReviewService.listEvidence(
      cleanQuery({
        campaignId,
        reviewId,
        actorPrincipalId,
        targetPrincipalId,
        tenantId,
        decision,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
      identity as any,
    );
    return toApiSuccessEnvelope({ evidence }, requestId);
  }

  @Get("identity/access-reviews")
  async listTenantAccessReviews(
    @Query("realm") realm?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const campaigns = await this.accessReviewService.listCampaigns(
      cleanQuery({
        realm,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
      identity as any,
    );
    return toApiSuccessEnvelope({ campaigns }, requestId);
  }

  @Post("identity/access-reviews")
  async createTenantCampaign(
    @Body() command: CreateAccessReviewCampaignCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.accessReviewService.createCampaign(
      command,
      identity as any,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Post("identity/access-reviews/:reviewId/decision")
  async decideTenantReview(
    @Param("reviewId") reviewId: string,
    @Body() command: IamAccessReviewDecisionCommand,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const result = await this.accessReviewService.decideReviewItem(
      reviewId,
      { ...command, reviewId },
      identity as any,
    );
    return toApiSuccessEnvelope(result, requestId);
  }

  @Get("identity/access-reviews/evidence")
  async queryTenantEvidence(
    @Query("campaignId") campaignId?: string,
    @Query("reviewId") reviewId?: string,
    @Query("decision") decision?: string,
    @Query("limit") limit?: string,
    @CurrentIdentity() identity?: BootstrapRequestIdentity,
    @Headers("x-request-id") requestId?: string,
  ) {
    const evidence = await this.accessReviewService.listEvidence(
      cleanQuery({
        campaignId,
        reviewId,
        decision,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
      identity as any,
    );
    return toApiSuccessEnvelope({ evidence }, requestId);
  }
}
