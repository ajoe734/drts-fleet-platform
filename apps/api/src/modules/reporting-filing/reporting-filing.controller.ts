import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";

import type {
  CreateReportJobCommand,
  GenerateFilingPackageCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import { CurrentIdentity, RequireRealms } from "../../common/auth";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { ReportingFilingService } from "./reporting-filing.service";

@Controller()
export class ReportingFilingController {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
  ) {}

  private requireTenantId(tenantId?: string) {
    const normalizedTenantId = tenantId?.trim();
    if (!normalizedTenantId) {
      throw new ApiRequestError(
        400,
        "TENANT_ID_REQUIRED",
        "x-tenant-id header is required for tenant reporting endpoints.",
      );
    }
    return normalizedTenantId;
  }

  @Post("reports/jobs")
  @RequireRealms("platform", "ops")
  createReportJob(
    @Body() command: CreateReportJobCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.createReportJob(
        command,
        requestId,
        undefined,
        identity,
      ),
      requestId,
    );
  }

  @Post("tenant/reports/jobs")
  @RequireRealms("tenant", "platform", "ops")
  createTenantReportJob(
    @Body() command: CreateReportJobCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.createReportJob(
        command,
        requestId,
        this.requireTenantId(tenantId),
        identity,
      ),
      requestId,
    );
  }

  @Get("reports/jobs")
  @RequireRealms("platform", "ops")
  listReportJobs(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.reportingFilingService.listReportJobs(
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("tenant/reports/jobs")
  @RequireRealms("tenant", "platform", "ops")
  listTenantReportJobs(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.reportingFilingService.listReportJobs(
      requestId,
      identity,
      this.requireTenantId(tenantId),
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("reports/:jobId")
  @RequireRealms("platform", "ops")
  getReportJob(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getReportJob(jobId, requestId, identity),
      requestId,
    );
  }

  @Get("tenant/reports/:jobId")
  @RequireRealms("tenant", "platform", "ops")
  getTenantReportJob(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getReportJob(
        jobId,
        requestId,
        identity,
        this.requireTenantId(tenantId),
      ),
      requestId,
    );
  }

  @Post("filing-packages/generate")
  @RequireRealms("platform", "ops")
  generateFilingPackage(
    @Body() command: GenerateFilingPackageCommand,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.generateFilingPackage(
        command,
        requestId,
        identity,
      ),
      requestId,
    );
  }

  @Get("filing-packages")
  @RequireRealms("platform", "ops")
  listFilingPackages(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const items = this.reportingFilingService.listFilingPackages(
      requestId,
      identity,
    );
    return toApiSuccessEnvelope(toApiListData(items), requestId);
  }

  @Get("filing-packages/:packageId")
  @RequireRealms("platform", "ops")
  getFilingPackage(
    @Param("packageId") packageId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    return toApiSuccessEnvelope(
      this.reportingFilingService.getFilingPackage(
        packageId,
        requestId,
        identity,
      ),
      requestId,
    );
  }
}
