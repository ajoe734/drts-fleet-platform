import { describe, expect, it } from "vitest";
import {
  VoiceUsageService,
  type ProviderInvoiceLineItem,
} from "../../apps/api/src/modules/voice-booking/voice-usage.service";
import {
  VoiceBookingMetricsService,
  type VoiceCallMetricRecord,
  type CallbackRecordForSla,
} from "../../apps/api/src/observability/voice-booking-metrics.service";
import {
  formatVoiceCost,
  deriveCohortMetricsPresentation,
  deriveDimensionalAlertPresentation,
} from "../../apps/ops-console-web/app/callcenter/callcenter-metrics-ledger";
import { REALM_COLORS, STATUS_TONES } from "@drts/ui-tokens";

describe("UV-EXEC-022 All-Call Metrics, Complete Cost Ledger & Dimensional Alerts", () => {
  // ============================================================================
  // Suite 1: Cohort Denominator Fixture & Ingress Rules (UV-FR-028, UV-AC-032, cohort_denominator_fixture)
  // ============================================================================
  describe("1. Cohort Denominator Fixture & Ingress Rules (UV-FR-028, UV-AC-032, cohort_denominator_fixture)", () => {
    const fixedCohortRecords: VoiceCallMetricRecord[] = [
      // 1. Valid booking intake & accepted dispatch (Mandarin, v1)
      {
        callId: "call-001",
        providerCallId: "twm-call-001",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:00:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: true,
        selfServiceOutcome: "booking_completed",
        orderCreated: true,
        orderId: "order-101",
        dispatchRequested: true,
        driverAccepted: true,
        totalCallCost: 25.0,
      },
      // 2. Valid booking intake but no driver available (Taiwanese, v2)
      {
        callId: "call-002",
        providerCallId: "twm-call-002",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:05:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "nan",
        product: "ordinary_taxi",
        routeProfileVersion: 2,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: true,
        selfServiceOutcome: "explicit_no_car_handled",
        orderCreated: true,
        orderId: "order-102",
        dispatchRequested: true,
        driverAccepted: false,
        dispatchFailureReason: "no_car_available",
        totalCallCost: 22.0,
      },
      // 3. Caller hung up AFTER booking intent was expressed (Hakka, v2) - MUST stay in denominator!
      {
        callId: "call-003",
        providerCallId: "twm-call-003",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:10:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "hak",
        product: "ordinary_taxi",
        routeProfileVersion: 2,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: false,
        bookingIntakeDropReason: "caller_hangup",
        selfServiceOutcome: "unresolved",
        totalCallCost: 15.0,
      },
      // 4. Tool failure during booking (Mandarin, v1) - MUST stay in denominator!
      {
        callId: "call-004",
        providerCallId: "twm-call-004",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:15:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: false,
        bookingIntakeDropReason: "tool_failure",
        selfServiceOutcome: "unresolved",
        totalCallCost: 18.0,
      },
      // 5. Transfer to human operator (technical handoff)
      {
        callId: "call-005",
        providerCallId: "twm-call-005",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:20:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: false,
        bookingIntakeDropReason: "handoff",
        handoffRequired: true,
        handoffOccurred: true,
        handoffCategory: "technical",
        handoffSucceeded: true,
        requiredHumanIntervention: true,
        humanInterventionSource: "in_ai_handoff",
        totalCallCost: 35.0,
      },
      // 6. Passenger refused confirmation - reported separately
      {
        callId: "call-006",
        providerCallId: "twm-call-006",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:25:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: false,
        bookingIntakeDropReason: "passenger_refused_confirmation",
        passengerRefusedConfirmation: true,
        selfServiceOutcome: "unresolved",
        totalCallCost: 16.0,
      },
      // 7. Successful ride query (Self-service resolved without booking)
      {
        callId: "call-007",
        providerCallId: "twm-call-007",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:30:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "query",
        isSupportedBusinessNeed: true,
        selfServiceOutcome: "query_resolved",
        totalCallCost: 12.0,
      },
      // 8. Capacity overflow (CTI trunk full) - MUST NOT be deleted, stays in total ingress!
      {
        callId: "call-008",
        providerCallId: "twm-call-008",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:35:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "overflow",
        admissionFailureReason: "CAPACITY_EXCEEDED",
        enteredAi: false,
        intentDiscernible: false,
        isSupportedBusinessNeed: false,
        requiredHumanIntervention: true,
        humanInterventionSource: "capacity_overflow",
        totalCallCost: 5.0,
      },
      // 9. Provider failure (ASR websocket crashed during admission) - MUST NOT be deleted!
      {
        callId: "call-009",
        providerCallId: "twm-call-009",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:40:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "failed",
        admissionFailureReason: "PROVIDER_SOCKET_RESET",
        enteredAi: false,
        intentDiscernible: false,
        isSupportedBusinessNeed: false,
        requiredHumanIntervention: true,
        humanInterventionSource: "provider_failure",
        totalCallCost: 4.0,
      },
      // 10. Marked Test Call - MUST be excluded from all operational indicators!
      {
        callId: "call-010-test",
        providerCallId: "twm-call-010-test",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:45:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        isTestCall: true, // EXCLUDED
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: true,
        expressedIntent: "new_booking",
        isSupportedBusinessNeed: true,
        bookingIntakeCompleted: true,
        selfServiceOutcome: "booking_completed",
        totalCallCost: 20.0,
      },
      // 11. Unrecognized Intent (Caller mumbling/background noise) - separate reporting
      {
        callId: "call-011",
        providerCallId: "twm-call-011",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:50:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: false,
        isSupportedBusinessNeed: false,
        unrecognizedIntent: true,
        totalCallCost: 10.0,
      },
      // 12. No Audio Detected - separate reporting
      {
        callId: "call-012",
        providerCallId: "twm-call-012",
        providerAccountId: "twm-acc-01",
        receivedAt: "2026-09-01T10:55:00Z",
        lineBindingId: "line-001",
        brandId: "brand-drts-01",
        language: "zh-TW",
        product: "ordinary_taxi",
        routeProfileVersion: 1,
        policyVersion: "uv-policy-v1",
        provider: "twm",
        admissionOutcome: "admitted",
        enteredAi: true,
        intentDiscernible: false,
        isSupportedBusinessNeed: false,
        noAudioDetected: true,
        totalCallCost: 8.0,
      },
    ];

    it("excludes test calls and includes capacity overflow / provider failure in total ingress", () => {
      const metricsService = new VoiceBookingMetricsService();
      const report = metricsService.evaluateCohortMetrics(fixedCohortRecords, {
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-01T23:59:59Z",
        observationWindowClosed: true,
      });

      // 12 records total, 1 is marked test call -> 11 real ingress calls
      expect(report.deduplicationSummary.testCallsExcluded).toBe(1);
      expect(report.deduplicationSummary.uniqueCallsCount).toBe(11);
      expect(report.allCallCoverage.denominatorRealIngress).toBe(11);

      // Overflow (1) and provider failure (1) are included in denominator, not silently dropped
      expect(report.allCallCoverage.capacityOverflowCount).toBe(1);
      expect(report.allCallCoverage.providerFailureCount).toBe(1);

      // 9 real calls entered AI (calls 1, 2, 3, 4, 5, 6, 7, 11, 12)
      expect(report.allCallCoverage.numeratorEnteredAi).toBe(9);
      expect(report.allCallCoverage.rate).toBe(Number((9 / 11).toFixed(4)));
    });

    it("separates unrecognized intent and no-audio without categorizing them as unsupported", () => {
      const metricsService = new VoiceBookingMetricsService();
      const report = metricsService.evaluateCohortMetrics(fixedCohortRecords, {
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-01T23:59:59Z",
        observationWindowClosed: true,
      });

      // 2 calls had no discernible intent: unrecognized (1) and no audio (1)
      expect(report.supportedScopeProportion.separateReporting.unrecognizedIntentCount).toBe(1);
      expect(report.supportedScopeProportion.separateReporting.noAudioCount).toBe(1);

      // 7 calls had discernible intent (calls 1-7), all 7 were supported needs
      expect(report.supportedScopeProportion.denominatorDiscernibleIntent).toBe(7);
      expect(report.supportedScopeProportion.numeratorInScope).toBe(7);
      expect(report.supportedScopeProportion.rate).toBe(1.0);
    });

    it("keeps post-intent hangups, tool failures, and transfers in unattended intake denominator", () => {
      const metricsService = new VoiceBookingMetricsService();
      const report = metricsService.evaluateCohortMetrics(fixedCohortRecords, {
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-01T23:59:59Z",
        observationWindowClosed: true,
      });

      // Expressed booking intent: calls 1, 2, 3, 4, 5, 6 = 6 calls
      expect(report.unattendedEffectiveIntake.denominatorExpressedBookingIntent).toBe(6);

      // Completed valid intakes: calls 1 and 2 = 2 calls
      expect(report.unattendedEffectiveIntake.numeratorValidIntakes).toBe(2);
      expect(report.unattendedEffectiveIntake.rate).toBe(Number((2 / 6).toFixed(4)));

      // Denominator retained failures:
      expect(report.unattendedEffectiveIntake.retainedFailuresInDenominator.callerHangupsAfterIntent).toBe(1);
      expect(report.unattendedEffectiveIntake.retainedFailuresInDenominator.toolFailures).toBe(1);
      expect(report.unattendedEffectiveIntake.retainedFailuresInDenominator.handoffs).toBe(1);

      // Passenger refused confirmation reported separately:
      expect(report.unattendedEffectiveIntake.separateReporting.passengerRefusedConfirmationCount).toBe(1);
    });

    it("strictly separates autonomous booking intake from actual driver dispatch completion", () => {
      const metricsService = new VoiceBookingMetricsService();
      const report = metricsService.evaluateCohortMetrics(fixedCohortRecords, {
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-01T23:59:59Z",
        observationWindowClosed: true,
      });

      // Valid intakes = 2 (order-101 and order-102)
      // Immediate dispatch orders = 2
      // Only order-101 had driver acceptance! order-102 had no_car_available.
      expect(report.unattendedDispatchCompletion.denominatorImmediateDispatchOrders).toBe(2);
      expect(report.unattendedDispatchCompletion.numeratorDriverAcceptedUniqueOrders).toBe(1);
      expect(report.unattendedDispatchCompletion.rate).toBe(0.5);
      expect(report.unattendedDispatchCompletion.retainedFailuresInDenominator.noCarAvailableCount).toBe(1);
      expect(report.unattendedDispatchCompletion.separationNote).toContain("Autonomous booking intake is strictly separated");
    });

    it("slices cohort across languages, route profile versions, and providers", () => {
      const metricsService = new VoiceBookingMetricsService();
      const multi = metricsService.evaluateMultiDimensionalCohort(fixedCohortRecords, {
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-01T23:59:59Z",
        observationWindowClosed: true,
      });

      expect(multi.overall).toBeDefined();
      expect(multi.byLanguage["zh-TW"]).toBeDefined();
      expect(multi.byLanguage["nan"]).toBeDefined();
      expect(multi.byLanguage["hak"]).toBeDefined();

      // Hakka had 1 call (call-003, hangup after intent)
      const hakkaReport = multi.byLanguage["hak"];
      expect(hakkaReport?.unattendedEffectiveIntake.denominatorExpressedBookingIntent).toBe(1);
      expect(hakkaReport?.unattendedEffectiveIntake.numeratorValidIntakes).toBe(0);

      // Profile version 2 had calls 2 and 3
      const v2Report = multi.byRouteProfileVersion[2];
      expect(v2Report?.deduplicationSummary.uniqueCallsCount).toBe(2);
    });
  });

  // ============================================================================
  // Suite 2: Observation Window Gate & Non-Zero Denominator Cost Handling (SA §10.2, cohort_denominator_fixture)
  // ============================================================================
  describe("2. Observation Window Gate & Non-Zero Denominator Cost Handling (SA §10.2, cohort_denominator_fixture)", () => {
    it("holds cost per successful dispatch as pending when observation window is open", () => {
      const metricsService = new VoiceBookingMetricsService();
      const records: VoiceCallMetricRecord[] = [
        {
          callId: "call-open-1",
          providerCallId: "twm-open-1",
          providerAccountId: "twm-acc",
          receivedAt: "2026-09-09T10:00:00Z",
          lineBindingId: "line-1",
          brandId: "brand-1",
          language: "zh-TW",
          product: "ordinary_taxi",
          routeProfileVersion: 1,
          policyVersion: "uv-policy-v1",
          provider: "twm",
          admissionOutcome: "admitted",
          enteredAi: true,
          intentDiscernible: true,
          expressedIntent: "new_booking",
          isSupportedBusinessNeed: true,
          bookingIntakeCompleted: true,
          orderCreated: true,
          orderId: "ord-open-1",
          dispatchRequested: true,
          driverAccepted: true,
          totalCallCost: 100.0,
        },
      ];

      // Window OPEN
      const openReport = metricsService.evaluateCohortMetrics(records, {
        windowStart: "2026-09-09T00:00:00Z",
        windowEnd: "2026-09-09T23:59:59Z",
        observationWindowClosed: false,
      });

      expect(openReport.costPerSuccessfulDispatch.status).toBe("pending_observation_window");
      expect(openReport.costPerSuccessfulDispatch.cost).toBeNull();
      expect(openReport.costPerSuccessfulDispatch.pendingReason).toContain("Observation window still open");

      // Window CLOSED
      const closedReport = metricsService.evaluateCohortMetrics(records, {
        windowStart: "2026-09-09T00:00:00Z",
        windowEnd: "2026-09-09T23:59:59Z",
        observationWindowClosed: true,
      });

      expect(closedReport.costPerSuccessfulDispatch.status).toBe("settled");
      expect(closedReport.costPerSuccessfulDispatch.cost).toBe(100.0);
    });

    it("does not report zero dollars when effective intake denominator is zero", () => {
      const metricsService = new VoiceBookingMetricsService();
      const failedRecords: VoiceCallMetricRecord[] = [
        {
          callId: "call-fail-1",
          providerCallId: "twm-fail-1",
          providerAccountId: "twm-acc",
          receivedAt: "2026-09-09T10:00:00Z",
          lineBindingId: "line-1",
          brandId: "brand-1",
          language: "zh-TW",
          product: "ordinary_taxi",
          routeProfileVersion: 1,
          policyVersion: "uv-policy-v1",
          provider: "twm",
          admissionOutcome: "admitted",
          enteredAi: true,
          intentDiscernible: true,
          expressedIntent: "new_booking",
          isSupportedBusinessNeed: true,
          bookingIntakeCompleted: false, // ZERO intake
          bookingIntakeDropReason: "caller_hangup",
          totalCallCost: 45.0, // Failed calls still have telephony / ASR costs!
        },
      ];

      const report = metricsService.evaluateCohortMetrics(failedRecords, {
        windowStart: "2026-09-09T00:00:00Z",
        windowEnd: "2026-09-09T23:59:59Z",
        observationWindowClosed: true,
      });

      expect(report.costPerEffectiveIntake.cost).toBeNull();
      expect(report.costPerEffectiveIntake.zeroDenominatorReason).toContain(
        "Zero valid booking intakes in cohort; per-intake unit cost cannot be evaluated as zero dollars",
      );
    });
  });

  // ============================================================================
  // Suite 3: Rate Card Lifecycle, Validity & Unverified Gate (SD §14.3, usage_cost_reconciliation_evidence)
  // ============================================================================
  describe("3. Rate Card Lifecycle, Validity & Unverified Gate (SD §14.3, usage_cost_reconciliation_evidence)", () => {
    it("manages append-only rate cards preserving currency, tax, granularity, validity, and conditions", () => {
      const usageService = new VoiceUsageService();

      const rc1 = usageService.publishRateCard({
        rateCardId: "rc-openai-realtime-voice",
        provider: "openai",
        serviceType: "llm",
        currency: "USD",
        taxInclusive: false,
        unitPrice: 0.06, // $0.06 / minute
        billingUnit: "minute",
        roundingRule: "ceil_minute",
        effectiveFrom: "2026-09-01T00:00:00Z",
        effectiveUntil: "2026-12-31T23:59:59Z",
        unverified: false,
        conditions: {
          exchangeRateDate: "2026-09-01",
          exchangeRateToTwd: 32.0,
        },
      });

      expect(rc1.rateCardId).toBe("rc-openai-realtime-voice");
      expect(rc1.version).toBe(1);
      expect(rc1.currency).toBe("USD");
      expect(rc1.taxInclusive).toBe(false);
      expect(rc1.billingUnit).toBe("minute");
      expect(rc1.roundingRule).toBe("ceil_minute");

      // Publishing an update creates append-only version 2
      const rc2 = usageService.publishRateCard({
        rateCardId: "rc-openai-realtime-voice",
        provider: "openai",
        serviceType: "llm",
        currency: "USD",
        taxInclusive: false,
        unitPrice: 0.05, // discounted
        billingUnit: "minute",
        roundingRule: "ceil_minute",
        effectiveFrom: "2026-10-01T00:00:00Z",
        unverified: false,
      });

      expect(rc2.version).toBe(2);
      expect(rc2.unitPrice).toBe(0.05);

      // Historical version 1 is unchanged
      const fetchedV1 = usageService.getRateCard("rc-openai-realtime-voice", 1);
      expect(fetchedV1?.version).toBe(1);
      expect(fetchedV1?.unitPrice).toBe(0.06);

      // Latest points to version 2
      const latest = usageService.getRateCard("rc-openai-realtime-voice");
      expect(latest?.version).toBe(2);
    });

    it("enforces unverified rate gate: cannot default to zero/free cost (SD §14.3)", () => {
      const usageService = new VoiceUsageService();

      // Reject unverified service configured with 0 unitPrice
      expect(() =>
        usageService.publishRateCard({
          rateCardId: "rc-unverified-vendor",
          provider: "unverified-vendor",
          serviceType: "asr",
          unitPrice: 0,
          billingUnit: "minute",
          unverified: true,
        }),
      ).toThrowError(
        expect.objectContaining({
          status: 400,
          code: "UNVERIFIED_PRICE_CANNOT_BE_FREE",
        }),
      );

      // Allowed when unit price is non-zero but marked unverified
      const unverifiedCard = usageService.publishRateCard({
        rateCardId: "rc-unverified-vendor",
        provider: "unverified-vendor",
        serviceType: "asr",
        unitPrice: 1.5,
        billingUnit: "minute",
        unverified: true,
        unverifiedReasons: ["Supplier quotation pending procurement approval"],
      });

      expect(unverifiedCard.unverified).toBe(true);
      expect(unverifiedCard.unverifiedReasons).toContain("Supplier quotation pending procurement approval");
    });
  });

  // ============================================================================
  // Suite 4: Raw Metering, Deduplication & PII Protection (SD §14.3, usage_cost_reconciliation_evidence)
  // ============================================================================
  describe("4. Raw Metering, Deduplication & PII Protection (SD §14.3, usage_cost_reconciliation_evidence)", () => {
    it("deduplicates retried usage callbacks against providerUsageRef without double-counting", () => {
      const usageService = new VoiceUsageService();

      const entry1 = usageService.recordUsage({
        providerAccountId: "twm-acc-01",
        providerUsageRef: "twm-inv-item-9988",
        provider: "twm",
        serviceType: "asr",
        billingUnit: "minute",
        quantity: 180, // 180s = 3m
        estimatedCost: 2.22,
      });

      expect(entry1.usageId).toBeDefined();
      expect(entry1.providerUsageRef).toBe("twm-inv-item-9988");

      // Retried webhook callback with identical provider ref returns the same record
      const entry2 = usageService.recordUsage({
        providerAccountId: "twm-acc-01",
        providerUsageRef: "twm-inv-item-9988",
        provider: "twm",
        serviceType: "asr",
        billingUnit: "minute",
        quantity: 180,
      });

      expect(entry2.usageId).toBe(entry1.usageId);
      expect(usageService.listUsageRecords().length).toBe(1);
    });

    it("strictly sanitizes and strips customer transcript and speech utterances from billing rows", () => {
      const usageService = new VoiceUsageService();

      const record = usageService.recordUsage({
        providerAccountId: "twm-acc-01",
        providerUsageRef: "twm-rec-pii-check",
        provider: "twm",
        serviceType: "asr",
        billingUnit: "second",
        quantity: 120,
        metadata: {
          codec: "pcm_8khz",
          networkRegion: "tw-taipei",
          // Sensitive fields that MUST NOT be stored in billing row (SD §14.3)
          transcript: "我要去台大醫院，電話是 0912345678",
          callerUtterance: "我的信用卡號碼是 4111222233334444",
          speechText: "確認叫車",
        },
      });

      expect(record.metadata?.codec).toBe("pcm_8khz");
      expect(record.metadata?.networkRegion).toBe("tw-taipei");
      expect(record.metadata?.transcript).toBeUndefined();
      expect(record.metadata?.callerUtterance).toBeUndefined();
      expect(record.metadata?.speechText).toBeUndefined();
    });
  });

  // ============================================================================
  // Suite 5: Complete Per-Call Cost Breakdown & Invoice Reconciliation (SD §14.3, usage_cost_reconciliation_evidence)
  // ============================================================================
  describe("5. Complete Per-Call Cost Breakdown & Invoice Reconciliation (SD §14.3, usage_cost_reconciliation_evidence)", () => {
    it("calculates exact standard per-call cost matching SD §14.3 (ASR 3m + TTS 200 chars = 2.345 TWD)", () => {
      const usageService = new VoiceUsageService();

      const cost = usageService.calculateCallCost({
        durationSeconds: 0, // exclude telephony for exact SD §14.3 baseline comparison
        asrSeconds: 180, // 3 minutes
        ttsCharacters: 200, // 200 chars
      });

      // 3 * 0.74 = 2.22
      // 200 / 1,000,000 * 625 = 0.125
      // 2.22 + 0.125 = 2.345 TWD
      expect(cost.totalEstimatedCost).toBe(2.345);
      expect(cost.items.find((i) => i.serviceType === "asr")?.cost).toBe(2.22);
      expect(cost.items.find((i) => i.serviceType === "tts")?.cost).toBe(0.125);
    });

    it("computes full multi-component call cost: telephony + ASR + TTS + LLM + storage + operator", () => {
      const usageService = new VoiceUsageService();

      const fullCall = usageService.calculateCallCost({
        durationSeconds: 180, // 3 mins telephony leg
        telephonyLegCount: 2, // 2 legs (caller + warm transfer)
        asrSeconds: 120, // 2 mins ASR
        ttsCharacters: 300,
        llmInputTokens: 1000,
        llmOutputTokens: 200,
        storageMegabytes: 5,
        humanOperatorSeconds: 60, // 1 min operator time
        notificationCount: 1, // 1 SMS
      });

      expect(fullCall.items.length).toBe(7);
      expect(fullCall.totalEstimatedCost).toBeGreaterThan(5.0);
      expect(fullCall.isFailedCallOrAdmission).toBe(false);
    });

    it("reconciles provider invoice without overwriting estimated cost, tracking adjustment variance (SD §14.3)", () => {
      const usageService = new VoiceUsageService();

      // Record 2 initial estimated usage rows
      const rec1 = usageService.recordUsage({
        providerAccountId: "twm-telco-01",
        providerUsageRef: "line-item-101",
        provider: "twm",
        serviceType: "telephony",
        billingUnit: "minute",
        quantity: 180,
        estimatedCost: 1.80, // estimate: 3 mins @ 0.60 = 1.80
      });

      const rec2 = usageService.recordUsage({
        providerAccountId: "twm-telco-01",
        providerUsageRef: "line-item-102",
        provider: "twm",
        serviceType: "asr",
        billingUnit: "minute",
        quantity: 120,
        estimatedCost: 1.48, // estimate: 2 mins @ 0.74 = 1.48
      });

      // Provider issues invoice batch with slight variance and 1 unmatched unexpected line
      const invoiceLines: ProviderInvoiceLineItem[] = [
        {
          providerAccountId: "twm-telco-01",
          providerUsageRef: "line-item-101",
          serviceType: "telephony",
          quantity: 180,
          billingUnit: "minute",
          billedCost: 1.80, // Exact match
          currency: "TWD",
          invoiceRef: "INV-2026-09-001",
          invoiceDate: "2026-09-05",
        },
        {
          providerAccountId: "twm-telco-01",
          providerUsageRef: "line-item-102",
          serviceType: "asr",
          quantity: 120,
          billingUnit: "minute",
          billedCost: 1.55, // Actual was 1.55 instead of 1.48 (due to silence rounding)
          currency: "TWD",
          invoiceRef: "INV-2026-09-001",
          invoiceDate: "2026-09-05",
        },
        {
          providerAccountId: "twm-telco-01",
          providerUsageRef: "line-item-unmatched-103",
          serviceType: "telephony",
          quantity: 60,
          billingUnit: "minute",
          billedCost: 0.60, // Unmatched line
          currency: "TWD",
          invoiceRef: "INV-2026-09-001",
          invoiceDate: "2026-09-05",
        },
      ];

      const report = usageService.reconcileInvoice(
        "INV-2026-09-001",
        "twm-telco-01",
        invoiceLines,
      );

      // 1. Invariant: estimatedCost is NEVER overwritten!
      const updatedRec1 = usageService.getUsageRecord(rec1.usageId);
      expect(updatedRec1?.estimatedCost).toBe(1.80);
      expect(updatedRec1?.actualCost).toBe(1.80);
      expect(updatedRec1?.reconciliationAdjustment).toBe(0);

      const updatedRec2 = usageService.getUsageRecord(rec2.usageId);
      expect(updatedRec2?.estimatedCost).toBe(1.48); // STILL 1.48! Not overwritten by 1.55
      expect(updatedRec2?.actualCost).toBe(1.55);
      expect(updatedRec2?.reconciliationAdjustment).toBe(0.07);

      // 2. Report summary
      expect(report.matchedCount).toBe(2);
      expect(report.unmatchedInvoiceLines).toBe(1);
      expect(report.totalEstimatedCost).toBe(3.28); // 1.80 + 1.48
      expect(report.totalBilledCost).toBe(3.95); // 1.80 + 1.55 + 0.60
      expect(report.netVariance).toBe(0.67);
      expect(report.status).toBe("variance_flagged");
    });
  });

  // ============================================================================
  // Suite 6: Dimensional Alerts & Callback SLA Tracking (SD §13.2, alerts_dimension_evidence)
  // ============================================================================
  describe("6. Dimensional Alerts & Callback SLA Tracking (SD §13.2, alerts_dimension_evidence)", () => {
    it("generates all 9 SD §13.2 alert types with language, profile, provider, and brand dimensions", () => {
      const metricsService = new VoiceBookingMetricsService();
      const dimensions = {
        language: "nan",
        routeProfileVersion: 2,
        provider: "twm",
        brandId: "brand-drts-01",
      };

      const alerts = metricsService.evaluateDimensionalAlerts({
        dimensions,
        errorBookingCount: 1,
        duplicateBookingCount: 0,
        crossScopeDeniedCount: 2,
        pendingCommandTimeoutCount: 1,
        recordingCheckpointFailures: 1,
        providerCapacityExceededCount: 5,
        unansweredHandoffCount: 2,
        dispatchUnavailableCount: 6,
        perCallCostTwd: 65.0,
        costBudgetThresholdTwd: 50.0,
        workerLeaseConflictCount: 1,
      });

      expect(alerts.length).toBe(9);

      const alertNames = alerts.map((a) => a.alertName);
      expect(alertNames).toContain("VoiceErrorOrDuplicateBooking");
      expect(alertNames).toContain("VoiceCrossScopeAccessDenied");
      expect(alertNames).toContain("VoicePendingCommandTimeout");
      expect(alertNames).toContain("VoiceRecordingCheckpointFailure");
      expect(alertNames).toContain("VoiceProviderCapacityExceeded");
      expect(alertNames).toContain("VoiceHandoffUnansweredBreach");
      expect(alertNames).toContain("VoiceDispatchUnavailableSpike");
      expect(alertNames).toContain("VoiceCostAnomalySpike");
      expect(alertNames).toContain("VoiceWorkerLeaseConflict");

      // Verify every alert carries the exact dimensions
      for (const alert of alerts) {
        expect(alert.dimensions.language).toBe("nan");
        expect(alert.dimensions.routeProfileVersion).toBe(2);
        expect(alert.dimensions.provider).toBe("twm");
        expect(alert.dimensions.brandId).toBe("brand-drts-01");
      }
    });

    it("evaluates human callback SLA adherence and breach detection (SA §10.1 / SD §13.2)", () => {
      const metricsService = new VoiceBookingMetricsService();

      const callbacks: CallbackRecordForSla[] = [
        // Completed within SLA
        {
          taskId: "cb-1",
          dueAt: "2026-09-09T10:10:00Z",
          completedAt: "2026-09-09T10:05:00Z",
          status: "completed",
          timeToFirstContactSeconds: 120,
        },
        // Completed AFTER SLA (breached)
        {
          taskId: "cb-2",
          dueAt: "2026-09-09T10:10:00Z",
          completedAt: "2026-09-09T10:15:00Z",
          status: "completed",
          timeToFirstContactSeconds: 450,
        },
        // Cancelled
        {
          taskId: "cb-3",
          dueAt: "2026-09-09T10:10:00Z",
          status: "cancelled",
        },
        // Pending and overdue (breached)
        {
          taskId: "cb-4",
          dueAt: "2026-09-01T10:00:00Z", // past
          status: "pending",
        },
      ];

      const slaReport = metricsService.evaluateCallbackSla(callbacks);

      expect(slaReport.totalCallbacks).toBe(4);
      expect(slaReport.completedCount).toBe(2);
      expect(slaReport.cancelledCount).toBe(1);
      expect(slaReport.breachedCount).toBe(2); // cb-2 and cb-4
      expect(slaReport.slaComplianceRate).toBe(0.5); // 2/4 = 50%
      expect(slaReport.averageTimeToFirstContactSeconds).toBe(Math.round((120 + 450) / 2));
    });
  });

  // ============================================================================
  // Suite 7: UI Presentation Helpers & Design Contract Compliance
  // ============================================================================
  describe("7. UI Presentation Helpers & Design Contract Compliance", () => {
    it("formats costs and separates intake from dispatch in UI view", () => {
      expect(formatVoiceCost(12.3456)).toBe("12.35 TWD");
      expect(formatVoiceCost(null)).toBe("--");

      const view = deriveCohortMetricsPresentation({
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-02T00:00:00Z",
        observationWindowClosed: true,
        totalRealIngress: 100,
        callsEnteredAi: 90,
        expressedBookingIntent: 80,
        validBookingIntakes: 72,
        immediateDispatchOrders: 70,
        driverAcceptedOrders: 56,
        transferCalls: 8,
        errorBookings: 0,
        totalCostTwd: 1440,
      });

      expect(view.effectiveIntakeRateFormatted).toBe("90.0%");
      expect(view.dispatchRateFormatted).toBe("80.0%");
      expect(view.costPerEffectiveIntakeFormatted).toBe("20.00 TWD");
      expect(view.costPerSuccessfulDispatchFormatted).toBe("25.71 TWD");
    });

    it("adheres strictly to @drts/ui-tokens realm tokens and status tones", () => {
      const alertBadge = deriveDimensionalAlertPresentation({
        alertId: "alert-test-ui",
        alertName: "VoiceCostAnomalySpike",
        severity: "high",
        language: "zh-TW",
        routeProfileVersion: 1,
        provider: "twm",
        brandId: "brand-drts-01",
        summary: "Cost spike detected",
        mode: "dark",
      });

      expect(alertBadge.realmColor.fg).toBe(REALM_COLORS.tenant.dark.fg);
      expect(alertBadge.severityColor.fg).toBe(STATUS_TONES.warning.dark.fg);
    });
  });
});
