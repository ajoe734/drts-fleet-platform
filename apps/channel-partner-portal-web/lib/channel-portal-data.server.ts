import "server-only";

import type { MoneyAmount } from "@drts/contracts";

import { getServerReferralPartnerClient } from "./api-client.server";
import {
  FX_REFERRAL_DASHBOARD,
  FX_REFERRAL_STATEMENTS,
  FX_REFERRAL_USAGE_DAILY,
  FX_REFERRAL_USAGE_PERIODS,
  type ReferralDashboardFixture,
  type ReferralStatementLineView,
  type ReferralStatementView,
  type ReferralUsageDailyRow,
  type ReferralUsagePeriod,
} from "./referral-portal-fixtures";
import type {
  PartnerReferralDashboardRecord,
  PartnerReferralRevenuePeriodRecord,
  PartnerReferralUsagePeriodRecord,
  ReferralStatementLineRecord,
  ReferralStatementRecord,
  ReferralStatementStatus,
} from "./referral-portal-contracts";

export type DataSource = "live" | "fallback";

// --- shared formatters ------------------------------------------------------

function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "—";
  }
  const major = Math.round(amount.amountMinor / 100);
  const grouped = major.toLocaleString("en-US");
  return amount.currency === "TWD"
    ? `NT$ ${grouped}`
    : `${amount.currency} ${grouped}`;
}

function formatDecimalMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "—";
  }
  const major = amount.amountMinor / 100;
  const formatted = major.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 1,
    maximumFractionDigits: 1,
  });
  return amount.currency === "TWD"
    ? `NT$ ${formatted}`
    : `${amount.currency} ${formatted}`;
}

// --- referral channel-partner data layer ------------------------------------

function mapReferralStatementStatus(
  status: ReferralStatementStatus,
): "published" | "paid" | "due" {
  return status;
}

function formatStatementLineDate(iso: string) {
  const match = iso.match(/^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : iso;
}

function maskReferralRider(tripId: string) {
  const suffix = tripId
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-3)
    .toUpperCase();
  return `住戶 ••••${suffix || "REF"}`;
}

function inferReferralRoute(tripId: string) {
  const routes = [
    "社區 → 台北車站",
    "社區 → 內湖科技園區",
    "信義威秀 → 社區",
    "社區 → 台北榮總",
    "松山機場 → 社區",
  ];
  let sum = 0;
  for (const char of tripId) {
    sum += char.charCodeAt(0);
  }
  return routes[sum % routes.length] ?? "社區 → 台北車站";
}

function mapReferralLine(
  line: ReferralStatementLineRecord,
): ReferralStatementLineView {
  return {
    trip: line.tripId,
    date: formatStatementLineDate(line.completedAt),
    route: inferReferralRoute(line.tripId),
    rider: maskReferralRider(line.tripId),
    fare: formatMoney(line.fare),
    share: formatDecimalMoney(line.shareAmount),
  };
}

function mapReferralStatement(
  record: ReferralStatementRecord,
): ReferralStatementView {
  return {
    id: record.statementId,
    period: record.period,
    trips: record.totals.tripCount.toLocaleString("en-US"),
    activeUsers: record.totals.activeRiderCount.toLocaleString("en-US"),
    gmv: formatMoney(record.totals.gmv),
    share: formatMoney(record.totals.shareTotal),
    status: mapReferralStatementStatus(record.status),
    issued: record.generatedAt.slice(0, 10),
    artifactId: record.artifactRef.artifactId,
    artifactHash: record.artifactRef.manifestHash,
    direction: "DRTS → Partner",
    lines: record.lines.map(mapReferralLine),
  };
}

