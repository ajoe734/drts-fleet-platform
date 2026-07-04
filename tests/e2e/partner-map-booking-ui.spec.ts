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
  await page.getByLabel("卡別").fill("World Elite");
  await page.getByLabel("航班號碼").fill("CI-102");
  await page.getByLabel("航廈").fill("T1");
  await page.getByLabel("接送方向").selectOption("pickup");
}

test.describe("partner map booking UI", () => {
  test("keeps dispatchable coordinates explicit before validation success", async ({
    page,
  }) => {
    const response = await page.goto(
      "/ctbc/book?eligibilityVerificationId=elig-verified-001",
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
      page.getByText(
        "此 partner flow 已可把型別安全的 payload 交給已驗證的 booking transport。",
      ),
    ).toBeVisible();
  });

  test("keeps manual-review routes explicit instead of looking dispatch-ready", async ({
    page,
  }) => {
    const response = await page.goto(
      "/ctbc/book?eligibilityVerificationId=elig-verified-002",
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

    const submit = page.getByRole("button", { name: "驗證下單表單" });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText("派遣前需人工確認").first()).toBeVisible();
    await expect(page.getByText("表單驗證通過")).toHaveCount(0);
  });
});
