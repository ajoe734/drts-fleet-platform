import { expect, test, type Page } from "@playwright/test";

const BANK_CONSOLE_BASE_URL =
  process.env.DRTS_DEV_BANK_CONSOLE_BASE_URL ??
  "https://drts-dev-bank-console-web-waji3fer3a-uc.a.run.app";

const PARTNER_BOOKING_BASE_URL =
  process.env.DRTS_DEV_PARTNER_BOOKING_BASE_URL ??
  "https://drts-dev-partner-booking-web-waji3fer3a-uc.a.run.app";

type BankDemoCase = {
  code: "ctbc" | "cathay" | "fubon";
  issuerCode: string;
  zhName: string;
  enName: string;
};

type PartnerBrandCase = {
  slug: string;
  zhName: string;
  expectedProgramText: RegExp;
};

const bankDemoCases: BankDemoCase[] = [
  {
    code: "ctbc",
    issuerCode: "CTBC",
    zhName: "中信銀行",
    enName: "CTBC Bank",
  },
  {
    code: "cathay",
    issuerCode: "CATHAY",
    zhName: "國泰世華銀行",
    enName: "Cathay United Bank",
  },
  {
    code: "fubon",
    issuerCode: "FUBON",
    zhName: "富邦銀行",
    enName: "Fubon Bank",
  },
];

const bankBusinessRoutes = [
  { path: "/", marker: /總覽|銀行卡友後台|Bank \/ issuer console/i },
  { path: "/bookings", marker: /卡友訂單|masked|訂單/i },
  { path: "/contracts", marker: /合約|SLA/i },
  { path: "/statements", marker: /結算對帳單|對帳/i },
  { path: "/programs", marker: /方案與配額|方案/i },
  { path: "/users", marker: /使用者與角色|使用者/i },
  { path: "/audit", marker: /稽核|audit/i },
] as const;

const bankSignedOutProtectedRoutes = [
  { path: "/", forbiddenData: /FUBON-(WE|BIZ|NEW)|CTBC-(WE|BIZ|NEW)/ },
  {
    path: "/bookings",
    forbiddenData: /ord_fubon|ord_ctbc|BK-240|AUTH-|BR\*\*\*/i,
  },
  {
    path: "/bookings/ord_fubon_240611_01",
    forbiddenData: /ord_fubon|BK-240611|AUTH-|BR\*\*\*/i,
  },
  {
    path: "/contracts",
    forbiddenData: /ctr_fubon|ctr_ctbc|FUBON_WORLD|CTBC_WORLD|SLA/i,
  },
  {
    path: "/contracts/ctr_fubon_world_elite_2026",
    forbiddenData: /ctr_fubon|FUBON_WORLD|BK-240611|AUTH-|SLA/i,
  },
  {
    path: "/statements",
    forbiddenData: /STM-FUBON|STM-CTBC|trip_fubon|trip_ctbc|NT\$/i,
  },
  {
    path: "/statements/2026-06",
    forbiddenData: /STM-FUBON|STM-CTBC|trip_fubon|trip_ctbc|NT\$/i,
  },
  { path: "/programs", forbiddenData: /FUBON-(WE|BIZ|NEW)|990 趟|1,200 趟/ },
  { path: "/users", forbiddenData: /fubon\.demo|ctbc\.demo|program-admin/i },
  {
    path: "/audit",
    forbiddenData: /fubon\.program-admin|ctbc\.program-admin|AUD-2026/i,
  },
] as const;

const cardProgramBrands: PartnerBrandCase[] = [
  {
    slug: "ctbc",
    zhName: "中信銀行",
    expectedProgramText:
      /信用卡機場接送|機場接送|Credit-card airport transfer/i,
  },
  {
    slug: "cathay",
    zhName: "國泰世華銀行",
    expectedProgramText:
      /信用卡機場接送|機場接送|Credit-card airport transfer/i,
  },
  {
    slug: "taishin",
    zhName: "台新銀行",
    expectedProgramText:
      /信用卡機場接送|機場接送|Credit-card airport transfer/i,
  },
  {
    slug: "dbs",
    zhName: "星展銀行",
    expectedProgramText:
      /信用卡機場接送|機場接送|Credit-card airport transfer/i,
  },
];

