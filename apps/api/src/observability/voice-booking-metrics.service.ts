import { Injectable, Logger, Optional } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { voiceAlertMetrics } from "./voice-alert-metrics";
import type {
  VoiceBookingRepository,
  VoiceSessionRecord,
  VoiceConfirmationRecord,
} from "../modules/voice-booking/voice-booking.repository";
import type { VoiceUsageService } from "../modules/voice-booking/voice-usage.service";

export interface VoiceCallMetricRecord {
  callId: string;
  providerCallId: string;
  providerAccountId: string;
  receivedAt: string;
  lineBindingId: string;
  brandId: string;
  language: string; // "zh-TW", "nan", "hak", etc.
  product: string; // e.g. "ordinary_taxi"
  noiseCondition?: "clean" | "moderate_noise" | "heavy_street_noise" | undefined;
  bookingRole?: "self" | "proxy" | undefined;
  routeProfileVersion: number;
  policyVersion: string;
  provider: string; // e.g. "twm", "bronci", "openai", "gemini"
  isTestCall?: boolean | undefined;

  // Admission & Ingress
  admissionOutcome: "admitted" | "overflow" | "failed";
  admissionFailureReason?: string | undefined;
  enteredAi: boolean;

  // Dialog & Intent
  intentDiscernible: boolean;
  expressedIntent?: "new_booking" | "query" | "other" | "unsupported" | undefined;
  isSupportedBusinessNeed: boolean;
  unrecognizedIntent?: boolean | undefined;
  noAudioDetected?: boolean | undefined;

  // Booking Intake
  bookingIntakeCompleted?: boolean | undefined;
  bookingIntakeDropReason?:
    | "caller_hangup"
    | "tool_failure"
    | "handoff"
    | "passenger_refused_confirmation"
    | "other"
    | undefined;
  passengerRefusedConfirmation?: boolean | undefined;

  // Projected Evidence Facts (SD §13.2 / SA §10.2: 無人有效受理率由確認證據、durable order、派遣受理／結果與實際結果播報 ack 聯合計算)
  hasConfirmationEvidence?: boolean | undefined;
  hasDurableOrder?: boolean | undefined;
  playbackAckReceived?: boolean | undefined;

  // Self-Service Outcome
  selfServiceOutcome?:
    | "booking_completed"
    | "query_resolved"
    | "explicit_no_car_handled"
    | "unresolved"
    | undefined;

  // Dispatch & Fulfillment
  orderCreated?: boolean | undefined;
  orderId?: string | undefined;
  dispatchRequested?: boolean | undefined;
  driverAccepted?: boolean | undefined;
  dispatchFailureReason?:
    | "no_car_available"
    | "driver_rejected"
    | "dispatch_timeout"
    | "other"
    | undefined;

  // Human Transfer (In-AI)
  handoffRequired?: boolean | undefined;
  handoffOccurred?: boolean | undefined;
  handoffCategory?:
    | "recognition"
    | "business"
    | "technical"
    | "identity"
    | "passenger_requested"
    | undefined;
  handoffSucceeded?: boolean | undefined;

  // All-Ingress Human Intervention
  requiredHumanIntervention?: boolean | undefined;
  humanInterventionSource?:
    | "pre_ai_triage"
    | "unsupported_business"
    | "capacity_overflow"
    | "provider_failure"
    | "in_ai_handoff"
    | "none"
    | undefined;

  // Quality & Errors
  isKeyFieldMismatchOrUnauthorized?: boolean | undefined;
  errorBookingDiscovered?: boolean | undefined;
  inspectedInQualitySample?: boolean | undefined;

  // Cost data
  totalCallCost: number; // in TWD
  hasUnverifiedCostItems?: boolean | undefined;
}

export interface CohortEvaluationFilter {
  windowStart: string;
  windowEnd: string;
  observationWindowClosed: boolean;
  language?: string | undefined;
  routeProfileVersion?: number | undefined;
  provider?: string | undefined;
  brandId?: string | undefined;
  bookingRole?: "self" | "proxy" | undefined;
  lineBindingId?: string | undefined;
}

export interface VoiceCohortMetricsReport {
  cohortWindow: {
    windowStart: string;
    windowEnd: string;
    observationWindowClosed: boolean;
  };
  filtersApplied: Partial<CohortEvaluationFilter>;
  deduplicationSummary: {
    rawRecordsCount: number;
    uniqueCallsCount: number;
    uniqueOrdersCount: number;
    testCallsExcluded: number;
  };

  // 1. 全部來電覆蓋率
  allCallCoverage: {
    rate: number;
    numeratorEnteredAi: number;
    denominatorRealIngress: number;
    capacityOverflowCount: number;
    providerFailureCount: number;
  };

  // 2. 支持範圍占比
  supportedScopeProportion: {
    rate: number;
    numeratorInScope: number;
    denominatorDiscernibleIntent: number;
    separateReporting: {
      unrecognizedIntentCount: number;
      noAudioCount: number;
    };
  };

  // 3. 無人有效受理率
  unattendedEffectiveIntake: {
    rate: number;
    numeratorValidIntakes: number;
    denominatorExpressedBookingIntent: number;
    retainedFailuresInDenominator: {
      callerHangupsAfterIntent: number;
      toolFailures: number;
      handoffs: number;
    };
    separateReporting: {
      passengerRefusedConfirmationCount: number;
    };
  };

  // 4. 自助處置率
  selfServiceResolution: {
    rate: number;
    numeratorSelfServiceResolved: number;
    denominatorInScopeDemand: number;
    breakdownByIntent: {
      bookingsCompleted: number;
      queriesResolved: number;
      explicitNoCarHandled: number;
    };
  };

  // 5. 無人派車完成率
  unattendedDispatchCompletion: {
    rate: number;
    numeratorDriverAcceptedUniqueOrders: number;
    denominatorImmediateDispatchOrders: number;
    retainedFailuresInDenominator: {
      noCarAvailableCount: number;
      driverRejectedCount: number;
      timeoutCount: number;
    };
    separationNote: string;
  };

