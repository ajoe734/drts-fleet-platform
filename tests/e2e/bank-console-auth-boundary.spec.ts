import { expect, test, type Page } from "@playwright/test";

const protectedBookingData = /CH••••98|BK-240611-018|BE••••42/;
const managementChrome =
  /卡友訂單|合約與 SLA|結算對帳單|方案與配額|使用者與角色|稽核/;
const bankSlugs = ["ctbc", "cathay", "taishin", "dbs", "fubon"] as const;
const locales = ["zh", "en"] as const;

async function expectRoute(
  page: Page,
  pathname: string,
  query: Record<string, string>,
) {
  await expect(page).toHaveURL((url) => {
    if (url.pathname !== pathname) {
      return false;
    }

    return Object.entries(query).every(
      ([key, value]) => url.searchParams.get(key) === value,
    );
  });
}

test.describe("bank console auth boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("sign-out blocks direct management deep links until a demo persona signs in", async ({
    page,
  }) => {
    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: /卡友訂單/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("CH••••98");

    await page.locator(".bank-account-menu summary").click();
    await page.getByRole("link", { name: "登出" }).click();

    await expectRoute(page, "/login", {
      bank: "ctbc",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).toContainText(/你目前已登出/);
    await expect(page.locator("main")).not.toContainText(protectedBookingData);

    const signedOutCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "drts_bank_console_signed_out",
    );
    expect(signedOutCookie?.value).toBe("1");

    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });

    await expectRoute(page, "/login", {
      bank: "ctbc",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).toContainText(/你目前已登出/);
    await expect(page.locator("main")).not.toContainText(protectedBookingData);

    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByPlaceholder(/搜尋訂單|Search bookings/)).toHaveCount(
      0,
    );
    await expect(page.locator(".bank-account-menu")).toHaveCount(0);
    await expect(page.locator(".bank-demo-menu")).toHaveCount(0);

    await page
      .locator(".login-account-card", { hasText: "方案管理員" })
      .click();
    await expectRoute(page, "/", {
      bank: "ctbc",
      locale: "zh",
      role: "bank_program_admin",
    });

    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("main")).toContainText("CH••••98");
  });

  test("signed-out login surface does not render management chrome or data", async ({
    page,
  }) => {
    await page.goto("/login?bank=ctbc&locale=zh&signedOut=1", {
      waitUntil: "domcontentloaded",
    });

    await expectRoute(page, "/login", {
      bank: "ctbc",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("body")).toContainText("銀行後台登入");
    await expect(page.locator("body")).toContainText("發卡行租戶");
    await expect(page.locator("body")).toContainText("操作員帳號");
    await expect(page.locator("body")).not.toContainText(protectedBookingData);
    await expect(page.locator("body")).not.toContainText(managementChrome);
    await expect(page.locator(".bank-account-menu")).toHaveCount(0);
    await expect(page.locator(".bank-demo-menu")).toHaveCount(0);
  });

  test("all bank login surfaces stay outside management chrome in both locales", async ({
    page,
  }) => {
    for (const bank of bankSlugs) {
      for (const locale of locales) {
        await page.goto(`/login?bank=${bank}&locale=${locale}&signedOut=1`, {
          waitUntil: "domcontentloaded",
        });

        const caseLabel = `${bank}:${locale}`;
        await expectRoute(page, "/login", {
          bank,
          locale,
          signedOut: "1",
        });
        await expect(page.locator("body"), caseLabel).not.toContainText(
          protectedBookingData,
        );
        await expect(page.locator("body"), caseLabel).not.toContainText(
          managementChrome,
        );
        await expect(page.getByRole("navigation"), caseLabel).toHaveCount(0);
        await expect(page.locator(".bank-account-menu"), caseLabel).toHaveCount(
          0,
        );
        await expect(page.locator(".bank-demo-menu"), caseLabel).toHaveCount(0);
      }
    }
  });
});
