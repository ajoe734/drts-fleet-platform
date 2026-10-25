/** Read-only committed Referral ratings; no PAX-ledger moderation identity. */
export interface ReferralMonthlyRatingQuery {
  periodMonth: string;
  driverId?: string;
  tenantId?: string;
  partnerId?: string;
  partnerProgramId?: string;
  entrySlug?: string;
}

export interface ReferralMonthlyRatingRow {
  orderId: string;
  orderNo: string;
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  entrySlug: string | null;
  score: number;
  tags: string[];
  comment: string | null;
  submittedAt: string;
  contactRequested: boolean | null;
  complaintCaseNo: string | null;
  driverId: string | null;
  taskId: string | null;
  assignmentId: string | null;
  completedAt: string | null;
  attribution: "completed_task" | "unavailable";
}

export interface ReferralMonthlyRatingSummary {
  driverId: string;
  ratingCount: number;
  averageRating: number;
  lastRatedAt: string;
}

export interface ReferralMonthlyRatingReport {
  periodMonth: string;
  timeZone: "Asia/Taipei";
  ratingCount: number;
  averageRating: number | null;
  unattributedRatingCount: number;
  drivers: ReferralMonthlyRatingSummary[];
  rows: ReferralMonthlyRatingRow[];
  governance?: ReferralMonthlyRatingGovernanceReport;
}

/** Bureau R04: monthly average rating below 4.0 requires driver coaching (月平均低於 4.0 要輔導). */
export const REFERRAL_MONTHLY_COACHING_THRESHOLD = 4.0 as const;
export const DRIVER_MONTHLY_RATING_COACHING_THRESHOLD =
  REFERRAL_MONTHLY_COACHING_THRESHOLD;

/** Bureau R04: 3 consecutive calendar months with average rating below 3.5 requires termination review (連續 3 個月低於 3.5 要終止). */
export const REFERRAL_MONTHLY_TERMINATION_THRESHOLD = 3.5 as const;
export const DRIVER_MONTHLY_RATING_TERMINATION_THRESHOLD =
  REFERRAL_MONTHLY_TERMINATION_THRESHOLD;

/** Bureau R04: number of consecutive Asia/Taipei calendar months below 3.5 required for termination review. */
export const REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS = 3 as const;
export const DRIVER_MONTHLY_RATING_TERMINATION_CONSECUTIVE_MONTHS =
  REFERRAL_MONTHLY_TERMINATION_CONSECUTIVE_MONTHS;

/**
 * Bureau R04 consecutive-month streak rule for months with no ratings:
 * Months with no canonical ratings are recorded as 'no_data' (averageRating: null, never 0)
 * and break a consecutive calendar-month < 3.5 streak.
 */
export const REFERRAL_MONTHLY_NO_DATA_STREAK_RULE =
  "no_data_breaks_consecutive_calendar_months" as const;

export const REFERRAL_MONTHLY_GOVERNANCE_RULE_TYPES = [
  "coaching",
  "termination_review",
] as const;
export type ReferralMonthlyGovernanceRuleType =
  (typeof REFERRAL_MONTHLY_GOVERNANCE_RULE_TYPES)[number];

export const REFERRAL_MONTHLY_GOVERNANCE_OUTCOMES = [
  "coached",
  "terminated",
  "dismissed",
] as const;
export type ReferralMonthlyGovernanceOutcome =
  (typeof REFERRAL_MONTHLY_GOVERNANCE_OUTCOMES)[number];

export type ReferralMonthlyGovernanceStatus =
  | "pending"
  | ReferralMonthlyGovernanceOutcome;

export interface ReferralMonthlyDriverMonthScore {
  periodMonth: string;
  ratingCount: number;
  averageRating: number | null;
  status: "rated" | "no_data";
  belowCoachingThreshold: boolean;
  belowTerminationThreshold: boolean;
}

export interface ReferralMonthlyRatingGovernanceRecord {
  recordId: string;
  driverId: string;
  periodMonth: string;
  ruleType: ReferralMonthlyGovernanceRuleType;
  threshold: number;
  averageRating: number;
  ratingCount: number;
  consecutiveLowMonths: number;
  triggeredMonths: string[];
  monthlyBreakdown: ReferralMonthlyDriverMonthScore[];
  status: ReferralMonthlyGovernanceStatus;
  outcome: ReferralMonthlyGovernanceOutcome | null;
  outcomeReason: string | null;
  handledByActorId: string | null;
  handledAt: string | null;
  auditId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralMonthlyFlaggedDriverSummary {
  driverId: string;
  periodMonth: string;
  ratingCount: number;
  averageRating: number;
  coachingRequired: boolean;
  terminationReviewRequired: boolean;
  consecutiveMonthsBelow35: number;
  triggeredMonths: string[];
  monthlyBreakdown: ReferralMonthlyDriverMonthScore[];
  records: ReferralMonthlyRatingGovernanceRecord[];
}

export interface ReferralMonthlyDriverStreakSummary {
  driverId: string;
  periodMonth: string;
  consecutiveMonthsBelow35: number;
  coachingRequired: boolean;
  terminationReviewRequired: boolean;
  triggeredMonths: string[];
  monthlyBreakdown: ReferralMonthlyDriverMonthScore[];
}

export interface ReferralMonthlyRatingGovernanceReport {
  periodMonth: string;
  timeZone: "Asia/Taipei";
  evaluatedWindowMonths: string[];
  coachingThreshold: number;
  terminationThreshold: number;
  terminationConsecutiveMonths: number;
  noDataStreakRule: typeof REFERRAL_MONTHLY_NO_DATA_STREAK_RULE;
  flaggedDrivers: ReferralMonthlyFlaggedDriverSummary[];
  records: ReferralMonthlyRatingGovernanceRecord[];
  driverStreaks: ReferralMonthlyDriverStreakSummary[];
}

export interface RecordReferralMonthlyGovernanceOutcomeCommand {
  recordId?: string;
  driverId?: string;
  periodMonth?: string;
  ruleType?: ReferralMonthlyGovernanceRuleType;
  outcome: ReferralMonthlyGovernanceOutcome;
  reason: string;
}
