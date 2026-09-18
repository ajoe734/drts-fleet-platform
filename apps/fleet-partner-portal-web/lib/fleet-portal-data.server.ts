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
  docs: "complete" | "missing_1" | "missing_2" | "unavailable";
  training: "complete" | "pending" | "unavailable";
  trips30: number;
  rating: number;
  svc: ServiceKey[];
  dispatchEligible?: boolean;
  docsAvailable?: boolean;
  trainingAvailable?: boolean;
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
  grossAmountMinor?: number;
  shareAmountMinor?: number;
  currency?: string;
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

export function getCurrentPeriodMonth(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

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

function parseMoneyToMinor(str?: string | null): number {
  if (!str || str === "—") return 0;
  const match = str.replace(/[^0-9.-]+/g, "");
  const val = parseFloat(match);
  return isNaN(val) ? 0 : Math.round(val * 100);
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
  docsAvailable?: boolean;
  trainingAvailable?: boolean;
}

function mapDriver(record: FleetPartnerPortalDriverRecord): FleetDriver {
  return {
    id: record.driverId,
    name: record.name,
    plate: record.currentVehiclePlateNo ?? "—",
    status: mapDriverStatus(record.workState),
    license: record.licensesValid ? "valid" : "expires_30d",
    // Not surfaced by /api/fleet-partner/drivers — mark unavailable explicitly.
    docs: "unavailable",
    training: "unavailable",
    trips30: 0,
    rating: 0,
    svc: mapServiceBuckets(record.supportedServiceBuckets),
    dispatchEligible: Boolean(record.dispatchEligible),
    docsAvailable: false,
    trainingAvailable: false,
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
    return {
      rows: records.map(mapDriver),
      source: "live",
      error: null,
      docsAvailable: false,
      trainingAvailable: false,
    };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    const message = err instanceof Error ? err.message : "READ_FAILED";
    return {
      rows: [],
      source: "fallback",
      error: message,
      docsAvailable: false,
      trainingAvailable: false,
    };
  }
}

export interface DriverTabCounts {
  all: number | string;
  available: number | string;
  missingDocs: number | string;
  trainingIncomplete: number | string;
}

export function scopeDriverRows(
  rows: FleetDriver[],
  params: { q?: string | undefined },
): FleetDriver[] {
  if (!params.q) return rows;
  const q = params.q.toLowerCase();
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.plate.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q),
  );
}

export function computeDriverTabCounts(
  scopedRows: FleetDriver[],
  flags?: { docsAvailable?: boolean | undefined; trainingAvailable?: boolean | undefined },
): DriverTabCounts {
  const docsAvailable = flags?.docsAvailable ?? false;
  const trainingAvailable = flags?.trainingAvailable ?? false;

  return {
    all: scopedRows.length,
    available: scopedRows.filter(
      (r) => r.dispatchEligible ?? (r.status === "available"),
    ).length,
    missingDocs: docsAvailable
      ? scopedRows.filter(
          (r) =>
            r.license !== "valid" ||
            (r.docs !== "complete" && r.docs !== "unavailable"),
        ).length
      : "—",
    trainingIncomplete: trainingAvailable
      ? scopedRows.filter(
          (r) =>
            r.training !== "complete" && r.training !== "unavailable",
        ).length
      : "—",
  };
}

export function filterDriversForTab(
  scopedRows: FleetDriver[],
  activeTabKey: string,
  flags?: { docsAvailable?: boolean | undefined; trainingAvailable?: boolean | undefined },
): FleetDriver[] {
  const docsAvailable = flags?.docsAvailable ?? false;
  const trainingAvailable = flags?.trainingAvailable ?? false;

  return scopedRows.filter((r) => {
    if (
      activeTabKey === "available" &&
      !(r.dispatchEligible ?? (r.status === "available"))
    ) {
      return false;
    }
    if (activeTabKey === "missingDocs") {
      if (docsAvailable) {
        if (r.docs === "complete" && r.license === "valid") {
          return false;
        }
      } else {
        // Unknown document review data is not filtered as complete.
      }
    }
    if (activeTabKey === "trainingIncomplete") {
      if (trainingAvailable) {
        if (r.training === "complete") {
          return false;
        }
      } else {
        // Unknown training data is not filtered as complete.
      }
    }
    return true;
  });
}

