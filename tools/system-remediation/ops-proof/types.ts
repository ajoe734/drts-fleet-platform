/**
 * Types and interfaces for SR-OPS-PROOF-001
 * Backup restore reconciliation, workload capacity harness, and deployment verification.
 */

export interface DatabaseTarget {
  url: string;
  host: string;
  port: number;
  database: string;
  isIsolated: boolean;
  isolationProof: string;
}

export interface SnapshotManifest {
  snapshotId: string;
  createdAt: string;
  sourceCommitSha: string;
  targetProfile: string;
  checksum: string;
  recordCounts: {
    orders: number;
    trips: number;
    statements: number;
    statementLines: number;
    invoices: number;
    auditLogs: number;
  };
}

export interface TripRecordSnapshot {
  orderId: string;
  orderNo: string;
  tenantId: string | null;
  tripId: string;
  status: "created" | "in_progress" | "completed" | "cancelled";
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  actualDistanceKm: number | null;
  actualDurationSec: number | null;
  createdAt: string;
}

export interface StatementLineSnapshot {
  lineId: string;
  statementId: string;
  lineType:
    | "trip_revenue"
    | "service_fee"
    | "promo_subsidy"
    | "manual_adjustment";
  refId: string | null;
  description: string;
  amount: number;
}

export interface DriverStatementSnapshot {
  statementId: string;
  driverId: string;
  periodMonth: string;
  grossEarning: number;
  serviceFee: number;
  subsidyAmount: number;
  netAmount: number;
  receiptNo: string;
  payoutStatus: "draft" | "submitted" | "approved" | "paid" | "rejected";
  createdAt: string;
}

export interface TenantInvoiceSnapshot {
  invoiceId: string;
  tenantId: string;
  invoiceNo: string;
  periodFrom: string;
  periodTo: string;
  totalAmount: number;
  currencyCode: string;
  status: "draft" | "issued" | "paid" | "overdue" | "void";
  createdAt: string;
}

export interface BillingRecordSnapshot {
  statements: DriverStatementSnapshot[];
  statementLines: StatementLineSnapshot[];
  invoices: TenantInvoiceSnapshot[];
}

export interface AuditLogSnapshot {
  auditId: string;
  actorId: string | null;
  actorType:
    | "system"
    | "platform_admin"
    | "tenant_admin"
    | "ops_user"
    | "partner_api_key"
    | "partner_user"
    | "referral_passenger";
  tenantId: string | null;
  moduleName: string;
  actionName: string;
  resourceType: string;
  resourceId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  requestId: string;
  hashValue: string | null;
  createdAt: string;
}

export interface FullSnapshot {
  manifest: SnapshotManifest;
  trips: TripRecordSnapshot[];
  billing: BillingRecordSnapshot;
  auditLogs: AuditLogSnapshot[];
}

export interface DomainReconciliationResult {
  domain: "trips" | "billing" | "audit";
  status: "PASSED" | "FAILED";
  sourceCount: number;
  targetCount: number;
  discrepancies: string[];
  sourceHash: string;
  targetHash: string;
  details: Record<string, unknown>;
}

export interface RpoRtoEvaluation {
  measuredRpoSeconds: number;
  targetRpoSeconds: number;
  rpoPassed: boolean;
  latestTransactionTimestamp: string;
  snapshotCutoffTimestamp: string;
  measuredRtoMs: number;
  targetRtoMs: number;
  rtoPassed: boolean;
  restoreDurationFormatted: string;
}

export interface RestoreReconciliationReport {
  snapshotId: string;
  targetDatabase: {
    host: string;
    database: string;
    isIsolated: boolean;
  };
  verdict: "PASSED" | "FAILED";
  reconciliation: {
    trips: DomainReconciliationResult;
    billing: DomainReconciliationResult;
    audit: DomainReconciliationResult;
  };
  rpoRto: RpoRtoEvaluation;
  timestamp: string;
}

export type WorkloadType = "booking" | "dispatch" | "report";

export interface WorkloadProfile {
  workloadType: WorkloadType;
  steadyStateReqPerMin: number;
  burstTargetReqPerMin: number;
  burstDurationMinutes: number;
  maxConcurrency: number;
  latencySlaP95Ms: number;
  latencySlaP99Ms: number;
  availabilityTargetPercent: number;
  notes: string;
}

export interface WorkloadMetricResult {
  workloadType: WorkloadType;
  mode: "steady-state" | "burst";
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRatePercent: number;
  throughputReqPerSec: number;
  latencyMinMs: number;
  latencyP50Ms: number;
  latencyP90Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  latencyMaxMs: number;
  latencyMeanMs: number;
  latencyStdDevMs: number;
  statusDistribution: Record<number, number>;
  rawErrors: Array<{ code: string; message: string; count: number }>;
  slaP95Passed: boolean;
  slaP99Passed: boolean;
  availabilityPassed: boolean;
  verdict: "PASSED" | "FAILED";
}

export interface WorkloadHarnessReport {
  timestamp: string;
  baseSha: string;
  results: Record<WorkloadType, WorkloadMetricResult>;
  overallVerdict: "PASSED" | "FAILED";
}

export interface DeploymentServiceRecord {
  name: string;
  kind: "service" | "job";
  defaultPort: number;
  healthEndpoint: string;
  roleJourney: string;
  expectedCandidateSha: string;
  deployedCandidateSha: string | null;
  healthStatus: "HEALTHY" | "DEGRADED" | "DOWN" | "UNVERIFIED";
  roleJourneyPassed: boolean;
  versionParityPassed: boolean;
}

export interface RollbackGateEvaluation {
  supportsPreviousRevision: boolean;
  dbMigrationBackwardsCompatible: boolean;
  targetRollbackRevision: string;
  rollbackCommand: string;
  gatePassed: boolean;
}

export interface DeploymentVerificationReport {
  candidateSha: string;
  services: DeploymentServiceRecord[];
  versionParityPassed: boolean;
  allHealthPassed: boolean;
  allRoleJourneysPassed: boolean;
  rollbackFeasibility: RollbackGateEvaluation;
  overallVerdict: "PASSED" | "FAILED";
  timestamp: string;
}
