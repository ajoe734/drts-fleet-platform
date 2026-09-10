/**
 * Ops Proof Runner
 *
 * Orchestrates verification for Task SR-OPS-PROOF-001:
 * - Capability C122: Snapshot restore & tri-domain reconciliation (Trips, Billing, Audit)
 * - Capability C123: Multi-family load capacity & raw latency/error verification (Booking, Dispatch, Report)
 * - Capability C124: Deployment version check, health verification, and rollback drill
 */

import fs from "node:fs";
import { generateCanonicalReferenceSnapshot, OpsSnapshot } from "./snapshot-schema";
import { IsolatedSnapshotRestoreEngine, RestoreResult } from "./snapshot-restore-engine";
import { OpsReconciliationEngine, FullReconciliationReport } from "./reconciliation-engine";
import { calculateRpo, calculateRto, evaluateDisasterRecoveryReadiness, DrReadinessAssessment } from "./rpo-rto-calculator";
import { LoadGenerator, ConsolidatedLoadReport, LoadTestRunConfig } from "./load-generator";
import { DeployRollbackHarness, ConsolidatedDeployVerification } from "./deploy-rollback-harness";

export interface OpsProofRunnerConfig {
  baseSha?: string | undefined;
  candidateSha?: string | undefined;
  resourceId?: string | undefined;
  isolatedDbUrl?: string | undefined;
  snapshotFile?: string | undefined;
  targetUrl?: string | undefined;
  healthUrl?: string | undefined;
  selfTest?: boolean | undefined;
  loadConfig?: LoadTestRunConfig | undefined;
}

