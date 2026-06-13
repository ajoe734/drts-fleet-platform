import { expect, test, type Page, type TestInfo } from "@playwright/test";

const TENANT_CONSOLE_PROJECT = "tenant-console";
const LOCALE_STORAGE_KEY = "drts-locale-v2";

type RouteSpec = {
  key: string;
  path: string;
  title: string | RegExp;
  markers: Array<string | RegExp>;
  screenshot: string;
};

const routeSpecs: RouteSpec[] = [
  {
    key: "home",
    path: "/",
    title: /首頁|Tenant operations/i,
    markers: [
      /租戶tenant-demo-001|tenant-demo-001/i,
      /進行中訂單|財務快照|整合提醒/,
    ],
    screenshot: "tenant-home.png",
  },
  {
    key: "bookings",
    path: "/bookings",
    title: /訂單|Bookings/i,
    markers: [
      /本月所有預約|All bookings this month/i,
      /建立叫車|Create booking/i,
    ],
    screenshot: "tenant-bookings.png",
  },
  {
    key: "booking-new",
    path: "/bookings/new",
    title: /建立叫車|Create booking/i,
    markers: [
      /POST \/api\/tenant\/bookings\/commands\/create/i,
      /乘客|Passenger/i,
      /地址簿|Address book/i,
      /成本中心|Cost center/i,
    ],
    screenshot: "tenant-booking-new.png",
  },
  {
    key: "passengers",
    path: "/passengers",
    title: /乘客通訊錄|Passengers/i,
    markers: [/員工|Employee/i, /訪客|Guest/i, /soft deactivate|軟停用/i],
    screenshot: "tenant-passengers.png",
  },
  {
    key: "addresses",
    path: "/addresses",
    title: /地址簿|Address book/i,
    markers: [
      /常用地點|Common places/i,
      /軟停用|soft deactivate/i,
      /EmptyReason/i,
    ],
    screenshot: "tenant-addresses.png",
  },
  {
    key: "cost-centers",
    path: "/cost-centers",
    title: /成本中心|Cost centers/i,
    markers: [
      /部門|Department/i,
      /月配額|Monthly quota/i,
      /預設審批規則|approval rules/i,
    ],
    screenshot: "tenant-cost-centers.png",
  },
  {
    key: "rules",
    path: "/rules",
    title: /審批與配額|Approval/i,
    markers: [/審批規則|Approval rules/i, /配額狀態|Quota/i, /dry-run/i],
    screenshot: "tenant-rules.png",
  },
  {
    key: "users",
    path: "/users",
    title: /使用者|Users/i,
    markers: [
      /使用者|Users/i,
      /tenant_admin|operator|finance|viewer/i,
      /跨應用稽核|audit/i,
    ],
    screenshot: "tenant-users.png",
  },
  {
    key: "notifications",
    path: "/notifications",
    title: /通知偏好|Notifications/i,
    markers: [/事件 × 通道|event/i, /Webhook channel/i, /not_provisioned/i],
    screenshot: "tenant-notifications.png",
  },
  {
    key: "sla",
    path: "/sla",
    title: /SLA 設定檔|SLA/i,
    markers: [
      /waitThresholdMin/i,
      /arrivalThresholdMin/i,
      /completionThresholdMin/i,
    ],
    screenshot: "tenant-sla.png",
  },
  {
    key: "billing",
    path: "/billing",
    title: /帳務概覽|Billing/i,
    markers: [/計費檔案|Billing profile/i, /當期用量|usage/i, /發票|Invoices/i],
    screenshot: "tenant-billing.png",
  },
  {
    key: "invoices",
    path: "/invoices",
    title: /發票|Invoices/i,
    markers: [
      /發票歷史|Invoice history/i,
      /availableActions/i,
      /tenant_invoice_no_data/i,
    ],
    screenshot: "tenant-invoices.png",
  },
  {
    key: "reports",
    path: "/reports",
    title: /報表|Reports/i,
    markers: [
      /月用量|Monthly usage/i,
      /成本中心拆分|Cost center/i,
      /SLA 摘要|SLA/i,
    ],
    screenshot: "tenant-reports.png",
  },
  {
    key: "api-keys",
    path: "/api-keys",
    title: /API 金鑰|API keys/i,
    markers: [/正式／沙盒|production.*sandbox/i, /scope/i, /Q-TEN09/i],
    screenshot: "tenant-api-keys.png",
  },
  {
    key: "webhooks",
    path: "/webhooks",
    title: /Webhook/i,
    markers: [
      /端點|Endpoint/i,
      /事件訂閱|Event subscriptions/i,
      /payload schema/i,
    ],
    screenshot: "tenant-webhooks.png",
  },
  {
    key: "integration-governance",
    path: "/integration-governance",
    title: /整合就緒度|Integration governance/i,
    markers: [
      /aggregated readiness/i,
      /GET \/api\/tenant\/integration-governance\/readiness/i,
      /EmptyReason/i,
    ],
    screenshot: "tenant-integration-governance.png",
  },
  {
    key: "feature-flags",
    path: "/feature-flags",
    title: /功能旗標|Feature flags/i,
    markers: [/read-only/i, /Platform Admin/i, /tenant-slow/i],
    screenshot: "tenant-feature-flags.png",
  },
  {
    key: "settings",
    path: "/settings",
    title: /租戶設定|Tenant settings/i,
    markers: [/一般|General/i, /通知|Notifications/i, /legacy payload/i],
    screenshot: "tenant-settings.png",
  },
  {
    key: "audit",
    path: "/audit",
    title: /稽核|Audit/i,
    markers: [/cross-actor/i, /7 年保存|7-year/i, /actor realm/i],
    screenshot: "tenant-audit.png",
  },
];

