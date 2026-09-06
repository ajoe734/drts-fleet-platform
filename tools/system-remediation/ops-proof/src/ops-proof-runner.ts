/**
 * Ops Proof Runner
 * 
 * Orchestrates verification for Task SR-OPS-PROOF-001:
 * - Capability C122: Snapshot restore & tri-domain reconciliation (Trips, Billing, Audit)
 * - Capability C123: Multi-family load capacity & raw latency/error verification (Booking, Dispatch, Report)
 * - Capability C124: Deployment version check, health verification, and rollback drill
 */

import { generateCanonicalReferenceSnapshot } from "./snapshot-schema";
import { IsolatedSnapshotRestoreEngine, RestoreResult } from "./snapshot-restore-engine";
import { OpsReconciliationEngine, FullReconciliationReport } from "./reconciliation-engine";
import { calculateRpo, calculateRto, evaluateDisasterRecoveryReadiness, DrReadinessAssessment } from "./rpo-rto-calculator";
import { LoadGenerator, ConsolidatedLoadReport, LoadTestRunConfig } from "./load-generator";
import { DeployRollbackHarness, RollbackDrillValidation, VersionCheckResult, HealthCheckResult } from "./deploy-rollback-harness";

export interface OpsProofRunnerConfig {
  baseSha?: string;
  candidateSha?: string;
  resourceId?: string;
  isolatedDbUrl?: string;
  loadConfig?: LoadTestRunConfig;
}

export interface OpsProofExecutionSummary {
  taskId: "SR-OPS-PROOF-001";
  executedAt: string;
  baseSha: string;
  candidateSha: string;
  resourceId: string;
  acceptanceResults: {
    isolatedDbRestoreAndReconcile: {
      passed: boolean;
      summary: string;
      restoreResult: {
        snapshotId: string;
        isolatedTarget: string;
        recordsRestored: number;
        elapsedMs: number;
      };
      reconciliationReport: {
        overallPassed: boolean;
        tripsPassed: boolean;
        billingPassed: boolean;
        auditPassed: boolean;
        discrepanciesCount: number;
      };
      drAssessment: DrReadinessAssessment;
    };
    multiFamilyLoadTesting: {
      passed: boolean;
      summary: string;
      totalRequests: number;
      totalErrors: number;
      bookingP95Ms: number;
      dispatchP95Ms: number;
      reportP95Ms: number;
      loadReport: ConsolidatedLoadReport;
    };
    deploymentAndRollback: {
      passed: boolean;
      summary: string;
      versionCheck: VersionCheckResult;
      healthCheck: HealthCheckResult;
      rollbackValidation: RollbackDrillValidation;
    };
    overallPassed: boolean;
  };
  notDoneLiveBoundaries: string[];
}

export class OpsProofRunner {
  private restoreEngine = new IsolatedSnapshotRestoreEngine();
  private reconciliationEngine = new OpsReconciliationEngine();
  private loadGenerator = new LoadGenerator();
  private deployHarness = new DeployRollbackHarness();

  /**
   * Executes isolated snapshot restore and tri-domain reconciliation (C122)
   */
  public async runSnapshotRestoreProof(config?: OpsProofRunnerConfig): Promise<{
    restoreResult: RestoreResult;
    reconciliationReport: FullReconciliationReport;
    drAssessment: DrReadinessAssessment;
  }> {
    const baseSha = config?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const resourceId = config?.resourceId ?? "iso-db-res-001";

    // 1. Generate canonical reference snapshot
    const snapshot = generateCanonicalReferenceSnapshot({
      baseSha,
      resourceId,
    });

    const restoreStartTime = new Date();

    // 2. Restore into isolated environment (enforces assertIsolatedDatabase)
    const restoreResult = await this.restoreEngine.restore(snapshot, {
      connectionUrl: config?.isolatedDbUrl ?? "in-memory",
    });

    // 3. Reconcile across Trips, Billing, and Audit domains
    const reconciliationReport = this.reconciliationEngine.reconcileAll(restoreResult.store);

    const verificationEndTime = new Date();

    // 4. Calculate RPO and RTO
    const rpo = calculateRpo(snapshot.metadata.capturedAt, restoreStartTime);
    const rto = calculateRto(restoreStartTime, verificationEndTime);
    const drAssessment = evaluateDisasterRecoveryReadiness(rpo, rto, reconciliationReport);

    return {
      restoreResult,
      reconciliationReport,
      drAssessment,
    };
  }

