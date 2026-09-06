/**
 * Workload Baseline Contracts
 * 
 * Canonical non-functional planning baselines strictly cited from:
 * docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md
 * 
 * Acceptance criteria: "負載包含booking/dispatch/report三種；閾值來自已確認基準且輸出原始延遲與錯誤。"
 * Rule: "沿runbook與現行SLO，RPO/RTO不自行發明。"
 */

export interface FamilyBaseline {
  familyName: "booking" | "dispatch" | "report";
  steadyStateRatePerMin: number;
  burstRatePerMin: number;
  burstDurationMinutes: number;
  concurrencyAssumption: number;
  latencySlo: {
    primaryMetric: string;
    p95TargetMs: number;
    p99TargetMs?: number;
    secondaryMetric?: string;
    secondaryP95Ms?: number;
  };
  availabilityTargetPct: number;
  maxErrorRatePct: number;
  sourceDocument: string;
  sourceSection: string;
  notes: string;
}

export const WORKLOAD_BASELINES: Record<"booking" | "dispatch" | "report", FamilyBaseline> = {
  booking: {
    familyName: "booking",
    steadyStateRatePerMin: 20, // 20 booking create/update requests per min
    burstRatePerMin: 60, // 60 requests per minute for 15 minutes
    burstDurationMinutes: 15,
    concurrencyAssumption: 50, // 50 concurrent intake requests
    latencySlo: {
      primaryMetric: "synchronous create / update response",
      p95TargetMs: 2000, // p95 <= 2 s
      p99TargetMs: 5000, // p99 <= 5 s
    },
    availabilityTargetPct: 99.9, // 99.9% monthly for accepted requests
    maxErrorRatePct: 0.1,
    sourceDocument: "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md",
    sourceSection: "§Workflow capacity table (Intake) & §Workflow target table (Intake)",
    notes: "Reservation and realtime orders share intake infrastructure but diverge at queue entry policy",
  },
  dispatch: {
    familyName: "dispatch",
    steadyStateRatePerMin: 120, // 120 queue-entry or dispatch-decision transitions per min
    burstRatePerMin: 300, // 300 transitions per minute for 15 minutes
    burstDurationMinutes: 15,
    concurrencyAssumption: 500, // 500 open dispatchable orders across ready, redispatch, exception
    latencySlo: {
      primaryMetric: "candidate fetch + dispatch attempt write",
      p95TargetMs: 10000, // p95 <= 10 s per attempt
      secondaryMetric: "ready order to first assignment attempt (realtime)",
      secondaryP95Ms: 60000, // p95 <= 60 s
    },
    availabilityTargetPct: 99.9, // 99.9% monthly for queue projection and assignment writes
    maxErrorRatePct: 0.1,
    sourceDocument: "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md",
    sourceSection: "§Workflow capacity table (Dispatch) & §Workflow target table (Dispatch)",
    notes: "Includes auto-dispatch, manual reassignment, and redispatch attempts",
  },
  report: {
    familyName: "report",
    steadyStateRatePerMin: 10, // 10 report jobs started per minute
    burstRatePerMin: 30, // 30 jobs started per minute for 15 minutes
    burstDurationMinutes: 15,
    concurrencyAssumption: 50, // 50 concurrent running or queued jobs
    latencySlo: {
      primaryMetric: "operator query / dashboard read",
      p95TargetMs: 3000, // p95 <= 3 s
      secondaryMetric: "report job enqueue",
      secondaryP95Ms: 5000, // p95 <= 5 s
    },
    availabilityTargetPct: 99.0, // 99.0% monthly
    maxErrorRatePct: 1.0,
    sourceDocument: "docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md",
    sourceSection: "§Workflow capacity table (Reporting) & §Workflow target table (Reporting)",
    notes: "Heavy exports are async-only and must not block intake or dispatch",
  },
};
