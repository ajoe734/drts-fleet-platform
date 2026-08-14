import { expect, test, type Page, type TestInfo } from "@playwright/test";

const FLEET_PROJECT = "fleet-partner-portal";

type RouteSpec = {
  key: string;
  path: string;
  title: string | RegExp;
  markers: Array<string | RegExp>;
  screenshot: string;
  requiresReason?: boolean;
};

const routeSpecs: RouteSpec[] = [
  {
    key: "dashboard",
    path: "/dashboard",
    title: /車行營運總覽|Fleet Operations Overview/i,
    markers: [
      /需要您處理|Needs your attention/i,
      /服務別供給|Supply by service product/i,
      /近期趟次|Recent trips/i,
    ],
    screenshot: "fleet-dashboard.png",
  },
  {
    key: "drivers",
    path: "/drivers",
    title: /司機|Drivers/i,
    markers: [
      /可接單|Available/i,
      /缺件|Missing docs/i,
      /訓練未完成|Training incomplete/i,
      /可接服務|Service eligibility/i,
    ],
    screenshot: "fleet-drivers.png",
  },
  {
    key: "vehicles",
    path: "/vehicles",
    title: /車輛|Vehicles/i,
    markers: [
      /車輛狀態|Vehicle status/i,
      /新增車輛|Add vehicle/i,
      /可接服務|Vehicle eligibility/i,
      /保險|Insurance/i,
    ],
    screenshot: "fleet-vehicles.png",
  },
  {
    key: "trips",
    path: "/trips",
    title: /趟次|Trips/i,
    markers: [
      /即時叫車|保險代步|機場接送|airport/i,
      /訂單|Order/i,
      /車行分潤/i,
      /服務別|Service/i,
    ],
    screenshot: "fleet-trips.png",
  },
  {
    key: "revenue",
    path: "/revenue",
    title: /分潤|Revenue Share/i,
    markers: [
      /應付金額|Payable/i,
      /分潤規則|Revenue share rules/i,
      /當期對帳單待確認|pending confirmation/i,
      /目前沒有可操作的當期對帳單|No current statement is available/i,
    ],
    screenshot: "fleet-revenue.png",
  },
  {
    key: "statements",
    path: "/statements",
    title: /對帳單|Statements/i,
    markers: [
      /對帳單|Statement/i,
      /應付|Payable/i,
      /下載|download/i,
      /確認|confirm/i,
    ],
    screenshot: "fleet-statements.png",
    requiresReason: true,
  },
  {
    key: "documents",
    path: "/documents",
    title: /文件|Documents/i,
    markers: [
      /需處理|To handle/i,
      /缺件期間影響派工|Missing documents block dispatch/i,
      /責任|Owner/i,
      /上傳|upload/i,
    ],
    screenshot: "fleet-documents.png",
  },
  {
    key: "training",
    path: "/training",
    title: /訓練|Training/i,
    markers: [/整體完成率/i, /待完成人次/i, /課程完成度|Course completion/i],
    screenshot: "fleet-training.png",
  },
  {
    key: "cases",
    path: "/cases",
    title: /事故|申訴|Incidents|Complaints/i,
    markers: [
      /案件|Case/i,
      /責任歸屬|responsibility/i,
      /SLA/i,
      /回覆處理|respond/i,
    ],
    screenshot: "fleet-cases.png",
  },
  {
    key: "quality",
    path: "/quality",
    title: /品質指標|Quality Metrics/i,
    markers: [
      /品質責任說明|Quality responsibility/i,
      /合作評等|partnership rating/i,
      /每月績效獎金|performance bonus/i,
    ],
    screenshot: "fleet-quality.png",
  },
];

function getBaseUrl(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string" || baseURL.length === 0) {
    throw new Error(`Missing baseURL for project ${testInfo.project.name}`);
  }
  return baseURL;
}

async function assertSingleShell(page: Page) {
  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("aside").first()).toContainText(
    /Dashboard|Drivers|Revenue Share|Documents|Training|營運總覽|司機|分潤|文件|訓練/,
  );
}

test.describe("fleet partner portal parity smoke", () => {
  test.use({ viewport: { width: 1440, height: 950 } });
  test.setTimeout(180_000);

  test("10 routes render inside one fleet partner portal shell", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== FLEET_PROJECT);

    const baseUrl = getBaseUrl(testInfo);

    for (const spec of routeSpecs) {
      await page.goto(`${baseUrl}${spec.path}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page).not.toHaveURL(/404/);
      await expect(page.locator("body")).not.toContainText(
        /404|Application error/i,
      );
      await assertSingleShell(page);
      await expect(page.locator("body")).toContainText(spec.title);

      for (const marker of spec.markers) {
        await expect(page.locator("main")).toContainText(marker);
      }

      if (spec.requiresReason) {
        await expect(
          page.locator('[title="requires reason"]').first(),
        ).toBeVisible();
      }

      await page.screenshot({
        path: `test-results/fleet-partner-portal-parity/${spec.screenshot}`,
        fullPage: true,
      });
    }
  });

  test("shell locale switch, API lamp, and short-page height are stable", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== FLEET_PROJECT);

    const baseUrl = getBaseUrl(testInfo);
    await page.context().clearCookies();
    await page.addInitScript(() => {
      localStorage.removeItem("drts-locale-v2");
    });
    await page.route("**/control-plane-proxy/health", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "healthy" }),
      });
    });

    await page.goto(`${baseUrl}/dashboard`, { waitUntil: "domcontentloaded" });
    await assertSingleShell(page);
    await expect(page.locator("aside")).toContainText(/API 健康/);
    await expect(
      page.getByRole("button", { name: /切換為英文|Switch to English/ }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: /切換為英文|Switch to English/ })
      .click();
    await expect(page.locator("main")).toContainText(
      /Fleet Operations Overview/,
    );
    await expect(page.locator("main")).not.toContainText(/車行營運總覽/);
    await expect(page.locator("aside")).toContainText(/API healthy/);
    await expect(
      page.getByRole("button", { name: /Switch to Chinese|切換為中文/ }),
    ).toBeVisible();

    for (const path of ["/revenue", "/quality"]) {
      await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
      const layout = await page.evaluate(() => ({
        bodyScrollHeight: document.body.scrollHeight,
        documentScrollHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
        bodyOverflow: getComputedStyle(document.body).overflow,
      }));
      expect(layout.bodyOverflow).toBe("hidden");
      expect(layout.bodyScrollHeight).toBeLessThanOrEqual(
        layout.viewportHeight + 1,
      );
      expect(layout.documentScrollHeight).toBeLessThanOrEqual(
        layout.viewportHeight + 1,
      );
    }
  });

  test("zh revenue labels do not leak bilingual English sublabels", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== FLEET_PROJECT);

    const baseUrl = getBaseUrl(testInfo);
    await page.context().clearCookies();
    await page.addInitScript(() => {
      localStorage.setItem("drts-locale-v2", "zh");
    });

    await page.goto(`${baseUrl}/revenue`, { waitUntil: "domcontentloaded" });
    await assertSingleShell(page);
    await expect(page.locator("main")).toContainText(/逐趟分潤/);
    await expect(page.locator("main")).not.toContainText(/Per-trip share/);
    await expect(page.locator("main")).not.toContainText(/Recruitment bonus/);
    await expect(page.locator("main")).not.toContainText(/Management fee/);
    await expect(page.locator("main")).not.toContainText(/Penalty \/ clawback/);
  });
});
