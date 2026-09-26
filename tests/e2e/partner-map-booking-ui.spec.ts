import { expect, test, type Page } from "@playwright/test";

async function selectPartnerMapCandidate(
  page: Page,
  index: number,
  query: string,
  candidateName: string,
) {
  const picker = page.locator("[data-address-map-picker]").nth(index);
  await picker.getByRole("textbox", { name: "搜尋地址" }).fill(query);
  await picker.getByRole("button", { name: /搜尋/ }).click();
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
  }) => {
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

    const submit = page.getByRole("button", {
      name: /驗證下單表單|送交人工複核/,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("表單驗證通過")).toBeVisible();
    await expect(
      page.getByText("此預約資料已準備完成，可交由合作通路後續建立訂單。"),
    ).toBeVisible();
  });

  test("keeps manual-review routes explicit instead of looking dispatch-ready", async ({
    page,
  }) => {
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

    const submit = page.getByRole("button", {
      name: /驗證下單表單|送交人工複核/,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("派遣前需人工確認").first()).toBeVisible();
    await expect(page.getByText("表單驗證通過")).toHaveCount(0);
  });

  test("blocks submission when outside service area AND provider is down (pickup)", async ({
    page,
  }) => {
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-003",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker.getByRole("button", { name: /手動輸入座標/ }).click();
    await pickupPicker.getByLabel("緯度").fill("24.9");
    await pickupPicker.getByLabel("經度").fill("121.4");
    await pickupPicker.getByLabel("手動定位原因").fill("Outside test");
    await pickupPicker.getByRole("button", { name: /使用此位置/ }).click();

    const submit = page.getByRole("button", {
      name: /驗證下單表單|送交人工複核/,
    });
    await expect(submit).toBeDisabled();

    // Mock API health endpoint to return degraded status
    await page.route("**/health", (route) =>
      route.fulfill({
        json: { status: "down" },
      }),
    );
    // Trigger re-render by doing something that fetches health or we can just mock it for the next actions
    await page.reload();
    await fillCardProgramFields(page);

    // Re-fill pickup since reload clears it
    const pickupPicker2 = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker2.getByRole("button", { name: /手動輸入座標/ }).click();
    await pickupPicker2.getByLabel("緯度").fill("24.9");
    await pickupPicker2.getByLabel("經度").fill("121.4");
    await pickupPicker2.getByLabel("手動定位原因").fill("Outside test");
    await pickupPicker2.getByRole("button", { name: /使用此位置/ }).click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker.getByRole("button", { name: /手動輸入座標/ }).click();
    await dropoffPicker.getByLabel("緯度").fill("25.047");
    await dropoffPicker.getByLabel("經度").fill("121.517");
    await dropoffPicker.getByLabel("手動定位原因").fill("Outage dropoff");
    await dropoffPicker.getByRole("button", { name: /使用此位置/ }).click();

    await expect(submit).toBeDisabled();
  });

  test("blocks submission if manual reason is only whitespace", async ({
    page,
  }) => {
    await page.route("**/health", (route) =>
      route.fulfill({
        json: { status: "down" },
      }),
    );
    await page.goto("/acme/book?eligibilityVerificationId=elig-verified-004");
    await fillCardProgramFields(page);

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker.getByRole("button", { name: /手動輸入座標/ }).click();
    await pickupPicker.getByLabel("緯度").fill("25.04");
    await pickupPicker.getByLabel("經度").fill("121.51");
    await pickupPicker.getByLabel("手動定位原因").fill("   ");
    await pickupPicker.getByRole("button", { name: /使用此位置/ }).click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker.getByRole("button", { name: /手動輸入座標/ }).click();
    await dropoffPicker.getByLabel("緯度").fill("25.047");
    await dropoffPicker.getByLabel("經度").fill("121.517");
    await dropoffPicker.getByLabel("手動定位原因").fill("   ");
    await dropoffPicker.getByRole("button", { name: /使用此位置/ }).click();

    const submit = page.getByRole("button", { name: /驗證下單表單/ });
    await expect(submit).toBeDisabled();
  });
});
