import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import type {
  AgencyQualificationQuery,
  AgencyTripExportScope,
  AgencyTripRecordQuery,
  CreateAgencyTripExportJobCommand,
} from "@drts/contracts";

import {
  ApiRequestError,
  toApiSuccessEnvelope,
} from "../../common/api-envelope";
import {
  CurrentIdentity,
  RequireRealms,
  RequireScopes,
  type BootstrapRequestIdentity,
} from "../../common/auth";
import { READ_HEAVY_RATE_LIMIT } from "../../common/throttling/rate-limit.constants";
import type { AgencyRequestMeta } from "./agency-access-audit.service";
import { AgencyPortalService } from "./agency-portal.service";

/**
 * BUREAU-R13 §4: the only routes an agency session can read. Every handler is
 * a read (or an export job/preview that writes nothing operational), and
 * AgencyPortalService records each call in admin.agency_access_logs.
 */
@Controller("agency")
@RequireRealms("agency")
@Throttle(READ_HEAVY_RATE_LIMIT)
export class AgencyPortalController {
  constructor(private readonly agencyPortalService: AgencyPortalService) {}

  @Get("trip-records")
  @RequireScopes("agency:trip_records:read")
  async listTripRecords(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: AgencyTripRecordQuery & Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.listTripRecords(identity, query, meta),
      meta.requestId ?? undefined,
    );
  }

  @Post("trip-records/export-jobs/preview")
  @RequireScopes("agency:trip_records:export")
  async previewTripExport(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() body: { scope?: AgencyTripExportScope } & Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.previewTripExport(identity, body, meta),
      meta.requestId ?? undefined,
    );
  }

  @Post("trip-records/export-jobs")
  @RequireScopes("agency:trip_records:export")
  async createTripExport(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Body() command: CreateAgencyTripExportJobCommand,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    // The body idempotencyKey is required and actor-bound by
    // ReportingFilingService (same contract as the platform export job).
    if (
      typeof command?.idempotencyKey !== "string" ||
      !command.idempotencyKey.trim()
    ) {
      throw new ApiRequestError(
        400,
        "MULTI_TAXI_EXPORT_FIELD_REQUIRED",
        "idempotencyKey is required.",
      );
    }
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.createTripExport(identity, command, meta),
      meta.requestId ?? undefined,
    );
  }

  @Get("trip-records/export-jobs/:jobId")
  @RequireScopes("agency:trip_records:export")
  async getTripExportJob(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("jobId") jobId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.getTripExportJob(identity, jobId, meta),
      meta.requestId ?? undefined,
    );
  }

  @Get("trip-records/export-jobs/:jobId/download")
  @RequireScopes("agency:trip_records:export")
  async issueTripExportDownload(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("jobId") jobId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.issueTripExportDownload(
        identity,
        jobId,
        meta,
      ),
      meta.requestId ?? undefined,
    );
  }

  @Get("trip-records/:recordId")
  @RequireScopes("agency:trip_records:read")
  async getTripRecord(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Param("recordId") recordId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.getTripRecord(identity, recordId, meta),
      meta.requestId ?? undefined,
    );
  }

  @Get("reports/operations-summary")
  @RequireScopes("agency:reports:read")
  async previewOperationsSummary(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: { from?: string; to?: string; businessArea?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      {
        items: await this.agencyPortalService.previewOperationsSummary(
          identity,
          query,
          meta,
        ),
      },
      meta.requestId ?? undefined,
    );
  }

  @Get("reports/monthly-operations-summaries")
  @RequireScopes("agency:reports:read")
  async listMonthlyOperationsSummaries(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: { periodMonthFrom?: string; periodMonthTo?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      {
        items: await this.agencyPortalService.listMonthlyOperationsSummaries(
          identity,
          query,
          meta,
        ),
      },
      meta.requestId ?? undefined,
    );
  }

  @Get("reports/complaint-monthly-statistics")
  @RequireScopes("agency:reports:read")
  async listComplaintMonthlyStatistics(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: { periodMonthFrom?: string; periodMonthTo?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.listComplaintMonthlyStatistics(
        identity,
        query,
        meta,
      ),
      meta.requestId ?? undefined,
    );
  }

  @Get("reports/daily-dispatch-records")
  @RequireScopes("agency:reports:read")
  async listDailyDispatchRecords(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.listDailyDispatchRecords(
        identity,
        query,
        meta,
      ),
      meta.requestId ?? undefined,
    );
  }

  @Get("qualifications/vehicles")
  @RequireScopes("agency:qualifications:read")
  async listVehicleQualifications(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: AgencyQualificationQuery & Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.listVehicleQualifications(
        identity,
        query,
        meta,
      ),
      meta.requestId ?? undefined,
    );
  }

  @Get("qualifications/drivers")
  @RequireScopes("agency:qualifications:read")
  async listDriverQualifications(
    @CurrentIdentity() identity: BootstrapRequestIdentity | null,
    @Query() query: AgencyQualificationQuery & Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const meta = toMeta(headers);
    return toApiSuccessEnvelope(
      await this.agencyPortalService.listDriverQualifications(
        identity,
        query,
        meta,
      ),
      meta.requestId ?? undefined,
    );
  }
}

function header(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = headers?.[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || null;
}

export function toMeta(
  headers: Record<string, string | string[] | undefined>,
): AgencyRequestMeta {
  return {
    requestId: header(headers, "x-request-id"),
    sourceIp:
      header(headers, "x-forwarded-for") ?? header(headers, "x-real-ip"),
    userAgent: header(headers, "user-agent"),
  };
}