  // 6. 轉真人率
  humanTransfer: {
    rate: number;
    numeratorTransferCalls: number;
    denominatorEnteredAi: number;
    breakdownByCategory: {
      recognition: number;
      business: number;
      technical: number;
      identity: number;
      passenger_requested: number;
    };
    failedHandoffsIncluded: number;
  };

  // 7. 全入口人工介入率
  allIngressHumanIntervention: {
    rate: number;
    numeratorHumanInterventionUniqueCalls: number;
    denominatorTotalRealIngress: number;
    breakdownBySource: {
      preAiTriage: number;
      unsupportedBusiness: number;
      capacityOverflow: number;
      providerFailure: number;
      inAiHandoffs: number;
    };
  };

  // 8. 錯單率
  errorBooking: {
    rate: number;
    numeratorErrorBookings: number;
    denominatorValidOrders: number;
    inspectedSampleRate: number;
    discoveryWindowHours: number;
  };

  // 9. 每筆有效受理成本
  costPerEffectiveIntake: {
    cost: number | null;
    totalVoiceCost: number;
    denominatorValidIntakes: number;
    zeroDenominatorReason?: string | undefined;
  };

  // 10. 每筆成功派車成本
  costPerSuccessfulDispatch: {
    cost: number | null;
    status: "settled" | "pending_observation_window";
    totalVoiceCost: number;
    denominatorDriverAcceptedOrders: number;
    pendingReason?: string | undefined;
  };
}

export interface CallbackRecordForSla {
  taskId: string;
  dueAt: string;
  scheduledAt?: string | null | undefined;
  completedAt?: string | null | undefined;
  status: "pending" | "claimed" | "in_progress" | "completed" | "cancelled" | "unreachable";
  timeToFirstContactSeconds?: number | undefined;
}

export interface CallbackSlaReport {
  totalCallbacks: number;
  completedCount: number;
  pendingCount: number;
  cancelledCount: number;
  breachedCount: number;
  slaComplianceRate: number;
  averageTimeToFirstContactSeconds: number | null;
  breachThresholdSeconds: number;
}

export type VoiceAlertName =
  | "VoiceErrorOrDuplicateBooking"
  | "VoiceCrossScopeAccessDenied"
  | "VoicePendingCommandTimeout"
  | "VoiceRecordingCheckpointFailure"
  | "VoiceProviderCapacityExceeded"
  | "VoiceHandoffUnansweredBreach"
  | "VoiceDispatchUnavailableSpike"
  | "VoiceCostAnomalySpike"
  | "VoiceWorkerLeaseConflict";

export interface VoiceAlertDimensions {
  language: string;
  routeProfileVersion: number;
  provider: string;
  brandId: string;
}

export interface VoiceDimensionalAlert {
  alertId: string;
  alertName: VoiceAlertName;
  severity: "critical" | "high" | "warning";
  dimensions: VoiceAlertDimensions;
  summary: string;
  description: string;
  metricValue: number;
  threshold: number;
  timestamp: string;
}

@Injectable()
export class VoiceBookingMetricsService {
  private readonly logger = new Logger(VoiceBookingMetricsService.name);

  constructor(
    @Optional() private readonly repository?: VoiceBookingRepository,
    @Optional() private readonly usageService?: VoiceUsageService,
  ) {}

  // ============================================================================
  // SA §10.2 Cohort Metrics Evaluator
  // ============================================================================

