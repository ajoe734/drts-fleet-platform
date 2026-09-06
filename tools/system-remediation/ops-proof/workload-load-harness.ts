import type {
  WorkloadHarnessReport,
  WorkloadMetricResult,
  WorkloadProfile,
  WorkloadType,
} from "./types.js";

/**
 * Authoritative workload profiles defined by:
 * docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md
 * docs/03-runbooks/operational-sla-degradation-runbook.md
 */
export const WORKLOAD_PROFILES: Record<WorkloadType, WorkloadProfile> = {
  booking: {
    workloadType: "booking",
    steadyStateReqPerMin: 20,
    burstTargetReqPerMin: 60,
    burstDurationMinutes: 15,
    maxConcurrency: 50,
    latencySlaP95Ms: 2000,
    latencySlaP99Ms: 5000,
    availabilityTargetPercent: 99.9,
    notes:
      "Intake API bookings, partner ingress, phone order intake. Must commit before success response.",
  },
  dispatch: {
    workloadType: "dispatch",
    steadyStateReqPerMin: 120,
    burstTargetReqPerMin: 300,
    burstDurationMinutes: 15,
    maxConcurrency: 500, // Open dispatchable orders queue capacity
    latencySlaP95Ms: 10000, // Candidate fetch + attempt write p95 <= 10s
    latencySlaP99Ms: 60000, // Ready order to first assignment attempt <= 60s
    availabilityTargetPercent: 99.9,
    notes:
      "Queue entry, candidate selection, auto-dispatch, redispatch attempts.",
  },
  report: {
    workloadType: "report",
    steadyStateReqPerMin: 10,
    burstTargetReqPerMin: 30,
    burstDurationMinutes: 15,
    maxConcurrency: 50, // Concurrent running or queued jobs
    latencySlaP95Ms: 3000, // Operator query / read p95 <= 3s; job enqueue <= 5s
    latencySlaP99Ms: 5000, // Enqueue upper bound
    availabilityTargetPercent: 99.0,
    notes:
      "Report generation, filing packages, dispatch/recording index refresh. Lower priority than intake/dispatch.",
  },
};

/**
 * Calculates accurate statistical percentiles from an array of latencies.
 */
export function calculatePercentiles(latenciesMs: number[]): {
  min: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  stdDev: number;
} {
  if (latenciesMs.length === 0) {
    return {
      min: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      max: 0,
      mean: 0,
      stdDev: 0,
    };
  }

  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const n = sorted.length;

  const getPercentile = (p: number): number => {
    const idx = Math.ceil((p / 100) * n) - 1;
    return sorted[Math.max(0, Math.min(n - 1, idx))] ?? 0;
  };

  const min = sorted[0] ?? 0;
  const max = sorted[n - 1] ?? 0;
  const p50 = getPercentile(50);
  const p90 = getPercentile(90);
  const p95 = getPercentile(95);
  const p99 = getPercentile(99);

  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = sum / n;
  const variance =
    sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);

  return { min, p50, p90, p95, p99, max, mean, stdDev };
}

export interface TaskExecutionResult {
  statusCode: number;
  durationMs: number;
  error?: { code: string; message: string };
}

export type TaskHandler = (iteration: number) => Promise<TaskExecutionResult>;

/**
 * Default realistic simulator handler for each workload type when running isolated proof
 * without an external live API service.
 */
export function createDefaultSimulator(
  workloadType: WorkloadType,
  mode: "steady-state" | "burst" = "steady-state",
): TaskHandler {
  return async (iteration: number): Promise<TaskExecutionResult> => {
    // Determine simulated delay based on canonical baseline profiles
    let baseDelayMs: number;
    let jitterMs: number;
    let failureRate: number;

    switch (workloadType) {
      case "booking":
        baseDelayMs = mode === "burst" ? 220 : 120;
        jitterMs = mode === "burst" ? 180 : 80;
        failureRate = 0.001; // 99.9% availability
        break;
      case "dispatch":
        baseDelayMs = mode === "burst" ? 450 : 250;
        jitterMs = mode === "burst" ? 400 : 150;
        failureRate = 0.001;
        break;
      case "report":
        baseDelayMs = mode === "burst" ? 650 : 350;
        jitterMs = mode === "burst" ? 500 : 200;
        failureRate = 0.005; // 99.5% availability
        break;
    }

    // Occasional tail latency spike simulation (1 in 50)
    const hasSpike = iteration % 50 === 0;
    const latency =
      baseDelayMs + (iteration % jitterMs) + (hasSpike ? baseDelayMs * 2 : 0);

    // Simulate minor asynchronous computation
    await new Promise((resolve) => setTimeout(resolve, Math.min(latency, 20)));

    const isFailure = (iteration * 37) % 1000 < failureRate * 1000;
    if (isFailure) {
      return {
        statusCode: 503,
        durationMs: latency,
        error: {
          code: "DEGRADED_DEPENDENCY",
          message: `${workloadType} simulated upstream adapter timeout`,
        },
      };
    }

    return {
      statusCode: 200,
      durationMs: latency,
    };
  };
}

/**
 * Runs a representative capacity load test for a single workload type.
 */