  /**
   * Executes load testing across Booking, Dispatch, and Report families (C123)
   */
  public async runLoadCapacityProof(config?: OpsProofRunnerConfig): Promise<ConsolidatedLoadReport> {
    return await this.loadGenerator.runAllFamilies(config?.loadConfig);
  }

  /**
   * Executes deployment check and rollback drill verification (C124)
   */
  public runDeployRollbackProof(config?: OpsProofRunnerConfig): {
    versionCheck: VersionCheckResult;
    healthCheck: HealthCheckResult;
    rollbackValidation: RollbackDrillValidation;
  } {
    const baseSha = config?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const candidateSha = config?.candidateSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";

    const versionCheck = this.deployHarness.verifyVersion(candidateSha, baseSha);
    const healthCheck = this.deployHarness.verifyHealthEndpoint();
    const rollbackValidation = this.deployHarness.validateRollbackDrillProtocol();

    return {
      versionCheck,
      healthCheck,
      rollbackValidation,
    };
  }

  /**
   * Executes full suite and produces consolidated evidence summary
   */
  public async runAll(config?: OpsProofRunnerConfig): Promise<OpsProofExecutionSummary> {
    const baseSha = config?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const candidateSha = config?.candidateSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const resourceId = config?.resourceId ?? "iso-db-res-001";

    const snapshotProof = await this.runSnapshotRestoreProof(config);
    const loadProof = await this.runLoadCapacityProof(config);
    const deployProof = this.runDeployRollbackProof(config);

    const restorePassed =
      snapshotProof.restoreResult.success &&
      snapshotProof.reconciliationReport.overallPassed &&
      snapshotProof.drAssessment.overallCompliant;

    const loadPassed = loadProof.overallPassed;
    const deployPassed =
      deployProof.versionCheck.versionMatched &&
      deployProof.healthCheck.passed &&
      deployProof.rollbackValidation.drillPassed;

    const overallPassed = restorePassed && loadPassed && deployPassed;

    return {
      taskId: "SR-OPS-PROOF-001",
      executedAt: new Date().toISOString(),
      baseSha,
      candidateSha,
      resourceId,
      acceptanceResults: {
        isolatedDbRestoreAndReconcile: {
          passed: restorePassed,
          summary: snapshotProof.drAssessment.summaryZh,
          restoreResult: {
            snapshotId: snapshotProof.restoreResult.snapshotId,
            isolatedTarget: snapshotProof.restoreResult.isolatedTarget,
            recordsRestored: snapshotProof.restoreResult.restoredRecordsCount,
            elapsedMs: snapshotProof.restoreResult.elapsedMs,
          },
          reconciliationReport: {
            overallPassed: snapshotProof.reconciliationReport.overallPassed,
            tripsPassed: snapshotProof.reconciliationReport.trips.passed,
            billingPassed: snapshotProof.reconciliationReport.billing.passed,
            auditPassed: snapshotProof.reconciliationReport.audit.passed,
            discrepanciesCount: snapshotProof.reconciliationReport.allDiscrepancies.length,
          },
          drAssessment: snapshotProof.drAssessment,
        },
        multiFamilyLoadTesting: {
          passed: loadPassed,
          summary: loadProof.summaryZh,
          totalRequests: loadProof.totalRequestsAcrossFamilies,
          totalErrors: loadProof.totalErrorsAcrossFamilies,
          bookingP95Ms: loadProof.families.booking.statistics.p95Ms,
          dispatchP95Ms: loadProof.families.dispatch.statistics.p95Ms,
          reportP95Ms: loadProof.families.report.statistics.p95Ms,
          loadReport: loadProof,
        },
        deploymentAndRollback: {
          passed: deployPassed,
          summary: deployProof.rollbackValidation.evidenceSummary,
          versionCheck: deployProof.versionCheck,
          healthCheck: deployProof.healthCheck,
          rollbackValidation: deployProof.rollbackValidation,
        },
        overallPassed,
      },
      notDoneLiveBoundaries: [
        "真機 GCP Cloud SQL 活體快照還原（保留至 SR-LIVE-OPS-001，需 authorized_isolated_ops_target 授權）",
        "真機 Cloud Run 多實例線上高壓壓力測試（保留至 SR-LIVE-OPS-001）",
        "真機 GitHub Actions deploy-prod.yml 線上 dispatch 執行（保留至正式發布流程與 SR-LIVE-OPS-001）",
        "生產環境 PagerDuty / Ops 呼叫告警路由測試（保留至 live ops 線上驗收）",
      ],
    };
  }
}
