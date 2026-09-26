import { expect, test, type Page } from "@playwright/test";

async function selectPartnerMapCandidate(
  page: Page,
  index: number,
  query: string,
  candidateName: string,
) {
  const picker = page.locator("[data-address-map-picker]").nth(index);
  await picker
    .getByRole("textbox", { name: /Search address|搜尋地址/i })
    .fill(query);
  await picker.getByRole("button", { name: /Search|搜尋/i }).click();
  await picker.getByRole("button", { name: new RegExp(candidateName) }).click();
}

async function fillCardProgramFields(page: Page) {
  await page.getByLabel(/Passenger name|乘客姓名/i).fill("王旅客");
  await page.getByLabel(/Passenger phone|乘客電話/i).fill("0911222333");
  await page.getByLabel(/Card program|卡別/i).fill("Elite Demo");
  await page.getByLabel(/Flight number|航班號碼/i).fill("CI-102");
  await page.getByLabel(/Terminal|航廈/i).fill("T1");
  await page.getByLabel(/Direction|接送方向/i).selectOption("pickup");
}

test.describe("partner map booking UI", () => {
  test("keeps dispatchable coordinates explicit before validation success", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
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

    await expect(
      page.getByText(/Inside the service area|位於服務範圍內/i),
    ).toBeVisible();

    const submit = page.getByRole("button", {
      name: /Verify booking|Submit for review|驗證下單表單|送交人工複核/i,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText(/Form verified|表單驗證通過/i)).toBeVisible();
    await expect(
      page.getByText(
        /This booking is ready for creation by the partner channel.|此預約資料已準備完成，可交由合作通路後續建立訂單。/i,
      ),
    ).toBeVisible();
  });

  test("keeps manual-review routes explicit instead of looking dispatch-ready", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
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

    await expect(
      page.getByText(/Manual review required|派遣前需人工確認/i).first(),
    ).toBeVisible();
    await expect(
      page
        .getByText(
          /The selected stops can be recorded, but dispatch must review them before normal assignment.|目前可先記錄這趟行程，但正式派遣前仍需人工確認。/i,
        )
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId("partner-booking-review-summary")).toHaveText(
      /The selected stops can be recorded, but dispatch must review them before normal assignment.|目前可先記錄這趟行程，但正式派遣前仍需人工確認。/i,
    );

    const submit = page.getByRole("button", {
      name: /Verify booking|Submit for review|驗證下單表單|送交人工複核/i,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(
      page.getByText(/Manual review required|派遣前需人工確認/i).first(),
    ).toBeVisible();
    await expect(page.getByText(/Form verified|表單驗證通過/i)).toHaveCount(0);
  });

  test("allows manual submission (unknown serviceability) during outage (pickup)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "outage",
      "This test requires the outage provider mode",
    );
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-003",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill("24.9");
    await pickupPicker.getByLabel(/Longitude|經度/i).fill("121.4");
    await pickupPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Outside test");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const submit = page.getByRole("button", {
      name: /Verify booking|Submit for review|驗證下單表單|送交人工複核/i,
    });
    await expect(submit).toBeDisabled(); // Disabled because dropoff is still missing

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill("25.047");
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill("121.517");
    await dropoffPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Outage dropoff");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(
      page.getByText(/Manual review required|派遣前需人工確認/i).first(),
    ).toBeVisible();
  });

  test("blocks submission when known outside service area despite outage", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "We simulate the outage mid-test here",
    );
    const response = await page.goto(
      "/acme/book?eligibilityVerificationId=elig-verified-003",
    );
    expect(response?.status()).toBe(200);

    await fillCardProgramFields(page);

    // Initial healthy state -> select known outside address
    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker.getByRole("button", { name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i }).click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill("24.9");
    await pickupPicker.getByLabel(/Longitude|經度/i).fill("121.4");
    await pickupPicker.getByLabel(/Reason for manual location|手動定位原因/i).fill("Known Outside");
    await pickupPicker.getByRole("button", { name: /Use this location|使用此位置/i }).click();
    
    // Check known outside state
    await expect(page.getByText(/Outside the service area|不在服務範圍內/i).first()).toBeVisible();

    const submit = page.getByRole("button", {
      name: /Verify booking|Submit for review|驗證下單表單|送交人工複核/i,
    });
    await expect(submit).toBeDisabled();

    // Now simulate outage
    await page.route("**/api/geo/health", async (route) => {
      await route.fulfill({
        json: {
          provider: "mock",
          mode: "mock",
          status: "outage",
          failClosed: true,
        },
      });
    });

    // Fill dropoff to trigger check and enable button if it bypassed
    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker.getByRole("button", { name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i }).click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill("25.047");
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill("121.517");
    await dropoffPicker.getByLabel(/Reason for manual location|手動定位原因/i).fill("Inside");
    await dropoffPicker.getByRole("button", { name: /Use this location|使用此位置/i }).click();

    // Re-verify that even during outage, the known-outside state blocks it
    await expect(submit).toBeDisabled();
    await expect(page.getByText(/Outside the service area|不在服務範圍內/i).first()).toBeVisible();
  });


  test("blocks submission if manual reason is only whitespace", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "outage",
      "This test requires the outage provider mode",
    );
    await page.goto("/acme/book?eligibilityVerificationId=elig-verified-004");
    await fillCardProgramFields(page);

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill("25.04");
    await pickupPicker.getByLabel(/Longitude|經度/i).fill("121.51");
    await pickupPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("   ");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill("25.047");
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill("121.517");
    await dropoffPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("   ");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const submit = page.getByRole("button", {
      name: /Verify booking|驗證下單表單/i,
    });
    await expect(submit).toBeDisabled();
  });

  test("blocks submission when outside service area (pickup)", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
    await page.goto("/acme/book?eligibilityVerificationId=elig-verified-005");
    await fillCardProgramFields(page);

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill("24.9");
    await pickupPicker.getByLabel(/Longitude|經度/i).fill("121.4");
    await pickupPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Outside test");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill("25.047");
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill("121.517");
    await dropoffPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Inside dropoff");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const submit = page.getByRole("button", {
      name: /Verify booking|驗證下單表單/i,
    });
    await expect(submit).toBeDisabled();
    await expect(
      page.getByText(/Outside the service area|不在服務範圍內/i).first(),
    ).toBeVisible();
  });
});
