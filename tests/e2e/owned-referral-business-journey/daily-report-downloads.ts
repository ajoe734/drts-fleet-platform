import { mkdir, writeFile } from "node:fs/promises";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import ExcelJS from "exceljs";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import { recordsToPdf } from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import { displayOrderNo } from "../../../apps/referral-embed-web/lib/order-display";
import { parsePdf } from "../../unit/billing-pdf-chinese-printable-content-20261016/pdf-parser";
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

export type DailyReportFilters = Readonly<{
  serviceDateFrom: string;
  serviceDateTo: string;
  orderSource: string;
  tenantId: string;
  partnerId: string;
  serviceProductCode: string;
  finalStatus: "completed";
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
    rebuilt: boolean;
    rowCount: number;
    controlledRowCount: number;
    unverifiedSiblingRowCount: number;
    ownOrderRowVerified: true;
    syntheticProvenanceVerified: boolean;
    provenanceQualification: DailyReportProvenanceQualification;
    generatedAt: string;
    finalDriverId: string;
    finalVehicleId: string;
    finalPlateNo: string;
    arrivedPickupAt: string;
    tripStartedAt: string;
    tripCompletedAt: string;
    finalStatus: "completed";
    complaintCount: number;
    runtimeSha: string;
  }>;
  downloads: Readonly<{
    csv: DailyReportDownloadArtifactSummary;
    xlsx: DailyReportDownloadArtifactSummary;
    pdf: DailyReportDownloadArtifactSummary;
  }>;
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
  expected: ExpectedDailyDispatchRecord,
): DailyReportFilters {
  return Object.freeze({
    serviceDateFrom: expected.serviceDate,
    serviceDateTo: expected.serviceDate,
    orderSource: expected.orderSource,
    tenantId: expected.tenantId,
    partnerId: expected.partnerId,
    serviceProductCode: expected.serviceProductCode,
    finalStatus: "completed",
  });
}

