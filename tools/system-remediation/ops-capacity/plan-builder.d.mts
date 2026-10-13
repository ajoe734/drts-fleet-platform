// Hand-written declaration file for plan-builder.mjs. The repo-root
// tsconfig.json type-checks tests/**/*.ts with allowJs:false, so a plain
// .mjs module has no inferred shape; this gives the real shape used by
// SR-OPS-CAPACITY-RUNNER-20260911's tests without converting the runtime
// module (kept as plain ESM so both the acceptance test and the reused
// ops-proof/capacity.mjs runner can `import()` it identically).

export type WorkloadRequestItem = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  stageOrder?: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: unknown;
  };
};

export type CapacityPlan = {
  origin: string;
  durationSeconds: number;
  maxInFlight: number;
  isolatedResourceId: string;
  profile: "uniform" | "concurrent";
  scheduleMs: Record<WorkloadFamily, number[]>;
  workloads: {
    booking: WorkloadRequestItem[];
    dispatch: WorkloadRequestItem[];
    report: WorkloadRequestItem[];
  };
};

export type WorkloadFamily = "booking" | "dispatch" | "report";

export const BASELINE_PER_MINUTE: Record<WorkloadFamily, number>;
export function buildWorkloadSchedule(
  profile: CapacityPlan["profile"],
  counts: Record<WorkloadFamily, number>,
): CapacityPlan["scheduleMs"];

export function countForFamily(
  family: WorkloadFamily,
  durationSeconds: number,
): number;

export function buildBookingItems(args: {
  count: number;
  tenantId: string;
  tenantJwt: string;
  runTag: string;
  windowStartMs: number;
}): WorkloadRequestItem[];

export function buildDispatchItems(args: {
  orderIds: string[];
  dispatchJwt: string;
  runTag: string;
  count?: number;
  stagedDispatch?: boolean;
}): WorkloadRequestItem[];

export function buildReportItems(args: {
  count: number;
  reportJwt: string;
  runTag: string;
}): WorkloadRequestItem[];

export function buildCapacityPlan(args: {
  origin: string;
  durationSeconds: number;
  maxInFlight: number;
  isolatedResourceId: string;
  tenantId: string;
  tenantJwt: string;
  dispatchJwt: string;
  reportJwt: string;
  orderIds: string[];
  runTag: string;
  windowStartMs?: number;
  profile?: CapacityPlan["profile"];
  stagedDispatch?: boolean;
}): CapacityPlan;

export function countsForDuration(
  durationSeconds: number,
): Record<WorkloadFamily, number>;

export type CapacitySummary = {
  preparationStartedAt?: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  fullBurstSchedule: boolean;
  elapsedMs: number;
  maxInFlight: number;
  profile: CapacityPlan["profile"];
  workflows: Record<
    WorkloadFamily,
    {
      requests: number;
      errors: number;
      p95Ms: number | null;
      p99Ms: number | null;
      arrivals: {
        count: number;
        firstMs: number | null;
        lastMs: number | null;
        early: number;
        late: number;
      };
      latencyTargetsMet: boolean;
    }
  >;
  result: "measurements_within_targets" | "failed";
};
