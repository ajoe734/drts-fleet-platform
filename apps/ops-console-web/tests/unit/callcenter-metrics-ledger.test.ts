import { describe, expect, it } from "vitest";
import {
  formatVoiceCost,
  deriveCohortMetricsPresentation,
  deriveDimensionalAlertPresentation,
  deriveCallbackSlaPresentation,
} from "../../app/callcenter/callcenter-metrics-ledger";
import { REALM_COLORS, STATUS_TONES } from "@drts/ui-tokens";

describe("callcenter-metrics-ledger domain helpers & UI contract", () => {
  describe("formatVoiceCost", () => {
    it("formats amounts in TWD cleanly", () => {
      expect(formatVoiceCost(2.345)).toBe("2.35 TWD");
      expect(formatVoiceCost(0)).toBe("0.00 TWD");
      expect(formatVoiceCost(null)).toBe("--");
      expect(formatVoiceCost(undefined)).toBe("--");
    });
  });

  describe("deriveCohortMetricsPresentation (SA §10.2 / SD §13.2 / SD §14.3)", () => {
    it("separates autonomous booking intake from driver dispatch completion", () => {
      const pres = deriveCohortMetricsPresentation({
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-02T00:00:00Z",
        observationWindowClosed: true,
        totalRealIngress: 100,
        callsEnteredAi: 90,
        expressedBookingIntent: 80,
        validBookingIntakes: 72, // 90% intake
        immediateDispatchOrders: 70,
        driverAcceptedOrders: 56, // 80% dispatch
        transferCalls: 10,
        errorBookings: 0,
        totalCostTwd: 1800,
      });

      expect(pres.coverageRateFormatted).toBe("90.0%");
      expect(pres.effectiveIntakeRateFormatted).toBe("90.0%");
      expect(pres.dispatchRateFormatted).toBe("80.0%");
      expect(pres.effectiveIntakeCount).toBe(72);
      expect(pres.driverAcceptedOrdersCount).toBe(56);
      expect(pres.costPerEffectiveIntakeFormatted).toBe("25.00 TWD");
      expect(pres.costPerSuccessfulDispatchFormatted).toBe("32.14 TWD");
      expect(pres.costPerSuccessfulDispatchStatus).toBe("settled");
    });

    it("holds costPerSuccessfulDispatch as pending when observation window is open", () => {
      const pres = deriveCohortMetricsPresentation({
        windowStart: "2026-09-09T00:00:00Z",
        windowEnd: "2026-09-09T12:00:00Z",
        observationWindowClosed: false, // Window open!
        totalRealIngress: 50,
        callsEnteredAi: 45,
        expressedBookingIntent: 40,
        validBookingIntakes: 36,
        immediateDispatchOrders: 35,
        driverAcceptedOrders: 20,
        transferCalls: 5,
        errorBookings: 0,
        totalCostTwd: 1000,
      });

      expect(pres.costPerSuccessfulDispatchStatus).toBe("pending_observation_window");
      expect(pres.costPerSuccessfulDispatchFormatted).toContain("待觀察窗口結算");
      expect(pres.pendingReason).toContain("需等待固定觀察窗口結束");
    });

    it("does not report zero dollars when valid booking intakes is zero", () => {
      const pres = deriveCohortMetricsPresentation({
        windowStart: "2026-09-01T00:00:00Z",
        windowEnd: "2026-09-02T00:00:00Z",
        observationWindowClosed: true,
        totalRealIngress: 10,
        callsEnteredAi: 10,
        expressedBookingIntent: 5,
        validBookingIntakes: 0, // Zero intake!
        immediateDispatchOrders: 0,
        driverAcceptedOrders: 0,
        transferCalls: 5,
        errorBookings: 0,
        totalCostTwd: 250,
      });

      expect(pres.costPerEffectiveIntakeFormatted).not.toBe("0.00 TWD");
      expect(pres.costPerEffectiveIntakeFormatted).toContain("N/A");
    });
  });

  describe("deriveDimensionalAlertPresentation (Realm tokens & Alert dimensions)", () => {
    it("decorates dimensional alerts with realm tokens and status tones", () => {
      const alert = deriveDimensionalAlertPresentation({
        alertId: "alert-001",
        alertName: "VoiceErrorOrDuplicateBooking",
        severity: "critical",
        language: "nan",
        routeProfileVersion: 2,
        provider: "twm",
        brandId: "brand-drts-01",
        summary: "Error booking detected on Taiwanese dialect",
      });

      expect(alert.language).toBe("nan");
      expect(alert.routeProfileVersion).toBe(2);
      expect(alert.provider).toBe("twm");
      expect(alert.brandId).toBe("brand-drts-01");
      expect(alert.severity).toBe("critical");
      expect(alert.severityColor.fg).toBe(STATUS_TONES.danger.dark.fg);
      expect(alert.realmColor.fg).toBe(REALM_COLORS.tenant.dark.fg);
    });
  });

  describe("deriveCallbackSlaPresentation", () => {
    it("evaluates callback SLA metrics and tone correctly", () => {
      const sla = deriveCallbackSlaPresentation({
        totalCallbacks: 20,
        completedCount: 18,
        breachedCount: 1, // 19/20 = 95% compliance
        averageFirstContactSeconds: 180,
      });

      expect(sla.completedWithinSla).toBe(17);
      expect(sla.breachedCount).toBe(1);
      expect(sla.complianceRateFormatted).toBe("95.0%");
      expect(sla.averageFirstContactMinutes).toBe("3.0 分鐘");
      expect(sla.statusTone).toBe("success");
    });

    it("triggers danger tone when SLA drops below 85%", () => {
      const breachedSla = deriveCallbackSlaPresentation({
        totalCallbacks: 10,
        completedCount: 8,
        breachedCount: 3, // 70% compliance
      });

      expect(breachedSla.statusTone).toBe("danger");
      expect(breachedSla.complianceRateFormatted).toBe("70.0%");
    });
  });
});
