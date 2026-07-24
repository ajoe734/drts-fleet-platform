import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ARTIFACT_DIR = resolve(
  process.cwd(),
  "support/sidecars/P5-RET-OPS-UI-001/artifacts",
);
const JOB_ID = "mtxexp_01J2F6K7P8Q9R0S1T2U3V4W5X6";
const SIGNED_DOWNLOAD_URL =
  "https://controlled-downloads.example.test/exports/mtxexp_01J2F6K7P8Q9R0S1T2U3V4W5X6.csv?signature=e2e-proof";

type ApiObservation = {
  listUrls: string[];
  previewBody: unknown;
  createBody: unknown;
  createIdempotencyKey: string | null;
  statusReads: number;
  downloadReads: number;
  legacyExportRequests: number;
};

const canonicalRecords = [
  {
    record_id: "mtr_202607_001",
    order_id: "order_202607_001",
    order_no: "MTX-202607-0188",
    trip_id: "trip_202607_001",
    assignment_id: "assignment_202607_001",
    vehicle_id: "vehicle_001",
    plate_no: "TDE-7188",
    reserved_at: "2026-07-22T01:30:00.000Z",
    pickup_at: "2026-07-22T01:42:00.000Z",
    dropoff_at: "2026-07-22T02:18:00.000Z",
    route: {
      encoded_polyline: "encoded-route-one",
      point_count: 146,
      distance_meters: 18340,
      duration_seconds: 2160,
      source: "driver_gps",
    },
    payable_fare_minor: 68500,
    actual_fare_minor: 71000,
    toll_minor: 2500,
    currency: "NTD",
    fare_policy_version: "TP-2026.07-v3",
    charging_mode: "platform_quote",
    generated_at: "2026-07-22T02:20:00.000Z",
    retain_until: "2028-07-22T02:20:00.000Z",
    legal_hold: {
      state: "active",
      family: "proof_bundle",
      subject_id: "order_202607_001",
      active_hold_count: 1,
      active_holds: [
        {
          hold_id: "hold_202607_001",
          case_number: "CASE-2026-071",
          reason_code: "regulatory_request",
          reason_note: "Statutory review",
          placed_by_actor_id: "platform-admin-records-e2e",
          placed_at: "2026-07-24T01:00:00.000Z",
        },
      ],
    },
  },
  {
    record_id: "mtr_202607_002",
    order_id: "order_202607_002",
    order_no: "MTX-202607-0214",
    trip_id: "trip_202607_002",
    assignment_id: null,
    vehicle_id: "vehicle_014",
    plate_no: "TDM-3026",
    reserved_at: "2026-07-23T08:15:00.000Z",
    pickup_at: "2026-07-23T08:25:00.000Z",
    dropoff_at: "2026-07-23T08:58:00.000Z",
    route: {
      encoded_polyline: null,
      point_count: 88,
      distance_meters: 12100,
      duration_seconds: 1980,
      source: "mixed",
    },
    payable_fare_minor: 52000,
    actual_fare_minor: 54000,
    toll_minor: 0,
    currency: "NTD",
    fare_policy_version: "TP-2026.07-v3",
    charging_mode: "meter",
    generated_at: "2026-07-23T09:00:00.000Z",
    retain_until: "2028-07-23T09:00:00.000Z",
    legal_hold: {
      state: "none",
      family: "proof_bundle",
      subject_id: "order_202607_002",
      active_hold_count: 0,
      active_holds: [],
    },
  },
] as const;

function success(data: unknown) {
  return JSON.stringify({
    data,
    meta: {
      request_id: "req-p5-records-e2e",
      timestamp: "2026-07-24T04:00:00.000Z",
    },
  });
}

