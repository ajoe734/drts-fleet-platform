import { mkdir, writeFile } from "node:fs/promises";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import ExcelJS from "exceljs";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import { recordsToPdf } from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import { displayOrderNo } from "../../../apps/referral-embed-web/lib/order-display";
import { parsePdf } from "../../unit/billing-pdf-chinese-printable-content-20261016/pdf-parser";
import {
  probeOperationalDocumentRoleAccess,
  verifyOperationalRoleSession,
} from "../operational-document-upload";
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

export const DAILY_REPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type DailyReportFormat = (typeof DAILY_REPORT_FORMATS)[number];

// Shared by the managed FULL writer and its hosted upload path regression.
// Only these owned cases have public custody; private siblings stay excluded.
export function ownedSupplementalArtifactPaths(directory: string) {
  const root = `${directory}/TEN03-06`;
  return {
    custody: `${directory}/TEN03-06-custody.json`,
    bookingJournals: {
      "reservation-1": `${root}/reservation-1/booking-write-journal.json`,
      "reservation-2": `${root}/reservation-2/booking-write-journal.json`,
      redispatched: `${root}/redispatched/booking-write-journal.json`,
    },
    reportDirectories: {
      "C1-cancelled-null": `${root}/C1-cancelled-null`,
      "reservation-1": `${root}/reservation-1`,
      "reservation-2": `${root}/reservation-2`,
      "reservation-1-after-both": `${root}/reservation-1-after-both`,
      redispatched: `${root}/redispatched`,
    },
  } as const;
}

export const DAILY_REPORT_MIME_TYPES: Readonly<
  Record<DailyReportFormat, string>
> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export type DailyReportProvenanceQualification =
  | "all-rows-controlled-synthetic"
  | "own-row-verified-unowned-siblings-present-raw-retention-skipped";

export type ExpectedDailyDispatchRecord = Readonly<{
  orderId: string;
  orderNo: string;
  serviceDate: string;
  orderSource: string;
  tenantId: string;
  partnerId: string;
  serviceProductCode: string;
  requestedAt: string;
  reservationTime: string | null;
  pickupAddressSnapshot: string;
  dropoffAddressSnapshot: string;
  finalDriverId: string;
  finalVehicleId: string;
  finalPlateNo: string;
  arrivedPickupAt: string;
  tripStartedAt: string;
  tripCompletedAt: string;
  finalStatus: "completed";
}>;

// These cases do not relax the original completed/complaint positive control.
export type SupplementalDailyDispatchRecord = Readonly<
  Omit<
    ExpectedDailyDispatchRecord,
    | "finalDriverId"
    | "finalVehicleId"
    | "finalPlateNo"
    | "arrivedPickupAt"
    | "tripStartedAt"
    | "tripCompletedAt"
    | "finalStatus"
  > & {
    caseKind: "cancelled-unassigned" | "redispatched";
    finalDriverId: string | null;
    finalVehicleId: string | null;
    finalPlateNo: string | null;
    arrivedPickupAt: string | null;
    tripStartedAt: string | null;
    tripCompletedAt: string | null;
    finalStatus: "cancelled" | "completed";
    redispatchCount: number;
    cancellationReason: string | null;
  }
>;
type DailyRowExpectation =
  | ExpectedDailyDispatchRecord
  | SupplementalDailyDispatchRecord;

/** Bounded source facts only: this does not assert durable global task/trace absence. */
export function resolveExpectedCancelledDailyDispatchRecord(
  order: ObjectData,
  journal: {
    state: string;
    orderId?: string;
    quoteId: string;
    entrySlug: string;
    body: string;
    bodySha256: string;
  },
  own: { entrySlug: string; pickupAddress: string; dropoffAddress: string },
): SupplementalDailyDispatchRecord {
  const command = object(JSON.parse(journal.body));
  requireFact(
    journal.state === "acknowledged" &&
      journal.orderId === order.orderId &&
      journal.entrySlug === own.entrySlug &&
      order.partnerEntrySlug === own.entrySlug &&
      command.entrySlug === own.entrySlug &&
      command.quoteId === journal.quoteId &&
      hash(Buffer.from(journal.body)) === journal.bodySha256,
    "cancelled-report-original-owned-journal-binding",
  );
  requireFact(
    order.status === "cancelled" &&
      typeof order.cancelledAt === "string" &&
      Number.isFinite(Date.parse(order.cancelledAt)) &&
      order.assignedDriverId == null &&
      order.assignedVehicleId == null &&
      order.tripCompletion == null,
    "cancelled-report-canonical-terminal-unassigned-source",
  );
  requireFact(
    object(order.pickup).address === own.pickupAddress &&
      object(order.dropoff).address === own.dropoffAddress,
    "cancelled-report-original-address-binding",
  );
  const requestedAt = text(order.createdAt);
  const reservationTime =
    order.reservationWindowStart == null
      ? null
      : text(order.reservationWindowStart);
  return Object.freeze({
    caseKind: "cancelled-unassigned",
    orderId: text(order.orderId),
    orderNo: text(order.orderNo),
    serviceDate: toTaipeiServiceDate(reservationTime ?? requestedAt),
    orderSource: normalizeDailyOrderSource(text(order.orderSource)),
    tenantId: text(order.tenantId),
    partnerId: text(order.partnerId),
    serviceProductCode: resolveDailyServiceProductCode(order),
    requestedAt,
    reservationTime,
    pickupAddressSnapshot: own.pickupAddress,
    dropoffAddressSnapshot: own.dropoffAddress,
    finalDriverId: null,
    finalVehicleId: null,
    finalPlateNo: null,
    arrivedPickupAt: null,
    tripStartedAt: null,
    tripCompletedAt: null,
    finalStatus: "cancelled",
    redispatchCount: 0,
    cancellationReason:
      order.cancelReason == null ? null : text(order.cancelReason),
  });
}

export type DailyReportFilters = Readonly<{
  serviceDateFrom: string;
  serviceDateTo: string;
  orderSource: string;
  tenantId: string;
  partnerId: string;
  serviceProductCode: string;
  finalStatus: "completed" | "cancelled";
}>;

export type DailyReportDownloadArtifactSummary = Readonly<{
  format: DailyReportFormat;
  jobId: string;
  jobType: "daily_dispatch_record";
  jobStatus: "completed";
  artifactId: string;
  artifactType: "report";
  downloadUrl: string;
  immutable: true;
  contentType: string;
  contentDisposition: string;
  fileName: string;
  artifactPath: string | null;
  rawArtifactRetained: boolean;
  bytes: number;
  sha256: string;
  expiresAt: string;
  manifestHash: string;
  rowCount: number;
  controlledRowCount: number;
  unverifiedSiblingRowCount: number;
  ownOrderPresent: true;
  syntheticProvenanceVerified: boolean;
  provenanceQualification: DailyReportProvenanceQualification;
  runtimeSha: string;
  contentSignature: Readonly<{
    format: DailyReportFormat;
    magicHeader: string;
    matchedExpectedRender: true;
    worksheetName?: string;
    pageCount?: number;
  }>;
}>;

export type DailyReportDownloadsEvidence = Readonly<{
  definitionSha: string;
  runtimeSha: string;
  orderId: string;
  orderNo: string;
  serviceDate: string;
  filters: DailyReportFilters;
  preview: Readonly<{
    rebuilt: true;
    rebuildCount: number;
    rebuildGeneratedAt: string;
    rowCount: number;
    controlledRowCount: number;
    unverifiedSiblingRowCount: number;
    ownOrderRowVerified: true;
    syntheticProvenanceVerified: boolean;
    provenanceQualification: DailyReportProvenanceQualification;
    generatedAt: string;
    finalDriverId: string | null;
    finalVehicleId: string | null;
    finalPlateNo: string | null;
    arrivedPickupAt: string | null;
    tripStartedAt: string | null;
    tripCompletedAt: string | null;
    finalStatus: "completed" | "cancelled";
    complaintCount: number;
    runtimeSha: string;
  }>;
  downloads: Readonly<{
    csv: DailyReportDownloadArtifactSummary;
    xlsx: DailyReportDownloadArtifactSummary;
    pdf: DailyReportDownloadArtifactSummary;
  }>;
  emptyDay: Readonly<{
    serviceDate: string;
    filters: DailyReportFilters;
    sourceBefore: EmptyDaySourceControl;
    sourceAfter: EmptyDaySourceControl;
    previewBefore: 0;
    rebuiltCount: 0;
    rebuildGeneratedAt: string;
    previewAfter: 0;
    restoredPositiveRow: true;
    downloads: Readonly<
      Record<DailyReportFormat, EmptyDailyReportArtifactSummary>
    >;
  }>;
  // Main path only (original R12-10); supplemental cases omit this field.
  nonReportRoleDenial?: NonReportRoleDownloadDenialEvidence;
  // Main path only (original R12-08); supplemental cases omit this field.
  rebuildFailureRecovery?: RebuildFailureRecoveryEvidence;
}>;

/** Original R12-08 (save failure then recovery). The failure is an explicit
 * browser-network simulation of the existing reporting envelope; it is never
 * evidence of an actual backend/PG outage. Only the retry is real.
 */
export type RebuildFailureRecoveryEvidence = Readonly<{
  originalCase: "R12-08";
  simulation: true;
  faultLayer: "browser-network-interception";
  actualBackendFaultVerified: false;
  filters: DailyReportFilters;
  simulatedFailure: Readonly<{
    method: "POST";
    route: "daily-dispatch-rebuild";
    status: 503;
    code: "REPORT_REBUILD_FAILED";
    hitCount: 1;
    forwardCount: 0;
    requestPayloadSha256: string;
    interceptionRemoved: true;
  }>;
  errorUi: Readonly<{
    errorBannerVisible: true;
    errorCodeVisible: true;
    successNoticeCount: 0;
    retryEnabled: true;
  }>;
  realRetry: Readonly<{
    method: "POST";
    route: "daily-dispatch-rebuild";
    status: number;
    rebuiltCount: number;
    generatedAt: string;
    requestPayloadSha256: string;
    samePayloadAsSimulated: true;
    runtimeSha: string;
  }>;
  readback: Readonly<{
    method: "GET";
    route: "daily-dispatch-records";
    status: number;
    rowCount: number;
    ownRowVerified: true;
    recordId: string;
    orderId: string;
    orderNo: string;
    serviceDate: string;
    finalStatus: string;
    orderSource: string;
    generatedAt: string;
    syntheticProvenanceVerified: boolean;
    provenanceQualification: DailyReportProvenanceQualification;
    runtimeSha: string;
  }>;
}>;

export type NonReportRoleDeniedProbe = Readonly<{
  method: "GET";
  route: "report-job-detail" | "report-job-artifact";
  status: 403;
  code: "AUTH_REALM_DENIED" | "AUTH_SCOPE_DENIED";
}>;

export type NonReportRoleDenialProbeResult = Readonly<{
  originalCase: "R12-10";
  role: "own_fleet";
  session: Readonly<{
    status: 200;
    active: true;
    realm: "partner";
    authMode: "jwt_bearer";
    actorType: "partner_api_key" | "partner_user";
    partnerId: string;
    tenantId: string;
    scopes: readonly string[];
    reportScopesGranted: false;
  }>;
  runtimeSha: string;
  jobs: Readonly<
    Record<
      DailyReportFormat,
      Readonly<{
        jobId: string;
        artifactId: string;
        manifestHash: string;
        detail: NonReportRoleDeniedProbe;
        artifact: NonReportRoleDeniedProbe;
      }>
    >
  >;
}>;

export type NonReportRoleDownloadDenialEvidence = Readonly<
  NonReportRoleDenialProbeResult & { ownJobsUnchangedAfterDenial: true }
>;

type EmptyDaySourceControl = Readonly<{
  requestStartedAt: string;
  readAt: string;
  positiveDate: string;
  positiveCount: number;
  ownPositivePresent: true;
  emptyDate: string;
  emptyCount: 0;
  runtimeSha: string;
}>;

export type EmptyDailyReportArtifactSummary = Readonly<{
  format: DailyReportFormat;
  jobId: string;
  status: "completed";
  rowCount: 0;
  bytes: number;
  sha256: string;
  contentType: string;
  magicHeader: string;
  runtimeSha: string;
}>;

export function resolveActiveTripScreenOrder(
  activeData: unknown,
  expectedOrderId: string,
  pageUrl: string,
  stage: string,
): Readonly<{
  trip: ObjectData;
  orderId: string;
  orderNo: string;
  displayOrderNo: string;
}> {
  const id = text(expectedOrderId, `${stage}:expected-order-id`);
  const active = object(activeData);
  const trip = object(active.trip);
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(pageUrl);
  } catch {
    throw new JourneyFailure(stage);
  }
  requireFact(
    trip.orderId === id &&
      parsedUrl.searchParams.get("orderId") === id &&
      parsedUrl.searchParams.get("screen") === "trip",
    stage,
  );
  const orderNo = text(trip.orderNo, `${stage}:order-no`);
  const renderedOrderNo = displayOrderNo(orderNo);
  requireFact(renderedOrderNo.trim().length > 0, `${stage}:display-order-no`);
  return Object.freeze({
    trip,
    orderId: id,
    orderNo,
    displayOrderNo: renderedOrderNo,
  });
}

export function opsReportJobDetailPathname(jobId: string): string {
  return `/control-plane-proxy/reports/${encodeURIComponent(text(jobId, "daily-report-job-id-required"))}`;
}

export function opsReportJobArtifactPathname(jobId: string): string {
  return `/control-plane-proxy/reports/${encodeURIComponent(text(jobId, "daily-report-job-id-required"))}/artifact`;
}

export function toTaipeiServiceDate(isoTimestamp: string): string {
  const parsed = Date.parse(isoTimestamp);
  requireFact(
    Number.isFinite(parsed),
    "daily-report-valid-timestamp-for-service-date",
  );
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(parsed));
  requireFact(
    /^\d{4}-\d{2}-\d{2}$/.test(formatted),
    "daily-report-taipei-service-date-format",
  );
  return formatted;
}

export function normalizeDailyOrderSource(orderSource: string): string {
  const normalized = text(orderSource, "daily-report-order-source-required");
  if (normalized === "portal") return "tenant_portal";
  if (normalized === "partner") return "partner_booking";
  if (normalized === "ops" || normalized === "concierge") return "ops_console";
  if (
    normalized === "third_party" ||
    normalized === "app" ||
    normalized === "web"
  ) {
    return "third_party_platform";
  }
  return normalized;
}

export function resolveDailyServiceProductCode(order: ObjectData): string {
  const explicitCode =
    typeof order.serviceProductCode === "string" &&
    order.serviceProductCode.trim().length > 0
      ? order.serviceProductCode.trim()
      : null;
  const subtype =
    typeof order.businessDispatchSubtype === "string" &&
    order.businessDispatchSubtype.trim().length > 0
      ? order.businessDispatchSubtype.trim()
      : null;
  if (explicitCode && subtype) {
    requireFact(
      explicitCode === subtype,
      "daily-report-service-product-subtype-mismatch",
    );
  }
  const candidate =
    explicitCode ?? subtype ?? order.taxiDispatchMode ?? order.serviceBucket;
  return text(candidate, "daily-report-service-product-code-required");
}

