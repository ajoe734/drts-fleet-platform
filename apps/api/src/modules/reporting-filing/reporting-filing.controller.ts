import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  CreateReportJobCommand,
  GenerateFilingPackageCommand,
} from "@drts/contracts";

import { toApiListData, toApiSuccessEnvelope } from "../../common/api-envelope";
import { ReportingFilingService } from "./reporting-filing.service";

@Controller()
export class ReportingFilingController {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
  ) {}

  @Post("reports/jobs")
  createReportJob(
    @Body() command: CreateReportJobCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.createReportJob(command, requestId),
      requestId,
    );
  }

  @Post("tenant/reports/jobs")
  createTenantReportJob(
    @Body() command: CreateReportJobCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.createReportJob(command, requestId),
      requestId,
    );
  }

  @Get("reports/jobs")
  listReportJobs(@Headers("x-request-id") requestId?: string) {
    const items = this.reportingFilingService.listReportJobs();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/reports/jobs")
  listTenantReportJobs(@Headers("x-request-id") requestId?: string) {
    const items = this.reportingFilingService.listReportJobs();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("reports/:jobId")
  getReportJob(
    @Param("jobId") jobId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getReportJob(jobId, requestId),
      requestId,
    );
  }

  @Get("tenant/reports/:jobId")
  getTenantReportJob(
    @Param("jobId") jobId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getReportJob(jobId, requestId),
      requestId,
    );
  }

  @Post("filing-packages/generate")
  generateFilingPackage(
    @Body() command: GenerateFilingPackageCommand,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.generateFilingPackage(command, requestId),
      requestId,
    );
  }

  @Get("filing-packages")
  listFilingPackages(@Headers("x-request-id") requestId?: string) {
    const items = this.reportingFilingService.listFilingPackages();
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("filing-packages/:packageId")
  getFilingPackage(
    @Param("packageId") packageId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getFilingPackage(packageId, requestId),
      requestId,
    );
  }
}
