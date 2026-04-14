import type { MoneyAmount } from ".";

export interface PlatformEarningsItem {
  platformCode: string;
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
