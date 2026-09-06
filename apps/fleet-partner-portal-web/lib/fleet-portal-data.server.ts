// Server data loaders for the Fleet Partner Portal.
//
// This module is the single seam between the portal pages and the live
// `/api/fleet-partner/*` endpoints exposed by `@drts/api-client`. Each page
// calls one `load*()` accessor here; the accessor fetches partner-scoped data
// through `getServerFleetPartnerClient()`, maps the contract records into the
// display shapes the pages already render, and — only when the endpoint is
// unavailable or errors — gracefully falls back to the design fixtures (the
// ops-detail fallback pattern). A reachable endpoint that returns an empty
// list is legitimate zero data and is rendered live (empty), not replaced with
// demo rows. The `source` flag lets a page show the "design data" notice only
// when it is actually showing fixtures.
//
// Endpoint coverage (DH-FLP-BE-CLIENT): dashboard, drivers, vehicles, trips,
// quality-metrics, statements (+ revenue, derived from the latest statement).
// The cases / documents / training views have no fleet-partner endpoint yet,
// so their loaders return fixtures with `source: "fallback"` until a
// dedicated endpoint ships.
//
// Field gaps: the portal contracts intentionally do not yet surface every
// decorative column the design fixtures carry (e.g. per-driver document /
// training / 30-day-trip / rating metrics, vehicle model / year / inspection,
// per-trip fleet commission). Those fields are mapped to neutral defaults and
// noted inline; they are follow-up work for the backend, not fabricated here.

import "server-only";

import type {
  DriverWorkState,
  FleetPartnerPortalDashboardRecord,
  FleetPartnerPortalDriverRecord,
  FleetPartnerPortalQualityMetricsRecord,
  FleetPartnerPortalTripRecord,
  FleetPartnerPortalVehicleRecord,
  FleetPartnerStatementRecord,
  MoneyAmount,
  Phase1ServiceBucket,
} from "@drts/contracts";

import { getServerFleetPartnerClient } from "./api-client.server";
export type ServiceKey =
  | "realtime"
  | "business"
  | "airport"
  | "insurance"
  | "travel";

export type FleetDriver = {
  id: string;
  name: string;
  plate: string;
  status: "available" | "on_trip" | "break" | "offline";
  license: "valid" | "expires_30d";
  docs: "complete" | "missing_1" | "missing_2";
  training: "complete" | "pending";
  trips30: number;
  rating: number;
  svc: ServiceKey[];
};

export type FleetVehicle = {
  plate: string;
  model: string;
  year: number;
  driver: string;
  svc: ServiceKey[];
  insurance: string;
  inspection: "ok" | "due_30d";
  status: "active" | "maintenance";
};

export type FleetTrip = {
  id: string;
  svc: ServiceKey;
  driver: string;
  tenant: string;
  sponsorFunded?: boolean;
  benefitReference?: string | null;
  pickup: string;
  fare: string;
  commission: string;
  reimbursement?: string | null;
  status: "completed" | "in_progress" | "cancelled";
  date: string;
};

export type StatementLine = {
  key: string;
  v: string;
  sign: "+" | "−";
  reimbursement?: string | null;
};

export type FleetStatement = {
  id: string;
  period: string;
  trips: number;
  sponsorFundedTrips?: number;
  payable: string;
  reimbursement?: string | null;
  status: "pending_confirm" | "paid";
  issued: string;
};

export type FleetDoc = {
  driver: string;
  id: string;
  doc: string;
  en: string;
  status: "expires_30d" | "expires_60d" | "missing" | "pending_signature";
  due: string;
  owner: "fleet" | "driver";
};

export type FleetCase = {
  id: string;
  type: "complaint" | "incident";
  cat: string;
  driver: string;
  severity: "high" | "medium" | "low";
  responsibility: "fleet" | "shared" | "platform";
  status: "in_review" | "open" | "pending";
  sla: "breached" | "on_track";
  date: string;
};

export type FleetQuality = {
  key: string;
  v: string;
  tone: "success" | "warn" | "neutral";
  delta: string;
};

export type FleetTraining = {
  course: string;
  en: string;
  completed: number;
  total: number;
  pct: number;
};

export type FleetDashboardSupplemental = {
  missingDocsDrivers: string;
  openCases: string;
  trainingCompletion: string;
};