export interface OpsProofExecutionSummary {
  taskId: "SR-OPS-PROOF-001";
  executedAt: string;
  baseSha: string;
  candidateSha: string;
  resourceId: string;
  isSelfTest: boolean;
  acceptanceResults: {
    isolatedDbRestoreAndReconcile: {
      passed: boolean;
      status: string;
      summary: string;
      restoreResult?: {
        snapshotId: string;
        isolatedTarget: string;
        recordsRestored: number;
        elapsedMs: number;
      } | undefined;
      reconciliationReport?: {
        overallPassed: boolean;
        tripsPassed: boolean;
        billingPassed: boolean;
        auditPassed: boolean;
        discrepanciesCount: number;
      } | undefined;
      drAssessment?: DrReadinessAssessment | undefined;
      error?: string | undefined;
    };
    multiFamilyLoadTesting: {
      passed: boolean;
      status: string;
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
      deployVerification: ConsolidatedDeployVerification;
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
    restoreResult?: RestoreResult | undefined;
    reconciliationReport?: FullReconciliationReport | undefined;
    drAssessment?: DrReadinessAssessment | undefined;
    passed: boolean;
    status: string;
    error?: string | undefined;
  }> {
    const baseSha = config?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const resourceId = config?.resourceId ?? "iso-db-res-001";
    const selfTest = config?.selfTest ?? false;

    let snapshot: OpsSnapshot;
    if (config?.snapshotFile && fs.existsSync(config.snapshotFile)) {
      snapshot = JSON.parse(fs.readFileSync(config.snapshotFile, "utf8"));
    } else {
      snapshot = generateCanonicalReferenceSnapshot({ baseSha, resourceId });
    }

    const restoreStartTime = new Date();
    const isolatedUrl = config?.isolatedDbUrl ?? (selfTest ? "in-memory" : undefined);

    if (!isolatedUrl && !selfTest) {
      return {
        passed: false,
        status: "missing_target",
        error: "未指定隔離資料庫 URL (--isolated-url)。真實快照還原需指定隔離資料庫目標；依規範回報 missing_target，不冒充 PASS。",
      };
    }

    try {
      const restoreResult = await this.restoreEngine.restore(snapshot, {
        connectionUrl: isolatedUrl ?? "in-memory",
      });

      const reconciliationReport = this.reconciliationEngine.reconcileAll(restoreResult.store);
      const verificationEndTime = new Date();

      const rpo = calculateRpo(snapshot.metadata.capturedAt, restoreStartTime);
      const rto = calculateRto(restoreStartTime, verificationEndTime);
      const drAssessment = evaluateDisasterRecoveryReadiness(rpo, rto, reconciliationReport);

      const passed = restoreResult.success && reconciliationReport.overallPassed;

      return {
        restoreResult,
        reconciliationReport,
        drAssessment,
        passed,
        status: passed ? "completed" : "failed",
      };
    } catch (err: any) {
      return {
        passed: false,
        status: "failed",
        error: err.message,
      };
    }
  }

  /**
   * Executes load testing across Booking, Dispatch, and Report families (C123)
   */
  public async runLoadCapacityProof(config?: OpsProofRunnerConfig): Promise<ConsolidatedLoadReport> {
    const loadConfig: LoadTestRunConfig = {
      ...config?.loadConfig,
      targetUrl: config?.targetUrl ?? config?.loadConfig?.targetUrl,
      selfTest: config?.selfTest ?? config?.loadConfig?.selfTest,
    };
    return await this.loadGenerator.runAllFamilies(loadConfig);
  }

  /**
   * Executes deployment check and rollback drill verification (C124)
   */
  public async runDeployRollbackProof(config?: OpsProofRunnerConfig): Promise<ConsolidatedDeployVerification> {
    const baseSha = config?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const candidateSha = config?.candidateSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";

    return await this.deployHarness.verifyAll({
      candidateSha,
      baseSha,
      healthUrl: config?.healthUrl ?? (config?.targetUrl ? `${config.targetUrl}/health` : undefined),
      selfTest: config?.selfTest,
    });
  }

  /**
   * Executes full suite and produces consolidated evidence summary
   */
  public async runAll(config?: OpsProofRunnerConfig): Promise<OpsProofExecutionSummary> {
    const baseSha = config?.baseSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const candidateSha = config?.candidateSha ?? "40ba315e4114369eaa7e12d35aae83a795c97b1d";
    const resourceId = config?.resourceId ?? "iso-db-res-001";
    const selfTest = config?.selfTest ?? false;

    const snapshotProof = await this.runSnapshotRestoreProof(config);
    const loadProof = await this.runLoadCapacityProof(config);
    const deployProof = await this.runDeployRollbackProof(config);

    const restorePassed = snapshotProof.passed;
    const loadPassed = loadProof.overallPassed;
    const deployPassed = deployProof.passed;

    const overallPassed = restorePassed && loadPassed && deployPassed;

    return {
      taskId: "SR-OPS-PROOF-001",
      executedAt: new Date().toISOString(),
      baseSha,
      candidateSha,
      resourceId,
      isSelfTest: selfTest,
      acceptanceResults: {
        isolatedDbRestoreAndReconcile: {
          passed: restorePassed,
          status: snapshotProof.status,
          summary: snapshotProof.drAssessment?.summaryZh ?? (snapshotProof.error ?? "未完成還原"),
          restoreResult: snapshotProof.restoreResult
            ? {
                snapshotId: snapshotProof.restoreResult.snapshotId,
                isolatedTarget: snapshotProof.restoreResult.isolatedTarget,
                recordsRestored: snapshotProof.restoreResult.restoredRecordsCount,
                elapsedMs: snapshotProof.restoreResult.elapsedMs,
              }
            : undefined,
          reconciliationReport: snapshotProof.reconciliationReport
            ? {
                overallPassed: snapshotProof.reconciliationReport.overallPassed,
                tripsPassed: snapshotProof.reconciliationReport.trips.passed,
                billingPassed: snapshotProof.reconciliationReport.billing.passed,
                auditPassed: snapshotProof.reconciliationReport.audit.passed,
                discrepanciesCount: snapshotProof.reconciliationReport.allDiscrepancies.length,
              }
            : undefined,
          drAssessment: snapshotProof.drAssessment,
          error: snapshotProof.error,
        },
        multiFamilyLoadTesting: {
          passed: loadPassed,
          status: loadProof.status,
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
          deployVerification: deployProof,
        },
        overallPassed,
      },
      notDoneLiveBoundaries: [
        "真機 GCP Cloud SQL 活體快照還原（保留至 SR-LIVE-OPS-001，需 authorized_isolated_ops_target 授權）",
        "真機 Cloud Run 多實例線上高壓壓力測試（保留至 SR-LIVE-OPS-001）",
        "真機 GitHub Actions deploy-prod.yml 線上 dispatch 執行（保留至正式發布流程與 SR-LIVE-OPS-001）",
        "生產環境 PagerDuty / Ops 呼叫告警路由測試（保留至 live ops 線上驗收）",
        "正式 RPO/RTO 權威 SLA 定案（待維運與架構團隊簽核，在確認前標記為未評定，不冒充 PASS）",
      ],
    };
  }
}
