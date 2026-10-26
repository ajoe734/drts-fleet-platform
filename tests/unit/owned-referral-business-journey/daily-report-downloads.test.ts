import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { describe, expect, it } from "vitest";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import {
  recordsToPdf,
  recordsToXlsx,
} from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import {
  assertDailyReportHttpStatus,
  buildDailyReportFilters,
  DAILY_REPORT_FORMATS,
  DAILY_REPORT_MIME_TYPES,
  DailyReportHttpFailure,
  opsReportJobArtifactPathname,
  opsReportJobDetailPathname,
  parseCsvRecords,
  resolveActiveTripScreenOrder,
  resolveExpectedDailyDispatchRecord,
  runOwnedDailyReportDownloads,
  toTaipeiServiceDate,
  validateDailyPreviewRows,
  validateDailyReportArtifactDownload,
  type DailyReportFormat,
} from "../../e2e/owned-referral-business-journey/daily-report-downloads";
import {
  Evidence,
  hash,
  JourneyFailure,
  type ObjectData,
} from "../../e2e/owned-referral-business-journey/protocol";

const DEFINITION_SHA = "a".repeat(40);
const RUNTIME_SHA = "b".repeat(40);
const OPS_ORIGIN = "https://ops.example.test";
const FLEET_SUPPLY_TENANT_ID = "10000000-0000-0000-0000-000000000201";
const REFERRAL_TENANT_ID = "tenant-demo-001";
const ENTRY_SLUG = "yuhe-residence";
const PARTNER_ID = "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118";
const ORDER_ID = "f84f8629-1452-415d-b2be-b1817b6376a3";
const CONTROLLED_SIBLING_ORDER_ID = "c0947261-8285-4919-8385-531926384712";
const ORDER_NO = "DRT-20261026-0001";
const DRIVER_ID = "drv_synthetic_owned_001";
const VEHICLE_ID = "veh_synthetic_owned_001";
const PLATE_NO = "SIM-R12A0001";
const PICKUP_ADDRESS = "新北市板橋區縣民大道二段7號";
const DROPOFF_ADDRESS = "臺北市信義區市府路1號";

function buildOrderFixture(overrides: Partial<ObjectData> = {}): ObjectData {
  return {
    orderId: ORDER_ID,
    orderNo: ORDER_NO,
    status: "completed",
    orderSource: "portal",
    tenantId: REFERRAL_TENANT_ID,
    partnerId: PARTNER_ID,
    partnerEntrySlug: ENTRY_SLUG,
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "enterprise_dispatch",
    serviceProductCode: "enterprise_dispatch",
    createdAt: "2026-10-25T18:10:00.000Z", // 2026-10-26 02:10:00 Asia/Taipei
    reservationWindowStart: null,
    pickup: { address: PICKUP_ADDRESS },
    dropoff: { address: DROPOFF_ADDRESS },
    assignedDriverId: DRIVER_ID,
    assignedVehicleId: VEHICLE_ID,
    tripCompletion: {
      completedAt: "2026-10-25T18:30:00.000Z",
    },
    ...overrides,
  };
}

function buildTaskFixture(overrides: Partial<ObjectData> = {}): ObjectData {
  return {
    taskId: "tsk_synthetic_owned_001",
    orderId: ORDER_ID,
    driverId: DRIVER_ID,
    vehicleId: VEHICLE_ID,
    status: "completed",
    arrivedPickupAt: "2026-10-25T18:18:00.000Z",
    startedAt: "2026-10-25T18:20:00.000Z",
    completedAt: "2026-10-25T18:30:00.000Z",
    ...overrides,
  };
}

function buildOwnContext() {
  return {
    entrySlug: ENTRY_SLUG,
    fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
    driverId: DRIVER_ID,
    vehicleId: VEHICLE_ID,
    plateNo: PLATE_NO,
    pickupAddress: PICKUP_ADDRESS,
    dropoffAddress: DROPOFF_ADDRESS,
  };
}

function buildDailyDispatchRow(
  overrides: Partial<ObjectData> = {},
): ObjectData {
  return {
    recordId: `daily:${ORDER_ID}`,
    serviceDate: "2026-10-26",
    orderId: ORDER_ID,
    orderNo: ORDER_NO,
    orderSource: "tenant_portal",
    tenantId: REFERRAL_TENANT_ID,
    partnerId: PARTNER_ID,
    serviceProductCode: "enterprise_dispatch",
    requestedAt: "2026-10-25T18:10:00.000Z",
    reservationTime: null,
    pickupAddressSnapshot: PICKUP_ADDRESS,
    dropoffAddressSnapshot: DROPOFF_ADDRESS,
    firstDispatchAt: "2026-10-25T18:11:00.000Z",
    firstAssignedAt: "2026-10-25T18:12:00.000Z",
    finalDriverId: DRIVER_ID,
    finalVehicleId: VEHICLE_ID,
    finalPlateNo: PLATE_NO,
    etaSecondsAtAssignment: 180,
    arrivedPickupAt: "2026-10-25T18:18:00.000Z",
    tripStartedAt: "2026-10-25T18:20:00.000Z",
    tripCompletedAt: "2026-10-25T18:30:00.000Z",
    finalStatus: "completed",
    redispatchCount: 0,
    cancellationReason: null,
    complaintCount: 1,
    generatedAt: "2026-10-25T18:31:00.000Z",
    ...overrides,
  };
}

function buildJobDetailFixture(
  format: DailyReportFormat,
  jobId: string,
  rows: ObjectData[],
  overrides: Partial<ObjectData> = {},
): ObjectData {
  const expected = resolveExpectedDailyDispatchRecord(
    buildOrderFixture(),
    buildTaskFixture(),
    buildOwnContext(),
  );
  const filters = buildDailyReportFilters(expected);
  return {
    jobId,
    jobType: "daily_dispatch_record",
    format,
    status: "completed",
    filters,
    createdAt: "2026-10-25T18:32:00.000Z",
    updatedAt: "2026-10-25T18:32:01.000Z",
    artifact: {
      artifactId: `art_${jobId}`,
      artifactType: "report",
      downloadUrl: `/reports/${encodeURIComponent(jobId)}/artifact`,
      expiresAt: "2026-10-26T18:32:00.000Z",
      manifestHash: "c".repeat(64),
      immutable: true,
      downloadMetadata: null,
    },
    rows,
    ...overrides,
  };
}