export type FleetAttentionBanner = {
  tone: "warn" | "danger" | "info";
  titleKey: string;
  bodyKey: string;
};

const FX_FLEET_STATEMENT: {
  period: string;
  status: string;
  payable: string;
  lines: StatementLine[];
} = {
  period: getCurrentPeriodMonth(),
  status: "pending_confirm",
  payable: "NT$ 642,000",
  lines: [
    { key: "per_trip", v: "NT$ 598,400", sign: "+" },
    { key: "recruitment", v: "NT$ 24,000", sign: "+" },
    { key: "mgmt_fee", v: "NT$ 36,000", sign: "+" },
    { key: "performance", v: "NT$ 12,000", sign: "+" },
    { key: "clawback", v: "NT$ 28,400", sign: "−" },
  ],
};

const FX_FLEET_STATEMENTS: FleetStatement[] = [
  {
    id: `fst_${getCurrentPeriodMonth().replace("-", "_")}`,
    period: getCurrentPeriodMonth(),
    trips: 14280,
    payable: "NT$ 642,000",
    status: "pending_confirm",
    issued: `${getCurrentPeriodMonth()}-01`,
  },
  {
    id: "fst_2026_04",
    period: "2026-04",
    trips: 13120,
    payable: "NT$ 588,400",
    status: "paid",
    issued: "2026-05-01",
  },
  {
    id: "fst_2026_03",
    period: "2026-03",
    trips: 12740,
    payable: "NT$ 561,200",
    status: "paid",
    issued: "2026-04-01",
  },
];

const FX_FLEET_DOCS: FleetDoc[] = [
  {
    driver: "黃文豪",
    id: "d_8851",
    doc: "職業駕照",
    en: "pro_license",
    status: "expires_30d",
    due: "2026-07-04",
    owner: "fleet",
  },
  {
    driver: "吳鎮宇",
    id: "d_8881",
    doc: "機場接送資格證",
    en: "airport_permit",
    status: "missing",
    due: "—",
    owner: "fleet",
  },
  {
    driver: "吳鎮宇",
    id: "d_8881",
    doc: "車輛保險",
    en: "vehicle_insurance",
    status: "expires_60d",
    due: "2026-08-02",
    owner: "fleet",
  },
  {
    driver: "陳俊宏",
    id: "d_8843",
    doc: "保險代步服務同意書",
    en: "insurance_consent",
    status: "pending_signature",
    due: "2026-06-15",
    owner: "driver",
  },
];

const FX_FLEET_QUALITY: FleetQuality[] = [
  {
    key: "avg_rating",
    v: "4.86",
    tone: "success",
    delta: "↑ 0.02",
  },
  {
    key: "completion_rate",
    v: "97.4%",
    tone: "success",
    delta: "↑ 0.6pp",
  },
  {
    key: "cancel_rate",
    v: "1.8%",
    tone: "neutral",
    delta: "↓ 0.2pp",
  },
  {
    key: "no_show_rate",
    v: "0.8%",
    tone: "neutral",
    delta: "—",
  },
  {
    key: "complaint_rate",
    v: "0.12%",
    tone: "warn",
    delta: "↑ 0.01pp",
  },
  {
    key: "on_time_rate",
    v: "94.2%",
    tone: "success",
    delta: "↑ 1.1pp",
  },
];

export type DataSource = "live" | "fallback";

// --- shared formatters / enum maps -----------------------------------------

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

function formatOptionalMoney(amount: MoneyAmount | null | undefined) {
  if (!amount || amount.amountMinor <= 0) {
    return null;
  }
  return formatMoney(amount);
}

