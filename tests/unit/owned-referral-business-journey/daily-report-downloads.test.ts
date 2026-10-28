import { globSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { BrowserContext, Locator, Page, Route } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  toApiErrorEnvelope,
  toApiListData,
  toApiSuccessEnvelope,
} from "../../../apps/api/src/common/api-envelope";
import { recordsToCsv } from "../../../apps/api/src/common/csv";
import { deepToSnakeCase } from "../../../apps/api/src/common/snake-case.interceptor";
import {
  recordsToPdf,
  recordsToXlsx,
} from "../../../apps/api/src/modules/reporting-filing/report-renderers";
import {
  assertDailyReportHttpStatus,
  buildDailyReportFilters,
  adjacentEmptyDayFromSource,
  countCanonicalDailySource,
  validateEmptyDailyReportArtifactDownload,
  DAILY_REPORT_FORMATS,
  DAILY_REPORT_MIME_TYPES,
  DailyReportHttpFailure,
  opsReportJobArtifactPathname,
  opsReportJobDetailPathname,
  parseCsvRecords,
  resolveActiveTripScreenOrder,
  resolveExpectedDailyDispatchRecord,
  runOwnedDailyReportDownloads,
  ownedSupplementalArtifactPaths,
  toTaipeiServiceDate,
  validateDailyPreviewRows,
  validateSupplementalDailyPreviewRows,
  resolveExpectedCancelledDailyDispatchRecord,
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

describe("managed FULL hosted supplemental artifact custody", () => {
  it("selects every controlled format, independent journal and custody while excluding private siblings", async () => {
    const workflow = await readFile(
      new URL("../../../.github/workflows/ci-integ.yml", import.meta.url),
      "utf8",
    );
    // Exercise the actual existing upload block, not a copied allowlist.
    const upload = workflow.match(
      /- name: Preserve only this consumer's allowlisted evidence\n([\s\S]*?)retention-days: 14/,
    )?.[1];
    expect(upload).toBeDefined();
    const paths = upload!.match(/ {10}path: \|\n((?: {12}[^\n]+\n)+)/)?.[1];
    expect(paths).toBeDefined();
    const patterns = paths!
      .trim()
      .split("\n")
      .map((line) => line.trim());
    const root = ".artifacts/owned-referral-business-journey";
    const supplemental = ownedSupplementalArtifactPaths(root);
    const legacy = [
      "runtime-before.json",
      "runtime-after.json",
      "journey-evidence.json",
      "booking-write-journal.json",
      "own-receipt.txt",
      "cancellations/unassigned-facts.json",
      "cancellations/unassigned-booking-write-journal.json",
      "cancellations/results.json",
      "cancellations/unassigned.png",
      ...DAILY_REPORT_FORMATS.map(
        (format) => `daily-reports/daily-dispatch-original.${format}`,
      ),
    ].map((file) => `${root}/${file}`);
    const retained = [
      ...legacy,
      supplemental.custody,
      ...Object.values(supplemental.bookingJournals),
      ...Object.values(supplemental.reportDirectories).flatMap((directory) =>
        DAILY_REPORT_FORMATS.map(
          (format) =>
            `${directory}/daily-reports/daily-dispatch-job-owned.${format}`,
        ),
      ),
    ];
    const excluded = [
      `${root}/TEN03-06/reservation-1/quote.json`,
      `${root}/TEN03-06/reservation-2/cancellation.json`,
      `${root}/TEN03-06/redispatched/assignment-trace.json`,
      `${root}/TEN03-06/redispatched/actions.json`,
      `${root}/TEN03-06/C1-no-dispatch-source.json`,
      `${root}/TEN03-06/reservation-1/order.json`,
      `${root}/TEN03-06/reservation-1/session.json`,
      `${root}/TEN03-06/reservation-1/tokens.json`,
      `${root}/TEN03-06/reservation-1/booking-write-journal.json.tmp`,
      `${root}/TEN03-06/reservation-1/daily-reports/raw-unowned.csv`,
      `${root}/TEN03-06/reservation-1/daily-reports/daily-dispatch-owned.json`,
      `${root}/TEN03-06/reservation-1/private/daily-reports/daily-dispatch-job.csv`,
      `${root}/TEN03-06/unregistered-case/booking-write-journal.json`,
      `${root}/TEN03-06/unregistered-case/daily-reports/daily-dispatch-job.csv`,
      `${root}/session.json`,
      `${root}/order.json`,
    ];
    const directory = await mkdtemp(
      path.join(tmpdir(), "owned-upload-custody-"),
    );
    try {
      // Glob selection has no content knowledge. The original renderer/row
      // orchestration tests below verify that unowned bytes are never written.
      for (const file of [...retained, ...excluded]) {
        const target = path.join(directory, file);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, `fixture:${file}`, { mode: 0o600 });
      }
      const selected = globSync(patterns, { cwd: directory }).sort();
      expect(selected).toEqual([...retained].sort());
      for (const file of excluded) expect(selected).not.toContain(file);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

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

// Preserve the real API success producer and global wire interceptor in the
// socket-free harness; only the browser/transport are simulated below.
function successWireBytes(data: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(
      deepToSnakeCase(
        toApiSuccessEnvelope(data, "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55"),
      ),
    ),
  );
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

function cancelledCase() {
  const raw = JSON.stringify({ entrySlug: ENTRY_SLUG, quoteId: "quote-C1" });
  const order = buildOrderFixture({
    status: "cancelled",
    assignedDriverId: null,
    assignedVehicleId: null,
    tripCompletion: null,
    cancelledAt: "2026-10-25T18:11:00.000Z",
    cancelReason: null,
  });
  const expected = resolveExpectedCancelledDailyDispatchRecord(
    order,
    {
      state: "acknowledged",
      orderId: ORDER_ID,
      quoteId: "quote-C1",
      entrySlug: ENTRY_SLUG,
      body: raw,
      bodySha256: hash(Buffer.from(raw)),
    },
    buildOwnContext(),
  );
  const row = buildDailyDispatchRow({
    ...expected,
    firstDispatchAt: null,
    firstAssignedAt: null,
    etaSecondsAtAssignment: null,
    complaintCount: 0,
  });
  delete row.caseKind;
  return { order, expected, row };
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

  it.each([
    ["firstDispatchAt", {}, "absent", "undefined", false],
    ["firstDispatchAt", { firstDispatchAt: null }, "present", "null", false],
    ["firstDispatchAt", { firstDispatchAt: 123 }, "present", "number", false],
    [
      "firstDispatchAt",
      { firstDispatchAt: "secret-invalid-dispatch" },
      "present",
      "string",
      false,
    ],
    ["firstAssignedAt", {}, "absent", "undefined", false],
    ["firstAssignedAt", { firstAssignedAt: null }, "present", "null", false],
    ["firstAssignedAt", { firstAssignedAt: 123 }, "present", "number", false],
    [
      "firstAssignedAt",
      { firstAssignedAt: "secret-invalid-assignment" },
      "present",
      "string",
      false,
    ],
    ["etaSecondsAtAssignment", {}, "absent", "undefined", false],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: null },
      "present",
      "null",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: "secret-invalid-eta" },
      "present",
      "string",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: NaN },
      "present",
      "number",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: Infinity },
      "present",
      "number",
      false,
    ],
    [
      "etaSecondsAtAssignment",
      { etaSecondsAtAssignment: -1 },
      "present",
      "number",
      true,
    ],
  ] as const)(
    "classifies invalid own row %s at real preview validator boundary (%s)",
    (field, overrides, presence, kind, finite) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const row = buildDailyDispatchRow(overrides);
      if (presence === "absent") delete row[field];
      const evidence = new Evidence();
      expect(() =>
        validateDailyPreviewRows(
          [row],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
          [ORDER_ID],
          evidence,
        ),
      ).toThrow("daily-report-preview-dispatch-assignment-fields-required");
      const diagnostic = JSON.stringify(evidence.events);
      expect(evidence.events).toHaveLength(7);
      expect(diagnostic).toContain(
        `daily-report-preview-field-${field}-${presence}-type-${kind}`,
      );
      if (field === "etaSecondsAtAssignment") {
        expect(diagnostic).toContain(
          `daily-report-preview-field-${field}-finite-${finite}`,
        );
        const etaValue = row[field];
        expect(diagnostic).toContain(
          `daily-report-preview-field-${field}-nonnegative-${finite && typeof etaValue === "number" && etaValue >= 0}`,
        );
      } else {
        expect(diagnostic).toContain(
          `daily-report-preview-field-${field}-parseable-false`,
        );
      }
      // All three fixed fields must be classified; no raw value or identifier is logged.
      for (const key of [
        "firstDispatchAt",
        "firstAssignedAt",
        "etaSecondsAtAssignment",
      ]) {
        expect(diagnostic).toContain(`daily-report-preview-field-${key}-`);
      }
      for (const privateValue of [
        "secret-invalid",
        ORDER_ID,
        PICKUP_ADDRESS,
        "2026-10-25T18:11:00.000Z",
      ]) {
        expect(diagnostic).not.toContain(privateValue);
      }
    },
  );

  it.each([0, 180])(
    "accepts valid ETA %i with parseable timestamps without diagnostic events",
    (eta) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const evidence = new Evidence();
      expect(
        validateDailyPreviewRows(
          [buildDailyDispatchRow({ etaSecondsAtAssignment: eta })],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
          [ORDER_ID],
          evidence,
        ).ownRow.etaSecondsAtAssignment,
      ).toBe(eta);
      expect(evidence.events).toEqual([]);
    },
  );

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

  it("TEN02: selects only a genuinely empty adjacent day from complete canonical owned orders with exact Taipei/source/product/status filters", () => {
    const positive = buildDailyReportFilters(
      resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      ),
    );
    const source = {
      items: [
        buildOrderFixture(),
        buildOrderFixture({
          orderId: "unrelated-product",
          serviceProductCode: "other",
          businessDispatchSubtype: "other",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
        buildOrderFixture({
          orderId: "unrelated-status",
          status: "cancelled",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
        buildOrderFixture({
          orderId: "unrelated-tenant",
          tenantId: "other",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
      ],
    };
    expect(countCanonicalDailySource(source, positive, ORDER_ID)).toEqual({
      count: 1,
      ownPresent: true,
    });
    expect(adjacentEmptyDayFromSource(source, positive, ORDER_ID)).toBe(
      "2026-10-25",
    );
    const occupied = {
      ...source,
      items: [
        ...source.items,
        buildOrderFixture({
          orderId: "occupied-prior",
          createdAt: "2026-10-24T18:10:00.000Z",
        }),
        buildOrderFixture({
          orderId: "occupied-next",
          createdAt: "2026-10-26T18:10:00.000Z",
        }),
      ],
    };
    expect(
      countCanonicalDailySource(
        occupied,
        {
          ...positive,
          serviceDateFrom: "2026-10-25",
          serviceDateTo: "2026-10-25",
        },
        ORDER_ID,
      ).count,
    ).toBe(1);
    expect(() =>
      adjacentEmptyDayFromSource(occupied, positive, ORDER_ID),
    ).toThrow("daily-report-no-authoritatively-empty-adjacent-day");
    expect(() =>
      adjacentEmptyDayFromSource({ items: [] }, positive, ORDER_ID),
    ).toThrow("daily-report-authoritative-own-positive-source-required");
    expect(() =>
      adjacentEmptyDayFromSource({ rows: [] }, positive, ORDER_ID),
    ).toThrow(JourneyFailure);
  });

  it.each(DAILY_REPORT_FORMATS)(
    "TEN02: empty %s bytes require actual zero-row immutable job, no prior own order content",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const filters = {
        ...buildDailyReportFilters(expected),
        serviceDateFrom: "2026-10-25",
        serviceDateTo: "2026-10-25",
      };
      const jobId = `job_empty_${format}`;
      const detail = buildJobDetailFixture(format, jobId, [], { filters });
      const bytes = await renderFormatBytes(format, jobId, []);
      const base = {
        format,
        jobId,
        jobDetail: detail,
        filters,
        ownOrderId: ORDER_ID,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: DAILY_REPORT_MIME_TYPES[format],
        contentDisposition: `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
        bytes,
        runtimeSha: RUNTIME_SHA,
        nowMs: Date.parse("2026-10-25T19:00:00.000Z"),
      };
      expect(
        await validateEmptyDailyReportArtifactDownload(base),
      ).toMatchObject({
        format,
        jobId,
        status: "completed",
        rowCount: 0,
        bytes: bytes.length,
        sha256: hash(bytes),
        runtimeSha: RUNTIME_SHA,
      });
      await expect(
        validateEmptyDailyReportArtifactDownload({
          ...base,
          jobDetail: { ...detail, rows: [buildDailyDispatchRow()] },
        }),
      ).rejects.toThrow(
        `daily-report-empty-${format}-completed-zero-row-job-binding`,
      );
      await expect(
        validateEmptyDailyReportArtifactDownload({
          ...base,
          artifactResponseSha: "f".repeat(40),
        }),
      ).rejects.toThrow(`daily-report-empty-${format}-status-runtime-binding`);
      await expect(
        validateEmptyDailyReportArtifactDownload({
          ...base,
          bytes: await renderFormatBytes(format, jobId, [
            buildDailyDispatchRow(),
          ]),
        }),
      ).rejects.toThrow();
    },
  );

  it("blocks RECOVERY_ONLY from running the full-journey daily report phase", async () => {
    const evidence = new Evidence();
    await expect(
      runOwnedDailyReportDownloads({
        context: {} as BrowserContext,
        page: {} as Page,
        opsOrigin: OPS_ORIGIN,
        opsHeaders: () => ({}),
        readCanonicalOrders: async () => {
          throw new Error("must not read source in recovery");
        },
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
    ...(
      [
        "unrelated-fetch",
        "unrelated-body",
        "unrelated-proxy",
        "unrelated-runtime",
        "matching-fetch",
        "matching-body",
        "matching-runtime",
        "matching-typed",
      ] as const
    ).map((routeFault) => ({
      caseName: `request isolation ${routeFault}`,
      routeFault,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
    // Fault only external ports after the actual canonical empty-day control.
    // The helper, exchange validation, renderers and Evidence.failure stay real.
    ...(
      [
        ["tab-click", "filters-tab"],
        ["report-type-selectOption", "filters-report-type"],
        ["date-from-fill", "filters-date-from"],
        ["date-to-fill", "filters-date-to"],
        ["source-selectOption", "filters-source"],
        ["status-selectOption", "filters-status"],
        ["tenant-fill", "filters-tenant"],
        ["partner-fill", "filters-partner"],
        ["product-fill", "filters-service-product"],
        ["preview-waitFor", "preview-ready"],
        ["preview-click", "preview-exchange"],
        ["own-row-waitFor", "preview-row-detached"],
        ["rebuild-waitFor", "rebuild-ready"],
        ["rebuild-click", "rebuild-submit"],
        ["rebuild-command-json", "rebuild-command"],
        ["format-selectOption", "export-csv-select"],
        ["export-click", "export-csv-submit"],
        ["notice-waitFor", "export-csv-notice"],
        ["reload-goto", "reload-page"],
        ["job-row-waitFor", "download-csv-row"],
        ["download-waitFor", "download-csv-ready"],
        ["download-click", "download-csv-submit"],
        ["artifact-body", "download-csv-artifact"],
      ] as const
    ).map(([faultPoint, expectedPhase]) => ({
      caseName: `empty native fault at ${faultPoint}`,
      faultPoint,
      expectedPhase,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
    ...(["journey", "http", "exchange-http"] as const).map((typedFault) => ({
      caseName: `empty typed ${typedFault} fault preserves identity`,
      faultPoint: "preview-click",
      typedFault,
      expectedPhase: "preview-exchange",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    })),
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
        "second Ops reports navigation returns 500 after three accepted jobs without mounting reload jobs",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
      previewFailure: "reload-page",
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
      caseName:
        "actual Ops preview has invalid assignment field with no raw retention",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
      previewFailure: "row-field",
    },
    {
      caseName:
        "valid preview then independently executed job has invalid assignment field",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
      previewFailure: "job-row-field",
    },
    {
      caseName:
        "already materialized own row still executes normal rebuild POST and readback",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "source changes to nonempty adjacent day after empty jobs must fail",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
    {
      caseName:
        "cancelled null row uses normal UI filter rebuild and all immutable formats",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
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
    ...(
      [
        ["preview-error-envelope", "daily-report-preview:envelope-not-ok"],
        ["preview-invalid-json", "daily-report-preview:invalid-json"],
        ["preview-missing-meta", "object response required"],
        ["preview-invalid-meta", "daily-report-preview:invalid-success-meta"],
        ["preview-error-with-data", "daily-report-preview:envelope-not-ok"],
        ["preview-error-null", "daily-report-preview:envelope-not-ok"],
        ["preview-missing-data", "object response required"],
        ["preview-missing-page-info", "object response required"],
        ["preview-invalid-page-info", "daily-report-preview:invalid-page-info"],
        ["preview-wrong-items", "array response required"],
        ["rebuilt-preview-wrong-data", "object response required"],
        [
          "reload-jobs-error-envelope",
          "daily-report-reload-jobs:envelope-not-ok",
        ],
        [
          "create-job-error-envelope",
          "daily-report-create-job-csv:envelope-not-ok",
        ],
        ["create-job-invalid-json", "daily-report-create-job-csv:invalid-json"],
        ["create-job-wrong-data", "object response required"],
        ["create-job-missing-data", "object response required"],
        [
          "create-job-invalid-meta",
          "daily-report-create-job-csv:invalid-success-meta",
        ],
        [
          "job-detail-error-envelope",
          "daily-report-job-detail-csv:envelope-not-ok",
        ],
        ["job-detail-wrong-data", "object response required"],
      ] as const
    ).map(([caseName, expectedFailureStage]) => ({
      caseName,
      expectedFailureStage,
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: false,
    })),
    {
      caseName: "legacy ok:true list/object envelopes remain supported",
      previewSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      jobSiblingOrderId: CONTROLLED_SIBLING_ORDER_ID,
      expectedPreviewControlled: true,
      expectedRetained: true,
    },
  ])(
    "drives preview rebuild, 3-format job creation, /reports reload, and 3 artifact downloads in a socket-free harness ($caseName)",
    async ({
      previewSiblingOrderId,
      jobSiblingOrderId,
      expectedPreviewControlled,
      expectedRetained,
      caseName: failureCase,
      ...scenario
    }) => {
      const previewFailure =
        "previewFailure" in scenario ? scenario.previewFailure : undefined;
      const failureStage =
        "expectedFailureStage" in scenario
          ? scenario.expectedFailureStage
          : undefined;
      const faultPoint =
        "faultPoint" in scenario ? scenario.faultPoint : undefined;
      const typedFault =
        "typedFault" in scenario ? scenario.typedFault : undefined;
      const routeFault =
        "routeFault" in scenario ? scenario.routeFault : undefined;
      const routeNativeFailure = new TypeError(
        "private-native-token-url-order-actor-sql-body",
        { cause: { code: "ECONNRESET", secret: "private-cause" } },
      );
      const routeTypedFailure = new JourneyFailure(
        "daily-report-test-typed",
        503,
        "REPORT_READ_FAILED",
      );
      const privateMarker = "private-native-token-url-order-actor-sql-body";
      const injectedFailure =
        typedFault === "http" || typedFault === "exchange-http"
          ? new DailyReportHttpFailure("daily-report-preview-status-200", {
              phase: "preview",
              method: "GET",
              route: "daily-dispatch-records",
              runtimeSha: RUNTIME_SHA,
              status: 503,
              code: "REPORT_READ_FAILED",
            })
          : typedFault === "journey"
            ? new JourneyFailure(
                "daily-report-empty-preview-get:timeout",
                504,
                "REPORT_READ_FAILED",
              )
            : new Error(privateMarker);
      const legacy = failureCase.startsWith("legacy ok:true");
      const wireBytes = (data: unknown) =>
        legacy
          ? Buffer.from(JSON.stringify({ ok: true, data }))
          : successWireBytes(data);
      const errorWireBytes = () =>
        Buffer.from(
          JSON.stringify(
            deepToSnakeCase(
              toApiErrorEnvelope("REPORT_READ_FAILED", "private-report-error"),
            ),
          ),
        );
      const tempDir = await mkdtemp(
        path.join(tmpdir(), "owned-daily-reports-test-"),
      );
      const reportDirectory =
        ownedSupplementalArtifactPaths(tempDir).reportDirectories[
          "reservation-1"
        ];
      let restoreClock: (() => void) | undefined;
      try {
        if (!previewFailure && !failureStage) {
          // Only positive fake-port runs need an unexpired artifact. Keep the
          // original clock advancing so the helper's Date.now deadlines work;
          // never fake timers or relax the production expiry check.
          const realNow = Date.now.bind(Date);
          const startedAt = realNow();
          const shiftedStart = Date.parse("2026-10-25T19:00:00.000Z");
          const clock = vi
            .spyOn(Date, "now")
            .mockImplementation(() => shiftedStart + (realNow() - startedAt));
          restoreClock = () => clock.mockRestore();
        }
        const cancelled = failureCase.startsWith("cancelled null");
        const cancelledSource = cancelledCase();
        const ownRow = cancelled
          ? cancelledSource.row
          : buildDailyDispatchRow(
              previewFailure === "row-field"
                ? { firstAssignedAt: "secret-invalid-assignment" }
                : {},
            );
        const siblingRow = (orderId: string) => ({
          ...ownRow,
          recordId: `daily:${orderId}`,
          orderId,
          orderNo: "DRT-20261026-0000",
        });
        const previewSiblingRow = siblingRow(previewSiblingOrderId);
        const jobSiblingRow = siblingRow(jobSiblingOrderId);

        let routeHandler: ((route: Route) => Promise<void>) | undefined;
        let unrouteCalled = false;
        let abortedRoutes = 0;
        let artifactRequests = 0;
        let initialJobsRequests = 0;
        let pageVisits = 0;
        let rebuiltInBackend = false;
        let rebuildPosts = 0;
        let rebuiltPreviewGets = 0;
        const alreadyMaterialized = failureCase.startsWith(
          "already materialized",
        );
        let sourceReads = 0;
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
          nativeFault?: "fetch" | "body" | "typed",
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
              if (nativeFault === "fetch") throw routeNativeFailure;
              if (nativeFault === "typed") throw routeTypedFailure;
              return {
                status: () => responseStatus,
                url: () => url,
                headers: () => ({
                  "x-drts-candidate-sha": RUNTIME_SHA,
                  ...responseHeaders,
                }),
                body: async () => {
                  if (nativeFault === "body") throw routeNativeFailure;
                  if (url.includes("/artifact")) faultAt("artifact-body");
                  return responseBytes;
                },
              };
            },
            fulfill: async () => undefined,
            abort: async () => {
              abortedRoutes += 1;
            },
          } as unknown as Route;
          await routeHandler(route);
        };

        const faultAt = (point: string) => {
          if (
            typedFault !== "exchange-http" &&
            faultPoint === point &&
            evidence.events.some(
              (event) =>
                event.stage ===
                "daily-report-empty-source-before-zero-positive-own",
            )
          ) {
            throw injectedFailure;
          }
        };
        const makeLocator = (spec: {
          point?: string;
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
                point: idx === 0 ? "date-from" : "date-to",
                fill: async (val: string) => {
                  if (idx === 0) dateFromVal = val;
                  else dateToVal = val;
                },
              }),
            waitFor: async () => {
              faultAt(`${spec.point}-waitFor`);
            },
            isEnabled: async () => true,
            count: spec.count ?? (async () => 1),
            innerText: spec.innerText ?? (async () => ""),
            click: async () => {
              faultAt(`${spec.point}-click`);
              await spec.click?.();
            },
            fill: async (val: string) => {
              faultAt(`${spec.point}-fill`);
              await spec.fill?.(val);
            },
            selectOption: async (val: string) => {
              faultAt(`${spec.point}-selectOption`);
              return spec.selectOption ? spec.selectOption(val) : [val];
            },
            getByRole: spec.getByRole,
          };
          return self as unknown as Locator;
        };

        const fakePage: Partial<Page> = {
          goto: async (url: string) => {
            faultAt("reload-goto");
            pageVisits += 1;
            const failedPage =
              previewFailure === "page" ||
              (previewFailure === "reload-page" && pageVisits === 2);
            await dispatchRoute(
              "GET",
              url,
              null,
              failedPage ? 500 : 200,
              { "content-type": "text/html" },
              failedPage
                ? Buffer.from("<html>private-page-error</html>")
                : Buffer.from("<html></html>"),
            );
            // A failed document never mounts the real Ops page and therefore
            // cannot issue the dependent client-side jobs list request.
            if (failedPage) return null;
            initialJobsRequests += 1;
            await dispatchRoute(
              "GET",
              `${OPS_ORIGIN}/control-plane-proxy/reports/jobs`,
              null,
              200,
              { "content-type": "application/json" },
              failureCase === "reload-jobs-error-envelope" && pageVisits === 2
                ? errorWireBytes()
                : wireBytes(toApiListData(createdJobs.map((j) => j.detail))),
            );
            return null;
          },
          getByRole: (_role, options) => {
            const namePattern = options?.name;
            const matches = (textVal: string) =>
              namePattern instanceof RegExp
                ? namePattern.test(textVal)
                : namePattern === textVal;
            if (matches("營運報表")) return makeLocator({ point: "tab" });
            if (matches("載入預覽")) {
              return makeLocator({
                point: "preview",
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
                  const rows =
                    dateFromVal === "2026-10-25"
                      ? []
                      : rebuiltInBackend || alreadyMaterialized
                        ? [previewSiblingRow, ownRow]
                        : [previewSiblingRow];
                  await dispatchRoute(
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                    null,
                    previewFailure === true ||
                      (typedFault === "exchange-http" &&
                        dateFromVal === "2026-10-25")
                      ? 503
                      : 200,
                    { "content-type": "application/json" },
                    typedFault === "exchange-http" &&
                      dateFromVal === "2026-10-25"
                      ? errorWireBytes()
                      : failureCase === "preview-invalid-json"
                        ? Buffer.from("not-json")
                        : failureCase === "preview-error-envelope"
                          ? errorWireBytes()
                          : failureCase === "preview-missing-meta"
                            ? Buffer.from(
                                JSON.stringify({ data: toApiListData(rows) }),
                              )
                            : failureCase === "preview-invalid-meta"
                              ? Buffer.from(
                                  JSON.stringify({
                                    data: toApiListData(rows),
                                    meta: { request_id: "x", timestamp: "bad" },
                                  }),
                                )
                              : failureCase === "preview-error-with-data"
                                ? Buffer.from(
                                    JSON.stringify({
                                      ok: false,
                                      data: toApiListData(rows),
                                      error: {
                                        code: "REPORT_READ_FAILED",
                                        message: "private-report-error",
                                      },
                                    }),
                                  )
                                : failureCase === "preview-error-null"
                                  ? Buffer.from(
                                      JSON.stringify({
                                        ...toApiSuccessEnvelope(
                                          toApiListData(rows),
                                        ),
                                        error: null,
                                      }),
                                    )
                                  : failureCase === "preview-missing-data"
                                    ? Buffer.from(
                                        JSON.stringify({
                                          meta: {
                                            request_id: "x",
                                            timestamp: new Date().toISOString(),
                                          },
                                        }),
                                      )
                                    : failureCase ===
                                        "preview-missing-page-info"
                                      ? wireBytes({ items: rows })
                                      : failureCase ===
                                          "preview-invalid-page-info"
                                        ? wireBytes({
                                            ...toApiListData(rows),
                                            pageInfo: { page: 0 },
                                          })
                                        : failureCase === "preview-wrong-items"
                                          ? wireBytes({
                                              ...toApiListData(rows),
                                              items: "not-an-array",
                                            })
                                          : previewFailure === true
                                            ? Buffer.from(
                                                JSON.stringify({
                                                  error: {
                                                    code: "REPORT_READ_FAILED",
                                                    trace_id:
                                                      "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                                                    message:
                                                      "private-error-message",
                                                  },
                                                }),
                                              )
                                            : wireBytes(toApiListData(rows)),
                  );
                },
              });
            }
            if (matches("重算")) {
              return makeLocator({
                point: "rebuild",
                click: async () => {
                  rebuiltInBackend = true;
                  rebuildPosts += 1;
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
                    faultPoint === "rebuild-command-json" &&
                      dateFromVal === "2026-10-25"
                      ? privateMarker
                      : JSON.stringify(bodyObj),
                    200,
                    { "content-type": "application/json" },
                    successWireBytes({
                      rebuiltCount: dateFromVal === "2026-10-25" ? 0 : 2,
                      generatedAt: "2026-10-25T18:31:00.000Z",
                    }),
                  );
                  const query = new URLSearchParams(bodyObj);
                  rebuiltPreviewGets += 1;
                  await dispatchRoute(
                    "GET",
                    `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                    null,
                    200,
                    { "content-type": "application/json" },
                    failureCase === "rebuilt-preview-wrong-data"
                      ? wireBytes("not-a-list")
                      : wireBytes(
                          toApiListData(
                            dateFromVal === "2026-10-25"
                              ? []
                              : [previewSiblingRow, ownRow],
                          ),
                        ),
                  );
                },
              });
            }
            if (matches("匯出工作")) {
              return makeLocator({
                point: "export",
                click: async () => {
                  const format = selectedFormat;
                  if (
                    routeFault &&
                    dateFromVal === "2026-10-25" &&
                    format === "csv"
                  ) {
                    const unrelated = routeFault.startsWith("unrelated-");
                    const runtimeFault = routeFault.endsWith("runtime");
                    await dispatchRoute(
                      unrelated ? "GET" : "POST",
                      `${OPS_ORIGIN}${
                        unrelated
                          ? routeFault === "unrelated-proxy" || runtimeFault
                            ? "/control-plane-proxy/reports/jobs?private-query"
                            : "/_next/private-asset.js?private-query"
                          : "/control-plane-proxy/reports/jobs"
                      }`,
                      unrelated ? null : JSON.stringify({ privateMarker }),
                      200,
                      runtimeFault
                        ? { "x-drts-candidate-sha": "c".repeat(40) }
                        : {},
                      Buffer.from("private-response"),
                      runtimeFault
                        ? undefined
                        : routeFault.endsWith("typed")
                          ? "typed"
                          : routeFault.endsWith("body")
                            ? "body"
                            : "fetch",
                    );
                    if (!unrelated) return;
                  }
                  const jobId = `job_harness_${dateFromVal === "2026-10-25" ? "empty_" : ""}${format}`;
                  lastAcceptedJobId = jobId;
                  const rows =
                    dateFromVal === "2026-10-25"
                      ? []
                      : [
                          jobSiblingRow,
                          previewFailure === "job-row-field" && format === "csv"
                            ? buildDailyDispatchRow({
                                firstAssignedAt:
                                  "secret-invalid-job-assignment",
                              })
                            : ownRow,
                        ];
                  const detail = buildJobDetailFixture(
                    format,
                    jobId,
                    rows,
                    dateFromVal === "2026-10-25" || cancelled
                      ? {
                          filters: {
                            ...buildDailyReportFilters(
                              resolveExpectedDailyDispatchRecord(
                                buildOrderFixture(),
                                buildTaskFixture(),
                                buildOwnContext(),
                              ),
                            ),
                            finalStatus: statusVal,
                            serviceDateFrom: dateFromVal,
                            serviceDateTo: dateToVal,
                          },
                        }
                      : {},
                  );
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
                    failureCase === "create-job-invalid-json" &&
                      format === "csv"
                      ? Buffer.from("not-json")
                      : failureCase === "create-job-error-envelope" &&
                          format === "csv"
                        ? errorWireBytes()
                        : failureCase === "create-job-wrong-data" &&
                            format === "csv"
                          ? wireBytes([jobId])
                          : failureCase === "create-job-missing-data" &&
                              format === "csv"
                            ? Buffer.from(
                                JSON.stringify({
                                  meta: {
                                    request_id: "x",
                                    timestamp: new Date().toISOString(),
                                  },
                                }),
                              )
                            : failureCase === "create-job-invalid-meta" &&
                                format === "csv"
                              ? Buffer.from(
                                  JSON.stringify({
                                    data: { job_id: jobId },
                                    meta: { request_id: "", timestamp: "bad" },
                                  }),
                                )
                              : wireBytes({
                                  jobId,
                                  status: "completed",
                                  acceptedAt: "2026-10-25T18:32:00.000Z",
                                }),
                  );
                },
              });
            }
            return makeLocator({});
          },
          getByText: (textVal) =>
            makeLocator({
              point: "notice",
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
                point: "tenant",
                fill: async (val) => {
                  tenantVal = val;
                },
              });
            }
            if (selector === 'input[placeholder="partner_001"]') {
              return makeLocator({
                point: "partner",
                fill: async (val) => {
                  partnerVal = val;
                },
              });
            }
            if (selector === 'input[placeholder="wheelchair_van"]') {
              return makeLocator({
                point: "product",
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
                    point:
                      tag === "tenant_portal"
                        ? "source"
                        : tag === "completed"
                          ? "status"
                          : tag === "xlsx"
                            ? "format"
                            : "report-type",
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
                      point: "own-row",
                      count: async () => (dateFromVal === "2026-10-25" ? 0 : 1),
                      innerText: async () =>
                        `${ORDER_ID} ${ORDER_NO} 2026-10-26 ${PICKUP_ADDRESS} ${DROPOFF_ADDRESS} ${DRIVER_ID} ${VEHICLE_ID} ${PLATE_NO}`,
                    });
                  }
                  const foundJob = createdJobs.find((j) => j.jobId === target);
                  return makeLocator({
                    point: "job-row",
                    count: async () => (foundJob ? 1 : 0),
                    innerText: async () =>
                      foundJob
                        ? `${foundJob.jobId} ${foundJob.format.toUpperCase()} 已完成`
                        : "",
                    getByRole: () =>
                      makeLocator({
                        point: "download",
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
                                  : failureCase === "job-detail-error-envelope"
                                    ? JSON.parse(
                                        errorWireBytes().toString("utf8"),
                                      )
                                    : failureCase === "job-detail-wrong-data"
                                      ? JSON.parse(
                                          wireBytes([foundJob.detail]).toString(
                                            "utf8",
                                          ),
                                        )
                                      : JSON.parse(
                                          wireBytes(foundJob.detail).toString(
                                            "utf8",
                                          ),
                                        ),
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
          readCanonicalOrders: async () => {
            sourceReads += 1;
            return {
              items: [
                cancelled ? cancelledSource.order : buildOrderFixture(),
                ...(failureCase.startsWith("source changes") &&
                sourceReads === 2
                  ? [
                      buildOrderFixture({
                        orderId: "writer-created-order",
                        createdAt: "2026-10-24T18:10:00.000Z",
                      }),
                    ]
                  : []),
              ],
            };
          },
          order: cancelled ? cancelledSource.order : buildOrderFixture(),
          ...(cancelled
            ? { supplementalExpected: cancelledSource.expected }
            : {}),
          completedTask: buildTaskFixture(),
          entrySlug: ENTRY_SLUG,
          fleetSupplyTenantId: FLEET_SUPPLY_TENANT_ID,
          controlledOrderIds: [ORDER_ID, CONTROLLED_SIBLING_ORDER_ID],
          driverId: DRIVER_ID,
          vehicleId: VEHICLE_ID,
          plateNo: PLATE_NO,
          pickupAddress: PICKUP_ADDRESS,
          dropoffAddress: DROPOFF_ADDRESS,
          directory: reportDirectory,
          definitionSha: DEFINITION_SHA,
          runtimeSha: RUNTIME_SHA,
          recoveryOnly: false,
          evidence,
        });
        if (routeFault?.startsWith("matching-")) {
          const failure = await run.catch((error: unknown) => error);
          if (routeFault === "matching-typed")
            expect(failure).toBe(routeTypedFailure);
          else if (routeFault === "matching-runtime")
            expect(failure).toMatchObject({
              stage: "daily-report-ops-runtime-sha-mismatch",
            });
          else {
            expect(failure).toBeInstanceOf(JourneyFailure);
            expect((failure as Error).message).toContain(
              "daily-report-ops-post-jobs",
            );
          }
          const diagnostic = JSON.stringify([failure, evidence.events]);
          expect(diagnostic).not.toContain(privateMarker);
          expect(diagnostic).not.toContain("private-cause");
          expect(diagnostic).not.toContain("private-response");
          expect(abortedRoutes).toBe(1);
          expect(unrouteCalled).toBe(true);
          expect(sourceReads).toBe(1);
          return;
        }
        if (faultPoint) {
          const failure = await run.then(
            () => undefined,
            (error: unknown) => error,
          );
          evidence.failure(failure);
          const expectedStage = typedFault
            ? (injectedFailure as JourneyFailure).stage
            : `daily-report-empty-${"expectedPhase" in scenario ? scenario.expectedPhase : ""}`;
          expect(evidence.events.at(-1)).toEqual({
            stage: expectedStage,
            ...(typedFault
              ? {
                  status:
                    injectedFailure instanceof JourneyFailure
                      ? injectedFailure.status
                      : undefined,
                  code: "REPORT_READ_FAILED",
                }
              : {}),
            result: "failed",
          });
          expect(failure).toBeInstanceOf(JourneyFailure);
          if (typedFault === "exchange-http") {
            expect(failure).toBeInstanceOf(DailyReportHttpFailure);
            expect(failure).toMatchObject({
              context: (injectedFailure as DailyReportHttpFailure).context,
            });
            expect(JSON.stringify(evidence.events)).not.toContain(
              "private-report-error",
            );
          } else if (typedFault) expect(failure).toBe(injectedFailure);
          else {
            expect(JSON.parse(JSON.stringify(failure))).toEqual({
              stage: expectedStage,
            });
            expect((failure as Error).message).toBe(expectedStage);
            expect((failure as Error).cause).toBeUndefined();
          }
          expect(JSON.stringify(evidence.events)).not.toContain(privateMarker);
          expect((failure as Error).stack).not.toContain(privateMarker);
          expect(unrouteCalled).toBe(true);
          expect(sourceReads).toBe(1);
          expect(evidence.events).toContainEqual({
            stage: "daily-report-empty-source-before-zero-positive-own",
            orderId: ORDER_ID,
            result: "observed",
          });
          // The original positive report bytes were verified before any injection.
          for (const format of DAILY_REPORT_FORMATS)
            expect(
              evidence.events.some(
                (event) =>
                  event.stage === `daily-report-download-${format}-verified`,
              ),
            ).toBe(true);
          return;
        }
        if (
          previewFailure === "page" ||
          previewFailure === "reload-page" ||
          previewFailure === "detail"
        ) {
          const initialPage = previewFailure === "page";
          const reloadPage = previewFailure === "reload-page";
          await expect(run).rejects.toBeInstanceOf(DailyReportHttpFailure);
          await expect(run).rejects.toMatchObject({
            stage: initialPage
              ? "daily-report-ops-reports-initial-load-200"
              : reloadPage
                ? "daily-report-reload-reports-page-status-200"
                : "daily-report-job-detail-csv-http-status-200-required",
            status: initialPage || reloadPage ? 500 : 404,
            code:
              initialPage || reloadPage ? undefined : "REPORT_JOB_NOT_FOUND",
            context: {
              phase: initialPage
                ? "initial-reports-page"
                : reloadPage
                  ? "reload-reports-page"
                  : "job-detail-csv",
              method: "GET",
              route: initialPage || reloadPage ? "reports-page" : "job-detail",
              runtimeSha: RUNTIME_SHA,
              ...(initialPage || reloadPage
                ? {}
                : {
                    requestId: "b7e78ce8-82c1-46fb-a457-1f90ee7cdf55",
                  }),
            },
          });
          expect(evidence.events).toContainEqual(
            initialPage || reloadPage
              ? {
                  stage: `daily-report-http-${initialPage ? "initial" : "reload"}-reports-page-get-reports-page`,
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
          expect(initialJobsRequests).toBe(
            initialPage ? 0 : reloadPage ? 1 : 2,
          );
          expect(pageVisits).toBe(initialPage ? 1 : 2);
          expect(createdJobs.map((job) => job.jobId)).toEqual(
            initialPage
              ? []
              : DAILY_REPORT_FORMATS.map((format) => `job_harness_${format}`),
          );
          expect(artifactRequests).toBe(0);
          expect(unrouteCalled).toBe(true);
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-detail-error",
          );
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-page-error",
          );
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (previewFailure === "job-row-field") {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-preview-dispatch-assignment-fields-required",
          });
          const diagnostic = JSON.stringify(evidence.events);
          expect(diagnostic).toContain(
            "daily-report-preview-own-order-verified",
          );
          expect(diagnostic).toContain("daily-report-job-csv-accepted");
          expect(diagnostic).toContain(
            "daily-report-job-detail-field-firstAssignedAt-parseable-false",
          );
          expect(diagnostic).not.toContain("daily-report-preview-field-");
          expect(diagnostic).not.toContain("secret-invalid-job-assignment");
          const fieldEvents = evidence.events.filter((event) =>
            event.stage.startsWith("daily-report-job-detail-field-"),
          );
          expect(fieldEvents).toHaveLength(7);
          expect(JSON.stringify(fieldEvents)).not.toContain(ORDER_ID);
          expect(JSON.stringify(fieldEvents)).not.toContain(PICKUP_ADDRESS);
          expect(createdJobs.map((job) => job.jobId)).toEqual(
            DAILY_REPORT_FORMATS.map((format) => `job_harness_${format}`),
          );
          expect(artifactRequests).toBe(1);
          expect(unrouteCalled).toBe(true);
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (previewFailure === "row-field") {
          await expect(run).rejects.toMatchObject({
            stage: "daily-report-preview-dispatch-assignment-fields-required",
          });
          const diagnostic = JSON.stringify(evidence.events);
          expect(diagnostic).toContain(
            "daily-report-preview-field-firstAssignedAt-parseable-false",
          );
          expect(diagnostic).not.toContain("secret-invalid-assignment");
          expect(diagnostic).not.toContain(ORDER_ID);
          expect(createdJobs).toHaveLength(0);
          expect(unrouteCalled).toBe(true);
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
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
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        if (failureCase.startsWith("source changes")) {
          await expect(run).rejects.toThrow(
            "daily-report-empty-day-authoritative-source-control-required",
          );
          expect(sourceReads).toBe(2);
          expect(unrouteCalled).toBe(true);
          expect(
            evidence.events.some(
              (event) =>
                event.stage ===
                "daily-report-empty-source-after-zero-positive-own",
            ),
          ).toBe(false);
          return;
        }
        if (failureStage) {
          await expect(run).rejects.toThrow(failureStage);
          expect(unrouteCalled).toBe(true);
          expect(JSON.stringify(evidence.events)).not.toContain(
            "private-report-error",
          );
          await expect(
            stat(path.join(reportDirectory, "daily-reports")),
          ).rejects.toThrow();
          return;
        }
        const result = await run;
        if (routeFault?.startsWith("unrelated-")) {
          expect(abortedRoutes).toBe(1);
          const failures = evidence.events.filter(
            (event) =>
              event.stage.startsWith("daily-report-ops-") &&
              event.result === "failed",
          );
          expect(failures).toHaveLength(1);
          expect(failures[0]).toMatchObject({
            requestMethod: "GET",
            result: "failed",
          });
          expect(JSON.stringify(failures)).not.toContain(privateMarker);
          expect(JSON.stringify(failures)).not.toContain("private-query");
          expect(JSON.stringify(failures)).not.toContain("private-cause");
        }

        expect(result.orderId).toBe(ORDER_ID);
        expect(result.serviceDate).toBe("2026-10-26");
        expect(result.filters.tenantId).toBe(REFERRAL_TENANT_ID);
        expect(result.preview.rebuilt).toBe(true);
        expect(result.preview.rebuildCount).toBe(2);
        expect(rebuildPosts).toBe(2); // positive even when preexisting, then empty
        expect(rebuiltPreviewGets).toBe(2);
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
        expect(result.preview.finalPlateNo).toBe(cancelled ? null : PLATE_NO);
        expect(result.filters.finalStatus).toBe(
          cancelled ? "cancelled" : "completed",
        );
        expect(result.emptyDay.serviceDate).toBe("2026-10-25");
        expect(result.emptyDay.sourceBefore.emptyCount).toBe(0);
        expect(result.emptyDay.sourceAfter.ownPositivePresent).toBe(true);
        expect(result.emptyDay.restoredPositiveRow).toBe(true);
        for (const format of DAILY_REPORT_FORMATS) {
          expect(result.emptyDay.downloads[format].rowCount).toBe(0);
          expect(result.emptyDay.downloads[format].jobId).toBe(
            `job_harness_empty_${format}`,
          );
        }

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
            expect(dl.artifactPath).toBe(
              `${reportDirectory}/daily-reports/daily-dispatch-${dl.jobId}.${format}`,
            );
            const onDisk = await readFile(dl.artifactPath!);
            expect(hash(onDisk)).toBe(dl.sha256);
            expect(onDisk.length).toBe(dl.bytes);
          } else {
            expect(dl.artifactPath).toBeNull();
            await expect(
              stat(path.join(reportDirectory, "daily-reports")),
            ).rejects.toThrow();
          }
        }

        expect(JSON.stringify(result)).not.toContain("synthetic-ops-jwt");
        expect(JSON.stringify(evidence.events)).not.toContain(
          "synthetic-ops-jwt",
        );
      } finally {
        restoreClock?.();
        await rm(tempDir, { recursive: true, force: true });
      }
    },
    22_000,
  );
});

