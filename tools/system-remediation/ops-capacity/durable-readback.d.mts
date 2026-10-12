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
  createdAt: string | null;
  lagMs: number | null;
  authorityKnown: boolean;
  voiceCreationVerified?: boolean;
  readyAt: string | null;
  readySource: string | null;
  hasAttempt: boolean;
  firstAttemptAt: string | null;
  firstAttemptId: string | null;
  firstAttemptJobId: string | null;
  assignmentCount: number;
  attempts: Record<string, unknown>[];
  record: Record<string, unknown>;
  traces: Record<string, unknown>[];
};

export type ReportJobReadbackRow = {
  jobId: string;
  status: string;
  createdAt: string;
  queueLagMs: number | null;
  startedAt: string | null;
  updatedAt: string | null;
  record: Record<string, unknown> | null;
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
  p95Ms: number | null;
};

export function readBackOwnedOrders(
  pool: PgPoolLike,
  orderIds: string[],
): Promise<OwnedOrderReadbackRow[]>;

export function readBackReportJobs(
  pool: PgPoolLike,
  jobIds: string[],
): Promise<ReportJobReadbackRow[]>;

export function collectReportCompletions(
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

export type LawfulReason = {
  orderId: string;
  status: string;
  reasonCode: string;
  traceId: string;
  source: string;
  observedAt: string;
  dispatchJobId?: string;
};

export function lawfulReasonForOrder(
  row: OwnedOrderReadbackRow,
): LawfulReason | null;
export function summarizeDispatchEvidence(rows: OwnedOrderReadbackRow[]): {
  coverage: {
    attempted: number;
    unattemptedLawful: number;
    unattemptedUnlawful: number;
    unattemptedLawfulReasons: LawfulReason[];
  };
  distribution: Record<string, number>;
  degradation: {
    isLawful: boolean;
    reasons: LawfulReason[];
    unsafeOrderIds: string[];
  };
};
export function assertAcceptancePassed(acceptance: unknown): void;