const insuranceStates = [
  "insurance_policy",
  "insurance_replacement_vehicle",
  "insurance_roster",
  "insurance_pending",
  "insurance_missing",
  "insurance_expired",
  "insurance_cancelled",
] as const;

const embedStates = [
  {
    state: "embed-handoff",
    requiredText: [
      /session_resolved · 自動帶入|session_resolved · auto-filled/i,
      /issuer_signature/i,
      /cardholder_resolved/i,
      /ref_token/i,
      /開始預約接送|Start booking/i,
    ],
    forbiddenText: [/token_expired|unsupported_host|no_embed_session/i],
    expectedPrimaryHref: /\/ctbc\/program\/site\/review$/,
  },
  {
    state: "embed-reauth",
    requiredText: [
      /token_expired · 需重新驗證|token_expired · re-auth required/i,
      /issuer_session/i,
      /ref_token/i,
      /回行動銀行重新驗證|Return to banking app to re-authenticate/i,
      /不會要求您輸入卡號或密碼|will not ask for your card number or password/i,
    ],
    forbiddenText: [/session_resolved|unsupported_host|no_embed_session/i],
    expectedPrimaryHref: /\/ctbc\/program\/site\/landing$/,
  },
  {
    state: "embed-unsupported",
    requiredText: [
      /unsupported_host · 已封鎖|unsupported_host · blocked/i,
      /origin_host/i,
      /issuer_signature/i,
      /來源主機未授權|Origin host not authorized/i,
      /unknown-host\.example/i,
    ],
    forbiddenText: [/session_resolved|token_expired|no_embed_session/i],
    expectedPrimaryHref: /^https:\/\/ride\.ctbc\.com\.tw\/?$/,
  },
  {
    state: "embed-consent",
    requiredText: [
      /identity\.read/i,
      /trip\.share/i,
      /billing\.link/i,
      /不會讀取卡號或密碼|No card number or password will be read/i,
      /同意並繼續|Agree and continue/i,
    ],
    forbiddenText: [/token_expired|unsupported_host|no_embed_session/i],
    expectedPrimaryHref: /\/ctbc\/program\/site\/review$/,
  },
  {
    state: "embed-fallback",
    requiredText: [
      /no_embed_session · 改用官網|no_embed_session · use official site/i,
      /官方網站|Official site/i,
      /末四碼 \/ 網銀帳號|Last four digits \/ online-banking account/i,
      /不在此頁輸入原始卡資料|Do not enter raw card data on this page/i,
    ],
    forbiddenText: [/session_resolved|token_expired|unsupported_host/i],
    expectedPrimaryHref: /^https:\/\/ride\.ctbc\.com\.tw\/?$/,
  },
] as const;

const bankDataProjectionCases = bankDemoCases.filter(
  (bank) => bank.code !== "ctbc",
);

function buildUrl(baseUrl: string, path: string) {
  return new URL(path, baseUrl).toString();
}

function rawCardCaptureSelector() {
  return [
    "input[name*='card' i]",
    "input[autocomplete='cc-number']",
    "input[name*='cvv' i]",
    "input[name*='cvc' i]",
    "input[name*='pan' i]",
    "input[type='password']",
  ].join(", ");
}

function managementLinkSelector() {
  return [
    "a[href*='/platform-admin']",
    "a[href*='/admin']",
    "a[href*='bank-console']",
    "a[href*='/users']",
    "a[href*='/audit']",
  ].join(", ");
}

async function gotoOk(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response, url).not.toBeNull();
  expect(response?.status(), url).toBeLessThan(400);
  await expect(page.locator("body"), url).not.toContainText(
    /Application error|500 Internal Server Error/i,
  );
  await expect(page.locator("body"), url).not.toContainText(
    /This page could not be found|NEXT_NOT_FOUND/i,
  );
}