describe("explicit supplemental rows preserve strict completed controls", () => {
  it("requires a real owned acknowledged journal and canonical cancelled source", () => {
    const { expected, row } = cancelledCase();
    expect(
      validateSupplementalDailyPreviewRows(
        [row],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ).ownRow,
    ).toEqual(row);
    expect(() =>
      validateDailyPreviewRows(
        [row],
        expected as never,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ),
    ).toThrow("strict-completed");
    const main = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    expect(() =>
      validateDailyPreviewRows([row], main, RUNTIME_SHA, RUNTIME_SHA),
    ).toThrow();
  });
  it.each([
    "firstDispatchAt",
    "firstAssignedAt",
    "finalDriverId",
    "finalVehicleId",
    "finalPlateNo",
    "etaSecondsAtAssignment",
    "arrivedPickupAt",
    "tripStartedAt",
    "tripCompletedAt",
  ])("does not infer cancelled %s null from another missing event", (key) => {
    const { expected, row } = cancelledCase();
    for (const value of [undefined, "", "2026-10-25T18:20:00.000Z", DRIVER_ID])
      expect(() =>
        validateSupplementalDailyPreviewRows(
          [{ ...row, [key]: value }],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        ),
      ).toThrow();
  });
  it("rejects completed leakage, duplicate/missing own row, wrong date and count", () => {
    const { expected, row } = cancelledCase();
    for (const rows of [
      [row, row],
      [],
      [row, buildDailyDispatchRow()],
      [{ ...row, serviceDate: "2026-10-27" }],
      [{ ...row, redispatchCount: 1 }],
    ])
      expect(() =>
        validateSupplementalDailyPreviewRows(
          rows,
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        ),
      ).toThrow();
  });
  it("requires redispatch count one, second pair and real arrival while allowing zero complaints", () => {
    const main = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    const expected = {
      ...main,
      caseKind: "redispatched" as const,
      redispatchCount: 1,
      cancellationReason: null,
    };
    const row = buildDailyDispatchRow({
      redispatchCount: 1,
      complaintCount: 0,
    });
    expect(
      validateSupplementalDailyPreviewRows(
        [row],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
      ).complaintCount,
    ).toBe(0);
    for (const patch of [
      { redispatchCount: 0 },
      { redispatchCount: 2 },
      { arrivedPickupAt: null },
      { finalDriverId: "first-driver" },
    ])
      expect(() =>
        validateSupplementalDailyPreviewRows(
          [{ ...row, ...patch }],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        ),
      ).toThrow();
    expect(() =>
      validateDailyPreviewRows([row], main, RUNTIME_SHA, RUNTIME_SHA),
    ).toThrow("complaint-count");
  });
  it.each(DAILY_REPORT_FORMATS)(
    "checks actual cancelled %s bytes and rejects a nonempty arrival",
    async (format) => {
      const { expected, row } = cancelledCase();
      const jobId = `cancelled-${format}`;
      const detail = buildJobDetailFixture(format, jobId, [row], {
        filters: buildDailyReportFilters(expected),
      });
      const input = {
        format,
        jobId,
        jobDetail: detail,
        expected,
        previewOwnRow: row,
        runtimeSha: RUNTIME_SHA,
        detailStatus: 200,
        detailResponseSha: RUNTIME_SHA,
        artifactStatus: 200,
        artifactResponseSha: RUNTIME_SHA,
        contentType: DAILY_REPORT_MIME_TYPES[format],
        contentDisposition: `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
        bytes: await renderFormatBytes(format, jobId, [row]),
        artifactPath: "private/cancelled",
        nowMs: Date.parse("2026-10-25T19:00:00Z"),
      };
      expect(
        (await validateDailyReportArtifactDownload(input)).ownOrderPresent,
      ).toBe(true);
      await expect(
        validateDailyReportArtifactDownload({
          ...input,
          bytes: await renderFormatBytes(format, jobId, [
            { ...row, arrivedPickupAt: "2026-10-25T18:20:00.000Z" },
          ]),
        }),
      ).rejects.toThrow();
    },
  );
});

describe("two true Taipei reservation service days in all three formats", () => {
  for (const intended of [
    "2027-01-01T23:55:00+08:00",
    "2027-01-02T00:05:00+08:00",
  ]) {
    it.each(DAILY_REPORT_FORMATS)(
      `${intended} binds original schedule in %s`,
      async (format) => {
        const original = cancelledCase();
        const reservationWindowStart = new Date(intended).toISOString();
        const raw = JSON.stringify({
          entrySlug: ENTRY_SLUG,
          quoteId: "quote-scheduled",
          scheduledAt: reservationWindowStart,
        });
        const order = { ...original.order, reservationWindowStart };
        const expected = resolveExpectedCancelledDailyDispatchRecord(
          order,
          {
            state: "acknowledged",
            orderId: ORDER_ID,
            quoteId: "quote-scheduled",
            entrySlug: ENTRY_SLUG,
            body: raw,
            bodySha256: hash(Buffer.from(raw)),
          },
          buildOwnContext(),
        );
        expect(expected.serviceDate).toBe(intended.slice(0, 10));
        const row = {
          ...original.row,
          serviceDate: expected.serviceDate,
          reservationTime: reservationWindowStart,
        };
        validateSupplementalDailyPreviewRows(
          [row],
          expected,
          RUNTIME_SHA,
          RUNTIME_SHA,
        );
        expect(() =>
          validateSupplementalDailyPreviewRows(
            [
              {
                ...row,
                serviceDate: intended.startsWith("2027-01-01")
                  ? "2027-01-02"
                  : "2027-01-01",
              },
            ],
            expected,
            RUNTIME_SHA,
            RUNTIME_SHA,
          ),
        ).toThrow();
        const jobId = `scheduled-${intended.slice(8, 10)}-${format}`;
        const result = await validateDailyReportArtifactDownload({
          format,
          jobId,
          expected,
          previewOwnRow: row,
          jobDetail: buildJobDetailFixture(format, jobId, [row], {
            filters: buildDailyReportFilters(expected),
          }),
          detailStatus: 200,
          detailResponseSha: RUNTIME_SHA,
          artifactStatus: 200,
          artifactResponseSha: RUNTIME_SHA,
          contentType: DAILY_REPORT_MIME_TYPES[format],
          contentDisposition: `attachment; filename="daily_dispatch_record-${jobId}.${format}"`,
          bytes: await renderFormatBytes(format, jobId, [row]),
          artifactPath: "private/reservation",
          runtimeSha: RUNTIME_SHA,
          nowMs: Date.parse("2026-10-25T19:00:00Z"),
        });
        expect(result.rowCount).toBe(1);
      },
    );
  }
});
