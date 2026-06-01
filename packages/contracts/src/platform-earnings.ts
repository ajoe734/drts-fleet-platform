import type { DriverPayoutStatus, MoneyAmount } from ".";
import type { PlatformCode } from "./platform-codes";
import type {
  CrossAppResourceLink,
  EmptyStateEnvelope,
  RefreshTier,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  UiSeverity,
} from "./ui-runtime";

export interface PlatformEarningsItem {
  platformCode: PlatformCode;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
}

export interface PlatformEarningsByPlatformResponse {
  driverId: string;
  items: PlatformEarningsItem[];
  notes?: string[];
}

export interface PlatformEarningsSummary {
  driverId: string;
  totalGross: MoneyAmount;
  totalServiceFee: MoneyAmount;
  totalSubsidy: MoneyAmount;
  totalNet: MoneyAmount;
  notes?: string[];
}

export type DriverEarningsPeriod = "today" | "week" | "month";

export interface DriverEarningsSummaryCard {
  netAmount: MoneyAmount;
  grossAmount: MoneyAmount;
  serviceFeeAmount: MoneyAmount;
  pendingPayoutAmount: MoneyAmount;
  platformCount: number;
}

export interface DriverEarningsPlatformBreakdownItem extends PlatformEarningsItem {
  platformName: string;
  authorityLabel: string;
  authorityTone: "owned" | "external" | "reference_only";
  referenceOnly: boolean;
  availableActions: ResourceActionDescriptor[];
}

export interface DriverEarningsStatementListItem {
  statementId: string;
  receiptNo: string;
  periodMonth: string;
  tripCount: number;
  feePlanVersion: string;
  payoutStatus: DriverPayoutStatus;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
  availableActions: ResourceActionDescriptor[];
}

export interface DriverEarningsReconciliationIssueCard {
  issueId: string;
  summary: string;
  detail: string;
  severity: UiSeverity;
  availableActions: ResourceActionDescriptor[];
  managerReviewLink: CrossAppResourceLink;
}

export interface DriverEarningsDashboard {
  driverId: string;
  period: DriverEarningsPeriod;
  refreshTier: RefreshTier;
  refresh: UiRefreshMetadata;
  summary: DriverEarningsSummaryCard;
  platformBreakdown: DriverEarningsPlatformBreakdownItem[];
  statements: DriverEarningsStatementListItem[];
  reconciliationIssue: DriverEarningsReconciliationIssueCard | null;
  emptyState: EmptyStateEnvelope | null;
  availableActions: ResourceActionDescriptor[];
  notes?: string[];
}
