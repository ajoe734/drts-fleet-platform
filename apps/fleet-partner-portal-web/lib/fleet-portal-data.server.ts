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
  FleetPartnerPortalDriverRecord,
  FleetPartnerPortalQualityMetricsRecord,
  FleetPartnerPortalTripRecord,
  FleetPartnerPortalVehicleRecord,
  FleetPartnerStatementRecord,
  MoneyAmount,
  Phase1ServiceBucket,
} from "@drts/contracts";

import { getServerFleetPartnerClient } from "./api-client.server";
import {
  FX_DASHBOARD_ATTENTION,
  FX_DASHBOARD_SUPPLEMENTAL,
  FX_DASHBOARD_SUPPLY,
  FX_FLEET_CASES,
  FX_FLEET_DOCS,
  FX_FLEET_DRIVERS,
  FX_FLEET_QUALITY,
  FX_FLEET_STATEMENT,
  FX_FLEET_STATEMENTS,
  FX_FLEET_TRAINING,
  FX_FLEET_TRIPS,
  FX_FLEET_VEHICLES,
  FX_TRAINING_OVERDUE_INCOMPLETE,
  type FleetAttentionBanner,
  type FleetCase,
  type FleetDashboardSupplemental,
  type FleetDoc,
  type FleetDriver,
  type FleetQuality,
  type FleetStatement,
  type FleetTraining,
  type FleetTrip,
  type FleetVehicle,
  type ServiceKey,
  type StatementLine,
} from "./fleet-portal-fixtures";

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

export async function loadDrivers(): Promise<DriversView> {
  try {
    const { client } = await getServerFleetPartnerClient();
    const records = await client.listFleetPortalDrivers();
    // An empty list from a reachable endpoint is legitimate zero data, not a
    // failure — render the live (empty) result rather than demo fixtures.
    return { rows: records.map(mapDriver), source: "live" };
  } catch {
    return { rows: FX_FLEET_DRIVERS, source: "fallback" };
  }
}

// --- vehicles ---------------------------------------------------------------

export interface VehiclesView {
  rows: FleetVehicle[];
  source: DataSource;
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
    return { rows: records.map(mapVehicle), source: "live" };
  } catch {
    return { rows: FX_FLEET_VEHICLES, source: "fallback" };
  }
}

// --- trips ------------------------------------------------------------------

