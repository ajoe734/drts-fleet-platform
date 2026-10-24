import {
  REFERRAL_MONTHLY_COACHING_THRESHOLD,
  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS,
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD,
  type ReferralMonthlyGovernanceOutcome,
  type ReferralMonthlyGovernanceRuleType,
} from "@drts/contracts";

export const referralMonthlyGovernanceCopy = {
  sectionAriaLabel: "司機月評分輔導與連續低分終止處理",
  sectionTitle: "司機月評分輔導與連續低分終止處理（R04）",
  ruleSummary: `規則門檻：月平均低於 ${REFERRAL_MONTHLY_COACHING_THRESHOLD.toFixed(1)} 要輔導；連續 ${REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS} 個月低於 ${REFERRAL_MONTHLY_TERMINATION_THRESHOLD.toFixed(1)} 要終止。無評價月份視為「無資料（no_data）」不計 0 分，並中斷連續低分月份計算。`,
  evaluateButton: "評估／載入跨月輔導與終止紀錄",
  loadGovernanceFailed: "無法載入輔導與終止紀錄。",
  saveOutcomeFailed: "處置結果儲存失敗。",
  reasonRequiredError: "請輸入處置原因。",
  tableCaption: "司機月評分輔導與終止處理紀錄",
  colDriver: "駕駛",
  colRuleType: "規則類型",
  colTriggeredMonths: "觸發月份",
  colMonthlyBreakdown: "跨月平均明細",
  colHandlingStatus: "處置狀態與紀錄",
  colActions: "處置操作",
  outcomeLabelText: "處置結果",
  outcomeOptionCoached: "已輔導 (coached)",
  outcomeOptionTerminated: "已終止 (terminated)",
  outcomeOptionDismissed: "不予處置 (dismissed)",
  outcomePending: "待處理 (pending)",
  reasonLabelText: "處置原因",
  reasonPlaceholder: "請輸入處置原因",
  saveButtonText: "儲存處置結果",
  emptyText: "此月份無需輔導或終止檢討之駕駛。",
  monthSeparator: "、",
  breakdownSeparator: " ／ ",
} as const;

export function formatGovernanceOutcomeLabel(
  outcome: ReferralMonthlyGovernanceOutcome | null,
): string {
  switch (outcome) {
    case "coached":
      return referralMonthlyGovernanceCopy.outcomeOptionCoached;
    case "terminated":
      return referralMonthlyGovernanceCopy.outcomeOptionTerminated;
    case "dismissed":
      return referralMonthlyGovernanceCopy.outcomeOptionDismissed;
    default:
      return referralMonthlyGovernanceCopy.outcomePending;
  }
}

export function formatGovernanceRuleLabel(
  ruleType: ReferralMonthlyGovernanceRuleType,
): string {
  return ruleType === "termination_review"
    ? `連續 ${REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS} 個月低於 ${REFERRAL_MONTHLY_TERMINATION_THRESHOLD.toFixed(1)} 要終止`
    : `月平均低於 ${REFERRAL_MONTHLY_COACHING_THRESHOLD.toFixed(1)} 要輔導`;
}

export function formatMonthlyBreakdownItem(item: {
  periodMonth: string;
  ratingCount: number;
  averageRating: number | null;
  status: "rated" | "no_data";
}): string {
  return item.status === "no_data" || item.averageRating === null
    ? `${item.periodMonth}: 無資料 (no_data)`
    : `${item.periodMonth}: ${item.averageRating.toFixed(2)} (${item.ratingCount}筆)`;
}

export function formatGovernanceStatusCell(
  record: {
    outcome: ReferralMonthlyGovernanceOutcome | null;
    outcomeReason: string | null;
    handledByActorId: string | null;
    auditId: string | null;
  },
): string {
  let result = formatGovernanceOutcomeLabel(record.outcome);
  if (record.outcomeReason) {
    result += `｜原因：${record.outcomeReason}`;
  }
  if (record.handledByActorId) {
    result += `｜處理人：${record.handledByActorId}`;
  }
  if (record.auditId) {
    result += `｜稽核：${record.auditId}`;
  }
  return result;
}

export function formatOutcomeSelectAriaLabel(
  driverId: string,
  ruleType: ReferralMonthlyGovernanceRuleType,
): string {
  return `處置結果 ${driverId} ${ruleType}`;
}

export function formatReasonInputAriaLabel(
  driverId: string,
  ruleType: ReferralMonthlyGovernanceRuleType,
): string {
  return `處置原因 ${driverId} ${ruleType}`;
}

export function formatSaveOutcomeAriaLabel(
  driverId: string,
  ruleType: ReferralMonthlyGovernanceRuleType,
): string {
  return `儲存處置 ${driverId} ${ruleType}`;
}
