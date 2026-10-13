import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function demoNavigation(page: Page, name: string) {
  await page
    .getByRole("navigation", { name: "示範導覽" })
    .getByRole("link", { name, exact: true })
    .click();
}

async function bookDemoRide(page: Page, firstBooking: boolean) {
  await demoNavigation(page, "預約");
  if (firstBooking)
    await page
      .getByRole("button", { name: "我已閱讀並同意", exact: true })
      .click();
  await page
    .getByRole("combobox", { name: "示範上車地點" })
    .selectOption("demo-central");
  await page
    .getByRole("combobox", { name: "示範下車地點" })
    .selectOption("demo-exhibition");
  await page.getByLabel("預約時間", { exact: true }).fill("2099-10-13T12:00");
  await page.getByRole("button", { name: "試算車資", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "確認叫車" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByLabel("我已確認費用與優惠說明").check();
  await confirmation
    .getByRole("button", { name: "確認叫車", exact: true })
    .click();
  await expect(page).toHaveURL(/\/ride\?rideId=demo-ride-/);
  await expect(
    page.getByRole("button", { name: "模擬司機接單" }),
  ).toBeVisible();
  const rideId = new URL(page.url()).searchParams.get("rideId");
  expect(rideId).toBeTruthy();
  return rideId!;
}

test("production passenger demo completes login, booking, payment, receipt and history without external services", async ({
  page,
  baseURL,
}, testInfo) => {
  const unexpectedRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (
      url.origin !== new URL(baseURL!).origin ||
      url.pathname.startsWith("/api/passenger-app")
    )
      unexpectedRequests.push(
        `${request.method()} ${url.origin}${url.pathname}`,
      );
  });

  await page.goto("/demo");
  await page.getByRole("button", { name: "開始／繼續示範" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("complementary", { name: "示範模式" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "手機號碼登入" }).click();
  await page.getByLabel("請輸入您的手機號碼").fill("0900000000");
  await page.getByRole("button", { name: "取得驗證碼" }).click();
  await page
    .getByRole("textbox", { name: "6 位數驗證碼 1", exact: true })
    .fill("123456");
  await page.getByRole("button", { name: "驗證", exact: true }).click();
  await expect(
    page.getByText("歡迎加入，請同意服務條款", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "服務條款", exact: true }),
  ).toHaveAttribute("href", "/demo/terms");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "繼續", exact: true }).click();
  await expect(page).toHaveURL(`${baseURL}/`);

  await demoNavigation(page, "付款方式");
  await page.getByRole("button", { name: "新增信用卡", exact: true }).click();
  await page.getByRole("button", { name: "綁定卡片", exact: true }).click();
  await expect(
    page.getByText("示意卡 •••• 0000", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("示意卡 •••• 0000", { exact: true }),
  ).toBeVisible();

  const completedRideId = await bookDemoRide(page, true);
  for (const label of [
    "模擬司機接單",
    "模擬司機抵達",
    "模擬開始乘車",
    "模擬完成行程",
  ])
    await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByText(/^模擬扣款成功：/)).toBeVisible();
  await page.getByRole("button", { name: "體驗扣款失敗" }).click();
  await expect(
    page.getByText("模擬扣款失敗，請重試付款。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重試示範付款" }).click();
  await expect(page.getByText(/^模擬扣款成功：/)).toBeVisible();

  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "下載示範乘車紀錄" }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe("DEMO-0001.html");
  const receiptPath = testInfo.outputPath("completed-demo-receipt.html");
  await download.saveAs(receiptPath);
  const receipt = await readFile(receiptPath, "utf8");
  expect(receipt).toContain("DEMO 示範乘車紀錄 — 非正式憑證，不能報帳");
  expect(receipt).toContain("示意信用卡（模擬付款完成）");
  expect(receipt).toContain("DEMO-0001");
  expect(receipt).toContain("示意起跳費");
  await testInfo.attach("downloaded-demo-receipt", {
    path: receiptPath,
    contentType: "text/html",
  });

  await page.getByRole("radio", { name: "4 星", exact: true }).check();
  await page.getByLabel("評價內容", { exact: true }).fill("完整示範旅程測試");
  await page.getByRole("button", { name: "儲存示範評價" }).click();
  await expect(
    page.getByText("已儲存評價：4 顆星", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("案件類型", { exact: true }).selectOption("lost_item");
  await page
    .getByLabel("遺失物描述", { exact: true })
    .fill("虛構藍色雨傘，僅供功能示範");
  await page
    .getByLabel("同意客服就此案件聯絡我（示範不會實際聯絡）", { exact: true })
    .check();
  await page.getByRole("button", { name: "送出示範案件" }).click();
  await expect(
    page.getByRole("list", { name: "已送出的示範案件" }),
  ).toContainText("虛構藍色雨傘，僅供功能示範");
  await testInfo.attach("completed-trip-and-receipt", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  await demoNavigation(page, "行程紀錄");
  await page.reload();
  await expect(
    page.getByRole("link", { name: "查看行程 DEMO-0001", exact: true }),
  ).toHaveAttribute("href", `/ride?rideId=${completedRideId}`);
  await expect(page.getByText("評價：4 顆星", { exact: true })).toBeVisible();
  await expect(page.getByText(/模擬付款成功/)).toBeVisible();
  await page
    .getByRole("link", { name: "查看行程 DEMO-0001", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "已送出的示範案件" }),
  ).toContainText("虛構藍色雨傘，僅供功能示範");

  const cancelledRideId = await bookDemoRide(page, false);
  expect(cancelledRideId).not.toBe(completedRideId);
  await page.getByRole("button", { name: "取消此行程", exact: true }).click();
  await page.getByRole("button", { name: "確認取消行程", exact: true }).click();
  await expect(
    page.getByText("示範行程已取消，未產生扣款。", { exact: true }),
  ).toBeVisible();
  await demoNavigation(page, "行程紀錄");
  await page.reload();
  await expect(
    page.getByRole("link", { name: "查看行程 DEMO-0001", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "查看行程 DEMO-0002", exact: true }),
  ).toBeVisible();
  await page.getByLabel("篩選行程").selectOption("cancelled");
  await expect(
    page.getByRole("link", { name: "查看行程 DEMO-0001", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "查看行程 DEMO-0002", exact: true }),
  ).toBeVisible();
  await testInfo.attach("persisted-cancelled-trip-history", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  expect(
    unexpectedRequests,
    "demo must remain local while Next serves pages and static files",
  ).toEqual([]);
});