export interface TripsView {
  rows: FleetTrip[];
  source: DataSource;
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
    return { rows: records.map(mapTrip), source: "live" };
  } catch {
    return { rows: FX_FLEET_TRIPS, source: "fallback" };
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
  } catch {
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
  } catch {
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

export async function loadRevenue(): Promise<RevenueView> {
  const fallback: RevenueView = {
    period: FX_FLEET_STATEMENT.period,
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
        period: "—",
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
  } catch {
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
  supply: typeof FX_DASHBOARD_SUPPLY;
  recentTrips: FleetTrip[];
  // The recent-trips strip is loaded from the trips endpoint independently of
  // the headline KPIs. It can fall back to fixtures while the KPIs are live, so
  // it carries its own source flag instead of inheriting `source`.
  recentTripsSource: DataSource;
  source: DataSource;
  // Compliance / cases / training KPIs, the attention banners, and the
  // supply-by-service breakdown have no fleet-partner endpoint yet, so they are
  // always design data. `supplementalSource` lets the page mark them as such
  // even when the headline KPIs are live.
  supplemental: FleetDashboardSupplemental;
  attention: FleetAttentionBanner[];
  supplementalSource: DataSource;
}

const DASHBOARD_FALLBACK: Omit<
  DashboardView,
  | "supply"
  | "recentTrips"
  | "recentTripsSource"
  | "source"
  | "supplemental"
  | "attention"
  | "supplementalSource"
> = {
  driverCount: "128",
  driverStatusSummary: {
    online: "96",
    offline: "32",
  },
  dispatchable: "96",
  completedTrips: "14,280",
  share: "NT$ 642K",
  grossRevenue: "NT$ 2.14M",
};

export async function loadDashboard(): Promise<DashboardView> {
  // The recent-trips strip and the dashboard KPIs come from different
  // endpoints; the supplemental KPIs / attention banners / supply-by-service
  // breakdown have no endpoint yet and always use design fixtures. `source`
  // reflects the headline KPI record; `supplementalSource` is always fallback.
  const supplemental = FX_DASHBOARD_SUPPLEMENTAL;
  const attention = FX_DASHBOARD_ATTENTION;
  const supplementalSource: DataSource = "fallback";
  let recentTrips: FleetTrip[] = FX_FLEET_TRIPS.slice(0, 5);
  let recentTripsSource: DataSource = "fallback";
  try {
    const tripsView = await loadTrips();
    if (tripsView.source === "live") {
      recentTrips = tripsView.rows.slice(0, 5);
      recentTripsSource = "live";
    } else {
      recentTrips = FX_FLEET_TRIPS.slice(0, 5);
      recentTripsSource = "fallback";
    }
  } catch {
    recentTrips = FX_FLEET_TRIPS.slice(0, 5);
    recentTripsSource = "fallback";
  }

  try {
    const { client } = await getServerFleetPartnerClient();
    const record = await client.listFleetPortalDashboard();
    const offline = Math.max(
      record.activeDriverCount - record.onlineDriverCount,
      0,
    );
    return {
      driverCount: record.activeDriverCount.toLocaleString("en-US"),
      driverStatusSummary: {
        online: record.onlineDriverCount.toLocaleString("en-US"),
        offline: offline.toLocaleString("en-US"),
      },
      dispatchable: record.dispatchEligibleDriverCount.toLocaleString("en-US"),
      completedTrips: record.completedTripCount.toLocaleString("en-US"),
      share: formatMoney(record.shareAmount),
      grossRevenue: formatMoney(record.grossEarningAmount),
      supply: FX_DASHBOARD_SUPPLY,
      recentTrips,
      recentTripsSource,
      source: "live",
      supplemental,
      attention,
      supplementalSource,
    };
  } catch {
    return {
      ...DASHBOARD_FALLBACK,
      supply: FX_DASHBOARD_SUPPLY,
      recentTrips,
      recentTripsSource,
      source: "fallback",
      supplemental,
      attention,
      supplementalSource,
    };
  }
}

// --- views without a portal endpoint yet (fixtures through the seam) --------

export interface CasesView {
  rows: FleetCase[];
  source: DataSource;
}

export async function loadCases(): Promise<CasesView> {
  // No /api/fleet-partner/cases endpoint in DH-FLP-BE-CLIENT yet.
  return { rows: FX_FLEET_CASES, source: "fallback" };
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
  // Header KPIs. `completionPct` and `pendingHeadcount` are derived from the
  // course rows (the same seam data the page lists). `overdueIncomplete` has no
  // backing field on any fleet-partner endpoint yet, so it is supplemental
  // design data carried behind the seam (like the dashboard supplemental KPIs)
  // rather than a literal in the render path.
  summary: {
    completionPct: string;
    pendingHeadcount: string;
    overdueIncomplete: string;
  };
  source: DataSource;
}

function summariseTraining(rows: FleetTraining[]): TrainingView["summary"] {
  const completed = rows.reduce((sum, c) => sum + c.completed, 0);
  const total = rows.reduce((sum, c) => sum + c.total, 0);
  const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    completionPct: `${completionPct}%`,
    pendingHeadcount: (total - completed).toLocaleString("en-US"),
    overdueIncomplete: FX_TRAINING_OVERDUE_INCOMPLETE,
  };
}

export async function loadTraining(): Promise<TrainingView> {
  // No /api/fleet-partner/training endpoint in DH-FLP-BE-CLIENT yet.
  return {
    rows: FX_FLEET_TRAINING,
    summary: summariseTraining(FX_FLEET_TRAINING),
    source: "fallback",
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