// completedAt is an ISO timestamp; the trip table shows "MM-DD HH:mm".
function formatTripTimestamp(iso: string): string {
  const match = iso.match(/^\d{4}-(\d{2}-\d{2})T(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : iso;
}

const SERVICE_BUCKET_TO_KEY: Record<Phase1ServiceBucket, ServiceKey> = {
  standard_taxi: "realtime",
  business_dispatch: "business",
};

function mapServiceBuckets(buckets: Phase1ServiceBucket[]): ServiceKey[] {
  return [
    ...new Set(
      buckets
        .map((bucket) => SERVICE_BUCKET_TO_KEY[bucket])
        .filter((key): key is ServiceKey => Boolean(key)),
    ),
  ];
}

function mapDriverStatus(state: DriverWorkState): FleetDriver["status"] {
  switch (state) {
    case "available":
      return "available";
    case "reserved":
    case "enroute":
    case "arrived":
    case "on_trip":
      return "on_trip";
    case "paused":
      return "break";
    default:
      // offline, suspended, incident_hold
      return "offline";
  }
}

// --- drivers ----------------------------------------------------------------

export interface DriversView {
  rows: FleetDriver[];
  source: DataSource;
  error?: string | null;
}

function mapDriver(record: FleetPartnerPortalDriverRecord): FleetDriver {
  return {
    id: record.driverId,
    name: record.name,
    plate: record.currentVehiclePlateNo ?? "—",
    status: mapDriverStatus(record.workState),
    license: record.licensesValid ? "valid" : "expires_30d",
    // Not yet surfaced by /api/fleet-partner/drivers — neutral defaults.
    docs: "complete",
    training: "complete",
    trips30: 0,
    rating: 0,
    svc: mapServiceBuckets(record.supportedServiceBuckets),
  };
}

function isConfigError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes("Missing fleet scope configuration")
  );
}

export async function loadDrivers(): Promise<DriversView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalDrivers();
    // An empty list from a reachable endpoint is legitimate zero data, not a
    // failure — render the live (empty) result rather than demo fixtures.
    return { rows: records.map(mapDriver), source: "live", error: null };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "READ_FAILED";
    return { rows: [], source: "fallback", error: message };
  }
}

// --- vehicles ---------------------------------------------------------------

export interface VehiclesView {
  rows: FleetVehicle[];
  source: DataSource;
  error?: string | null;
}

function mapVehicle(record: FleetPartnerPortalVehicleRecord): FleetVehicle {
  return {
    plate: record.plateNo,
    // model / year / inspection are not surfaced by the vehicles endpoint yet.
    model: "—",
    year: 0,
    driver: record.activeDriverNames[0] ?? "—",
    svc: mapServiceBuckets(record.supportedServiceBuckets),
    insurance: record.insuranceStatus === "valid" ? "valid" : "expired",
    inspection: "ok",
    status: record.dispatchableFlag ? "active" : "maintenance",
  };
}

export async function loadVehicles(): Promise<VehiclesView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalVehicles();
    // Empty but reachable === legitimate zero data; keep it live.
    return { rows: records.map(mapVehicle), source: "live", error: null };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "READ_FAILED";
    return { rows: [], source: "fallback", error: message };
  }
}

// --- trips ------------------------------------------------------------------

export interface TripsView {
  rows: FleetTrip[];
  source: DataSource;
  error?: string | null;
}

function mapTripStatus(
  status: FleetPartnerPortalTripRecord["status"],
): FleetTrip["status"] {
  if (status === "completed") {
    return "completed";
  }
  if (status === "cancelled" || status === "dispatch_failed") {
    return "cancelled";
  }
  return "in_progress";
}

function mapTripService(record: FleetPartnerPortalTripRecord): ServiceKey {
  if (record.businessDispatchSubtype === "credit_card_airport_transfer") {
    return "airport";
  }
  if (record.businessDispatchSubtype === "enterprise_dispatch") {
    return "business";
  }
  return "realtime";
}

function mapTrip(record: FleetPartnerPortalTripRecord): FleetTrip {
  return {
    id: record.orderId,
    svc: mapTripService(record),
    driver: record.driverName ?? "—",
    tenant:
      record.partnerProgramId ??
      record.partnerId ??
      record.tenantServiceProgramId ??
      "—",
    sponsorFunded: record.sponsorFunded,
    benefitReference: record.benefitReference,
    pickup: record.pickupAddress ?? "—",
    fare: formatMoney(record.grossEarning),
    commission: formatMoney(record.fleetShareAmount),
    reimbursement: formatOptionalMoney(record.reimbursementAmount),
    status: mapTripStatus(record.status),
    date: formatTripTimestamp(record.completedAt),
  };
}

export async function loadTrips(periodMonth?: string): Promise<TripsView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalTrips(periodMonth);
    // Empty but reachable === legitimate zero data; keep it live.
    return { rows: records.map(mapTrip), source: "live", error: null };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "READ_FAILED";
    return { rows: [], source: "fallback", error: message };
  }
}

// --- quality ----------------------------------------------------------------

