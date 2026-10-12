// Hand-written declaration file for durable-readback.mjs -- see
// plan-builder.d.mts for why a plain .mjs module needs one under this repo's
// allowJs:false root tsconfig.

type PgPoolLike = {
  query: <R = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: R[] }>;
};

export type OwnedOrderReadbackRow = {
  orderId: string;
  status: string;
  createdAt: string;
  lagMs: number | null;
};

export type ReportJobReadbackRow = {
  jobId: string;
  status: string;
  createdAt: string;
  queueLagMs: number | null;
};

export type ReadbackSummary = {
  expectedCount: number;
  foundCount: number;
  missing: string[];
  matched: boolean;
};

export type LagSummary = {
  count: number;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
};

export function readBackOwnedOrders(
  pool: PgPoolLike,
  orderIds: string[],
): Promise<OwnedOrderReadbackRow[]>;

export function readBackReportJobs(
  pool: PgPoolLike,
  jobIds: string[],
): Promise<ReportJobReadbackRow[]>;

export function summarizeReadback<T>(
  expectedIds: string[],
  foundRows: T[],
  idOf: (row: T) => string,
): ReadbackSummary;

export function summarizeLag<T extends Record<string, unknown>>(
  rows: T[],
  lagKey: keyof T,
): LagSummary;

export function assertAcceptancePassed(acceptance: any): void;
