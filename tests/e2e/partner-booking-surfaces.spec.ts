import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const insuranceBlockedStates = [
  {
    segment: "insurance_policy",
    code: "insurance_policy",
    copy: "保單資格不符",
  },
  {
    segment: "insurance_replacement_vehicle",
    code: "insurance_replacement_vehicle",
    copy: "代步車權益未核定",
  },
  {
    segment: "insurance_roster",
    code: "insurance_roster",
    copy: "乘客名單不一致",
  },
  {
    segment: "insurance_pending",
    code: "insurance_pending",
    copy: "理賠審核中",
  },
  {
    segment: "insurance_missing",
    code: "insurance_missing",
    copy: "查無理賠案件",
  },
  {
    segment: "insurance_expired",
    code: "insurance_expired",
    copy: "代步期間已結束",
  },
  {
    segment: "insurance_cancelled",
    code: "insurance_cancelled",
    copy: "理賠案件已結案",
  },
] as const;

const cardAirportEmbedIssuers = [
  { slug: "ctbc", name: /中信|CTBC/i },
  { slug: "cathay", name: /國泰|Cathay/i },
  { slug: "taishin", name: /台新|Taishin/i },
  { slug: "dbs", name: /星展|DBS/i },
] as const;

test.describe("partner booking program surfaces", () => {
  test("keeps every airport issuer embed backed by partner authority", async ({
    page,
  }) => {
    for (const issuer of cardAirportEmbedIssuers) {
      const response = await page.goto(`/${issuer.slug}/program/embed`);
      expect(response?.status(), issuer.slug).toBe(200);
      await expect(
        page.locator("[data-program-surface='embed']"),
        issuer.slug,
      ).toBeVisible();
      await expect(page.locator("body"), issuer.slug).toContainText(
        issuer.name,
      );
      await expect(page.locator("body"), issuer.slug).toContainText(
        /未偵測到銀行登入|Bank sign-in not detected/i,
      );
    }
  });

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
    await expect(
      page.getByText("未取得有效網銀身分，改導向 standalone 官方站點。"),
    ).toBeVisible();
    await expect(page.getByText("未偵測到銀行登入")).toBeVisible();
    await expect(page.getByText("no_embed_session · 改用官網")).toBeVisible();
    await expect(page.getByText("不在此頁輸入原始卡資料")).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /卡號|信用卡|card/i }),
    ).toHaveCount(0);

    const reauthResponse = await page.goto("/ctbc/program/embed/embed-reauth");
    expect(reauthResponse?.status()).toBe(200);
    await expect(page.getByText("issuer_session")).toBeVisible();
    await expect(page.getByText("expired", { exact: true })).toBeVisible();

    const unsupportedResponse = await page.goto(
      "/ctbc/program/embed/embed-unsupported",
    );
    expect(unsupportedResponse?.status()).toBe(200);
    await expect(page.getByText("unknown-host.example")).toBeVisible();
  });

  test("renders embed consent and standalone fallback without raw-card capture", async ({
    page,
  }) => {
    const consentResponse = await page.goto("/ctbc/program/embed/consent");
    expect(consentResponse?.status()).toBe(200);
    await expect(page.locator("[data-program-surface='embed']")).toBeVisible();
    await expect(page.getByText("program: card · embed")).toBeVisible();
    await expect(page.getByText("授權使用接送服務")).toBeVisible();
    await expect(page.getByText("identity.read")).toBeVisible();
    await expect(page.getByText("trip.share")).toBeVisible();
    await expect(page.getByText("billing.link")).toBeVisible();
    await expect(page.getByText("原始卡資料")).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: /卡號|信用卡|card/i }),
    ).toHaveCount(0);

    const fallbackResponse = await page.goto("/ctbc/program/embed/fallback");
    expect(fallbackResponse?.status()).toBe(200);
    await expect(page.locator("[data-program-surface='embed']")).toBeVisible();
    await expect(page.getByText("未偵測到銀行登入")).toBeVisible();
    await expect(page.getByText("no_embed_session · 改用官網")).toBeVisible();
    await expect(page.getByText("末四碼 / 網銀帳號")).toBeVisible();
    await expect(page.getByText("不在此頁輸入原始卡資料")).toBeVisible();
    await expect(page.getByText("ref_token")).toHaveCount(0);
  });

  test("creates a real booking from the airport embed flow", async ({
    page,
  }) => {
    const requestRef = randomUUID();
    const response = await page.goto(
      `/ctbc/program/embed?partnerUserRef=user-${requestRef}&referenceToken=token-${requestRef}&cardLast4=1234&cardholderName=%E7%8E%8B%E5%B0%8F%E6%98%8E&benefitReference=benefit-${requestRef}&flightNo=CI100`,
    );
    expect(response?.status()).toBe(200);

    await page.getByRole("button", { name: "開始預約" }).click();
    await page.getByRole("button", { name: "前往確認" }).click();
    await page.getByRole("button", { name: "確認送出預約" }).click();

    await expect(page.getByText("預約已建立")).toBeVisible();
    await expect(page.getByTestId("partner-booking-id")).toHaveText(
      /^booking-/,
    );
    await expect(page.getByTestId("partner-order-id")).not.toHaveText("—");
    await expect(page.getByTestId("partner-eligibility-id")).toHaveText(
      /^(elig-|elig_)/,
    );

    await page.getByRole("button", { name: "追蹤行程" }).click();
    await expect(page.getByTestId("partner-order-number")).not.toHaveText("—");
    await expect(
      page.getByText(
        "台北市信義區松仁路 100 號 -> 桃園 T2 · 第二航廈 出發接送區",
        { exact: true },
      ),
    ).toBeVisible();
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

  test("renders every insurance eligibility state as a site-only blocked surface", async ({
    page,
  }) => {
    for (const state of insuranceBlockedStates) {
      const response = await page.goto(`/fubon/program/site/${state.segment}`);
      expect(response?.status(), state.segment).toBe(200);
      await expect(
        page.locator("[data-program-kind='insurance']"),
        state.segment,
      ).toBeVisible();
      await expect(page.locator("body"), state.segment).toContainText(
        "program: insurance · site",
      );
      await expect(page.locator("body"), state.segment).toContainText(
        state.code,
      );
      await expect(page.locator("body"), state.segment).toContainText(
        state.copy,
      );
      await expect(page.locator("body"), state.segment).toContainText(
        "理賠額度",
      );
      await expect(page.locator("body"), state.segment).not.toContainText(
        "ref_token",
      );
      await expect(page.locator("[data-program-surface='embed']")).toHaveCount(
        0,
      );
    }
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
