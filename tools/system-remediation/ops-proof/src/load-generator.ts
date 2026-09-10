/**
 * Multi-Family Load Generator & SLO Evaluator
 *
 * Executes representative load testing across Booking, Dispatch, and Reporting families.
 * Acceptance criteria: "負載包含booking/dispatch/report三種；閾值來自已確認基準且輸出原始延遲與錯誤。"
 * Guardrail: Real operation adapters and measured latency/errors with confirmed SLO; missing target must report not-run, not PASS.
 */

import http from "node:http";
import { WORKLOAD_BASELINES, FamilyBaseline } from "./workload-baseline-contracts";

export interface RawErrorRecord {
  timestamp: string;
  family: "booking" | "dispatch" | "report";
  operation: string;
  error: string;
  code?: string | undefined;
  durationMs: number;
  payloadRef?: string | undefined;
}

export interface LatencyStatistics {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface FamilyLoadTestResult {
  family: "booking" | "dispatch" | "report";
  baseline: FamilyBaseline;
  status: "completed" | "not_run" | "failed";
  profile: "steady_state" | "burst" | "custom";
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePct: number;
  rawLatencies: number[];
  rawErrors: RawErrorRecord[];
  statistics: LatencyStatistics;
  sloEvaluation: {
    p95Compliant: boolean;
    p99Compliant?: boolean | undefined;
    availabilityCompliant: boolean;
    allPassed: boolean;
    breaches: string[];
  };
  note?: string | undefined;
}

export interface ConsolidatedLoadReport {
  timestamp: string;
  overallPassed: boolean;
  status: "completed" | "not_run" | "failed";
  families: {
    booking: FamilyLoadTestResult;
    dispatch: FamilyLoadTestResult;
    report: FamilyLoadTestResult;
  };
  totalRequestsAcrossFamilies: number;
  totalErrorsAcrossFamilies: number;
  summaryZh: string;
}

/**
 * Calculates statistical percentiles from raw latency numbers.
 */
export function calculatePercentiles(latencies: number[]): LatencyStatistics {
  if (latencies.length === 0) {
    return {
      count: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  const getPercentile = (p: number): number => {
    const index = Math.ceil((p / 100) * count) - 1;
    return sorted[Math.max(0, Math.min(index, count - 1))] ?? 0;
  };

  return {
    count,
    minMs: Math.round((sorted[0] ?? 0) * 100) / 100,
    maxMs: Math.round((sorted[count - 1] ?? 0) * 100) / 100,
    meanMs: Math.round((sum / count) * 100) / 100,
    p50Ms: Math.round(getPercentile(50) * 100) / 100,
    p90Ms: Math.round(getPercentile(90) * 100) / 100,
    p95Ms: Math.round(getPercentile(95) * 100) / 100,
    p99Ms: Math.round(getPercentile(99) * 100) / 100,
  };
}

export interface LoadOperationExecutor {
  execute(family: "booking" | "dispatch" | "report", index: number): Promise<{ durationMs: number; error?: string; code?: string }>;
}

export interface LoadTestRunConfig {
  sampleCount?: number | undefined;
  profile?: "steady_state" | "burst" | "custom" | undefined;
  targetUrl?: string | undefined;
  selfTest?: boolean | undefined;
  executor?: LoadOperationExecutor | undefined;
  simulateFaultRate?: number | undefined;
}

/**
 * Creates an in-process local HTTP server for self-test load execution.
 * Measures real loopback HTTP network roundtrip latency without Math.random.
 */
export async function startSelfTestServer(faultRate: number = 0): Promise<{ server: http.Server; url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const isFault = Math.random() < faultRate;
    if (isFault) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Simulated load fault", code: "ERR_LOAD_FAULT" }));
      return;
    }

    if (req.url?.startsWith("/api/v1/orders") || req.url?.startsWith("/booking")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "created", orderId: "ord-test" }));
    } else if (req.url?.startsWith("/api/v1/dispatch") || req.url?.startsWith("/dispatch")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "assigned", jobId: "job-test" }));
    } else if (req.url?.startsWith("/api/v1/reports") || req.url?.startsWith("/report")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "queued", reportId: "rep-test" }));
    } else if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", database: "connected" }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;

  return {
    server,
    url,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export class LoadGenerator {
  /**
   * Runs load test family using a real operation executor or target URL.
   * If no target is provided and selfTest is false, reports not-run, not PASS.
   */
  public async runFamilyLoad(
    familyKey: "booking" | "dispatch" | "report",
    config?: LoadTestRunConfig,
  ): Promise<FamilyLoadTestResult> {
    const baseline = WORKLOAD_BASELINES[familyKey];
    const profile = config?.profile ?? "steady_state";
    const sampleCount = config?.sampleCount ?? (profile === "burst" ? (familyKey === "dispatch" ? 100 : 40) : (familyKey === "dispatch" ? 50 : 20));

    // Guard: missing target must report not-run, not PASS
    if (!config?.targetUrl && !config?.executor && !config?.selfTest) {
      return {
        family: familyKey,
        baseline,
        status: "not_run",
        profile,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        errorRatePct: 0,
        rawLatencies: [],
        rawErrors: [],
        statistics: calculatePercentiles([]),
        sloEvaluation: {
          p95Compliant: false,
          p99Compliant: false,
          availabilityCompliant: false,
          allPassed: false,
          breaches: [`未指定目標 URL (--target-url)。真實 ${baseline.familyName} 操作需目標服務；依規範未執行回報 not-run，不冒充 PASS。`],
        },
        note: "Missing target URL. Reporting not-run.",
      };
    }

    let targetBaseUrl = config?.targetUrl;
    let cleanupServer: (() => Promise<void>) | null = null;

    if (config?.selfTest && !targetBaseUrl && !config?.executor) {
      const helper = await startSelfTestServer(config?.simulateFaultRate ?? 0);
      targetBaseUrl = helper.url;
      cleanupServer = helper.close;
    }

    const rawLatencies: number[] = [];
    const rawErrors: RawErrorRecord[] = [];

    try {
      for (let i = 0; i < sampleCount; i++) {
        if (config?.executor) {
          const res = await config.executor.execute(familyKey, i);
          rawLatencies.push(res.durationMs);
          if (res.error) {
            rawErrors.push({
              timestamp: new Date().toISOString(),
              family: familyKey,
              operation: `${familyKey}_operation`,
              error: res.error,
              code: res.code,
              durationMs: res.durationMs,
              payloadRef: `REQ-${i + 1}`,
            });
          }
        } else if (targetBaseUrl) {
          const endpointMap: Record<string, string> = {
            booking: `${targetBaseUrl}/api/v1/orders`,
            dispatch: `${targetBaseUrl}/api/v1/dispatch/queue`,
            report: `${targetBaseUrl}/api/v1/reports`,
          };
          const url = endpointMap[familyKey] ?? targetBaseUrl;

          const start = performance.now();
          try {
            const fetchInit: RequestInit = {
              method: familyKey === "booking" ? "POST" : "GET",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(10000),
            };
            if (familyKey === "booking") {
              fetchInit.body = JSON.stringify({ pickup_address: "Taipei Main Station" });
            }

            const resp = await fetch(url, fetchInit);
            const elapsed = Math.round((performance.now() - start) * 100) / 100;
            rawLatencies.push(elapsed);

            if (!resp.ok) {
              rawErrors.push({
                timestamp: new Date().toISOString(),
                family: familyKey,
                operation: `${familyKey}_http_request`,
                error: `HTTP ${resp.status} ${resp.statusText}`,
                code: `HTTP_${resp.status}`,
                durationMs: elapsed,
                payloadRef: `REQ-${i + 1}`,
              });
            }
          } catch (err: any) {
            const elapsed = Math.round((performance.now() - start) * 100) / 100;
            rawLatencies.push(elapsed);
            rawErrors.push({
              timestamp: new Date().toISOString(),
              family: familyKey,
              operation: `${familyKey}_http_request`,
              error: err.message,
              code: err.code ?? "ERR_NETWORK",
              durationMs: elapsed,
              payloadRef: `REQ-${i + 1}`,
            });
          }
        }
      }
    } finally {
      if (cleanupServer) {
        await cleanupServer();
      }
    }

    const statistics = calculatePercentiles(rawLatencies);
    const failedRequests = rawErrors.length;
    const successfulRequests = sampleCount - failedRequests;
    const errorRatePct = sampleCount > 0 ? Math.round((failedRequests / sampleCount) * 10000) / 100 : 0;

    const breaches: string[] = [];
    const p95Compliant = statistics.p95Ms <= baseline.latencySlo.p95TargetMs;
    if (!p95Compliant) {
      breaches.push(`${baseline.familyName} p95 latency (${statistics.p95Ms}ms) breached target (${baseline.latencySlo.p95TargetMs}ms)`);
    }

    let p99Compliant: boolean | undefined = undefined;
    if (baseline.latencySlo.p99TargetMs !== undefined) {
      p99Compliant = statistics.p99Ms <= baseline.latencySlo.p99TargetMs;
      if (!p99Compliant) {
        breaches.push(`${baseline.familyName} p99 latency (${statistics.p99Ms}ms) breached target (${baseline.latencySlo.p99TargetMs}ms)`);
      }
    }

    const availabilityCompliant = errorRatePct <= baseline.maxErrorRatePct;
    if (!availabilityCompliant) {
      breaches.push(`${baseline.familyName} error rate (${errorRatePct}%) breached max threshold (${baseline.maxErrorRatePct}%)`);
    }

    const allPassed = p95Compliant && (p99Compliant ?? true) && availabilityCompliant;

    return {
      family: familyKey,
      baseline,
      status: allPassed ? "completed" : "failed",
      profile,
      totalRequests: sampleCount,
      successfulRequests,
      failedRequests,
      errorRatePct,
      rawLatencies,
      rawErrors,
      statistics,
      sloEvaluation: {
        p95Compliant,
        p99Compliant,
        availabilityCompliant,
        allPassed,
        breaches,
      },
    };
  }

  public async runBookingLoad(config?: LoadTestRunConfig): Promise<FamilyLoadTestResult> {
    return this.runFamilyLoad("booking", config);
  }

  public async runDispatchLoad(config?: LoadTestRunConfig): Promise<FamilyLoadTestResult> {
    return this.runFamilyLoad("dispatch", config);
  }

  public async runReportLoad(config?: LoadTestRunConfig): Promise<FamilyLoadTestResult> {
    return this.runFamilyLoad("report", config);
  }

  /**
   * Executes load test across all three families: Booking, Dispatch, and Report.
   */
  public async runAllFamilies(config?: LoadTestRunConfig): Promise<ConsolidatedLoadReport> {
    let cleanupServer: (() => Promise<void>) | null = null;
    let runConfig = config;

    if (config?.selfTest && !config.targetUrl && !config.executor) {
      const helper = await startSelfTestServer(config.simulateFaultRate ?? 0);
      runConfig = { ...config, targetUrl: helper.url };
      cleanupServer = helper.close;
    }

    try {
      const booking = await this.runBookingLoad(runConfig);
      const dispatch = await this.runDispatchLoad(runConfig);
      const report = await this.runReportLoad(runConfig);

      const anyNotRun = booking.status === "not_run" || dispatch.status === "not_run" || report.status === "not_run";
      const allPassed =
        !anyNotRun &&
        booking.sloEvaluation.allPassed &&
        dispatch.sloEvaluation.allPassed &&
        report.sloEvaluation.allPassed;

      const totalRequests = booking.totalRequests + dispatch.totalRequests + report.totalRequests;
      const totalErrors = booking.failedRequests + dispatch.failedRequests + report.failedRequests;

      let summaryZh = "";
      if (anyNotRun) {
        summaryZh = "負載測試未執行 (not-run)：未提供目標伺服器 URL (--target-url)，依規範不冒充 PASS。";
      } else if (allPassed) {
        summaryZh = `三項負載測試全數通過基準：Booking p95=${booking.statistics.p95Ms}ms (≤${booking.baseline.latencySlo.p95TargetMs}ms)、Dispatch p95=${dispatch.statistics.p95Ms}ms (≤${dispatch.baseline.latencySlo.p95TargetMs}ms)、Report p95=${report.statistics.p95Ms}ms (≤${report.baseline.latencySlo.p95TargetMs}ms)；無未容許之錯誤。`;
      } else {
        const allBreaches = [
          ...booking.sloEvaluation.breaches,
          ...dispatch.sloEvaluation.breaches,
          ...report.sloEvaluation.breaches,
        ];
        summaryZh = `負載測試發現 SLO 違規：${allBreaches.join("；")}`;
      }

      return {
        timestamp: new Date().toISOString(),
        overallPassed: allPassed,
        status: anyNotRun ? "not_run" : allPassed ? "completed" : "failed",
        families: {
          booking,
          dispatch,
          report,
        },
        totalRequestsAcrossFamilies: totalRequests,
        totalErrorsAcrossFamilies: totalErrors,
        summaryZh,
      };
    } finally {
      if (cleanupServer) {
        await cleanupServer();
      }
    }
  }
}
