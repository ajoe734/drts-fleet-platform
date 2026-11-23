import { readFile } from "node:fs/promises";
import type {
  BrowserContext,
  Download,
  Locator,
  Page,
  Route,
} from "@playwright/test";
import type {
  ComplaintCaseRecord,
  ComplaintTimelineEntry,
  SixMonthMonthlyOperationsSummary,
  SixMonthOperationsSummary,
} from "@drts/contracts";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import { recordsToPdf } from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import { parsePdf } from "../../unit/billing-pdf-chinese-printable-content-20261016/pdf-parser";
import {
  opsReportJobArtifactPathname,
  opsReportJobDetailPathname,
  parseCsvRecords,
  resolveDailyServiceProductCode,
} from "./daily-report-downloads";
import {
  camelWire,
  Evidence,
  hash,
  integer,
  JourneyFailure,
  object,
  records,
  requireFact,
  text,
  type ObjectData,
} from "./protocol";

export const R10_OPERATIONS_EXPORT_FORMATS = ["json", "csv", "pdf"] as const;
export type R10OperationsExportFormat =
  (typeof R10_OPERATIONS_EXPORT_FORMATS)[number];

export const R10_OPERATIONS_JOB_FORMATS = ["csv", "pdf"] as const;
export type R10OperationsJobFormat =
  (typeof R10_OPERATIONS_JOB_FORMATS)[number];

export const R10_OPERATIONS_MIME_TYPES: Readonly<
  Record<R10OperationsExportFormat, string>
> = Object.freeze({
  json: "application/json",
  csv: "text/csv",
  pdf: "application/pdf",
});

export const R10_MONTHLY_CSV_COLUMNS = [
  "periodMonth",
  "from",
  "to",
  "businessArea",
  "serviceProductCode",
  "demandRequestCount",
  "actualDispatchCount",
  "completedTripCount",
  "cancelledOrderCount",
  "averageDispatchableVehicleCount",
  "validSnapshotCount",
  "expectedSnapshotCount",
  "snapshotCoverageRate",
  "complaintCount",
  "complaintsByCategory",
  "lateArrivalThresholdMinutes",
  "onTimeTripCount",
  "lateTripCount",
  "noShowTripCount",
  "punctualityUnknownTripCount",
  "complaintCreatedLowRatingAutoCount",
  "complaintCreatedManualCount",
  "complaintClosedLowRatingAutoCount",
  "complaintClosedManualCount",
  "complaintOverdueLowRatingAutoCount",
  "complaintOverdueManualCount",
  "complaintStatisticsAsOf",
  "generatedAt",
] as const;

export const R10_SUMMARY_PDF_COLUMNS = [
  "from",
  "to",
  "businessArea",
  "serviceProductCode",
  "demandRequestCount",
  "actualDispatchCount",
  "completedTripCount",
  "cancelledOrderCount",
  "averageDispatchableVehicleCount",
  "validSnapshotCount",
  "expectedSnapshotCount",
  "snapshotCoverageRate",
  "complaintCount",
  "complaintsByCategory",
  "lateArrivalThresholdMinutes",
  "onTimeTripCount",
  "lateTripCount",
  "noShowTripCount",
  "punctualityUnknownTripCount",
  "complaintCreatedLowRatingAutoCount",
  "complaintCreatedManualCount",
  "complaintClosedLowRatingAutoCount",
  "complaintClosedManualCount",
  "complaintOverdueLowRatingAutoCount",
  "complaintOverdueManualCount",
  "complaintStatisticsAsOf",
  "generatedAt",
] as const;

export type R10VerifiedOpsRole = Readonly<{
  realm: "ops";
  actorType: "ops_user";
  principalId: string;
  membershipId: string;
  sessionId: string;
  scopes: readonly string[];
}>;

export type R10OwnCaseInput = Readonly<{
  caseNo: string;
  orderId: string;
  source: "lowRatingAuto" | "manual";
  category?: "driver_service" | "fare_dispute" | "lost_and_found";
}>;

export type R10ControlledCaseSourceFact = Readonly<{
  caseNo: string;
  orderId: string;
  source: "lowRatingAuto" | "manual";
  category: string;
  status: string;
  createdAt: string;
  slaDueAt: string;
  closedAt: string | null;
  orderCreatedAt: string;
}>;

export type R10SixMonthWindow = Readonly<{
  from: string;
  to: string;
  canonicalFrom: string;
  canonicalTo: string;
  periods: readonly string[];
}>;

export type R10CrossMonthBoundaryKind =
  | "utc-vs-taipei-created-month"
  | "utc-vs-taipei-closed-month"
  | "created-vs-closed-taipei-month"
  | "order-vs-complaint-taipei-month";

export type R10CrossMonthSampleSummary = Readonly<{
  source: "lowRatingAuto" | "manual";
  category: string;
  orderTaipeiMonth: string;
  createdUtcMonth: string;
  createdTaipeiMonth: string;
  closedUtcMonth: string | null;
  closedTaipeiMonth: string | null;
  boundaryKinds: readonly R10CrossMonthBoundaryKind[];
  attributedToTaipeiMonth: true;
}>;

export type R10CrossMonthComplaintQualification =
  | "verified-controlled-cross-month-sample"
  | "no-verifiable-controlled-cross-month-sample-in-window-no-historical-order-modified";

export type R10CrossMonthComplaintCheck = Readonly<{
  timeZone: "Asia/Taipei";
  controlledCaseCount: number;
  allControlledCasesAttributedByTaipeiMonth: true;
  hasControlledCrossMonthSample: boolean;
  controlledCrossMonthSampleCount: number;
  qualification: R10CrossMonthComplaintQualification;
  historicalOrdersModified: false;
  samples: readonly R10CrossMonthSampleSummary[];
}>;

export type R10ZeroVsNullCheck = Readonly<{
  summaryRowCount: number;
  monthlyRowCount: number;
  nullAverageWhenNoValidSnapshotsCount: number;
  numericZeroAverageWithValidSnapshotsCount: number;
  positiveAverageWithValidSnapshotsCount: number;
  trueZeroMetricCellCount: number;
  hasNullAverageSample: boolean;
  hasTrueZeroMetricSample: boolean;
  nullAndZeroDistinguished: true;
}>;

export type R10DimensionComparisonSummary = Readonly<{
  businessArea: string;
  serviceProductCode: string;
  from: string;
  to: string;
  periods: readonly string[];
  demandRequestCount: number;
  actualDispatchCount: number;
  completedTripCount: number;
  cancelledOrderCount: number;
  averageDispatchableVehicleCount: number | null;
  validSnapshotCount: number;
  expectedSnapshotCount: number;
  snapshotCoverageRate: number;
  complaintCount: number;
  onTimeTripCount: number;
  lateTripCount: number;
  noShowTripCount: number;
  punctualityUnknownTripCount: number;
  complaintCreatedLowRatingAutoCount: number;
  complaintCreatedManualCount: number;
  complaintClosedLowRatingAutoCount: number;
  complaintClosedManualCount: number;
  complaintOverdueLowRatingAutoCount: number;
  complaintOverdueManualCount: number;
  monthlyTotalsMatchAggregate: true;
  ownCompletedOrderPresent: boolean;
  ownCaseCount: number;
}>;

export type R10GenerationTimestampEntry = Readonly<{
  stage:
    | "initial-preview"
    | "fixed-source-rerun-preview"
    | "json-export-preview"
    | "csv-report-job"
    | "pdf-report-job";
  runtimeSha: string;
  generatedAt: string;
  complaintStatisticsAsOf: string;
  exportedAt?: string;
}>;

export type R10JsonExportArtifactSummary = Readonly<{
  format: "json";
  deliveryMode: "browser-blob";
  reportType: "six_month_operations_summary";
  query: Readonly<{ from: string; to: string }>;
  fileName: string;
  downloadUrlScheme: "blob";
  contentType: "application/json";
  bytes: number;
  sha256: string;
  exportedAt: string;
  generatedAt: string;
  complaintStatisticsAsOf: string;
  summaryRowCount: number;
  monthlyRowCount: number;
  periods: readonly string[];
  matchedExportPreviewGeneration: true;
  matchedBaselineBusinessValues: true;
  artifactPath: null;
  rawArtifactRetained: false;
  runtimeSha: string;
  contentSignature: Readonly<{
    format: "json";
    magicHeader: string;
    matchedExpectedRender: true;
  }>;
}>;

export type R10JobExportArtifactSummary = Readonly<{
  format: R10OperationsJobFormat;
  deliveryMode: "background-report-job";
  jobId: string;
  jobType: "six_month_operations_summary";
  jobStatus: "completed";
  artifactId: string;
  artifactType: "report";
  downloadUrl: string;
  immutable: true;
  contentType: string;
  contentDisposition: string;
  fileName: string;
  artifactPath: null;
  rawArtifactRetained: false;
  bytes: number;
  sha256: string;
  expiresAt: string;
  manifestHash: string;
  generatedAt: string;
  complaintStatisticsAsOf: string;
  rowCount: number;
  summaryDimensionCount: number;
  monthlyRowCount: number;
  periods: readonly string[];
  matchedBaselineBusinessValues: true;
  runtimeSha: string;
  contentSignature: Readonly<{
    format: R10OperationsJobFormat;
    magicHeader: string;
    matchedExpectedRender: true;
    pageCount?: number;
  }>;
}>;

export type R10OperationsDownloadsEvidence = Readonly<{
  definitionSha: string;
  runtimeSha: string;
  orderId: string;
  tenantId: string;
  partnerId: string;
  entrySlug: string;
  serviceCaseNo: string;
  ownDimension: Readonly<{
    businessArea: string;
    serviceProductCode: string;
  }>;
  window: R10SixMonthWindow;
  preview: Readonly<{
    dimensionCount: number;
    monthlyRowCount: number;
    periods: readonly string[];
    generatedAt: string;
    complaintStatisticsAsOf: string;
    ownCompletedOrderVerified: true;
    ownSevenCasesVerified: true;
    uiCardsAndMonthlyTableVerified: true;
    uiNotProvidedVerified: boolean;
    dimensions: readonly R10DimensionComparisonSummary[];
    runtimeSha: string;
  }>;
  fixedSourceRerun: Readonly<{
    sameQuery: Readonly<{ from: string; to: string }>;
    sameRuntimeSha: true;
    initialGeneratedAt: string;
    rerunGeneratedAt: string;
    initialComplaintStatisticsAsOf: string;
    rerunComplaintStatisticsAsOf: string;
    generatedAtMintedPerRequest: boolean;
    businessValuesMatched: true;
    dimensionCount: number;
    monthlyRowCount: number;
  }>;
  zeroVsNull: R10ZeroVsNullCheck;
  crossMonthComplaints: R10CrossMonthComplaintCheck;
  generationTimestamps: readonly R10GenerationTimestampEntry[];
  downloads: Readonly<{
    json: R10JsonExportArtifactSummary;
    csv: R10JobExportArtifactSummary;
    pdf: R10JobExportArtifactSummary;
  }>;
  mixedTenantDetailProtection: "ram-validated-summary-only-raw-mixed-tenant-detail-omitted";
}>;

const TAIPEI_YEAR_MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
});

export function toTaipeiYearMonth(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  requireFact(
    Number.isFinite(parsed),
    "r10-operations-valid-timestamp-required",
  );
  const parts = TAIPEI_YEAR_MONTH_FORMATTER.formatToParts(new Date(parsed));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const formatted = `${year ?? ""}-${month ?? ""}`;
  requireFact(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(formatted),
    "r10-operations-taipei-year-month-format",
  );
  return formatted;
}

