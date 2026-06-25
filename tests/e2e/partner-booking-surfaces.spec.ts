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

test.describe("partner booking program surfaces", () => {
  test("keeps card website booking and bank-app embed identity states distinct", async ({
    page,
  }) => {
    const siteResponse = await page.goto("/ctbc/program/site");
    expect(siteResponse?.status()).toBe(200);
    await expect(page.getByText("世界卡禮賓，從家門到登機門。")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(
      "網銀 APP 內嵌 webview",
    );
    await expect(page.locator("body")).not.toContainText("ref_token");

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

  test("renders distinct standalone card websites for every issuer without embed identity chrome", async ({
    page,
  }) => {
    const issuerSites = {
      ctbc: {
        label: "中國信託",
        hero: "世界卡禮賓，從家門到登機門。",
        card: "World Elite 世界卡",
        primary: "#12428B",
      },
      cathay: {
        label: "國泰世華",
        hero: "樹我視界，接送每一段安心旅程。",
        card: "CUBE 世界卡",
        primary: "#0B7A4B",
      },
      taishin: {
        label: "台新銀行",
        hero: "以太陽之名，照亮你的每段旅程。",
        card: "太陽無限卡",
        primary: "#B0335F",
      },
      dbs: {
        label: "星展銀行",
        hero: "Live more, Bank less — 從容啟程。",
        card: "DBS Insignia 御璽卡",
        primary: "#D72631",
      },
    } as const;

    for (const [slug, expected] of Object.entries(issuerSites)) {
      const response = await page.goto(`/${slug}/program/site`);
      expect(response?.status(), slug).toBe(200);
      await expect(page.locator(".atsite"), slug).toBeVisible();
      await expect(page.locator(".phone"), slug).toHaveCount(0);
      await expect(page.locator("body"), slug).toContainText(expected.label);
      await expect(page.locator("body"), slug).toContainText(expected.hero);
      await expect(page.locator("body"), slug).toContainText(expected.card);
      await expect(page.locator("body"), slug).toContainText("線上即時預約");
      await expect(page.locator("body"), slug).not.toContainText("ref_token");
      await expect(page.locator("body"), slug).not.toContainText(
        "issuer_signature",
      );
      await expect(page.locator("body"), slug).not.toContainText(
        "program: card · embed",
      );
      await expect(page.locator("body"), slug).not.toContainText(
        "網銀 APP 內嵌 webview",
      );

      const primary = await page
        .locator(".atsite")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--primary").trim(),
        );
      expect(primary, slug).toBe(expected.primary);
    }
  });

  test("renders card banking-app embed identity handoff for every issuer without website booking chrome", async ({
    page,
  }) => {
    const issuerEmbeds = {
      ctbc: { label: "中信銀行", palette: ["#13478F", "#0B2D5C"] },
      cathay: { label: "國泰世華銀行", palette: ["#0F5132", "#0A3621"] },
      taishin: { label: "台新銀行", palette: ["#B0335F", "#7C2241"] },
      dbs: { label: "星展銀行", palette: ["#D72631", "#9B1B22"] },
    } as const;
    const renderedPrimaries = new Set<string>();

    for (const [slug, expected] of Object.entries(issuerEmbeds)) {
      const response = await page.goto(`/${slug}/program/embed`);
      expect(response?.status(), slug).toBe(200);
      const surface = page.locator("[data-program-surface=embed]");
      await expect(surface, slug).toBeVisible();
      await expect(page.locator("body"), slug).toContainText(
        "program: card · embed",
      );
      await expect(page.locator("body"), slug).toContainText(expected.label);
      await expect(page.locator("body"), slug).toContainText("ref_token");
      await expect(page.locator("body"), slug).toContainText(
        "issuer_signature",
      );
      await expect(page.locator("body"), slug).not.toContainText(
        "線上即時預約",
      );
      await expect(page.locator("body"), slug).not.toContainText(
        "世界卡禮賓，從家門到登機門。",
      );
      await expect(page.locator("body"), slug).not.toContainText(
        "網銀 APP 內嵌 webview",
      );

      const primary = await surface.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--pbk-primary").trim(),
      );
      expect(expected.palette, slug).toContain(primary);
      renderedPrimaries.add(primary);
    }

    expect(renderedPrimaries.size).toBe(Object.keys(issuerEmbeds).length);
  });

  test("honors English locale cookie across standalone site and banking-app embed", async ({
    page,
    baseURL,
  }) => {
    await page.context().addCookies([
      {
        name: "drts-locale-v2",
        value: "en",
        url: baseURL ?? "http://localhost:3007",
      },
    ]);

    const siteResponse = await page.goto("/ctbc/program/site");
    expect(siteResponse?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Book online in real time",
    );
    await expect(page.locator("body")).toContainText("Airport Transfer");
    await expect(page.locator("body")).not.toContainText("線上即時預約");

    const embedResponse = await page.goto("/ctbc/program/embed");
    expect(embedResponse?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Signed in via the banking app",
    );
    await expect(page.locator("body")).toContainText("program: card · embed");
    await expect(page.locator("body")).not.toContainText("已透過行動銀行登入");
  });

  test("keeps legacy card booking deep links behind eligibility with card-only intake", async ({
    page,
  }) => {
    const blockedResponse = await page.goto("/ctbc/book");
    expect(blockedResponse?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("專案下單表單");
    await expect(page.locator("body")).toContainText("信用卡機場接送");
    await expect(page.locator("body")).toContainText("資格閘門 · 需先驗證");
    await expect(page.locator("body")).toContainText(
      "此機場接送方案必須先取得有效的 eligibility verification",
    );
    await expect(
      page.getByRole("link", { name: "前往資格驗證" }),
    ).toHaveAttribute("href", "/ctbc/eligibility");
    await expect(page.locator("body")).toContainText("卡別為必填。");
    await expect(page.locator("body")).toContainText("航班號碼為必填。");
    await expect(page.locator("body")).toContainText("航廈為必填。");
    await expect(page.locator("body")).toContainText("接送方向為必填。");
    await expect(page.locator("body")).not.toContainText("理賠案號");
    await expect(page.locator("body")).not.toContainText("團體 / 訂單參照");
    await expect(
      page.getByRole("button", { name: "驗證下單表單" }),
    ).toBeDisabled();

    const verifiedResponse = await page.goto(
      "/ctbc/book?eligibilityVerificationId=elig-dev-smoke",
    );
    expect(verifiedResponse?.status()).toBe(200);
    await expect(page.locator("body")).toContainText(
      "Eligibility 驗證編號 · elig-dev-smoke",
    );
    await expect(page.locator("body")).toContainText("資格閘門 · 可建立");
    await expect(page.locator("body")).toContainText(
      "請先修正標示欄位，再進行提交。",
    );
    await expect(
      page.getByRole("button", { name: "驗證下單表單" }),
    ).toBeDisabled();
  });

  test("renders legacy insurance booking as claim-driven replacement-vehicle intake", async ({
    page,
  }) => {
    const response = await page.goto("/fubon/book");
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("專案下單表單");
    await expect(page.locator("body")).toContainText("保險理賠代步");
    await expect(page.locator("body")).toContainText("資格閘門 · 需補參考資料");
    await expect(page.locator("body")).toContainText(
      "保險代步方案在理賠、保單與代步車資格資料完整前",
    );
    await expect(page.locator("body")).toContainText("理賠額度");
    await expect(page.locator("body")).toContainText("理賠案號為必填。");
    await expect(page.locator("body")).toContainText("保單號碼為必填。");
    await expect(page.locator("body")).toContainText("理賠參照為必填。");
    await expect(page.locator("body")).toContainText("理賠申請人為必填。");
    await expect(page.locator("body")).toContainText("代步車輛資格為必填。");
    await expect(page.locator("body")).not.toContainText("卡別為必填。");
    await expect(page.locator("body")).not.toContainText("團體 / 訂單參照");
    await expect(
      page.getByRole("button", { name: "驗證下單表單" }),
    ).toBeDisabled();
  });

  test("renders legacy travel booking as roster and batching intake", async ({
    page,
  }) => {
    const response = await page.goto("/lion/book");
    expect(response?.status()).toBe(200);
    await expect(page.locator("body")).toContainText("專案下單表單");
    await expect(page.locator("body")).toContainText("旅行社團體接送");
    await expect(page.locator("body")).toContainText("資格閘門 · 需補參考資料");
    await expect(page.locator("body")).toContainText(
      "旅行社接送方案需先具備團體或訂單參照",
    );
    await expect(page.locator("body")).toContainText("團體席次與分批");
    await expect(page.locator("body")).toContainText(
      "分批接送 · pickup batching",
    );
    await expect(page.locator("body")).toContainText("團體 / 訂單參照為必填。");
    await expect(page.locator("body")).toContainText(
      "團體席次必須是大於 0 的整數。",
    );
    await expect(page.locator("body")).toContainText("行程連結為必填。");
    await expect(page.locator("body")).toContainText("集合點為必填。");
    await expect(page.locator("body")).toContainText(
      "乘客名單 / roster為必填。",
    );
    await expect(page.locator("body")).not.toContainText("卡別為必填。");
    await expect(page.locator("body")).not.toContainText("理賠案號");
    await expect(
      page.getByRole("button", { name: "驗證下單表單" }),
    ).toBeDisabled();
  });

  test("honors English locale on legacy travel booking form", async ({
    page,
    baseURL,
  }) => {
    await page.context().addCookies([
      {
        name: "drts-locale-v2",
        value: "en",
        url: baseURL ?? "http://localhost:3007",
      },
    ]);

    const response = await page.goto("/lion/book");
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Program booking form");
    await expect(page.locator("body")).toContainText("Travel agency transfer");
    await expect(page.locator("body")).toContainText(
      "Group seats and batching",
    );
    await expect(page.locator("body")).toContainText(
      "Group / order reference is required.",
    );
    await expect(page.locator("body")).not.toContainText("專案下單表單");
    await expect(
      page.getByRole("button", { name: "Validate booking form" }),
    ).toBeDisabled();
  });
});
