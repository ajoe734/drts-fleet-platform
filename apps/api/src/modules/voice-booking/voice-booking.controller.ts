import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { ApiRequestError, toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth";
import { VoiceBookingMetricsService, type CohortEvaluationFilter } from "../../observability/voice-booking-metrics.service";
import {
  VoiceUsageService,
  type ProviderInvoiceLineItem,
  type VoiceUsageServiceType,
} from "./voice-usage.service";
import { VoiceCommandRunnerService } from "./voice-command-runner.service";

@Controller("callcenter/voice")
export class VoiceBookingController {
  constructor(
    private readonly voiceBookingMetricsService: VoiceBookingMetricsService,
    private readonly voiceUsageService: VoiceUsageService,
    @Optional()
    private readonly voiceCommandRunnerService?: VoiceCommandRunnerService,
  ) {}

  @Get("metrics/cohort")
  @RequireRealms("ops", "platform")
  async getCohortMetrics(
    @Query("windowStart") windowStart?: string,
    @Query("windowEnd") windowEnd?: string,
    @Query("language") language?: string,
    @Query("routeProfileVersion") routeProfileVersion?: string,
    @Query("provider") provider?: string,
    @Query("brandId") brandId?: string,
    @Query("bookingRole") bookingRole?: "self" | "proxy",
    @Query("lineBindingId") lineBindingId?: string,
    @Query("observationWindowClosed") observationWindowClosed?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const filter: CohortEvaluationFilter = {
      windowStart: windowStart ?? new Date(Date.now() - 86400000).toISOString(),
      windowEnd: windowEnd ?? new Date().toISOString(),
      observationWindowClosed: observationWindowClosed !== "false",
      language,
      routeProfileVersion: routeProfileVersion ? Number(routeProfileVersion) : undefined,
      provider,
      brandId,
      bookingRole,
      lineBindingId,
    };

    const report = await this.voiceBookingMetricsService.deriveCohortFromDurableEvidence(filter);

    return toApiSuccessEnvelope(report, requestId);
  }

  @Get("usage/records")
  @RequireRealms("ops", "platform")
  listUsageRecords(
    @Query("voiceSessionId") voiceSessionId?: string,
    @Query("admissionId") admissionId?: string,
    @Query("brandId") brandId?: string,
    @Query("provider") provider?: string,
    @Query("serviceType") serviceType?: VoiceUsageServiceType,
    @Query("usageDate") usageDate?: string,
    @Query("language") language?: string,
    @Query("windowStart") windowStart?: string,
    @Query("windowEnd") windowEnd?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const records = this.voiceUsageService.listUsageRecords({
      voiceSessionId,
      admissionId,
      brandId,
      provider,
      serviceType,
      usageDate,
      language,
      windowStart,
      windowEnd,
    });

    return toApiSuccessEnvelope({ items: records }, requestId);
  }

  @Get("usage/rate-cards")
  @RequireRealms("ops", "platform")
  listRateCards(@Headers("x-request-id") requestId?: string) {
    const cards = this.voiceUsageService.listRateCards();
    return toApiSuccessEnvelope({ items: cards }, requestId);
  }

  @Post("usage/reconcile")
  @RequireRealms("ops", "platform")
  reconcileInvoice(
    @Body()
    body: {
      invoiceRef: string;
      providerAccountId: string;
      invoiceLines: ProviderInvoiceLineItem[];
    },
    @Headers("idempotency-key") _idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const report = this.voiceUsageService.reconcileInvoice(
      body.invoiceRef,
      body.providerAccountId,
      body.invoiceLines,
    );

    return toApiSuccessEnvelope(report, requestId);
  }

  @Post("work-items/:workId/repair")
  @RequireRealms("ops", "platform")
  async repairWorkItem(
    @Param("workId") workId: string,
    @Body()
    body: {
      requestId?: string;
      actorId: string;
      reason: string;
      expectedLeaseEpoch: number;
      allocatedMaxAttempts?: number;
    },
    @Headers("x-request-id") headerRequestId?: string,
  ) {
    if (!this.voiceCommandRunnerService) {
      throw new ApiRequestError(
        500,
        "RUNNER_SERVICE_UNAVAILABLE",
        "Voice command runner service is unavailable.",
      );
    }

    const effectiveRequestId =
      body.requestId?.trim() || headerRequestId || `req-${Date.now()}`;

    const result = await this.voiceCommandRunnerService.repairFailedWorkItem({
      workId,
      requestId: effectiveRequestId,
      actorId: body.actorId,
      reason: body.reason,
      expectedLeaseEpoch: body.expectedLeaseEpoch,
      allocatedMaxAttempts: body.allocatedMaxAttempts,
    });

    return toApiSuccessEnvelope(result, headerRequestId);
  }
}
