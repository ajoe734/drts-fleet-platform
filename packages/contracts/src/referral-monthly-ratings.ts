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
}
