import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Optional,
} from "@nestjs/common";

import type {
  ApproveRegulatoryNotificationCommand,
  AcknowledgeRegulatoryNotificationCommand,
  CreateRegulatoryReportJobCommand,
  CreateRegulatoryNotificationCommand,
  GenerateResumeAuthorizationDossierCommand,
  SubmitRegulatoryNotificationCommand,
  SubmitRegulatoryNotificationReviewCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { RegulatoryReportJobsService } from "./regulatory-report-jobs.service";
import { RegulatoryReportingService } from "./regulatory-reporting.service";

@Controller("regulatory")
@RequireRealms("platform", "ops")
export class RegulatoryReportingController {
  constructor(
    private readonly regulatoryReportingService: RegulatoryReportingService,
    @Optional()
    private readonly regulatoryReportJobsService?: RegulatoryReportJobsService,
  ) {}

  private requireRegulatoryReportJobsService() {
    if (!this.regulatoryReportJobsService) {
      throw new ApiRequestError(
        503,
        "REGULATORY_REPORTING_SERVICE_UNAVAILABLE",
        "Regulatory report job service is not wired.",
      );
    }
    return this.regulatoryReportJobsService;
  }

  @Get("notifications")
  listNotifications(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      toApiListData(this.regulatoryReportingService.listNotifications()),
      requestId,
    );
  }

  @Get("notifications/:notificationId")
  getNotification(
    @Param("notificationId") notificationId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.getNotification(notificationId),
      requestId,
    );
  }

  @Post("notifications")
  createNotification(
    @Body() command: CreateRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.createNotification(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/submit-review")
  submitReview(
    @Param("notificationId") notificationId: string,
    @Body() command: SubmitRegulatoryNotificationReviewCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.submitReview(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/approve")
  approveReview(
    @Param("notificationId") notificationId: string,
    @Body() command: ApproveRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.approveReview(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/submit")
  submitNotification(
    @Param("notificationId") notificationId: string,
    @Body() command: SubmitRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.submitNotification(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("notifications/:notificationId/acknowledge")
  acknowledgeNotification(
    @Param("notificationId") notificationId: string,
    @Body() command: AcknowledgeRegulatoryNotificationCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.regulatoryReportingService.acknowledgeNotification(
        notificationId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("reports/jobs")
  createReportJob(
    @Body() command: CreateRegulatoryReportJobCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.requireRegulatoryReportJobsService().createReportJob(
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("reports/jobs")
  listReportJobs(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      toApiListData(
        this.requireRegulatoryReportJobsService().listReportJobs(
          requestId,
          identity,
        ),
      ),
      requestId,
    );
  }

  @Get("reports/jobs/:jobId")
  getReportJob(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.requireRegulatoryReportJobsService().getReportJob(
        jobId,
        requestId,
        identity,
      ),
      requestId,
    );
  }

  @Get("experiments/:experimentId/compliance-summary")
  getComplianceSummary(
    @Param("experimentId") experimentId: string,
    @Query("asOf") asOf: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.requireRegulatoryReportJobsService().generateComplianceSummary(
        experimentId,
        asOf,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("experiments/:experimentId/kpi-dashboard")
  async getKpiDashboard(
    @Param("experimentId") experimentId: string,
    @Query("asOf") asOf: string | undefined,
    @Query("baselineWindowDays") baselineWindowDays: string | undefined,
    @Query("baselineWindowTrips") baselineWindowTrips: string | undefined,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const parsedDays = baselineWindowDays
      ? Number.parseInt(baselineWindowDays, 10)
      : undefined;
    const parsedTrips = baselineWindowTrips
      ? Number.parseInt(baselineWindowTrips, 10)
      : undefined;

    return toApiSuccessEnvelope(
      await this.requireRegulatoryReportJobsService().generateKpiDashboard(
        experimentId,
        asOf,
        parsedDays,
        parsedTrips,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Post("experiments/:experimentId/resume-dossiers")
  async generateResumeAuthorizationDossier(
    @Param("experimentId") experimentId: string,
    @Body() command: GenerateResumeAuthorizationDossierCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      await this.requireRegulatoryReportJobsService().generateResumeAuthorizationDossier(
        experimentId,
        command,
        identity,
        requestId,
      ),
      requestId,
    );
  }

  @Get("resume-dossiers/:dossierId")
  getResumeAuthorizationDossier(
    @Param("dossierId") dossierId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.requireRegulatoryReportJobsService().getResumeAuthorizationDossier(
        dossierId,
        requestId,
        identity,
      ),
      requestId,
    );
  }
}
