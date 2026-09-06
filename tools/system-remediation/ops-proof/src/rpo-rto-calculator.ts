/**
 * RPO / RTO Calculator & Disaster Recovery Evaluator
 *
 * Computes Recovery Point Objective (RPO) and Recovery Time Objective (RTO) against tentative recovery benchmarks.
 *
 * Notice on Baseline Status:
 * Comprehensive repository verification confirmed that DRTS Phase 1 documents and runbooks
 * (including docs/03-runbooks/incident-escalation-service-recovery-runbook.md and architecture SLO documents)
 * currently do NOT define numerical RPO/RTO targets.
 * Therefore, the thresholds below are explicitly marked as `pending_confirmation` (`isConfirmed: false`, `sourceRef: null`).
 * They serve as tentative drill thresholds and MUST NOT be represented as canonical or pre-existing runbook values.
 */

import { FullReconciliationReport } from "./reconciliation-engine";

export interface DisasterRecoveryBaseline {
  rpoTargetMinutes: number;
  rpoTargetSeconds: number;
  rtoTargetMinutes: number;
  rtoTargetSeconds: number;
  isConfirmed: boolean;
  status: "pending_confirmation" | "confirmed";
  sourceRef: string | null;
  note: string;
}

export const DISASTER_RECOVERY_BASELINE: DisasterRecoveryBaseline = {
  rpoTargetMinutes: 15, // 演練參考值（待SRE/維運團隊確認）
  rpoTargetSeconds: 900,
  rtoTargetMinutes: 60, // 演練參考值（待SRE/維運團隊確認）
  rtoTargetSeconds: 3600,
  isConfirmed: false,
  status: "pending_confirmation",
  sourceRef: null, // 全庫核查無既有權威來源，絕不偽標引用
  note: "RPO/RTO 基準待確認，非既有文件值。既有 runbook 未定義具體數值，待維運與架構團隊簽核正式 SLO。",
};

export interface RpoEvaluation {
  snapshotTimestamp: string;
  cutoffTimestamp: string;
  rpoSeconds: number;
  rpoMinutes: number;
  targetMinutes: number;
  baselineConfirmed: boolean;
  baselineStatus: "pending_confirmation" | "confirmed";
  compliant: boolean;
  notes: string;
}

export interface RtoEvaluation {
  restoreStartTime: string;
  verificationEndTime: string;
  rtoSeconds: number;
  rtoMinutes: number;
  rtoElapsedMs: number;
  targetMinutes: number;
  baselineConfirmed: boolean;
  baselineStatus: "pending_confirmation" | "confirmed";
  compliant: boolean;
  notes: string;
}

export interface DrReadinessAssessment {
  overallCompliant: boolean;
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

  const compliant = rpoSeconds <= DISASTER_RECOVERY_BASELINE.rpoTargetSeconds;

  return {
    snapshotTimestamp: snapDate.toISOString(),
    cutoffTimestamp: cutoffDate.toISOString(),
    rpoSeconds,
    rpoMinutes,
    targetMinutes: DISASTER_RECOVERY_BASELINE.rpoTargetMinutes,
    baselineConfirmed: DISASTER_RECOVERY_BASELINE.isConfirmed,
    baselineStatus: DISASTER_RECOVERY_BASELINE.status,
    compliant,
    notes: compliant
      ? `RPO 符合暫定參考值 ${DISASTER_RECOVERY_BASELINE.rpoTargetMinutes} 分鐘 (${rpoMinutes}m <= ${DISASTER_RECOVERY_BASELINE.rpoTargetMinutes}m) [注意：RPO基準待確認，非既有文件值]`
      : `RPO 超出暫定參考值！資料時間差為 ${rpoMinutes}m > ${DISASTER_RECOVERY_BASELINE.rpoTargetMinutes}m [注意：RPO基準待確認，非既有文件值]`,
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

  const compliant = rtoSeconds <= DISASTER_RECOVERY_BASELINE.rtoTargetSeconds;

  return {
    restoreStartTime: startDate.toISOString(),
    verificationEndTime: endDate.toISOString(),
    rtoSeconds,
    rtoMinutes,
    rtoElapsedMs: diffMs,
    targetMinutes: DISASTER_RECOVERY_BASELINE.rtoTargetMinutes,
    baselineConfirmed: DISASTER_RECOVERY_BASELINE.isConfirmed,
    baselineStatus: DISASTER_RECOVERY_BASELINE.status,
    compliant,
    notes: compliant
      ? `RTO 符合暫定參考值 ${DISASTER_RECOVERY_BASELINE.rtoTargetMinutes} 分鐘 (${rtoMinutes}m <= ${DISASTER_RECOVERY_BASELINE.rtoTargetMinutes}m) [注意：RTO基準待確認，非既有文件值]`
      : `RTO 超出暫定參考值！還原耗時 ${rtoMinutes}m > ${DISASTER_RECOVERY_BASELINE.rtoTargetMinutes}m [注意：RTO基準待確認，非既有文件值]`,
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
  const overallCompliant = rpo.compliant && rto.compliant && reconciliation.overallPassed;

  let summaryZh = "";
  if (overallCompliant) {
    summaryZh = `災難復原演練暫定參考指標通過：RPO ${rpo.rpoMinutes} 分鐘（≤${rpo.targetMinutes}分）、RTO ${rto.rtoMinutes} 分鐘（≤${rto.targetMinutes}分），且行程／帳務／稽核三領域校核全數通過。（注意：RPO/RTO 基準待確認，非既有文件值）`;
  } else {
    const reasons: string[] = [];
    if (!rpo.compliant) reasons.push(`RPO 逾時 (${rpo.rpoMinutes}m > ${rpo.targetMinutes}m)`);
    if (!rto.compliant) reasons.push(`RTO 逾時 (${rto.rtoMinutes}m > ${rto.targetMinutes}m)`);
    if (!reconciliation.overallPassed) reasons.push(`校核存在 ${reconciliation.allDiscrepancies.length} 處差異`);
    summaryZh = `災難復原演練未合規：${reasons.join("；")}（注意：RPO/RTO 基準待確認，非既有文件值）`;
  }

  return {
    overallCompliant,
    rpo,
    rto,
    reconciliationPassed: reconciliation.overallPassed,
    baselineConfirmed: DISASTER_RECOVERY_BASELINE.isConfirmed,
    summaryZh,
  };
}