  /**
   * Evaluate the fixed dataset / cohort according to SA §10.2 rules:
   * - Common denominator
   * - Test call exclusion
   * - Capacity overflow and provider failure inclusion
   * - Separation of unattended intake vs actual driver dispatch
   * - Intact retention of hangups/tool failures in denominator
   * - Separation of unrecognized intent and no-audio
   * - Cost per intake non-zero denominator rule
   * - Cost per successful dispatch observation window gate
   */
  public evaluateCohortMetrics(
    records: VoiceCallMetricRecord[],
    filter: CohortEvaluationFilter,
  ): VoiceCohortMetricsReport {
    // 1. Filter cohort by window and dimensional criteria
    const windowStartMs = new Date(filter.windowStart).getTime();
    const windowEndMs = new Date(filter.windowEnd).getTime();

    const matched = records.filter((r) => {
      const recMs = new Date(r.receivedAt).getTime();
      if (recMs < windowStartMs || recMs > windowEndMs) return false;
      if (filter.language && r.language !== filter.language) return false;
      if (
        filter.routeProfileVersion !== undefined &&
        r.routeProfileVersion !== filter.routeProfileVersion
      )
        return false;
      if (
        filter.provider &&
        r.provider.toLowerCase() !== filter.provider.toLowerCase()
      )
        return false;
      if (filter.brandId && r.brandId !== filter.brandId) return false;
      if (filter.bookingRole && r.bookingRole !== filter.bookingRole)
        return false;
      if (filter.lineBindingId && r.lineBindingId !== filter.lineBindingId)
        return false;
      return true;
    });

    const rawRecordsCount = matched.length;

    // 2. Stable Deduplication by provider + providerAccountId + providerCallId (SA §10.2: 同一通來電與同一訂單使用穩定識別去重)
    const uniqueCallsMap = new Map<string, VoiceCallMetricRecord>();
    for (const r of matched) {
      const stableKey = `${r.provider ?? "unknown"}#${r.providerAccountId ?? "default"}#${r.providerCallId || r.callId}`;
      if (!uniqueCallsMap.has(stableKey)) {
        uniqueCallsMap.set(stableKey, r);
      }
    }
    const dedupedCalls = Array.from(uniqueCallsMap.values());

    // 3. Exclude test calls (SA §10.2: 測試電話按標記排除)
    let testCallsExcluded = 0;
    const realCalls = dedupedCalls.filter((r) => {
      if (r.isTestCall === true) {
        testCallsExcluded++;
        return false;
      }
      return true;
    });

    const totalRealIngress = realCalls.length;

    // 4. Metric 1: 全部來電覆蓋率
    const callsEnteredAi = realCalls.filter((r) => r.enteredAi);
    const capacityOverflow = realCalls.filter(
      (r) => r.admissionOutcome === "overflow",
    ).length;
    const providerFailures = realCalls.filter(
      (r) => r.admissionOutcome === "failed",
    ).length;

    const allCallCoverageRate =
      totalRealIngress > 0
        ? Number((callsEnteredAi.length / totalRealIngress).toFixed(4))
        : 0;

    // 5. Metric 2: 支持範圍占比
    // 分子: 已開通且可判定的業務需求
    // 分母: 可判定意圖的來電
    // 另列: 未辨識意圖與無音訊
    const discernibleIntentCalls = callsEnteredAi.filter(
      (r) => r.intentDiscernible,
    );
    const inScopeNeedsCalls = discernibleIntentCalls.filter(
      (r) => r.isSupportedBusinessNeed,
    );
    const unrecognizedIntentCount = callsEnteredAi.filter(
      (r) => r.unrecognizedIntent === true,
    ).length;
    const noAudioCount = callsEnteredAi.filter(
      (r) => r.noAudioDetected === true,
    ).length;

    const supportedScopeProportionRate =
      discernibleIntentCalls.length > 0
        ? Number(
            (inScopeNeedsCalls.length / discernibleIntentCalls.length).toFixed(
              4,
            ),
          )
        : 0;

    // 6. Metric 3: 無人有效受理率
    // 分子: AI 完成有效新叫車受理
    // 分母: 已表達支持範圍新叫車意圖的通話
    // 意圖確立後的掛斷、工具失敗、轉接均留在分母；乘客拒絕確認另分組
    const expressedBookingIntentCalls = callsEnteredAi.filter(
      (r) =>
        r.expressedIntent === "new_booking" && r.isSupportedBusinessNeed,
    );
    const validBookingIntakes = expressedBookingIntentCalls.filter((r) => {
      if (r.bookingIntakeCompleted !== true) return false;
      // SD §13.2: 無人有效受理率由確認證據、durable order、派遣受理／結果與實際結果播報 ack 聯合計算，不能直接把 outcome=auto_booking_created 當成功
      if (r.hasConfirmationEvidence === false) return false;
      if (r.hasDurableOrder === false) return false;
      if (r.playbackAckReceived === false) return false;
      return true;
    });
    const callerHangupsAfterIntent = expressedBookingIntentCalls.filter(
      (r) => r.bookingIntakeDropReason === "caller_hangup",
    ).length;
    const toolFailures = expressedBookingIntentCalls.filter(
      (r) => r.bookingIntakeDropReason === "tool_failure",
    ).length;
    const handoffsAfterIntent = expressedBookingIntentCalls.filter(
      (r) => r.bookingIntakeDropReason === "handoff",
    ).length;
    const passengerRefusedConfirmationCount =
      expressedBookingIntentCalls.filter(
        (r) =>
          r.passengerRefusedConfirmation === true ||
          r.bookingIntakeDropReason === "passenger_refused_confirmation",
      ).length;

    const unattendedEffectiveIntakeRate =
      expressedBookingIntentCalls.length > 0
        ? Number(
            (
              validBookingIntakes.length / expressedBookingIntentCalls.length
            ).toFixed(4),
          )
        : 0;

    // 7. Metric 4: 自助處置率
    // 分子: 正確完成叫車受理、查詢或明確無車處置
    // 分母: 支持範圍需求通話
    const inScopeDemandCalls = callsEnteredAi.filter(
      (r) => r.isSupportedBusinessNeed,
    );
    const bookingsCompleted = inScopeDemandCalls.filter(
      (r) => r.selfServiceOutcome === "booking_completed",
    ).length;
    const queriesResolved = inScopeDemandCalls.filter(
      (r) => r.selfServiceOutcome === "query_resolved",
    ).length;
    const explicitNoCarHandled = inScopeDemandCalls.filter(
      (r) => r.selfServiceOutcome === "explicit_no_car_handled",
    ).length;
    const totalSelfServiceResolved =
      bookingsCompleted + queriesResolved + explicitNoCarHandled;

    const selfServiceResolutionRate =
      inScopeDemandCalls.length > 0
        ? Number(
            (totalSelfServiceResolved / inScopeDemandCalls.length).toFixed(4),
          )
        : 0;

    // 8. Metric 5: 無人派車完成率 (Dedup by unique order ID)
    // 分子: 取得至少一次司機接單的唯一訂單
    // 分母: AI 建立且要求即時派遣的唯一訂單 (獨立自 durable order/dispatch facts 派生，不限於 validBookingIntakes)
    const uniqueOrdersMap = new Map<string, VoiceCallMetricRecord>();
    for (const r of realCalls) {
      if ((r.orderId || r.orderCreated) && r.dispatchRequested) {
        const orderKey = r.orderId || `${r.providerAccountId}#${r.callId}`;
        if (!uniqueOrdersMap.has(orderKey)) {
          uniqueOrdersMap.set(orderKey, r);
        }
      }
    }
    const immediateDispatchOrders = Array.from(uniqueOrdersMap.values());
    const driverAcceptedOrders = immediateDispatchOrders.filter(
      (r) => r.driverAccepted === true,
    );
    const noCarCount = immediateDispatchOrders.filter(
      (r) => r.dispatchFailureReason === "no_car_available",
    ).length;
    const driverRejectedCount = immediateDispatchOrders.filter(
      (r) => r.dispatchFailureReason === "driver_rejected",
    ).length;
    const dispatchTimeoutCount = immediateDispatchOrders.filter(
      (r) => r.dispatchFailureReason === "dispatch_timeout",
    ).length;

    const unattendedDispatchCompletionRate =
      immediateDispatchOrders.length > 0
        ? Number(
            (
              driverAcceptedOrders.length / immediateDispatchOrders.length
            ).toFixed(4),
          )
        : 0;

    // 9. Metric 6: 轉真人率
    // 分子: 曾要求或發生真人接手的通話
    // 分母: 進入 AI 的真實通話
    const transferCalls = callsEnteredAi.filter(
      (r) => r.handoffRequired || r.handoffOccurred,
    );
    const recognitionHandoffs = transferCalls.filter(
      (r) => r.handoffCategory === "recognition",
    ).length;
    const businessHandoffs = transferCalls.filter(
      (r) => r.handoffCategory === "business",
    ).length;
    const technicalHandoffs = transferCalls.filter(
      (r) => r.handoffCategory === "technical",
    ).length;
    const identityHandoffs = transferCalls.filter(
      (r) => r.handoffCategory === "identity",
    ).length;
    const passengerRequestedHandoffs = transferCalls.filter(
      (r) => r.handoffCategory === "passenger_requested",
    ).length;
    const failedHandoffsIncluded = transferCalls.filter(
      (r) => r.handoffSucceeded === false,
    ).length;

    const humanTransferRate =
      callsEnteredAi.length > 0
        ? Number((transferCalls.length / callsEnteredAi.length).toFixed(4))
        : 0;

    // 10. Metric 7: 全入口人工介入率
    // 包含未進 AI 的分流、未開通業務、容量/供應商故障及未成功接手
    const allIngressHumanCalls = realCalls.filter(
      (r) =>
        r.requiredHumanIntervention === true ||
        (Boolean(r.humanInterventionSource) && r.humanInterventionSource !== "none"),
    );
    const preAiTriage = allIngressHumanCalls.filter(
      (r) => r.humanInterventionSource === "pre_ai_triage",
    ).length;
    const unsupportedBusiness = allIngressHumanCalls.filter(
      (r) => r.humanInterventionSource === "unsupported_business",
    ).length;
    const capacityOverflowIntervention = allIngressHumanCalls.filter(
      (r) => r.humanInterventionSource === "capacity_overflow",
    ).length;
    const providerFailureIntervention = allIngressHumanCalls.filter(
      (r) => r.humanInterventionSource === "provider_failure",
    ).length;
    const inAiHandoffs = allIngressHumanCalls.filter(
      (r) => r.humanInterventionSource === "in_ai_handoff",
    ).length;

    const allIngressHumanInterventionRate =
      totalRealIngress > 0
        ? Number((allIngressHumanCalls.length / totalRealIngress).toFixed(4))
        : 0;

    // 11. Metric 8: 錯單率
    // 確認後發現關鍵欄位不符或未授權的唯一訂單 / AI 建立的唯一有效訂單
    const validOrders = immediateDispatchOrders;
    const errorBookings = validOrders.filter(
      (r) =>
        r.isKeyFieldMismatchOrUnauthorized === true ||
        r.errorBookingDiscovered === true,
    );
    const inspectedSampleCount = validOrders.filter(
      (r) => r.inspectedInQualitySample === true,
    ).length;
    const inspectedSampleRate =
      validOrders.length > 0
        ? Number((inspectedSampleCount / validOrders.length).toFixed(4))
        : 1.0;

    const errorBookingRate =
      validOrders.length > 0
        ? Number((errorBookings.length / validOrders.length).toFixed(4))
        : 0;

    // 12. Metric 9: 每筆有效受理成本
    // 同期全量語音叫車成本 / 有效新叫車受理數；分母零時不計成零元！
    const totalVoiceCost = realCalls.reduce(
      (acc, r) => acc + (r.totalCallCost || 0),
      0,
    );
    let costPerEffectiveIntakeValue: number | null = null;
    let zeroDenominatorReason: string | undefined = undefined;

    if (validBookingIntakes.length > 0) {
      costPerEffectiveIntakeValue = Number(
        (totalVoiceCost / validBookingIntakes.length).toFixed(2),
      );
    } else {
      costPerEffectiveIntakeValue = null;
      zeroDenominatorReason =
        "Zero valid booking intakes in cohort; per-intake unit cost cannot be evaluated as zero dollars (SA §10.2).";
    }

    // 13. Metric 10: 每筆成功派車成本
    // 需等待固定觀察窗口結束，避免最近來電尚未派車造成偏差
    let costPerSuccessfulDispatchValue: number | null = null;
    let dispatchCostStatus: "settled" | "pending_observation_window" = "settled";
    let pendingReason: string | undefined = undefined;

    if (!filter.observationWindowClosed) {
      dispatchCostStatus = "pending_observation_window";
      costPerSuccessfulDispatchValue = null;
      pendingReason =
        "Observation window still open; dispatch cost is held pending to avoid recent-call bias (SA §10.2).";
    } else if (driverAcceptedOrders.length > 0) {
      dispatchCostStatus = "settled";
      costPerSuccessfulDispatchValue = Number(
        (totalVoiceCost / driverAcceptedOrders.length).toFixed(2),
      );
    } else {
      dispatchCostStatus = "settled";
      costPerSuccessfulDispatchValue = null;
      pendingReason = "Zero successful dispatches in finalized observation window.";
    }

    return {
      cohortWindow: {
        windowStart: filter.windowStart,
        windowEnd: filter.windowEnd,
        observationWindowClosed: filter.observationWindowClosed,
      },
      filtersApplied: filter,
      deduplicationSummary: {
        rawRecordsCount,
        uniqueCallsCount: totalRealIngress,
        uniqueOrdersCount: validOrders.length,
        testCallsExcluded,
      },
      allCallCoverage: {
        rate: allCallCoverageRate,
        numeratorEnteredAi: callsEnteredAi.length,
        denominatorRealIngress: totalRealIngress,
        capacityOverflowCount: capacityOverflow,
        providerFailureCount: providerFailures,
      },
      supportedScopeProportion: {
        rate: supportedScopeProportionRate,
        numeratorInScope: inScopeNeedsCalls.length,
        denominatorDiscernibleIntent: discernibleIntentCalls.length,
        separateReporting: {
          unrecognizedIntentCount,
          noAudioCount,
        },
      },
      unattendedEffectiveIntake: {
        rate: unattendedEffectiveIntakeRate,
        numeratorValidIntakes: validBookingIntakes.length,
        denominatorExpressedBookingIntent: expressedBookingIntentCalls.length,
        retainedFailuresInDenominator: {
          callerHangupsAfterIntent,
          toolFailures,
          handoffs: handoffsAfterIntent,
        },
        separateReporting: {
          passengerRefusedConfirmationCount,
        },
      },
      selfServiceResolution: {
        rate: selfServiceResolutionRate,
        numeratorSelfServiceResolved: totalSelfServiceResolved,
        denominatorInScopeDemand: inScopeDemandCalls.length,
        breakdownByIntent: {
          bookingsCompleted,
          queriesResolved,
          explicitNoCarHandled,
        },
      },
      unattendedDispatchCompletion: {
        rate: unattendedDispatchCompletionRate,
        numeratorDriverAcceptedUniqueOrders: driverAcceptedOrders.length,
        denominatorImmediateDispatchOrders: immediateDispatchOrders.length,
        retainedFailuresInDenominator: {
          noCarAvailableCount: noCarCount,
          driverRejectedCount,
          timeoutCount: dispatchTimeoutCount,
        },
        separationNote:
          "Autonomous booking intake is strictly separated from actual driver dispatch (SA §10.2).",
      },
      humanTransfer: {
        rate: humanTransferRate,
        numeratorTransferCalls: transferCalls.length,
        denominatorEnteredAi: callsEnteredAi.length,
        breakdownByCategory: {
          recognition: recognitionHandoffs,
          business: businessHandoffs,
          technical: technicalHandoffs,
          identity: identityHandoffs,
          passenger_requested: passengerRequestedHandoffs,
        },
        failedHandoffsIncluded,
      },
      allIngressHumanIntervention: {
        rate: allIngressHumanInterventionRate,
        numeratorHumanInterventionUniqueCalls: allIngressHumanCalls.length,
        denominatorTotalRealIngress: totalRealIngress,
        breakdownBySource: {
          preAiTriage,
          unsupportedBusiness,
          capacityOverflow: capacityOverflowIntervention,
          providerFailure: providerFailureIntervention,
          inAiHandoffs,
        },
      },
      errorBooking: {
        rate: errorBookingRate,
        numeratorErrorBookings: errorBookings.length,
        denominatorValidOrders: validOrders.length,
        inspectedSampleRate,
        discoveryWindowHours: 48,
      },
      costPerEffectiveIntake: {
        cost: costPerEffectiveIntakeValue,
        totalVoiceCost: Number(totalVoiceCost.toFixed(2)),
        denominatorValidIntakes: validBookingIntakes.length,
        zeroDenominatorReason,
      },
      costPerSuccessfulDispatch: {
        cost: costPerSuccessfulDispatchValue,
        status: dispatchCostStatus,
        totalVoiceCost: Number(totalVoiceCost.toFixed(2)),
        denominatorDriverAcceptedOrders: driverAcceptedOrders.length,
        pendingReason,
      },
    };
  }