export function resolveExpectedDailyDispatchRecord(
  order: ObjectData,
  task: ObjectData,
  ownContext: {
    entrySlug?: string;
    fleetSupplyTenantId?: string;
    driverId: string;
    vehicleId: string;
    plateNo: string;
    pickupAddress: string;
    dropoffAddress: string;
  },
): ExpectedDailyDispatchRecord {
  const orderId = text(order.orderId, "daily-report-own-order-id-required");
  const orderNo = text(order.orderNo, "daily-report-own-order-no-required");
  requireFact(
    order.status === "completed" && task.status === "completed",
    "daily-report-requires-completed-own-order-and-task",
  );
  requireFact(
    task.orderId === orderId,
    "daily-report-task-order-binding-mismatch",
  );
  if (ownContext.entrySlug !== undefined) {
    const expectedEntrySlug = text(
      ownContext.entrySlug,
      "daily-report-entry-slug-required",
    );
    requireFact(
      order.partnerEntrySlug === expectedEntrySlug,
      "daily-report-referral-entry-binding",
    );
  }
  const finalDriverId = text(
    order.assignedDriverId ?? ownContext.driverId,
    "daily-report-final-driver-id-required",
  );
  const finalVehicleId = text(
    order.assignedVehicleId ?? ownContext.vehicleId,
    "daily-report-final-vehicle-id-required",
  );
  requireFact(
    finalDriverId === ownContext.driverId &&
      task.driverId === ownContext.driverId &&
      finalVehicleId === ownContext.vehicleId &&
      task.vehicleId === ownContext.vehicleId,
    "daily-report-own-driver-vehicle-binding",
  );
  const finalPlateNo = text(
    ownContext.plateNo,
    "daily-report-final-plate-no-required",
  );
  const requestedAt = text(
    order.createdAt,
    "daily-report-requested-at-required",
  );
  const reservationTime =
    typeof order.reservationWindowStart === "string" &&
    order.reservationWindowStart.trim().length > 0
      ? order.reservationWindowStart.trim()
      : null;
  const serviceDate = toTaipeiServiceDate(reservationTime ?? requestedAt);
  const orderSource = normalizeDailyOrderSource(
    text(order.orderSource, "daily-report-order-source-required"),
  );
  const tenantId = text(
    order.tenantId,
    "daily-report-synthetic-tenant-id-required",
  );
  const partnerId = text(
    order.partnerId,
    "daily-report-synthetic-partner-id-required",
  );
  const serviceProductCode = resolveDailyServiceProductCode(order);
  const pickupObj = order.pickup ? object(order.pickup) : {};
  const dropoffObj = order.dropoff ? object(order.dropoff) : {};
  const pickupAddressSnapshot = text(
    pickupObj.address ?? ownContext.pickupAddress,
    "daily-report-pickup-address-required",
  );
  const dropoffAddressSnapshot = text(
    dropoffObj.address ?? ownContext.dropoffAddress,
    "daily-report-dropoff-address-required",
  );
  requireFact(
    pickupAddressSnapshot === ownContext.pickupAddress &&
      dropoffAddressSnapshot === ownContext.dropoffAddress,
    "daily-report-pickup-dropoff-address-binding",
  );
  const arrivedPickupAt = text(
    task.arrivedPickupAt,
    "daily-report-arrived-pickup-at-required",
  );
  const tripStartedAt = text(
    task.startedAt,
    "daily-report-trip-started-at-required",
  );
  const completionObj = order.tripCompletion
    ? object(order.tripCompletion)
    : {};
  const tripCompletedAt = text(
    completionObj.completedAt ?? task.completedAt,
    "daily-report-trip-completed-at-required",
  );
  requireFact(
    Number.isFinite(Date.parse(arrivedPickupAt)) &&
      Number.isFinite(Date.parse(tripStartedAt)) &&
      Number.isFinite(Date.parse(tripCompletedAt)),
    "daily-report-valid-trip-timestamps-required",
  );

  return Object.freeze({
    orderId,
    orderNo,
    serviceDate,
    orderSource,
    tenantId,
    partnerId,
    serviceProductCode,
    requestedAt,
    reservationTime,
    pickupAddressSnapshot,
    dropoffAddressSnapshot,
    finalDriverId,
    finalVehicleId,
    finalPlateNo,
    arrivedPickupAt,
    tripStartedAt,
    tripCompletedAt,
    finalStatus: "completed",
  });
}

export function buildDailyReportFilters(
  expected: DailyRowExpectation,
): DailyReportFilters {
  return Object.freeze({
    serviceDateFrom: expected.serviceDate,
    serviceDateTo: expected.serviceDate,
    orderSource: expected.orderSource,
    tenantId: expected.tenantId,
    partnerId: expected.partnerId,
    serviceProductCode: expected.serviceProductCode,
    finalStatus: expected.finalStatus,
  });
}

// Mirrors ReportingService.buildDispatchDailyRecord/resolveServiceDate,
// normalizeOrderSource, resolveServiceProductCode and matchesQuery. The input
// must be the complete committed GET /orders response, never a preview cache.
export function countCanonicalDailySource(
  source: unknown,
  filters: DailyReportFilters,
  ownOrderId: string,
): Readonly<{ count: number; ownPresent: boolean }> {
  const orders = records(object(source).items);
  let count = 0;
  let ownPresent = false;
  for (const order of orders) {
    if (
      order.tenantId !== filters.tenantId ||
      order.partnerId !== filters.partnerId ||
      order.status !== filters.finalStatus
    )
      continue;
    const orderSource = text(
      order.orderSource,
      "daily-report-source-order-source",
    );
    const normalizedSource =
      orderSource === "portal"
        ? "tenant_portal"
        : orderSource === "concierge"
          ? "ops_console"
          : orderSource === "app" || orderSource === "web"
            ? "third_party_platform"
            : orderSource;
    if (normalizedSource !== filters.orderSource) continue;
    const bucket = text(order.serviceBucket, "daily-report-source-bucket");
    const product =
      typeof order.businessDispatchSubtype === "string" &&
      order.businessDispatchSubtype
        ? order.businessDispatchSubtype
        : bucket === "standard_taxi"
          ? order.dispatchSemantics === "reservation"
            ? "taxi_reservation"
            : "taxi_realtime"
          : bucket === "business_dispatch"
            ? "enterprise_dispatch"
            : bucket;
    if (product !== filters.serviceProductCode) continue;
    const date = toTaipeiServiceDate(
      text(
        order.reservationWindowStart ?? order.createdAt,
        "daily-report-source-service-time",
      ),
    );
    if (date !== filters.serviceDateFrom || date !== filters.serviceDateTo)
      continue;
    count += 1;
    if (order.orderId === ownOrderId) ownPresent = true;
  }
  return Object.freeze({ count, ownPresent });
}

export function adjacentEmptyDayFromSource(
  source: unknown,
  positive: DailyReportFilters,
  ownOrderId: string,
): string {
  const positiveCount = countCanonicalDailySource(source, positive, ownOrderId);
  requireFact(
    positiveCount.ownPresent && positiveCount.count > 0,
    "daily-report-authoritative-own-positive-source-required",
  );
  const ms = Date.parse(`${positive.serviceDateFrom}T00:00:00.000Z`);
  requireFact(Number.isFinite(ms), "daily-report-valid-positive-date-required");
  for (const offset of [-1, 1]) {
    const day = new Date(ms + offset * 86_400_000).toISOString().slice(0, 10);
    const empty = { ...positive, serviceDateFrom: day, serviceDateTo: day };
    if (countCanonicalDailySource(source, empty, ownOrderId).count === 0)
      return day;
  }
  throw new JourneyFailure(
    "daily-report-no-authoritatively-empty-adjacent-day",
  );
}

export function validateDailyPreviewRows(
  rawRows: unknown,
  expected: ExpectedDailyDispatchRecord,
  runtimeSha: string,
  responseSha: string | null | undefined,
  controlledOrderIds?: Iterable<string>,
  evidence?: Evidence,
  diagnosticSource: "preview" | "job-detail" = "preview",
) {
  requireFact(
    !("caseKind" in expected),
    "daily-report-strict-completed-control-required",
  );
  return validateReportRows(
    rawRows,
    expected,
    runtimeSha,
    responseSha,
    controlledOrderIds,
    evidence,
    diagnosticSource,
  );
}

export function validateSupplementalDailyPreviewRows(
  rawRows: unknown,
  expected: SupplementalDailyDispatchRecord,
  runtimeSha: string,
  responseSha: string | null | undefined,
  controlledOrderIds?: Iterable<string>,
) {
  return validateReportRows(
    rawRows,
    expected,
    runtimeSha,
    responseSha,
    controlledOrderIds,
  );
}

function validateReportRows(
  rawRows: unknown,
  expected: DailyRowExpectation,
  runtimeSha: string,
  responseSha: string | null | undefined,
  controlledOrderIds?: Iterable<string>,
  evidence?: Evidence,
  diagnosticSource: "preview" | "job-detail" = "preview",
): Readonly<{
  rowCount: number;
  controlledRowCount: number;
  unverifiedSiblingRowCount: number;
  ownRow: ObjectData;
  generatedAt: string;
  complaintCount: number;
  syntheticProvenanceVerified: boolean;
  provenanceQualification: DailyReportProvenanceQualification;
}> {
  requireFact(
    /^[a-f0-9]{40}$/.test(runtimeSha) && responseSha === runtimeSha,
    "daily-report-preview-runtime-sha-mismatch",
  );
  if ("caseKind" in expected) {
    const cancelled = expected.caseKind === "cancelled-unassigned";
    requireFact(
      expected.finalStatus === (cancelled ? "cancelled" : "completed") &&
        expected.redispatchCount === (cancelled ? 0 : 1),
      "daily-report-explicit-supplemental-case-policy",
    );
    for (const key of [
      "finalDriverId",
      "finalVehicleId",
      "finalPlateNo",
      "arrivedPickupAt",
      "tripStartedAt",
      "tripCompletedAt",
    ] as const)
      requireFact(
        cancelled
          ? expected[key] === null
          : typeof expected[key] === "string" && expected[key]!.length > 0,
        "daily-report-explicit-supplemental-source-values",
      );
  }
  const rows = records(rawRows);
  requireFact(rows.length > 0, "daily-report-preview-empty-rows");

  const allowedControlledOrderIds = new Set<string>([expected.orderId]);
  if (controlledOrderIds) {
    for (const candidateId of controlledOrderIds) {
      allowedControlledOrderIds.add(
        text(candidateId, "daily-report-controlled-order-id-required"),
      );
    }
  }

  let controlledRowCount = 0;
  let unverifiedSiblingRowCount = 0;

  for (const row of rows) {
    requireFact(
      row.serviceDate === expected.serviceDate &&
        row.tenantId === expected.tenantId &&
        row.partnerId === expected.partnerId &&
        row.orderSource === expected.orderSource &&
        row.serviceProductCode === expected.serviceProductCode &&
        row.finalStatus === expected.finalStatus &&
        typeof row.orderId === "string" &&
        row.orderId.trim().length > 0 &&
        typeof row.orderNo === "string" &&
        row.orderNo.trim().length > 0,
      "daily-report-preview-unqualified-or-foreign-fixture-row",
    );
    if (allowedControlledOrderIds.has(row.orderId)) {
      controlledRowCount += 1;
    } else {
      unverifiedSiblingRowCount += 1;
    }
  }

  const matching = rows.filter((row) => row.orderId === expected.orderId);
  requireFact(
    matching.length === 1,
    matching.length === 0
      ? "daily-report-preview-missing-own-order"
      : "daily-report-preview-duplicate-own-order",
  );
  const ownRow = matching[0]!;

  requireFact(
    ownRow.orderNo === expected.orderNo &&
      ownRow.serviceDate === expected.serviceDate &&
      ownRow.orderSource === expected.orderSource &&
      ownRow.tenantId === expected.tenantId &&
      ownRow.partnerId === expected.partnerId &&
      ownRow.serviceProductCode === expected.serviceProductCode &&
      ownRow.requestedAt === expected.requestedAt &&
      (ownRow.reservationTime ?? null) === expected.reservationTime &&
      ownRow.pickupAddressSnapshot === expected.pickupAddressSnapshot &&
      ownRow.dropoffAddressSnapshot === expected.dropoffAddressSnapshot &&
      ownRow.finalDriverId === expected.finalDriverId &&
      ownRow.finalVehicleId === expected.finalVehicleId &&
      ownRow.finalPlateNo === expected.finalPlateNo &&
      ownRow.arrivedPickupAt === expected.arrivedPickupAt &&
      ownRow.tripStartedAt === expected.tripStartedAt &&
      ownRow.tripCompletedAt === expected.tripCompletedAt &&
      ownRow.finalStatus === expected.finalStatus,
    "daily-report-preview-own-order-field-mismatch",
  );

  if ("caseKind" in expected && expected.caseKind === "cancelled-unassigned") {
    for (const key of [
      "firstDispatchAt",
      "firstAssignedAt",
      "finalDriverId",
      "finalVehicleId",
      "finalPlateNo",
      "etaSecondsAtAssignment",
      "arrivedPickupAt",
      "tripStartedAt",
      "tripCompletedAt",
    ])
      requireFact(
        ownRow[key] === null,
        `daily-report-cancelled-${key}-explicit-null-required`,
      );
  } else {
    const dispatchParseable =
      typeof ownRow.firstDispatchAt === "string" &&
      Number.isFinite(Date.parse(ownRow.firstDispatchAt));
    const assignedParseable =
      typeof ownRow.firstAssignedAt === "string" &&
      Number.isFinite(Date.parse(ownRow.firstAssignedAt));
    const etaFinite =
      typeof ownRow.etaSecondsAtAssignment === "number" &&
      Number.isFinite(ownRow.etaSecondsAtAssignment);
    const etaNonnegative =
      typeof ownRow.etaSecondsAtAssignment === "number" &&
      etaFinite &&
      ownRow.etaSecondsAtAssignment >= 0;
    if (
      !(dispatchParseable && assignedParseable && etaNonnegative) &&
      evidence
    ) {
      // Fixed field names and primitive classifications only. Never serialize
      // the row or values (including timestamps, IDs, or arbitrary objects).
      for (const field of [
        "firstDispatchAt",
        "firstAssignedAt",
        "etaSecondsAtAssignment",
      ] as const) {
        const value = ownRow[field];
        const presence = Object.prototype.hasOwnProperty.call(ownRow, field)
          ? "present"
          : "absent";
        const kind = value === null ? "null" : typeof value;
        evidence.record({
          stage: `daily-report-${diagnosticSource}-field-${field}-${presence}-type-${kind}`,
          result: "failed",
        });
        if (field === "etaSecondsAtAssignment") {
          evidence.record({
            stage: `daily-report-${diagnosticSource}-field-${field}-finite-${etaFinite}`,
            result: "failed",
          });
          evidence.record({
            stage: `daily-report-${diagnosticSource}-field-${field}-nonnegative-${etaNonnegative}`,
            result: "failed",
          });
        } else {
          evidence.record({
            stage: `daily-report-${diagnosticSource}-field-${field}-parseable-${field === "firstDispatchAt" ? dispatchParseable : assignedParseable}`,
            result: "failed",
          });
        }
      }
    }
    requireFact(
      dispatchParseable && assignedParseable && etaNonnegative,
      "daily-report-preview-dispatch-assignment-fields-required",
    );
  }
  if ("caseKind" in expected) {
    requireFact(
      ownRow.redispatchCount === expected.redispatchCount &&
        ownRow.cancellationReason === expected.cancellationReason,
      "daily-report-supplemental-redispatch-cancellation-source-binding",
    );
  }
  const complaintCount = integer(
    ownRow.complaintCount,
    "daily-report-preview-complaint-count-integer",
  );
  requireFact(
    complaintCount >= ("caseKind" in expected ? 0 : 1),
    "daily-report-preview-complaint-count-from-two-star-rating",
  );
  const generatedAt = text(
    ownRow.generatedAt,
    "daily-report-preview-generated-at-required",
  );
  requireFact(
    Number.isFinite(Date.parse(generatedAt)),
    "daily-report-preview-generated-at-valid-iso",
  );

  const syntheticProvenanceVerified = unverifiedSiblingRowCount === 0;
  const provenanceQualification: DailyReportProvenanceQualification =
    syntheticProvenanceVerified
      ? "all-rows-controlled-synthetic"
      : "own-row-verified-unowned-siblings-present-raw-retention-skipped";

  return Object.freeze({
    rowCount: rows.length,
    controlledRowCount,
    unverifiedSiblingRowCount,
    ownRow,
    generatedAt,
    complaintCount,
    syntheticProvenanceVerified,
    provenanceQualification,
  });
}

