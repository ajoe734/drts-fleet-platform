import { expect, test } from "@playwright/test";

const protectedBookingData = /CH••••98|BK-240611-018|BE••••42/;

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

    await expect(page).toHaveURL(
      "http://127.0.0.1:3008/login?bank=ctbc&locale=zh&signedOut=1",
    );
    await expect(page.locator("main")).toContainText(/你目前已登出/);
    await expect(page.locator("main")).not.toContainText(protectedBookingData);

    const signedOutCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "drts_bank_console_signed_out",
    );
    expect(signedOutCookie?.value).toBe("1");

    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });

    await expect(page).toHaveURL(
      "http://127.0.0.1:3008/login?bank=ctbc&locale=zh&signedOut=1",
    );
    await expect(page.locator("main")).toContainText(/你目前已登出/);
    await expect(page.locator("main")).not.toContainText(protectedBookingData);

    await page
      .locator(".login-account-card", { hasText: "方案管理員" })
      .click();
    await expect(page).toHaveURL(
      "http://127.0.0.1:3008/?bank=ctbc&locale=zh&role=bank_program_admin",
    );

    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("main")).toContainText("CH••••98");
  });
});