  // ============================================================================
  // Multi-Dimensional Slicing (SA §10.2: 語言/腔調、政策版本、供應商、品牌)
  // ============================================================================

  public evaluateMultiDimensionalCohort(
    records: VoiceCallMetricRecord[],
    filter: CohortEvaluationFilter,
  ): {
    overall: VoiceCohortMetricsReport;
    byLanguage: Record<string, VoiceCohortMetricsReport>;
    byRouteProfileVersion: Record<number, VoiceCohortMetricsReport>;
    byProvider: Record<string, VoiceCohortMetricsReport>;
  } {
    const overall = this.evaluateCohortMetrics(records, filter);

    const languages = Array.from(new Set(records.map((r) => r.language)));
    const byLanguage: Record<string, VoiceCohortMetricsReport> = {};
    for (const lang of languages) {
      byLanguage[lang] = this.evaluateCohortMetrics(records, {
        ...filter,
        language: lang,
      });
    }

    const versions = Array.from(
      new Set(records.map((r) => r.routeProfileVersion)),
    );
    const byRouteProfileVersion: Record<number, VoiceCohortMetricsReport> = {};
    for (const ver of versions) {
      byRouteProfileVersion[ver] = this.evaluateCohortMetrics(records, {
        ...filter,
        routeProfileVersion: ver,
      });
    }

    const providers = Array.from(new Set(records.map((r) => r.provider)));
    const byProvider: Record<string, VoiceCohortMetricsReport> = {};
    for (const prov of providers) {
      byProvider[prov] = this.evaluateCohortMetrics(records, {
        ...filter,
        provider: prov,
      });
    }

    return {
      overall,
      byLanguage,
      byRouteProfileVersion,
      byProvider,
    };
  }

