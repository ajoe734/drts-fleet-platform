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
    await expect(page.locator("body")).not.toContainText("中信銀行");
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
});
