import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import type {
  AddSupplyDocumentCommand,
  CreateDriverFleetAffiliationCommand,
  CreateFleetPartnerCommand,
  CreateFleetPartnerRevenueShareRuleCommand,
  CreateSupplySubmissionCommand,
  SupplyReviewActionCommand,
  SupplySubmissionLifecycleCommand,
  UpdateFleetPartnerCommand,
  UpdateFleetPartnerRevenueShareRuleCommand,
  UpsertDriverSupplyDraftCommand,
  UpsertVehicleSupplyDraftCommand,
} from "@drts/contracts";

import type { BootstrapRequestIdentity } from "../../common/auth";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { FleetPartnerService } from "./fleet-partner.service";
import { SupplyDocumentService } from "./supply-document.service";
import { SupplyReadinessService } from "./supply-readiness.service";
import { SupplyReviewService } from "./supply-review.service";
import { SupplySubmissionService } from "./supply-submission.service";

@Controller()
export class FleetPartnerController {
  constructor(
    private readonly fleetPartnerService: FleetPartnerService,
    private readonly supplyReviewService: SupplyReviewService,
    private readonly supplyReadinessService: SupplyReadinessService,
    private readonly supplySubmissionService: SupplySubmissionService,
    private readonly supplyDocumentService: SupplyDocumentService,
  ) {}

  private requireFleetPartnerId(fleetPartnerId?: string) {
    const normalizedFleetPartnerId = fleetPartnerId?.trim();
    if (!normalizedFleetPartnerId) {
      throw new ApiRequestError(
        400,
        "FLEET_PARTNER_ID_REQUIRED",
        "x-fleet-partner-id header is required for fleet partner portal endpoints.",
      );
    }

    return normalizedFleetPartnerId;
  }

  private requireReviewerActorId(identity: BootstrapRequestIdentity | null) {
    const actorId = identity?.actorId?.trim();
    if (!actorId) {
      throw new ApiRequestError(
        400,
        "ACTOR_ID_REQUIRED",
        "x-actor-id header is required for supply review endpoints.",
      );
    }

    return actorId;
  }

