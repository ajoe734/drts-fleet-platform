import { expect, test, type Page } from "@playwright/test";

const TENANT_CONSOLE_PROJECT = "tenant-console-localization";
const PARTNER_BOOKING_PROJECT = "partner-booking-localization";
const LOCALE_STORAGE_KEY = "drts-locale-v2";

const TENANT_CONSOLE_ROUTES = [
  "/",
  "/addresses",
  "/audit",
  "/billing",
  "/bookings",
  "/bookings/new",
  "/api-keys",
  "/cost-centers",
  "/feature-flags",
  "/integration-governance",
  "/invoices",
  "/notifications",
  "/passengers",
  "/reports",
  "/rules",
  "/settings",
  "/sla",
  "/users",
  "/webhooks",
] as const;

const PARTNER_BOOKING_ROUTES = [
  "/",
  "/bank-demo-alpha-airport",
  "/bank-demo-alpha-airport/eligibility",
  "/bank-demo-alpha-airport/help",
  "/bank-demo-alpha-airport/program",
  "/bank-demo-alpha-airport/program/site",
  "/bank-demo-alpha-airport/program/site/landing",
  "/bank-demo-alpha-airport/program/embed",
  "/bank-demo-alpha-airport/program/embed/embed-handoff",
] as const;

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

async function gotoAndSettle(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.ok() ?? response?.status() === 304, route).toBeTruthy();
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("html#__next_error__"), route).toHaveCount(0);
  await expect(page.locator("body"), route).not.toContainText(
    /Application error|500 Internal Server Error/i,
  );
}

async function expectShellControls(page: Page) {
  await expect(page.locator("body")).toContainText(/API 檢查|API checking/i);
  await expect(page.locator("body")).toContainText(/English|繁體中文/);
}

test.describe("tenant console localization smoke", () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);
    await primeLocale(
      page,
      "zh",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );
  });

  test("zh routes render without runtime error and keep shell controls", async ({
    page,
  }) => {
    for (const route of TENANT_CONSOLE_ROUTES) {
      await gotoAndSettle(page, route);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      await expectShellControls(page);
    }
  });

  test("en locale is selectable through the shared locale cookie", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );
    await gotoAndSettle(page, "/settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Tenant settings");
    await expect(page.locator("body")).toContainText("繁體中文");
  });

  test("en booking list empty state is localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );
    await gotoAndSettle(page, "/bookings?emptyReason=no_data");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Bookings");
    await expect(page.locator("body")).toContainText(
      "This tenant does not have any bookings yet",
    );
    await expect(page.locator("body")).toContainText("Create booking");
    await expect(page.locator("body")).not.toContainText(
      "此租戶目前還沒有任何訂單",
    );
  });

  test("en tenant long-tail routes translate legacy shell copy", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );

    const cases = [
      {
        route: "/",
        include: ["Tenant operations, billing, and readiness"],
        exclude: ["工作面", "進行中訂單", "財務快照"],
      },
      {
        route: "/passengers",
        include: ["Passenger directory", "Directory filters"],
        exclude: ["乘客通訊錄", "目錄篩選", "乘客名冊"],
      },
      {
        route: "/cost-centers",
        include: ["Cost centers", "Current tenant directory total"],
        exclude: ["目前租戶目錄總數", "空狀態原因預覽"],
      },
      {
        route: "/rules",
        include: ["Approval & quota", "Rule precedence"],
        exclude: ["審批與配額", "規則清單", "建立或編輯規則"],
      },
      {
        route: "/notifications",
        include: ["Notification preferences", "Event × channel"],
        exclude: ["通知偏好", "事件 × 通道", "儲存設定"],
      },
      {
        route: "/sla",
        include: ["SLA profile", "Current thresholds"],
        exclude: ["SLA 設定檔", "當前門檻", "重算既有訂單"],
      },
      {
        route: "/reports",
        include: ["Reports", "Cross-app report tracing"],
        exclude: ["報表", "跨應用報表追溯保持明確", "建立工作"],
      },
      {
        route: "/api-keys",
        include: ["API keys", "Create key"],
        exclude: ["API 金鑰", "建立金鑰", "完整明文"],
      },
      {
        route: "/webhooks",
        include: ["Endpoints · event subscriptions", "Delivery health"],
        exclude: ["新增端點", "投遞健康", "治理政策"],
      },
      {
        route: "/audit",
        include: ["Audit: cross-actor", "Cross-actor visibility"],
        exclude: ["稽核 · cross-actor", "跨 actor 可見性", "稽核回執"],
      },
    ] as const;

    for (const item of cases) {
      await gotoAndSettle(page, item.route);
      await page.waitForTimeout(350);
      for (const text of item.include) {
        await expect(page.locator("body"), item.route).toContainText(text);
      }
      for (const text of item.exclude) {
        await expect(page.locator("body"), item.route).not.toContainText(text);
      }
    }
  });
});

