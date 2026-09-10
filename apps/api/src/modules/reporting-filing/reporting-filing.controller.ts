import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Post,
  StreamableFile,
} from "@nestjs/common";

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
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../common/idempotency";
import { ReportingFilingService } from "./reporting-filing.service";

@Controller()
export class ReportingFilingController {
  constructor(
    private readonly reportingFilingService: ReportingFilingService,
    @Optional()
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(
      new IdempotencyRepository(),
    ),
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
  async createReportJob(
    @Body() command: CreateReportJobCommand,
    @CurrentIdentity() _identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = "reporting:job_create";
    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: command,
      execute: async () => {
        const data = this.reportingFilingService.createReportJob(
          command,
          requestId,
        );
        return {
          data,
          statusCode: 201,
        };
      },
    });

    return toApiSuccessEnvelope(result.data, requestId);
  }

  @Post("tenant/reports/jobs")
  @RequireRealms("tenant", "platform", "ops")
  async createTenantReportJob(
    @Body() command: CreateReportJobCommand,
    @CurrentIdentity() _identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const normalizedTenantId = this.requireTenantId(tenantId);
    const scope = `tenant:${normalizedTenantId}:reporting:job_create`;
    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      tenantId: normalizedTenantId,
      required: true,
      payload: { ...command, tenantId: normalizedTenantId },
      execute: async () => {
        const data = this.reportingFilingService.createReportJob(
          command,
          requestId,
          normalizedTenantId,
        );
        return {
          data,
          statusCode: 201,
        };
      },
    });

    return toApiSuccessEnvelope(result.data, requestId);
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

  // The file itself. `GET reports/:jobId` describes the artifact; this one is
  // the artifact. Until now the description carried a `downloadUrl` and there
  // was nothing at the other end of it.
  @Get("reports/:jobId/artifact")
  @RequireRealms("platform", "ops")
  async downloadReportArtifact(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-request-id") requestId?: string,
  ) {
    const artifact = await this.reportingFilingService.renderReportArtifact(
      jobId,
      requestId,
      identity,
    );
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.fileName}"`,
    });
  }

  @Get("tenant/reports/:jobId/artifact")
  @RequireRealms("tenant", "platform", "ops")
  async downloadTenantReportArtifact(
    @Param("jobId") jobId: string,
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const normalizedTenantId = this.requireTenantId(tenantId);
    const artifact = await this.reportingFilingService.renderReportArtifact(
      jobId,
      requestId,
      identity,
      normalizedTenantId,
    );
    return new StreamableFile(artifact.buffer, {
      type: artifact.contentType,
      disposition: `attachment; filename="${artifact.fileName}"`,
    });
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
  async generateFilingPackage(
    @Body() command: GenerateFilingPackageCommand,
    @CurrentIdentity() _identity: BootstrapRequestIdentity | null,
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = "reporting:filing";

    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: command,
      execute: async () => {
        const data = this.reportingFilingService.generateFilingPackage(
          command,
          requestId,
        );
        return {
          data,
          statusCode: 201,
        };
      },
    });

    return toApiSuccessEnvelope(result.data, requestId);
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