  @Get("admin/fleet-partners")
  listFleetPartners(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.fleetPartnerService.listFleetPartners()),
      requestId,
    );
  }

  @Get("admin/supply-review/submissions")
  @RequireRealms("platform", "ops")
  async listSupplyReviewSubmissions(
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(await this.supplyReviewService.listSubmissions()),
      requestId,
    );
  }

  @Get("admin/supply-review/submissions/:submissionId")
  @RequireRealms("platform", "ops")
  async getSupplyReviewSubmission(
    @Param("submissionId") submissionId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReviewService.getSubmission(submissionId),
      requestId,
    );
  }

  @Post("admin/supply-review/submissions/:submissionId/start")
  @RequireRealms("platform", "ops")
  async startSupplyReview(
    @Param("submissionId") submissionId: string,
    @Body() command: SupplyReviewActionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReviewService.startSubmissionReview(
        submissionId,
        command,
        this.requireReviewerActorId(identity),
      ),
      requestId,
    );
  }

  @Post("admin/supply-review/submissions/:submissionId/request-revision")
  @RequireRealms("platform", "ops")
  async requestSupplyRevision(
    @Param("submissionId") submissionId: string,
    @Body() command: SupplyReviewActionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReviewService.requestRevision(
        submissionId,
        command,
        this.requireReviewerActorId(identity),
      ),
      requestId,
    );
  }

  @Post("admin/supply-review/submissions/:submissionId/approve")
  @RequireRealms("platform", "ops")
  async approveSupplySubmission(
    @Param("submissionId") submissionId: string,
    @Body() command: SupplyReviewActionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReviewService.approveSubmission(
        submissionId,
        command,
        this.requireReviewerActorId(identity),
      ),
      requestId,
    );
  }

  @Post("admin/supply-review/submissions/:submissionId/reject")
  @RequireRealms("platform", "ops")
  async rejectSupplySubmission(
    @Param("submissionId") submissionId: string,
    @Body() command: SupplyReviewActionCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReviewService.rejectSubmission(
        submissionId,
        command,
        this.requireReviewerActorId(identity),
      ),
      requestId,
    );
  }

  @Post("admin/fleet-partners")
  createFleetPartner(
    @Body() command: CreateFleetPartnerCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.createFleetPartner(command),
      requestId,
    );
  }

  @Get("admin/fleet-partners/:fleetPartnerId")
  getFleetPartner(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.getFleetPartner(fleetPartnerId),
      requestId,
    );
  }

  @Put("admin/fleet-partners/:fleetPartnerId")
  updateFleetPartner(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Body() command: UpdateFleetPartnerCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.updateFleetPartner(fleetPartnerId, command),
      requestId,
    );
  }

  @Get("admin/fleet-partners/:fleetPartnerId/drivers")
  listFleetPartnerDrivers(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        this.fleetPartnerService.listFleetPartnerDrivers(fleetPartnerId),
      ),
      requestId,
    );
  }

  @Post("admin/drivers/:driverId/fleet-affiliations")
  createDriverFleetAffiliation(
    @Param("driverId") driverId: string,
    @Body() command: CreateDriverFleetAffiliationCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.createDriverFleetAffiliation(driverId, command),
      requestId,
    );
  }

  @Get("admin/fleet-partners/:fleetPartnerId/revenue-share-rules")
  listRevenueShareRules(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        this.fleetPartnerService.listRevenueShareRules(fleetPartnerId),
      ),
      requestId,
    );
  }

  @Post("admin/fleet-partners/:fleetPartnerId/revenue-share-rules")
  createRevenueShareRule(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Body() command: CreateFleetPartnerRevenueShareRuleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.createRevenueShareRule(fleetPartnerId, command),
      requestId,
    );
  }

  @Get("admin/fleet-partners/:fleetPartnerId/revenue-share-rules/:ruleId")
  getRevenueShareRule(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Param("ruleId") ruleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.getRevenueShareRule(fleetPartnerId, ruleId),
      requestId,
    );
  }

  @Put("admin/fleet-partners/:fleetPartnerId/revenue-share-rules/:ruleId")
  updateRevenueShareRule(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Param("ruleId") ruleId: string,
    @Body() command: UpdateFleetPartnerRevenueShareRuleCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.fleetPartnerService.updateRevenueShareRule(
        fleetPartnerId,
        ruleId,
        command,
      ),
      requestId,
    );
  }

  @Delete("admin/fleet-partners/:fleetPartnerId/revenue-share-rules/:ruleId")
  async deleteRevenueShareRule(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Param("ruleId") ruleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    await this.fleetPartnerService.deleteRevenueShareRule(
      fleetPartnerId,
      ruleId,
    );
    return toApiSuccessEnvelope({ deleted: true }, requestId);
  }

  @Get("admin/fleet-partners/:fleetPartnerId/statements")
  async listAdminFleetPartnerStatements(
    @Param("fleetPartnerId") fleetPartnerId: string,
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.fleetPartnerService.listFleetPartnerStatements(
      fleetPartnerId,
      periodMonth,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("fleet-partner/statements")
  async listPortalFleetPartnerStatements(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.fleetPartnerService.listFleetPartnerStatements(
      this.requireFleetPartnerId(fleetPartnerId),
      periodMonth,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("fleet-partner/dashboard")
  async getPortalDashboard(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.fleetPartnerService.getPortalDashboard(
        this.requireFleetPartnerId(fleetPartnerId),
        periodMonth,
      ),
      requestId,
    );
  }

  @Get("fleet-partner/drivers")
  listPortalDrivers(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        this.fleetPartnerService.listPortalDrivers(
          this.requireFleetPartnerId(fleetPartnerId),
        ),
      ),
      requestId,
    );
  }

  @Get("fleet-partner/vehicles")
  listPortalVehicles(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        this.fleetPartnerService.listPortalVehicles(
          this.requireFleetPartnerId(fleetPartnerId),
        ),
      ),
      requestId,
    );
  }

  @Get("fleet-partner/readiness")
  async listPortalReadiness(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        await this.supplyReadinessService.listFleetPartnerReadiness(
          this.requireFleetPartnerId(fleetPartnerId),
        ),
      ),
      requestId,
    );
  }

  @Get("fleet-partner/readiness/drivers/:driverId")
  async getPortalDriverReadiness(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Param("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReadinessService.getDriverReadiness(
        this.requireFleetPartnerId(fleetPartnerId),
        driverId,
      ),
      requestId,
    );
  }

  @Get("fleet-partner/readiness/vehicles/:vehicleId")
  async getPortalVehicleReadiness(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyReadinessService.getVehicleReadiness(
        this.requireFleetPartnerId(fleetPartnerId),
        vehicleId,
      ),
      requestId,
    );
  }

  @Get("fleet-partner/supply-submissions")
  @RequireRealms("partner")
  async listSupplySubmissions(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        await this.supplySubmissionService.listSubmissions(
          this.requireFleetPartnerId(fleetPartnerId),
        ),
      ),
      requestId,
    );
  }

  @Get("fleet-partner/supply-submissions/:submissionId")
  @RequireRealms("partner")
  async getSupplySubmission(
    @Param("submissionId") submissionId: string,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.getSubmission(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions")
  @RequireRealms("partner")
  async createSupplySubmission(
    @Body() command: CreateSupplySubmissionCommand,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.createSubmission(
        this.requireFleetPartnerId(fleetPartnerId),
        command,
      ),
      requestId,
    );
  }

  @Put("fleet-partner/supply-submissions/:submissionId/driver-draft")
  @RequireRealms("partner")
  async upsertDriverSupplyDraft(
    @Param("submissionId") submissionId: string,
    @Body() command: UpsertDriverSupplyDraftCommand,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.upsertDriverDraft(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        command,
      ),
      requestId,
    );
  }

  @Put("fleet-partner/supply-submissions/:submissionId/vehicle-draft")
  @RequireRealms("partner")
  async upsertVehicleSupplyDraft(
    @Param("submissionId") submissionId: string,
    @Body() command: UpsertVehicleSupplyDraftCommand,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.upsertVehicleDraft(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        command,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/documents")
  @RequireRealms("partner")
  async addSupplyDocument(
    @Param("submissionId") submissionId: string,
    @Body() command: AddSupplyDocumentCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyDocumentService.addDocument(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.requireReviewerActorId(identity),
        command,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/submit")
  @RequireRealms("partner")
  async submitSupplySubmission(
    @Param("submissionId") submissionId: string,
    @Body() command: SupplySubmissionLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.submitSubmission(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.requireReviewerActorId(identity),
        command,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/withdraw")
  @RequireRealms("partner")
  async withdrawSupplySubmission(
    @Param("submissionId") submissionId: string,
    @Body() command: SupplySubmissionLifecycleCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.withdrawSubmission(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.requireReviewerActorId(identity),
        command,
      ),
      requestId,
    );
  }

  @Get("fleet-partner/trips")
  async listPortalTrips(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        await this.fleetPartnerService.listPortalTrips(
          this.requireFleetPartnerId(fleetPartnerId),
          periodMonth,
        ),
      ),
      requestId,
    );
  }

  @Get("fleet-partner/quality-metrics")
  async getPortalQualityMetrics(
    @Headers("x-fleet-partner-id") fleetPartnerId?: string,
    @Query("periodMonth") periodMonth?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.fleetPartnerService.getPortalQualityMetrics(
        this.requireFleetPartnerId(fleetPartnerId),
        periodMonth,
      ),
      requestId,
    );
  }
}