async function mockRecordsAuthority(page: Page): Promise<ApiObservation> {
  const observed: ApiObservation = {
    listUrls: [],
    previewBody: null,
    createBody: null,
    createIdempotencyKey: null,
    statusReads: 0,
    downloadReads: 0,
    legacyExportRequests: 0,
  };

  await page.route("**/control-plane-proxy/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: success({ status: "ok" }),
    });
  });

  await page.route(
    "**/control-plane-proxy/platform-admin/multi-taxi-trip-records**",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (/multi-taxi-trip-records\/export$/.test(path)) {
        observed.legacyExportRequests += 1;
        await route.fulfill({ status: 410, body: "legacy export disabled" });
        return;
      }

      if (
        path.endsWith("/export-jobs/preview") &&
        request.method() === "POST"
      ) {
        observed.previewBody = request.postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: success({
            scope: { month: "2026-07", q: "MTX", legal_hold: "active" },
            record_count: 2,
            format: "csv",
            purpose_required: true,
            previewed_at: "2026-07-24T04:01:00.000Z",
          }),
        });
        return;
      }

      if (path.endsWith("/export-jobs") && request.method() === "POST") {
        observed.createBody = request.postDataJSON();
        observed.createIdempotencyKey =
          request.headers()["idempotency-key"] ?? null;
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: success({
            job_id: JOB_ID,
            status: "pending",
            idempotent_replay: false,
          }),
        });
        return;
      }

      if (
        path.endsWith(`/export-jobs/${JOB_ID}/download`) &&
        request.method() === "GET"
      ) {
        observed.downloadReads += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: success({
            job_id: JOB_ID,
            record_count: 2,
            manifest_hash: "sha256:e2e-controlled-export",
            download: {
              kind: "multi_taxi_operational_records",
              subject_id: JOB_ID,
              manifest_hash: "sha256:e2e-controlled-export",
              host: "controlled-downloads.example.test",
              key_id: "p5-export-e2e",
              signed_at: "2026-07-24T04:02:00.000Z",
              expires_at: "2026-07-24T04:17:00.000Z",
              ttl_minutes: 15,
              signature_version: 1,
              signature: "e2e-proof",
              download_url: SIGNED_DOWNLOAD_URL,
              immutable: true,
            },
          }),
        });
        return;
      }

      if (
        path.endsWith(`/export-jobs/${JOB_ID}`) &&
        request.method() === "GET"
      ) {
        observed.statusReads += 1;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: success({
            job_id: JOB_ID,
            status: "completed",
            scope: { month: "2026-07", q: "MTX", legal_hold: "active" },
            purpose: "2026 年 7 月法定營運紀錄檢核 REG-2026-071",
            record_count: 2,
            requested_by_actor_id: "platform-admin-records-e2e",
            download_available: true,
            created_at: "2026-07-24T04:01:30.000Z",
            updated_at: "2026-07-24T04:02:00.000Z",
          }),
        });
        return;
      }

      if (
        path.endsWith("/multi-taxi-trip-records") &&
        request.method() === "GET"
      ) {
        observed.listUrls.push(request.url());
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: success({ items: canonicalRecords }),
        });
        return;
      }

      await route.abort("failed");
    },
  );

  return observed;
}

test.beforeEach(async ({ page }) => {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    window.localStorage.setItem("drts-locale-v2", "zh");
    document.cookie = "drts-locale-v2=zh;path=/;max-age=31536000;SameSite=Lax";
  });
});

test("queries canonical records, inspects detail, and completes a controlled export", async ({
  page,
}) => {
  const observed = await mockRecordsAuthority(page);

  await page.goto("/platform-admin/p5/records");
  await expect(page.getByTestId("p5-records-page")).toBeVisible();
  await expect(page.getByText("符合 2 筆紀錄").first()).toBeVisible();

  await page.getByLabel("預約月份").fill("2026-07");
  await page.getByLabel("Legal hold").selectOption("active");
  await page.getByLabel("訂單、行程、車牌或費率版本").fill("MTX");
  await page.getByRole("button", { name: "執行查詢" }).click();
  await expect
    .poll(() => observed.listUrls.at(-1) ?? "")
    .toContain("month=2026-07&q=MTX&legalHold=active");

  await page.getByRole("button", { name: "開啟明細" }).nth(1).click();
  await expect(page.getByTestId("record-detail")).toContainText(
    "MTX-202607-0214",
  );
  await expect(page.getByTestId("record-detail")).toContainText("TDM-3026");
  await expect(page.getByText("Legal hold 狀態").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "建立 hold" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "解除 hold" })).toBeDisabled();

  await page.screenshot({
    path: resolve(ARTIFACT_DIR, "01-records-query-detail.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "受控匯出" }).click();
  const exportPanel = page.getByTestId("controlled-export-panel");
  await expect(exportPanel).toBeVisible();
  await page.getByRole("button", { name: "預覽範圍" }).click();
  await expect(exportPanel.getByText("2", { exact: true })).toBeVisible();

  await page
    .getByLabel("匯出目的")
    .fill("2026 年 7 月法定營運紀錄檢核 REG-2026-071");
  await page.getByRole("button", { name: "建立匯出工作" }).click();
  await expect(page.getByText("已完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "簽發受控下載" }).click();
  await expect(page.getByTestId("controlled-download-ready")).toBeVisible();

  const downloadLink = page.getByRole("link", { name: "開啟簽章下載" });
  await expect(downloadLink).toHaveAttribute("href", SIGNED_DOWNLOAD_URL);
  await expect(downloadLink).toHaveAttribute("target", "_blank");

  expect(observed.previewBody).toEqual({
    month: "2026-07",
    q: "MTX",
    legalHold: "active",
  });
  expect(observed.createBody).toEqual({
    scope: { month: "2026-07", q: "MTX", legalHold: "active" },
    purpose: "2026 年 7 月法定營運紀錄檢核 REG-2026-071",
    idempotencyKey: observed.createIdempotencyKey,
  });
  expect(observed.createIdempotencyKey).toMatch(/^p5-records-/);
  expect(observed.statusReads).toBeGreaterThanOrEqual(1);
  expect(observed.downloadReads).toBe(1);
  expect(observed.legacyExportRequests).toBe(0);

  await page.screenshot({
    path: resolve(ARTIFACT_DIR, "02-controlled-export-ready.png"),
    fullPage: true,
  });
});
