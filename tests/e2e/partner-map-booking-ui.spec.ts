import { expect, test, type Page } from "@playwright/test";

async function selectPartnerMapCandidate(
  page: Page,
  index: number,
  query: string,
  candidateName: string,
) {
  const picker = page.locator("[data-address-map-picker]").nth(index);
  await picker.getByRole("textbox", { name: "搜尋地址" }).fill(query);
  await picker.getByRole("button", { name: "搜尋" }).click();
  await picker.getByRole("button", { name: new RegExp(candidateName) }).click();
}

async function fillCardProgramFields(page: Page) {
  await page.getByLabel("乘客姓名").fill("王旅客");
  await page.getByLabel("乘客電話").fill("0911222333");
  await page.getByLabel("卡別").fill("Elite Demo");
  await page.getByLabel("航班號碼").fill("CI-102");
  await page.getByLabel("航廈").fill("T1");
  await page.getByLabel("接送方向").selectOption("pickup");
}

test.describe("partner map booking UI", () => {
  test("keeps dispatchable coordinates explicit before validation success", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-001",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);
    await selectPartnerMapCandidate(page, 0, "taipei 101", "Taipei 101");
    await selectPartnerMapCandidate(
      page,
      1,
      "taipei main",
      "Taipei Main Station",
    );

    await expect(page.getByText("位於服務範圍內")).toBeVisible();

    const submit = page.getByRole("button", { name: "驗證下單表單" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("表單驗證通過")).toBeVisible();
    await expect(
      page.getByText("此預約資料已準備完成，可交由合作通路後續建立訂單。"),
    ).toBeVisible();
  });

  test("keeps manual-review routes explicit instead of looking dispatch-ready", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-002",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);
    await selectPartnerMapCandidate(
      page,
      0,
      "banqiao",
      "Banqiao District Office",
    );
    await selectPartnerMapCandidate(
      page,
      1,
      "taipei main",
      "Taipei Main Station",
    );

    await expect(page.getByText("派遣前需人工確認").first()).toBeVisible();
    await expect(
      page
        .getByText("目前可先記錄這趟行程，但正式派遣前仍需人工確認。")
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId("partner-booking-review-summary")).toHaveText(
      "目前可先記錄這趟行程，但正式派遣前仍需人工確認。",
    );

    const submit = page.getByRole("button", { name: "驗證下單表單" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("派遣前需人工確認").first()).toBeVisible();
    await expect(page.getByText("表單驗證通過")).toHaveCount(0);
  });

  test("blocks outside service area", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-001",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);
    await selectPartnerMapCandidate(page, 0, "taipei 101", "Taipei 101");

    // Dropoff uses manual coordinates outside the service area
    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByText(/手動輸入座標|Enter coordinates manually/)
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/).fill("22.620");
    await dropoffPicker.getByLabel(/Longitude|經度/).fill("120.300");
    await dropoffPicker.getByLabel(/Reason|原因/).fill("Far away dropoff");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/ })
      .click();

    const submit = page.getByRole("button", { name: "驗證下單表單" });
    await expect(submit).toBeDisabled();
  });

  test("submits manual review fallback when provider is down but coordinates exist", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "outage");
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-001",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);

    // Enter manual coords and valid reason for pickup
    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByText(/手動輸入座標|Enter coordinates manually/)
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/).fill("25.033");
    await pickupPicker.getByLabel(/Longitude|經度/).fill("121.565");
    await pickupPicker.getByLabel(/Reason|原因/).fill("Partner outage pickup");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/ })
      .click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByText(/手動輸入座標|Enter coordinates manually/)
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/).fill("25.044");
    await dropoffPicker.getByLabel(/Longitude|經度/).fill("121.575");

    // Blank reason means we can't submit
    await dropoffPicker.getByLabel(/Reason|原因/).fill("");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/ })
      .click();

    const submit = page.getByRole("button", { name: "驗證下單表單" });
    await expect(submit).toBeDisabled();

    // Fix reason for dropoff
    await dropoffPicker
      .getByLabel(/Reason|原因/)
      .fill("Partner outage dropoff");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/ })
      .click();

    // Now it works
    await expect(submit).toBeEnabled();
    await submit.click();

    // Actual PartnerBookingForm renders manual review required message in the submitted result
    await expect(
      page.getByText(
        /目前可先記錄這趟行程，但正式派遣前仍需人工確認|The selected stops can be recorded, but dispatch must review them before normal assignment/,
      ),
    ).toBeVisible();
  });

  test("blocks submission when provider is down and no coordinates are provided", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "outage");
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-001",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);
    const submit = page.getByRole("button", { name: "驗證下單表單" });
    await expect(submit).toBeDisabled();
  });
});