export function validateDailyPreviewRows(
  rawRows: unknown,
  expected: ExpectedDailyDispatchRecord,
  runtimeSha: string,
  responseSha: string | null | undefined,
  controlledOrderIds?: Iterable<string>,
  evidence?: Evidence,
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
      ownRow.finalStatus === "completed",
    "daily-report-preview-own-order-field-mismatch",
  );

  const dispatchParseable =
    typeof ownRow.firstDispatchAt === "string" &&
    Number.isFinite(Date.parse(ownRow.firstDispatchAt));
  const assignedParseable =
    typeof ownRow.firstAssignedAt === "string" &&
    Number.isFinite(Date.parse(ownRow.firstAssignedAt));
  const etaFinite =
    typeof ownRow.etaSecondsAtAssignment === "number" &&
    Number.isFinite(ownRow.etaSecondsAtAssignment);
  const etaNonnegative = etaFinite && ownRow.etaSecondsAtAssignment >= 0;
  if (!(dispatchParseable && assignedParseable && etaNonnegative) && evidence) {
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
        stage: `daily-report-preview-field-${field}-${presence}-type-${kind}`,
        result: "failed",
      });
      if (field === "etaSecondsAtAssignment") {
        evidence.record({
          stage: `daily-report-preview-field-${field}-finite-${etaFinite}`,
          result: "failed",
        });
        evidence.record({
          stage: `daily-report-preview-field-${field}-nonnegative-${etaNonnegative}`,
          result: "failed",
        });
      } else {
        evidence.record({
          stage: `daily-report-preview-field-${field}-parseable-${field === "firstDispatchAt" ? dispatchParseable : assignedParseable}`,
          result: "failed",
        });
      }
    }
  }
  requireFact(
    dispatchParseable && assignedParseable && etaNonnegative,
    "daily-report-preview-dispatch-assignment-fields-required",
  );

  const complaintCount = integer(
    ownRow.complaintCount,
    "daily-report-preview-complaint-count-integer",
  );
  requireFact(
    complaintCount >= 1,
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
  expected: ExpectedDailyDispatchRecord,
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
      record.finalDriverId === expected.finalDriverId &&
      record.finalVehicleId === expected.finalVehicleId &&
      record.finalPlateNo === expected.finalPlateNo &&
      record.arrivedPickupAt === expected.arrivedPickupAt &&
      record.tripStartedAt === expected.tripStartedAt &&
      record.tripCompletedAt === expected.tripCompletedAt &&
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
  expected: ExpectedDailyDispatchRecord;
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

  const validatedJobRows = validateDailyPreviewRows(
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
        compactPdfText.includes(token),
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

function unwrapEnvelopeObject(bytes: Buffer, stage: string): ObjectData {
  let raw: unknown;
  try {
    raw = camelWire(JSON.parse(bytes.toString("utf8")));
  } catch {
    throw new JourneyFailure(`${stage}:invalid-json`);
  }
  const envelope = object(raw);
  requireFact(envelope.ok === true, `${stage}:envelope-not-ok`);
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
  requireFact(envelope.ok === true, `${stage}:envelope-not-ok`);
  if (Array.isArray(envelope.data)) {
    return records(envelope.data);
  }
  const dataObj = object(envelope.data);
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

export type RunOwnedDailyReportDownloadsParams = {
  context: BrowserContext;
  page: Page;
  opsOrigin: string;
  opsHeaders: (url: string) => Record<string, string>;
  order: ObjectData;
  completedTask: ObjectData;
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

  const expected = resolveExpectedDailyDispatchRecord(order, completedTask, {
    ...(entrySlug === undefined ? {} : { entrySlug }),
    ...(fleetSupplyTenantId === undefined ? {} : { fleetSupplyTenantId }),
    driverId,
    vehicleId,
    plateNo,
    pickupAddress,
    dropoffAddress,
  });
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
    predicate: (exchange: CapturedOpsExchange) => boolean;
    resolve: (exchange: CapturedOpsExchange) => void;
    reject: (error: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
  };
  const waiters: PendingWaiter[] = [];

  const waitForOpsExchange = (
    predicate: (exchange: CapturedOpsExchange) => boolean,
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
      const idx = waiters.findIndex((item) => item.resolve === resolveFn);
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
      for (const waiter of waiters.splice(0, waiters.length)) {
        waiter.reject(error);
      }
      await route.abort("failed").catch(() => undefined);
    }
  };

  await context.route(`${opsOrigin}/**`, routeHandler);
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

    let rebuilt = false;
    if (!previewRows.some((row) => row.orderId === expected.orderId)) {
      const regenerateBtn = page.getByRole("button", {
        name: /^(重算|Regenerate)$/,
      });
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
      rebuilt = true;
    }

    const validatedPreview = validateDailyPreviewRows(
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
        uiOrderRowText.includes(expectedToken),
        "daily-report-ui-preview-row-text-binding",
      );
    }

    evidence.record({
      stage: "daily-report-preview-own-order-verified",
      orderId: expected.orderId,
      driverId: expected.finalDriverId,
      vehicleId: expected.finalVehicleId,
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
      const jobRowsCheck = validateDailyPreviewRows(
        jobDetail.rows,
        expected,
        runtimeSha,
        detailExchange.runtimeSha,
        controlledOrderIdSet,
        evidence,
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

    return Object.freeze({
      definitionSha,
      runtimeSha,
      orderId: expected.orderId,
      orderNo: expected.orderNo,
      serviceDate: expected.serviceDate,
      filters: expectedFilters,
      preview: Object.freeze({
        rebuilt,
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
        finalStatus: "completed",
        complaintCount: validatedPreview.complaintCount,
        runtimeSha,
      }),
      downloads: Object.freeze({
        csv: downloads.csv,
        xlsx: downloads.xlsx,
        pdf: downloads.pdf,
      }),
    });
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
