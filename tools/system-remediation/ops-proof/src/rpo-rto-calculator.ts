/**
 * RPO / RTO Calculator & Disaster Recovery Evaluator
 *
 * Computes Recovery Point Objective (RPO) and Recovery Time Objective (RTO) against recovery benchmarks.
 *
 * Notice on Baseline Status:
 * Comprehensive repository verification confirmed that DRTS Phase 1 documents and runbooks
 * (including docs/03-runbooks/incident-escalation-service-recovery-runbook.md and architecture SLO documents)
 * currently do NOT define numerical RPO/RTO targets.
 * Therefore, the thresholds below are explicitly marked as `pending_confirmation` (`isConfirmed: false`, `sourceRef: null`).
 * They serve as tentative drill reference values and MUST NOT be represented as canonical or pre-existing runbook values.
 * In accordance with reviewer requirement: report unevaluated until confirmed.
 */

import { FullReconciliationReport } from "./reconciliation-engine";

export interface DisasterRecoveryBaseline {
  rpoTargetMinutes: number | null;
  rtoTargetMinutes: number | null;
  isConfirmed: boolean;
  status: "pending_confirmation" | "confirmed";
  sourceRef: string | null;
  note: string;
}

export const DISASTER_RECOVERY_BASELINE: DisasterRecoveryBaseline = {
  rpoTargetMinutes: null, // 全庫無既有文件值，待維運團隊確認
  rtoTargetMinutes: null,
  isConfirmed: false,
  status: "pending_confirmation",
  sourceRef: null,
  note: "RPO/RTO 基準待確認，非既有文件值。既有 runbook 未定義具體數值，待維運與架構團隊簽核正式 SLO。在確認前標記為未評定 (unevaluated)。",
};

export interface RpoEvaluation {
  snapshotTimestamp: string;
  cutoffTimestamp: string;
  rpoSeconds: number;
  rpoMinutes: number;
  targetMinutes: number | null;
  baselineConfirmed: boolean;
  baselineStatus: "pending_confirmation" | "confirmed";
  status: "unevaluated" | "evaluated";
  compliant: boolean | null;
  passed: boolean | null;
  notes: string;
}

export interface RtoEvaluation {
  restoreStartTime: string;
  verificationEndTime: string;
  rtoSeconds: number;
  rtoMinutes: number;
  rtoElapsedMs: number;
  targetMinutes: number | null;
  baselineConfirmed: boolean;
  baselineStatus: "pending_confirmation" | "confirmed";
  status: "unevaluated" | "evaluated";
  compliant: boolean | null;
  passed: boolean | null;
  notes: string;
}

export interface DrReadinessAssessment {
  overallCompliant: boolean;
  readinessStatus: "unevaluated_pending_confirmation" | "confirmed";
  rpo: RpoEvaluation;
  rto: RtoEvaluation;
  reconciliationPassed: boolean;
  baselineConfirmed: boolean;
  summaryZh: string;
}

/**
 * Calculates and evaluates RPO
 */
export function calculateRpo(
  snapshotTime: string | Date,
  cutoffTime?: string | Date,
): RpoEvaluation {
  const snapDate = new Date(snapshotTime);
  const cutoffDate = cutoffTime ? new Date(cutoffTime) : new Date();

  const diffMs = Math.max(0, cutoffDate.getTime() - snapDate.getTime());
  const rpoSeconds = Math.round(diffMs / 1000);
  const rpoMinutes = Math.round((rpoSeconds / 60) * 10) / 10;

  const isConfirmed = DISASTER_RECOVERY_BASELINE.isConfirmed;

  return {
    snapshotTimestamp: snapDate.toISOString(),
    cutoffTimestamp: cutoffDate.toISOString(),
    rpoSeconds,
    rpoMinutes,
    targetMinutes: DISASTER_RECOVERY_BASELINE.rpoTargetMinutes,
    baselineConfirmed: isConfirmed,
    baselineStatus: DISASTER_RECOVERY_BASELINE.status,
    status: isConfirmed ? "evaluated" : "unevaluated",
    compliant: isConfirmed ? (rpoSeconds <= (DISASTER_RECOVERY_BASELINE.rpoTargetMinutes! * 60)) : null,
    passed: isConfirmed ? (rpoSeconds <= (DISASTER_RECOVERY_BASELINE.rpoTargetMinutes! * 60)) : null,
    notes: isConfirmed
      ? `RPO 依正式基準評定完成 (${rpoMinutes}m)`
      : `RPO 實測值 ${rpoMinutes}m；基準待確認（非既有文件值），依規範標記為未評定 (unevaluated)，在維運團隊確認正式基準前不評定 PASS`,
  };
}

