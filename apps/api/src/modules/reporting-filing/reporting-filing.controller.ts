import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  CreateReportJobCommand,
  GenerateFilingPackageCommand,
} from "@drts/contracts";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
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

  @Get("reports/jobs")
  listReportJobs(@Headers("x-request-id") requestId?: string) {
    return toApiSuccessEnvelope(
      {
        items: this.reportingFilingService.listReportJobs(),
      },
      requestId,
    );
  }

  @Get("reports/:jobId")
  getReportJob(
    @Param("jobId") jobId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getReportJob(jobId),
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

  @Get("filing-packages/:packageId")
  getFilingPackage(
    @Param("packageId") packageId: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getFilingPackage(packageId),
      requestId,
    );
  }
}
