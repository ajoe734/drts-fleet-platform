import { expect, test } from "@playwright/test";

const sessionStorageKey = "drts.concierge.portal.session.v1";
const forbiddenOpsMarkers =
  /Ops Console|Platform Admin|Tenant Console|Bank Console|Fleet Partner|管理後台|平台管理|營運後台|租戶後台|銀行後台/;

async function clearConciergeState(page: import("@playwright/test").Page) {
  await page.context().clearCookies();
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem("drts-locale-v2");
  }, sessionStorageKey);
}

test.describe("concierge portal auth boundary", () => {
  test("protected booking route shows signed-out guard without desk data", async ({
    page,
  }) => {
    await clearConciergeState(page);

    const response = await page.goto("/bookings/new", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();

    const body = page.locator("body");
    await expect(body).toContainText(/需要登入|Sign-in required/);
    await expect(body).toContainText(
      /前往 bootstrap 登入|Open bootstrap sign-in/,
    );
    await expect(body).not.toContainText(
      /先開啟櫃台工作階段|Open a desk session/,
    );
    await expect(body).not.toContainText(
      /大廳櫃台操作員|Lobby Desk Operator|E2E Desk Operator/,
    );
    await expect(body).not.toContainText(forbiddenOpsMarkers);
  });

  test("sign-out clears local session and blocks back-door booking access", async ({
    page,
  }) => {
    await clearConciergeState(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await page.locator("#operator-name").fill("E2E Desk Operator");
    await page.locator("#operator-id").fill("CP-E2E-001");
    await page
      .getByRole("button", {
        name: /繼續前往固定站點選擇|Continue to fixed site selector/,
      })
      .click();
    await expect(page).toHaveURL(/\/start$/);

    await page
      .getByRole("button", { name: /選擇|Select/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/bookings\/new$/);
    await expect(page.locator("body")).toContainText(
      /大廳櫃台操作員|Lobby Desk Operator|E2E Desk Operator/,
    );
    await expect(page.locator("body")).toContainText(
      /先開啟櫃台工作階段|Open a desk session/,
    );

    await page
      .getByRole("button", { name: /清除本地工作階段|Clear local session/ })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect
      .poll(() =>
        page.evaluate((key) => localStorage.getItem(key), sessionStorageKey),
      )
      .toBeNull();

    await page.goto("/bookings/new", { waitUntil: "domcontentloaded" });
    const body = page.locator("body");
    await expect(body).toContainText(/需要登入|Sign-in required/);
    await expect(body).not.toContainText(
      /大廳櫃台操作員|Lobby Desk Operator|E2E Desk Operator/,
    );
    await expect(body).not.toContainText(
      /先開啟櫃台工作階段|Open a desk session/,
    );
    await expect(body).not.toContainText(forbiddenOpsMarkers);
  });

  test("language switch persists en locale without zh bootstrap labels", async ({
    page,
  }) => {
    await clearConciergeState(page);
    await page.goto("/login", { waitUntil: "domcontentloaded" });

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
    await page
      .getByRole("button", { name: /Switch to English|切換為英文/i })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    const body = page.locator("body");
    await expect(body).toContainText(
      "Bootstrap the assisted-entry operator locally.",
    );
    await expect(body).toContainText("Continue to fixed site selector");
    await expect(body).not.toContainText("在本地建立 assisted-entry 操作員。");
    await expect(body).not.toContainText("繼續前往固定站點選擇");
  });
});