export async function runWorkloadLoadTest(options: {
  workloadType: WorkloadType;
  mode?: ("steady-state" | "burst") | undefined;
  totalRequests?: number | undefined;
  concurrency?: number | undefined;
  customHandler?: TaskHandler | undefined;
}): Promise<WorkloadMetricResult> {
  const { workloadType, mode = "steady-state" } = options;
  const profile = WORKLOAD_PROFILES[workloadType];

  const totalRequests =
    options.totalRequests ??
    (mode === "burst"
      ? profile.burstTargetReqPerMin
      : profile.steadyStateReqPerMin);

  const concurrency = Math.min(
    options.concurrency ?? (mode === "burst" ? 10 : 5),
    profile.maxConcurrency,
  );

  const handler =
    options.customHandler || createDefaultSimulator(workloadType, mode);

  const latenciesMs: number[] = [];
  const statusDistribution: Record<number, number> = {};
  const errorMap = new Map<
    string,
    { code: string; message: string; count: number }
  >();

  let successfulRequests = 0;
  let failedRequests = 0;

  const startTime = Date.now();

  // Execute in batches up to concurrency
  let completed = 0;
  while (completed < totalRequests) {
    const batchSize = Math.min(concurrency, totalRequests - completed);
    const batchPromises = Array.from({ length: batchSize }, (_, i) => {
      const iteration = completed + i + 1;
      return handler(iteration);
    });

    const results = await Promise.all(batchPromises);

    for (const res of results) {
      latenciesMs.push(res.durationMs);
      statusDistribution[res.statusCode] =
        (statusDistribution[res.statusCode] || 0) + 1;

      if (res.statusCode >= 200 && res.statusCode < 400) {
        successfulRequests++;
      } else {
        failedRequests++;
        if (res.error) {
          const key = `${res.error.code}:${res.error.message}`;
          const current = errorMap.get(key) || {
            code: res.error.code,
            message: res.error.message,
            count: 0,
          };
          current.count++;
          errorMap.set(key, current);
        }
      }
    }

    completed += batchSize;
  }

  const elapsedSec = Math.max(0.001, (Date.now() - startTime) / 1000);
  const throughputReqPerSec = Number((totalRequests / elapsedSec).toFixed(2));
  const errorRatePercent = Number(
    ((failedRequests / totalRequests) * 100).toFixed(3),
  );
  const availabilityPercent = 100 - errorRatePercent;

  const stats = calculatePercentiles(latenciesMs);

  // Compare directly against authoritative SLA thresholds
  const slaP95Passed = stats.p95 <= profile.latencySlaP95Ms;
  const slaP99Passed = stats.p99 <= profile.latencySlaP99Ms;
  const availabilityPassed =
    availabilityPercent >= profile.availabilityTargetPercent;

  const verdict =
    slaP95Passed && slaP99Passed && availabilityPassed ? "PASSED" : "FAILED";

  return {
    workloadType,
    mode,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRatePercent,
    throughputReqPerSec,
    latencyMinMs: stats.min,
    latencyP50Ms: stats.p50,
    latencyP90Ms: stats.p90,
    latencyP95Ms: stats.p95,
    latencyP99Ms: stats.p99,
    latencyMaxMs: stats.max,
    latencyMeanMs: Number(stats.mean.toFixed(2)),
    latencyStdDevMs: Number(stats.stdDev.toFixed(2)),
    statusDistribution,
    rawErrors: Array.from(errorMap.values()),
    slaP95Passed,
    slaP99Passed,
    availabilityPassed,
    verdict,
  };
}

/**
 * Runs the full capacity test across all THREE required workloads: booking, dispatch, and report.
 */
export async function runAllWorkloadTests(options?: {
  mode?: ("steady-state" | "burst") | undefined;
  requestScale?: number | undefined;
  baseSha?: string | undefined;
  customHandlers?: Partial<Record<WorkloadType, TaskHandler>> | undefined;
}): Promise<WorkloadHarnessReport> {
  const mode = options?.mode ?? "steady-state";
  const scale = options?.requestScale ?? 1.0;
  const baseSha =
    options?.baseSha ?? "2093cf7e38526a7a7c027600be92004f7275efd3";

  const bookingResult = await runWorkloadLoadTest({
    workloadType: "booking",
    mode,
    totalRequests: Math.max(10, Math.round(20 * scale)),
    customHandler: options?.customHandlers?.booking,
  });

  const dispatchResult = await runWorkloadLoadTest({
    workloadType: "dispatch",
    mode,
    totalRequests: Math.max(15, Math.round(30 * scale)),
    customHandler: options?.customHandlers?.dispatch,
  });

  const reportResult = await runWorkloadLoadTest({
    workloadType: "report",
    mode,
    totalRequests: Math.max(10, Math.round(15 * scale)),
    customHandler: options?.customHandlers?.report,
  });

  const overallVerdict =
    bookingResult.verdict === "PASSED" &&
    dispatchResult.verdict === "PASSED" &&
    reportResult.verdict === "PASSED"
      ? "PASSED"
      : "FAILED";

  return {
    timestamp: new Date().toISOString(),
    baseSha,
    results: {
      booking: bookingResult,
      dispatch: dispatchResult,
      report: reportResult,
    },
    overallVerdict,
  };
}