async function expectNoCtbcFixtureLeak(page: Page) {
  const main = page.locator("main");
  await expect(main).not.toContainText(
    /CTBC|ctbc|中信|ord_ctbc|ctr_ctbc|STM-CTBC|trip_ctbc/i,
  );
}

test.describe("bank console dev runtime", () => {
  test("signed-out deep links redirect to login and hide issuer business data", async ({
    page,
  }) => {
    await gotoOk(
      page,
      buildUrl(
        BANK_CONSOLE_BASE_URL,
        "/programs?bank=fubon&locale=zh&signedOut=1",
      ),
    );

    await expect(page).toHaveURL(/\/login\?bank=fubon&locale=zh&signedOut=1$/);
    const main = page.locator("main");
    await expect(main).toContainText("銀行後台登入");
    await expect(main).toContainText("富邦銀行");
    await expect(main).toContainText("你目前已登出");
    await expect(main).not.toContainText(/FUBON-(WE|BIZ|NEW)/);
    await expect(main).not.toContainText(/CTBC-(WE|BIZ|NEW)/);
    await expect(main).not.toContainText(/桃園 \/ 松山 \/ 高雄 接送/);
    await expect(main).not.toContainText(/990 趟|1,200 趟/);
  });

  test("login supports three issuer tenants and English locale", async ({
    page,
  }) => {
    await gotoOk(
      page,
      buildUrl(BANK_CONSOLE_BASE_URL, "/login?bank=fubon&locale=en"),
    );

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("main")).toContainText("Bank console sign-in");
    await expect(page.locator("main")).toContainText("Fubon Bank");
    await expect(page.locator("main")).toContainText("Fubon");
    await expect(page.locator("main")).toContainText("Program admin");
    await expect(page.locator("main")).toContainText("Ops viewer");
    await expect(page.locator("main")).toContainText("Finance");

    for (const bank of bankDemoCases) {
      await expect(page.locator("main")).toContainText(bank.enName);
      await expect(page.locator("main")).toContainText(bank.issuerCode);
    }
  });

  test("program allocation page applies selected issuer tenant identity", async ({
    page,
  }) => {
    for (const bank of bankDemoCases) {
      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/programs?bank=${bank.code}&locale=zh`,
        ),
      );

      await expect(page.locator("body")).toContainText(bank.zhName);
      await expect(page.locator("main")).toContainText(bank.issuerCode);
      await expect(page.locator("main")).toContainText(
        new RegExp(`${bank.issuerCode}-(WE|BIZ|NEW)`),
      );
    }
  });

  test("business routes preserve selected issuer shell identity", async ({
    page,
  }) => {
    for (const bank of bankDemoCases) {
      for (const route of bankBusinessRoutes) {
        await gotoOk(
          page,
          buildUrl(
            BANK_CONSOLE_BASE_URL,
            `${route.path}?bank=${bank.code}&locale=zh`,
          ),
        );

        await expect(page.locator("body")).toContainText(bank.zhName);
        await expect(page.locator("body")).toContainText(bank.issuerCode);
        await expect(page.locator("body")).toContainText(route.marker);
      }
    }
  });

  test("signed-out deep links from business routes land on login boundary", async ({
    page,
  }) => {
    for (const route of bankSignedOutProtectedRoutes) {
      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `${route.path}?bank=fubon&locale=zh&signedOut=1`,
        ),
      );

      await expect(page).toHaveURL(
        /\/login\?bank=fubon&locale=zh&signedOut=1$/,
      );
      const main = page.locator("main");
      await expect(main).toContainText("銀行後台登入");
      await expect(main).toContainText("富邦銀行");
      await expect(main).not.toContainText(/FUBON-(WE|BIZ|NEW)/);
      await expect(main).not.toContainText(/CTBC-(WE|BIZ|NEW)/);
      await expect(main).not.toContainText(/BK-240|AUD-2026|STM-CTBC/);
      await expect(main).not.toContainText(/990 趟|NT\$/);
      await expect(main).not.toContainText(route.forbiddenData);
    }
  });

  test("account menu routes to issuer-scoped user management", async ({
    page,
  }) => {
    await gotoOk(
      page,
      buildUrl(BANK_CONSOLE_BASE_URL, "/programs?bank=cathay&locale=zh"),
    );

    await page.locator(".bank-account-menu summary").click();
    await page
      .locator(".bank-account-popover .bank-account-action", {
        hasText: "帳號管理",
      })
      .click();
    await expect(page).toHaveURL(/\/users\?bank=cathay&locale=zh$/);
    await expect(page.locator("body")).toContainText("國泰世華銀行");
    await expect(page.locator("main")).toContainText("cathay.demo");
  });

  test("account menu switch-account keeps the selected issuer", async ({
    page,
  }) => {
    await gotoOk(
      page,
      buildUrl(BANK_CONSOLE_BASE_URL, "/programs?bank=cathay&locale=zh"),
    );
    await page.locator(".bank-account-menu summary").click();
    await page
      .locator(".bank-account-popover .bank-account-action", {
        hasText: "切換帳號",
      })
      .click();
    await expect(page).toHaveURL(/\/login\?bank=cathay&locale=zh$/);
    await expect(page.locator("main")).toContainText("國泰世華銀行");
  });

  test("account menu logout lands on signed-out login boundary", async ({
    page,
  }) => {
    await gotoOk(
      page,
      buildUrl(BANK_CONSOLE_BASE_URL, "/statements?bank=fubon&locale=zh"),
    );
    await page.locator(".bank-account-menu summary").click();
    await page
      .locator(".bank-account-popover .bank-account-action", {
        hasText: "登出",
      })
      .click();
    await expect(page).toHaveURL(/\/login\?bank=fubon&locale=zh&signedOut=1$/);
    await expect(page.locator("main")).toContainText("銀行後台登入");
    await expect(page.locator("main")).toContainText("富邦銀行");
    await expect(page.locator("main")).not.toContainText(/STM-CTBC|NT\$/);
  });

  test("strict data projection keeps non-CTBC issuer content isolated", async ({
    page,
  }) => {
    test.skip(
      process.env.DRTS_BANK_CONSOLE_DATA_PROJECTION_STRICT !== "1",
      "Set DRTS_BANK_CONSOLE_DATA_PROJECTION_STRICT=1 to validate issuer data projection.",
    );

    for (const bank of bankDataProjectionCases) {
      const issuerLower = bank.issuerCode.toLowerCase();

      await gotoOk(
        page,
        buildUrl(BANK_CONSOLE_BASE_URL, `/?bank=${bank.code}&locale=zh`),
      );
      await expect(page.locator("main")).toContainText(bank.issuerCode);
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/bookings?bank=${bank.code}&locale=zh`,
        ),
      );
      await expect(page.locator("main")).toContainText(`ord_${issuerLower}`);
      await expect(page.locator("main")).toContainText(bank.zhName.slice(0, 2));
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/bookings/ord_${issuerLower}_240611_01?bank=${bank.code}&locale=zh`,
        ),
      );
      await expect(page.locator("main")).toContainText(
        `ord_${issuerLower}_240611_01`,
      );
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/contracts?bank=${bank.code}&locale=zh`,
        ),
      );
      await expect(page.locator("main")).toContainText(
        `${bank.issuerCode}_WORLD_ELITE`,
      );
      await expect(
        page.locator(
          `main a[href*="/contracts/ctr_${issuerLower}_world_elite_2026"]`,
        ),
      ).toBeVisible();
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/contracts/ctr_${issuerLower}_world_elite_2026?bank=${bank.code}&locale=zh`,
        ),
      );
      await expect(page.locator("main")).toContainText(bank.zhName.slice(0, 2));
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/statements?bank=${bank.code}&locale=zh`,
        ),
      );
      await expect(page.locator("main")).toContainText(
        `STM-${bank.issuerCode}-202606`,
      );
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(
          BANK_CONSOLE_BASE_URL,
          `/statements/2026-06?bank=${bank.code}&locale=zh`,
        ),
      );
      await expect(page.locator("main")).toContainText(
        `STM-${bank.issuerCode}-202606`,
      );
      await expect(page.locator("main")).toContainText(`trip_${issuerLower}`);
      await expectNoCtbcFixtureLeak(page);

      await gotoOk(
        page,
        buildUrl(BANK_CONSOLE_BASE_URL, `/audit?bank=${bank.code}&locale=zh`),
      );
      await expect(page.locator("main")).toContainText(
        `${issuerLower}.program-admin`,
      );
      await expectNoCtbcFixtureLeak(page);
    }
  });
});

