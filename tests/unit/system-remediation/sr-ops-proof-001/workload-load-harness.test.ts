import { describe, expect, it } from "vitest";
import {
  WORKLOAD_PROFILES,
  calculatePercentiles,
  runAllWorkloadTests,
  runWorkloadLoadTest,
} from "../../../../tools/system-remediation/ops-proof/workload-load-harness.js";

describe("SR-OPS-PROOF-001: Workload Capacity & Latency Harness", () => {
  describe("Workload Profiles and Canonical SLA Baseline", () => {
    it("matches canonical architecture baseline from phase1-operational-workload-sla-degradation-baseline-20260430.md", () => {
      // 1. Booking intake profile
      const booking = WORKLOAD_PROFILES.booking;
      expect(booking.steadyStateReqPerMin).toBe(20);
      expect(booking.burstTargetReqPerMin).toBe(60);
      expect(booking.maxConcurrency).toBe(50);
      expect(booking.latencySlaP95Ms).toBe(2000); // p95 <= 2s
      expect(booking.latencySlaP99Ms).toBe(5000); // p99 <= 5s
      expect(booking.availabilityTargetPercent).toBe(99.9);

      // 2. Dispatch profile
      const dispatch = WORKLOAD_PROFILES.dispatch;
      expect(dispatch.steadyStateReqPerMin).toBe(120);
      expect(dispatch.burstTargetReqPerMin).toBe(300);
      expect(dispatch.maxConcurrency).toBe(500); // 500 open dispatchable orders
      expect(dispatch.latencySlaP95Ms).toBe(10000); // p95 <= 10s
      expect(dispatch.latencySlaP99Ms).toBe(60000); // assignment ready <= 60s
      expect(dispatch.availabilityTargetPercent).toBe(99.9);

      // 3. Report profile
      const report = WORKLOAD_PROFILES.report;
      expect(report.steadyStateReqPerMin).toBe(10);
      expect(report.burstTargetReqPerMin).toBe(30);
      expect(report.maxConcurrency).toBe(50);
      expect(report.latencySlaP95Ms).toBe(3000); // query read p95 <= 3s
      expect(report.latencySlaP99Ms).toBe(5000);
      expect(report.availabilityTargetPercent).toBe(99.0);
    });
  });

  describe("Percentile and Latency Statistics Calculations", () => {
    it("correctly calculates min, p50, p90, p95, p99, max, mean, and stdDev", () => {
      // 100 values from 1 to 100 ms
      const latencies = Array.from({ length: 100 }, (_, i) => i + 1);
      const stats = calculatePercentiles(latencies);

      expect(stats.min).toBe(1);
      expect(stats.max).toBe(100);
      expect(stats.p50).toBe(50);
      expect(stats.p90).toBe(90);
      expect(stats.p95).toBe(95);
      expect(stats.p99).toBe(99);
      expect(stats.mean).toBe(50.5);
      expect(stats.stdDev).toBeGreaterThan(28);
    });

    it("handles empty array gracefully", () => {
      const stats = calculatePercentiles([]);
      expect(stats.min).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.max).toBe(0);
    });
  });

  describe("Individual Workload Runs", () => {
    it("runs booking workload and records raw latencies and SLA compliance", async () => {
      const result = await runWorkloadLoadTest({
        workloadType: "booking",
        mode: "steady-state",
        totalRequests: 20,
        concurrency: 5,
      });

      expect(result.workloadType).toBe("booking");
      expect(result.totalRequests).toBe(20);
      expect(result.successfulRequests).toBe(20);
      expect(result.failedRequests).toBe(0);
      expect(result.errorRatePercent).toBe(0);
      expect(result.latencyP95Ms).toBeLessThanOrEqual(2000);
      expect(result.latencyP99Ms).toBeLessThanOrEqual(5000);
      expect(result.slaP95Passed).toBe(true);
      expect(result.slaP99Passed).toBe(true);
      expect(result.availabilityPassed).toBe(true);
      expect(result.verdict).toBe("PASSED");
      expect(result.statusDistribution[200]).toBe(20);
    });

    it("runs dispatch workload in burst mode with higher concurrency", async () => {
      const result = await runWorkloadLoadTest({
        workloadType: "dispatch",
        mode: "burst",
        totalRequests: 30,
        concurrency: 10,
      });

      expect(result.workloadType).toBe("dispatch");
      expect(result.mode).toBe("burst");
      expect(result.totalRequests).toBe(30);
      expect(result.latencyP95Ms).toBeLessThanOrEqual(10000);
      expect(result.slaP95Passed).toBe(true);
      expect(result.verdict).toBe("PASSED");
    });

    it("runs report workload and verifies export queue SLA", async () => {
      const result = await runWorkloadLoadTest({
        workloadType: "report",
        mode: "steady-state",
        totalRequests: 10,
        concurrency: 4,
      });

      expect(result.workloadType).toBe("report");
      expect(result.totalRequests).toBe(10);
      expect(result.latencyP95Ms).toBeLessThanOrEqual(3000);
      expect(result.slaP95Passed).toBe(true);
      expect(result.verdict).toBe("PASSED");
    });

    it("accurately reports errors and flags SLA breach when latency or errors spike", async () => {
      // Simulate an endpoint with high latency and 500/429 errors
      const degradedHandler = async (i: number) => {
        if (i % 3 === 0) {
          return {
            statusCode: 429,
            durationMs: 4500, // Breaches 2000ms SLA
            error: {
              code: "RATE_LIMITED",
              message: "Concurrent request quota exceeded",
            },
          };
        }
        return {
          statusCode: 200,
          durationMs: 2500, // Breaches 2000ms SLA
        };
      };

      const result = await runWorkloadLoadTest({
        workloadType: "booking",
        totalRequests: 9,
        concurrency: 3,
        customHandler: degradedHandler,
      });

      expect(result.failedRequests).toBe(3);
      expect(result.statusDistribution[429]).toBe(3);
      expect(result.statusDistribution[200]).toBe(6);
      expect(result.rawErrors).toHaveLength(1);
      expect(result.rawErrors[0]?.code).toBe("RATE_LIMITED");
      expect(result.rawErrors[0]?.count).toBe(3);
      expect(result.slaP95Passed).toBe(false); // 4500 > 2000
      expect(result.verdict).toBe("FAILED");
    });
  });

  describe("runAllWorkloadTests Multi-Workload Suite", () => {
    it("runs booking, dispatch, and report workloads together and yields overall report", async () => {
      const report = await runAllWorkloadTests({
        mode: "steady-state",
        requestScale: 0.5, // 10 booking, 15 dispatch, 10 report
        baseSha: "2093cf7e38526a7a7c027600be92004f7275efd3",
      });

      expect(report.overallVerdict).toBe("PASSED");
      expect(report.baseSha).toBe("2093cf7e38526a7a7c027600be92004f7275efd3");
      expect(report.results.booking.verdict).toBe("PASSED");
      expect(report.results.dispatch.verdict).toBe("PASSED");
      expect(report.results.report.verdict).toBe("PASSED");
      expect(report.results.booking.totalRequests).toBe(10);
      expect(report.results.dispatch.totalRequests).toBe(15);
      expect(report.results.report.totalRequests).toBe(10);
    });
  });
});