export interface QualityView {
  metrics: FleetQuality[];
  source: DataSource;
}

function mapQualityMetrics(
  record: FleetPartnerPortalQualityMetricsRecord,
): FleetQuality[] {
  const totalTrips = record.totalCompletedTrips + record.cancelledTripCount;
  const cancelRate =
    totalTrips > 0 ? (record.cancelledTripCount / totalTrips) * 100 : 0;
  // "在線司機" is the online subset, derived from the active roster minus the
  // offline count — activeDriverCount alone is the full roster and overstates
  // who is online.
  const onlineDriverCount = Math.max(
    record.activeDriverCount - record.offlineDriverCount,
    0,
  );
  return [
    {
      key: "completed_trips",
      v: record.totalCompletedTrips.toLocaleString("en-US"),
      tone: "success",
      delta: "—",
    },
    {
      key: "cancel_rate",
      v: `${cancelRate.toFixed(1)}%`,
      tone: cancelRate > 5 ? "warn" : "neutral",
      delta: "—",
    },
    {
      key: "proof_pending",
      v: record.proofPendingTripCount.toLocaleString("en-US"),
      tone: record.proofPendingTripCount > 0 ? "warn" : "success",
      delta: "—",
    },
    {
      key: "online_drivers",
      v: onlineDriverCount.toLocaleString("en-US"),
      tone: "neutral",
      delta: "—",
    },
    {
      key: "license_invalid_drivers",
      v: record.licenseInvalidDriverCount.toLocaleString("en-US"),
      tone: record.licenseInvalidDriverCount > 0 ? "warn" : "success",
      delta: "—",
    },
    {
      key: "share_amount",
      v: formatMoney(record.shareAmount),
      tone: "neutral",
      delta: "—",
    },
  ];
}

export async function loadQuality(periodMonth?: string): Promise<QualityView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const record = await client.getFleetPortalQualityMetrics(periodMonth);
    return { metrics: mapQualityMetrics(record), source: "live" };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    return { metrics: FX_FLEET_QUALITY, source: "fallback" };
  }
}

// --- statements -------------------------------------------------------------

export interface StatementsView {
  rows: FleetStatement[];
  source: DataSource;
}

function mapStatement(record: FleetPartnerStatementRecord): FleetStatement {
  const tripLineCount = record.lines.filter((line) => line.orderId).length;
  return {
    id: record.statementId,
    period: record.periodMonth,
    trips: tripLineCount,
    sponsorFundedTrips: record.sponsorFundedTripCount,
    payable: formatMoney(record.shareAmount),
    reimbursement: formatOptionalMoney(record.reimbursementAmount),
    status: record.payoutStatus === "paid" ? "paid" : "pending_confirm",
    issued: record.createdAt.slice(0, 10),
  };
}

export async function loadStatements(): Promise<StatementsView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalStatements();
    // Empty but reachable === legitimate zero data; keep it live.
    return { rows: records.map(mapStatement), source: "live" };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    return { rows: FX_FLEET_STATEMENTS, source: "fallback" };
  }
}

// --- revenue (derived from the latest statement) ----------------------------

// Maps a backend formula bucket to its central `revenue.line.<key>` translation
// key; display copy lives in translations.ts, not here.
const REVENUE_FORMULA_KEYS: Record<string, string> = {
  percent_of_gross: "per_trip",
  fixed_per_trip: "per_trip_fixed",
  monthly_fixed: "mgmt_fee",
  tiered_bonus: "performance",
  sponsor_funded_airport: "sponsor_airport",
};

export interface RevenueView {
  period: string;
  status: string;
  payable: string;
  lines: StatementLine[];
  source: DataSource;
}

function mapStatementLines(
  record: FleetPartnerStatementRecord,
): StatementLine[] {
  // Aggregate statement lines into the canvas breakdown buckets. Sponsor-funded
  // airport trips are called out separately so fleet finance can reconcile the
  // later reimbursement batch without changing the card layout.
  const buckets = new Map<string, number>();
  for (const line of record.lines) {
    const bucketKey = line.metadata.sponsorFunded
      ? "sponsor_funded_airport"
      : line.formula;
    const current = buckets.get(bucketKey) ?? 0;
    buckets.set(bucketKey, current + line.shareAmount.amountMinor);
  }
  const currency = record.shareAmount.currency;
  return [...buckets.entries()].map(([formula, amountMinor]) => {
    const key = REVENUE_FORMULA_KEYS[formula] ?? formula;
    return {
      key,
      v: formatMoney({ currency, amountMinor: Math.abs(amountMinor) }),
      sign: amountMinor < 0 ? "−" : "+",
      reimbursement:
        formula === "sponsor_funded_airport" &&
        record.reimbursementAmount.amountMinor > 0
          ? formatOptionalMoney(record.reimbursementAmount)
          : null,
    };
  });
}