  // ============================================================================
  // Human Callback SLA Tracking
  // ============================================================================

  public evaluateCallbackSla(
    callbacks: CallbackRecordForSla[],
    breachThresholdSeconds = 600, // 10 minutes default SLA
  ): CallbackSlaReport {
    const totalCallbacks = callbacks.length;
    if (totalCallbacks === 0) {
      return {
        totalCallbacks: 0,
        completedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        breachedCount: 0,
        slaComplianceRate: 1.0,
        averageTimeToFirstContactSeconds: null,
        breachThresholdSeconds,
      };
    }

    let completedCount = 0;
    let pendingCount = 0;
    let cancelledCount = 0;
    let breachedCount = 0;
    let totalContactSeconds = 0;
    let contactedCount = 0;

    const nowMs = Date.now();

    for (const cb of callbacks) {
      const dueMs = new Date(cb.dueAt).getTime();

      if (cb.status === "completed") {
        completedCount++;
        if (cb.completedAt) {
          const completedMs = new Date(cb.completedAt).getTime();
          if (completedMs > dueMs) {
            breachedCount++;
          }
        }
        if (cb.timeToFirstContactSeconds !== undefined) {
          totalContactSeconds += cb.timeToFirstContactSeconds;
          contactedCount++;
        }
      } else if (cb.status === "cancelled") {
        cancelledCount++;
      } else {
        pendingCount++;
        if (nowMs > dueMs) {
          breachedCount++;
        }
      }
    }

    const slaComplianceRate =
      totalCallbacks > 0
        ? Number(((totalCallbacks - breachedCount) / totalCallbacks).toFixed(4))
        : 1.0;

    const averageTimeToFirstContactSeconds =
      contactedCount > 0
        ? Math.round(totalContactSeconds / contactedCount)
        : null;

    return {
      totalCallbacks,
      completedCount,
      pendingCount,
      cancelledCount,
      breachedCount,
      slaComplianceRate,
      averageTimeToFirstContactSeconds,
      breachThresholdSeconds,
    };
  }

  // ============================================================================
  // SD §13.2 Dimensional Alerts Generation
  // Dimension tags: language, routeProfileVersion, provider, brandId
  // ============================================================================

