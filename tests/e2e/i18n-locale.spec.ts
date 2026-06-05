import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Locale = "en" | "zh";

type RouteExpectation = {
  path: string;
  en: RegExp;
  zh: RegExp;
};

const OPS_PROJECT = "ops-assistant-on";
const PLATFORM_ADMIN_PROJECT = "platform-admin-assistant-on";

const opsRoutes: RouteExpectation[] = [
  { path: "/dashboard", en: /Operations Overview/, zh: /營運總覽/ },
  { path: "/dispatch", en: /Dispatch Console/, zh: /派車調度/ },
  { path: "/complaints", en: /Complaint Center/, zh: /客訴中心/ },
  { path: "/reports", en: /Reports Center/, zh: /報表/ },
  { path: "/drivers", en: /Drivers/, zh: /司機/ },
  { path: "/vehicles", en: /Vehicles/, zh: /車輛/ },
];

const platformAdminRoutes: RouteExpectation[] = [
  { path: "/", en: /Platform governance home/, zh: /平台治理工作首頁/ },
  { path: "/tenants", en: /Tenants/, zh: /租戶/ },
  { path: "/partners", en: /Partner entry/, zh: /合作夥伴 entry/ },
  { path: "/payments", en: /Settlement governance/, zh: /結算治理/ },
  { path: "/notices", en: /Notices & Maintenance/, zh: /公告與維護/ },
  {
    path: "/tenant-governance",
    en: /Cross-tenant Governance/,
    zh: /跨租戶治理/,
  },
];

function isOpsProject(testInfo: TestInfo) {
  return testInfo.project.name === OPS_PROJECT;
}

function isPlatformAdminProject(testInfo: TestInfo) {
  return testInfo.project.name === PLATFORM_ADMIN_PROJECT;
}

async function primeLocale(page: Page, locale: Locale) {
  await page.addInitScript(
    ({ nextLocale }) => {
      if (!window.localStorage.getItem("drts-locale-v2")) {
        window.localStorage.setItem("drts-locale-v2", nextLocale);
      }
      if (!document.cookie.includes("drts-locale-v2=")) {
        document.cookie = `drts-locale-v2=${nextLocale};path=/;max-age=31536000;SameSite=Lax`;
      }
    },
    { nextLocale: locale },
  );
}

async function assertRouteLocale(
  page: Page,
  route: RouteExpectation,
  locale: Locale,
) {
  const expected = locale === "en" ? route.en : route.zh;
  const unexpected = locale === "en" ? route.zh : route.en;

  await page.goto(route.path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator("main")).toContainText(expected);
  await expect(page.locator("main")).not.toContainText(unexpected);
}

async function switchLocale(page: Page, locale: Locale) {
  const toggle = page.getByTestId("app-locale-toggle");
  const beforeLabel = locale === "en" ? "English" : "中文";
  const afterLabel = locale === "en" ? "中文" : "English";

  await expect(toggle).toHaveText(beforeLabel);
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(toggle).toHaveText(afterLabel);
}

test.describe("locale regression smoke", () => {
  test("ops console switches locale across primary routes", async ({
    page,
  }, testInfo) => {
    test.skip(!isOpsProject(testInfo));

    await primeLocale(page, "zh");

    for (const route of opsRoutes) {
      await assertRouteLocale(page, route, "zh");
    }

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await switchLocale(page, "en");

    for (const route of opsRoutes) {
      await assertRouteLocale(page, route, "en");
    }
  });

  test("platform admin switches locale across primary routes", async ({
    page,
  }, testInfo) => {
    test.skip(!isPlatformAdminProject(testInfo));

    await primeLocale(page, "zh");

    for (const route of platformAdminRoutes) {
      await assertRouteLocale(page, route, "zh");
    }

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await switchLocale(page, "en");

    for (const route of platformAdminRoutes) {
      await assertRouteLocale(page, route, "en");
    }
  });
});