/**
 * Calculates and evaluates RTO
 */
export function calculateRto(
  restoreStartTime: string | Date,
  verificationEndTime: string | Date,
): RtoEvaluation {
  const startDate = new Date(restoreStartTime);
  const endDate = new Date(verificationEndTime);

  const diffMs = Math.max(0, endDate.getTime() - startDate.getTime());
  const rtoSeconds = Math.round(diffMs / 1000);
  const rtoMinutes = Math.round((rtoSeconds / 60) * 100) / 100;

  const isConfirmed = DISASTER_RECOVERY_BASELINE.isConfirmed;

  return {
    restoreStartTime: startDate.toISOString(),
    verificationEndTime: endDate.toISOString(),
    rtoSeconds,
    rtoMinutes,
    rtoElapsedMs: diffMs,
    targetMinutes: DISASTER_RECOVERY_BASELINE.rtoTargetMinutes,
    baselineConfirmed: isConfirmed,
    baselineStatus: DISASTER_RECOVERY_BASELINE.status,
    status: isConfirmed ? "evaluated" : "unevaluated",
    compliant: isConfirmed ? (rtoSeconds <= (DISASTER_RECOVERY_BASELINE.rtoTargetMinutes! * 60)) : null,
    passed: isConfirmed ? (rtoSeconds <= (DISASTER_RECOVERY_BASELINE.rtoTargetMinutes! * 60)) : null,
    notes: isConfirmed
      ? `RTO 依正式基準評定完成 (${rtoMinutes}m)`
      : `RTO 實測值 ${rtoMinutes}m (${diffMs}ms)；基準待確認（非既有文件值），依規範標記為未評定 (unevaluated)，在維運團隊確認正式基準前不評定 PASS`,
  };
}

/**
 * Evaluates Disaster Recovery readiness
 */
export function evaluateDisasterRecoveryReadiness(
  rpo: RpoEvaluation,
  rto: RtoEvaluation,
  reconciliation: FullReconciliationReport,
): DrReadinessAssessment {
  const isConfirmed = DISASTER_RECOVERY_BASELINE.isConfirmed;
  const overallCompliant = isConfirmed && (rpo.compliant === true) && (rto.compliant === true) && reconciliation.overallPassed;

  let summaryZh = "";
  if (!isConfirmed) {
    summaryZh = `行程／帳務／稽核三領域數據校核${reconciliation.overallPassed ? "全數通過" : "發現差異"}；RPO 實測 ${rpo.rpoMinutes} 分鐘、RTO 實測 ${rto.rtoMinutes} 分鐘。注意：RPO/RTO 基準待確認，非既有文件值，依規範標記為未評定 (unevaluated)，不冒充基準合格。`;
  } else if (overallCompliant) {
    summaryZh = `災難復原演練指標通過：RPO ${rpo.rpoMinutes} 分鐘、RTO ${rto.rtoMinutes} 分鐘，且行程／帳務／稽核三領域校核全數通過。`;
  } else {
    summaryZh = `災難復原演練未合規：存在超標或校核差異。`;
  }

  return {
    overallCompliant,
    readinessStatus: isConfirmed ? "confirmed" : "unevaluated_pending_confirmation",
    rpo,
    rto,
    reconciliationPassed: reconciliation.overallPassed,
    baselineConfirmed: isConfirmed,
    summaryZh,
  };
}