test.describe("partner booking localization smoke", () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PARTNER_BOOKING_PROJECT);
    await primeLocale(
      page,
      "zh",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
  });

  test("zh routes render in the canonical partner-booking app", async ({
    page,
  }) => {
    for (const route of PARTNER_BOOKING_ROUTES) {
      await gotoAndSettle(page, route);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      await expectShellControls(page);
    }
  });

  test("en locale reaches the canonical root shell", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Pick a tenant slug");
    await expect(page.locator("body")).toContainText("繁體中文");
    await expect(page.locator("body")).toContainText("Cathay United Bank");
    await expect(page.locator("body")).toContainText("Taishin Bank");
    await expect(page.locator("body")).toContainText("DBS Bank");
    await expect(page.locator("body")).toContainText("Grand Hotel");
    await expect(page.locator("body")).not.toContainText("中信銀行");
    await expect(page.locator("body")).not.toContainText("國泰世華銀行");
    await expect(page.locator("body")).not.toContainText("台新銀行");
    await expect(page.locator("body")).not.toContainText("星展銀行");
    await expect(page.locator("body")).not.toContainText("凱撒飯店");
    await expect(page.locator("body")).not.toContainText("信用卡機場接送");
  });

  test("en program site landing keeps card funnel localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/bank-demo-alpha-airport/program/site/landing");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Credit-card airport transfer",
    );
    await expect(page.locator("body")).toContainText("View eligibility");
    await expect(page.locator("body")).not.toContainText("信用卡機場接送");
    await expect(page.locator("body")).not.toContainText("查看資格確認");
  });

  test("en insurance blocked state keeps claim copy localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/fubon/program/site/insurance_policy");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Policy eligibility failed",
    );
    await expect(page.locator("body")).toContainText("Policy No.");
    await expect(page.locator("body")).toContainText("Contact Fubon Insurance");
    await expect(page.locator("body")).not.toContainText("保單資格不符");
    await expect(page.locator("body")).not.toContainText("聯絡富邦產險");
    await expect(page.locator("body")).not.toContainText("原因");
  });

  test("en travel review keeps group transfer copy localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/lion/program/site/review");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Group transfer · segment 1",
    );
    await expect(page.locator("body")).toContainText(
      "Vehicle assignment and fees",
    );
    await expect(page.locator("body")).toContainText(
      "Roster and group seats are aligned",
    );
    await expect(page.locator("body")).not.toContainText("團體接送");
    await expect(page.locator("body")).not.toContainText("車輛配置與費用");
    await expect(page.locator("body")).not.toContainText("已含團費");
  });

  test("en embed unsupported token values stay localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(
      page,
      "/bank-demo-alpha-airport/program/embed/embed-unsupported",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Unauthorized");
    await expect(page.locator("body")).toContainText("Missing");
    await expect(page.locator("body")).not.toContainText("未授權");
    await expect(page.locator("body")).not.toContainText("缺少");
  });
});
