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
  UpdateFleetPartnerCommand,
  UpdateFleetPartnerRevenueShareRuleCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { SupplyDocumentService } from "./supply-document.service";
import { SupplyReadinessService } from "./supply-readiness.service";
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
import { FleetPartnerService } from "./fleet-partner.service";

@Controller()
export class FleetPartnerController {
  constructor(
    private readonly fleetPartnerService: FleetPartnerService,
    private readonly supplySubmissionService: SupplySubmissionService,
    private readonly supplyDocumentService: SupplyDocumentService,
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

  @Get("fleet-partner/supply-submissions")
  listSupplySubmissions(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Query() filters: SupplySubmissionFilters = {},
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        this.supplySubmissionService.listSupplySubmissions(
          this.requireFleetPartnerId(fleetPartnerId),
          filters,
        ),
      ),
      requestId,
    );
  }

  @Get("fleet-partner/supply-submissions/:submissionId")
  getSupplySubmissionDetail(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.supplySubmissionService.getSupplySubmissionDetail(
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
  createSupplyDocumentUploadUrl(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-actor-id") actorId: string | undefined,
    @Param("submissionId") submissionId: string,
    @Body() command: CreateSupplyDocumentUploadUrlCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.supplyDocumentService.createUploadUrl(
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

  @Delete("fleet-partner/supply-submissions/:submissionId/documents/:documentId")
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
  listSupplyReadiness(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      {
        items: this.supplyReadinessService.listReadiness(
          this.requireFleetPartnerId(fleetPartnerId),
        ),
      },
      requestId,
    );
  }

  @Get("fleet-partner/readiness/drivers/:driverId")
  getDriverSupplyReadiness(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Param("driverId") driverId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const readiness = this.supplyReadinessService.getDriverReadiness(
      this.requireFleetPartnerId(fleetPartnerId),
      driverId,
    );
    if (!readiness) {
      throw new ApiRequestError(
        404,
        "NOT_FOUND",
        "The driver readiness record could not be found.",
        { driverId },
      );
    }
    return toApiSuccessEnvelope(
      readiness,
      requestId,
    );
  }

  @Get("fleet-partner/readiness/vehicles/:vehicleId")
  getVehicleSupplyReadiness(
    @Headers("x-fleet-partner-id") fleetPartnerId: string | undefined,
    @Param("vehicleId") vehicleId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const readiness = this.supplyReadinessService.getVehicleReadiness(
      this.requireFleetPartnerId(fleetPartnerId),
      vehicleId,
    );
    if (!readiness) {
      throw new ApiRequestError(
        404,
        "NOT_FOUND",
        "The vehicle readiness record could not be found.",
        { vehicleId },
      );
    }
    return toApiSuccessEnvelope(
      readiness,
      requestId,
    );
  }
}