export function toUtcYearMonth(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  requireFact(
    Number.isFinite(parsed),
    "r10-operations-valid-utc-timestamp-required",
  );
  const formatted = new Date(parsed).toISOString().slice(0, 7);
  requireFact(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(formatted),
    "r10-operations-utc-year-month-format",
  );
  return formatted;
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  requireFact(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth) &&
      Number.isSafeInteger(deltaMonths),
    "r10-operations-valid-year-month-shift-input",
  );
  const [year, month] = yearMonth.split("-").map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 + deltaMonths, 1));
  return `${target.getUTCFullYear()}-${String(
    target.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
}

export function lastDayOfYearMonth(yearMonth: string): string {
  requireFact(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth),
    "r10-operations-valid-year-month-boundary",
  );
  const [year, month] = yearMonth.split("-").map(Number);
  const end = new Date(Date.UTC(year!, month!, 0));
  return end.toISOString().slice(0, 10);
}

export function resolveSixMonthOperationsWindow(
  anchorToMonth: string,
  r09FromMonth?: string,
): R10SixMonthWindow {
  requireFact(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(anchorToMonth),
    "r10-operations-anchor-to-month-format",
  );
  const from = shiftYearMonth(anchorToMonth, -5);
  const periods: string[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    periods.push(shiftYearMonth(from, offset));
  }
  requireFact(
    periods.length === 6 &&
      periods[0] === from &&
      periods[5] === anchorToMonth &&
      (r09FromMonth === undefined ||
        (r09FromMonth >= from && r09FromMonth <= anchorToMonth)),
    "r10-operations-six-month-inclusive-window",
  );
  return Object.freeze({
    from,
    to: anchorToMonth,
    canonicalFrom: `${from}-01`,
    canonicalTo: lastDayOfYearMonth(anchorToMonth),
    periods: Object.freeze(periods),
  });
}

export function assertR10VerifiedOpsRole(
  session: ObjectData,
  expected: R10VerifiedOpsRole,
  requiredScopes: readonly string[],
) {
  const identity = object(session.identity);
  const scopes = identity.scopes;
  requireFact(
    session.active === true &&
      expected.realm === "ops" &&
      expected.actorType === "ops_user" &&
      identity.realm === "ops" &&
      identity.actorType === "ops_user" &&
      identity.authMode === "jwt_bearer" &&
      identity.principalId === expected.principalId &&
      identity.actorId === expected.principalId &&
      identity.membershipId === expected.membershipId &&
      identity.sessionId === expected.sessionId &&
      Array.isArray(scopes) &&
      requiredScopes.every((scope) => scopes.includes(scope)),
    "r10-operations-verified-ops-role-session-scopes",
  );
}

async function readBrowserOpsSession(
  page: Page,
  runtimeSha: string,
): Promise<ObjectData> {
  const observed = await page.evaluate(async () => {
    const response = await fetch("/control-plane-proxy/auth/session", {
      credentials: "same-origin",
      cache: "no-store",
    });
    return {
      status: response.status,
      runtimeSha: response.headers.get("x-drts-candidate-sha"),
      body: await response.json(),
    };
  });
  requireFact(
    observed.status === 200 && observed.runtimeSha === runtimeSha,
    "r10-operations-browser-bff-session-runtime",
  );
  const payload = object(camelWire(observed.body));
  const data = object(payload.data);
  requireFact(data.active === true, "r10-operations-browser-session-active");
  return data;
}

const COUNT_KEYS = [
  "demandRequestCount",
  "actualDispatchCount",
  "completedTripCount",
  "cancelledOrderCount",
  "validSnapshotCount",
  "expectedSnapshotCount",
  "complaintCount",
  "onTimeTripCount",
  "lateTripCount",
  "noShowTripCount",
  "punctualityUnknownTripCount",
  "complaintCreatedLowRatingAutoCount",
  "complaintCreatedManualCount",
  "complaintClosedLowRatingAutoCount",
  "complaintClosedManualCount",
  "complaintOverdueLowRatingAutoCount",
  "complaintOverdueManualCount",
] as const;

const METRIC_ZERO_CANDIDATE_KEYS = [
  "demandRequestCount",
  "actualDispatchCount",
  "completedTripCount",
  "cancelledOrderCount",
  "validSnapshotCount",
  "complaintCount",
  "onTimeTripCount",
  "lateTripCount",
  "noShowTripCount",
  "punctualityUnknownTripCount",
  "complaintCreatedLowRatingAutoCount",
  "complaintCreatedManualCount",
  "complaintClosedLowRatingAutoCount",
  "complaintClosedManualCount",
  "complaintOverdueLowRatingAutoCount",
  "complaintOverdueManualCount",
] as const;

function toCanonicalCategoryKey(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function restoreRowComplaintsByCategory<T extends ObjectData>(row: T): T {
  if (
    !row.complaintsByCategory ||
    typeof row.complaintsByCategory !== "object" ||
    Array.isArray(row.complaintsByCategory)
  ) {
    return row;
  }
  const restoredCategories = Object.fromEntries(
    Object.entries(row.complaintsByCategory as Record<string, unknown>).map(
      ([k, v]) => [toCanonicalCategoryKey(k), v],
    ),
  );
  return {
    ...row,
    complaintsByCategory: restoredCategories,
  };
}

function normalizeCategoryRecord(
  value: unknown,
  stage: string,
): Record<string, number> {
  const raw = object(value);
  const entries = Object.entries(raw)
    .map(
      ([category, count]) => [toCanonicalCategoryKey(category), count] as const,
    )
    .sort(([a], [b]) => a.localeCompare(b));
  const out: Record<string, number> = {};
  for (const [category, count] of entries) {
    requireFact(
      category.trim().length > 0 &&
        typeof count === "number" &&
        Number.isSafeInteger(count) &&
        count >= 0,
      `${stage}:invalid-complaint-category-count`,
    );
    out[category] = count;
  }
  return out;
}

function sameCategoryRecord(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, idx) => key === rightKeys[idx] && left[key] === right[key],
    )
  );
}

function verifyAverageZeroVsNull(
  row: ObjectData,
  stage: string,
): {
  validSnapshotCount: number;
  expectedSnapshotCount: number;
  snapshotCoverageRate: number;
  averageDispatchableVehicleCount: number | null;
} {
  const validSnapshotCount = integer(
    row.validSnapshotCount,
    `${stage}:valid-snapshot-count`,
  );
  const expectedSnapshotCount = integer(
    row.expectedSnapshotCount,
    `${stage}:expected-snapshot-count`,
  );
  requireFact(
    validSnapshotCount >= 0 &&
      expectedSnapshotCount > 0 &&
      validSnapshotCount <= expectedSnapshotCount,
    `${stage}:snapshot-bounds`,
  );
  const snapshotCoverageRate = row.snapshotCoverageRate;
  requireFact(
    typeof snapshotCoverageRate === "number" &&
      Number.isFinite(snapshotCoverageRate) &&
      snapshotCoverageRate >= 0 &&
      snapshotCoverageRate <= 1,
    `${stage}:snapshot-coverage-rate`,
  );
  const avg = row.averageDispatchableVehicleCount;
  if (validSnapshotCount === 0) {
    requireFact(
      avg === null && snapshotCoverageRate === 0,
      `${stage}:zero-valid-snapshots-requires-null-average`,
    );
    return {
      validSnapshotCount,
      expectedSnapshotCount,
      snapshotCoverageRate,
      averageDispatchableVehicleCount: null,
    };
  }
  requireFact(
    typeof avg === "number" && Number.isFinite(avg) && avg >= 0,
    `${stage}:positive-valid-snapshots-requires-numeric-average`,
  );
  return {
    validSnapshotCount,
    expectedSnapshotCount,
    snapshotCoverageRate,
    averageDispatchableVehicleCount: avg,
  };
}

export function validateSixMonthOperationsPreview(input: {
  rawRows: unknown;
  window: R10SixMonthWindow;
  ownOrder: Readonly<{
    orderId: string;
    tenantId: string;
    partnerId: string;
    entrySlug: string;
    serviceProductCode: string;
    createdAt: string;
    reservationWindowStart: string | null;
  }>;
  ownCases: readonly R10ControlledCaseSourceFact[];
  serviceCaseNo: string;
  closureMonth: string;
}): Readonly<{
  summaries: SixMonthOperationsSummary[];
  monthlyRows: SixMonthMonthlyOperationsSummary[];
  ownDimension: Readonly<{ businessArea: string; serviceProductCode: string }>;
  generatedAt: string;
  complaintStatisticsAsOf: string;
  dimensions: readonly R10DimensionComparisonSummary[];
  zeroVsNull: R10ZeroVsNullCheck;
  crossMonthComplaints: R10CrossMonthComplaintCheck;
}> {
  const { rawRows, window, ownOrder, ownCases, serviceCaseNo, closureMonth } =
    input;
  const rows = records(rawRows);
  requireFact(rows.length > 0, "r10-operations-preview-nonempty-required");
  requireFact(
    ownCases.length === 7 &&
      new Set(ownCases.map((c) => c.caseNo)).size === 7 &&
      ownCases.filter((c) => c.source === "lowRatingAuto").length === 4 &&
      ownCases.filter((c) => c.source === "manual").length === 3 &&
      window.periods.includes(closureMonth),
    "r10-operations-own-seven-cases-and-closure-month-required",
  );

  const ownOrderMonth = toTaipeiYearMonth(
    ownOrder.reservationWindowStart ?? ownOrder.createdAt,
  );
  requireFact(
    window.periods.includes(ownOrderMonth),
    "r10-operations-own-order-month-within-six-month-window",
  );

  const dimensionKeySet = new Set<string>();
  const allMonthlyRows: SixMonthMonthlyOperationsSummary[] = [];
  const dimensionSummaries: R10DimensionComparisonSummary[] = [];

  let nullAverageWhenNoValidSnapshotsCount = 0;
  let numericZeroAverageWithValidSnapshotsCount = 0;
  let positiveAverageWithValidSnapshotsCount = 0;
  let trueZeroMetricCellCount = 0;

  const tallyZeroVsNull = (row: ObjectData, stage: string) => {
    const snap = verifyAverageZeroVsNull(row, stage);
    if (snap.validSnapshotCount === 0) {
      nullAverageWhenNoValidSnapshotsCount += 1;
    } else if (snap.averageDispatchableVehicleCount === 0) {
      numericZeroAverageWithValidSnapshotsCount += 1;
    } else {
      positiveAverageWithValidSnapshotsCount += 1;
    }
    for (const key of METRIC_ZERO_CANDIDATE_KEYS) {
      const value = integer(row[key], `${stage}:${key}`);
      requireFact(value >= 0, `${stage}:${key}-nonnegative`);
      if (value === 0) trueZeroMetricCellCount += 1;
    }
  };

  let latestGeneratedAt = "";
  let canonicalAsOf = "";
  const ownOrderContainingDimensions: Array<{
    businessArea: string;
    serviceProductCode: string;
  }> = [];

  for (const row of rows) {
    const businessArea = text(
      row.businessArea,
      "r10-operations-summary-business-area",
    );
    const serviceProductCode = text(
      row.serviceProductCode,
      "r10-operations-summary-service-product-code",
    );
    const dimKey = `${businessArea}\u0000${serviceProductCode}`;
    requireFact(
      !dimensionKeySet.has(dimKey),
      "r10-operations-unique-dimension-card",
    );
    dimensionKeySet.add(dimKey);

    requireFact(
      row.from === window.canonicalFrom && row.to === window.canonicalTo,
      "r10-operations-summary-window-bounds",
    );
    const generatedAt = text(
      row.generatedAt,
      "r10-operations-summary-generated-at",
    );
    const complaintStatisticsAsOf = text(
      row.complaintStatisticsAsOf,
      "r10-operations-summary-complaint-as-of",
    );
    requireFact(
      Number.isFinite(Date.parse(generatedAt)) &&
        Number.isFinite(Date.parse(complaintStatisticsAsOf)),
      "r10-operations-summary-valid-timestamps",
    );
    if (!latestGeneratedAt || generatedAt > latestGeneratedAt) {
      latestGeneratedAt = generatedAt;
    }
    if (!canonicalAsOf) {
      canonicalAsOf = complaintStatisticsAsOf;
    } else {
      requireFact(
        complaintStatisticsAsOf === canonicalAsOf,
        "r10-operations-single-batch-as-of-required",
      );
    }

    tallyZeroVsNull(row, `r10-summary:${businessArea}:${serviceProductCode}`);
    const threshold = integer(
      row.lateArrivalThresholdMinutes,
      "r10-operations-late-threshold-minutes",
    );
    requireFact(threshold > 0, "r10-operations-positive-late-threshold");

    const summaryCategories = normalizeCategoryRecord(
      row.complaintsByCategory,
      `r10-summary:${businessArea}:${serviceProductCode}`,
    );
    const summaryPunctualitySum =
      integer(row.onTimeTripCount) +
      integer(row.lateTripCount) +
      integer(row.noShowTripCount) +
      integer(row.punctualityUnknownTripCount);
    requireFact(
      summaryPunctualitySum === integer(row.actualDispatchCount),
      "r10-operations-summary-punctuality-partition",
    );

    const monthlies = records(row.monthlySummaries);
    requireFact(
      monthlies.length === 6 &&
        monthlies.every((m, idx) => m.periodMonth === window.periods[idx]),
      "r10-operations-six-ordered-monthly-rows-required",
    );

    let sumDemand = 0;
    let sumDispatch = 0;
    let sumCompleted = 0;
    let sumCancelled = 0;
    let sumValidSnapshots = 0;
    let sumExpectedSnapshots = 0;
    let sumComplaints = 0;
    let sumOnTime = 0;
    let sumLate = 0;
    let sumNoShow = 0;
    let sumUnknown = 0;
    const sumCategories: Record<string, number> = {};

    for (const monthly of monthlies) {
      const periodMonth = text(
        monthly.periodMonth,
        "r10-operations-monthly-period-month",
      );
      requireFact(
        monthly.from === `${periodMonth}-01` &&
          monthly.to === lastDayOfYearMonth(periodMonth) &&
          monthly.businessArea === businessArea &&
          monthly.serviceProductCode === serviceProductCode &&
          monthly.generatedAt === generatedAt &&
          monthly.complaintStatisticsAsOf === complaintStatisticsAsOf &&
          monthly.lateArrivalThresholdMinutes === threshold,
        `r10-operations-monthly-metadata:${periodMonth}`,
      );
      tallyZeroVsNull(
        monthly,
        `r10-monthly:${businessArea}:${serviceProductCode}:${periodMonth}`,
      );
      const monthPunctualitySum =
        integer(monthly.onTimeTripCount) +
        integer(monthly.lateTripCount) +
        integer(monthly.noShowTripCount) +
        integer(monthly.punctualityUnknownTripCount);
      requireFact(
        monthPunctualitySum === integer(monthly.actualDispatchCount),
        `r10-operations-monthly-punctuality-partition:${periodMonth}`,
      );

      sumDemand += integer(monthly.demandRequestCount);
      sumDispatch += integer(monthly.actualDispatchCount);
      sumCompleted += integer(monthly.completedTripCount);
      sumCancelled += integer(monthly.cancelledOrderCount);
      sumValidSnapshots += integer(monthly.validSnapshotCount);
      sumExpectedSnapshots += integer(monthly.expectedSnapshotCount);
      sumComplaints += integer(monthly.complaintCount);
      sumOnTime += integer(monthly.onTimeTripCount);
      sumLate += integer(monthly.lateTripCount);
      sumNoShow += integer(monthly.noShowTripCount);
      sumUnknown += integer(monthly.punctualityUnknownTripCount);

      const monthCategories = normalizeCategoryRecord(
        monthly.complaintsByCategory,
        `r10-monthly:${businessArea}:${serviceProductCode}:${periodMonth}`,
      );
      for (const [cat, count] of Object.entries(monthCategories)) {
        sumCategories[cat] = (sumCategories[cat] ?? 0) + count;
      }
      allMonthlyRows.push(
        monthly as unknown as SixMonthMonthlyOperationsSummary,
      );
    }

    requireFact(
      sumDemand === integer(row.demandRequestCount) &&
        sumDispatch === integer(row.actualDispatchCount) &&
        sumCompleted === integer(row.completedTripCount) &&
        sumCancelled === integer(row.cancelledOrderCount) &&
        sumValidSnapshots === integer(row.validSnapshotCount) &&
        sumExpectedSnapshots === integer(row.expectedSnapshotCount) &&
        sumComplaints === integer(row.complaintCount) &&
        sumOnTime === integer(row.onTimeTripCount) &&
        sumLate === integer(row.lateTripCount) &&
        sumNoShow === integer(row.noShowTripCount) &&
        sumUnknown === integer(row.punctualityUnknownTripCount) &&
        sameCategoryRecord(sumCategories, summaryCategories),
      `r10-operations-monthly-totals-match-aggregate:${businessArea}:${serviceProductCode}`,
    );

    const drilldown = object(row.drilldown);
    const punctuality = object(drilldown.punctuality);
    const punctualityIds = [
      ...(Array.isArray(punctuality.onTimeOrderIds)
        ? punctuality.onTimeOrderIds
        : []),
      ...(Array.isArray(punctuality.lateOrderIds)
        ? punctuality.lateOrderIds
        : []),
      ...(Array.isArray(punctuality.noShowOrderIds)
        ? punctuality.noShowOrderIds
        : []),
      ...(Array.isArray(punctuality.unknownOrderIds)
        ? punctuality.unknownOrderIds
        : []),
    ];
    const hasOwnOrder = punctualityIds.includes(ownOrder.orderId);
    if (hasOwnOrder) {
      requireFact(
        serviceProductCode === ownOrder.serviceProductCode,
        "r10-operations-own-order-dimension-product-binding",
      );
      const ownMonthRow = monthlies.find(
        (m) => m.periodMonth === ownOrderMonth,
      );
      requireFact(
        ownMonthRow !== undefined &&
          integer(ownMonthRow.demandRequestCount) >= 1 &&
          integer(ownMonthRow.actualDispatchCount) >= 1 &&
          integer(ownMonthRow.completedTripCount) >= 1,
        "r10-operations-own-order-month-positive-counts",
      );
      ownOrderContainingDimensions.push({ businessArea, serviceProductCode });
    }

    const complaintStats = records(drilldown.complaintMonthlyStatistics);
    requireFact(
      complaintStats.length === 6 &&
        complaintStats.every(
          (stat, idx) =>
            stat.periodMonth === window.periods[idx] &&
            stat.timeZone === "Asia/Taipei",
        ),
      "r10-operations-drilldown-six-taipei-months-required",
    );

    const ownCasesInDimension = ownCases.filter((ownCase) =>
      complaintStats.some((stat) => {
        const low = object(stat.lowRatingAuto);
        const man = object(stat.manual);
        const ids = [
          ...(Array.isArray(low.createdCaseNos) ? low.createdCaseNos : []),
          ...(Array.isArray(low.closedCaseNos) ? low.closedCaseNos : []),
          ...(Array.isArray(low.overdueCaseNos) ? low.overdueCaseNos : []),
          ...(Array.isArray(man.createdCaseNos) ? man.createdCaseNos : []),
          ...(Array.isArray(man.closedCaseNos) ? man.closedCaseNos : []),
          ...(Array.isArray(man.overdueCaseNos) ? man.overdueCaseNos : []),
        ];
        return ids.includes(ownCase.caseNo);
      }),
    );

    dimensionSummaries.push(
      Object.freeze({
        businessArea,
        serviceProductCode,
        from: window.canonicalFrom,
        to: window.canonicalTo,
        periods: window.periods,
        demandRequestCount: integer(row.demandRequestCount),
        actualDispatchCount: integer(row.actualDispatchCount),
        completedTripCount: integer(row.completedTripCount),
        cancelledOrderCount: integer(row.cancelledOrderCount),
        averageDispatchableVehicleCount:
          row.averageDispatchableVehicleCount === null
            ? null
            : (row.averageDispatchableVehicleCount as number),
        validSnapshotCount: integer(row.validSnapshotCount),
        expectedSnapshotCount: integer(row.expectedSnapshotCount),
        snapshotCoverageRate: row.snapshotCoverageRate as number,
        complaintCount: integer(row.complaintCount),
        onTimeTripCount: integer(row.onTimeTripCount),
        lateTripCount: integer(row.lateTripCount),
        noShowTripCount: integer(row.noShowTripCount),
        punctualityUnknownTripCount: integer(row.punctualityUnknownTripCount),
        complaintCreatedLowRatingAutoCount: integer(
          row.complaintCreatedLowRatingAutoCount,
        ),
        complaintCreatedManualCount: integer(row.complaintCreatedManualCount),
        complaintClosedLowRatingAutoCount: integer(
          row.complaintClosedLowRatingAutoCount,
        ),
        complaintClosedManualCount: integer(row.complaintClosedManualCount),
        complaintOverdueLowRatingAutoCount: integer(
          row.complaintOverdueLowRatingAutoCount,
        ),
        complaintOverdueManualCount: integer(row.complaintOverdueManualCount),
        monthlyTotalsMatchAggregate: true,
        ownCompletedOrderPresent: hasOwnOrder,
        ownCaseCount: ownCasesInDimension.length,
      }),
    );
  }

  requireFact(
    ownOrderContainingDimensions.length === 1,
    "r10-operations-own-completed-order-unique-dimension-required",
  );
  const ownDimension = Object.freeze(ownOrderContainingDimensions[0]!);

  // Verify all 7 controlled cases and cross-month Taipei attribution.
  const crossMonthSamples: R10CrossMonthSampleSummary[] = [];
  for (const ownCase of ownCases) {
    const createdTaipeiMonth = toTaipeiYearMonth(ownCase.createdAt);
    const createdUtcMonth = toUtcYearMonth(ownCase.createdAt);
    const orderTaipeiMonth = toTaipeiYearMonth(ownCase.orderCreatedAt);
    const closedTaipeiMonth = ownCase.closedAt
      ? toTaipeiYearMonth(ownCase.closedAt)
      : null;
    const closedUtcMonth = ownCase.closedAt
      ? toUtcYearMonth(ownCase.closedAt)
      : null;
    requireFact(
      window.periods.includes(createdTaipeiMonth) &&
        (closedTaipeiMonth === null ||
          window.periods.includes(closedTaipeiMonth)),
      "r10-operations-own-case-months-in-window",
    );

    const matchingRows = rows.filter((row) => {
      const stats = records(object(row.drilldown).complaintMonthlyStatistics);
      return stats.some((stat) => {
        const split = object(
          ownCase.source === "lowRatingAuto" ? stat.lowRatingAuto : stat.manual,
        );
        const createdIds = Array.isArray(split.createdCaseNos)
          ? split.createdCaseNos
          : [];
        return createdIds.includes(ownCase.caseNo);
      });
    });
    requireFact(
      matchingRows.length === 1 &&
        matchingRows[0]!.serviceProductCode === ownOrder.serviceProductCode,
      "r10-operations-own-case-unique-dimension-binding",
    );
    const matchedRow = matchingRows[0]!;
    if (ownCase.orderId === ownOrder.orderId) {
      requireFact(
        matchedRow.businessArea === ownDimension.businessArea &&
          matchedRow.serviceProductCode === ownDimension.serviceProductCode,
        "r10-operations-same-order-case-shares-own-dimension",
      );
    }

    const stats = records(
      object(matchedRow.drilldown).complaintMonthlyStatistics,
    );
    const monthlies = records(matchedRow.monthlySummaries);

    for (const stat of stats) {
      const periodMonth = text(stat.periodMonth);
      const split = object(
        ownCase.source === "lowRatingAuto" ? stat.lowRatingAuto : stat.manual,
      );
      const createdIds = Array.isArray(split.createdCaseNos)
        ? split.createdCaseNos
        : [];
      const closedIds = Array.isArray(split.closedCaseNos)
        ? split.closedCaseNos
        : [];
      const overdueIds = Array.isArray(split.overdueCaseNos)
        ? split.overdueCaseNos
        : [];

      requireFact(
        createdIds.includes(ownCase.caseNo) ===
          (periodMonth === createdTaipeiMonth),
        "r10-operations-case-created-month-taipei-attribution",
      );
      if (ownCase.caseNo === serviceCaseNo) {
        requireFact(
          closedTaipeiMonth === closureMonth &&
            closedIds.includes(ownCase.caseNo) ===
              (periodMonth === closureMonth),
          "r10-operations-service-case-closure-month-taipei-attribution",
        );
      }
      const dueMonth = toTaipeiYearMonth(ownCase.slaDueAt);
      const expectedOverdue =
        periodMonth === dueMonth &&
        Date.parse(ownCase.slaDueAt) <= Date.parse(canonicalAsOf) &&
        ownCase.status !== "closed";
      requireFact(
        overdueIds.includes(ownCase.caseNo) === expectedOverdue,
        "r10-operations-case-overdue-taipei-attribution",
      );
    }

    const createdMonthlyRow = monthlies.find(
      (m) => m.periodMonth === createdTaipeiMonth,
    );
    requireFact(
      createdMonthlyRow !== undefined &&
        integer(createdMonthlyRow.complaintCount) >= 1 &&
        integer(
          ownCase.source === "lowRatingAuto"
            ? createdMonthlyRow.complaintCreatedLowRatingAutoCount
            : createdMonthlyRow.complaintCreatedManualCount,
        ) >= 1,
      "r10-operations-monthly-summary-reflects-own-created-case",
    );

    if (ownCase.caseNo === serviceCaseNo) {
      const closedMonthlyRow = monthlies.find(
        (m) => m.periodMonth === closureMonth,
      );
      requireFact(
        closedMonthlyRow !== undefined &&
          integer(closedMonthlyRow.complaintClosedManualCount) >= 1,
        "r10-operations-monthly-summary-reflects-own-closed-case",
      );
    }

    const boundaryKinds: R10CrossMonthBoundaryKind[] = [];
    if (createdUtcMonth !== createdTaipeiMonth) {
      boundaryKinds.push("utc-vs-taipei-created-month");
    }
    if (
      closedUtcMonth !== null &&
      closedTaipeiMonth !== null &&
      closedUtcMonth !== closedTaipeiMonth
    ) {
      boundaryKinds.push("utc-vs-taipei-closed-month");
    }
    if (
      closedTaipeiMonth !== null &&
      closedTaipeiMonth !== createdTaipeiMonth
    ) {
      boundaryKinds.push("created-vs-closed-taipei-month");
    }
    if (orderTaipeiMonth !== createdTaipeiMonth) {
      boundaryKinds.push("order-vs-complaint-taipei-month");
    }
    if (boundaryKinds.length > 0) {
      crossMonthSamples.push(
        Object.freeze({
          source: ownCase.source,
          category: ownCase.category,
          orderTaipeiMonth,
          createdUtcMonth,
          createdTaipeiMonth,
          closedUtcMonth,
          closedTaipeiMonth,
          boundaryKinds: Object.freeze(boundaryKinds),
          attributedToTaipeiMonth: true as const,
        }),
      );
    }
  }

  const hasControlledCrossMonthSample = crossMonthSamples.length > 0;
  const crossMonthComplaints: R10CrossMonthComplaintCheck = Object.freeze({
    timeZone: "Asia/Taipei",
    controlledCaseCount: ownCases.length,
    allControlledCasesAttributedByTaipeiMonth: true,
    hasControlledCrossMonthSample,
    controlledCrossMonthSampleCount: crossMonthSamples.length,
    qualification: hasControlledCrossMonthSample
      ? "verified-controlled-cross-month-sample"
      : "no-verifiable-controlled-cross-month-sample-in-window-no-historical-order-modified",
    historicalOrdersModified: false,
    samples: Object.freeze(crossMonthSamples),
  });

  const zeroVsNull: R10ZeroVsNullCheck = Object.freeze({
    summaryRowCount: rows.length,
    monthlyRowCount: allMonthlyRows.length,
    nullAverageWhenNoValidSnapshotsCount,
    numericZeroAverageWithValidSnapshotsCount,
    positiveAverageWithValidSnapshotsCount,
    trueZeroMetricCellCount,
    hasNullAverageSample: nullAverageWhenNoValidSnapshotsCount > 0,
    hasTrueZeroMetricSample: trueZeroMetricCellCount > 0,
    nullAndZeroDistinguished: true,
  });

  return Object.freeze({
    summaries: rows as unknown as SixMonthOperationsSummary[],
    monthlyRows: allMonthlyRows,
    ownDimension,
    generatedAt: latestGeneratedAt,
    complaintStatisticsAsOf: canonicalAsOf,
    dimensions: Object.freeze(dimensionSummaries),
    zeroVsNull,
    crossMonthComplaints,
  });
}

function assertSameSummaryRowBusinessValues(
  left: ObjectData,
  right: ObjectData,
  stage: string,
  includePeriodMonth: boolean,
) {
  requireFact(
    left.from === right.from &&
      left.to === right.to &&
      left.businessArea === right.businessArea &&
      left.serviceProductCode === right.serviceProductCode &&
      (!includePeriodMonth || left.periodMonth === right.periodMonth) &&
      left.lateArrivalThresholdMinutes === right.lateArrivalThresholdMinutes &&
      left.averageDispatchableVehicleCount ===
        right.averageDispatchableVehicleCount &&
      left.snapshotCoverageRate === right.snapshotCoverageRate,
    `${stage}:identity-or-snapshot-average-mismatch`,
  );
  for (const key of COUNT_KEYS) {
    requireFact(
      integer(left[key], `${stage}:left-${key}`) ===
        integer(right[key], `${stage}:right-${key}`),
      `${stage}:count-${key}-mismatch`,
    );
  }
  const leftCategories = normalizeCategoryRecord(
    left.complaintsByCategory,
    `${stage}:left-categories`,
  );
  const rightCategories = normalizeCategoryRecord(
    right.complaintsByCategory,
    `${stage}:right-categories`,
  );
  requireFact(
    sameCategoryRecord(leftCategories, rightCategories),
    `${stage}:complaints-by-category-mismatch`,
  );
}

export function compareSixMonthSummaryGenerations(
  baselineRaw: unknown,
  candidateRaw: unknown,
  stage: string,
): Readonly<{
  businessValuesMatched: true;
  baselineGeneratedAt: string;
  candidateGeneratedAt: string;
  baselineComplaintStatisticsAsOf: string;
  candidateComplaintStatisticsAsOf: string;
  generatedAtMintedPerRequest: boolean;
}> {
  const baseline = records(baselineRaw);
  const candidate = records(candidateRaw);
  requireFact(
    baseline.length > 0 && baseline.length === candidate.length,
    `${stage}:summary-dimension-count-mismatch`,
  );

  let baselineGeneratedAt = "";
  let candidateGeneratedAt = "";
  let baselineAsOf = "";
  let candidateAsOf = "";

  for (let i = 0; i < baseline.length; i += 1) {
    const left = baseline[i]!;
    const right = candidate[i]!;
    assertSameSummaryRowBusinessValues(left, right, `${stage}:row-${i}`, false);

    const leftGen = text(left.generatedAt, `${stage}:left-generated-at`);
    const rightGen = text(right.generatedAt, `${stage}:right-generated-at`);
    const leftAsOf = text(
      left.complaintStatisticsAsOf,
      `${stage}:left-complaint-as-of`,
    );
    const rightAsOf = text(
      right.complaintStatisticsAsOf,
      `${stage}:right-complaint-as-of`,
    );
    if (!baselineGeneratedAt || leftGen > baselineGeneratedAt) {
      baselineGeneratedAt = leftGen;
    }
    if (!candidateGeneratedAt || rightGen > candidateGeneratedAt) {
      candidateGeneratedAt = rightGen;
    }
    if (!baselineAsOf) baselineAsOf = leftAsOf;
    if (!candidateAsOf) candidateAsOf = rightAsOf;

    const leftMonthlies = records(left.monthlySummaries);
    const rightMonthlies = records(right.monthlySummaries);
    requireFact(
      leftMonthlies.length === 6 && rightMonthlies.length === 6,
      `${stage}:monthly-count-mismatch`,
    );
    for (let m = 0; m < leftMonthlies.length; m += 1) {
      assertSameSummaryRowBusinessValues(
        leftMonthlies[m]!,
        rightMonthlies[m]!,
        `${stage}:row-${i}-month-${m}`,
        true,
      );
    }
  }

  return Object.freeze({
    businessValuesMatched: true,
    baselineGeneratedAt,
    candidateGeneratedAt,
    baselineComplaintStatisticsAsOf: baselineAsOf,
    candidateComplaintStatisticsAsOf: candidateAsOf,
    generatedAtMintedPerRequest: baselineGeneratedAt !== candidateGeneratedAt,
  });
}

export function validateR10JsonBlobDownload(input: {
  bytes: Buffer;
  fileName: string;
  downloadUrl: string;
  window: R10SixMonthWindow;
  exportPreviewRows: unknown;
  baselinePreviewRows: unknown;
  runtimeSha: string;
}): R10JsonExportArtifactSummary {
  const {
    bytes,
    fileName,
    downloadUrl,
    window,
    exportPreviewRows,
    baselinePreviewRows,
    runtimeSha,
  } = input;
  requireFact(
    /^[a-f0-9]{40}$/.test(runtimeSha),
    "r10-json-immutable-runtime-sha-required",
  );
  requireFact(
    downloadUrl.startsWith("blob:") &&
      /^six-month-operations-summary-\d{4}-\d{2}-\d{2}\.json$/.test(fileName),
    "r10-json-blob-url-and-filename-binding",
  );
  requireFact(
    bytes.length > 0 && bytes.length <= 16 * 1024 * 1024,
    "r10-json-bounded-nonempty-bytes-required",
  );

  let parsedRaw: unknown;
  try {
    parsedRaw = camelWire(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new JourneyFailure("r10-json-invalid-json-payload");
  }
  const payload = object(parsedRaw);
  const query = object(payload.query);
  const exportedAt = text(payload.exportedAt, "r10-json-exported-at-required");
  requireFact(
    payload.reportType === "six_month_operations_summary" &&
      query.from === window.from &&
      query.to === window.to &&
      Object.keys(query).every((k) => k === "from" || k === "to") &&
      Number.isFinite(Date.parse(exportedAt)),
    "r10-json-envelope-and-query-binding",
  );

  const jsonRows = records(payload.rows);
  const previewRows = records(exportPreviewRows);
  const jsonMonthlies = records(payload.monthlySummaries);
  requireFact(
    jsonRows.length === previewRows.length &&
      jsonMonthlies.length === jsonRows.length * 6,
    "r10-json-row-and-monthly-counts-binding",
  );

  // JSON export is built in-browser from the exact preview GET response.
  const previewVsJson = compareSixMonthSummaryGenerations(
    previewRows,
    jsonRows,
    "r10-json-vs-export-preview",
  );
  requireFact(
    previewVsJson.baselineGeneratedAt === previewVsJson.candidateGeneratedAt &&
      previewVsJson.baselineComplaintStatisticsAsOf ===
        previewVsJson.candidateComplaintStatisticsAsOf,
    "r10-json-exact-export-preview-generation-binding",
  );

  const flattenedFromRows = jsonRows.flatMap((row) =>
    records(row.monthlySummaries),
  );
  requireFact(
    flattenedFromRows.length === jsonMonthlies.length,
    "r10-json-flattened-monthlies-length",
  );
  for (let i = 0; i < jsonMonthlies.length; i += 1) {
    assertSameSummaryRowBusinessValues(
      flattenedFromRows[i]!,
      jsonMonthlies[i]!,
      `r10-json-monthly-${i}`,
      true,
    );
    requireFact(
      flattenedFromRows[i]!.generatedAt === jsonMonthlies[i]!.generatedAt &&
        flattenedFromRows[i]!.complaintStatisticsAsOf ===
          jsonMonthlies[i]!.complaintStatisticsAsOf,
      `r10-json-monthly-${i}-generation-binding`,
    );
  }

  compareSixMonthSummaryGenerations(
    baselinePreviewRows,
    jsonRows,
    "r10-json-vs-initial-preview",
  );

  return Object.freeze({
    format: "json",
    deliveryMode: "browser-blob",
    reportType: "six_month_operations_summary",
    query: Object.freeze({ from: window.from, to: window.to }),
    fileName,
    downloadUrlScheme: "blob",
    contentType: "application/json",
    bytes: bytes.length,
    sha256: hash(bytes),
    exportedAt,
    generatedAt: previewVsJson.candidateGeneratedAt,
    complaintStatisticsAsOf: previewVsJson.candidateComplaintStatisticsAsOf,
    summaryRowCount: jsonRows.length,
    monthlyRowCount: jsonMonthlies.length,
    periods: window.periods,
    matchedExportPreviewGeneration: true,
    matchedBaselineBusinessValues: true,
    artifactPath: null,
    rawArtifactRetained: false,
    runtimeSha,
    contentSignature: Object.freeze({
      format: "json",
      magicHeader: "{",
      matchedExpectedRender: true,
    }),
  });
}

function assertNotHtmlOrJsonErrorBody(
  bytes: Buffer,
  format: R10OperationsJobFormat,
) {
  requireFact(
    bytes.length > 0 && bytes.length <= 8 * 1024 * 1024,
    `r10-operations-${format}-bounded-nonempty-bytes-required`,
  );
  const headUtf8 = bytes
    .subarray(0, Math.min(bytes.length, 512))
    .toString("utf8")
    .trimStart();
  requireFact(
    !/^(<!doctype\s+html|<html|<head|<body|<script)/i.test(headUtf8),
    `r10-operations-${format}-html-body-rejected`,
  );
  if (headUtf8.startsWith("{")) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(bytes.toString("utf8"));
    } catch {
      parsedJson = null;
    }
    requireFact(
      parsedJson === null,
      `r10-operations-${format}-json-error-body-rejected`,
    );
  }
}

export async function validateR10JobArtifactDownload(input: {
  format: R10OperationsJobFormat;
  jobId: string;
  jobDetail: unknown;
  detailStatus: number;
  detailResponseSha: string | null | undefined;
  artifactStatus: number;
  artifactResponseSha: string | null | undefined;
  contentType: string | null | undefined;
  contentDisposition: string | null | undefined;
  bytes: Buffer;
  window: R10SixMonthWindow;
  baselinePreviewRows: unknown;
  ownDimension: Readonly<{ businessArea: string; serviceProductCode: string }>;
  runtimeSha: string;
  nowMs?: number;
}): Promise<R10JobExportArtifactSummary> {
  const {
    format,
    jobId,
    detailStatus,
    detailResponseSha,
    artifactStatus,
    artifactResponseSha,
    contentType,
    contentDisposition,
    bytes,
    window,
    baselinePreviewRows,
    ownDimension,
    runtimeSha,
    nowMs = Date.now(),
  } = input;

  requireFact(
    /^[a-f0-9]{40}$/.test(runtimeSha) &&
      detailResponseSha === runtimeSha &&
      artifactResponseSha === runtimeSha,
    `r10-operations-${format}-runtime-sha-mismatch`,
  );
  requireFact(
    detailStatus === 200 && artifactStatus === 200,
    `r10-operations-${format}-http-status-200-required`,
  );

  const detail = object(input.jobDetail);
  requireFact(
    detail.jobId === jobId &&
      detail.jobType === "six_month_operations_summary" &&
      detail.format === format &&
      detail.status === "completed",
    `r10-operations-${format}-completed-job-detail-binding`,
  );

  const filters = object(detail.filters);
  requireFact(
    filters.from === window.from &&
      filters.to === window.to &&
      Object.keys(filters).every((k) => k === "from" || k === "to"),
    `r10-operations-${format}-job-filters-binding`,
  );

  const artifact = object(detail.artifact);
  const artifactId = text(
    artifact.artifactId,
    `r10-operations-${format}-artifact-id-required`,
  );
  const expectedDownloadUrl = `/reports/${encodeURIComponent(jobId)}/artifact`;
  const expectedFileName = `six_month_operations_summary-${jobId}.${format}`;
  const expiresAt = text(
    artifact.expiresAt,
    `r10-operations-${format}-artifact-expires-at-required`,
  );
  const expiresAtMs = Date.parse(expiresAt);
  requireFact(
    artifactId.length > 0 &&
      artifact.artifactType === "report" &&
      artifact.downloadUrl === expectedDownloadUrl &&
      artifact.immutable === true &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs > nowMs,
    `r10-operations-${format}-artifact-unexpired-metadata-binding`,
  );
  const manifestHash = text(
    artifact.manifestHash,
    `r10-operations-${format}-manifest-hash-required`,
  );

  const normalizedMime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  requireFact(
    normalizedMime === R10_OPERATIONS_MIME_TYPES[format],
    `r10-operations-${format}-content-type-mismatch`,
  );
  requireFact(
    contentDisposition === `attachment; filename="${expectedFileName}"`,
    `r10-operations-${format}-content-disposition-mismatch`,
  );

  assertNotHtmlOrJsonErrorBody(bytes, format);

  const baselineSummaries = records(baselinePreviewRows);
  const expectedMonthlyByKey = new Map<string, ObjectData>();
  const expectedSummaryByKey = new Map<string, ObjectData>();
  for (const summary of baselineSummaries) {
    const dimKey = `${text(summary.businessArea)}\u0000${text(summary.serviceProductCode)}`;
    expectedSummaryByKey.set(dimKey, summary);
    for (const monthly of records(summary.monthlySummaries)) {
      expectedMonthlyByKey.set(
        `${text(monthly.periodMonth)}\u0000${dimKey}`,
        monthly,
      );
    }
  }

  const jobRows = records(detail.rows).map((row) =>
    restoreRowComplaintsByCategory(row),
  );
  let generatedAt = "";
  let complaintStatisticsAsOf = "";
  let magicHeader = "";
  let pageCount: number | undefined;

  if (format === "csv") {
    // ReportingFilingService.buildSixMonthOperationsSummaryRows emits 6 monthly
    // detail rows per observed (businessArea, serviceProductCode) sorted by
    // periodMonth, businessArea, serviceProductCode.
    requireFact(
      jobRows.length === baselineSummaries.length * 6,
      "r10-operations-csv-six-monthly-rows-per-dimension-required",
    );
    const expectedOrder = [...expectedMonthlyByKey.keys()].sort(
      (left, right) => {
        const [lp, la, ls] = left.split("\u0000");
        const [rp, ra, rs] = right.split("\u0000");
        return (
          lp!.localeCompare(rp!) ||
          la!.localeCompare(ra!) ||
          ls!.localeCompare(rs!)
        );
      },
    );
    for (let i = 0; i < jobRows.length; i += 1) {
      const row = jobRows[i]!;
      const key = `${text(row.periodMonth)}\u0000${text(row.businessArea)}\u0000${text(row.serviceProductCode)}`;
      requireFact(
        key === expectedOrder[i],
        `r10-operations-csv-job-row-sort-order:${i}`,
      );
      const expectedMonthly = expectedMonthlyByKey.get(key)!;
      assertSameSummaryRowBusinessValues(
        expectedMonthly,
        row,
        `r10-operations-csv-job-row-${i}`,
        true,
      );
      verifyAverageZeroVsNull(row, `r10-operations-csv-job-row-${i}`);
      const rowGen = text(row.generatedAt);
      const rowAsOf = text(row.complaintStatisticsAsOf);
      if (!generatedAt || rowGen > generatedAt) generatedAt = rowGen;
      if (!complaintStatisticsAsOf) {
        complaintStatisticsAsOf = rowAsOf;
      } else {
        requireFact(
          rowAsOf === complaintStatisticsAsOf,
          "r10-operations-csv-single-generation-as-of",
        );
      }
    }

    const csvText = bytes.toString("utf8");
    const expectedCsv = recordsToCsv(
      jobRows as unknown as Record<string, unknown>[],
    );
    requireFact(
      csvText === expectedCsv,
      "r10-operations-csv-exact-rendered-bytes-mismatch",
    );
    const parsedRecords = parseCsvRecords(csvText);
    requireFact(
      parsedRecords.length === jobRows.length,
      "r10-operations-csv-parsed-row-count-mismatch",
    );
    const firstParsed = parsedRecords[0]!;
    for (const column of R10_MONTHLY_CSV_COLUMNS) {
      requireFact(
        column in firstParsed,
        `r10-operations-csv-missing-column:${column}`,
      );
    }

    for (let i = 0; i < parsedRecords.length; i += 1) {
      const parsed = parsedRecords[i]!;
      const sourceRow = jobRows[i]!;
      requireFact(
        parsed.periodMonth === sourceRow.periodMonth &&
          parsed.from === sourceRow.from &&
          parsed.to === sourceRow.to &&
          parsed.businessArea === sourceRow.businessArea &&
          parsed.serviceProductCode === sourceRow.serviceProductCode &&
          parsed.generatedAt === sourceRow.generatedAt &&
          parsed.complaintStatisticsAsOf ===
            sourceRow.complaintStatisticsAsOf &&
          parsed.lateArrivalThresholdMinutes ===
            String(sourceRow.lateArrivalThresholdMinutes) &&
          parsed.snapshotCoverageRate ===
            String(sourceRow.snapshotCoverageRate),
        `r10-operations-csv-parsed-identity:${i}`,
      );
      for (const countKey of COUNT_KEYS) {
        requireFact(
          parsed[countKey] === String(sourceRow[countKey]),
          `r10-operations-csv-parsed-${countKey}:${i}`,
        );
      }
      if (sourceRow.validSnapshotCount === 0) {
        requireFact(
          sourceRow.averageDispatchableVehicleCount === null &&
            parsed.averageDispatchableVehicleCount === "",
          `r10-operations-csv-null-average-cell-empty:${i}`,
        );
      } else {
        requireFact(
          parsed.averageDispatchableVehicleCount ===
            String(sourceRow.averageDispatchableVehicleCount),
          `r10-operations-csv-numeric-average-cell:${i}`,
        );
      }
      const parsedCategories = normalizeCategoryRecord(
        JSON.parse(text(parsed.complaintsByCategory || "{}")),
        `r10-operations-csv-parsed-categories:${i}`,
      );
      const expectedCategories = normalizeCategoryRecord(
        sourceRow.complaintsByCategory,
        `r10-operations-csv-source-categories:${i}`,
      );
      requireFact(
        sameCategoryRecord(parsedCategories, expectedCategories),
        `r10-operations-csv-categories-cell:${i}`,
      );
    }

    const ownCsvRows = parsedRecords.filter(
      (r) =>
        r.businessArea === ownDimension.businessArea &&
        r.serviceProductCode === ownDimension.serviceProductCode,
    );
    requireFact(
      ownCsvRows.length === 6 &&
        ownCsvRows.every((r, idx) => r.periodMonth === window.periods[idx]),
      "r10-operations-csv-own-dimension-six-months-present",
    );
    magicHeader = csvText.split(/\r?\n/, 1)[0]?.slice(0, 32) ?? "";
  } else {
    // PDF export carries the 6-month aggregate summary rows (drilldown and
    // monthlySummaries omitted).
    requireFact(
      jobRows.length === baselineSummaries.length,
      "r10-operations-pdf-summary-row-count-required",
    );
    for (let i = 0; i < jobRows.length; i += 1) {
      const row = jobRows[i]!;
      const expectedSummary = baselineSummaries[i]!;
      requireFact(
        !("drilldown" in row) && !("monthlySummaries" in row),
        `r10-operations-pdf-job-row-omits-nested-drilldown:${i}`,
      );
      for (const col of R10_SUMMARY_PDF_COLUMNS) {
        requireFact(
          col in row,
          `r10-operations-pdf-job-row-missing-column:${col}`,
        );
      }
      assertSameSummaryRowBusinessValues(
        expectedSummary,
        row,
        `r10-operations-pdf-job-row-${i}`,
        false,
      );
      verifyAverageZeroVsNull(row, `r10-operations-pdf-job-row-${i}`);
      const rowGen = text(row.generatedAt);
      const rowAsOf = text(row.complaintStatisticsAsOf);
      if (!generatedAt || rowGen > generatedAt) generatedAt = rowGen;
      if (!complaintStatisticsAsOf) {
        complaintStatisticsAsOf = rowAsOf;
      } else {
        requireFact(
          rowAsOf === complaintStatisticsAsOf,
          "r10-operations-pdf-single-generation-as-of",
        );
      }
    }

    const headerAscii = bytes.subarray(0, 5).toString("ascii");
    requireFact(
      headerAscii === "%PDF-",
      "r10-operations-pdf-magic-header-required",
    );
    magicHeader = headerAscii;
    const parsedPdf = await parsePdf(bytes);
    const expectedPdfBytes = await recordsToPdf(
      jobRows as unknown as Record<string, unknown>[],
      `six_month_operations_summary — ${jobId}`,
    );
    const expectedParsedPdf = await parsePdf(expectedPdfBytes);
    pageCount = parsedPdf.pages.length;
    requireFact(
      pageCount >= 1 &&
        pageCount === expectedParsedPdf.pages.length &&
        !parsedPdf.text.includes("No data.") &&
        parsedPdf.text === expectedParsedPdf.text,
      "r10-operations-pdf-rendered-text-mismatch",
    );
    const compactPdfText = parsedPdf.text.replace(/\s+/g, "");
    for (const token of [
      "six_month_operations_summary",
      jobId,
      window.canonicalFrom,
      window.canonicalTo,
      ownDimension.businessArea,
      ownDimension.serviceProductCode,
    ]) {
      requireFact(
        compactPdfText.includes(token),
        `r10-operations-pdf-missing-token:${token}`,
      );
    }
  }

  return Object.freeze({
    format,
    deliveryMode: "background-report-job",
    jobId,
    jobType: "six_month_operations_summary",
    jobStatus: "completed",
    artifactId,
    artifactType: "report",
    downloadUrl: expectedDownloadUrl,
    immutable: true,
    contentType: normalizedMime,
    contentDisposition: text(contentDisposition),
    fileName: expectedFileName,
    artifactPath: null,
    rawArtifactRetained: false,
    bytes: bytes.length,
    sha256: hash(bytes),
    expiresAt,
    manifestHash,
    generatedAt,
    complaintStatisticsAsOf,
    rowCount: jobRows.length,
    summaryDimensionCount: baselineSummaries.length,
    monthlyRowCount: baselineSummaries.length * 6,
    periods: window.periods,
    matchedBaselineBusinessValues: true,
    runtimeSha,
    contentSignature: Object.freeze({
      format,
      magicHeader,
      matchedExpectedRender: true,
      ...(pageCount === undefined ? {} : { pageCount }),
    }),
  });
}

function unwrapEnvelopeObject(bytes: Buffer, stage: string): ObjectData {
  let raw: unknown;
  try {
    raw = camelWire(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new JourneyFailure(`${stage}:invalid-json`);
  }
  const envelope = object(raw);
  requireFact(
    !("error" in envelope) &&
      (envelope.ok === undefined || envelope.ok === true),
    `${stage}:envelope-not-ok`,
  );
  return object(envelope.data);
}

function unwrapEnvelopeList(bytes: Buffer, stage: string): ObjectData[] {
  let raw: unknown;
  try {
    raw = camelWire(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new JourneyFailure(`${stage}:invalid-json`);
  }
  const envelope = object(raw);
  requireFact(
    !("error" in envelope) &&
      (envelope.ok === undefined || envelope.ok === true),
    `${stage}:envelope-not-ok`,
  );
  if (Array.isArray(envelope.data) && envelope.ok === true) {
    return records(envelope.data);
  }
  return records(object(envelope.data).items);
}

type CapturedR10Request = Readonly<{
  method: string;
  url: string;
  pathname: string;
  searchParams: URLSearchParams;
  requestBody: string | null;
}>;

type CapturedR10Exchange = CapturedR10Request &
  Readonly<{
    status: number;
    responseUrl: string;
    headers: Readonly<Record<string, string>>;
    runtimeSha: string;
    bytes: Buffer;
  }>;

async function waitForEnabled(locator: Locator, stage: string) {
  await locator.first().waitFor({ state: "visible", timeout: 15_000 });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await locator.first().isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new JourneyFailure(`${stage}:disabled`);
}

async function readDownloadBytes(
  download: Download,
  readFileFn: (path: string) => Promise<Buffer>,
): Promise<Buffer> {
  requireFact(
    (await download.failure()) === null,
    "r10-operations-json-browser-download-failed",
  );
  const filePath = await download.path();
  if (typeof filePath === "string" && filePath.trim().length > 0) {
    return readFileFn(filePath);
  }
  const stream = await download.createReadStream();
  requireFact(
    stream !== null,
    "r10-operations-json-browser-download-stream-required",
  );
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export type RunR10OperationsDownloadsParams = {
  context: BrowserContext;
  page: Page;
  opsOrigin: string;
  opsHeaders: (url: string) => Record<string, string>;
  role: R10VerifiedOpsRole;
  order: ObjectData;
  entrySlug: string;
  cases: readonly R10OwnCaseInput[];
  serviceCaseNo: string;
  closureMonth: string;
  r09From?: string;
  r09To?: string;
  readCase: (caseNo: string) => Promise<ComplaintCaseRecord>;
  readOrder: (orderId: string) => Promise<ObjectData>;
  readTimeline: (caseNo: string) => Promise<ComplaintTimelineEntry[]>;
  readFile?: (path: string) => Promise<Buffer>;
  definitionSha: string;
  runtimeSha: string;
  recoveryOnly: boolean;
  evidence: Evidence;
};

export async function runR10OperationsDownloads(
  params: RunR10OperationsDownloadsParams,
): Promise<R10OperationsDownloadsEvidence> {
  requireFact(
    !params.recoveryOnly,
    "r10-operations-recovery-only-must-not-run-full-journey-reports",
  );
  const {
    context,
    page,
    opsOrigin,
    opsHeaders,
    role,
    order,
    entrySlug,
    cases,
    serviceCaseNo,
    closureMonth,
    r09From,
    r09To,
    readCase,
    readOrder,
    readTimeline,
    readFile: readFileFn = (path: string) => readFile(path),
    definitionSha,
    runtimeSha,
    evidence,
  } = params;

  requireFact(
    /^[a-f0-9]{40}$/.test(definitionSha) && /^[a-f0-9]{40}$/.test(runtimeSha),
    "r10-operations-immutable-shas-required",
  );

  // Verify the active browser Ops session and scopes on the existing page.
  assertR10VerifiedOpsRole(
    await readBrowserOpsSession(page, runtimeSha),
    role,
    ["complaints:read", "reports:read", "reports:write"],
  );

  const ownOrderId = text(order.orderId, "r10-operations-own-order-id");
  const tenantId = text(order.tenantId, "r10-operations-own-tenant-id");
  const partnerId = text(order.partnerId, "r10-operations-own-partner-id");
  const serviceProductCode = resolveDailyServiceProductCode(order);
  const orderCreatedAt = text(
    order.createdAt,
    "r10-operations-own-order-created-at",
  );
  const reservationWindowStart =
    typeof order.reservationWindowStart === "string" &&
    order.reservationWindowStart.trim().length > 0
      ? order.reservationWindowStart.trim()
      : null;
  requireFact(
    order.status === "completed" &&
      order.partnerEntrySlug === entrySlug &&
      order.serviceBucket === "business_dispatch" &&
      serviceProductCode === "enterprise_dispatch",
    "r10-operations-own-completed-business-order-binding",
  );

  // Read canonical case + timeline + order facts for the 7 controlled cases.
  const orderCreatedAtById = new Map<string, string>([
    [ownOrderId, orderCreatedAt],
  ]);
  for (const distinctOrderId of new Set(cases.map((c) => c.orderId))) {
    if (orderCreatedAtById.has(distinctOrderId)) continue;
    const caseOrder = await readOrder(distinctOrderId);
    requireFact(
      caseOrder.orderId === distinctOrderId &&
        caseOrder.serviceBucket === "business_dispatch" &&
        caseOrder.businessDispatchSubtype === "enterprise_dispatch",
      "r10-operations-own-case-order-product-binding",
    );
    orderCreatedAtById.set(
      distinctOrderId,
      text(caseOrder.createdAt, "r10-operations-case-order-created-at"),
    );
  }

  const caseFacts: R10ControlledCaseSourceFact[] = [];
  for (const ownCase of cases) {
    const record = await readCase(ownCase.caseNo);
    const timeline = await readTimeline(ownCase.caseNo);
    requireFact(
      record.caseNo === ownCase.caseNo &&
        record.relatedOrderId === ownCase.orderId &&
        Number.isFinite(Date.parse(record.createdAt)) &&
        Number.isFinite(Date.parse(record.slaDueAt)) &&
        timeline.some(
          (entry) =>
            entry.caseNo === ownCase.caseNo && entry.action === "case_created",
        ),
      "r10-operations-canonical-case-and-timeline-binding",
    );
    const closures = timeline.filter(
      (entry) =>
        entry.caseNo === ownCase.caseNo && entry.action === "case_closed",
    );
    const closedAt = closures.at(-1)?.createdAt ?? null;
    if (ownCase.caseNo === serviceCaseNo) {
      requireFact(
        record.status === "closed" &&
          closures.length === 1 &&
          closedAt !== null &&
          toTaipeiYearMonth(closedAt) === closureMonth,
        "r10-operations-closed-service-case-canonical-binding",
      );
    }
    caseFacts.push(
      Object.freeze({
        caseNo: record.caseNo,
        orderId: record.relatedOrderId,
        source: ownCase.source,
        category: text(record.category),
        status: text(record.status),
        createdAt: text(record.createdAt),
        slaDueAt: text(record.slaDueAt),
        closedAt,
        orderCreatedAt: text(orderCreatedAtById.get(ownCase.orderId)),
      }),
    );
  }

  const allObservedMonths = [
    toTaipeiYearMonth(reservationWindowStart ?? orderCreatedAt),
    closureMonth,
    ...caseFacts.map((c) => toTaipeiYearMonth(c.createdAt)),
    ...(r09To ? [r09To] : []),
  ].sort();
  const anchorToMonth = allObservedMonths.at(-1)!;
  const window = resolveSixMonthOperationsWindow(anchorToMonth, r09From);

  const preExistingPages = new Set<Page>(context.pages());
  preExistingPages.add(page);

  type PendingWaiter = {
    predicate: (request: CapturedR10Request) => boolean;
    resolve: (exchange: CapturedR10Exchange) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: PendingWaiter[] = [];
  const handledRequests = new WeakSet<object>();
  let armedJobPostFormat: R10OperationsJobFormat | null = null;
  let latchedRouteError: JourneyFailure | null = null;

  const assertNoRouteError = () => {
    if (latchedRouteError) throw latchedRouteError;
  };

  const waitForOpsExchange = (
    predicate: (request: CapturedR10Request) => boolean,
    stage: string,
    timeoutMs = 60_000,
  ): Promise<CapturedR10Exchange> => {
    let resolveFn!: (exchange: CapturedR10Exchange) => void;
    let rejectFn!: (error: unknown) => void;
    const promise = new Promise<CapturedR10Exchange>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    void promise.catch(() => undefined);
    const timer = setTimeout(() => {
      const idx = waiters.findIndex((item) => item.timer === timer);
      if (idx >= 0) waiters.splice(idx, 1);
      rejectFn(new JourneyFailure(`${stage}:timeout`));
    }, timeoutMs);
    waiters.push({
      predicate,
      resolve: (exchange) => {
        clearTimeout(timer);
        resolveFn(exchange);
      },
      reject: (error) => {
        clearTimeout(timer);
        rejectFn(error);
      },
      timer,
    });
    return promise;
  };

  const routeHandler = async (route: Route) => {
    const request = route.request();
    if (handledRequests.has(request)) {
      await route.fallback().catch(() => undefined);
      return;
    }
    handledRequests.add(request);
    const url = request.url();
    const method = request.method().toUpperCase();
    const requestBody = request.postData();
    const parsedUrl = new URL(url);
    const requestIdentity: CapturedR10Request = {
      method,
      url,
      pathname: parsedUrl.pathname,
      searchParams: parsedUrl.searchParams,
      requestBody,
    };

    try {
      requireFact(
        parsedUrl.origin === opsOrigin &&
          !parsedUrl.username &&
          !parsedUrl.password,
        "r10-operations-ops-origin-isolation",
      );

      // Guard against any unowned or unexpected UI mutation during R10.
      if (method !== "GET" && method !== "HEAD") {
        requireFact(
          method === "POST" &&
            parsedUrl.pathname === "/control-plane-proxy/reports/jobs" &&
            armedJobPostFormat !== null,
          "r10-operations-unexpected-ui-mutation-blocked",
        );
        const expectedFormat = armedJobPostFormat;
        armedJobPostFormat = null;
        let parsedBody: ObjectData;
        try {
          parsedBody = object(JSON.parse(text(requestBody)));
        } catch {
          throw new JourneyFailure("r10-operations-invalid-job-post-json");
        }
        const filters = object(parsedBody.filters);
        requireFact(
          parsedBody.jobType === "six_month_operations_summary" &&
            parsedBody.format === expectedFormat &&
            filters.from === window.from &&
            filters.to === window.to &&
            Object.keys(filters).every((k) => k === "from" || k === "to"),
          `r10-operations-create-job-${expectedFormat}-command-binding`,
        );
      }

      const authHeaders = opsHeaders(url);
      const response = await route.fetch({
        headers: {
          ...request.headers(),
          ...authHeaders,
        },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 60_000,
      });
      const bytes = await response.body();
      const status = response.status();
      const responseUrl = response.url();
      const headers = response.headers();
      const servedSha = headers["x-drts-candidate-sha"] ?? "";

      const isDocumentOrProxy =
        parsedUrl.pathname === "/reports" ||
        parsedUrl.pathname.startsWith("/control-plane-proxy/");
      if (isDocumentOrProxy) {
        requireFact(
          servedSha === runtimeSha,
          "r10-operations-ops-runtime-sha-mismatch",
        );
      }

      const exchange: CapturedR10Exchange = Object.freeze({
        method,
        url,
        pathname: parsedUrl.pathname,
        searchParams: parsedUrl.searchParams,
        requestBody,
        status,
        responseUrl,
        headers: Object.freeze({ ...headers }),
        runtimeSha: servedSha,
        bytes,
      });

      await route.fulfill({ response, body: bytes }).catch(() => undefined);

      for (let i = 0; i < waiters.length; i += 1) {
        const waiter = waiters[i]!;
        if (waiter.predicate(exchange)) {
          waiters.splice(i, 1);
          waiter.resolve(exchange);
          break;
        }
      }
    } catch (error) {
      const failure =
        error instanceof JourneyFailure
          ? error
          : new JourneyFailure("r10-operations-route-exchange-failed");
      if (!latchedRouteError) {
        latchedRouteError = failure;
      }
      evidence.failure(failure);
      const index = waiters.findIndex((waiter) =>
        waiter.predicate(requestIdentity),
      );
      if (index >= 0) waiters.splice(index, 1)[0]!.reject(failure);
      await route.abort("failed").catch(() => undefined);
    }
  };

  await page.route(`${opsOrigin}/**`, routeHandler);
  await context.route(`${opsOrigin}/**`, routeHandler);

  try {
    const currentUrl = new URL(page.url());
    if (currentUrl.origin !== opsOrigin || currentUrl.pathname !== "/reports") {
      const openPagePromise = waitForOpsExchange(
        (ex) => ex.method === "GET" && ex.pathname === "/reports",
        "r10-operations-open-reports-page",
      );
      await page.goto(`${opsOrigin}/reports`);
      const opened = await openPagePromise;
      requireFact(
        opened.status === 200 && opened.runtimeSha === runtimeSha,
        "r10-operations-open-reports-page-status",
      );
    }
    assertNoRouteError();

    const operationalTab = page.getByRole("button", {
      name: /^(營運報表|Operational)$/,
    });
    await waitForEnabled(operationalTab, "r10-operations-operational-tab");
    await operationalTab.click();
    assertNoRouteError();

    const reportTypeSelect = page.locator("select").filter({
      has: page.locator('option[value="six_month_operations_summary"]'),
    });
    await reportTypeSelect
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    await reportTypeSelect.first().selectOption("six_month_operations_summary");
    assertNoRouteError();

    const monthInputs = page.locator('input[type="month"]');
    requireFact(
      (await monthInputs.count()) === 2,
      "r10-operations-two-month-inputs-required",
    );
    await monthInputs.nth(0).fill(window.from);
    await monthInputs.nth(1).fill(window.to);

    const businessAreaInput = page.locator('input[placeholder="taipei"]');
    if ((await businessAreaInput.count()) > 0) {
      await businessAreaInput.first().fill("");
    }
    const serviceProductInput = page.locator(
      'input[placeholder="wheelchair_van"]',
    );
    if ((await serviceProductInput.count()) > 0) {
      await serviceProductInput.first().fill("");
    }
    assertNoRouteError();

    const assertSummaryPreviewExchange = (
      exchange: CapturedR10Exchange,
      stage: string,
    ) => {
      requireFact(
        exchange.status === 200 &&
          exchange.runtimeSha === runtimeSha &&
          exchange.searchParams.get("from") === window.from &&
          exchange.searchParams.get("to") === window.to &&
          exchange.searchParams.get("businessArea") === null &&
          exchange.searchParams.get("serviceProductCode") === null,
        `${stage}-query-and-runtime-binding`,
      );
    };

    const loadPreviewBtn = page.getByRole("button", {
      name: /^(載入預覽|Load preview)$/,
    });
    await waitForEnabled(loadPreviewBtn, "r10-operations-load-preview-button");

    // 1. Initial six-month preview via existing Ops UI button.
    const initialPreviewPromise = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname ===
          "/control-plane-proxy/reports/operations-summary/preview",
      "r10-operations-initial-preview-get",
    );
    await loadPreviewBtn.click();
    const initialPreviewExchange = await initialPreviewPromise;
    assertNoRouteError();
    assertSummaryPreviewExchange(
      initialPreviewExchange,
      "r10-operations-initial-preview",
    );
    const initialPreviewRows = unwrapEnvelopeList(
      initialPreviewExchange.bytes,
      "r10-operations-initial-preview",
    );
    const validatedInitial = validateSixMonthOperationsPreview({
      rawRows: initialPreviewRows,
      window,
      ownOrder: {
        orderId: ownOrderId,
        tenantId,
        partnerId,
        entrySlug,
        serviceProductCode,
        createdAt: orderCreatedAt,
        reservationWindowStart,
      },
      ownCases: caseFacts,
      serviceCaseNo,
      closureMonth,
    });

    // Verify rendered Ops UI card, 6 monthly rows and null ("未提供" / "Not provided") vs numeric display.
    const ownCardSubtitle = `${validatedInitial.ownDimension.businessArea} · ${validatedInitial.ownDimension.serviceProductCode}`;
    const ownCard = page
      .getByText(ownCardSubtitle, { exact: true })
      .locator("xpath=ancestor::section[1]");
    await ownCard.first().waitFor({ state: "visible", timeout: 15_000 });
    requireFact(
      (await ownCard.count()) === 1,
      "r10-operations-ui-own-dimension-card-unique",
    );
    const ownCardText = await ownCard.first().innerText();
    for (const token of [
      validatedInitial.ownDimension.businessArea,
      validatedInitial.ownDimension.serviceProductCode,
      window.canonicalFrom,
      window.canonicalTo,
      ...window.periods,
    ]) {
      requireFact(
        ownCardText.includes(token),
        `r10-operations-ui-own-card-missing-token:${token}`,
      );
    }

    let uiNotProvidedVerified = false;
    if (validatedInitial.zeroVsNull.hasNullAverageSample) {
      const notProvidedLocator = page.getByText(/^(未提供|Not provided)$/);
      await notProvidedLocator
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      requireFact(
        (await notProvidedLocator.count()) >= 1,
        "r10-operations-ui-not-provided-visible-for-null-average",
      );
      uiNotProvidedVerified = true;
    }

    evidence.record({
      stage: "r10-operations-six-month-preview-verified",
      orderId: ownOrderId,
      caseNo: serviceCaseNo,
      status: initialPreviewExchange.status,
      result: "observed",
    });

    // 2. Fixed-source rerun via the same Ops UI "Load preview" button.
    await waitForEnabled(
      loadPreviewBtn,
      "r10-operations-rerun-load-preview-button",
    );
    const rerunPreviewPromise = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname ===
          "/control-plane-proxy/reports/operations-summary/preview",
      "r10-operations-rerun-preview-get",
    );
    await loadPreviewBtn.click();
    const rerunPreviewExchange = await rerunPreviewPromise;
    assertNoRouteError();
    assertSummaryPreviewExchange(
      rerunPreviewExchange,
      "r10-operations-rerun-preview",
    );
    const rerunPreviewRows = unwrapEnvelopeList(
      rerunPreviewExchange.bytes,
      "r10-operations-rerun-preview",
    );
    const validatedRerun = validateSixMonthOperationsPreview({
      rawRows: rerunPreviewRows,
      window,
      ownOrder: {
        orderId: ownOrderId,
        tenantId,
        partnerId,
        entrySlug,
        serviceProductCode,
        createdAt: orderCreatedAt,
        reservationWindowStart,
      },
      ownCases: caseFacts,
      serviceCaseNo,
      closureMonth,
    });
    const rerunComparison = compareSixMonthSummaryGenerations(
      initialPreviewRows,
      rerunPreviewRows,
      "r10-operations-fixed-source-rerun",
    );
    evidence.record({
      stage: "r10-operations-fixed-source-rerun-verified",
      orderId: ownOrderId,
      caseNo: serviceCaseNo,
      status: rerunPreviewExchange.status,
      result: "observed",
    });

    // 3. UI JSON Blob download via original format selector + "Export job" button.
    const formatSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="json"]') });
    const exportJobBtn = page.getByRole("button", {
      name: /^(匯出工作|Export job)$/,
    });
    await waitForEnabled(exportJobBtn, "r10-operations-export-button-json");
    await formatSelect.first().selectOption("json");
    assertNoRouteError();

    const jsonPreviewPromise = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname ===
          "/control-plane-proxy/reports/operations-summary/preview",
      "r10-operations-json-export-preview-get",
    );
    const jsonDownloadPromise = page.waitForEvent("download", {
      timeout: 60_000,
    });
    void jsonDownloadPromise.catch(() => undefined);

    await exportJobBtn.click();
    const [jsonPreviewExchange, jsonDownload] = await Promise.all([
      jsonPreviewPromise,
      jsonDownloadPromise,
    ]);
    assertNoRouteError();
    assertSummaryPreviewExchange(
      jsonPreviewExchange,
      "r10-operations-json-export-preview",
    );
    const jsonPreviewRows = unwrapEnvelopeList(
      jsonPreviewExchange.bytes,
      "r10-operations-json-export-preview",
    );
    const jsonNotice = page.getByText(/已匯出 .* JSON|Exported .* JSON/);
    await jsonNotice.first().waitFor({ state: "visible", timeout: 15_000 });

    const jsonBytes = await readDownloadBytes(jsonDownload, readFileFn);
    const jsonSummary = validateR10JsonBlobDownload({
      bytes: jsonBytes,
      fileName: jsonDownload.suggestedFilename(),
      downloadUrl: jsonDownload.url(),
      window,
      exportPreviewRows: jsonPreviewRows,
      baselinePreviewRows: initialPreviewRows,
      runtimeSha,
    });
    evidence.record({
      stage: "r10-operations-download-json-blob-verified",
      orderId: ownOrderId,
      caseNo: serviceCaseNo,
      bytes: jsonSummary.bytes,
      sha256: jsonSummary.sha256,
      status: jsonPreviewExchange.status,
      result: "observed",
    });

    // 4. UI CSV & PDF background report job creation via original "Export job" button.
    const acceptedJobs = {} as Record<R10OperationsJobFormat, string>;
    for (const format of R10_OPERATIONS_JOB_FORMATS) {
      await waitForEnabled(
        exportJobBtn,
        `r10-operations-export-button-${format}`,
      );
      await formatSelect.first().selectOption(format);
      assertNoRouteError();

      const createJobPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "POST" &&
          ex.pathname === "/control-plane-proxy/reports/jobs",
        `r10-operations-create-job-${format}`,
      );
      armedJobPostFormat = format;
      await exportJobBtn.click();
      const createJobExchange = await createJobPromise;
      assertNoRouteError();
      requireFact(
        (createJobExchange.status === 200 ||
          createJobExchange.status === 201) &&
          createJobExchange.runtimeSha === runtimeSha,
        `r10-operations-create-job-${format}-status`,
      );
      const acceptedData = unwrapEnvelopeObject(
        createJobExchange.bytes,
        `r10-operations-create-job-${format}`,
      );
      const jobId = text(
        acceptedData.jobId,
        `r10-operations-create-job-${format}-job-id`,
      );
      await page
        .getByText(jobId, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      acceptedJobs[format] = jobId;
      evidence.record({
        stage: `r10-operations-job-${format}-accepted`,
        orderId: ownOrderId,
        caseNo: serviceCaseNo,
        objectKey: jobId,
        status: createJobExchange.status,
        result: "observed",
      });
    }

    requireFact(
      acceptedJobs.csv !== acceptedJobs.pdf,
      "r10-operations-distinct-csv-pdf-job-ids-required",
    );

    // 5. Switch to /reports jobs list and wait for CSV and PDF jobs to complete.
    let listedJobs: ObjectData[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reloadPagePromise = waitForOpsExchange(
        (ex) => ex.method === "GET" && ex.pathname === "/reports",
        "r10-operations-reload-reports-page",
      );
      const reloadJobsPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === "/control-plane-proxy/reports/jobs",
        "r10-operations-reload-jobs-list",
      );
      await page.goto(`${opsOrigin}/reports`);
      const reloadPageExchange = await reloadPagePromise;
      assertNoRouteError();
      requireFact(
        reloadPageExchange.status === 200 &&
          reloadPageExchange.runtimeSha === runtimeSha,
        "r10-operations-reload-reports-page-status",
      );
      const reloadJobsExchange = await reloadJobsPromise;
      assertNoRouteError();
      requireFact(
        reloadJobsExchange.status === 200 &&
          reloadJobsExchange.runtimeSha === runtimeSha,
        "r10-operations-reload-jobs-status",
      );
      listedJobs = unwrapEnvelopeList(
        reloadJobsExchange.bytes,
        "r10-operations-reload-jobs",
      );
      const allCompleted = R10_OPERATIONS_JOB_FORMATS.every((format) => {
        const jobId = acceptedJobs[format];
        const found = listedJobs.find((item) => item.jobId === jobId);
        requireFact(
          Boolean(found),
          `r10-operations-listed-job-${format}-missing`,
        );
        requireFact(
          found!.status !== "failed" && found!.status !== "expired",
          `r10-operations-listed-job-${format}-terminal-failure`,
        );
        return found!.status === "completed";
      });
      if (allCompleted) break;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }

    // 6. Click the UI "Download" button for CSV and PDF and validate artifacts.
    const jobDownloads = {} as Record<
      R10OperationsJobFormat,
      R10JobExportArtifactSummary
    >;
    for (const format of R10_OPERATIONS_JOB_FORMATS) {
      const jobId = acceptedJobs[format];
      const listedJob = listedJobs.find((item) => item.jobId === jobId);
      requireFact(
        Boolean(listedJob) && listedJob!.status === "completed",
        `r10-operations-job-${format}-not-completed`,
      );

      const jobRow = page.locator("tbody tr").filter({ hasText: jobId });
      await jobRow.first().waitFor({ state: "visible", timeout: 15_000 });
      requireFact(
        (await jobRow.count()) === 1,
        `r10-operations-ui-job-row-${format}-unique`,
      );
      const rowText = await jobRow.first().innerText();
      requireFact(
        rowText.includes(jobId) &&
          rowText.includes(format.toUpperCase()) &&
          rowText.includes(window.from) &&
          rowText.includes(window.to),
        `r10-operations-ui-job-row-${format}-text-binding`,
      );

      const downloadBtn = jobRow
        .first()
        .getByRole("button", { name: /^(下載|Download)$/ });
      await waitForEnabled(
        downloadBtn,
        `r10-operations-ui-download-button-${format}`,
      );

      const detailPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === opsReportJobDetailPathname(jobId),
        `r10-operations-job-detail-${format}`,
      );
      const artifactPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === opsReportJobArtifactPathname(jobId),
        `r10-operations-artifact-download-${format}`,
      );

      await downloadBtn.click();
      const detailExchange = await detailPromise;
      assertNoRouteError();
      const artifactExchange = await artifactPromise;
      assertNoRouteError();

      for (const extraPage of context.pages()) {
        if (!preExistingPages.has(extraPage)) {
          await extraPage.close().catch(() => undefined);
        }
      }

      const jobDetail = unwrapEnvelopeObject(
        detailExchange.bytes,
        `r10-operations-job-detail-${format}`,
      );
      const summary = await validateR10JobArtifactDownload({
        format,
        jobId,
        jobDetail,
        detailStatus: detailExchange.status,
        detailResponseSha: detailExchange.runtimeSha,
        artifactStatus: artifactExchange.status,
        artifactResponseSha: artifactExchange.runtimeSha,
        contentType: artifactExchange.headers["content-type"],
        contentDisposition: artifactExchange.headers["content-disposition"],
        bytes: artifactExchange.bytes,
        window,
        baselinePreviewRows: initialPreviewRows,
        ownDimension: validatedInitial.ownDimension,
        runtimeSha,
      });
      jobDownloads[format] = summary;

      evidence.record({
        stage: `r10-operations-download-${format}-verified`,
        orderId: ownOrderId,
        caseNo: serviceCaseNo,
        objectKey: jobId,
        bytes: summary.bytes,
        sha256: summary.sha256,
        status: artifactExchange.status,
        result: "observed",
      });
    }

    assertNoRouteError();

    const generationTimestamps: readonly R10GenerationTimestampEntry[] =
      Object.freeze([
        Object.freeze({
          stage: "initial-preview",
          runtimeSha,
          generatedAt: validatedInitial.generatedAt,
          complaintStatisticsAsOf: validatedInitial.complaintStatisticsAsOf,
        }),
        Object.freeze({
          stage: "fixed-source-rerun-preview",
          runtimeSha,
          generatedAt: validatedRerun.generatedAt,
          complaintStatisticsAsOf: validatedRerun.complaintStatisticsAsOf,
        }),
        Object.freeze({
          stage: "json-export-preview",
          runtimeSha,
          generatedAt: jsonSummary.generatedAt,
          complaintStatisticsAsOf: jsonSummary.complaintStatisticsAsOf,
          exportedAt: jsonSummary.exportedAt,
        }),
        Object.freeze({
          stage: "csv-report-job",
          runtimeSha,
          generatedAt: jobDownloads.csv.generatedAt,
          complaintStatisticsAsOf: jobDownloads.csv.complaintStatisticsAsOf,
        }),
        Object.freeze({
          stage: "pdf-report-job",
          runtimeSha,
          generatedAt: jobDownloads.pdf.generatedAt,
          complaintStatisticsAsOf: jobDownloads.pdf.complaintStatisticsAsOf,
        }),
      ]);

    return Object.freeze({
      definitionSha,
      runtimeSha,
      orderId: ownOrderId,
      tenantId,
      partnerId,
      entrySlug,
      serviceCaseNo,
      ownDimension: validatedInitial.ownDimension,
      window,
      preview: Object.freeze({
        dimensionCount: validatedInitial.summaries.length,
        monthlyRowCount: validatedInitial.monthlyRows.length,
        periods: window.periods,
        generatedAt: validatedInitial.generatedAt,
        complaintStatisticsAsOf: validatedInitial.complaintStatisticsAsOf,
        ownCompletedOrderVerified: true,
        ownSevenCasesVerified: true,
        uiCardsAndMonthlyTableVerified: true,
        uiNotProvidedVerified,
        dimensions: validatedInitial.dimensions,
        runtimeSha,
      }),
      fixedSourceRerun: Object.freeze({
        sameQuery: Object.freeze({ from: window.from, to: window.to }),
        sameRuntimeSha: true,
        initialGeneratedAt: rerunComparison.baselineGeneratedAt,
        rerunGeneratedAt: rerunComparison.candidateGeneratedAt,
        initialComplaintStatisticsAsOf:
          rerunComparison.baselineComplaintStatisticsAsOf,
        rerunComplaintStatisticsAsOf:
          rerunComparison.candidateComplaintStatisticsAsOf,
        generatedAtMintedPerRequest:
          rerunComparison.generatedAtMintedPerRequest,
        businessValuesMatched: true,
        dimensionCount: validatedRerun.summaries.length,
        monthlyRowCount: validatedRerun.monthlyRows.length,
      }),
      zeroVsNull: validatedInitial.zeroVsNull,
      crossMonthComplaints: validatedInitial.crossMonthComplaints,
      generationTimestamps,
      downloads: Object.freeze({
        json: jsonSummary,
        csv: jobDownloads.csv,
        pdf: jobDownloads.pdf,
      }),
      mixedTenantDetailProtection:
        "ram-validated-summary-only-raw-mixed-tenant-detail-omitted",
    });
  } finally {
    armedJobPostFormat = null;
    for (const waiter of waiters.splice(0, waiters.length)) {
      clearTimeout(waiter.timer);
    }
    for (const extraPage of context.pages()) {
      if (!preExistingPages.has(extraPage)) {
        await extraPage.close().catch(() => undefined);
      }
    }
    await page.unroute(`${opsOrigin}/**`, routeHandler).catch(() => undefined);
    await context
      .unroute(`${opsOrigin}/**`, routeHandler)
      .catch(() => undefined);
  }
}