export function parseCsvRecords(csvText: string): Record<string, string>[] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (csvText[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      requireFact(
        currentField.length === 0,
        "daily-report-csv-invalid-quote-placement",
      );
      inQuotes = true;
    } else if (ch === ",") {
      currentRow.push(currentField);
      currentField = "";
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && csvText[i + 1] === "\n") {
        i += 1;
      }
      currentRow.push(currentField);
      currentField = "";
      if (currentRow.length > 1 || currentRow[0] !== "") {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += ch;
    }
  }

  requireFact(!inQuotes, "daily-report-csv-unclosed-quote");
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || currentRow[0] !== "") {
      rows.push(currentRow);
    }
  }

  requireFact(rows.length >= 2, "daily-report-csv-header-and-data-required");
  const headers = rows[0]!;
  return rows.slice(1).map((cells) => {
    requireFact(
      cells.length === headers.length,
      "daily-report-csv-column-count-mismatch",
    );
    return Object.fromEntries(
      headers.map((header, index) => [header, cells[index] ?? ""]),
    );
  });
}

function assertExpectedOrderStringRecord(
  record: Record<string, string>,
  expected: DailyRowExpectation,
  stagePrefix: string,
) {
  requireFact(
    record.orderId === expected.orderId &&
      record.orderNo === expected.orderNo &&
      record.serviceDate === expected.serviceDate &&
      record.orderSource === expected.orderSource &&
      record.tenantId === expected.tenantId &&
      record.partnerId === expected.partnerId &&
      record.serviceProductCode === expected.serviceProductCode &&
      record.requestedAt === expected.requestedAt &&
      record.reservationTime === (expected.reservationTime ?? "") &&
      record.pickupAddressSnapshot === expected.pickupAddressSnapshot &&
      record.dropoffAddressSnapshot === expected.dropoffAddressSnapshot &&
      record.finalDriverId === (expected.finalDriverId ?? "") &&
      record.finalVehicleId === (expected.finalVehicleId ?? "") &&
      record.finalPlateNo === (expected.finalPlateNo ?? "") &&
      record.arrivedPickupAt === (expected.arrivedPickupAt ?? "") &&
      record.tripStartedAt === (expected.tripStartedAt ?? "") &&
      record.tripCompletedAt === (expected.tripCompletedAt ?? "") &&
      record.finalStatus === expected.finalStatus,
    `${stagePrefix}-own-order-fields-mismatch`,
  );
}

function assertNotHtmlOrJsonErrorBody(
  bytes: Buffer,
  format: DailyReportFormat,
) {
  requireFact(
    bytes.length > 0 && bytes.length <= 5 * 1024 * 1024,
    `daily-report-${format}-bounded-nonempty-bytes-required`,
  );
  const headUtf8 = bytes
    .subarray(0, Math.min(bytes.length, 512))
    .toString("utf8")
    .trimStart();
  requireFact(
    !/^(<!doctype\s+html|<html|<head|<body|<script)/i.test(headUtf8),
    `daily-report-${format}-html-body-rejected`,
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
      `daily-report-${format}-json-error-body-rejected`,
    );
  }
}

export async function validateDailyReportArtifactDownload(input: {
  format: DailyReportFormat;
  jobId: string;
  jobDetail: unknown;
  detailStatus: number;
  detailResponseSha: string | null | undefined;
  artifactStatus: number;
  artifactResponseSha: string | null | undefined;
  contentType: string | null | undefined;
  contentDisposition: string | null | undefined;
  bytes: Buffer;
  expected: DailyRowExpectation;
  previewOwnRow: ObjectData;
  runtimeSha: string;
  artifactPath: string | null;
  controlledOrderIds?: Iterable<string>;
  nowMs?: number;
}): Promise<DailyReportDownloadArtifactSummary> {
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
    expected,
    previewOwnRow,
    runtimeSha,
    artifactPath,
    controlledOrderIds,
    nowMs = Date.now(),
  } = input;

  requireFact(
    /^[a-f0-9]{40}$/.test(runtimeSha) &&
      detailResponseSha === runtimeSha &&
      artifactResponseSha === runtimeSha,
    `daily-report-${format}-runtime-sha-mismatch`,
  );
  requireFact(
    detailStatus === 200 && artifactStatus === 200,
    `daily-report-${format}-http-status-200-required`,
  );

  const detail = object(input.jobDetail);
  requireFact(
    detail.jobId === jobId &&
      detail.jobType === "daily_dispatch_record" &&
      detail.format === format &&
      detail.status === "completed",
    `daily-report-${format}-completed-job-detail-binding`,
  );

  const filters = object(detail.filters);
  const expectedFilters = buildDailyReportFilters(expected);
  requireFact(
    filters.serviceDateFrom === expectedFilters.serviceDateFrom &&
      filters.serviceDateTo === expectedFilters.serviceDateTo &&
      filters.orderSource === expectedFilters.orderSource &&
      filters.tenantId === expectedFilters.tenantId &&
      filters.partnerId === expectedFilters.partnerId &&
      filters.serviceProductCode === expectedFilters.serviceProductCode &&
      filters.finalStatus === expectedFilters.finalStatus,
    `daily-report-${format}-job-filters-binding`,
  );

  const artifact = object(detail.artifact);
  const artifactId = text(
    artifact.artifactId,
    `daily-report-${format}-artifact-id-required`,
  );
  const expectedDownloadUrl = `/reports/${encodeURIComponent(jobId)}/artifact`;
  const expectedFileName = `daily_dispatch_record-${jobId}.${format}`;
  const expiresAt = text(
    artifact.expiresAt,
    `daily-report-${format}-artifact-expires-at-required`,
  );
  const expiresAtMs = Date.parse(expiresAt);
  requireFact(
    artifactId.length > 0 &&
      artifact.artifactType === "report" &&
      artifact.downloadUrl === expectedDownloadUrl &&
      artifact.immutable === true &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs > nowMs,
    `daily-report-${format}-artifact-unexpired-metadata-binding`,
  );
  const manifestHash = text(
    artifact.manifestHash,
    `daily-report-${format}-manifest-hash-required`,
  );

  const normalizedMime = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  requireFact(
    normalizedMime === DAILY_REPORT_MIME_TYPES[format],
    `daily-report-${format}-content-type-mismatch`,
  );
  requireFact(
    contentDisposition === `attachment; filename="${expectedFileName}"`,
    `daily-report-${format}-content-disposition-mismatch`,
  );

  assertNotHtmlOrJsonErrorBody(bytes, format);

  const validatedJobRows = validateReportRows(
    detail.rows,
    expected,
    runtimeSha,
    detailResponseSha,
    controlledOrderIds,
  );
  if (validatedJobRows.syntheticProvenanceVerified) {
    requireFact(
      typeof artifactPath === "string" && artifactPath.trim().length > 0,
      `daily-report-${format}-controlled-artifact-path-required`,
    );
  } else {
    requireFact(
      artifactPath === null,
      `daily-report-${format}-unverified-sibling-rows-forbid-raw-file-retention`,
    );
  }

  const jobRows = records(detail.rows);
  const jobOwnRow = validatedJobRows.ownRow;

  for (const key of [
    "orderId",
    "orderNo",
    "serviceDate",
    "orderSource",
    "tenantId",
    "partnerId",
    "serviceProductCode",
    "requestedAt",
    "reservationTime",
    "pickupAddressSnapshot",
    "dropoffAddressSnapshot",
    "finalDriverId",
    "finalVehicleId",
    "finalPlateNo",
    "arrivedPickupAt",
    "tripStartedAt",
    "tripCompletedAt",
    "finalStatus",
  ] as const) {
    requireFact(
      (jobOwnRow[key] ?? null) === (previewOwnRow[key] ?? null),
      `daily-report-${format}-preview-vs-job-row-${key}-mismatch`,
    );
  }

  let magicHeader = "";
  let worksheetName: string | undefined;
  let pageCount: number | undefined;

  if (format === "csv") {
    const csvText = bytes.toString("utf8");
    const expectedCsv = recordsToCsv(
      jobRows as unknown as Record<string, unknown>[],
    );
    requireFact(
      csvText === expectedCsv,
      "daily-report-csv-exact-rendered-bytes-mismatch",
    );
    const parsedRecords = parseCsvRecords(csvText);
    requireFact(
      parsedRecords.length === jobRows.length,
      "daily-report-csv-row-count-mismatch",
    );
    const ownCsvRows = parsedRecords.filter(
      (row) => row.orderId === expected.orderId,
    );
    requireFact(
      ownCsvRows.length === 1,
      "daily-report-csv-missing-own-order-row",
    );
    assertExpectedOrderStringRecord(
      ownCsvRows[0]!,
      expected,
      "daily-report-csv",
    );
    magicHeader = csvText.split(/\r?\n/, 1)[0]?.slice(0, 32) ?? "";
  } else if (format === "xlsx") {
    requireFact(
      bytes.length >= 4 &&
        bytes[0] === 0x50 &&
        bytes[1] === 0x4b &&
        bytes[2] === 0x03 &&
        bytes[3] === 0x04,
      "daily-report-xlsx-zip-magic-header-required",
    );
    magicHeader = "PK\\x03\\x04";
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    requireFact(
      workbook.worksheets.length === 1,
      "daily-report-xlsx-single-worksheet-required",
    );
    const sheet = workbook.worksheets[0]!;
    worksheetName = sheet.name;
    requireFact(
      worksheetName === "daily_dispatch_record",
      "daily-report-xlsx-worksheet-name-mismatch",
    );
    const expectedHeaders = Object.keys(jobRows[0]!);
    const headerRow = sheet.getRow(1);
    const actualHeaders = expectedHeaders.map((_, idx) =>
      String(headerRow.getCell(idx + 1).value ?? ""),
    );
    requireFact(
      actualHeaders.length === expectedHeaders.length &&
        actualHeaders.every((val, idx) => val === expectedHeaders[idx]),
      "daily-report-xlsx-headers-mismatch",
    );
    requireFact(
      sheet.rowCount === jobRows.length + 1,
      "daily-report-xlsx-row-count-mismatch",
    );
    const parsedSheetRows: Record<string, string>[] = [];
    for (let rowIndex = 0; rowIndex < jobRows.length; rowIndex += 1) {
      const excelRow = sheet.getRow(rowIndex + 2);
      const sourceRow = jobRows[rowIndex]!;
      const record: Record<string, string> = {};
      for (let colIndex = 0; colIndex < expectedHeaders.length; colIndex += 1) {
        const key = expectedHeaders[colIndex]!;
        const cellValue = String(excelRow.getCell(colIndex + 1).value ?? "");
        const rawSource = sourceRow[key];
        const expectedValue =
          rawSource === null || rawSource === undefined
            ? ""
            : typeof rawSource === "object"
              ? JSON.stringify(rawSource)
              : String(rawSource);
        requireFact(
          cellValue === expectedValue,
          `daily-report-xlsx-cell-${key}-mismatch`,
        );
        record[key] = cellValue;
      }
      parsedSheetRows.push(record);
    }
    const ownXlsxRows = parsedSheetRows.filter(
      (row) => row.orderId === expected.orderId,
    );
    requireFact(
      ownXlsxRows.length === 1,
      "daily-report-xlsx-missing-own-order-row",
    );
    assertExpectedOrderStringRecord(
      ownXlsxRows[0]!,
      expected,
      "daily-report-xlsx",
    );
  } else {
    const headerAscii = bytes.subarray(0, 5).toString("ascii");
    requireFact(
      headerAscii === "%PDF-",
      "daily-report-pdf-magic-header-required",
    );
    magicHeader = headerAscii;
    const parsedPdf = await parsePdf(bytes);
    const expectedPdfBytes = await recordsToPdf(
      jobRows as unknown as Record<string, unknown>[],
      `daily_dispatch_record — ${jobId}`,
    );
    const expectedParsedPdf = await parsePdf(expectedPdfBytes);
    pageCount = parsedPdf.pages.length;
    requireFact(
      pageCount >= 1 &&
        pageCount === expectedParsedPdf.pages.length &&
        !parsedPdf.text.includes("No data.") &&
        parsedPdf.text === expectedParsedPdf.text,
      "daily-report-pdf-rendered-text-mismatch",
    );
    const compactPdfText = parsedPdf.text.replace(/\s+/g, "");
    for (const token of [
      "daily_dispatch_record",
      jobId,
      expected.orderId,
      expected.orderNo,
      expected.serviceDate,
      expected.orderSource,
      expected.tenantId,
      expected.partnerId,
      expected.serviceProductCode,
      expected.pickupAddressSnapshot.replace(/\s+/g, ""),
      expected.dropoffAddressSnapshot.replace(/\s+/g, ""),
      expected.finalDriverId,
      expected.finalVehicleId,
      expected.finalPlateNo,
      expected.arrivedPickupAt,
      expected.tripStartedAt,
      expected.tripCompletedAt,
      expected.finalStatus,
    ]) {
      requireFact(
        token === null || compactPdfText.includes(token),
        "daily-report-pdf-missing-expected-field-token",
      );
    }
  }

  return Object.freeze({
    format,
    jobId,
    jobType: "daily_dispatch_record",
    jobStatus: "completed",
    artifactId,
    artifactType: "report",
    downloadUrl: expectedDownloadUrl,
    immutable: true,
    contentType: normalizedMime,
    contentDisposition: text(contentDisposition),
    fileName: expectedFileName,
    artifactPath,
    rawArtifactRetained: validatedJobRows.syntheticProvenanceVerified,
    bytes: bytes.length,
    sha256: hash(bytes),
    expiresAt,
    manifestHash,
    rowCount: jobRows.length,
    controlledRowCount: validatedJobRows.controlledRowCount,
    unverifiedSiblingRowCount: validatedJobRows.unverifiedSiblingRowCount,
    ownOrderPresent: true,
    syntheticProvenanceVerified: validatedJobRows.syntheticProvenanceVerified,
    provenanceQualification: validatedJobRows.provenanceQualification,
    runtimeSha,
    contentSignature: Object.freeze({
      format,
      magicHeader,
      matchedExpectedRender: true,
      ...(worksheetName === undefined ? {} : { worksheetName }),
      ...(pageCount === undefined ? {} : { pageCount }),
    }),
  });
}