function getBaseUrl(testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;
  if (typeof baseURL !== "string" || baseURL.length === 0) {
    throw new Error(`Missing baseURL for project ${testInfo.project.name}`);
  }
  return baseURL;
}

async function primeLocale(page: Page, locale: "en" | "zh", baseURL: string) {
  await page.context().addCookies([
    {
      name: LOCALE_STORAGE_KEY,
      value: locale,
      url: baseURL,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, value }: { key: string; value: "en" | "zh" }) => {
      window.localStorage.setItem(key, value);
      document.cookie = `${key}=${value};path=/;max-age=31536000;SameSite=Lax`;
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
}

async function assertTenantShell(page: Page) {
  await expect(page.locator("aside")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator("aside").first()).toContainText(
    /DRTS|TENANT CONSOLE|租戶後台|Bookings|訂單|Passengers|乘客|Billing|帳務/i,
  );
  await expect(page.locator("aside").first()).not.toContainText(
    /BANK CONSOLE|Bank Console|平台管理|Platform Admin|OPS CONSOLE|Ops Console|Fleet Partner/i,
  );
  await expect(page.locator("body")).toContainText(
    /API 檢查|API checking|API healthy|API degraded|API down/i,
  );
  await expect(page.locator("body")).toContainText(/English|繁體中文/);
}

async function gotoAndAssertHealthy(
  page: Page,
  baseUrl: string,
  spec: RouteSpec,
) {
  const response = await page.goto(new URL(spec.path, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });

  expect(response?.ok() ?? response?.status() === 304, spec.path).toBeTruthy();
  await expect(page).not.toHaveURL(/404/);
  await expect(page.locator("html#__next_error__"), spec.path).toHaveCount(0);
  await expect(page.locator("body"), spec.path).not.toContainText(
    /This page could not be found|Application error|Internal Server Error/i,
  );
  await assertTenantShell(page);
}

test.describe("tenant console external-dev parity smoke", () => {
  test.use({ viewport: { width: 1440, height: 950 } });
  test.setTimeout(180_000);

  test("route inventory covers all tenant static routes", () => {
    expect(routeSpecs).toHaveLength(19);
    expect(new Set(routeSpecs.map((spec) => spec.key)).size).toBe(
      routeSpecs.length,
    );
  });

  test("19 tenant routes render inside one tenant shell", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);

    const baseUrl = getBaseUrl(testInfo);

    for (const spec of routeSpecs) {
      await gotoAndAssertHealthy(page, baseUrl, spec);
      await expect(page.locator("main"), spec.path).toContainText(spec.title);

      for (const marker of spec.markers) {
        await expect(page.locator("main"), `${spec.path} marker`).toContainText(
          marker,
        );
      }

      await page.screenshot({
        path: `test-results/tenant-console-parity/${spec.screenshot}`,
        fullPage: true,
      });
    }
  });

  test("booking detail deep link is not positively available on external dev", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);

    const baseUrl = getBaseUrl(testInfo);
    await page.goto(new URL("/bookings/BK-2026-001", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });

    await assertTenantShell(page);
    await expect(page.locator("body")).toContainText(
      /404|This page could not be found/i,
    );
    await page.screenshot({
      path: "test-results/tenant-console-parity/tenant-booking-detail-unavailable.png",
      fullPage: true,
    });
  });

  test("en locale reaches html and shell while settings content remains a dev gap", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);

    const baseUrl = getBaseUrl(testInfo);
    await primeLocale(page, "en", baseUrl);
    await page.goto(new URL("/settings", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
    });

    await assertTenantShell(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("aside")).toContainText("Tenant settings");
    await expect(page.locator("main")).toContainText("租戶設定");
    await expect(page.locator("body")).toContainText("繁體中文");
  });

  test("tenant shell does not leak other management-surface navigation", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);

    const baseUrl = getBaseUrl(testInfo);
    for (const path of ["/", "/bookings", "/billing", "/feature-flags"]) {
      await page.goto(new URL(path, baseUrl).toString(), {
        waitUntil: "domcontentloaded",
      });
      await assertTenantShell(page);
      await expect(page.locator("main")).not.toContainText(
        /卡友訂單|BANK CONSOLE|OPS CONSOLE|Fleet Operations Overview|車行營運總覽/i,
      );
    }
  });
});