function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function loadRevenue(): Promise<RevenueView> {
  const currentPeriod = getCurrentPeriodMonth();
  const fallback: RevenueView = {
    period: currentPeriod,
    status: FX_FLEET_STATEMENT.status,
    payable: FX_FLEET_STATEMENT.payable,
    lines: FX_FLEET_STATEMENT.lines,
    source: "fallback",
  };
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalStatements();
    const latest = records[0];
    if (!latest) {
      // Endpoint is reachable but the partner has no statements yet — this is
      // legitimate zero data, so show an empty live revenue, not the demo one.
      return {
        period: currentPeriod,
        status: "—",
        payable: formatMoney(null),
        lines: [],
        source: "live",
      };
    }
    return {
      period: latest.periodMonth,
      status: latest.payoutStatus === "paid" ? "paid" : "pending_confirm",
      payable: formatMoney(latest.shareAmount),
      lines: mapStatementLines(latest),
      source: "live",
    };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    return fallback;
  }
}

// --- dashboard --------------------------------------------------------------

export interface DashboardView {
  driverCount: string;
  driverStatusSummary: {
    online: string;
    offline: string;
  };
  dispatchable: string;
  completedTrips: string;
  share: string;
  grossRevenue: string;
  supply: { svc: ServiceKey; pct: number; n: string }[];
  recentTrips: FleetTrip[];
  recentTripsSource: DataSource;
  source: DataSource;
  supplemental: FleetDashboardSupplemental;
  attention: FleetAttentionBanner[];
  supplementalSource: DataSource;
  periodMonth: string;
  dataTimestamp: string;
  error?: string | null;
}

export async function loadDashboard(
  periodMonth?: string,
): Promise<DashboardView> {
  const currentPeriod = periodMonth ?? getCurrentPeriodMonth();
  const dataTimestamp = new Date().toISOString();

  // Load client to ensure configuration is valid
  const { client } = await getServerFleetPartnerClient();

  // Load authoritative lists concurrently to keep dashboard and lists strictly in sync
  const [driversView, tripsView] = await Promise.all([
    loadDrivers(),
    loadTrips(currentPeriod),
  ]);

  const activeDriverCount = driversView.rows.length;
  const onlineDriverCount = driversView.rows.filter(
    (d) =>
      d.status === "available" ||
      d.status === "on_trip" ||
      d.status === "break",
  ).length;
  const offlineDriverCount = driversView.rows.filter(
    (d) => d.status === "offline",
  ).length;
  const dispatchableDriverCount = driversView.rows.filter(
    (d) => d.status === "available",
  ).length;
  const completedTripsCount = tripsView.rows.filter(
    (t) => t.status === "completed",
  ).length;

  let dashboardRecord: FleetPartnerPortalDashboardRecord | null = null;
  try {
    dashboardRecord = await client.listFleetPortalDashboard(currentPeriod);
  } catch {
    // If aggregate endpoint is unavailable, we rely on the authoritative list counts
  }

  const isLive =
    driversView.source === "live" ||
    tripsView.source === "live" ||
    Boolean(dashboardRecord);
  const readError =
    !isLive && (driversView.error || tripsView.error)
      ? driversView.error || tripsView.error
      : null;

  const services: ServiceKey[] = [
    "realtime",
    "business",
    "airport",
    "insurance",
    "travel",
  ];
  const supply = services.map((svc) => {
    const count = driversView.rows.filter((d) => d.svc.includes(svc)).length;
    const pct =
      activeDriverCount > 0 ? Math.round((count / activeDriverCount) * 100) : 0;
    return { svc, pct, n: String(count) };
  });

  const missingDocsDrivers = driversView.rows.filter(
    (d) => d.license !== "valid" || d.docs !== "complete",
  ).length;

  const supplemental: FleetDashboardSupplemental = {
    missingDocsDrivers: String(missingDocsDrivers),
    openCases: "—", // cases endpoint not yet integrated
    trainingCompletion: "—", // training endpoint not yet integrated
  };

  const attention: FleetAttentionBanner[] = [];
  for (const d of driversView.rows) {
    if (d.license === "expires_30d") {
      attention.push({
        tone: "warn",
        titleKey: "dashboard.attention.licenseExpiring",
        bodyKey: "dashboard.attention.licenseExpiringBody",
      });
      break;
    }
  }

  const shareMoney = dashboardRecord?.shareAmount
    ? formatMoney(dashboardRecord.shareAmount)
    : "NT$ 0";
  const grossMoney = dashboardRecord?.grossEarningAmount
    ? formatMoney(dashboardRecord.grossEarningAmount)
    : "NT$ 0";

  return {
    driverCount: (dashboardRecord
      ? dashboardRecord.activeDriverCount
      : activeDriverCount
    ).toLocaleString("en-US"),
    driverStatusSummary: {
      online: (dashboardRecord
        ? dashboardRecord.onlineDriverCount
        : onlineDriverCount
      ).toLocaleString("en-US"),
      offline: (dashboardRecord
        ? Math.max(
            dashboardRecord.activeDriverCount -
              dashboardRecord.onlineDriverCount,
            0,
          )
        : offlineDriverCount
      ).toLocaleString("en-US"),
    },
    dispatchable: (dashboardRecord
      ? dashboardRecord.dispatchEligibleDriverCount
      : dispatchableDriverCount
    ).toLocaleString("en-US"),
    completedTrips: (dashboardRecord
      ? dashboardRecord.completedTripCount
      : completedTripsCount
    ).toLocaleString("en-US"),
    share: shareMoney,
    grossRevenue: grossMoney,
    supply,
    recentTrips: tripsView.rows.slice(0, 5),
    recentTripsSource: tripsView.source,
    source: isLive ? "live" : "fallback",
    supplemental,
    attention,
    supplementalSource: "fallback",
    periodMonth: currentPeriod,
    dataTimestamp,
    error: readError ?? null,
  };
}

