import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Post,
  Query,
} from "@nestjs/common";

import { toApiSuccessEnvelope } from "../../common/api-envelope";
import { RequireRealms } from "../../common/auth";
import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../common/idempotency";
import {
  VoiceBookingMetricsService,
  deriveObservationWindowClosed,
  type CohortEvaluationFilter,
} from "../../observability/voice-booking-metrics.service";
import {
  VoiceUsageService,
  type ProviderInvoiceLineItem,
  type VoiceUsageServiceType,
} from "./voice-usage.service";

@Controller("callcenter/voice")
export class VoiceBookingController {
  constructor(
    private readonly voiceBookingMetricsService: VoiceBookingMetricsService,
    private readonly voiceUsageService: VoiceUsageService,
    @Optional()
    private readonly idempotencyService: IdempotencyService = new IdempotencyService(
      new IdempotencyRepository(),
    ),
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
    const resolvedWindowEnd = windowEnd ?? new Date().toISOString();
    const filter: CohortEvaluationFilter = {
      windowStart: windowStart ?? new Date(Date.now() - 86400000).toISOString(),
      windowEnd: resolvedWindowEnd,
      observationWindowClosed: deriveObservationWindowClosed(
        resolvedWindowEnd,
        observationWindowClosed,
      ),
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

  @Get("metrics/alerts")
  @RequireRealms("ops", "platform")
  getActiveDimensionalAlerts(@Headers("x-request-id") requestId?: string) {
    const alerts = this.voiceBookingMetricsService.evaluateActiveDimensionalAlerts();
    return toApiSuccessEnvelope({ items: alerts }, requestId);
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
    @Headers("x-request-id") requestId?: string,
  ) {
    const records = this.voiceUsageService.listUsageRecords({
      voiceSessionId,
      admissionId,
      brandId,
      provider,
      serviceType,
      usageDate,
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
  async reconcileInvoice(
    @Body()
    body: {
      invoiceRef: string;
      providerAccountId: string;
      invoiceLines: ProviderInvoiceLineItem[];
    },
    @Headers("idempotency-key") idempotencyKey?: string,
    @Headers("x-request-id") requestId?: string,
  ) {
    const scope = `voice:usage:reconcile:${body.providerAccountId}`;

    const result = await this.idempotencyService.execute({
      scope,
      idempotencyKey,
      required: true,
      payload: body,
      execute: async () => ({
        data: this.voiceUsageService.reconcileInvoice(
          body.invoiceRef,
          body.providerAccountId,
          body.invoiceLines,
        ),
        statusCode: 200,
      }),
    });

    return toApiSuccessEnvelope(result.data, requestId);
  }
}
