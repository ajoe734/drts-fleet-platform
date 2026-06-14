export type ReferralStatementStatus = "published" | "paid" | "due";

export type ReferralDashboardFixture = {
  period: string;
  activeUsers: string;
  trips: string;
  gmv: string;
  estimatedShare: string;
  statementId: string;
  statementStatus: ReferralStatementStatus;
  latestStatementPeriod: string | null;
  pendingStatementCount: string;
};

export type ReferralUsagePeriod = {
  period: string;
  activeUsers: string;
  trips: string;
  gmv: string;
  avgTripsPerUser: string;
};

export type ReferralUsageDailyRow = {
  day: string;
  users: string;
  trips: string;
  gmv: string;
};

export type ReferralStatementLineView = {
  trip: string;
  date: string;
  route: string;
  rider: string;
  fare: string;
  share: string;
};

export type ReferralStatementView = {
  id: string;
  period: string;
  trips: string;
  activeUsers: string;
  gmv: string;
  share: string;
  status: ReferralStatementStatus;
  issued: string;
  artifactId: string;
  artifactHash: string;
  direction: string;
  lines: ReferralStatementLineView[];
};

export const FX_REFERRAL_DASHBOARD: ReferralDashboardFixture = {
  period: "2026-05",
  activeUsers: "268",
  trips: "884",
  gmv: "NT$ 264,300",
  estimatedShare: "NT$ 26,430",
  statementId: "referral-statement-referral-demo-community-2026-05",
  statementStatus: "due",
  latestStatementPeriod: "2026-05",
  pendingStatementCount: "1",
};

export const FX_REFERRAL_USAGE_PERIODS: ReferralUsagePeriod[] = [
  {
    period: "2026-05",
    activeUsers: "268",
    trips: "884",
    gmv: "NT$ 264,300",
    avgTripsPerUser: "3.3",
  },
  {
    period: "2026-04",
    activeUsers: "236",
    trips: "742",
    gmv: "NT$ 221,800",
    avgTripsPerUser: "3.1",
  },
];

export const FX_REFERRAL_USAGE_DAILY: ReferralUsageDailyRow[] = [
  { day: "2026-05-31", users: "41", trips: "58", gmv: "NT$ 16,820" },
  { day: "2026-05-30", users: "38", trips: "49", gmv: "NT$ 14,210" },
  { day: "2026-05-29", users: "33", trips: "44", gmv: "NT$ 12,960" },
  { day: "2026-05-28", users: "45", trips: "61", gmv: "NT$ 18,340" },
  { day: "2026-05-27", users: "29", trips: "37", gmv: "NT$ 10,580" },
];

export const FX_REFERRAL_STATEMENT_LINES: ReferralStatementLineView[] = [
  {
    trip: "PT-9E11A3",
    date: "05-31 14:05",
    route: "台北車站 → 社區",
    rider: "住戶 ••••2A2",
    fare: "NT$ 285",
    share: "NT$ 28.5",
  },
  {
    trip: "PT-9E0F77",
    date: "05-31 09:20",
    route: "社區 → 內湖科技園區",
    rider: "住戶 ••••8B1",
    fare: "NT$ 410",
    share: "NT$ 41.0",
  },
  {
    trip: "PT-9DF120",
    date: "05-30 18:42",
    route: "信義威秀 → 社區",
    rider: "住戶 ••••4C9",
    fare: "NT$ 268",
    share: "NT$ 26.8",
  },
  {
    trip: "PT-9DA088",
    date: "05-30 08:05",
    route: "社區 → 台北榮總",
    rider: "住戶 ••••2A2",
    fare: "NT$ 320",
    share: "NT$ 32.0",
  },
  {
    trip: "PT-9D6610",
    date: "05-29 21:10",
    route: "松山機場 → 社區",
    rider: "住戶 ••••7F3",
    fare: "NT$ 246",
    share: "NT$ 24.6",
  },
];

export const FX_REFERRAL_STATEMENTS: ReferralStatementView[] = [
  {
    id: "referral-statement-referral-demo-community-2026-05",
    period: "2026-05",
    trips: "884",
    activeUsers: "268",
    gmv: "NT$ 264,300",
    share: "NT$ 26,430",
    status: "due",
    issued: "2026-06-01",
    artifactId: "referral-statement-referral-demo-community-2026-05",
    artifactHash: "9f2a…7c41",
    direction: "DRTS → 御和物業",
    lines: FX_REFERRAL_STATEMENT_LINES,
  },
  {
    id: "referral-statement-referral-demo-community-2026-04",
    period: "2026-04",
    trips: "742",
    activeUsers: "236",
    gmv: "NT$ 221,800",
    share: "NT$ 22,180",
    status: "paid",
    issued: "2026-05-01",
    artifactId: "referral-statement-referral-demo-community-2026-04",
    artifactHash: "7ac1…4ef8",
    direction: "DRTS → 御和物業",
    lines: FX_REFERRAL_STATEMENT_LINES,
  },
];