export function getDriverNoticeBody(
  key: "trainingIncomplete" | "missingDocs",
  locale: string,
): string {
  if (locale === "zh") {
    if (key === "trainingIncomplete") {
      return "駕駛教育訓練資料尚未串接後端 API，目前欄位標記為未串接，不以假資料篩選排除人員。";
    }
    return "駕駛文件審查資料尚未串接後端 API，目前欄位標記為未串接，不以假資料篩選排除人員。";
  }
  if (key === "trainingIncomplete") {
    return "Driver training status is not yet integrated with the fleet API. Showing drivers without assuming completed training.";
  }
  return "Driver document review is not yet integrated with the fleet API. Showing drivers without assuming complete documents.";
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
    grossAmountMinor: record.grossEarning?.amountMinor ?? 0,
    shareAmountMinor: record.fleetShareAmount?.amountMinor ?? 0,
    currency:
      record.grossEarning?.currency ??
      record.fleetShareAmount?.currency ??
      "TWD",
  };
}

export async function loadTrips(periodMonth?: string): Promise<TripsView> {
  const currentPeriod = periodMonth ?? getCurrentPeriodMonth();
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalTrips(currentPeriod);
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
  const currentPeriod = periodMonth ?? getCurrentPeriodMonth();
  try {
    const { client } = await getServerFleetPartnerClient();
    const record = await client.getFleetPortalQualityMetrics(currentPeriod);
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

export interface TripTabCounts {
  all: number;
  realtime: number;
  business: number;
  airport: number;
  insurance: number;
  travel: number;
}

export function scopeTripRows(
  rows: FleetTrip[],
  params: { q?: string | undefined; status?: string | undefined },
): FleetTrip[] {
  return rows.filter((r) => {
    if (
      params.status &&
      params.status !== "all" &&
      r.status !== params.status
    ) {
      return false;
    }
    if (params.q) {
      const q = params.q.toLowerCase();
      const match =
        r.id.toLowerCase().includes(q) ||
        r.driver.toLowerCase().includes(q) ||
        r.pickup.toLowerCase().includes(q);
      if (!match) {
        return false;
      }
    }
    return true;
  });
}

export function computeTripTabCounts(
  scopedRows: FleetTrip[],
): TripTabCounts {
  return {
    all: scopedRows.length,
    realtime: scopedRows.filter((r) => r.svc === "realtime").length,
    business: scopedRows.filter((r) => r.svc === "business").length,
    airport: scopedRows.filter((r) => r.svc === "airport").length,
    insurance: scopedRows.filter((r) => r.svc === "insurance").length,
    travel: scopedRows.filter((r) => r.svc === "travel").length,
  };
}

export function filterTripsForService(
  scopedRows: FleetTrip[],
  currentSvc: string,
): FleetTrip[] {
  if (currentSvc !== "all") {
    return scopedRows.filter((r) => r.svc === currentSvc);
  }
  return scopedRows;
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
  driversError?: string | null;
  tripsError?: string | null;
  aggregateError?: string | null;
}

export async function loadDashboard(
  periodMonth?: string,
): Promise<DashboardView> {
  const currentPeriod = periodMonth ?? getCurrentPeriodMonth();
  const dataTimestamp = new Date().toISOString();

  // Load client to ensure configuration is valid
  let client: {
    listFleetPortalDashboard: (
      periodMonth?: string,
    ) => Promise<FleetPartnerPortalDashboardRecord>;
  } | null = null;
  try {
    const res = await getServerFleetPartnerClient();
    client = res.client;
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
  }

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
    (d) => d.dispatchEligible ?? (d.status === "available"),
  ).length;
  const completedTripsCount = tripsView.rows.filter(
    (t) => t.status === "completed",
  ).length;

  let dashboardRecord: FleetPartnerPortalDashboardRecord | null = null;
  let aggregateError: string | null = null;
  if (client) {
    try {
      dashboardRecord = await client.listFleetPortalDashboard(currentPeriod);
    } catch (err) {
      aggregateError =
        err instanceof Error ? err.message : "AGGREGATE_READ_FAILED";
    }
  }

  const driversError = driversView.error ?? null;
  const tripsError = tripsView.error ?? null;

  // Preserve per-source errors: if any primary source fails, report it
  // rather than masking failures behind other reachable sources.
  const errors: string[] = [];
  if (driversError) {
    errors.push(driversError);
  }
  if (tripsError) {
    errors.push(tripsError);
  }
  if (aggregateError && (tripsError || !dashboardRecord)) {
    // If aggregate failed and we could not derive revenue from trips, include aggregate error
    if (tripsError) {
      errors.push(aggregateError);
    }
  }
  const readError =
    errors.length > 0 ? [...new Set(errors)].join("; ") : null;

  const isLive =
    (driversView.source === "live" ||
      tripsView.source === "live" ||
      Boolean(dashboardRecord)) &&
    !readError;

  const services: ServiceKey[] = [
    "realtime",
    "business",
    "airport",
    "insurance",
    "travel",
  ];
  // If drivers API failed, supply cannot be calculated; distinguish from legitimate zero
  const supply =
    driversError === null
      ? services.map((svc) => {
          const count = driversView.rows.filter((d) => d.svc.includes(svc)).length;
          const pct =
            activeDriverCount > 0
              ? Math.round((count / activeDriverCount) * 100)
              : 0;
          return { svc, pct, n: String(count) };
        })
      : [];

  const docsAvailable = driversView.docsAvailable ?? false;
  const missingDocsDrivers =
    driversError === null && docsAvailable
      ? driversView.rows.filter(
          (d) =>
            d.license !== "valid" ||
            (d.docs !== "complete" && d.docs !== "unavailable"),
        ).length
      : null;

  const supplemental: FleetDashboardSupplemental = {
    missingDocsDrivers:
      missingDocsDrivers !== null ? String(missingDocsDrivers) : "—",
    openCases: "—", // cases endpoint not yet integrated
    trainingCompletion: "—", // training endpoint not yet integrated
  };

  const attention: FleetAttentionBanner[] = [];
  if (driversError === null) {
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
  }

  // Revenue derivation:
  // 1. If dashboard aggregate endpoint succeeded, format its authoritative amounts.
  // 2. If aggregate endpoint failed/unavailable, but tripsView succeeded:
  //    Derive from authoritative numeric records (completed trips earnings).
  // 3. If both aggregate and tripsView failed: mark as unavailable ("—") rather than "NT$ 0".
  let shareMoney: string;
  let grossMoney: string;

  if (dashboardRecord) {
    shareMoney = dashboardRecord.shareAmount
      ? formatMoney(dashboardRecord.shareAmount)
      : "NT$ 0";
    grossMoney = dashboardRecord.grossEarningAmount
      ? formatMoney(dashboardRecord.grossEarningAmount)
      : "NT$ 0";
  } else if (tripsError === null) {
    const completedTrips = tripsView.rows.filter(
      (t) => t.status === "completed",
    );
    const totalGrossMinor = completedTrips.reduce(
      (sum, t) => sum + (t.grossAmountMinor ?? parseMoneyToMinor(t.fare)),
      0,
    );
    const totalShareMinor = completedTrips.reduce(
      (sum, t) => sum + (t.shareAmountMinor ?? parseMoneyToMinor(t.commission)),
      0,
    );
    const currency =
      completedTrips.find((t) => t.currency)?.currency ?? "TWD";

    shareMoney = formatMoney({
      amountMinor: totalShareMinor,
      currency,
    });
    grossMoney = formatMoney({
      amountMinor: totalGrossMinor,
      currency,
    });
  } else {
    shareMoney = "—";
    grossMoney = "—";
  }

  // Driver metrics:
  // When drivers list API fails and no aggregate is available, mark as "—" (unavailable)
  // rather than "0" (which indicates legitimate zero drivers).
  let driverCount: string;
  let driverStatusSummary: { online: string; offline: string };
  let dispatchable: string;

  if (driversError === null) {
    driverCount = (
      dashboardRecord
        ? dashboardRecord.activeDriverCount
        : activeDriverCount
    ).toLocaleString("en-US");

    driverStatusSummary = {
      online: (
        dashboardRecord
          ? dashboardRecord.onlineDriverCount
          : onlineDriverCount
      ).toLocaleString("en-US"),
      offline: (
        dashboardRecord
          ? Math.max(
              dashboardRecord.activeDriverCount -
                dashboardRecord.onlineDriverCount,
              0,
            )
          : offlineDriverCount
      ).toLocaleString("en-US"),
    };

    dispatchable = (
      dashboardRecord
        ? dashboardRecord.dispatchEligibleDriverCount
        : dispatchableDriverCount
    ).toLocaleString("en-US");
  } else if (dashboardRecord) {
    driverCount = dashboardRecord.activeDriverCount.toLocaleString("en-US");
    driverStatusSummary = {
      online: dashboardRecord.onlineDriverCount.toLocaleString("en-US"),
      offline: Math.max(
        dashboardRecord.activeDriverCount -
          dashboardRecord.onlineDriverCount,
        0,
      ).toLocaleString("en-US"),
    };
    dispatchable =
      dashboardRecord.dispatchEligibleDriverCount.toLocaleString("en-US");
  } else {
    driverCount = "—";
    driverStatusSummary = { online: "—", offline: "—" };
    dispatchable = "—";
  }

  // Completed trips:
  let completedTrips: string;
  if (tripsError === null) {
    completedTrips = (
      dashboardRecord
        ? dashboardRecord.completedTripCount
        : completedTripsCount
    ).toLocaleString("en-US");
  } else if (dashboardRecord) {
    completedTrips = dashboardRecord.completedTripCount.toLocaleString("en-US");
  } else {
    completedTrips = "—";
  }

  return {
    driverCount,
    driverStatusSummary,
    dispatchable,
    completedTrips,
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
    error: readError,
    driversError,
    tripsError,
    aggregateError,
  };
}

// --- views without a portal endpoint yet (fixtures through the seam) --------

export interface FleetCaseItem {
  id: string;
  caseNo: string;
  type: "complaint" | "incident";
  cat: string;
  desc: string;
  driver: string;
  driverId: string;
  severity: "high" | "normal" | "medium" | "low" | "critical";
  responsibility: "fleet" | "shared" | "platform";
  fleetPartnerId: string;
  status: string;
  slaDueAt: string;
  slaBreachedAt: string | null;
  slaBreach: boolean;
  slaTone: "danger" | "success" | "neutral";
  slaLabel: string;
  reopenCount: number;
  relatedOrder: string | null;
  relatedCall: string | null;
  assignee: string;
  openedAt: string;
  updatedAt: string;
  closedAt?: string | null;
  actionDescriptor: {
    action: string;
    enabled: boolean;
    disabledReasonCode?: string;
    riskLevel?: string;
  };
}

export interface FleetCaseTimelineAttachment {
  attachmentId?: string;
  name: string;
  size: string;
  fileSize?: number;
  downloadUrl?: string;
}

export interface FleetCaseTimelineEvent {
  entryId: string;
  caseId: string;
  at: string;
  tone: "accent" | "warn" | "danger" | "success";
  t: string;
  actor: string;
  actorRealm: "ops" | "tenant" | "system";
  body: string;
  attachments?: FleetCaseTimelineAttachment[];
}

export interface FleetCaseAttachmentRecord {
  attachmentId: string;
  caseId: string;
  fleetPartnerId: string;
  name: string;
  size: string;
  fileSize: number;
  contentType: string;
  state: "done" | "uploading" | "fail";
  pct?: number;
  uploadedAt: string;
  uploadedBy: string;
  objectKey: string;
}

export interface CaseDetailView {
  caseDetail: FleetCaseItem;
  timeline: FleetCaseTimelineEvent[];
  attachments: FleetCaseAttachmentRecord[];
  source: DataSource;
  error?: string | null;
}

export const FX_CASE_DETAIL_OPEN: FleetCaseItem = {
  id: "cmp_0908",
  caseNo: "C-20260520-000001",
  type: "complaint",
  cat: "driver_conduct",
  desc: "乘客反映司機言語不當，已上傳影片證據。",
  driver: "黃文豪",
  driverId: "d_8851",
  severity: "high",
  responsibility: "fleet",
  fleetPartnerId: "METRO_FLEET",
  status: "reopened",
  slaDueAt: "2026-05-22 14:30",
  slaBreachedAt: "2026-05-22 14:31",
  slaBreach: true,
  slaTone: "danger",
  slaLabel: "SLA breached",
  reopenCount: 1,
  relatedOrder: "ord_8175",
  relatedCall: "call_2014",
  assignee: "陳維 (ops_compliance)",
  openedAt: "2026-05-20 14:30",
  updatedAt: "2026-05-22 15:00",
  actionDescriptor: {
    action: "respond",
    enabled: true,
    riskLevel: "medium",
  },
};

export const FX_CASE_DETAIL_PLATFORM: FleetCaseItem = {
  id: "cmp_0912",
  caseNo: "C-20260518-000001",
  type: "complaint",
  cat: "pricing_dispute",
  desc: "乘客反映車資與預估不符，屬平台計價規則爭議。",
  driver: "林志偉",
  driverId: "d_7702",
  severity: "normal",
  responsibility: "platform",
  fleetPartnerId: "METRO_FLEET",
  status: "under_investigation",
  slaDueAt: "2026-05-20 09:40",
  slaBreachedAt: null,
  slaBreach: false,
  slaTone: "success",
  slaLabel: "on track",
  reopenCount: 0,
  relatedOrder: "ord_7960",
  relatedCall: null,
  assignee: "王芳 (ops_billing)",
  openedAt: "2026-05-18 09:40",
  updatedAt: "2026-05-18 11:20",
  actionDescriptor: {
    action: "respond",
    enabled: false,
    disabledReasonCode: "platform_owned",
    riskLevel: "medium",
  },
};

export const FX_CASE_DETAIL_CLOSED: FleetCaseItem = {
  id: "cmp_closed_001",
  caseNo: "C-20260521-000002",
  type: "complaint",
  cat: "route_issue",
  desc: "行車路線爭議已調閱 GPS 記錄並結案。",
  driver: "黃文豪",
  driverId: "d_8851",
  severity: "normal",
  responsibility: "fleet",
  fleetPartnerId: "METRO_FLEET",
  status: "closed",
  slaDueAt: "2026-05-23 10:00",
  slaBreachedAt: null,
  slaBreach: false,
  slaTone: "neutral",
  slaLabel: "closed",
  reopenCount: 0,
  relatedOrder: "ord_8100",
  relatedCall: null,
  assignee: "陳維 (ops_compliance)",
  openedAt: "2026-05-21 10:00",
  updatedAt: "2026-05-24 10:05",
  closedAt: "2026-05-24 10:05",
  actionDescriptor: {
    action: "respond",
    enabled: false,
    disabledReasonCode: "case_closed",
    riskLevel: "medium",
  },
};

export const FX_CASE_TIMELINE_OPEN: FleetCaseTimelineEvent[] = [
  {
    entryId: "tl-0908-1",
    caseId: "cmp_0908",
    at: "2026-05-20 14:30",
    tone: "accent",
    t: "建立",
    actor: "eva.wang@yamato.tw",
    actorRealm: "tenant",
    body: "乘客反映司機言語不當，已上傳影片證據。",
  },
  {
    entryId: "tl-0908-2",
    caseId: "cmp_0908",
    at: "2026-05-20 14:42",
    tone: "accent",
    t: "指派",
    actor: "王芳 → 陳維",
    actorRealm: "ops",
    body: "由 ops_compliance 接手。",
  },
  {
    entryId: "tl-0908-3",
    caseId: "cmp_0908",
    at: "2026-05-20 16:00",
    tone: "warn",
    t: "評論",
    actor: "陳維",
    actorRealm: "ops",
    body: "已聯絡乘客，安排與司機對證。",
  },
  {
    entryId: "tl-0908-4",
    caseId: "cmp_0908",
    at: "2026-05-22 14:31",
    tone: "danger",
    t: "SLA breach",
    actor: "system.sla",
    actorRealm: "system",
    body: "超出 48h 處理時限。",
  },
  {
    entryId: "tl-0908-5",
    caseId: "cmp_0908",
    at: "2026-05-22 15:00",
    tone: "warn",
    t: "reopen",
    actor: "陳維",
    actorRealm: "ops",
    body: "乘客回報相同司機再次違規。",
  },
  {
    entryId: "tl-0908-6",
    caseId: "cmp_0908",
    at: "2026-05-23 09:12",
    tone: "accent",
    t: "車行回覆",
    actor: "陳家豪 (METRO_FLEET)",
    actorRealm: "tenant",
    body: "已與司機當面對證並完成教育訓練，訓練紀錄與行車記錄器截圖已附上。",
    attachments: [
      { name: "training_ack_20260523.pdf", size: "482 KB" },
      { name: "dashcam_clip_0908.mp4", size: "18.4 MB" },
    ],
  },
];

export const FX_CASE_TIMELINE_PLATFORM: FleetCaseTimelineEvent[] = [
  {
    entryId: "tl-0912-1",
    caseId: "cmp_0912",
    at: "2026-05-18 09:40",
    tone: "accent",
    t: "建立",
    actor: "lin.zhiwei@yamato.tw",
    actorRealm: "tenant",
    body: "乘客反映車資與預估不符。",
  },
  {
    entryId: "tl-0912-2",
    caseId: "cmp_0912",
    at: "2026-05-18 10:05",
    tone: "accent",
    t: "指派",
    actor: "系統 → 王芳",
    actorRealm: "ops",
    body: "依平台計價規則爭議路由至 ops_billing。",
  },
  {
    entryId: "tl-0912-3",
    caseId: "cmp_0912",
    at: "2026-05-18 11:20",
    tone: "accent",
    t: "責任判定",
    actor: "王芳",
    actorRealm: "ops",
    body: "計價規則由平台端設定，責任歸屬 platform；車行對此案唯讀。",
  },
];

export const FX_CASE_ATTACHMENTS: FleetCaseAttachmentRecord[] = [
  {
    attachmentId: "att-001",
    caseId: "cmp_0908",
    fleetPartnerId: "METRO_FLEET",
    name: "training_ack_20260523.pdf",
    size: "482 KB",
    fileSize: 493568,
    contentType: "application/pdf",
    state: "done",
    uploadedAt: "2026-05-23T09:10:00.000Z",
    uploadedBy: "陳家豪",
    objectKey: "fleet-cases/cmp_0908/training_ack_20260523.pdf",
  },
  {
    attachmentId: "att-002",
    caseId: "cmp_0908",
    fleetPartnerId: "METRO_FLEET",
    name: "dashcam_clip_0908.mp4",
    size: "18.4 MB",
    fileSize: 19293798,
    contentType: "video/mp4",
    state: "uploading",
    pct: 62,
    uploadedAt: "2026-05-23T09:11:00.000Z",
    uploadedBy: "陳家豪",
    objectKey: "fleet-cases/cmp_0908/dashcam_clip_0908.mp4",
  },
  {
    attachmentId: "att-003",
    caseId: "cmp_0908",
    fleetPartnerId: "METRO_FLEET",
    name: "driver_statement.jpg",
    size: "2.1 MB",
    fileSize: 2202009,
    contentType: "image/jpeg",
    state: "fail",
    uploadedAt: "2026-05-23T09:11:30.000Z",
    uploadedBy: "陳家豪",
    objectKey: "fleet-cases/cmp_0908/driver_statement.jpg",
  },
];

export const FX_CASE_ATTACHMENTS_CLOSED: FleetCaseAttachmentRecord[] = [
  {
    attachmentId: "att-closed-1",
    caseId: "cmp_closed_001",
    fleetPartnerId: "METRO_FLEET",
    name: "training_ack_20260523.pdf",
    size: "482 KB",
    fileSize: 493568,
    contentType: "application/pdf",
    state: "done",
    uploadedAt: "2026-05-22T10:00:00.000Z",
    uploadedBy: "陳家豪",
    objectKey: "fleet-cases/cmp_closed_001/training_ack_20260523.pdf",
  },
  {
    attachmentId: "att-closed-2",
    caseId: "cmp_closed_001",
    fleetPartnerId: "METRO_FLEET",
    name: "dashcam_clip_0908.mp4",
    size: "18.4 MB",
    fileSize: 19293798,
    contentType: "video/mp4",
    state: "done",
    uploadedAt: "2026-05-22T10:05:00.000Z",
    uploadedBy: "陳家豪",
    objectKey: "fleet-cases/cmp_closed_001/dashcam_clip_0908.mp4",
  },
];

export interface CasesView {
  rows: FleetCase[];
  source: DataSource;
  connected?: boolean;
}

export async function loadCases(): Promise<CasesView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.getList<FleetCaseItem>(
      "/api/fleet-partner/cases",
    );
    const rows: FleetCase[] = records.map((r) => ({
      id: r.id,
      type: r.type,
      cat: r.cat,
      driver: r.driver,
      severity:
        r.severity === "high"
          ? "high"
          : r.severity === "normal" || r.severity === "medium"
          ? "medium"
          : "low",
      responsibility: r.responsibility,
      status:
        r.status === "resolved" || r.status === "closed"
          ? "pending"
          : "in_review",
      sla: r.slaBreach ? "breached" : "on_track",
      date: r.openedAt ? r.openedAt.slice(0, 10) : "",
    }));
    return { rows, source: "live", connected: true };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    return { rows: [], source: "fallback", connected: false };
  }
}