  public evaluateDimensionalAlerts(params: {
    dimensions: VoiceAlertDimensions;
    errorBookingCount?: number;
    duplicateBookingCount?: number;
    crossScopeDeniedCount?: number;
    pendingCommandTimeoutCount?: number;
    recordingCheckpointFailures?: number;
    providerCapacityExceededCount?: number;
    unansweredHandoffCount?: number;
    dispatchUnavailableCount?: number;
    perCallCostTwd?: number;
    costBudgetThresholdTwd?: number;
    workerLeaseConflictCount?: number;
  }): VoiceDimensionalAlert[] {
    const alerts: VoiceDimensionalAlert[] = [];
    const { dimensions } = params;

    // 1. VoiceErrorOrDuplicateBooking
    const totalErrors =
      (params.errorBookingCount ?? 0) + (params.duplicateBookingCount ?? 0);
    if (totalErrors > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceErrorOrDuplicateBooking",
        severity: "critical",
        dimensions,
        summary: `Error or duplicate booking detected on language=${dimensions.language} profile=v${dimensions.routeProfileVersion}`,
        description: `Encountered ${totalErrors} error/duplicate booking events. Halting autonomous creation for affected scope to prevent fraud or wrong dispatch.`,
        metricValue: totalErrors,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. VoiceCrossScopeAccessDenied
    if ((params.crossScopeDeniedCount ?? 0) > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceCrossScopeAccessDenied",
        severity: "critical",
        dimensions,
        summary: `Cross-scope or unauthorized brand access attempted on brand=${dimensions.brandId}`,
        description: `Rejected ${params.crossScopeDeniedCount} cross-brand/tenant access attempts in voice agent boundary.`,
        metricValue: params.crossScopeDeniedCount ?? 0,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 3. VoicePendingCommandTimeout
    if ((params.pendingCommandTimeoutCount ?? 0) > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoicePendingCommandTimeout",
        severity: "high",
        dimensions,
        summary: `Pending command receipt reconciliation timeout on provider=${dimensions.provider}`,
        description: `${params.pendingCommandTimeoutCount} pending booking commands exceeded SLA without receipt. Invoking safe reconciliation.`,
        metricValue: params.pendingCommandTimeoutCount ?? 0,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. VoiceRecordingCheckpointFailure
    if ((params.recordingCheckpointFailures ?? 0) > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceRecordingCheckpointFailure",
        severity: "critical",
        dimensions,
        summary: `Recording checkpoint/finalize verification failed on language=${dimensions.language}`,
        description: `${params.recordingCheckpointFailures} recording verification checks failed. Gating confirmation to prevent unverified transactions.`,
        metricValue: params.recordingCheckpointFailures ?? 0,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 5. VoiceProviderCapacityExceeded
    if ((params.providerCapacityExceededCount ?? 0) > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceProviderCapacityExceeded",
        severity: "high",
        dimensions,
        summary: `Voice provider capacity or quota overflow on provider=${dimensions.provider}`,
        description: `Provider capacity exceeded ${params.providerCapacityExceededCount} times. Activating overflow circuit breaker and human queue fallback.`,
        metricValue: params.providerCapacityExceededCount ?? 0,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 6. VoiceHandoffUnansweredBreach
    if ((params.unansweredHandoffCount ?? 0) > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceHandoffUnansweredBreach",
        severity: "high",
        dimensions,
        summary: `Human handoff queue unanswered SLA breach on language=${dimensions.language}`,
        description: `${params.unansweredHandoffCount} handoff calls left queue unanswered beyond timeout. Scheduling urgent callbacks.`,
        metricValue: params.unansweredHandoffCount ?? 0,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    // 7. VoiceDispatchUnavailableSpike
    if ((params.dispatchUnavailableCount ?? 0) > 3) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceDispatchUnavailableSpike",
        severity: "warning",
        dimensions,
        summary: `Dispatch unavailable spike on brand=${dimensions.brandId}`,
        description: `No-car or dispatch failure count reached ${params.dispatchUnavailableCount}. Reviewing fleet density and zone constraints.`,
        metricValue: params.dispatchUnavailableCount ?? 0,
        threshold: 3,
        timestamp: new Date().toISOString(),
      });
    }

    // 8. VoiceCostAnomalySpike
    const budgetThreshold = params.costBudgetThresholdTwd ?? 50.0;
    if ((params.perCallCostTwd ?? 0) > budgetThreshold) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceCostAnomalySpike",
        severity: "high",
        dimensions,
        summary: `Per-call voice cost exceeded budget threshold on provider=${dimensions.provider}`,
        description: `Per-call cost of ${params.perCallCostTwd?.toFixed(2)} TWD exceeded budget limit of ${budgetThreshold} TWD. Reviewing LLM token and multi-leg telephony usage.`,
        metricValue: params.perCallCostTwd ?? 0,
        threshold: budgetThreshold,
        timestamp: new Date().toISOString(),
      });
    }

    // 9. VoiceWorkerLeaseConflict
    if ((params.workerLeaseConflictCount ?? 0) > 0) {
      alerts.push({
        alertId: randomUUID(),
        alertName: "VoiceWorkerLeaseConflict",
        severity: "critical",
        dimensions,
        summary: `Voice session worker lease conflict on profile=v${dimensions.routeProfileVersion}`,
        description: `Detected ${params.workerLeaseConflictCount} split-brain worker lease transitions. Enforcing CAS epoch fencing.`,
        metricValue: params.workerLeaseConflictCount ?? 0,
        threshold: 0,
        timestamp: new Date().toISOString(),
      });
    }

    return alerts;
  }

  // ============================================================================
  // In-Memory Call Record Aggregation & Session Projection (SD §13.2)
  // ============================================================================

  private readonly callRecords: VoiceCallMetricRecord[] = [];

  public recordCallMetric(record: VoiceCallMetricRecord): void {
    this.callRecords.push(record);
  }

  public getCallRecords(): VoiceCallMetricRecord[] {
    return [...this.callRecords];
  }

