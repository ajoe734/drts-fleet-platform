import { expect, test } from "@playwright/test";

const protectedData = /CH••••98|BK-240611-018|BE••••42/;
const ctbcVisibleLeak = /CTBC|ctbc|中信/;

const managementRoutes = [
  "/",
  "/bookings",
  "/bookings/ord_ctbc_240611_01",
  "/contracts",
  "/contracts/ctr_ctbc_world_elite_2026",
  "/statements",
  "/statements/2026-06",
  "/programs",
  "/users",
  "/audit",
];

function withQuery(path: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return `${path}?${params.toString()}`;
}

test.describe("bank console deep runtime coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("keeps all management pages scoped to the selected bank, locale, and role", async ({
    page,
  }) => {
    for (const route of managementRoutes) {
      const response = await page.goto(
        withQuery(route, {
          bank: "fubon",
          locale: "en",
          role: "bank_finance",
        }),
        { waitUntil: "domcontentloaded" },
      );

      expect(response?.status(), route).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("main"), route).toContainText(
        /Fubon|fubon|富邦|Finance/,
      );
      await expect(page.locator("main"), route).not.toContainText(
        ctbcVisibleLeak,
      );
      await expect(page.locator(".bank-account-menu summary")).toContainText(
        "Finance",
      );
    }
  });

  test("locks account-management actions for non-admin bank personas", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/users", {
        bank: "cathay",
        locale: "zh",
        role: "bank_ops_viewer",
      }),
    );

    await expect(page.locator("body")).toContainText("國泰世華銀行");
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "營運檢視",
    );
    await expect(page.locator("main")).not.toContainText(ctbcVisibleLeak);
    await expect(
      page.getByRole("button", { name: "限管理員" }).first(),
    ).toBeDisabled();

    await page.locator(".bank-account-menu summary").click();
    await expect(page.locator(".bank-account-popover")).toContainText(
      "ops-viewer@cathay.demo",
    );
  });

  test("keeps signed-out deep links behind the auth boundary", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/bookings", {
        bank: "fubon",
        locale: "zh",
        role: "bank_program_admin",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("main")).toContainText("富邦銀行");

    await page.locator(".bank-account-menu summary").click();
    await page.getByRole("link", { name: "登出" }).click();

    await expect(page).toHaveURL(
      "http://127.0.0.1:3008/login?bank=fubon&locale=zh&signedOut=1",
    );
    await expect(page.locator("main")).toContainText("你目前已登出");
    await expect(page.locator("main")).not.toContainText(protectedData);

    await page.goto(
      withQuery("/statements/2026-06", {
        bank: "fubon",
        locale: "zh",
        role: "bank_finance",
      }),
    );
    await expect(page).toHaveURL(
      "http://127.0.0.1:3008/login?bank=fubon&locale=zh&signedOut=1",
    );
    await expect(page.locator("main")).not.toContainText(/STM-FUBON|應付/);
  });
});
