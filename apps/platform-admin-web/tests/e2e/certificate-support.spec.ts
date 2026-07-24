import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const screenshotDir = resolve(
  process.cwd(),
  "../../support/sidecars/P5-RCT-SUPPORT-UI-001/screenshots",
);

mkdirSync(screenshotDir, { recursive: true });

const baseCertificate = {
  certificateId: "receipt-001",
  certificateNo: "RC-2607-0186",
  orderId: "ZX-240720-0186",
  tripId: "trip-0186",
  state: "available",
  certificateVersion: "v2",
  issuedAt: "2026-07-20T07:08:00.000Z",
  plateNo: "BKR-2208",
  pickupAt: "2026-07-20T06:32:00.000Z",
  dropoffAt: "2026-07-20T07:07:00.000Z",
  travelDurationSeconds: 2100,
  routeSummary: "松仁路 → 南京東路二段",
  distanceMeters: 6420,
  fareMinor: 35500,
  tollMinor: 0,
  currency: "NTD",
  consumerServicePhone: "0800-090-000",
  authorityComplaintPhone: "1999",
  htmlUrl: "/evidence/certificates/receipt-001.html",
  pdfUrl: "/evidence/certificates/receipt-001.pdf",
  supersededByCertificateId: null,
  regeneration: {
    enabled: false,
    reasonCode: "certificate_regeneration_command_pending",
  },
};

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "playwright-certificate-support",
      timestamp: "2026-07-24T00:00:00.000Z",
    },
  };
}

async function mockControlPlane(
  page: Page,
  handler?: (route: Route) => Promise<boolean>,
) {
  await page.route("**/control-plane-proxy/**", async (route) => {
    if (handler && (await handler(route))) return;
    const url = route.request().url();
    if (url.includes("/multi-taxi/certificates/receipt-001")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(baseCertificate)),
      });
      return;
    }
    if (url.includes("/multi-taxi/certificates")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            items: [baseCertificate],
            total: 1,
            query: null,
          }),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ status: "ok" })),
    });
  });
}

test("searches and opens the existing legal certificate fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockControlPlane(page);
  await page.goto("/multi-taxi-certificates");

  await expect(page.getByTestId("certificate-support-search")).toBeVisible();
  await expect(page.getByText("RC-2607-0186")).toBeVisible();
  await expect(page.getByText("支援狀態 × 6")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("重新產生成功");
  await page.screenshot({
    path: resolve(screenshotDir, "01-search-desktop.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "開啟明細" }).click();
  await expect(page.getByTestId("certificate-support-detail")).toBeVisible();
  await expect(page.getByText("BKR-2208")).toBeVisible();
  await expect(page.getByText("0800-090-000")).toBeVisible();
  await expect(page.getByText("1999")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "重新產生 · 命令未核准" }),
  ).toBeDisabled();
  await page.screenshot({
    path: resolve(screenshotDir, "02-available-detail-desktop.png"),
    fullPage: true,
  });
});

test("keeps the six-state catalog responsive on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockControlPlane(page);
  await page.goto("/multi-taxi-certificates");

  const catalog = page.getByTestId("certificate-state-catalog");
  await expect(catalog).toBeVisible();
  for (const state of [
    "available",
    "generating",
    "unavailable",
    "failed",
    "access_denied",
    "superseded",
  ]) {
    await expect(catalog.getByText(state, { exact: true })).toBeVisible();
  }
  await page.screenshot({
    path: resolve(screenshotDir, "03-state-catalog-mobile.png"),
    fullPage: true,
  });
});

test.describe("critical support states", () => {
  for (const scenario of [
    {
      id: "generating",
      state: "generating",
      expected: "產生中",
      screenshot: "04-generating.png",
    },
    {
      id: "superseded",
      state: "superseded",
      expected: "已被新版取代",
      screenshot: "08-superseded.png",
      supersededByCertificateId: "receipt-002",
    },
  ]) {
    test(`renders ${scenario.state} from server authority`, async ({
      page,
    }) => {
      await mockControlPlane(page, async (route) => {
        if (!route.request().url().includes(`receipt-${scenario.id}`)) {
          return false;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({
              ...baseCertificate,
              certificateId: `receipt-${scenario.id}`,
              state: scenario.state,
              htmlUrl: null,
              pdfUrl: null,
              supersededByCertificateId:
                scenario.supersededByCertificateId ?? null,
            }),
          ),
        });
        return true;
      });
      await page.goto(`/multi-taxi-certificates/receipt-${scenario.id}`);
      await expect(
        page.getByTestId("certificate-support-detail"),
      ).toBeVisible();
      await expect(page.getByText(scenario.expected).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "開啟 HTML" })).toHaveCount(
        0,
      );
      await page.screenshot({
        path: resolve(screenshotDir, scenario.screenshot),
        fullPage: true,
      });
    });
  }

  for (const scenario of [
    {
      id: "unavailable",
      status: 404,
      testId: "certificate-detail-unavailable",
      screenshot: "05-unavailable.png",
    },
    {
      id: "failed",
      status: 500,
      testId: "certificate-detail-failed",
      screenshot: "06-failed.png",
    },
    {
      id: "access-denied",
      status: 403,
      testId: "certificate-detail-access-denied",
      screenshot: "07-access-denied.png",
    },
  ]) {
    test(`renders ${scenario.id} from HTTP ${scenario.status}`, async ({
      page,
    }) => {
      await mockControlPlane(page, async (route) => {
        if (!route.request().url().includes(`receipt-${scenario.id}`)) {
          return false;
        }
        await route.fulfill({
          status: scenario.status,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code:
                scenario.status === 403
                  ? "AUTH_SCOPE_DENIED"
                  : scenario.status === 404
                    ? "CERTIFICATE_NOT_FOUND"
                    : "CERTIFICATE_READ_FAILED",
              message: scenario.id,
              retryable: scenario.status === 500,
            },
          }),
        });
        return true;
      });
      await page.goto(`/multi-taxi-certificates/receipt-${scenario.id}`);
      await expect(page.getByTestId(scenario.testId)).toBeVisible();
      await expect(page.locator("body")).not.toContainText("BKR-2208");
      await page.screenshot({
        path: resolve(screenshotDir, scenario.screenshot),
        fullPage: true,
      });
    });
  }
});
