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
import type { Locale } from "./translations";
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

function maskReferralRider(tripId: string, locale: Locale = "zh") {
  const suffix = tripId
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-3)
    .toUpperCase();
  return (locale === "en" ? "Resident" : "住戶") + " ••••" + (suffix || "REF");
}

function inferReferralRoute(tripId: string, locale: Locale = "zh") {
  const routes =
    locale === "en"
      ? [
          "Community → Taipei Main Station",
          "Community → Neihu Technology Park",
          "Xinyi Vieshow → Community",
          "Community → Taipei Veterans General Hospital",
          "Songshan Airport → Community",
        ]
      : [
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
  return routes[sum % routes.length] ?? routes[0] ?? "—";
}

function mapReferralLine(
  line: ReferralStatementLineRecord,
  locale: Locale = "zh",
): ReferralStatementLineView {
  return {
    trip: line.tripId,
    date: formatStatementLineDate(line.completedAt),
    route: inferReferralRoute(line.tripId, locale),
    rider: maskReferralRider(line.tripId, locale),
    fare: formatMoney(line.fare),
    share: formatDecimalMoney(line.shareAmount),
  };
}

function mapReferralStatement(
  record: ReferralStatementRecord,
  locale: Locale = "zh",
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
    direction: locale === "en" ? "DRTS → Partner" : "DRTS → 夥伴",
    lines: record.lines.map((line) => mapReferralLine(line, locale)),
  };
}

function buildReferralDailyUsage(
  lines: ReferralStatementLineRecord[],
  locale: Locale = "zh",
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
    current.users.add(maskReferralRider(line.tripId, locale));
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

function localizeReferralStatementLine(
  line: ReferralStatementLineView,
  locale: Locale,
): ReferralStatementLineView {
  return {
    ...line,
    route: inferReferralRoute(line.trip, locale),
    rider: maskReferralRider(line.trip, locale),
  };
}

function localizeReferralStatement(
  statement: ReferralStatementView,
  locale: Locale,
): ReferralStatementView {
  return {
    ...statement,
    direction: locale === "en" ? "DRTS → Partner" : statement.direction,
    lines: statement.lines.map((line) =>
      localizeReferralStatementLine(line, locale),
    ),
  };
}

function localizeReferralStatements(
  statements: ReferralStatementView[],
  locale: Locale,
): ReferralStatementView[] {
  return statements.map((statement) =>
    localizeReferralStatement(statement, locale),
  );
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

export async function loadReferralUsage(
  locale: Locale = "zh",
): Promise<ReferralUsageView> {
  const fallback: ReferralUsageView = {
    periods: FX_REFERRAL_USAGE_PERIODS,
    dailyRows: FX_REFERRAL_USAGE_DAILY,
    tripRows: (FX_REFERRAL_STATEMENTS[0]?.lines ?? []).map((line) =>
      localizeReferralStatementLine(line, locale),
    ),
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
    const mappedStatement = mapReferralStatement(currentStatement, locale);
    return {
      periods,
      dailyRows: buildReferralDailyUsage(currentStatement.lines, locale),
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

export async function loadReferralStatements(
  locale: Locale = "zh",
): Promise<ReferralStatementsView> {
  try {
    const { client } = await getServerReferralPartnerClient();
    const response = await client.get<{ items: ReferralStatementRecord[] }>(
      "/api/partner/referral/statements",
    );
    return {
      rows: response.items.map((statement) =>
        mapReferralStatement(statement, locale),
      ),
      source: "live",
    };
  } catch {
    return {
      rows: localizeReferralStatements(FX_REFERRAL_STATEMENTS, locale),
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
  locale: Locale = "zh",
): Promise<ReferralStatementDetailView> {
  try {
    const { client } = await getServerReferralPartnerClient();
    const response = await client.get<{ items: ReferralStatementRecord[] }>(
      "/api/partner/referral/statements",
    );
    const statement = response.items.find((item) => item.period === period);
    return {
      statement: statement ? mapReferralStatement(statement, locale) : null,
      source: "live",
    };
  } catch {
    return {
      statement:
        localizeReferralStatements(FX_REFERRAL_STATEMENTS, locale).find(
          (item) => item.period === period,
        ) ?? null,
      source: "fallback",
    };
  }
}