test.describe("partner booking dev runtime", () => {
  test("card issuer brands expose separate website and bank-app embed surfaces", async ({
    page,
  }) => {
    for (const brand of cardProgramBrands) {
      await gotoOk(page, buildUrl(PARTNER_BOOKING_BASE_URL, `/${brand.slug}`));
      await expect(page.locator("body")).toContainText(brand.zhName);

      await gotoOk(
        page,
        buildUrl(PARTNER_BOOKING_BASE_URL, `/${brand.slug}/program/site`),
      );
      await expect(page.locator("body")).toContainText(
        brand.expectedProgramText,
      );

      await gotoOk(
        page,
        buildUrl(PARTNER_BOOKING_BASE_URL, `/${brand.slug}/program/embed`),
      );
      await expect(page.locator("body")).toContainText(/內嵌|銀行 App|token/i);
      await expect(page.locator(rawCardCaptureSelector())).toHaveCount(0);
      await expect(page.locator(managementLinkSelector())).toHaveCount(0);
    }
  });

  test("card embed identity states enforce token, host, consent, and fallback boundaries", async ({
    page,
  }) => {
    for (const {
      state,
      requiredText,
      forbiddenText,
      expectedPrimaryHref,
    } of embedStates) {
      await gotoOk(
        page,
        buildUrl(PARTNER_BOOKING_BASE_URL, `/ctbc/program/embed/${state}`),
      );

      const root = page.locator("[data-program-surface='embed']");
      await expect(root).toBeVisible();
      await expect(root).toHaveAttribute("data-program-kind", "card");
      await expect(root).toContainText(/銀行 App|行動銀行|token|reference/i);
      for (const text of requiredText) {
        await expect(root).toContainText(text);
      }
      for (const text of forbiddenText) {
        await expect(root).not.toContainText(text);
      }
      await expect(root.locator(rawCardCaptureSelector())).toHaveCount(0);
      await expect(root.locator(managementLinkSelector())).toHaveCount(0);
      const hrefs = await root
        .locator("a")
        .evaluateAll((links) =>
          links.map((link) => link.getAttribute("href") ?? ""),
        );
      expect(
        hrefs.some((href) => expectedPrimaryHref.test(href)),
        `${state} expected a safe CTA matching ${expectedPrimaryHref}`,
      ).toBe(true);
    }
  });

  test("insurance program exposes all claim-driven eligibility states", async ({
    page,
  }) => {
    await gotoOk(
      page,
      buildUrl(PARTNER_BOOKING_BASE_URL, "/fubon/program/site"),
    );
    await expect(page.locator("body")).toContainText(/保險理賠代步|理賠額度/);

    for (const state of insuranceStates) {
      await gotoOk(
        page,
        buildUrl(PARTNER_BOOKING_BASE_URL, `/fubon/program/site/${state}`),
      );
      await expect(page.locator("body")).toContainText(/保險|理賠|代步/);
    }
  });

  test("travel site is available and non-card programs reject bank-app embed", async ({
    page,
    request,
  }) => {
    await gotoOk(
      page,
      buildUrl(PARTNER_BOOKING_BASE_URL, "/lion/program/site"),
    );
    await expect(page.locator("body")).toContainText(/旅行社團體接送|團體席次/);

    for (const slug of ["fubon", "lion"]) {
      const response = await request.get(
        buildUrl(PARTNER_BOOKING_BASE_URL, `/${slug}/program/embed`),
      );
      expect(response.status(), `${slug} should not expose embed`).toBe(404);
    }
  });
});