function buildReferralDailyUsage(
  lines: ReferralStatementLineRecord[],
): ReferralUsageDailyRow[] {
  const grouped = new Map<
    string,
    { trips: number; gmvMinor: number; users: Set<string> }
  >();

  for (const line of lines) {
    const day = line.completedAt.slice(0, 10);
    const current = grouped.get(day) ?? {
      trips: 0,
      gmvMinor: 0,
      users: new Set<string>(),
    };
    current.trips += 1;
    current.gmvMinor += line.fare.amountMinor;
    current.users.add(maskReferralRider(line.tripId));
    grouped.set(day, current);
  }

  return [...grouped.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .slice(0, 5)
    .map(([day, value]) => ({
      day,
      users: value.users.size.toLocaleString("en-US"),
      trips: value.trips.toLocaleString("en-US"),
      gmv: formatMoney({ currency: "TWD", amountMinor: value.gmvMinor }),
    }));
}

export interface ReferralDashboardView {
  summary: ReferralDashboardFixture;
  periods: ReferralUsagePeriod[];
  source: DataSource;
}

function mapReferralDashboard(
  summary: PartnerReferralDashboardRecord,
): ReferralDashboardFixture {
  return {
    period: summary.period,
    activeUsers: summary.activeUserCount.toLocaleString("en-US"),
    trips: summary.tripCount.toLocaleString("en-US"),
    gmv: formatMoney(summary.gmv),
    estimatedShare: formatMoney(summary.estimatedShareAmount),
    statementId: summary.statementId,
    statementStatus: mapReferralStatementStatus(summary.statementStatus),
    latestStatementPeriod: summary.latestStatementPeriod,
    pendingStatementCount:
      summary.pendingStatementCount.toLocaleString("en-US"),
  };
}

function mapReferralUsagePeriod(
  item: PartnerReferralUsagePeriodRecord,
): ReferralUsagePeriod {
  const avg =
    item.activeUserCount > 0 ? item.tripCount / item.activeUserCount : 0;
  return {
    period: item.period,
    activeUsers: item.activeUserCount.toLocaleString("en-US"),
    trips: item.tripCount.toLocaleString("en-US"),
    gmv: formatMoney(item.gmv),
    avgTripsPerUser: avg.toFixed(1),
  };
}

export async function loadReferralDashboard(): Promise<ReferralDashboardView> {
  try {
    const { client } = await getServerReferralPartnerClient();
    const [summary, usageResponse] = await Promise.all([
      client.get<PartnerReferralDashboardRecord>(
        "/api/partner/referral/dashboard",
      ),
      client.get<{ items: PartnerReferralUsagePeriodRecord[] }>(
        "/api/partner/referral/usage",
      ),
    ]);
    return {
      summary: mapReferralDashboard(summary),
      periods: usageResponse.items.map(mapReferralUsagePeriod),
      source: "live",
    };
  } catch {
    return {
      summary: FX_REFERRAL_DASHBOARD,
      periods: FX_REFERRAL_USAGE_PERIODS,
      source: "fallback",
    };
  }
}

export interface ReferralUsageView {
  periods: ReferralUsagePeriod[];
  dailyRows: ReferralUsageDailyRow[];
  tripRows: ReferralStatementLineView[];
  source: DataSource;
}

export async function loadReferralUsage(): Promise<ReferralUsageView> {
  const fallback: ReferralUsageView = {
    periods: FX_REFERRAL_USAGE_PERIODS,
    dailyRows: FX_REFERRAL_USAGE_DAILY,
    tripRows: FX_REFERRAL_STATEMENTS[0]?.lines ?? [],
    source: "fallback",
  };
  try {
    const { client } = await getServerReferralPartnerClient();
    const [usageResponse, statementResponse] = await Promise.all([
      client.get<{ items: PartnerReferralUsagePeriodRecord[] }>(
        "/api/partner/referral/usage",
      ),
      client.get<{ items: ReferralStatementRecord[] }>(
        "/api/partner/referral/statements",
      ),
    ]);
    const periods = usageResponse.items.map(mapReferralUsagePeriod);
    const currentStatement = statementResponse.items[0];
    if (!currentStatement) {
      return {
        periods,
        dailyRows: [],
        tripRows: [],
        source: "live",
      };
    }
    const mappedStatement = mapReferralStatement(currentStatement);
    return {
      periods,
      dailyRows: buildReferralDailyUsage(currentStatement.lines),
      tripRows: mappedStatement.lines,
      source: "live",
    };
  } catch {
    return fallback;
  }
}

export interface ReferralRevenueView {
  rows: PartnerReferralRevenuePeriodRecord[];
  source: DataSource;
}

export async function loadReferralRevenue(): Promise<ReferralRevenueView> {
  try {
    const { client } = await getServerReferralPartnerClient();
    const response = await client.get<{
      items: PartnerReferralRevenuePeriodRecord[];
    }>("/api/partner/referral/revenue");
    return {
      rows: response.items,
      source: "live",
    };
  } catch {
    return {
      rows: [],
      source: "fallback",
    };
  }
}

export interface ReferralStatementsView {
  rows: ReferralStatementView[];
  source: DataSource;
}

export async function loadReferralStatements(): Promise<ReferralStatementsView> {
  try {
    const { client } = await getServerReferralPartnerClient();
    const response = await client.get<{ items: ReferralStatementRecord[] }>(
      "/api/partner/referral/statements",
    );
    return {
      rows: response.items.map(mapReferralStatement),
      source: "live",
    };
  } catch {
    return {
      rows: FX_REFERRAL_STATEMENTS,
      source: "fallback",
    };
  }
}

export interface ReferralStatementDetailView {
  statement: ReferralStatementView | null;
  source: DataSource;
}

export async function loadReferralStatementDetail(
  period: string,
): Promise<ReferralStatementDetailView> {
  try {
    const { client } = await getServerReferralPartnerClient();
    const statement = await client.get<ReferralStatementRecord>(
      `/api/partner/referral/statements/${encodeURIComponent(period)}`,
    );
    return {
      statement: mapReferralStatement(statement),
      source: "live",
    };
  } catch {
    return {
      statement:
        FX_REFERRAL_STATEMENTS.find((item) => item.period === period) ?? null,
      source: "fallback",
    };
  }
}
