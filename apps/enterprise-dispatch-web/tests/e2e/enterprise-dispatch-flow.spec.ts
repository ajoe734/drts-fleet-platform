import { expect, test, type Page } from "@playwright/test";

const bookingIds = {
  active: "EB-7K2E1D",
  assigned: "EB-7K2F90",
  pending: "EB-7K2C44",
  completed: "EB-7K28Z2",
};

const gateRoutes = [
  "/auth-required",
  "/suspended",
  "/approval-pending",
  "/approval-rejected",
  "/quota-blocked",
  "/no-supply",
  "/degraded",
] as const;

const embedRoutes = [
  "/embed",
  "/embed/reauth-required",
  "/embed/unsupported-host",
  "/embed/consent-required",
  "/embed/fallback-to-web",
] as const;

const forbiddenProductCopy =
  /信用卡|卡友|發卡行|issuer|credit[_ -]?card|機場接送權益/i;

const pageErrors = new WeakMap<Page, string[]>();

async function expectHealthyPage(page: Page) {
  await expect(page.locator("body")).not.toContainText(
    /Application error|Unhandled Runtime Error|404/i,
  );
  await expect(page.locator("body")).not.toContainText(forbiddenProductCopy);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
}

async function gotoHealthy(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

test("website booking flow follows enterprise command lifecycle", async ({
  page,
}, testInfo) => {
  await gotoHealthy(page, "/");

  await expect(page.getByRole("heading", { name: /要去哪裡/ })).toBeVisible();
  await expect(page.locator("body")).toContainText("本月額度");
  await expect(page.locator("body")).toContainText("成本中心");
  await expect(page.getByRole("link", { name: "企業機場接送" })).toHaveAttribute(
    "href",
    "/bookings/new?scenario=airport",
  );

  await page.getByRole("link", { name: "企業機場接送" }).click();
  await expect(page).toHaveURL(/\/bookings\/new\?scenario=airport$/);
  await expect(page.locator("body")).toContainText("passenger");
  await expect(page.locator("body")).toContainText("bookedBy");
  await expect(page.locator("body")).toContainText("機場欄位只在情境需要時出現");
  await expect(page.locator("body")).toContainText("成本中心");
  await expect(page.locator("body")).toContainText("額度影響");

  await page.getByRole("link", { name: "繼續到 review" }).click();
  await expect(page).toHaveURL(/\/bookings\/review$/);
  await expect(page.locator("body")).toContainText("確認權責");
  await expect(page.locator("body")).toContainText("審批 posture");
  await expect(page.locator("body")).toContainText("accepted + pending");

  await page.getByRole("link", { name: "送出預約" }).click();
  await expect(page).toHaveURL(/\/bookings\/submitted$/);
  await expect(page.getByRole("heading", { name: "已受理" })).toBeVisible();
  await expect(page.locator("body")).toContainText("create command 已接受");
  await expect(page.locator("body")).toContainText("等待主管審批");

  await page.getByRole("link", { name: "查看待審批狀態" }).click();
  await expect(page).toHaveURL(/\/approval-pending$/);
  await expect(page.locator("body")).toContainText("accepted + pending");
  await expect(page.locator("body")).toContainText("0800-200-118");

  await page.screenshot({
    path: testInfo.outputPath("website-command-flow.png"),
    fullPage: true,
  });
});

test("booking list, detail, trip, and receipt routes expose allowed actions", async ({
  page,
}, testInfo) => {
  await gotoHealthy(page, "/bookings");
  await expect(page.getByRole("heading", { name: "我的預約" })).toBeVisible();
  await page.getByRole("link", { name: "建立預約" }).click();
  await expect(page).toHaveURL(/\/bookings\/new$/);

  await gotoHealthy(page, `/bookings/${bookingIds.active}`);
  await expect(page.locator("body")).toContainText("availableActions");
  await expect(page.locator("body")).toContainText("track_trip");
  await expect(page.locator("body")).toContainText("contact_support");
  await expect(page.locator("body")).toContainText("乘客");
  await expect(page.locator("body")).toContainText("下單人");

  await gotoHealthy(page, `/bookings/${bookingIds.completed}`);
  await expect(page.locator("body")).toContainText("view_receipt");
  await page.getByRole("link", { name: "查看收據" }).click();
  await expect(page).toHaveURL(new RegExp(`/receipts/${bookingIds.completed}$`));
  await expect(page.locator("body")).toContainText("行程收據");
  await expect(page.locator("body")).toContainText("NT$ 2,180");

  await gotoHealthy(page, `/receipts/${bookingIds.assigned}`);
  await expect(page.locator("body")).toContainText("目前沒有可下載收據");

  await gotoHealthy(page, "/trip");
  await expect(page.locator("[aria-label='企業派車進度 rail']")).toBeVisible();
  await expect(page.locator("body")).toContainText("分鐘 · 估計抵達");
  await page.getByRole("link", { name: "預約詳情" }).click();
  await expect(page).toHaveURL(new RegExp(`/bookings/${bookingIds.active}$`));

  await gotoHealthy(page, `/bookings/${bookingIds.pending}`);
  await expect(page.locator("body")).toContainText("待審批");
  await expect(page.locator("body")).not.toContainText("查看收據");

  await page.screenshot({
    path: testInfo.outputPath("booking-detail-and-receipt.png"),
    fullPage: true,
  });
});

test("support-safe gate states keep enterprise wording and next steps", async ({
  page,
}, testInfo) => {
  for (const route of gateRoutes) {
    await gotoHealthy(page, route);
    await expect(page.locator("body")).toContainText("support-safe template");
    await expect(page.locator("body")).toContainText(/原因|狀態|影響/);
    await expect(page.locator("body")).toContainText(/下一步|建議|責任/);
    await expect(page.locator("body")).toContainText("0800-200-118");
    await expect(page.locator("body")).toContainText(
      "dispatch-support@hongshuo.example",
    );

    await page.screenshot({
      path: testInfo.outputPath(`gate-${route.slice(1)}.png`),
      fullPage: true,
    });
  }
});

test("embedded app states avoid website/admin navigation and keep identity handoff semantics", async ({
  page,
}, testInfo) => {
  for (const route of embedRoutes) {
    await gotoHealthy(page, route);
    await expect(page.locator("body")).toContainText("企業 App");
    await expect(page.locator("body")).toContainText(/identity|身分交付|session|handoff/i);
    await expect(page.locator("nav")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(
      /派遣看板|平台管理|車隊管理/i,
    );

    await page.screenshot({
      path: testInfo.outputPath(`embed-${route.replaceAll("/", "_")}.png`),
      fullPage: true,
    });
  }
});
