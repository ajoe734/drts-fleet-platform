import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  buildDailyReportFilters,
  DAILY_REPORT_FORMATS,
  DAILY_REPORT_MIME_TYPES,
  parseCsvRecords,
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
const TENANT_ID = "10000000-0000-0000-0000-000000000201";
const PARTNER_ID = "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118";
const ORDER_ID = "ord_synthetic_owned_r12_001";
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
    tenantId: TENANT_ID,
    partnerId: PARTNER_ID,
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
    tenantId: TENANT_ID,
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
    tenantId: TENANT_ID,
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
  const fileName = `daily_dispatch_record-${jobId}.${format}`;
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
      format,
      fileName,
      downloadUrl: `/api/downloads/report_job/${jobId}?sig=test`,
      expiresAt: "2026-10-26T18:32:00.000Z",
      manifestHash: "c".repeat(64),
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
  it("derives Asia/Taipei serviceDate and normalizes canonical order fields", () => {
    expect(toTaipeiServiceDate("2026-10-25T18:10:00.000Z")).toBe("2026-10-26");
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
      tenantId: TENANT_ID,
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
      tenantId: TENANT_ID,
      partnerId: PARTNER_ID,
      serviceProductCode: "enterprise_dispatch",
      finalStatus: "completed",
    });
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

  it("validates preview rows and rejects missing order, runtime mismatch, or foreign tenant/partner rows", () => {
    const expected = resolveExpectedDailyDispatchRecord(
      buildOrderFixture(),
      buildTaskFixture(),
      buildOwnContext(),
    );
    const ownRow = buildDailyDispatchRow();
    const siblingSyntheticRow = buildDailyDispatchRow({
      recordId: "daily:ord_synthetic_sibling",
      orderId: "ord_synthetic_sibling",
      orderNo: "DRT-20261026-0002",
    });

    const verified = validateDailyPreviewRows(
      [siblingSyntheticRow, ownRow],
      expected,
      RUNTIME_SHA,
      RUNTIME_SHA,
    );
    expect(verified.rowCount).toBe(2);
    expect(verified.ownRow).toEqual(ownRow);
    expect(verified.complaintCount).toBe(1);

    // Missing own order must fail
    expect(() =>
      validateDailyPreviewRows(
        [siblingSyntheticRow],
        expected,
        RUNTIME_SHA,
        RUNTIME_SHA,
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
    "validates genuine %s artifact download bytes and binds jobId, runtimeSha, and owned order content",
    async (format) => {
      const expected = resolveExpectedDailyDispatchRecord(
        buildOrderFixture(),
        buildTaskFixture(),
        buildOwnContext(),
      );
      const ownRow = buildDailyDispatchRow();
      const jobId = `job_r12_${format}_001`;
      const jobDetail = buildJobDetailFixture(format, jobId, [ownRow]);
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
        ownOrderPresent: true,
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
    "rejects 200 HTML error bodies, JSON error bodies, wrong MIME, and tampered content for %s",
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

      // 6. Candidate runtimeSha mismatch on artifact response must be rejected
      await expect(
        validateDailyReportArtifactDownload({
          ...baseInput,
          artifactResponseSha: "f".repeat(40),
        }),
      ).rejects.toThrow(`daily-report-${format}-runtime-sha-mismatch`);

      // 7. Downloaded file rendered from a foreign order (missing own orderId) must be rejected
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
        tenantId: TENANT_ID,
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

  it("drives preview rebuild, 3-format job creation, /reports reload, and 3 artifact downloads in a socket-free harness", async () => {
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "owned-daily-reports-test-"),
    );
    try {
      const ownRow = buildDailyDispatchRow();
      const staleSiblingRow = buildDailyDispatchRow({
        recordId: "daily:ord_stale_sibling",
        orderId: "ord_stale_sibling",
        orderNo: "DRT-20261026-0000",
      });

      let routeHandler: ((route: Route) => Promise<void>) | undefined;
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
            200,
            { "content-type": "text/html" },
            Buffer.from("<html></html>"),
          );
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
                  ? [staleSiblingRow, ownRow]
                  : [staleSiblingRow];
                await dispatchRoute(
                  "GET",
                  `${OPS_ORIGIN}/control-plane-proxy/reports/daily-dispatch-records?${query.toString()}`,
                  null,
                  200,
                  { "content-type": "application/json" },
                  Buffer.from(
                    JSON.stringify({ ok: true, data: { items: rows } }),
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
                      data: { items: [staleSiblingRow, ownRow] },
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
                const rows = [staleSiblingRow, ownRow];
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
            count: async () => (String(textVal) === lastAcceptedJobId ? 1 : 0),
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
                          `${OPS_ORIGIN}/control-plane-proxy/reports/jobs/${foundJob.jobId}`,
                          null,
                          200,
                          { "content-type": "application/json" },
                          Buffer.from(
                            JSON.stringify({
                              ok: true,
                              data: foundJob.detail,
                            }),
                          ),
                        );
                        const fileName = `daily_dispatch_record-${foundJob.jobId}.${foundJob.format}`;
                        await dispatchRoute(
                          "GET",
                          `${OPS_ORIGIN}/control-plane-proxy/reports/${foundJob.jobId}/artifact`,
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
          routeHandler = undefined;
        },
        pages: () => [fakePage as Page],
      } as unknown as BrowserContext;

      const evidence = new Evidence();
      const result = await runOwnedDailyReportDownloads({
        context: fakeContext,
        page: fakePage as Page,
        opsOrigin: OPS_ORIGIN,
        opsHeaders: () => ({
          "X-Serverless-Authorization": "Bearer synthetic-ops-cloud",
          "x-drts-authorization": "Bearer synthetic-ops-jwt",
        }),
        order: buildOrderFixture(),
        completedTask: buildTaskFixture(),
        tenantId: TENANT_ID,
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

      expect(result.orderId).toBe(ORDER_ID);
      expect(result.serviceDate).toBe("2026-10-26");
      expect(result.preview.rebuilt).toBe(true);
      expect(result.preview.rowCount).toBe(2);
      expect(result.preview.finalPlateNo).toBe(PLATE_NO);

      for (const format of DAILY_REPORT_FORMATS) {
        const dl = result.downloads[format];
        expect(dl.jobId).toBe(`job_harness_${format}`);
        expect(dl.runtimeSha).toBe(RUNTIME_SHA);
        const onDisk = await readFile(dl.artifactPath);
        expect(hash(onDisk)).toBe(dl.sha256);
        expect(onDisk.length).toBe(dl.bytes);
      }

      expect(evidence.events.map((e) => e.stage)).toEqual([
        "daily-report-preview-own-order-verified",
        "daily-report-job-csv-accepted",
        "daily-report-job-xlsx-accepted",
        "daily-report-job-pdf-accepted",
        "daily-report-download-csv-verified",
        "daily-report-download-xlsx-verified",
        "daily-report-download-pdf-verified",
      ]);
      expect(JSON.stringify(result)).not.toContain("synthetic-ops-jwt");
      expect(JSON.stringify(evidence.events)).not.toContain(
        "synthetic-ops-jwt",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