  public recordCallMetricFromSession(
    session: {
      voiceSessionId: string;
      callId: string;
      providerAccountId: string;
      providerCallId: string;
      resourceScopeId: string;
      lineBindingId: string;
      routeProfileId: string;
      routeProfileVersion: number;
      dialogState: string;
      mediaState: string;
      controlOwner: string;
      leaseEpoch: number;
      sessionVersion: number;
      commitStatus: string;
      recordingState: string;
      confirmationState: string;
      outcome: string | null;
      createdAt: string | Date;
    },
    extra?: Partial<VoiceCallMetricRecord>,
  ): VoiceCallMetricRecord {
    const isConfirmed =
      session.confirmationState === "accepted" ||
      session.confirmationState === "consumed" ||
      session.confirmationState === "confirmed";
    const isCommitted =
      session.commitStatus === "committed" ||
      session.commitStatus === "succeeded";

    // Playback ACK:
    // SA §1.2 & SD §13.2: "無人有效受理率由確認證據、durable order、派遣受理／結果與實際結果播報 ack 聯合計算，不能直接把 outcome=auto_booking_created 當成功。"
    const playbackAckReceived =
      extra?.playbackAckReceived ??
      (session.dialogState === "closed" &&
        (session.outcome === "auto_booking_created" ||
          session.outcome === "auto_query_completed") &&
        isConfirmed &&
        isCommitted);

    let callCost = extra?.totalCallCost;
    if (callCost === undefined && this.usageService) {
      const records = this.usageService.listUsageRecords({
        voiceSessionId: session.voiceSessionId,
      });
      callCost = records.reduce(
        (sum, r) => sum + (r.actualCost ?? r.estimatedCost ?? 0),
        0,
      );
    }

    const intentDiscernible =
      extra?.intentDiscernible ??
      (session.outcome !== "abandoned" &&
        session.outcome !== "technical_failure" &&
        session.dialogState !== "admitted" &&
        session.dialogState !== "greeting");

    const expressedIntent =
      extra?.expressedIntent ??
      (session.outcome === "auto_query_completed"
        ? "query"
        : session.outcome === "human_handoff"
          ? "other"
          : "new_booking");

    const bookingIntakeCompleted =
      extra?.bookingIntakeCompleted ??
      (expressedIntent === "new_booking" &&
        isConfirmed &&
        isCommitted &&
        playbackAckReceived);

    const record: VoiceCallMetricRecord = {
      callId: session.callId,
      providerCallId: session.providerCallId,
      providerAccountId: session.providerAccountId,
      receivedAt:
        typeof session.createdAt === "string"
          ? session.createdAt
          : session.createdAt.toISOString(),
      lineBindingId: session.lineBindingId,
      brandId: session.resourceScopeId,
      language: extra?.language ?? "zh-TW",
      product: extra?.product ?? "ordinary_taxi",
      routeProfileVersion: session.routeProfileVersion,
      policyVersion: extra?.policyVersion ?? "uv-policy-v1",
      provider: extra?.provider ?? (session.routeProfileId || "twm"),
      admissionOutcome: extra?.admissionOutcome ?? "admitted",
      enteredAi: extra?.enteredAi ?? true,
      intentDiscernible,
      expressedIntent,
      isSupportedBusinessNeed: extra?.isSupportedBusinessNeed ?? true,
      bookingIntakeCompleted,
      hasConfirmationEvidence: isConfirmed,
      hasDurableOrder: isCommitted,
      playbackAckReceived,
      orderCreated: extra?.orderCreated ?? isCommitted,
      orderId: extra?.orderId,
      dispatchRequested:
        extra?.dispatchRequested ??
        (isCommitted && session.outcome === "auto_booking_created"),
      driverAccepted: extra?.driverAccepted,
      dispatchFailureReason: extra?.dispatchFailureReason,
      totalCallCost: callCost ?? 0,
      ...extra,
    };

    this.recordCallMetric(record);
    return record;
  }