export async function loadCaseDetail(caseId: string): Promise<CaseDetailView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const [detailRes, timelineRes] = await Promise.all([
      client.get<{
        caseDetail: FleetCaseItem;
        attachments: FleetCaseAttachmentRecord[];
      }>(`/api/fleet-partner/cases/${caseId}`),
      client.getList<FleetCaseTimelineEvent>(
        `/api/fleet-partner/cases/${caseId}/timeline`,
      ),
    ]);
    return {
      caseDetail: detailRes.caseDetail,
      attachments: detailRes.attachments || [],
      timeline: timelineRes || [],
      source: "live",
      error: null,
    };
  } catch (err) {
    if (isConfigError(err)) {
      throw err;
    }
    let fallbackDetail: FleetCaseItem = FX_CASE_DETAIL_OPEN;
    let fallbackTimeline: FleetCaseTimelineEvent[] = FX_CASE_TIMELINE_OPEN;
    let fallbackAttachments: FleetCaseAttachmentRecord[] = FX_CASE_ATTACHMENTS;

    if (caseId === "cmp_0912") {
      fallbackDetail = FX_CASE_DETAIL_PLATFORM;
      fallbackTimeline = FX_CASE_TIMELINE_PLATFORM;
      fallbackAttachments = FX_CASE_ATTACHMENTS_CLOSED;
    } else if (caseId === "cmp_closed_001") {
      fallbackDetail = FX_CASE_DETAIL_CLOSED;
      fallbackTimeline = [
        ...FX_CASE_TIMELINE_OPEN,
        {
          entryId: "tl-closed-done",
          caseId: "cmp_closed_001",
          at: "2026-05-24 10:05",
          tone: "success",
          t: "結案",
          actor: "陳維",
          actorRealm: "ops",
          body: "已審閱車行回覆與附件，責任處置完成，案件結案。",
        },
      ];
      fallbackAttachments = FX_CASE_ATTACHMENTS_CLOSED;
    }

    const message = err instanceof Error ? err.message : "READ_FAILED";
    return {
      caseDetail: fallbackDetail,
      timeline: fallbackTimeline,
      attachments: fallbackAttachments,
      source: "fallback",
      error: message,
    };
  }
}