async function renderFormatBytes(
  format: DailyReportFormat,
  jobId: string,
  rows: ObjectData[],
): Promise<Buffer> {
  const plainRows = rows as unknown as Record<string, unknown>[];
  if (format === "csv") {
    return Buffer.from(recordsToCsv(plainRows), "utf8");
  }
  if (format === "xlsx") {
    return recordsToXlsx(plainRows, "daily_dispatch_record");
  }
  return recordsToPdf(plainRows, `daily_dispatch_record — ${jobId}`);
}

describe("BUREAU-R12-EXISTING-OWNED-REPORT-DOWNLOAD-COVERAGE-20261025 unit contract", () => {
  it("F6: captures only typed safe non-200 preview status/known route/code/trace before rejecting, never raw body or headers", () => {
    const evidence = new Evidence();
    const secret = "sensitive-customer-and-auth-material";
    const traceId = "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55";
    const exchange = {
      status: 503,
      method: "GET",
      pathname: "/control-plane-proxy/reports/daily-dispatch-records",
      runtimeSha: RUNTIME_SHA,
      bytes: Buffer.from(
        JSON.stringify({
          error: {
            code: "REPORT_READ_FAILED",
            trace_id: traceId,
            message: secret,
            details: { authorization: secret },
          },
        }),
      ),
    };
    expect(() =>
      assertDailyReportHttpStatus(
        exchange,
        "preview",
        [200],
        RUNTIME_SHA,
        evidence,
      ),
    ).toThrow("daily-report-preview-status-200: HTTP 503 REPORT_READ_FAILED");
    expect(evidence.events).toEqual([
      {
        stage: "daily-report-http-preview-get-daily-dispatch-records",
        status: 503,
        code: "REPORT_READ_FAILED",
        objectKey: traceId,
        result: "failed",
      },
    ]);
    expect(JSON.stringify(evidence.events)).not.toContain(secret);

    for (const unsafe of [
      { error: { code: secret, traceId, message: secret } },
      {
        error: { code: "REPORT_READ_FAILED", traceId: secret, message: secret },
      },
      { error: { code: "REPORT_READ_FAILED", traceId, message: secret } },
    ]) {
      const bounded = new Evidence();
      const candidate = {
        ...exchange,
        bytes: Buffer.from(JSON.stringify(unsafe)),
      };
      expect(() =>
        assertDailyReportHttpStatus(
          candidate,
          "preview",
          [200],
          RUNTIME_SHA,
          bounded,
        ),
      ).toThrow(JourneyFailure);
      expect(JSON.stringify(bounded.events)).not.toContain(secret);
    }
    const malformed = new Evidence();
    expect(() =>
      assertDailyReportHttpStatus(
        { ...exchange, bytes: Buffer.from("<html>"), status: 502 },
        "preview",
        [200],
        RUNTIME_SHA,
        malformed,
      ),
    ).toThrow("HTTP 502");
    expect(malformed.events).toEqual([
      {
        stage: "daily-report-http-preview-get-daily-dispatch-records",
        status: 502,
        result: "failed",
      },
    ]);
  });

  it.each([
    ["initial-reports-page", "GET", "/reports", [200]],
    ["initial-jobs", "GET", "/control-plane-proxy/reports/jobs", [200]],
    [
      "rebuild",
      "POST",
      "/control-plane-proxy/reports/daily-dispatch-records/rebuild",
      [200, 201],
    ],
    [
      "rebuilt-preview",
      "GET",
      "/control-plane-proxy/reports/daily-dispatch-records",
      [200],
    ],
    ["create-job-csv", "POST", "/control-plane-proxy/reports/jobs", [200, 201]],
    [
      "create-job-xlsx",
      "POST",
      "/control-plane-proxy/reports/jobs",
      [200, 201],
    ],
    ["create-job-pdf", "POST", "/control-plane-proxy/reports/jobs", [200, 201]],
    ["reload-jobs", "GET", "/control-plane-proxy/reports/jobs", [200]],
    [
      "job-detail-csv",
      "GET",
      "/control-plane-proxy/reports/job_r12_csv",
      [200],
    ],
    [
      "job-detail-xlsx",
      "GET",
      "/control-plane-proxy/reports/job_r12_xlsx",
      [200],
    ],
    [
      "job-detail-pdf",
      "GET",
      "/control-plane-proxy/reports/job_r12_pdf",
      [200],
    ],
    [
      "artifact-download-csv",
      "GET",
      "/control-plane-proxy/reports/job_r12_csv/artifact",
      [200],
    ],
    [
      "artifact-download-xlsx",
      "GET",
      "/control-plane-proxy/reports/job_r12_xlsx/artifact",
      [200],
    ],
    [
      "artifact-download-pdf",
      "GET",
      "/control-plane-proxy/reports/job_r12_pdf/artifact",
      [200],
    ],
  ] as const)(
    "F6: %s non-200 is safely attributed and stops before body parse",
    (phase, method, pathname, accepted) => {
      const evidence = new Evidence();
      const exchange = {
        method,
        pathname,
        status: 403,
        runtimeSha: RUNTIME_SHA,
        bytes: Buffer.from(
          JSON.stringify({
            error: { code: "IAP_SUBJECT_FORBIDDEN", message: "private-value" },
          }),
        ),
      };
      expect(() =>
        assertDailyReportHttpStatus(
          exchange,
          phase,
          accepted,
          RUNTIME_SHA,
          evidence,
        ),
      ).toThrow(DailyReportHttpFailure);
      expect(evidence.events).toMatchObject([
        { status: 403, code: "IAP_SUBJECT_FORBIDDEN", result: "failed" },
      ]);
      expect(JSON.stringify(evidence.events)).not.toContain("private-value");
      const passed = new Evidence();
      assertDailyReportHttpStatus(
        { ...exchange, status: accepted[0]! },
        phase,
        accepted,
        RUNTIME_SHA,
        passed,
      );
      expect(passed.events).toHaveLength(0);
      expect(() =>
        assertDailyReportHttpStatus(
          {
            ...exchange,
            pathname:
              "/control-plane-proxy/reports/other/artifact?token=secret",
          },
          phase,
          accepted,
          RUNTIME_SHA,
          new Evidence(),
        ),
      ).toThrow("daily-report-http-known-route-and-runtime-required");
    },
  );
  it("F1 regression: resolves TripScreen rendered displayOrderNo instead of raw UUID while binding active trip and URL orderId", () => {
    const activeData: ObjectData = {
      trip: {
        orderId: ORDER_ID,
        orderNo: `O-${ORDER_ID}`,
        status: "created",
      },
    };
    const pageUrl = `https://referral.example.test/embed/${ENTRY_SLUG}?state=handoff&screen=trip&orderId=${encodeURIComponent(ORDER_ID)}`;
    const resolved = resolveActiveTripScreenOrder(
      activeData,
      ORDER_ID,
      pageUrl,
      "current UI cancellation",
    );
    expect(resolved.orderId).toBe(ORDER_ID);
    expect(resolved.orderNo).toBe(`O-${ORDER_ID}`);
    expect(resolved.displayOrderNo).toBe("O-F84F8629");
    expect(resolved.displayOrderNo).not.toBe(ORDER_ID);

    const resolvedCanonicalOrderNo = resolveActiveTripScreenOrder(
      {
        trip: {
          orderId: ORDER_ID,
          orderNo: ORDER_NO,
          status: "created",
        },
      },
      ORDER_ID,
      pageUrl,
      "current UI cancellation",
    );
    expect(resolvedCanonicalOrderNo.displayOrderNo).toBe(ORDER_NO);
    expect(resolvedCanonicalOrderNo.displayOrderNo).not.toBe(ORDER_ID);

    // Rejects mismatched active trip orderId
    expect(() =>
      resolveActiveTripScreenOrder(
        {
          trip: {
            orderId: CONTROLLED_SIBLING_ORDER_ID,
            orderNo: CONTROLLED_SIBLING_ORDER_ID,
          },
        },
        ORDER_ID,
        pageUrl,
        "current UI cancellation",
      ),
    ).toThrow("current UI cancellation");

    // Rejects mismatched URL query param orderId
    expect(() =>
      resolveActiveTripScreenOrder(
        activeData,
        ORDER_ID,
        `https://referral.example.test/embed/${ENTRY_SLUG}?state=handoff&screen=trip&orderId=${encodeURIComponent(CONTROLLED_SIBLING_ORDER_ID)}`,
        "current UI cancellation",
      ),
    ).toThrow("current UI cancellation");
  });

  it("F2 regression: derives report tenantId from canonical Referral order even when Fleet supply tenantId differs", () => {
    expect(toTaipeiServiceDate("2026-10-25T18:10:00.000Z")).toBe("2026-10-26");
    expect(REFERRAL_TENANT_ID).not.toBe(FLEET_SUPPLY_TENANT_ID);
    const expected = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    expect(expected).toMatchObject({
      orderId: ORDER_ID,
      orderNo: ORDER_NO,
      serviceDate: "2026-10-26",
      orderSource: "tenant_portal",
      tenantId: REFERRAL_TENANT_ID,
      partnerId: PARTNER_ID,
      serviceProductCode: "enterprise_dispatch",
      pickupAddressSnapshot: PICKUP_ADDRESS,
      dropoffAddressSnapshot: DROPOFF_ADDRESS,
      finalDriverId: DRIVER_ID,
      finalVehicleId: VEHICLE_ID,
      finalPlateNo: PLATE_NO,
      arrivedPickupAt: "2026-10-25T18:18:00.000Z",
      tripStartedAt: "2026-10-25T18:20:00.000Z",
      tripCompletedAt: "2026-10-25T18:30:00.000Z",
      finalStatus: "completed",
    });
    expect(buildDailyReportFilters(expected)).toEqual({
      serviceDateFrom: "2026-10-26",
      serviceDateTo: "2026-10-26",
      orderSource: "tenant_portal",
      tenantId: REFERRAL_TENANT_ID,
      partnerId: PARTNER_ID,
      serviceProductCode: "enterprise_dispatch",
      finalStatus: "completed",
    });

    // Missing order.tenantId must never silently fall back to Fleet supply tenantId
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ tenantId: null }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow("daily-report-synthetic-tenant-id-required");

    // Mismatched partnerEntrySlug must fail
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ partnerEntrySlug: "other-entry" }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow("daily-report-referral-entry-binding");
  });

  it("F3 regression: binds Ops report job detail route to /control-plane-proxy/reports/{jobId} matching ApiClient.getReportJob", () => {
    expect(opsReportJobDetailPathname("job_r12_001")).toBe(
      "/control-plane-proxy/reports/job_r12_001",
    );
    expect(opsReportJobDetailPathname("job_r12_001")).not.toContain(
      "/reports/jobs/",
    );
    expect(opsReportJobArtifactPathname("job_r12_001")).toBe(
      "/control-plane-proxy/reports/job_r12_001/artifact",
    );
  });

  it("rejects incomplete order/task or mismatched own supply when resolving expected record", () => {
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ status: "on_trip" }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow(JourneyFailure);
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture({ arrivedPickupAt: null }),
        buildOwnContext(),
      ),
    ).toThrow(JourneyFailure);
    expect(() =>
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture({ assignedVehicleId: "veh_foreign" }),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    ).toThrow(JourneyFailure);
  });

  it("F5 regression: validates preview rows and distinguishes controlled owned sibling rows from unverified sibling rows", () => {
    const expected = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    const ownRow = buildDailyDispatchRow();
    const controlledSiblingRow = buildDailyDispatchRow({
      recordId: `daily:${CONTROLLED_SIBLING_ORDER_ID}`,
      orderId: CONTROLLED_SIBLING_ORDER_ID,
      orderNo: "DRT-20261026-0002",
    });
    const unverifiedSiblingRow = buildDailyDispatchRow({
      recordId: "daily:ord_unverified_sibling",
      orderId: "ord_unverified_sibling",
      orderNo: "DRT-20261026-0003",
    });

    // When all rows belong to controlledOrderIds, syntheticProvenanceVerified is true
    const verifiedControlled = validateDailyPreviewRows(
      [controlledSiblingRow, ownRow],
      expected,
      RUNTIME_SHA,
      RUNTIME_SHA,
      [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
    );
    expect(verifiedControlled.rowCount).toBe(2);
    expect(verifiedControlled.controlledRowCount).toBe(2);
    expect(verifiedControlled.unverifiedSiblingRowCount).toBe(0);
    expect(verifiedControlled.syntheticProvenanceVerified).toBe(true);
    expect(verifiedControlled.provenanceQualification).toBe(
      "all-rows-controlled-synthetic",
    );
    expect(verifiedControlled.ownRow).toEqual(ownRow);
    expect(verifiedControlled.complaintCount).toBe(1);

    // When an unverified sibling row exists on the same filter scope, own order is verified
    // but syntheticProvenanceVerified is false so raw multi-row files are not retained
    const withUnverifiedSibling = validateDailyPreviewRows(
      [unverifiedSiblingRow, ownRow],
      expected,
      RUNTIME_SHA,
      RUNTIME_SHA,
      [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
    );
    expect(withUnverifiedSibling.rowCount).toBe(2);
    expect(withUnverifiedSibling.controlledRowCount).toBe(1);
    expect(withUnverifiedSibling.unverifiedSiblingRowCount).toBe(1);
    expect(withUnverifiedSibling.syntheticProvenanceVerified).toBe(false);
    expect(withUnverifiedSibling.provenanceQualification).toBe(
      "own-row-verified-unowned-siblings-present-raw-retention-skipped",
    );

    // Missing own order must fail
    expect(() =>
      validateDailyPreviewRows(
        [controlledSiblingRow],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
        [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
      ),
    ).toThrow("daily-report-preview-missing-own-order");

    // Runtime SHA mismatch must fail
    expect(() =>
      validateDailyPreviewRows([ownRow], expected, RUNTIME_SHA, "c".repeat(40)),
    ).toThrow("daily-report-preview-runtime-sha-mismatch");

    // Unqualified foreign tenant/partner row in preview must fail
    expect(() =>
      validateDailyPreviewRows(
        [
          ownRow,
          buildDailyDispatchRow({
            orderId: "ord_foreign_tenant",
            tenantId: "foreign-tenant-999",
          }),
        ],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ),
    ).toThrow("daily-report-preview-unqualified-or-foreign-fixture-row");

    // Plate or arrival timestamp mismatch on own row must fail
    expect(() =>
      validateDailyPreviewRows(
        [buildDailyDispatchRow({ finalPlateNo: "SIM-WRONG99" })],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ),
    ).toThrow("daily-report-preview-own-order-field-mismatch");
  });

  it.each(DAILY_REPORT_FORMATS)(
    "F4 regression: validates genuine %s artifact download against actual ReportArtifactRecord contract and owned order content",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const ownRow = buildDailyDispatchRow();
      const jobId = `job_r12_${format}_001`;
      const jobDetail = buildJobDetailFixture(format, jobId, [ownRow]);
      expect(jobDetail.artifact).not.toHaveProperty("format");
      expect(jobDetail.artifact).not.toHaveProperty("fileName");
      const bytes = await renderFormatBytes(format, jobId, [ownRow]);
      const fileName = `daily_dispatch_record-${jobId}.${format}`;

      const summary = await validateDailyReportArtifactDownload({
        format,
        jobId,
        jobDetail,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: `${DAILY_REPORT_MIME_TYPES[format]}; charset=utf-8`,
        contentDisposition: `attachment; filename="${fileName}"`,
        bytes,
        expected,
        previewOwnRow: ownRow,
        runtimeSha: RUNTIME_SHA,
        artifactPath: `.artifacts/owned-referral-business-journey/daily-reports/daily-dispatch-${jobId}.${format}`,
        controlledOrderIds: [ORDER_ID],
        nowMs: Date.parse("2026-10-25T19:00:00.000Z"),
      });

      expect(summary).toMatchObject({
        format,
        jobId,
        jobType: "daily_dispatch_record",
        jobStatus: "completed",
        contentType: DAILY_REPORT_MIME_TYPES[format],
        fileName,
        bytes: bytes.length,
        sha256: hash(bytes),
        rowCount: 1,
        controlledRowCount: 1,
        unverifiedSiblingRowCount: 0,
        ownOrderPresent: true,
        syntheticProvenanceVerified: true,
        rawArtifactRetained: true,
        provenanceQualification: "all-rows-controlled-synthetic",
        runtimeSha: RUNTIME_SHA,
      });
      expect(summary.contentSignature.matchedExpectedRender).toBe(true);
      if (format === "xlsx") {
        expect(summary.contentSignature.worksheetName).toBe(
          "daily_dispatch_record",
        );
      }
      if (format === "pdf") {
        expect(summary.contentSignature.pageCount).toBeGreaterThanOrEqual(1);
      }
    },
  );

  it.each(DAILY_REPORT_FORMATS)(
    "rejects 200 HTML error bodies, JSON error bodies, wrong MIME, invalid ReportArtifactRecord metadata, and tampered content for %s",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const ownRow = buildDailyDispatchRow();
      const jobId = `job_r12_${format}_neg`;
      const jobDetail = buildJobDetailFixture(format, jobId, [ownRow]);
      const validBytes = await renderFormatBytes(format, jobId, [ownRow]);
      const fileName = `daily_dispatch_record-${jobId}.${format}`;
      const baseInput = {
        format,
        jobId,
        jobDetail,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: DAILY_REPORT_MIME_TYPES[format],
        contentDisposition: `attachment; filename="${fileName}"`,
        bytes: validBytes,
        expected,
        previewOwnRow: ownRow,
        runtimeSha: RUNTIME_SHA,
        artifactPath: `.artifacts/owned-referral-business-journey/daily-reports/daily-dispatch-${jobId}.${format}`,
        controlledOrderIds: [ORDER_ID],
        nowMs: Date.parse("2026-10-25T19:00:00.000Z"),
      };

      // 1. 200 HTML body must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          bytes: Buffer.from(
            "<!DOCTYPE html><html><body>502 Bad Gateway</body></html>",
            "utf8",
          ),
        }),
      ).rejects.toThrow(`daily-report-${format}-html-body-rejected`);

      // 2. 200 JSON error body must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          bytes: Buffer.from(
            JSON.stringify({ ok: false, error: { code: "NOT_FOUND" } }),
            "utf8",
          ),
        }),
      ).rejects.toThrow(`daily-report-${format}-json-error-body-rejected`);

      // 3. Wrong MIME type must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          contentType: "text/html",
        }),
      ).rejects.toThrow(`daily-report-${format}-content-type-mismatch`);

      // 4. Incomplete job status must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          jobDetail: buildJobDetailFixture(format, jobId, [ownRow], {
            status: "running",
          }),
        }),
      ).rejects.toThrow(`daily-report-${format}-completed-job-detail-binding`);

      // 5. Expired artifact must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          nowMs: Date.parse("2026-10-27T00:00:00.000Z"),
        }),
      ).rejects.toThrow(
        `daily-report-${format}-artifact-unexpired-metadata-binding`,
      );

      // 6. Wrong ReportArtifactRecord downloadUrl or immutable=false must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          jobDetail: buildJobDetailFixture(format, jobId, [ownRow], {
            artifact: {
              artifactId: `art_${jobId}`,
              artifactType: "report",
              downloadUrl: `/api/downloads/report_job/${jobId}`,
              expiresAt: "2026-10-26T18:32:00.000Z",
              manifestHash: "c".repeat(64),
              immutable: true,
            },
          }),
        }),
      ).rejects.toThrow(
        `daily-report-${format}-artifact-unexpired-metadata-binding`,
      );

      // 7. Candidate runtimeSha mismatch on artifact response must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          artifactResponseSha: "f".repeat(40),
        }),
      ).rejects.toThrow(`daily-report-${format}-runtime-sha-mismatch`);

      // 8. Downloaded file rendered from a foreign order (missing own orderId) must be rejected
      const foreignRow = buildDailyDispatchRow({
        orderId: "ord_other_synthetic",
        orderNo: "DRT-20261026-9999",
      });
      const foreignBytes = await renderFormatBytes(format, jobId, [foreignRow]);
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          bytes: foreignBytes,
        }),
      ).rejects.toThrow(JourneyFailure);
    },
  );

  it("parses quoted CSV fields with commas and escaped quotes accurately", () => {
    const csv = recordsToCsv([
      {
        orderId: ORDER_ID,
        pickupAddressSnapshot: '新北市, "板橋區" 縣民大道',
      },
    ]);
    const parsed = parseCsvRecords(csv);
    expect(parsed).toEqual([
      {
        orderId: ORDER_ID,
        pickupAddressSnapshot: '新北市, "板橋區" 縣民大道',
      },
    ]);
  });

  it("blocks RECOVERY_ONLY from running the full-journey daily report phase", async () => {
    const evidence = new Evidence();
    await expect(
      runOwnedDailyReportDownloads({
        context: {} as BrowserContext,
        page: {} as Page,
        opsOrigin: OPS_ORIGIN,
        opsHeaders: () => ({}),
        order: buildOrderFixture(),
        completedTask: buildTaskFixture(),
        entrySlug: ENTRY_SLUG,
        fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
        driverId: DRIVER_ID,
        vehicleId: VEHICLE_ID,
        plateNo: PLATE_NO,
        pickupAddress: PICKUP_ADDRESS,
        dropoffAddress: DROPOFF_ADDRESS,
        directory: ".artifacts/owned-referral-business-journey",
        definitionSha: DEFINITION_SHA,
        runtimeSha: RUNTIME_SHA,
        recoveryOnly: true,
        evidence,
      }),
    ).rejects.toThrow(
      "daily-report-recovery-only-must-not-run-full-journey-reports",
    );
    expect(evidence.events).toHaveLength(0);
  });

  it.each([
    {
      caseName:
        "actual Ops reports page returns 500 without mounting the jobs list",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: false,
      expectedRetained: false,
      previewFailure: "page",
    },
    {
      caseName:
        "actual Ops job detail returns 404 without requesting the artifact",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
      previewFailure: "detail",
    },
    {
      caseName: "actual Ops preview returns non-200 with private error payload",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: false,
      expectedRetained: false,
      previewFailure: true,
    },
    {
      caseName: "all sibling rows belong to controlled owned orders",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "unverified sibling row exists on the same filter scope (skips raw file persistence)",
      previewSiblingOrderId: "ord_unverified_sibling_999",
      jobSiblingOrderId: "ord_unverified_sibling_999",
      expectedPreviewControlled: false,
      expectedRetained: false,
    },
    {
      caseName:
        "preview has unverified sibling but independently executed job has only controlled rows",
      previewSiblingOrderId: "ord_unverified_sibling_999",
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: false,
      expectedRetained: true,
    },
    {
      caseName:
        "preview is controlled but independently executed job has unverified sibling",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: "ord_unverified_sibling_999",
      expectedPreviewControlled: true,
      expectedRetained: false,
    },
  ])(
    "drives preview rebuild, 3-format job creation, /reports reload, and 3 artifact downloads in a socket-free harness ($caseName)",
    async ({
      previewSiblingOrderId,
      jobSiblingOrderId,
      expectedPreviewControlled,
      expectedRetained,
      previewFailure,
    }) => {
      const tempDir = await mkdtemp(
        path.join(tmpdir(), "owned-daily-reports-test-"),
      );
      try {
        const ownRow = buildDailyDispatchRow();
        const siblingRow = (orderId: string) =>
          buildDailyDispatchRow({
            recordId: `daily:${orderId}`,
            orderId,
            orderNo: "DRT-20261026-0000",
          });
        const previewSiblingRow = siblingRow(previewSiblingOrderId);
        const jobSiblingRow = siblingRow(jobSiblingOrderId);

        let routeHandler: ((route: Route) => Promise<void>) | undefined;
        let unrouteCalled = false;
        let artifactRequests = 0;
        let initialJobsRequests = 0;
        let rebuiltInBackend = false;
        let selectedFormat: DailyReportFormat = "csv";
        let dateFromVal = "";
        let dateToVal = "";
        let orderSourceVal = "";
        let statusVal = "";
        let tenantVal = "";
        let partnerVal = "";
        let serviceProductVal = "";
        let lastAcceptedJobId = "";
        const createdJobs: Array<{
          format: DailyReportFormat;
          jobId: string;
          detail: ObjectData;
          bytes: Buffer;
        }> = [];

        const dispatchRoute = async (
          method: string,
          url: string,
          postData: string | null,
          responseStatus: number,
          responseHeaders: Record<string, string>,
          responseBytes: Buffer,
        ) => {
          if (!routeHandler) throw new Error("routeHandler not registered");
          const route = {
            request: () => ({
              method: () => method,
              url: () => url,
              postData: () => postData,
              headers: () => ({ accept: "*/*" }),
            }),
            fetch: async (options?: { headers?: Record<string, string> }) => {
              expect(options?.headers?.["x-drts-authorization"]).toBe(
                "Bearer synthetic-ops-jwt",
              );
              expect(options?.headers?.["X-Serverless-Authorization"]).toBe(
                "Bearer synthetic-ops-cloud",
              );
              return {
                status: () => responseStatus,
                url: () => url,
                headers: () => ({
                  "x-drts-candidate-sha": RUNTIME_SHA,
                  ...responseHeaders,
                }),
                body: async () => responseBytes,
              };
            },
            fulfill: async () => undefined,
            abort: async () => undefined,
          } as unknown as Route;
          await routeHandler(route);
        };

        const makeLocator = (spec: {
          count?: () => Promise<number>;
          innerText?: () => Promise<string>;
          click?: () => Promise<void>;
          fill?: (val: string) => Promise<void>;
          selectOption?: (val: string) => Promise<string[]>;
          getByRole?: Page["getByRole"];
        }): Locator => {
          const self: Record<string, unknown> = {
            first: () => self as unknown as Locator,
            nth: (idx: number) =>
              makeLocator({
                ...spec,
                fill: async (val: string) => {
                  if (idx === 0) dateFromVal = val;
                  else dateToVal = val;
                },
              }),
            waitFor: async () => undefined,
            isEnabled: async () => true,
            count: spec.count ?? (async () => 1),
            innerText: spec.innerText ?? (async () => ""),
            click: spec.click ?? (async () => undefined),
            fill: spec.fill ?? (async () => undefined),
            selectOption:
              spec.selectOption ?? (async (val: unknown) => [String(val)]),
            getByRole: spec.getByRole,
          };
          return self as unknown as Locator;
        };

        const fakePage: Partial<Page> = {
          goto: async (url: string) => {
            await dispatchRoute(
              "GET",
              url,
              null,
              previewFailure === "page" ? 500 : 200,
              { "content-type": "text/html" },
              previewFailure === "page"
                ? Buffer.from("<html>private-page-error</html>")
                : Buffer.from("<html></html>"),
            );
            // A failed document never mounts the real Ops page and therefore
            // cannot issue the dependent client-side jobs list request.
            if (previewFailure === "page") return null;
            initialJobsRequests += 1;
            const jobsPayload = {
              ok: true,
              data: {
                items: createdJobs.map((j) => j.detail),
              },
            };
            await dispatchRoute(
              "GET",
              `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
              null,
              200,
              { "content-type": "application/json" },
              Buffer.from(JSON.stringify(jobsPayload)),
            );
            return null;
          },
          getByRole: (_role, options) => {
            const namePattern = options?.name;
            const matches = (textVal: string) =>
              namePattern instanceof RegExp
                ? namePattern.test(textVal)
                : namePattern === textVal;
            if (matches("載入預覽")) {
              return makeLocator({
                click: async () => {
                  const query = new URLSearchParams({
                    serviceDateFrom: dateFromVal,
                    serviceDateTo: dateToVal,
                    orderSource: orderSourceVal,
                    finalStatus: statusVal,
                    tenantId: tenantVal,
                    partnerId: partnerVal,
                    serviceProductCode: serviceProductVal,
                  });
                  const rows = rebuiltInBackend
                    ? [previewSiblingRow, ownRow]
                    : [previewSiblingRow];
                  await dispatchRoute(
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                    null,
                    previewFailure === true ? 503 : 200,
                    { "content-type": "application/json" },
                    Buffer.from(
                      JSON.stringify(
                        previewFailure === true
                          ? {
                              error: {
                                code: "REPORT_READ_FAILED",
                                trace_id:
                                  "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                                message: "private-error-message",
                              },
                            }
                          : { ok: true, data: { items: rows } },
                      ),
                    ),
                  );
                },
              });
            }
            if (matches("重算")) {
              return makeLocator({
                click: async () => {
                  rebuiltInBackend = true;
                  const bodyObj = {
                    serviceDateFrom: dateFromVal,
                    serviceDateTo: dateToVal,
                    orderSource: orderSourceVal,
                    finalStatus: statusVal,
                    tenantId: tenantVal,
                    partnerId: partnerVal,
                    serviceProductCode: serviceProductVal,
                  };
                  await dispatchRoute(
                    "POST",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records/rebuild`,
                    JSON.stringify(bodyObj),
                    200,
                    { "content-type": "application/json" },
                    Buffer.from(
                      JSON.stringify({
                        ok: true,
                        data: {
                          rebuiltCount: 2,
                          generatedAt: "2026-10-25T18:31:00.000Z",
                        },
                      }),
                    ),
                  );
                  const query = new URLSearchParams(bodyObj);
                  await dispatchRoute(
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                    null,
                    200,
                    { "content-type": "application/json" },
                    Buffer.from(
                      JSON.stringify({
                        ok: true,
                        data: { items: [previewSiblingRow, ownRow] },
                      }),
                    ),
                  );
                },
              });
            }
            if (matches("匯出工作")) {
              return makeLocator({
                click: async () => {
                  const format = selectedFormat;
                  const jobId = `job_harness_${format}`;
                  lastAcceptedJobId = jobId;
                  const rows = [jobSiblingRow, ownRow];
                  const detail = buildJobDetailFixture(format, jobId, rows);
                  const bytes = await renderFormatBytes(format, jobId, rows);
                  createdJobs.push({ format, jobId, detail, bytes });
                  const reqBody = {
                    jobType: "daily_dispatch_record",
                    format,
                    filters: {
                      serviceDateFrom: dateFromVal,
                      serviceDateTo: dateToVal,
                      orderSource: orderSourceVal,
                      finalStatus: statusVal,
                      tenantId: tenantVal,
                      partnerId: partnerVal,
                      serviceProductCode: serviceProductVal,
                    },
                  };
                  await dispatchRoute(
                    "POST",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
                    JSON.stringify(reqBody),
                    201,
                    { "content-type": "application/json" },
                    Buffer.from(
                      JSON.stringify({
                        ok: true,
                        data: {
                          jobId,
                          status: "completed",
                          acceptedAt: "2026-10-25T18:32:00.000Z",
                        },
                      }),
                    ),
                  );
                },
              });
            }
            return makeLocator({});
          },
          getByText: (textVal) =>
            makeLocator({
              innerText: async () => String(textVal),
              count: async () =>
                String(textVal) === lastAcceptedJobId ? 1 : 0,
            }),
          locator: (selector: string) => {
            if (selector === 'input[type="date"]') {
              return makeLocator({ count: async () => 2 });
            }
            if (selector === 'input[placeholder="tenant_001"]') {
              return makeLocator({
                fill: async (val) => {
                  tenantVal = val;
                },
              });
            }
            if (selector === 'input[placeholder="partner_001"]') {
              return makeLocator({
                fill: async (val) => {
                  partnerVal = val;
                },
              });
            }
            if (selector === 'input[placeholder="wheelchair_van"]') {
              return makeLocator({
                fill: async (val) => {
                  serviceProductVal = val;
                },
              });
            }
            if (selector === "select") {
              return {
                filter: (opts: { has?: Locator }) => {
                  const tag = (opts.has as unknown as { _option?: string })
                    ?._option;
                  return makeLocator({
                    selectOption: async (val) => {
                      const str = String(val);
                      if (tag === "tenant_portal") orderSourceVal = str;
                      else if (tag === "completed") statusVal = str;
                      else if (tag === "xlsx")
                        selectedFormat = str as DailyReportFormat;
                      return [str];
                    },
                  });
                },
              } as unknown as Locator;
            }
            if (selector.startsWith("option[value=")) {
              const match = /option\[value="([^"]+)"\]/.exec(selector);
              return { _option: match?.[1] } as unknown as Locator;
            }
            if (selector === "tbody tr") {
              return {
                filter: (opts: { hasText?: string | RegExp }) => {
                  const target = String(opts.hasText ?? "");
                  if (target === ORDER_ID) {
                    return makeLocator({
                      count: async () => 1,
                      innerText: async () =>
                        `${ORDER_ID} ${ORDER_NO} 2026-10-26 ${PICKUP_ADDRESS} ${DROPOFF_ADDRESS} ${DRIVER_ID} ${VEHICLE_ID} ${PLATE_NO}`,
                    });
                  }
                  const foundJob = createdJobs.find((j) => j.jobId === target);
                  return makeLocator({
                    count: async () => (foundJob ? 1 : 0),
                    innerText: async () =>
                      foundJob
                        ? `${foundJob.jobId} ${foundJob.format.toUpperCase()} 已完成`
                        : "",
                    getByRole: () =>
                      makeLocator({
                        click: async () => {
                          if (!foundJob) throw new Error("missing job");
                          await dispatchRoute(
                            "GET",
                            `${OPS_ORIGIN}${opsReportJobDetailPathname(foundJob.jobId)}`,
                            null,
                            previewFailure === "detail" ? 404 : 200,
                            { "content-type": "application/json" },
                            Buffer.from(
                              JSON.stringify(
                                previewFailure === "detail"
                                  ? {
                                      error: {
                                        code: "REPORT_JOB_NOT_FOUND",
                                        trace_id:
                                          "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                                        message: "private-detail-error",
                                      },
                                    }
                                  : { ok: true, data: foundJob.detail },
                              ),
                            ),
                          );
                          // ApiClient.getReportJob throws for 404; the Ops
                          // click handler never calls openDownload in this case.
                          if (previewFailure === "detail") return;
                          artifactRequests += 1;
                          const fileName = `daily_dispatch_record-${foundJob.jobId}.${foundJob.format}`;
                          await dispatchRoute(
                            "GET",
                            `${OPS_ORIGIN}${opsReportJobArtifactPathname(foundJob.jobId)}`,
                            null,
                            200,
                            {
                              "content-type":
                                DAILY_REPORT_MIME_TYPES[foundJob.format],
                              "content-disposition": `attachment; filename="${fileName}"`,
                            },
                            foundJob.bytes,
                          );
                        },
                      }),
                  });
                },
              } as unknown as Locator;
            }
            return makeLocator({});
          },
        };

        const fakeContext = {
          route: async (_pattern: unknown, handler: unknown) => {
            routeHandler = handler as (route: Route) => Promise<void>;
          },
          unroute: async () => {
            unrouteCalled = true;
            routeHandler = undefined;
          },
          pages: () => [fakePage as Page],
        } as unknown as BrowserContext;

        const evidence = new Evidence();
        const run = runOwnedDailyReportDownloads({
          context: fakeContext,
          page: fakePage as Page,
          opsOrigin: OPS_ORIGIN,
          opsHeaders: () => ({
            "X-Serverless-Authorization": "Bearer synthetic-ops-cloud",
            "x-drts-authorization": "Bearer synthetic-ops-jwt",
          }),
          order: buildOrderFixture(),
          completedTask: buildTaskFixture(),
          entrySlug: ENTRY_SLUG,
          fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
          controlledOrderIds: [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
          driverId: DRIVER_ID,
          vehicleId: VEHICLE_ID,
          plateNo: PLATE_NO,
          pickupAddress: PICKUP_ADDRESS,
          dropoffAddress: DROPOFF_ADDRESS,
          directory: tempDir,
          definitionSha: DEFINITION_SHA,
          runtimeSha: RUNTIME_SHA,
          recoveryOnly: false,
          evidence,
        });
        if (previewFailure === "page" || previewFailure === "detail") {
          const initialPage = previewFailure === "page";
          await expect(run).rejects.toBeInstanceOf(DailyReportHttpFailure);
          await expect(run).rejects.toMatchObject({
            stage: initialPage
              ? "daily-report-ops-reports-initial-load-200"
              : "daily-report-job-detail-csv-http-status-200-required",
            status: initialPage ? 500 : 404,
            code: initialPage ? undefined : "REPORT_JOB_NOT_FOUND",
            context: {
              phase: initialPage ? "initial-reports-page" : "job-detail-csv",
              method: "GET",
              route: initialPage ? "reports-page" : "job-detail",
              runtimeSha: RUNTIME_SHA,
              ...(initialPage
                ? {}
                : {
                    requestId: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                  }),
            },
          });
          expect(evidence.events).toContainEqual(
            initialPage
              ? {
                  stage:
                    "daily-report-http-initial-reports-page-get-reports-page",
                  status: 500,
                  result: "failed",
                }
              : {
                  stage: "daily-report-http-job-detail-csv-get-job-detail",
                  status: 404,
                  code: "REPORT_JOB_NOT_FOUND",
                  objectKey: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                  result: "failed",
                },
          );
          expect(initialJobsRequests).toBe(initialPage ? 0 : 2);
          expect(createdJobs).toHaveLength(initialPage ? 0 : 3);
          expect(artifactRequests).toBe(0);
          expect(unrouteCalled).toBe(true);
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-detail-error",
          );
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-page-error",
          );
          await expect(
            stat(path.join(tempDir, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (previewFailure === true) {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-preview-status-200",
            status: 503,
            code: "REPORT_READ_FAILED",
            context: {
              phase: "preview",
              method: "GET",
              route: "daily-dispatch-records",
              runtimeSha: RUNTIME_SHA,
              requestId: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
            },
          });
          expect(evidence.events).toContainEqual({
            stage: "daily-report-http-preview-get-daily-dispatch-records",
            status: 503,
            code: "REPORT_READ_FAILED",
            objectKey: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
            result: "failed",
          });
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-error-message",
          );
          expect(createdJobs).toHaveLength(0);
          await expect(
            stat(path.join(tempDir, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        const result = await run;

        expect(result.orderId).toBe(ORDER_ID);
        expect(result.serviceDate).toBe("2026-10-26");
        expect(result.filters.tenantId).toBe(REFERRAL_TENANT_ID);
        expect(result.preview.rebuilt).toBe(true);
        expect(result.preview.rowCount).toBe(2);
        expect(result.preview.syntheticProvenanceVerified).toBe(
          expectedPreviewControlled,
        );
        expect(result.preview.controlledRowCount).toBe(
          expectedPreviewControlled ? 2 : 1,
        );
        expect(result.preview.unverifiedSiblingRowCount).toBe(
          expectedPreviewControlled ? 0 : 1,
        );
        expect(result.preview.finalPlateNo).toBe(PLATE_NO);

        for (const format of DAILY_REPORT_FORMATS) {
          const dl = result.downloads[format];
          expect(dl.jobId).toBe(`job_harness_${format}`);
          expect(dl.runtimeSha).toBe(RUNTIME_SHA);
          expect(dl.syntheticProvenanceVerified).toBe(expectedRetained);
          expect(dl.rawArtifactRetained).toBe(expectedRetained);
          expect(dl.controlledRowCount).toBe(expectedRetained ? 2 : 1);
          expect(dl.unverifiedSiblingRowCount).toBe(expectedRetained ? 0 : 1);
          expect(
            evidence.events.some(
              (event) =>
                event.stage ===
                `daily-report-download-${format}-raw-retention-skipped`,
            ),
          ).toBe(!expectedRetained);
          if (expectedRetained) {
            expect(dl.artifactPath).not.toBeNull();
            const onDisk = await readFile(dl.artifactPath!);
            expect(hash(onDisk)).toBe(dl.sha256);
            expect(onDisk.length).toBe(dl.bytes);
          } else {
            expect(dl.artifactPath).toBeNull();
            await expect(
              stat(path.join(tempDir, "daily-reports")),
            ).rejects.toThrow();
          }
        }

        expect(JSON.stringify(result)).not.toContain("synthetic-ops-jwt");
        expect(JSON.stringify(evidence.events)).not.toContain(
          "synthetic-ops-jwt",
        );
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    22_000,
  );
});