// --- views without a portal endpoint yet (fixtures through the seam) --------

export interface CasesView {
  rows: FleetCase[];
  source: DataSource;
  connected?: boolean;
}

export async function loadCases(): Promise<CasesView> {
  // No /api/fleet-partner/cases endpoint in DH-FLP-BE-CLIENT yet.
  // Explicitly mark as unintegrated without injecting fake fixture records.
  return { rows: [], source: "fallback", connected: false };
}

export interface DocumentsView {
  rows: FleetDoc[];
  source: DataSource;
}

export async function loadDocuments(): Promise<DocumentsView> {
  // No /api/fleet-partner/documents endpoint in DH-FLP-BE-CLIENT yet.
  return { rows: FX_FLEET_DOCS, source: "fallback" };
}

export interface TrainingView {
  rows: FleetTraining[];
  summary: {
    completionPct: string;
    pendingHeadcount: string;
    overdueIncomplete: string;
  };
  source: DataSource;
  connected?: boolean;
}

export async function loadTraining(): Promise<TrainingView> {
  // No /api/fleet-partner/training endpoint in DH-FLP-BE-CLIENT yet.
  // Explicitly mark as unintegrated without injecting fake fixture records.
  return {
    rows: [],
    summary: {
      completionPct: "—",
      pendingHeadcount: "—",
      overdueIncomplete: "—",
    },
    source: "fallback",
    connected: false,
  };
}

// --- shell nav badges -------------------------------------------------------

// Counts shown as nav badges in the global shell. Each is derived from the
// same seam the corresponding page renders from — drivers from the live
// `/api/fleet-partner/drivers` count, documents / cases from their fixture
// loaders until a dedicated endpoint ships — so the shell never hardcodes
// fixture literals. A zero count renders no badge.
export interface NavBadges {
  drivers: number;
  documents: number;
  cases: number;
}

export async function loadNavBadges(): Promise<NavBadges> {
  const [drivers, documents, cases] = await Promise.all([
    loadDrivers(),
    loadDocuments(),
    loadCases(),
  ]);
  return {
    drivers: drivers.rows.length,
    documents: documents.rows.length,
    cases: cases.rows.length,
  };
}
