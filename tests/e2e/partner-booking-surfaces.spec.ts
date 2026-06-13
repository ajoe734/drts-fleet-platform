import { expect, test } from "@playwright/test";

test.describe("partner booking program surfaces", () => {
  test("keeps card website booking and bank-app embed identity states distinct", async ({
    page,
  }) => {
    const siteResponse = await page.goto("/ctbc/program/site");
    expect(siteResponse?.status()).toBe(200);
    await expect(page.getByText("世界卡禮賓，從家門到登機門。")).toBeVisible();
    await expect(page.getByText("網銀 APP 內嵌 webview")).toHaveCount(0);
    await expect(page.getByText("ref_token")).toHaveCount(0);

    const embedResponse = await page.goto("/ctbc/program/embed");
    expect(embedResponse?.status()).toBe(200);
    await expect(page.locator("[data-program-surface='embed']")).toBeVisible();
    await expect(page.getByText("program: card · embed")).toBeVisible();
    await expect(page.getByText("issuer_signature")).toBeVisible();
    await expect(page.getByText("ref_token")).toBeVisible();
    await expect(page.getByText("網銀 APP 內嵌 webview")).toHaveCount(0);
    await expect(page.getByText("原始卡資料")).toHaveCount(0);

    const reauthResponse = await page.goto("/ctbc/program/embed/reauth");
    expect(reauthResponse?.status()).toBe(200);
    await expect(page.getByText("issuer_session")).toBeVisible();
    await expect(page.getByText("expired", { exact: true })).toBeVisible();

    const unsupportedResponse = await page.goto(
      "/ctbc/program/embed/embed-unsupported",
    );
    expect(unsupportedResponse?.status()).toBe(200);
    await expect(page.getByText("unknown-host.example")).toBeVisible();
  });

  test("keeps insurance and travel on site funnel states while blocking embed", async ({
    page,
  }) => {
    const insuranceReview = await page.goto("/fubon/program/site/review");
    expect(insuranceReview?.status()).toBe(200);
    await expect(page.locator("[data-program-kind='insurance']")).toBeVisible();
    await expect(page.getByText("program: insurance · site")).toBeVisible();
    await expect(page.getByText("保險理賠代步")).toBeVisible();
    await expect(page.getByText("ref_token")).toHaveCount(0);

    const insurancePending = await page.goto(
      "/fubon/program/site/insurance_pending",
    );
    expect(insurancePending?.status()).toBe(200);
    await expect(page.getByText("insurance_pending")).toBeVisible();
    await expect(page.getByText("理賠額度")).toBeVisible();

    const travelManualReview = await page.goto(
      "/lion/program/site/manual-review",
    );
    expect(travelManualReview?.status()).toBe(200);
    await expect(page.locator("[data-program-kind='travel']")).toBeVisible();
    await expect(page.getByText("program: travel · site")).toBeVisible();
    await expect(page.getByText("旅行社團體接送")).toBeVisible();
    await expect(page.getByText("團體席次")).toBeVisible();

    const fubonEmbed = await page.goto("/fubon/program/embed");
    expect(fubonEmbed?.status()).toBe(404);

    const lionEmbed = await page.goto("/lion/program/embed/embed-handoff");
    expect(lionEmbed?.status()).toBe(404);
  });

  test("only card program selector offers the bank-app embed surface", async ({
    page,
  }) => {
    const cardSelector = await page.goto("/ctbc/program");
    expect(cardSelector?.status()).toBe(200);
    await expect(page.getByRole("link", { name: /網銀|embed/i })).toBeVisible();

    const insuranceSelector = await page.goto("/fubon/program");
    expect(insuranceSelector?.status()).toBe(200);
    await expect(page.getByRole("link", { name: /網銀|embed/i })).toHaveCount(
      0,
    );

    const travelSelector = await page.goto("/lion/program");
    expect(travelSelector?.status()).toBe(200);
    await expect(page.getByRole("link", { name: /網銀|embed/i })).toHaveCount(
      0,
    );
  });
});