export async function submitCaseReply(
  caseId: string,
  content: string,
  idempotencyKey?: string,
  attachmentIds?: string[],
) {
  const { client } = await getServerFleetPartnerClient();
  return client.post(`/api/fleet-partner/cases/${caseId}/reply`, {
    body: { content, idempotencyKey, attachmentIds },
  });
}

export async function createCaseAttachmentUploadUrl(
  caseId: string,
  fileName: string,
  fileSize: number,
  contentType: string,
) {
  const { client } = await getServerFleetPartnerClient();
  return client.post<{
    attachmentId: string;
    objectKey: string;
    uploadUrl: string;
    expiresAt: string;
    method: string;
  }>(`/api/fleet-partner/cases/${caseId}/attachments/upload-url`, {
    body: { fileName, fileSize, contentType },
  });
}

export async function confirmCaseAttachmentUpload(
  caseId: string,
  command: {
    attachmentId: string;
    objectKey: string;
    fileName: string;
    fileSize: number;
    contentType: string;
  },
) {
  const { client } = await getServerFleetPartnerClient();
  return client.post<FleetCaseAttachmentRecord>(
    `/api/fleet-partner/cases/${caseId}/attachments/confirm`,
    {
      body: command,
    },
  );
}

export async function getCaseAttachmentReadUrl(
  caseId: string,
  attachmentId: string,
) {
  const { client } = await getServerFleetPartnerClient();
  return client.get<{
    attachmentId: string;
    name: string;
    downloadUrl: string;
    expiresAt: string;
    authorized: boolean;
  }>(`/api/fleet-partner/cases/${caseId}/attachments/${attachmentId}/read-url`);
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