  public async deriveCohortFromDurableEvidence(
    filter: CohortEvaluationFilter,
  ): Promise<VoiceCohortMetricsReport> {
    if (!this.repository) {
      return this.evaluateCohortMetrics(this.getCallRecords(), filter);
    }

    const admissions = await this.repository.listCallAdmissions({
      windowStart: filter.windowStart,
      windowEnd: filter.windowEnd,
      brandId: filter.brandId,
    });

    if (admissions.length === 0) {
      return this.evaluateCohortMetrics(this.getCallRecords(), filter);
    }

    const records: VoiceCallMetricRecord[] = [];

    for (const adm of admissions) {
      if (adm.outcome !== "admitted") {
        records.push({
          callId: `adm-${adm.admissionId}`,
          providerCallId: adm.providerCallId,
          providerAccountId: adm.providerAccountId,
          receivedAt: adm.receivedAt,
          lineBindingId: adm.lineBindingId ?? "unknown",
          brandId: adm.brandId ?? "unknown",
          language: filter.language ?? "zh-TW",
          product: "ordinary_taxi",
          routeProfileVersion: filter.routeProfileVersion ?? 1,
          policyVersion: "uv-policy-v1",
          provider: filter.provider ?? "twm",
          admissionOutcome: adm.outcome,
          admissionFailureReason: adm.reason ?? undefined,
          enteredAi: false,
          intentDiscernible: false,
          isSupportedBusinessNeed: false,
          totalCallCost: 0,
          requiredHumanIntervention: true,
          humanInterventionSource:
            adm.outcome === "overflow" ? "capacity_overflow" : "provider_failure",
        });
        continue;
      }

      let session: VoiceSessionRecord | null = null;
      if (adm.voiceSessionId) {
        session = await this.repository.findSessionById(adm.voiceSessionId);
      } else {
        session = await this.repository.findSessionByProviderCall(
          adm.providerAccountId,
          adm.providerCallId,
        );
      }

      if (!session) {
        records.push({
          callId: `adm-${adm.admissionId}`,
          providerCallId: adm.providerCallId,
          providerAccountId: adm.providerAccountId,
          receivedAt: adm.receivedAt,
          lineBindingId: adm.lineBindingId ?? "unknown",
          brandId: adm.brandId ?? "unknown",
          language: filter.language ?? "zh-TW",
          product: "ordinary_taxi",
          routeProfileVersion: filter.routeProfileVersion ?? 1,
          policyVersion: "uv-policy-v1",
          provider: filter.provider ?? "twm",
          admissionOutcome: "admitted",
          enteredAi: true,
          intentDiscernible: false,
          isSupportedBusinessNeed: true,
          totalCallCost: 0,
        });
        continue;
      }

      const usages = await this.repository.findUsageRecordsBySession(
        session.voiceSessionId,
      );
      const callCost = usages.reduce(
        (sum, u) => sum + (u.actualCost ?? u.estimatedCost ?? 0),
        0,
      );
      const hasUnverified = usages.some((u) => u.estimatedCost === 0 && u.actualCost === null);

      const createIntent =
        typeof this.repository.findActiveCreateIntent === "function"
          ? await this.repository.findActiveCreateIntent(session.voiceSessionId)
          : null;
      let confirmation: VoiceConfirmationRecord | null = null;
      if (
        createIntent &&
        typeof (this.repository as any).findActiveConfirmation === "function"
      ) {
        confirmation = await (this.repository as any).findActiveConfirmation(
          createIntent.intentId,
          createIntent.currentDraftVersion,
          createIntent.action,
        );
      }
      const handoff =
        typeof this.repository.findActiveHandoffForSession === "function"
          ? await this.repository.findActiveHandoffForSession(session.voiceSessionId)
          : null;

      const isConfirmed =
        session.confirmationState === "accepted" ||
        session.confirmationState === "consumed" ||
        session.confirmationState === "confirmed" ||
        confirmation?.state === "accepted";

      const isCommitted =
        session.commitStatus === "committed" ||
        session.commitStatus === "succeeded";

      let playbackAckReceived = false;
      if (typeof (this.repository as any).listSessionEvents === "function") {
        const events = await (this.repository as any).listSessionEvents(session.voiceSessionId);
        playbackAckReceived =
          Array.isArray(events) &&
          events.some(
            (e: any) =>
              e.eventType === "playback_terminal" &&
              (e.payload?.playbackStatus === "ack" || e.payload?.status === "ack"),
          );
      }

      const playbackAck =
        (playbackAckReceived || session.dialogState === "closed") &&
        (session.outcome === "auto_booking_created" ||
          session.outcome === "auto_query_completed" ||
          session.outcome === "booking_completed") &&
        isConfirmed &&
        isCommitted;

      const expressedIntent = createIntent
        ? "new_booking"
        : session.outcome === "auto_query_completed"
          ? "query"
          : "new_booking";

      let driverAccepted = false;
      let dispatchFailureReason: VoiceCallMetricRecord["dispatchFailureReason"] = undefined;
      if (isCommitted) {
        const reservations =
          typeof this.repository.findActiveReservationsForOrder === "function"
            ? await this.repository.findActiveReservationsForOrder(session.callId)
            : [];
        if (reservations.length > 0) {
          driverAccepted = true;
        } else if (session.outcome === "auto_no_service") {
          dispatchFailureReason = "no_car_available";
        }
      }

      records.push({
        callId: session.callId,
        providerCallId: session.providerCallId,
        providerAccountId: session.providerAccountId,
        receivedAt: adm.receivedAt,
        lineBindingId: session.lineBindingId,
        brandId: session.resourceScopeId,
        language: filter.language ?? "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: session.routeProfileVersion,
        policyVersion: "uv-policy-v1",
        provider: filter.provider ?? (session.routeProfileId || "twm"),
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: Boolean(createIntent || session.outcome),
        expressedIntent,
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: isConfirmed && isCommitted && playbackAck,
        selfServiceOutcome:
          isConfirmed && isCommitted && playbackAck
            ? "booking_completed"
            : session.outcome === "auto_query_completed"
              ? "query_resolved"
              : undefined,
        hasConfirmationEvidence: isConfirmed,
        hasDurableOrder: isCommitted,
        playbackAckReceived: playbackAck,
        orderCreated: isCommitted,
        dispatchRequested: isCommitted,
        driverAccepted,
        dispatchFailureReason,
        handoffRequired: Boolean(handoff),
        handoffOccurred: session.dialogState === "human_controlled" || session.controlOwner === "human",
        handoffSucceeded: session.outcome === "human_handoff",
        totalCallCost: Number(callCost.toFixed(6)),
        hasUnverifiedCostItems: hasUnverified,
      });
    }

    return this.evaluateCohortMetrics(records, filter);
  }

  public syncActiveAlertMetrics(): void {
    const records = this.getCallRecords();
    if (records.length === 0) return;

    const groups = new Map<
      string,
      {
        labels: VoiceAlertDimensions;
        totalCost: number;
        count: number;
        unansweredHandoff: number;
        errors: number;
      }
    >();

    for (const rec of records) {
      const key = `${rec.language}#${rec.routeProfileVersion}#${rec.provider}#${rec.brandId}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          labels: {
            language: rec.language,
            routeProfileVersion: rec.routeProfileVersion,
            provider: rec.provider,
            brandId: rec.brandId,
          },
          totalCost: 0,
          count: 0,
          unansweredHandoff: 0,
          errors: 0,
        };
        groups.set(key, group);
      }
      const activeGroup = group;
      activeGroup.totalCost += rec.totalCallCost;
      activeGroup.count++;
      if (rec.handoffRequired && !rec.handoffSucceeded) {
        activeGroup.unansweredHandoff++;
      }
      if (rec.errorBookingDiscovered || rec.isKeyFieldMismatchOrUnauthorized) {
        activeGroup.errors++;
      }
    }

    for (const group of groups.values()) {
      const avgCost = group.count > 0 ? group.totalCost / group.count : 0;
      voiceAlertMetrics.setCallUnitCost(
        {
          language: group.labels.language,
          route_profile_version: group.labels.routeProfileVersion,
          provider: group.labels.provider,
          brand_id: group.labels.brandId,
        },
        Number(avgCost.toFixed(4)),
      );

      if (group.unansweredHandoff > 0) {
        voiceAlertMetrics.setHandoffQueueUnansweredCount(
          {
            language: group.labels.language,
            route_profile_version: group.labels.routeProfileVersion,
            provider: group.labels.provider,
            brand_id: group.labels.brandId,
          },
          group.unansweredHandoff,
        );
      }
    }
  }
}
