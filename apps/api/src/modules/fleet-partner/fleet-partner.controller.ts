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
  CreateDriverFleetAffiliationCommand,
  CreateFleetPartnerCommand,
  CreateFleetPartnerRevenueShareRuleCommand,
  SupplyReviewActionCommand,
  UpdateFleetPartnerCommand,
  UpdateFleetPartnerRevenueShareRuleCommand,
} from "@drts/contracts";

import {
  CurrentIdentity,
  RequireRealms,
} from "../../common/auth/auth.decorators";
import type { BootstrapRequestIdentity } from "../../common/auth/auth.types";
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
import type {
  ConfirmSupplyDocumentUploadCommand,
  CreateDriverSupplySubmissionCommand,
  CreateSupplyDocumentUploadUrlCommand,
  CreateVehicleSupplySubmissionCommand,
  DeleteSupplyDocumentCommand,
  SubmitSupplySubmissionCommand,
  SupplySubmissionFilters,
  UpdateDriverSupplySubmissionCommand,
  UpdateVehicleSupplySubmissionCommand,
  WithdrawSupplySubmissionCommand,
} from "./supply-submission.types";

@Controller()
export class FleetPartnerController {
  constructor(
    private readonly fleetPartnerService: FleetPartnerService,
    private readonly supplySubmissionService: SupplySubmissionService,
    private readonly supplyDocumentService: SupplyDocumentService,
    private readonly supplyReviewService: SupplyReviewService,
    private readonly supplyReadinessService: SupplyReadinessService,
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

  private actorId(actorId?: string) {
    return actorId?.trim() || "fleet-partner-portal";
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

  @Get("fleet-partner/supply-submissions")
  async listSupplySubmissions(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Query() filters: SupplySubmissionFilters = {},
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = await this.supplySubmissionService.listSupplySubmissions(
      this.requireFleetPartnerId(fleetPartnerId),
      filters,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("fleet-partner/supply-submissions/:submissionId")
  async getSupplySubmissionDetail(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.getSupplySubmissionDetail(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/drivers")
  async createDriverSupplySubmission(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Body() command: CreateDriverSupplySubmissionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.createDriverDraft(
        this.requireFleetPartnerId(fleetPartnerId),
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Put("fleet-partner/supply-submissions/:submissionId/driver")
  async updateDriverSupplySubmission(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: UpdateDriverSupplySubmissionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.updateDriverDraft(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/vehicles")
  async createVehicleSupplySubmission(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Body() command: CreateVehicleSupplySubmissionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.createVehicleDraft(
        this.requireFleetPartnerId(fleetPartnerId),
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Put("fleet-partner/supply-submissions/:submissionId/vehicle")
  async updateVehicleSupplySubmission(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: UpdateVehicleSupplySubmissionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.updateVehicleDraft(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/documents/upload-url")
  async createSupplyDocumentUploadUrl(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: CreateSupplyDocumentUploadUrlCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyDocumentService.createUploadUrl(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/documents/confirm")
  async confirmSupplyDocumentUpload(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: ConfirmSupplyDocumentUploadCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyDocumentService.confirmUpload(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Delete(
    "fleet-partner/supply-submissions/:submissionId/documents/:documentId",
  )
  async deleteSupplyDocument(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Param("documentId") documentId: string,
    @Body() command: DeleteSupplyDocumentCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplyDocumentService.deleteDocument(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        documentId,
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/submit")
  async submitSupplySubmission(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: SubmitSupplySubmissionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.submitSupplySubmission(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.actorId(actorId),
        command,
        requestId,
      ),
      requestId,
    );
  }

  @Post("fleet-partner/supply-submissions/:submissionId/withdraw")
  async withdrawSupplySubmission(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: WithdrawSupplySubmissionCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.supplySubmissionService.withdrawSupplySubmission(
        this.requireFleetPartnerId(fleetPartnerId),
        submissionId,
        this.actorId(actorId),
        command,
        requestId,
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