export async function validateEmptyDailyReportArtifactDownload(input: {
  format: DailyReportFormat;
  jobId: string;
  jobDetail: unknown;
  filters: DailyReportFilters;
  ownOrderId: string;
  detailStatus: number;
  detailResponseSha: string;
  artifactStatus: number;
  artifactResponseSha: string;
  contentType: string | undefined;
  contentDisposition: string | undefined;
  bytes: Buffer;
  runtimeSha: string;
  nowMs?: number;
}): Promise<EmptyDailyReportArtifactSummary> {
  const { format, jobId, runtimeSha, bytes } = input;
  requireFact(
    input.detailStatus === 200 &&
      input.artifactStatus === 200 &&
      input.detailResponseSha === runtimeSha &&
      input.artifactResponseSha === runtimeSha &&
      /^[a-f0-9]{40}$/.test(runtimeSha),
    `daily-report-empty-${format}-status-runtime-binding`,
  );
  const detail = object(input.jobDetail);
  requireFact(
    detail.jobId === jobId &&
      detail.jobType === "daily_dispatch_record" &&
      detail.format === format &&
      detail.status === "completed" &&
      Object.entries(input.filters).every(
        ([key, value]) => object(detail.filters)[key] === value,
      ) &&
      records(detail.rows).length === 0,
    `daily-report-empty-${format}-completed-zero-row-job-binding`,
  );
  const artifact = object(detail.artifact);
  requireFact(
    typeof artifact.artifactId === "string" &&
      artifact.artifactId.length > 0 &&
      artifact.artifactType === "report" &&
      artifact.immutable === true &&
      artifact.downloadUrl ===
        `/reports/${encodeURIComponent(jobId)}/artifact` &&
      typeof artifact.manifestHash === "string" &&
      artifact.manifestHash.length > 0 &&
      typeof artifact.expiresAt === "string" &&
      Date.parse(artifact.expiresAt) > (input.nowMs ?? Date.now()),
    `daily-report-empty-${format}-immutable-artifact-binding`,
  );
  const normalizedMime = input.contentType?.split(";")[0]?.trim().toLowerCase();
  requireFact(
    normalizedMime === DAILY_REPORT_MIME_TYPES[format] &&
      input.contentDisposition ===
        `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
    `daily-report-empty-${format}-download-headers-binding`,
  );
  let magicHeader: string;
  if (format === "csv") {
    // Production recordsToCsv([]) emits zero bytes: no invented header or own row.
    requireFact(
      bytes.toString("utf8") === recordsToCsv([]),
      "daily-report-empty-csv-no-records-required",
    );
    magicHeader = "zero-byte-csv";
  } else {
    assertNotHtmlOrJsonErrorBody(bytes, format);
    if (format === "xlsx") {
      requireFact(
        bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])),
        "daily-report-empty-xlsx-zip-header-required",
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
      requireFact(
        workbook.worksheets.length === 1 &&
          workbook.worksheets[0]!.name === "daily_dispatch_record" &&
          workbook.worksheets[0]!.rowCount === 0,
        "daily-report-empty-xlsx-zero-cells-required",
      );
      magicHeader = "PK\\x03\\x04";
    } else {
      requireFact(
        bytes.subarray(0, 5).toString("ascii") === "%PDF-",
        "daily-report-empty-pdf-header-required",
      );
      const parsed = await parsePdf(bytes);
      const expected = await parsePdf(
        await recordsToPdf([], `daily_dispatch_record — ${jobId}`),
      );
      requireFact(
        parsed.pages.length >= 1 &&
          parsed.text === expected.text &&
          parsed.text.includes("No data.") &&
          !parsed.text.includes(input.ownOrderId),
        "daily-report-empty-pdf-no-data-render-required",
      );
      magicHeader = "%PDF-";
    }
  }
  return Object.freeze({
    format,
    jobId,
    status: "completed",
    rowCount: 0,
    bytes: bytes.length,
    sha256: hash(bytes),
    contentType: normalizedMime,
    magicHeader,
    runtimeSha,
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
  if (envelope.ok === undefined) {
    const meta = object(envelope.meta);
    requireFact(
      typeof meta.requestId === "string" &&
        meta.requestId.trim().length > 0 &&
        typeof meta.timestamp === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(meta.timestamp) &&
        Number.isFinite(Date.parse(meta.timestamp)),
      `${stage}:invalid-success-meta`,
    );
  }
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
  if (envelope.ok === undefined) {
    const meta = object(envelope.meta);
    requireFact(
      typeof meta.requestId === "string" &&
        meta.requestId.trim().length > 0 &&
        typeof meta.timestamp === "string" &&
        /^\d{4}-\d{2}-\d{2}T/.test(meta.timestamp) &&
        Number.isFinite(Date.parse(meta.timestamp)),
      `${stage}:invalid-success-meta`,
    );
  }
  if (Array.isArray(envelope.data) && envelope.ok === true) {
    return records(envelope.data);
  }
  const dataObj = object(envelope.data);
  if (envelope.ok === undefined) {
    const pageInfo = object(dataObj.pageInfo);
    requireFact(
      typeof pageInfo.page === "number" &&
        Number.isSafeInteger(pageInfo.page) &&
        pageInfo.page >= 1 &&
        typeof pageInfo.pageSize === "number" &&
        Number.isSafeInteger(pageInfo.pageSize) &&
        pageInfo.pageSize >= 1 &&
        typeof pageInfo.totalItems === "number" &&
        Number.isSafeInteger(pageInfo.totalItems) &&
        pageInfo.totalItems >= 0 &&
        typeof pageInfo.totalPages === "number" &&
        Number.isSafeInteger(pageInfo.totalPages) &&
        pageInfo.totalPages >= 0,
      `${stage}:invalid-page-info`,
    );
  }
  return records(dataObj.items);
}

type DailyReportHttpPhase =
  | "initial-reports-page"
  | "initial-jobs"
  | "preview"
  | "rebuild"
  | "rebuilt-preview"
  | "create-job-csv"
  | "create-job-xlsx"
  | "create-job-pdf"
  | "reload-reports-page"
  | "reload-jobs"
  | "job-detail-csv"
  | "job-detail-xlsx"
  | "job-detail-pdf"
  | "artifact-download-csv"
  | "artifact-download-xlsx"
  | "artifact-download-pdf";

// Static route labels only: never use a response URL, query or job ID in evidence.
const REPORT_HTTP_ROUTES = {
  "initial-reports-page": {
    method: "GET",
    path: /^\/reports$/,
    label: "reports-page",
  },
  "initial-jobs": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/jobs$/,
    label: "jobs",
  },
  preview: {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/daily-dispatch-records$/,
    label: "daily-dispatch-records",
  },
  rebuild: {
    method: "POST",
    path: /^\/control-plane-proxy\/reports\/daily-dispatch-records\/rebuild$/,
    label: "daily-dispatch-rebuild",
  },
  "rebuilt-preview": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/daily-dispatch-records$/,
    label: "daily-dispatch-records",
  },
  "create-job-csv": {
    method: "POST",
    path: /^\/control-plane-proxy\/reports\/jobs$/,
    label: "jobs",
  },
  "create-job-xlsx": {
    method: "POST",
    path: /^\/control-plane-proxy\/reports\/jobs$/,
    label: "jobs",
  },
  "create-job-pdf": {
    method: "POST",
    path: /^\/control-plane-proxy\/reports\/jobs$/,
    label: "jobs",
  },
  "reload-reports-page": {
    method: "GET",
    path: /^\/reports$/,
    label: "reports-page",
  },
  "reload-jobs": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/jobs$/,
    label: "jobs",
  },
  "job-detail-csv": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/[^/]+$/,
    label: "job-detail",
  },
  "job-detail-xlsx": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/[^/]+$/,
    label: "job-detail",
  },
  "job-detail-pdf": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/[^/]+$/,
    label: "job-detail",
  },
  "artifact-download-csv": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/[^/]+\/artifact$/,
    label: "job-artifact",
  },
  "artifact-download-xlsx": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/[^/]+\/artifact$/,
    label: "job-artifact",
  },
  "artifact-download-pdf": {
    method: "GET",
    path: /^\/control-plane-proxy\/reports\/[^/]+\/artifact$/,
    label: "job-artifact",
  },
} as const satisfies Record<
  DailyReportHttpPhase,
  { method: string; path: RegExp; label: string }
>;

const SAFE_REPORT_ERROR_CODES = new Set([
  "REPORT_READ_FAILED",
  "REPORT_REBUILD_FAILED",
  "REPORT_QUERY_INVALID",
  "REPORT_WINDOW_TOO_LARGE",
  "REPORT_SOURCE_UNAVAILABLE",
  "REPORT_JOB_NOT_FOUND",
  "REPORT_ARTIFACT_NOT_READY",
  "REPORT_FORMAT_UNKNOWN",
  "REPORT_FORMAT_NOT_IMPLEMENTED",
  "REPORT_TENANT_SCOPE_MISMATCH",
  "REPORT_JOB_TENANT_SCOPE_FORBIDDEN",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "IAP_AUDIENCE_MISMATCH",
  "IAP_SUBJECT_FORBIDDEN",
  "IAP_ASSERTION_INVALID",
]);

export type DailyReportHttpContext = Readonly<{
  phase: DailyReportHttpPhase;
  method: "GET" | "POST";
  route: string;
  runtimeSha: string;
  status: number;
  code?: string;
  requestId?: string;
}>;

export class DailyReportHttpFailure extends JourneyFailure {
  constructor(
    stage: string,
    public readonly context: DailyReportHttpContext,
  ) {
    super(stage, context.status, context.code);
  }
}

/** Called on the captured real Ops exchange before any response-body unwrap.
 * Reads ONLY a bounded error envelope; never expose arbitrary message, details,
 * headers, response URL or raw bytes in thrown errors/journey evidence.
 */
export function assertDailyReportHttpStatus(
  exchange: Pick<
    CapturedOpsExchange,
    "status" | "method" | "pathname" | "runtimeSha" | "bytes"
  >,
  phase: DailyReportHttpPhase,
  accepted: readonly number[],
  expectedRuntimeSha: string,
  evidence: Evidence,
): void {
  const route = REPORT_HTTP_ROUTES[phase];
  requireFact(
    route.method === exchange.method &&
      route.path.test(exchange.pathname) &&
      /^[a-f0-9]{40}$/.test(expectedRuntimeSha) &&
      exchange.runtimeSha === expectedRuntimeSha,
    "daily-report-http-known-route-and-runtime-required",
  );
  if (accepted.includes(exchange.status)) return;
  requireFact(
    Number.isInteger(exchange.status) &&
      exchange.status >= 100 &&
      exchange.status <= 599,
    "daily-report-http-valid-status-required",
  );
  let code: string | undefined;
  let requestId: string | undefined;
  if (exchange.bytes.length <= 4096) {
    try {
      const parsed: unknown = JSON.parse(exchange.bytes.toString("utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const error = (parsed as Record<string, unknown>).error;
        if (error && typeof error === "object" && !Array.isArray(error)) {
          const fields = error as Record<string, unknown>;
          if (
            typeof fields.code === "string" &&
            SAFE_REPORT_ERROR_CODES.has(fields.code)
          )
            code = fields.code;
          const trace = fields.traceId ?? fields.trace_id;
          if (
            typeof trace === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
              trace,
            )
          )
            requestId = trace;
        }
      }
    } catch {
      /* Non-JSON upstream errors only retain status and static route. */
    }
  }
  const context: DailyReportHttpContext = Object.freeze({
    phase,
    method: route.method as "GET" | "POST",
    route: route.label,
    runtimeSha: expectedRuntimeSha,
    status: exchange.status,
    ...(code === undefined ? {} : { code }),
    ...(requestId === undefined ? {} : { requestId }),
  });
  evidence.record({
    stage: `daily-report-http-${phase}-${route.method.toLowerCase()}-${route.label}`,
    status: context.status,
    ...(code === undefined ? {} : { code }),
    // SafeEvent is an existing fixed allowlist: objectKey carries validated trace UUID only.
    ...(requestId === undefined ? {} : { objectKey: requestId }),
    result: "failed",
  });
  const failureStage = {
    "initial-reports-page": "daily-report-ops-reports-initial-load-200",
    "initial-jobs": "daily-report-ops-reports-initial-load-200",
    preview: "daily-report-preview-status-200",
    rebuild: "daily-report-rebuild-status-200",
    "rebuilt-preview": "daily-report-rebuilt-preview-status-200",
    "reload-reports-page": "daily-report-reload-reports-page-status-200",
    "reload-jobs": "daily-report-reload-jobs-status-200",
  } as const;
  const stage =
    phase in failureStage
      ? failureStage[phase as keyof typeof failureStage]
      : phase.startsWith("create-job-")
        ? `daily-report-${phase}-status`
        : `daily-report-${phase}-http-status-200-required`;
  throw new DailyReportHttpFailure(stage, context);
}

// Closed operation labels only: never derive diagnostics from locator text,
// native error messages/stacks, URLs, command bodies or owned identities.
type EmptyDayConsumerPhase =
  | `filters-${"tab" | "report-type" | "date-from" | "date-to" | "source" | "status" | "tenant" | "partner" | "service-product"}`
  | `preview-${"ready" | "exchange" | "row-detached"}`
  | `rebuild-${"ready" | "submit" | "exchange" | "command" | "result" | "readback" | "row-detached"}`
  | `export-${DailyReportFormat}-${"ready" | "select" | "submit" | "exchange" | "command" | "result" | "notice"}`
  | "export-distinct-jobs"
  | `reload-${"page" | "page-status" | "jobs" | "completed" | "poll"}`
  | `download-${DailyReportFormat}-${"completed" | "row" | "row-binding" | "ready" | "submit" | "detail" | "artifact" | "close-pages" | "validate"}`;

// Waiters select request identity before any response exists. Keeping this
// response-free prevents failed routes from fabricating status/body/SHA facts.
type CapturedOpsRequest = Pick<
  CapturedOpsExchange,
  "method" | "url" | "pathname" | "searchParams" | "requestBody"
>;

type CapturedOpsExchange = Readonly<{
  method: string;
  url: string;
  pathname: string;
  searchParams: URLSearchParams;
  requestBody: string | null;
  status: number;
  responseUrl: string;
  headers: Readonly<Record<string, string>>;
  runtimeSha: string;
  bytes: Buffer;
}>;

async function waitForEnabled(
  locator: Locator,
  stage: string,
  timeoutMs = 15_000,
) {
  await locator.first().waitFor({ state: "visible", timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await locator.first().isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  requireFact(await locator.first().isEnabled(), `${stage}:button-not-enabled`);
}

// Same direct API origin the existing Fleet setup issued and verified against.
const NONREPORT_ROLE_API_ENV = "DRTS_OPERATIONAL_API_URL";
const NONREPORT_ROLE_DENIAL_CODES = new Set([
  "AUTH_REALM_DENIED",
  "AUTH_SCOPE_DENIED",
]);

/** Original R12-10 (no-report-permission alternative): the existing verified
 * own-Fleet partner session is denied this run's own completed main jobs.
 * Authority stays in the existing operational role verification/probe; this
 * only binds their results. Never reads or returns token material, and never
 * forwards their native messages (they carry origin/URLs) into failures.
 */
export async function probeOwnedReportJobsWithNonReportRole(input: {
  acceptedJobs: Readonly<Record<DailyReportFormat, string>>;
  downloads: Readonly<
    Record<DailyReportFormat, DailyReportDownloadArtifactSummary>
  >;
  fleetSupplyTenantId: string;
  runtimeSha: string;
  evidence: Evidence;
}): Promise<NonReportRoleDenialProbeResult> {
  const { acceptedJobs, downloads, runtimeSha, evidence } = input;
  // The existing probe enforces x-drts-candidate-sha only via this variable.
  requireFact(
    /^[a-f0-9]{40}$/.test(runtimeSha) &&
      process.env.DRTS_CANDIDATE_SHA?.trim() === runtimeSha,
    "daily-report-nonreport-role-runtime-binding-required",
  );
  const jobIds = DAILY_REPORT_FORMATS.map((format) => acceptedJobs[format]);
  requireFact(
    new Set(jobIds).size === DAILY_REPORT_FORMATS.length &&
      DAILY_REPORT_FORMATS.every((format) => {
        const summary = downloads[format];
        return (
          typeof acceptedJobs[format] === "string" &&
          summary !== undefined &&
          summary.format === format &&
          summary.jobId === acceptedJobs[format] &&
          summary.jobStatus === "completed" &&
          summary.ownOrderPresent === true &&
          summary.runtimeSha === runtimeSha
        );
      }),
    "daily-report-nonreport-role-own-completed-main-jobs-required",
  );
  let apiOrigin: string;
  try {
    const url = new URL(process.env[NONREPORT_ROLE_API_ENV]?.trim() ?? "");
    requireFact(
      url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/",
      "daily-report-nonreport-role-api-origin-required",
    );
    apiOrigin = url.origin;
  } catch {
    throw new JourneyFailure("daily-report-nonreport-role-api-origin-required");
  }
  const tenantId = text(
    input.fleetSupplyTenantId,
    "daily-report-nonreport-role-fleet-tenant-required",
  );

  let identity: Record<string, unknown>;
  try {
    identity = await verifyOperationalRoleSession(
      "own_fleet",
      NONREPORT_ROLE_API_ENV,
    );
  } catch {
    throw new JourneyFailure(
      "daily-report-nonreport-role-session-200-required",
    );
  }
  const scopes = identity.scopes;
  const actorType = identity.actorType;
  requireFact(
    identity.realm === "partner" &&
      identity.authMode === "jwt_bearer" &&
      (actorType === "partner_api_key" || actorType === "partner_user") &&
      identity.tenantId === tenantId &&
      typeof identity.partnerId === "string" &&
      identity.partnerId.trim().length > 0 &&
      Array.isArray(scopes) &&
      scopes.length > 0 &&
      scopes.every((scope) => typeof scope === "string") &&
      !scopes.some(
        (scope: string) =>
          scope === "*" ||
          scope.endsWith(":*") ||
          /(^|:)reports(:|$)/.test(scope),
      ),
    "daily-report-nonreport-role-session-qualification-required",
  );
  const sessionActorType = actorType as "partner_api_key" | "partner_user";
  evidence.record({
    stage: "daily-report-nonreport-role-session-verified",
    status: 200,
    realm: "partner",
    actorType: sessionActorType,
    result: "observed",
  });

  const jobs = {} as Record<
    DailyReportFormat,
    NonReportRoleDenialProbeResult["jobs"][DailyReportFormat]
  >;
  for (const format of DAILY_REPORT_FORMATS) {
    const jobId = acceptedJobs[format];
    const denied = {} as Record<
      "detail" | "artifact",
      NonReportRoleDeniedProbe
    >;
    for (const kind of ["detail", "artifact"] as const) {
      const path = `/api/reports/${encodeURIComponent(jobId)}${kind === "artifact" ? "/artifact" : ""}`;
      let probe: Awaited<ReturnType<typeof probeOperationalDocumentRoleAccess>>;
      try {
        // Re-verifies the same active session, then one GET without redirects.
        probe = await probeOperationalDocumentRoleAccess({
          kind: "role-access-probe",
          baseUrlEnv: NONREPORT_ROLE_API_ENV,
          role: "own_fleet",
          path,
          method: "GET",
          expectedStatus: 403,
        });
      } catch {
        throw new JourneyFailure(
          `daily-report-nonreport-role-${format}-${kind}-403-required`,
        );
      }
      requireFact(
        probe.role === "own_fleet" &&
          probe.method === "GET" &&
          probe.url === new URL(path, apiOrigin).toString() &&
          probe.status === 403 &&
          typeof probe.errorCode === "string" &&
          NONREPORT_ROLE_DENIAL_CODES.has(probe.errorCode),
        `daily-report-nonreport-role-${format}-${kind}-auth-denial-required`,
      );
      const code = probe.errorCode as NonReportRoleDeniedProbe["code"];
      denied[kind] = Object.freeze({
        method: "GET",
        route:
          kind === "artifact" ? "report-job-artifact" : "report-job-detail",
        status: 403,
        code,
      });
      evidence.record({
        stage: `daily-report-nonreport-role-${format}-${kind}-denied`,
        status: 403,
        code,
        objectKey: jobId,
        realm: "partner",
        actorType: sessionActorType,
        requestMethod: "GET",
        result: "observed",
      });
    }
    jobs[format] = Object.freeze({
      jobId,
      artifactId: downloads[format].artifactId,
      manifestHash: downloads[format].manifestHash,
      detail: denied.detail,
      artifact: denied.artifact,
    });
  }
  return Object.freeze({
    originalCase: "R12-10",
    role: "own_fleet",
    session: Object.freeze({
      status: 200,
      active: true,
      realm: "partner",
      authMode: "jwt_bearer",
      actorType: sessionActorType,
      partnerId: identity.partnerId as string,
      tenantId,
      scopes: Object.freeze([...(scopes as string[])].sort()),
      reportScopesGranted: false,
    }),
    runtimeSha,
    jobs: Object.freeze(jobs),
  });
}

const DAILY_REBUILD_PATHNAME =
  "/control-plane-proxy/reports/daily-dispatch-records/rebuild";
const DAILY_RECORDS_PATHNAME =
  "/control-plane-proxy/reports/daily-dispatch-records";
// The existing ReportingService.rebuildDailyDispatchRecords persistence
// failure (ApiRequestError 503) as the global filter serializes it. Fixed
// synthetic trace: this body is a labelled simulation, not a backend reply.
const SIMULATED_REBUILD_FAILURE = Object.freeze({
  status: 503,
  code: "REPORT_REBUILD_FAILED",
  message: "Daily dispatch records could not be rebuilt.",
  traceId: "00000000-0000-4000-8000-000000000508",
} as const);
// reports.ops.regenerate.done in both Ops locales.
const REBUILD_SUCCESS_NOTICE =
  /^(已於 .+ 重算 \d+ 筆紀錄。|Regenerated \d+ record\(s\) at .+\.)$/;

/** Original R12-08 on the main path: one existing Ops rebuild POST is answered
 * in the browser with the existing 503 envelope and never forwarded; the real
 * page must show its error and keep retry usable. The interception is always
 * removed, then the unchanged-filter retry must reach the real backend and the
 * fresh preview must return the same own row. Simulation only proves the UI
 * failure/retry path; it grants no backend or PG outage credit.
 */
async function runRebuildFailureSimulationAndRealRetry(input: {
  page: Page;
  regenerateBtn: Locator;
  opsOrigin: string;
  expected: DailyRowExpectation;
  expectedFilters: DailyReportFilters;
  originalOwnRow: ObjectData;
  controlledOrderIds: ReadonlySet<string>;
  runtimeSha: string;
  waitForOpsExchange: (
    predicate: (request: CapturedOpsRequest) => boolean,
    stage: string,
  ) => Promise<CapturedOpsExchange>;
  forwardedDailyRecordRequests: () => number;
  evidence: Evidence;
}): Promise<RebuildFailureRecoveryEvidence> {
  const {
    page,
    regenerateBtn,
    opsOrigin,
    expected,
    expectedFilters,
    originalOwnRow,
    controlledOrderIds,
    runtimeSha,
    waitForOpsExchange,
    forwardedDailyRecordRequests,
    evidence,
  } = input;
  // Closed operation labels only, as for the empty-day consumer: native
  // browser errors never carry locator text, URLs or bodies into evidence.
  let phase:
    | "sim-route"
    | "sim-ready"
    | "sim-submit"
    | "sim-error-ui"
    | "sim-success-notice"
    | "sim-retry-unlocked"
    | "retry-ready"
    | "retry-submit"
    | "retry-ui" = "sim-route";
  try {
    const filtersMatch = (candidate: (key: string) => unknown, size: number) =>
      size === Object.keys(expectedFilters).length &&
      Object.entries(expectedFilters).every(
        ([key, val]) => candidate(key) === val,
      );

    let hitCount = 0;
    let otherRequestCount = 0;
    let fulfilled = false;
    let simulatedBody: string | null = null;
    const matcher = (url: URL) =>
      url.origin === opsOrigin && url.pathname === DAILY_REBUILD_PATHNAME;
    const simulationHandler = async (route: Route) => {
      const request = route.request();
      if (request.method().toUpperCase() !== "POST") {
        otherRequestCount += 1;
        await route.fallback();
        return;
      }
      hitCount += 1;
      if (hitCount > 1) {
        await route.abort("failed").catch(() => undefined);
        return;
      }
      simulatedBody = request.postData();
      await route.fulfill({
        status: SIMULATED_REBUILD_FAILURE.status,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: SIMULATED_REBUILD_FAILURE.code,
            message: SIMULATED_REBUILD_FAILURE.message,
            retryable: false,
            trace_id: SIMULATED_REBUILD_FAILURE.traceId,
          },
        }),
      });
      fulfilled = true;
    };

    const forwardedBefore = forwardedDailyRecordRequests();
    const errorText = page.getByText(SIMULATED_REBUILD_FAILURE.message, {
      exact: false,
    });
    let interceptionRemoved = false;
    await page.route(matcher, simulationHandler);
    try {
      phase = "sim-ready";
      await waitForEnabled(
        regenerateBtn,
        "daily-report-r12-08-sim-rebuild-button",
      );
      phase = "sim-submit";
      await regenerateBtn.click();
      phase = "sim-error-ui";
      await errorText.first().waitFor({ state: "visible", timeout: 15_000 });
      requireFact(
        (await errorText.count()) === 1 &&
          (await errorText.first().innerText()).includes(
            SIMULATED_REBUILD_FAILURE.code,
          ),
        "daily-report-r12-08-sim-error-ui-required",
      );
      phase = "sim-success-notice";
      requireFact(
        (await page.getByText(REBUILD_SUCCESS_NOTICE).count()) === 0,
        "daily-report-r12-08-sim-no-success-notice-required",
      );
      phase = "sim-retry-unlocked";
      await waitForEnabled(
        regenerateBtn,
        "daily-report-r12-08-sim-retry-unlocked",
      );
    } finally {
      // Always remove only this interception, whatever failed above.
      await page.unroute(matcher, simulationHandler).then(
        () => {
          interceptionRemoved = true;
        },
        () => undefined,
      );
    }
    requireFact(
      interceptionRemoved,
      "daily-report-r12-08-sim-unroute-required",
    );
    requireFact(
      hitCount === 1 && fulfilled && otherRequestCount === 0,
      "daily-report-r12-08-sim-exactly-one-rebuild-hit-required",
    );
    // Neither the rebuild nor a follow-up preview may reach the real BFF.
    requireFact(
      forwardedDailyRecordRequests() === forwardedBefore,
      "daily-report-r12-08-sim-no-forward-required",
    );
    let simulatedCommand: ObjectData;
    try {
      simulatedCommand = object(JSON.parse(text(simulatedBody)));
    } catch {
      throw new JourneyFailure("daily-report-r12-08-sim-command-required");
    }
    requireFact(
      filtersMatch(
        (key) => simulatedCommand[key],
        Object.keys(simulatedCommand).length,
      ),
      "daily-report-r12-08-sim-filters-binding",
    );
    const simulatedPayloadSha256 = hash(Buffer.from(simulatedBody!, "utf8"));
    evidence.record({
      stage: "daily-report-r12-08-sim-rebuild-503-ui-error-observed",
      status: SIMULATED_REBUILD_FAILURE.status,
      code: SIMULATED_REBUILD_FAILURE.code,
      requestMethod: "POST",
      sha256: simulatedPayloadSha256,
      result: "observed",
    });
    evidence.record({
      stage: "daily-report-r12-08-sim-interception-removed",
      result: "cleaned",
    });

    // Real retry: same page, same unchanged filters, one normal UI POST.
    const retryPost = waitForOpsExchange(
      (ex) => ex.method === "POST" && ex.pathname === DAILY_REBUILD_PATHNAME,
      "daily-report-r12-08-retry-rebuild-post",
    );
    const retryGet = waitForOpsExchange(
      (ex) => ex.method === "GET" && ex.pathname === DAILY_RECORDS_PATHNAME,
      "daily-report-r12-08-retry-rebuilt-preview-get",
    );
    phase = "retry-ready";
    await waitForEnabled(regenerateBtn, "daily-report-r12-08-retry-button");
    phase = "retry-submit";
    await regenerateBtn.click();
    const retryExchange = await retryPost;
    assertDailyReportHttpStatus(
      retryExchange,
      "rebuild",
      [200, 201],
      runtimeSha,
      evidence,
    );
    const retryBody = text(
      retryExchange.requestBody,
      "daily-report-r12-08-retry-command-required",
    );
    let retryCommand: ObjectData;
    try {
      retryCommand = object(JSON.parse(retryBody));
    } catch {
      throw new JourneyFailure("daily-report-r12-08-retry-command-required");
    }
    const retryPayloadSha256 = hash(Buffer.from(retryBody, "utf8"));
    requireFact(
      filtersMatch(
        (key) => retryCommand[key],
        Object.keys(retryCommand).length,
      ) && retryPayloadSha256 === simulatedPayloadSha256,
      "daily-report-r12-08-retry-same-filters-required",
    );
    const retryAck = unwrapEnvelopeObject(
      retryExchange.bytes,
      "daily-report-r12-08-retry-result",
    );
    const retryCount = integer(
      retryAck.rebuiltCount,
      "daily-report-r12-08-retry-count",
    );
    const retryGeneratedAt = text(
      retryAck.generatedAt,
      "daily-report-r12-08-retry-generated-at",
    );
    requireFact(
      retryCount > 0 && Number.isFinite(Date.parse(retryGeneratedAt)),
      "daily-report-r12-08-retry-positive-ack-required",
    );
    const readbackExchange = await retryGet;
    assertDailyReportHttpStatus(
      readbackExchange,
      "rebuilt-preview",
      [200],
      runtimeSha,
      evidence,
    );
    requireFact(
      filtersMatch(
        (key) => readbackExchange.searchParams.get(key),
        [...new Set(readbackExchange.searchParams.keys())].length,
      ),
      "daily-report-r12-08-readback-same-filters-required",
    );
    const readback = validateReportRows(
      unwrapEnvelopeList(
        readbackExchange.bytes,
        "daily-report-r12-08-readback",
      ),
      expected,
      runtimeSha,
      readbackExchange.runtimeSha,
      controlledOrderIds,
      evidence,
    );
    const identityKeys = [
      "recordId",
      "orderId",
      "orderNo",
      "serviceDate",
      "finalStatus",
      "orderSource",
      "tenantId",
      "partnerId",
      "serviceProductCode",
    ] as const;
    requireFact(
      identityKeys.every(
        (key) =>
          typeof originalOwnRow[key] === "string" &&
          readback.ownRow[key] === originalOwnRow[key],
      ),
      "daily-report-r12-08-readback-own-row-identity-required",
    );
    phase = "retry-ui";
    await errorText.first().waitFor({ state: "detached", timeout: 15_000 });
    const uiOwnRow = page
      .locator("tbody tr")
      .filter({ hasText: expected.orderId });
    await uiOwnRow.first().waitFor({ state: "visible", timeout: 15_000 });
    requireFact(
      (await uiOwnRow.count()) === 1,
      "daily-report-r12-08-ui-own-row-required",
    );
    evidence.record({
      stage: "daily-report-r12-08-real-retry-own-row-verified",
      orderId: expected.orderId,
      status: retryExchange.status,
      sha256: retryPayloadSha256,
      result: "observed",
    });
    const own = readback.ownRow;
    return Object.freeze({
      originalCase: "R12-08",
      simulation: true,
      faultLayer: "browser-network-interception",
      actualBackendFaultVerified: false,
      filters: expectedFilters,
      simulatedFailure: Object.freeze({
        method: "POST",
        route: "daily-dispatch-rebuild",
        status: 503,
        code: "REPORT_REBUILD_FAILED",
        hitCount: 1,
        forwardCount: 0,
        requestPayloadSha256: simulatedPayloadSha256,
        interceptionRemoved: true,
      }),
      errorUi: Object.freeze({
        errorBannerVisible: true,
        errorCodeVisible: true,
        successNoticeCount: 0,
        retryEnabled: true,
      }),
      realRetry: Object.freeze({
        method: "POST",
        route: "daily-dispatch-rebuild",
        status: retryExchange.status,
        rebuiltCount: retryCount,
        generatedAt: retryGeneratedAt,
        requestPayloadSha256: retryPayloadSha256,
        samePayloadAsSimulated: true,
        runtimeSha,
      }),
      readback: Object.freeze({
        method: "GET",
        route: "daily-dispatch-records",
        status: readbackExchange.status,
        rowCount: readback.rowCount,
        ownRowVerified: true,
        recordId: own.recordId as string,
        orderId: own.orderId as string,
        orderNo: own.orderNo as string,
        serviceDate: own.serviceDate as string,
        finalStatus: own.finalStatus as string,
        orderSource: own.orderSource as string,
        generatedAt: readback.generatedAt,
        syntheticProvenanceVerified: readback.syntheticProvenanceVerified,
        provenanceQualification: readback.provenanceQualification,
        runtimeSha,
      }),
    });
  } catch (error) {
    if (!(error instanceof JourneyFailure))
      throw new JourneyFailure(`daily-report-r12-08-${phase}`);
    throw error;
  }
}

export type RunOwnedDailyReportDownloadsParams = {
  context: BrowserContext;
  page: Page;
  opsOrigin: string;
  opsHeaders: (url: string) => Record<string, string>;
  // Same already-authenticated Ops caller; GET /orders returns the full
  // committed source in RAM (no pagination, no raw JSON artifact).
  readCanonicalOrders: () => Promise<ObjectData>;
  order: ObjectData;
  completedTask: ObjectData;
  supplementalExpected?: SupplementalDailyDispatchRecord;
  entrySlug?: string;
  fleetSupplyTenantId?: string;
  controlledOrderIds?: Iterable<string>;
  driverId: string;
  vehicleId: string;
  plateNo: string;
  pickupAddress: string;
  dropoffAddress: string;
  directory: string;
  definitionSha: string;
  runtimeSha: string;
  recoveryOnly: boolean;
  evidence: Evidence;
};

export async function runOwnedDailyReportDownloads(
  params: RunOwnedDailyReportDownloadsParams,
): Promise<DailyReportDownloadsEvidence> {
  requireFact(
    !params.recoveryOnly,
    "daily-report-recovery-only-must-not-run-full-journey-reports",
  );
  const {
    context,
    page,
    opsOrigin,
    opsHeaders,
    readCanonicalOrders,
    order,
    completedTask,
    entrySlug,
    fleetSupplyTenantId,
    controlledOrderIds,
    driverId,
    vehicleId,
    plateNo,
    pickupAddress,
    dropoffAddress,
    directory,
    definitionSha,
    runtimeSha,
    evidence,
  } = params;

  requireFact(
    /^[a-f0-9]{40}$/.test(definitionSha) && /^[a-f0-9]{40}$/.test(runtimeSha),
    "daily-report-immutable-shas-required",
  );

  const expected =
    params.supplementalExpected ??
    resolveExpectedDailyDispatchRecord(order, completedTask, {
      ...(entrySlug === undefined ? {} : { entrySlug }),
      ...(fleetSupplyTenantId === undefined ? {} : { fleetSupplyTenantId }),
      driverId,
      vehicleId,
      plateNo,
      pickupAddress,
      dropoffAddress,
    });
  requireFact(
    expected.orderId === order.orderId &&
      expected.orderNo === order.orderNo &&
      expected.finalStatus === order.status &&
      expected.serviceDate ===
        toTaipeiServiceDate(
          text(order.reservationWindowStart ?? order.createdAt),
        ),
    "daily-report-supplemental-canonical-order-binding",
  );
  const controlledOrderIdSet = new Set<string>([expected.orderId]);
  if (controlledOrderIds) {
    for (const candidateId of controlledOrderIds) {
      controlledOrderIdSet.add(
        text(candidateId, "daily-report-controlled-order-id-required"),
      );
    }
  }
  const expectedFilters = buildDailyReportFilters(expected);

  type PendingWaiter = {
    predicate: (request: CapturedOpsRequest) => boolean;
    resolve: (exchange: CapturedOpsExchange) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: PendingWaiter[] = [];
  // Daily-record requests that reached this real-forwarding handler (R12-08
  // proves its browser simulation forwarded none of them).
  let forwardedDailyRecordRequests = 0;

  const waitForOpsExchange = (
    predicate: (request: CapturedOpsRequest) => boolean,
    stage: string,
    timeoutMs = 15_000,
  ): Promise<CapturedOpsExchange> => {
    let resolveFn!: (exchange: CapturedOpsExchange) => void;
    let rejectFn!: (error: unknown) => void;
    const promise = new Promise<CapturedOpsExchange>((resolve, reject) => {
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
    const url = request.url();
    const method = request.method().toUpperCase();
    const requestBody = request.postData();
    const parsedUrl = new URL(url);
    const requestIdentity: CapturedOpsRequest = {
      method,
      url,
      pathname: parsedUrl.pathname,
      searchParams: parsedUrl.searchParams,
      requestBody,
    };
    const startedAt = performance.now();
    let failurePhase: "fetch" | "body" | "validate" = "fetch";
    if (
      parsedUrl.pathname.startsWith(
        "/control-plane-proxy/reports/daily-dispatch-records",
      )
    )
      forwardedDailyRecordRequests += 1;

    try {
      requireFact(
        parsedUrl.origin === opsOrigin &&
          !parsedUrl.username &&
          !parsedUrl.password,
        "daily-report-ops-origin-isolation",
      );
      const authHeaders = opsHeaders(url);
      const response = await route.fetch({
        headers: {
          ...request.headers(),
          ...authHeaders,
        },
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 15_000,
      });
      failurePhase = "body";
      const bytes = await response.body();
      failurePhase = "validate";
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
          "daily-report-ops-runtime-sha-mismatch",
        );
      }

      const exchange: CapturedOpsExchange = Object.freeze({
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
      // Classify only with closed labels; never persist request identities,
      // messages, stacks, headers, bytes or arbitrary native cause objects.
      const safeMethod = [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
      ].includes(method)
        ? method
        : "OTHER";
      const routeClass =
        Object.values(REPORT_HTTP_ROUTES).find((candidate) =>
          candidate.path.test(parsedUrl.pathname),
        )?.label ?? "other";
      let nativeFailureClass = "UNKNOWN";
      let nativeCauseCode = "UNKNOWN";
      if (!(error instanceof JourneyFailure)) {
        try {
          const name = (error as { name?: unknown } | null)?.name;
          if (
            typeof name === "string" &&
            [
              "Error",
              "TypeError",
              "RangeError",
              "SyntaxError",
              "AbortError",
              "TimeoutError",
              "AggregateError",
            ].includes(name)
          )
            nativeFailureClass = name;
        } catch {
          /* hostile accessor is unknown */
        }
        try {
          const code = (error as { cause?: { code?: unknown } } | null)?.cause
            ?.code;
          if (
            typeof code === "string" &&
            [
              "ECONNRESET",
              "ECONNREFUSED",
              "ETIMEDOUT",
              "ENOTFOUND",
              "EAI_AGAIN",
              "UND_ERR_CONNECT_TIMEOUT",
              "UND_ERR_HEADERS_TIMEOUT",
              "UND_ERR_BODY_TIMEOUT",
              "UND_ERR_SOCKET",
              "CERT_HAS_EXPIRED",
              "ERR_TLS_CERT_ALTNAME_INVALID",
              "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
            ].includes(code)
          )
            nativeCauseCode = code;
        } catch {
          /* hostile accessor is unknown */
        }
      }
      const stage = `daily-report-ops-${safeMethod.toLowerCase()}-${routeClass}-${failurePhase}-${error instanceof JourneyFailure ? "typed" : "native"}`;
      const elapsed = performance.now() - startedAt;
      evidence.record({
        stage,
        requestMethod: safeMethod,
        requestDurationMs:
          Number.isFinite(elapsed) && elapsed >= 0
            ? Math.min(Math.floor(elapsed), 86_400_000)
            : 0,
        ...(error instanceof JourneyFailure
          ? {}
          : { nativeFailureClass, nativeCauseCode }),
        result: "failed",
      });
      const failure =
        error instanceof JourneyFailure ? error : new JourneyFailure(stage);
      // Mirror successful delivery: only the waiter for this actual request
      // settles. Other pending requests keep their own response/failure path.
      const index = waiters.findIndex((waiter) =>
        waiter.predicate(requestIdentity),
      );
      if (index >= 0) waiters.splice(index, 1)[0]!.reject(failure);
      await route.abort("failed").catch(() => undefined);
    }
  };

  await context.route(`${opsOrigin}/**`, routeHandler);
  let emptyDayConsumerPhase: EmptyDayConsumerPhase | undefined;
  try {
    const initialPageExchange = waitForOpsExchange(
      (ex) => ex.method === "GET" && ex.pathname === "/reports",
      "daily-report-open-ops-reports-page",
    );
    const initialJobsExchange = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname === "/control-plane-proxy/reports/jobs",
      "daily-report-initial-jobs-list",
    );
    await page.goto(`${opsOrigin}/reports`);
    const openedPage = await initialPageExchange;
    // The page must load before its client can issue the jobs request. Report
    // the known page failure instead of waiting for a request that cannot run.
    assertDailyReportHttpStatus(
      openedPage,
      "initial-reports-page",
      [200],
      runtimeSha,
      evidence,
    );
    const openedJobs = await initialJobsExchange;
    assertDailyReportHttpStatus(
      openedJobs,
      "initial-jobs",
      [200],
      runtimeSha,
      evidence,
    );

    const operationalTab = page.getByRole("button", {
      name: /^(營運報表|Operational)$/,
    });
    await waitForEnabled(operationalTab, "daily-report-operational-tab");
    await operationalTab.click();

    const reportTypeSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="daily_dispatch_record"]') });
    await reportTypeSelect
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    await reportTypeSelect.first().selectOption("daily_dispatch_record");

    const dateInputs = page.locator('input[type="date"]');
    requireFact(
      (await dateInputs.count()) === 2,
      "daily-report-two-date-inputs-required",
    );
    await dateInputs.nth(0).fill(expected.serviceDate);
    await dateInputs.nth(1).fill(expected.serviceDate);

    const orderSourceSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="tenant_portal"]') });
    await orderSourceSelect.first().selectOption(expected.orderSource);

    const statusSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="completed"]') });
    await statusSelect.first().selectOption(expected.finalStatus);

    const tenantInput = page.locator('input[placeholder="tenant_001"]');
    await tenantInput.first().fill(expected.tenantId);

    const partnerInput = page.locator('input[placeholder="partner_001"]');
    await partnerInput.first().fill(expected.partnerId);

    const serviceProductInput = page.locator(
      'input[placeholder="wheelchair_van"]',
    );
    await serviceProductInput.first().fill(expected.serviceProductCode);

    const loadPreviewBtn = page.getByRole("button", {
      name: /^(載入預覽|Load preview)$/,
    });
    await waitForEnabled(loadPreviewBtn, "daily-report-load-preview-button");

    const assertPreviewQueryParams = (searchParams: URLSearchParams) => {
      requireFact(
        searchParams.get("serviceDateFrom") ===
          expectedFilters.serviceDateFrom &&
          searchParams.get("serviceDateTo") === expectedFilters.serviceDateTo &&
          searchParams.get("orderSource") === expectedFilters.orderSource &&
          searchParams.get("finalStatus") === expectedFilters.finalStatus &&
          searchParams.get("tenantId") === expectedFilters.tenantId &&
          searchParams.get("partnerId") === expectedFilters.partnerId &&
          searchParams.get("serviceProductCode") ===
            expectedFilters.serviceProductCode,
        "daily-report-preview-query-params-binding",
      );
    };

    const previewExchangePromise = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname === "/control-plane-proxy/reports/daily-dispatch-records",
      "daily-report-preview-get",
    );
    await loadPreviewBtn.click();
    let previewExchange = await previewExchangePromise;
    assertDailyReportHttpStatus(
      previewExchange,
      "preview",
      [200],
      runtimeSha,
      evidence,
    );
    assertPreviewQueryParams(previewExchange.searchParams);
    let previewRows = unwrapEnvelopeList(
      previewExchange.bytes,
      "daily-report-preview",
    );

    // TEN01: an already-materialized own row is the positive control, not a
    // reason to skip the normal Ops rebuild. The POST and its GET are mandatory.
    const regenerateBtn = page.getByRole("button", {
      name: /^(重算|Regenerate)$/,
    });
    let rebuildCount: number;
    let rebuildGeneratedAt: string;
    {
      await waitForEnabled(regenerateBtn, "daily-report-regenerate-button");
      const rebuildPostPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "POST" &&
          ex.pathname ===
            "/control-plane-proxy/reports/daily-dispatch-records/rebuild",
        "daily-report-rebuild-post",
      );
      const rebuiltPreviewGetPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === "/control-plane-proxy/reports/daily-dispatch-records",
        "daily-report-rebuilt-preview-get",
      );
      await regenerateBtn.click();
      const rebuildExchange = await rebuildPostPromise;
      assertDailyReportHttpStatus(
        rebuildExchange,
        "rebuild",
        [200, 201],
        runtimeSha,
        evidence,
      );
      const rebuildBody = object(
        JSON.parse(
          text(
            rebuildExchange.requestBody,
            "daily-report-rebuild-body-required",
          ),
        ),
      );
      requireFact(
        rebuildBody.serviceDateFrom === expectedFilters.serviceDateFrom &&
          rebuildBody.serviceDateTo === expectedFilters.serviceDateTo &&
          rebuildBody.orderSource === expectedFilters.orderSource &&
          rebuildBody.finalStatus === expectedFilters.finalStatus &&
          rebuildBody.tenantId === expectedFilters.tenantId &&
          rebuildBody.partnerId === expectedFilters.partnerId &&
          rebuildBody.serviceProductCode === expectedFilters.serviceProductCode,
        "daily-report-rebuild-filters-binding",
      );
      const rebuildResult = unwrapEnvelopeObject(
        rebuildExchange.bytes,
        "daily-report-rebuild-result",
      );
      rebuildCount = integer(
        rebuildResult.rebuiltCount,
        "daily-report-rebuild-count",
      );
      rebuildGeneratedAt = text(
        rebuildResult.generatedAt,
        "daily-report-rebuild-generated-at",
      );
      requireFact(
        rebuildCount > 0 && Number.isFinite(Date.parse(rebuildGeneratedAt)),
        "daily-report-positive-rebuild-result-required",
      );
      previewExchange = await rebuiltPreviewGetPromise;
      assertDailyReportHttpStatus(
        previewExchange,
        "rebuilt-preview",
        [200],
        runtimeSha,
        evidence,
      );
      assertPreviewQueryParams(previewExchange.searchParams);
      previewRows = unwrapEnvelopeList(
        previewExchange.bytes,
        "daily-report-rebuilt-preview",
      );
    }

    const validatedPreview = validateReportRows(
      previewRows,
      expected,
      runtimeSha,
      previewExchange.runtimeSha,
      controlledOrderIdSet,
      evidence,
    );

    const uiOrderRow = page
      .locator("tbody tr")
      .filter({ hasText: expected.orderId });
    await uiOrderRow.first().waitFor({ state: "visible", timeout: 15_000 });
    requireFact(
      (await uiOrderRow.count()) === 1,
      "daily-report-ui-preview-single-own-order-row",
    );
    const uiOrderRowText = await uiOrderRow.first().innerText();
    for (const expectedToken of [
      expected.orderId,
      expected.orderNo,
      expected.serviceDate,
      expected.pickupAddressSnapshot,
      expected.dropoffAddressSnapshot,
      expected.finalDriverId,
      expected.finalVehicleId,
      expected.finalPlateNo,
    ]) {
      requireFact(
        expectedToken === null || uiOrderRowText.includes(expectedToken),
        "daily-report-ui-preview-row-text-binding",
      );
    }

    evidence.record({
      stage: "daily-report-preview-own-order-verified",
      orderId: expected.orderId,
      ...(expected.finalDriverId ? { driverId: expected.finalDriverId } : {}),
      ...(expected.finalVehicleId
        ? { vehicleId: expected.finalVehicleId }
        : {}),
      status: previewExchange.status,
      result: "observed",
    });

    const formatSelect = page
      .locator("select")
      .filter({ has: page.locator('option[value="xlsx"]') });
    const exportJobBtn = page.getByRole("button", {
      name: /^(匯出工作|Export job)$/,
    });

    const acceptedJobs = {} as Record<DailyReportFormat, string>;
    for (const format of DAILY_REPORT_FORMATS) {
      await waitForEnabled(
        exportJobBtn,
        `daily-report-export-button-${format}`,
      );
      await formatSelect.first().selectOption(format);
      const createJobPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "POST" &&
          ex.pathname === "/control-plane-proxy/reports/jobs",
        `daily-report-create-job-${format}`,
      );
      await exportJobBtn.click();
      const createJobExchange = await createJobPromise;
      assertDailyReportHttpStatus(
        createJobExchange,
        `create-job-${format}`,
        [200, 201],
        runtimeSha,
        evidence,
      );
      const createJobReq = object(
        JSON.parse(
          text(
            createJobExchange.requestBody,
            `daily-report-create-job-${format}-request-body`,
          ),
        ),
      );
      const createJobFilters = object(createJobReq.filters);
      requireFact(
        createJobReq.jobType === "daily_dispatch_record" &&
          createJobReq.format === format &&
          createJobFilters.serviceDateFrom ===
            expectedFilters.serviceDateFrom &&
          createJobFilters.serviceDateTo === expectedFilters.serviceDateTo &&
          createJobFilters.orderSource === expectedFilters.orderSource &&
          createJobFilters.finalStatus === expectedFilters.finalStatus &&
          createJobFilters.tenantId === expectedFilters.tenantId &&
          createJobFilters.partnerId === expectedFilters.partnerId &&
          createJobFilters.serviceProductCode ===
            expectedFilters.serviceProductCode,
        `daily-report-create-job-${format}-command-binding`,
      );
      const acceptedData = unwrapEnvelopeObject(
        createJobExchange.bytes,
        `daily-report-create-job-${format}`,
      );
      const jobId = text(
        acceptedData.jobId,
        `daily-report-create-job-${format}-job-id`,
      );
      const noticeLocator = page.getByText(jobId, { exact: false });
      await noticeLocator
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      acceptedJobs[format] = jobId;
      evidence.record({
        stage: `daily-report-job-${format}-accepted`,
        orderId: expected.orderId,
        objectKey: jobId,
        status: createJobExchange.status,
        result: "observed",
      });
    }

    requireFact(
      new Set(Object.values(acceptedJobs)).size === DAILY_REPORT_FORMATS.length,
      "daily-report-three-distinct-job-ids-required",
    );

    let listedJobs: ObjectData[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reloadPagePromise = waitForOpsExchange(
        (ex) => ex.method === "GET" && ex.pathname === "/reports",
        "daily-report-reload-reports-page",
      );
      const reloadJobsPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === "/control-plane-proxy/reports/jobs",
        "daily-report-reload-jobs-list",
      );
      await page.goto(`${opsOrigin}/reports`);
      const reloadPageExchange = await reloadPagePromise;
      // Each navigation must load before its client can issue the jobs list.
      // Preserve a known document failure instead of awaiting absent jobs.
      assertDailyReportHttpStatus(
        reloadPageExchange,
        "reload-reports-page",
        [200],
        runtimeSha,
        evidence,
      );
      const reloadJobsExchange = await reloadJobsPromise;
      assertDailyReportHttpStatus(
        reloadJobsExchange,
        "reload-jobs",
        [200],
        runtimeSha,
        evidence,
      );
      listedJobs = unwrapEnvelopeList(
        reloadJobsExchange.bytes,
        "daily-report-reload-jobs",
      );
      const allCompleted = DAILY_REPORT_FORMATS.every((format) => {
        const jobId = acceptedJobs[format];
        const found = listedJobs.find((item) => item.jobId === jobId);
        requireFact(
          Boolean(found),
          `daily-report-listed-job-${format}-missing`,
        );
        requireFact(
          found!.status !== "failed" && found!.status !== "expired",
          `daily-report-listed-job-${format}-terminal-failure`,
        );
        return found!.status === "completed";
      });
      if (allCompleted) break;
      if (attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
    }

    const reportDirectory = `${directory}/daily-reports`;
    const downloads = {} as Record<
      DailyReportFormat,
      DailyReportDownloadArtifactSummary
    >;

    for (const format of DAILY_REPORT_FORMATS) {
      const jobId = acceptedJobs[format];
      const listedJob = listedJobs.find((item) => item.jobId === jobId);
      requireFact(
        Boolean(listedJob) && listedJob!.status === "completed",
        `daily-report-job-${format}-not-completed`,
      );

      const jobRow = page.locator("tbody tr").filter({ hasText: jobId });
      await jobRow.first().waitFor({ state: "visible", timeout: 15_000 });
      requireFact(
        (await jobRow.count()) === 1,
        `daily-report-ui-job-row-${format}-unique`,
      );
      const rowText = await jobRow.first().innerText();
      requireFact(
        rowText.includes(jobId) && rowText.includes(format.toUpperCase()),
        `daily-report-ui-job-row-${format}-text-binding`,
      );

      const downloadBtn = jobRow
        .first()
        .getByRole("button", { name: /^(下載|Download)$/ });
      await waitForEnabled(
        downloadBtn,
        `daily-report-ui-download-button-${format}`,
      );

      const detailPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === opsReportJobDetailPathname(jobId),
        `daily-report-job-detail-${format}`,
      );
      const artifactPromise = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === opsReportJobArtifactPathname(jobId),
        `daily-report-artifact-download-${format}`,
      );

      await downloadBtn.click();
      const detailExchange = await detailPromise;
      // ApiClient only opens the artifact after a successful detail GET. Keep
      // the captured non-200 response visible if no download request follows.
      assertDailyReportHttpStatus(
        detailExchange,
        `job-detail-${format}`,
        [200],
        runtimeSha,
        evidence,
      );
      const artifactExchange = await artifactPromise;

      for (const extraPage of context.pages()) {
        if (extraPage !== page) {
          await extraPage.close().catch(() => undefined);
        }
      }

      assertDailyReportHttpStatus(
        artifactExchange,
        `artifact-download-${format}`,
        [200],
        runtimeSha,
        evidence,
      );
      const jobDetail = unwrapEnvelopeObject(
        detailExchange.bytes,
        `daily-report-job-detail-${format}`,
      );
      const jobRowsCheck = validateReportRows(
        jobDetail.rows,
        expected,
        runtimeSha,
        detailExchange.runtimeSha,
        controlledOrderIdSet,
        evidence,
        "job-detail",
      );
      // Preview GET and queued job execution are independent snapshots. Retain
      // only when the actual job rows (the downloaded bytes' source) are all
      // controlled; an unrelated preview sibling cannot veto safe job bytes.
      const retainRawArtifact = jobRowsCheck.syntheticProvenanceVerified;
      const artifactPath = retainRawArtifact
        ? `${reportDirectory}/daily-dispatch-${jobId}.${format}`
        : null;
      const summary = await validateDailyReportArtifactDownload({
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
        expected,
        previewOwnRow: validatedPreview.ownRow,
        runtimeSha,
        artifactPath,
        controlledOrderIds: controlledOrderIdSet,
      });

      if (retainRawArtifact && artifactPath !== null) {
        await mkdir(reportDirectory, { recursive: true });
        await writeFile(artifactPath, artifactExchange.bytes, { mode: 0o600 });
      } else {
        evidence.record({
          stage: `daily-report-download-${format}-raw-retention-skipped`,
          orderId: expected.orderId,
          objectKey: jobId,
          status: artifactExchange.status,
          result: "observed",
        });
      }
      downloads[format] = summary;

      evidence.record({
        stage: `daily-report-download-${format}-verified`,
        orderId: expected.orderId,
        objectKey: jobId,
        bytes: summary.bytes,
        sha256: summary.sha256,
        status: artifactExchange.status,
        result: "observed",
      });
    }

    // Original R12-10 runs once, on the main path only, after all three own
    // jobs were accepted, completed and their bytes verified by Ops above.
    const nonReportRoleDenial =
      params.supplementalExpected === undefined
        ? await probeOwnedReportJobsWithNonReportRole({
            acceptedJobs,
            downloads,
            fleetSupplyTenantId: text(
              fleetSupplyTenantId,
              "daily-report-nonreport-role-fleet-tenant-required",
            ),
            runtimeSha,
            evidence,
          })
        : undefined;

    // TEN02: independent adjacent day, selected from a complete committed
    // canonical read, NOT from an empty report preview. Keep full orders in RAM.
    const beforeStartedAt = new Date().toISOString();
    const beforeOrders = await readCanonicalOrders();
    const beforeReadAt = new Date().toISOString();
    const emptyDate = adjacentEmptyDayFromSource(
      beforeOrders,
      expectedFilters,
      expected.orderId,
    );
    const emptyFilters: DailyReportFilters = Object.freeze({
      ...expectedFilters,
      serviceDateFrom: emptyDate,
      serviceDateTo: emptyDate,
    });
    const sourceControl = (
      source: ObjectData,
      requestStartedAt: string,
      readAt: string,
    ): EmptyDaySourceControl => {
      const positive = countCanonicalDailySource(
        source,
        expectedFilters,
        expected.orderId,
      );
      const empty = countCanonicalDailySource(
        source,
        emptyFilters,
        expected.orderId,
      );
      requireFact(
        positive.count > 0 && positive.ownPresent && empty.count === 0,
        "daily-report-empty-day-authoritative-source-control-required",
      );
      return Object.freeze({
        requestStartedAt,
        readAt,
        positiveDate: expected.serviceDate,
        positiveCount: positive.count,
        ownPositivePresent: true,
        emptyDate,
        emptyCount: 0,
        runtimeSha,
      });
    };
    const sourceBefore = sourceControl(
      beforeOrders,
      beforeStartedAt,
      beforeReadAt,
    );
    evidence.record({
      stage: "daily-report-empty-source-before-zero-positive-own",
      orderId: expected.orderId,
      result: "observed",
    });

    emptyDayConsumerPhase = "filters-tab";
    await operationalTab.click();
    emptyDayConsumerPhase = "filters-report-type";
    await reportTypeSelect.first().selectOption("daily_dispatch_record");
    emptyDayConsumerPhase = "filters-date-from";
    await dateInputs.nth(0).fill(emptyDate);
    emptyDayConsumerPhase = "filters-date-to";
    await dateInputs.nth(1).fill(emptyDate);
    emptyDayConsumerPhase = "filters-source";
    await orderSourceSelect.first().selectOption(expected.orderSource);
    emptyDayConsumerPhase = "filters-status";
    await statusSelect.first().selectOption(expected.finalStatus);
    emptyDayConsumerPhase = "filters-tenant";
    await tenantInput.first().fill(expected.tenantId);
    emptyDayConsumerPhase = "filters-partner";
    await partnerInput.first().fill(expected.partnerId);
    emptyDayConsumerPhase = "filters-service-product";
    await serviceProductInput.first().fill(expected.serviceProductCode);
    const assertEmptyQuery = (query: URLSearchParams) => {
      requireFact(
        Object.entries(emptyFilters).every(
          ([key, val]) => query.get(key) === val,
        ),
        "daily-report-empty-query-filters-binding",
      );
    };
    const emptyPreview = async (phase: "preview" | "rebuilt-preview") => {
      const pending = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === "/control-plane-proxy/reports/daily-dispatch-records",
        `daily-report-empty-${phase}-get`,
      );
      if (phase === "preview") await loadPreviewBtn.click();
      const exchange = await pending;
      assertDailyReportHttpStatus(exchange, phase, [200], runtimeSha, evidence);
      assertEmptyQuery(exchange.searchParams);
      requireFact(
        unwrapEnvelopeList(exchange.bytes, `daily-report-empty-${phase}`)
          .length === 0,
        `daily-report-empty-${phase}-zero-rows-required`,
      );
    };
    emptyDayConsumerPhase = "preview-ready";
    await waitForEnabled(loadPreviewBtn, "daily-report-empty-preview-button");
    emptyDayConsumerPhase = "preview-exchange";
    await emptyPreview("preview");
    emptyDayConsumerPhase = "preview-row-detached";
    await page
      .locator("tbody tr")
      .filter({ hasText: expected.orderId })
      .first()
      .waitFor({ state: "detached", timeout: 15_000 });
    const emptyRebuildPost = waitForOpsExchange(
      (ex) =>
        ex.method === "POST" &&
        ex.pathname ===
          "/control-plane-proxy/reports/daily-dispatch-records/rebuild",
      "daily-report-empty-rebuild-post",
    );
    const emptyRebuiltGet = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname === "/control-plane-proxy/reports/daily-dispatch-records",
      "daily-report-empty-rebuilt-preview-get",
    );
    emptyDayConsumerPhase = "rebuild-ready";
    await waitForEnabled(regenerateBtn, "daily-report-empty-rebuild-button");
    emptyDayConsumerPhase = "rebuild-submit";
    await regenerateBtn.click();
    emptyDayConsumerPhase = "rebuild-exchange";
    const emptyRebuild = await emptyRebuildPost;
    assertDailyReportHttpStatus(
      emptyRebuild,
      "rebuild",
      [200, 201],
      runtimeSha,
      evidence,
    );
    emptyDayConsumerPhase = "rebuild-command";
    const emptyBody = object(
      JSON.parse(
        text(emptyRebuild.requestBody, "daily-report-empty-rebuild-body"),
      ),
    );
    requireFact(
      Object.entries(emptyFilters).every(
        ([key, val]) => emptyBody[key] === val,
      ),
      "daily-report-empty-rebuild-filters-binding",
    );
    emptyDayConsumerPhase = "rebuild-result";
    const emptyResult = unwrapEnvelopeObject(
      emptyRebuild.bytes,
      "daily-report-empty-rebuild-result",
    );
    requireFact(
      emptyResult.rebuiltCount === 0 &&
        typeof emptyResult.generatedAt === "string" &&
        Number.isFinite(Date.parse(emptyResult.generatedAt)),
      "daily-report-empty-rebuilt-count-zero-required",
    );
    emptyDayConsumerPhase = "rebuild-readback";
    const rebuiltEmpty = await emptyRebuiltGet;
    assertDailyReportHttpStatus(
      rebuiltEmpty,
      "rebuilt-preview",
      [200],
      runtimeSha,
      evidence,
    );
    assertEmptyQuery(rebuiltEmpty.searchParams);
    requireFact(
      unwrapEnvelopeList(
        rebuiltEmpty.bytes,
        "daily-report-empty-rebuilt-preview",
      ).length === 0,
      "daily-report-empty-rebuilt-preview-zero-required",
    );
    emptyDayConsumerPhase = "rebuild-row-detached";
    await page
      .locator("tbody tr")
      .filter({ hasText: expected.orderId })
      .first()
      .waitFor({ state: "detached", timeout: 15_000 });

    const emptyJobs = {} as Record<DailyReportFormat, string>;
    for (const format of DAILY_REPORT_FORMATS) {
      emptyDayConsumerPhase = `export-${format}-ready`;
      await waitForEnabled(exportJobBtn, `daily-report-empty-export-${format}`);
      emptyDayConsumerPhase = `export-${format}-select`;
      await formatSelect.first().selectOption(format);
      const pending = waitForOpsExchange(
        (ex) =>
          ex.method === "POST" &&
          ex.pathname === "/control-plane-proxy/reports/jobs",
        `daily-report-empty-create-job-${format}`,
      );
      emptyDayConsumerPhase = `export-${format}-submit`;
      await exportJobBtn.click();
      emptyDayConsumerPhase = `export-${format}-exchange`;
      const exchange = await pending;
      assertDailyReportHttpStatus(
        exchange,
        `create-job-${format}`,
        [200, 201],
        runtimeSha,
        evidence,
      );
      emptyDayConsumerPhase = `export-${format}-command`;
      const command = object(
        JSON.parse(
          text(exchange.requestBody, "daily-report-empty-job-command"),
        ),
      );
      requireFact(
        command.jobType === "daily_dispatch_record" &&
          command.format === format &&
          Object.entries(emptyFilters).every(
            ([key, val]) => object(command.filters)[key] === val,
          ),
        `daily-report-empty-${format}-job-command-binding`,
      );
      emptyDayConsumerPhase = `export-${format}-result`;
      const accepted = unwrapEnvelopeObject(
        exchange.bytes,
        `daily-report-empty-job-${format}`,
      );
      const jobId = text(accepted.jobId, `daily-report-empty-${format}-job-id`);
      emptyDayConsumerPhase = `export-${format}-notice`;
      await page
        .getByText(jobId, { exact: false })
        .first()
        .waitFor({ state: "visible", timeout: 15_000 });
      emptyJobs[format] = jobId;
    }
    emptyDayConsumerPhase = "export-distinct-jobs";
    requireFact(
      new Set([...Object.values(acceptedJobs), ...Object.values(emptyJobs)])
        .size === 6,
      "daily-report-empty-jobs-distinct-from-positive-required",
    );
    let emptyListed: ObjectData[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const pagePending = waitForOpsExchange(
        (ex) => ex.method === "GET" && ex.pathname === "/reports",
        "daily-report-empty-reload-page",
      );
      const jobsPending = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === "/control-plane-proxy/reports/jobs",
        "daily-report-empty-reload-jobs",
      );
      emptyDayConsumerPhase = "reload-page";
      await page.goto(`${opsOrigin}/reports`);
      emptyDayConsumerPhase = "reload-page-status";
      assertDailyReportHttpStatus(
        await pagePending,
        "reload-reports-page",
        [200],
        runtimeSha,
        evidence,
      );
      emptyDayConsumerPhase = "reload-jobs";
      const jobsExchange = await jobsPending;
      assertDailyReportHttpStatus(
        jobsExchange,
        "reload-jobs",
        [200],
        runtimeSha,
        evidence,
      );
      emptyListed = unwrapEnvelopeList(
        jobsExchange.bytes,
        "daily-report-empty-reload-jobs",
      );
      emptyDayConsumerPhase = "reload-completed";
      if (
        DAILY_REPORT_FORMATS.every((format) => {
          const found = emptyListed.find((j) => j.jobId === emptyJobs[format]);
          requireFact(
            found && found.status !== "failed" && found.status !== "expired",
            `daily-report-empty-${format}-job-listed-not-failed`,
          );
          return found.status === "completed";
        })
      )
        break;
      emptyDayConsumerPhase = "reload-poll";
      if (attempt < 4)
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    const emptyDownloads = {} as Record<
      DailyReportFormat,
      EmptyDailyReportArtifactSummary
    >;
    for (const format of DAILY_REPORT_FORMATS) {
      emptyDayConsumerPhase = `download-${format}-completed`;
      const jobId = emptyJobs[format];
      requireFact(
        emptyListed.some((j) => j.jobId === jobId && j.status === "completed"),
        `daily-report-empty-${format}-job-completed-required`,
      );
      emptyDayConsumerPhase = `download-${format}-row`;
      const jobRow = page.locator("tbody tr").filter({ hasText: jobId });
      await jobRow.first().waitFor({ state: "visible", timeout: 15_000 });
      emptyDayConsumerPhase = `download-${format}-row-binding`;
      requireFact(
        (await jobRow.count()) === 1 &&
          (await jobRow.first().innerText()).includes(format.toUpperCase()),
        `daily-report-empty-${format}-ui-job-binding`,
      );
      emptyDayConsumerPhase = `download-${format}-ready`;
      const downloadBtn = jobRow
        .first()
        .getByRole("button", { name: /^(下載|Download)$/ });
      await waitForEnabled(
        downloadBtn,
        `daily-report-empty-download-${format}`,
      );
      const detailPending = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === opsReportJobDetailPathname(jobId),
        `daily-report-empty-detail-${format}`,
      );
      const artifactPending = waitForOpsExchange(
        (ex) =>
          ex.method === "GET" &&
          ex.pathname === opsReportJobArtifactPathname(jobId),
        `daily-report-empty-artifact-${format}`,
      );
      emptyDayConsumerPhase = `download-${format}-submit`;
      await downloadBtn.click();
      emptyDayConsumerPhase = `download-${format}-detail`;
      const detail = await detailPending;
      assertDailyReportHttpStatus(
        detail,
        `job-detail-${format}`,
        [200],
        runtimeSha,
        evidence,
      );
      emptyDayConsumerPhase = `download-${format}-artifact`;
      const artifact = await artifactPending;
      assertDailyReportHttpStatus(
        artifact,
        `artifact-download-${format}`,
        [200],
        runtimeSha,
        evidence,
      );
      emptyDayConsumerPhase = `download-${format}-close-pages`;
      for (const extraPage of context.pages())
        if (extraPage !== page) await extraPage.close().catch(() => undefined);
      emptyDayConsumerPhase = `download-${format}-validate`;
      emptyDownloads[format] = await validateEmptyDailyReportArtifactDownload({
        format,
        jobId,
        jobDetail: unwrapEnvelopeObject(
          detail.bytes,
          `daily-report-empty-detail-${format}`,
        ),
        filters: emptyFilters,
        ownOrderId: expected.orderId,
        detailStatus: detail.status,
        detailResponseSha: detail.runtimeSha,
        artifactStatus: artifact.status,
        artifactResponseSha: artifact.runtimeSha,
        contentType: artifact.headers["content-type"],
        contentDisposition: artifact.headers["content-disposition"],
        bytes: artifact.bytes,
        runtimeSha,
      });
      evidence.record({
        stage: `daily-report-empty-${format}-verified`,
        objectKey: jobId,
        bytes: artifact.bytes.length,
        sha256: emptyDownloads[format].sha256,
        result: "observed",
      });
    }
    emptyDayConsumerPhase = undefined;
    // Ops readback after the denials: the same own main jobs remain listed,
    // completed, with their original artifact and manifest. No new export.
    if (nonReportRoleDenial) {
      for (const format of DAILY_REPORT_FORMATS) {
        const listed = emptyListed.find(
          (job) => job.jobId === acceptedJobs[format],
        );
        const artifact =
          listed?.artifact && typeof listed.artifact === "object"
            ? object(listed.artifact)
            : {};
        requireFact(
          listed?.status === "completed" &&
            artifact.artifactId === downloads[format].artifactId &&
            artifact.manifestHash === downloads[format].manifestHash,
          `daily-report-nonreport-role-${format}-own-job-unchanged-after-denial`,
        );
      }
      evidence.record({
        stage: "daily-report-nonreport-role-own-jobs-unchanged-after-denial",
        orderId: expected.orderId,
        result: "observed",
      });
    }
    // The second complete source read is after all jobs: a concurrent writer
    // cannot silently turn our selected day into a nonempty day.
    const afterStartedAt = new Date().toISOString();
    const afterOrders = await readCanonicalOrders();
    const sourceAfter = sourceControl(
      afterOrders,
      afterStartedAt,
      new Date().toISOString(),
    );
    requireFact(
      sourceBefore.positiveCount === sourceAfter.positiveCount,
      "daily-report-empty-positive-source-count-stable-required",
    );
    evidence.record({
      stage: "daily-report-empty-source-after-zero-positive-own",
      orderId: expected.orderId,
      result: "observed",
    });
    await operationalTab.click();
    await reportTypeSelect.first().selectOption("daily_dispatch_record");
    await dateInputs.nth(0).fill(expected.serviceDate);
    await dateInputs.nth(1).fill(expected.serviceDate);
    await orderSourceSelect.first().selectOption(expected.orderSource);
    await statusSelect.first().selectOption(expected.finalStatus);
    await tenantInput.first().fill(expected.tenantId);
    await partnerInput.first().fill(expected.partnerId);
    await serviceProductInput.first().fill(expected.serviceProductCode);
    const restorePending = waitForOpsExchange(
      (ex) =>
        ex.method === "GET" &&
        ex.pathname === "/control-plane-proxy/reports/daily-dispatch-records",
      "daily-report-restore-positive-preview",
    );
    await waitForEnabled(
      loadPreviewBtn,
      "daily-report-restore-positive-preview-button",
    );
    await loadPreviewBtn.click();
    const restored = await restorePending;
    assertDailyReportHttpStatus(
      restored,
      "preview",
      [200],
      runtimeSha,
      evidence,
    );
    assertPreviewQueryParams(restored.searchParams);
    validateReportRows(
      unwrapEnvelopeList(restored.bytes, "daily-report-restore-positive"),
      expected,
      runtimeSha,
      restored.runtimeSha,
      controlledOrderIdSet,
      evidence,
    );
    await page
      .locator("tbody tr")
      .filter({ hasText: expected.orderId })
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
    evidence.record({
      stage: "daily-report-positive-after-empty-restored",
      orderId: expected.orderId,
      result: "observed",
    });

    // Original R12-08 runs once, on the main path only, after every existing
    // positive/empty/restore control; supplemental cases keep their flow.
    const rebuildFailureRecovery =
      params.supplementalExpected === undefined
        ? await runRebuildFailureSimulationAndRealRetry({
            page,
            regenerateBtn,
            opsOrigin,
            expected,
            expectedFilters,
            originalOwnRow: validatedPreview.ownRow,
            controlledOrderIds: controlledOrderIdSet,
            runtimeSha,
            waitForOpsExchange,
            forwardedDailyRecordRequests: () => forwardedDailyRecordRequests,
            evidence,
          })
        : undefined;

    return Object.freeze({
      definitionSha,
      runtimeSha,
      orderId: expected.orderId,
      orderNo: expected.orderNo,
      serviceDate: expected.serviceDate,
      filters: expectedFilters,
      preview: Object.freeze({
        rebuilt: true,
        rebuildCount,
        rebuildGeneratedAt,
        rowCount: validatedPreview.rowCount,
        controlledRowCount: validatedPreview.controlledRowCount,
        unverifiedSiblingRowCount: validatedPreview.unverifiedSiblingRowCount,
        ownOrderRowVerified: true,
        syntheticProvenanceVerified:
          validatedPreview.syntheticProvenanceVerified,
        provenanceQualification: validatedPreview.provenanceQualification,
        generatedAt: validatedPreview.generatedAt,
        finalDriverId: expected.finalDriverId,
        finalVehicleId: expected.finalVehicleId,
        finalPlateNo: expected.finalPlateNo,
        arrivedPickupAt: expected.arrivedPickupAt,
        tripStartedAt: expected.tripStartedAt,
        tripCompletedAt: expected.tripCompletedAt,
        finalStatus: expected.finalStatus,
        complaintCount: validatedPreview.complaintCount,
        runtimeSha,
      }),
      downloads: Object.freeze({
        csv: downloads.csv,
        xlsx: downloads.xlsx,
        pdf: downloads.pdf,
      }),
      emptyDay: Object.freeze({
        serviceDate: emptyDate,
        filters: emptyFilters,
        sourceBefore,
        sourceAfter,
        previewBefore: 0,
        rebuiltCount: 0,
        rebuildGeneratedAt: emptyResult.generatedAt as string,
        previewAfter: 0,
        restoredPositiveRow: true,
        downloads: Object.freeze(emptyDownloads),
      }),
      ...(nonReportRoleDenial
        ? {
            nonReportRoleDenial: Object.freeze({
              ...nonReportRoleDenial,
              ownJobsUnchangedAfterDenial: true as const,
            }),
          }
        : {}),
      ...(rebuildFailureRecovery ? { rebuildFailureRecovery } : {}),
    });
  } catch (error) {
    // Existing typed failures retain their exact identity/status/code/context.
    // Native failures retain only a fixed operation label; no cause or raw data.
    if (
      emptyDayConsumerPhase !== undefined &&
      !(error instanceof JourneyFailure)
    )
      throw new JourneyFailure(`daily-report-empty-${emptyDayConsumerPhase}`);
    throw error;
  } finally {
    for (const waiter of waiters.splice(0, waiters.length)) {
      clearTimeout(waiter.timer);
    }
    for (const extraPage of context.pages()) {
      if (extraPage !== page) {
        await extraPage.close().catch(() => undefined);
      }
    }
    await context
      .unroute(`${opsOrigin}/**`, routeHandler)
      .catch(() => undefined);
  }
}
