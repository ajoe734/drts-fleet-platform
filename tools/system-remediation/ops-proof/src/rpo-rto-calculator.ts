/**
 * RPO / RTO Calculator & Disaster Recovery Evaluator
 * 
 * Computes Recovery Point Objective (RPO) and Recovery Time Objective (RTO) against operational runbook baselines.
 * Baseline references:
 * - docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md
 * - docs/03-runbooks/incident-escalation-service-recovery-runbook.md
 * RPO/RTO thresholds are strictly derived from runbook baselines, not invented.
 */

import { FullReconciliationReport } from "./reconciliation-engine";

export const DISASTER_RECOVERY_BASELINE = {
  rpoTargetMinutes: 15, // Maximum allowed data loss window: 15 minutes (900 seconds)
  rpoTargetSeconds: 900,
  rtoTargetMinutes: 60, // Maximum allowed recovery time to full service: 60 minutes (3600 seconds)
  rtoTargetSeconds: 3600,
  sourceRef: "docs/03-runbooks/incident-escalation-service-recovery-runbook.md §DR-SLA",
};

export interface RpoEvaluation {
  snapshotTimestamp: string;
  cutoffTimestamp: string;
  rpoSeconds: number;
  rpoMinutes: number;
  targetMinutes: number;
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
  compliant: boolean;
  notes: string;
}

export interface DrReadinessAssessment {
  overallCompliant: boolean;
  rpo: RpoEvaluation;
  rto: RtoEvaluation;
  reconciliationPassed: boolean;
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
    compliant,
    notes: compliant
      ? `RPO is within ${DISASTER_RECOVERY_BASELINE.rpoTargetMinutes}-minute baseline (${rpoMinutes}m <= ${DISASTER_RECOVERY_BASELINE.rpoTargetMinutes}m)`
      : `RPO breached baseline! Data age is ${rpoMinutes}m > ${DISASTER_RECOVERY_BASELINE.rpoTargetMinutes}m`,
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
    compliant,
    notes: compliant
      ? `RTO is within ${DISASTER_RECOVERY_BASELINE.rtoTargetMinutes}-minute baseline (${rtoMinutes}m <= ${DISASTER_RECOVERY_BASELINE.rtoTargetMinutes}m)`
      : `RTO breached baseline! Recovery duration ${rtoMinutes}m > ${DISASTER_RECOVERY_BASELINE.rtoTargetMinutes}m`,
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
    summaryZh = `災難復原演練合規：RPO ${rpo.rpoMinutes} 分鐘（≤${rpo.targetMinutes}分）、RTO ${rto.rtoMinutes} 分鐘（≤${rto.targetMinutes}分），且行程／帳務／稽核三領域校核全數通過。`;
  } else {
    const reasons: string[] = [];
    if (!rpo.compliant) reasons.push(`RPO 逾時 (${rpo.rpoMinutes}m > ${rpo.targetMinutes}m)`);
    if (!rto.compliant) reasons.push(`RTO 逾時 (${rto.rtoMinutes}m > ${rto.targetMinutes}m)`);
    if (!reconciliation.overallPassed) reasons.push(`校核存在 ${reconciliation.allDiscrepancies.length} 處差異`);
    summaryZh = `災難復原演練未合規：${reasons.join("；")}`;
  }

  return {
    overallCompliant,
    rpo,
    rto,
    reconciliationPassed: reconciliation.overallPassed,
    summaryZh,
  };
}
