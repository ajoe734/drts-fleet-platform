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
      /service eligibility/i,
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
      /vehicle eligibility/i,
      /INSURANCE/i,
    ],
    screenshot: "fleet-vehicles.png",
  },
  {
    key: "trips",
    path: "/trips",
    title: /趟次|Trips/i,
    markers: [
      /即時叫車|保險代步|機場接送|airport/i,
      /ORDER/i,
      /車行分潤/i,
      /SERVICE/i,
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
      /確認對帳單|Confirm statement/i,
    ],
    screenshot: "fleet-revenue.png",
    requiresReason: true,
  },
  {
    key: "statements",
    path: "/statements",
    title: /對帳單|Statements/i,
    markers: [/STATEMENT/i, /PAYABLE/i, /下載|download/i, /確認|confirm/i],
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
      /OWNER/i,
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
    markers: [/CASE/i, /責任歸屬|responsibility/i, /SLA/i, /回覆處理|respond/i],
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
});
