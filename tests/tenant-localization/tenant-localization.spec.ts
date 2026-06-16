import { expect, test, type Page } from "@playwright/test";

const TENANT_CONSOLE_PROJECT = "tenant-console-localization";
const PARTNER_BOOKING_PROJECT = "partner-booking-localization";
const ENTERPRISE_DISPATCH_PROJECT = "enterprise-dispatch-localization";
const LOCALE_STORAGE_KEY = "drts-locale-v2";

const TENANT_CONSOLE_ROUTES = [
  "/",
  "/addresses",
  "/audit",
  "/billing",
  "/bookings",
  "/bookings/new",
  "/api-keys",
  "/cost-centers",
  "/feature-flags",
  "/integration-governance",
  "/invoices",
  "/notifications",
  "/passengers",
  "/reports",
  "/rules",
  "/settings",
  "/sla",
  "/users",
  "/webhooks",
] as const;

const PARTNER_BOOKING_ROUTES = [
  "/",
  "/bank-demo-alpha-airport",
  "/bank-demo-alpha-airport/eligibility",
  "/bank-demo-alpha-airport/help",
  "/bank-demo-alpha-airport/program",
  "/bank-demo-alpha-airport/program/site",
  "/bank-demo-alpha-airport/program/site/landing",
  "/bank-demo-alpha-airport/program/embed",
  "/bank-demo-alpha-airport/program/embed/embed-handoff",
] as const;

const ENTERPRISE_DISPATCH_ROUTES = [
  "/",
  "/bookings",
  "/bookings/new",
  "/bookings/review",
  "/bookings/submitted",
  "/bookings/EB-7K2E1D",
  "/trip",
  "/receipts/EB-7K28Z2",
  "/help",
  "/auth-required",
  "/suspended",
  "/approval-pending",
  "/approval-rejected",
  "/quota-blocked",
  "/no-supply",
  "/degraded",
  "/embed",
  "/embed/home",
  "/embed/new",
  "/embed/review",
  "/embed/submitted",
  "/embed/trip",
  "/embed/booking/EB-7K2E1D",
  "/embed/reauth-required",
  "/embed/unsupported-host",
  "/embed/consent-required",
  "/embed/fallback-to-web",
] as const;

const ENTERPRISE_EMBED_ROUTES = new Set<string>([
  "/embed",
  "/embed/home",
  "/embed/new",
  "/embed/review",
  "/embed/submitted",
  "/embed/trip",
  "/embed/booking/EB-7K2E1D",
  "/embed/reauth-required",
  "/embed/unsupported-host",
  "/embed/consent-required",
  "/embed/fallback-to-web",
]);

async function primeLocale(page: Page, locale: "en" | "zh", baseURL: string) {
  await page.context().addCookies([
    {
      name: LOCALE_STORAGE_KEY,
      value: locale,
      url: baseURL,
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(
    ({ key, value }: { key: string; value: "en" | "zh" }) => {
      window.localStorage.setItem(key, value);
      document.cookie = `${key}=${value};path=/;max-age=31536000;SameSite=Lax`;
    },
    { key: LOCALE_STORAGE_KEY, value: locale },
  );
}

async function gotoAndSettle(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.ok() ?? response?.status() === 304, route).toBeTruthy();
  await expect(page.locator("main").first()).toBeVisible();
  await expect(page.locator("html#__next_error__"), route).toHaveCount(0);
  await expect(page.locator("body"), route).not.toContainText(
    /Application error|500 Internal Server Error/i,
  );
}

async function expectShellControls(page: Page) {
  await expect(page.locator("body")).toContainText(
    /API (檢查中|正常|降級|中斷|checking|healthy|degraded|down)/i,
  );
  await expect(page.locator("body")).toContainText(/English|繁體中文/);
}

async function gotoEnterpriseAndSettle(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.ok() ?? response?.status() === 304, route).toBeTruthy();
  await expect(page.locator("body"), route).toBeVisible();
  if (!ENTERPRISE_EMBED_ROUTES.has(route)) {
    await expect(page.locator("main").first(), route).toBeVisible();
  }
  await expect(page.locator("html#__next_error__"), route).toHaveCount(0);
  await expect(page.locator("body"), route).not.toContainText(
    /Application error|500 Internal Server Error/i,
  );
}

test.describe("tenant console localization smoke", () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== TENANT_CONSOLE_PROJECT);
    await primeLocale(
      page,
      "zh",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );
  });

  test("zh routes render without runtime error and keep shell controls", async ({
    page,
  }) => {
    for (const route of TENANT_CONSOLE_ROUTES) {
      await gotoAndSettle(page, route);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      await expectShellControls(page);
    }
  });

  test("en locale is selectable through the shared locale cookie", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );
    await gotoAndSettle(page, "/settings");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Tenant settings");
    await expect(page.locator("body")).toContainText("繁體中文");
  });

  test("en booking list empty state is localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );
    await gotoAndSettle(page, "/bookings?emptyReason=no_data");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Bookings");
    await expect(page.locator("body")).toContainText(
      "This tenant does not have any bookings yet",
    );
    await expect(page.locator("body")).toContainText("Create booking");
    await expect(page.locator("body")).not.toContainText(
      "此租戶目前還沒有任何訂單",
    );
  });

  test("en tenant long-tail routes translate legacy shell copy", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3304"),
    );

    const cases = [
      {
        route: "/",
        include: ["Create booking"],
        includeAny: [
          [
            "Hello, tenant_admin",
            "Tenant operations, billing, and readiness in one workspace",
          ],
        ],
        exclude: ["工作面", "進行中訂單", "財務快照"],
      },
      {
        route: "/passengers",
        include: ["Passenger directory", "Directory filters"],
        exclude: ["乘客通訊錄", "目錄篩選", "乘客名冊"],
      },
      {
        route: "/cost-centers",
        include: ["Cost centers", "Total rows in the current tenant directory"],
        exclude: ["目前租戶目錄總數", "空狀態原因預覽"],
      },
      {
        route: "/rules",
        include: ["Approval & quota", "Rule precedence"],
        exclude: ["審批與配額", "規則清單", "建立或編輯規則"],
      },
      {
        route: "/notifications",
        include: ["Notification preferences", "Event × channel"],
        exclude: ["通知偏好", "事件 × 通道", "儲存設定"],
      },
      {
        route: "/sla",
        include: ["SLA profile", "Current thresholds"],
        exclude: ["SLA 設定檔", "當前門檻", "重算既有訂單"],
      },
      {
        route: "/reports",
        include: ["Reports", "Cross-app report tracing"],
        exclude: ["報表", "跨應用報表追溯保持明確", "建立工作"],
      },
      {
        route: "/api-keys",
        include: ["API keys", "Issue API key"],
        exclude: ["API 金鑰", "建立金鑰", "完整明文"],
      },
      {
        route: "/webhooks",
        include: ["Endpoints · event subscriptions", "Delivery health"],
        exclude: ["新增端點", "投遞健康", "治理政策"],
      },
      {
        route: "/audit",
        include: ["Audit: cross-actor", "Cross-actor visibility"],
        exclude: ["稽核 · cross-actor", "跨 actor 可見性", "稽核回執"],
      },
    ] as const;

    for (const item of cases) {
      await gotoAndSettle(page, item.route);
      await page.waitForTimeout(350);
      for (const text of item.include) {
        await expect(page.locator("body"), item.route).toContainText(text);
      }
      if ("includeAny" in item) {
        const bodyText = await page.locator("body").innerText();
        for (const alternatives of item.includeAny) {
          expect(
            alternatives.some((text) => bodyText.includes(text)),
            "Tenant home includes one accepted English hero copy",
          ).toBeTruthy();
        }
      }
      for (const text of item.exclude) {
        await expect(page.locator("body"), item.route).not.toContainText(text);
      }
    }
  });
});

test.describe("enterprise dispatch localization smoke", () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== ENTERPRISE_DISPATCH_PROJECT);
    await primeLocale(
      page,
      "zh",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3310"),
    );
  });

  test("zh routes render without runtime error and expose shell controls", async ({
    page,
  }) => {
    for (const route of ENTERPRISE_DISPATCH_ROUTES) {
      await gotoEnterpriseAndSettle(page, route);
      await expect(page.locator("html"), route).toHaveAttribute(
        "lang",
        "zh-Hant",
      );
      if (!ENTERPRISE_EMBED_ROUTES.has(route)) {
        await expectShellControls(page);
      }
    }
  });

  test("en selected routes localize shell, booking, gate, receipt, and embed copy", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3310"),
    );

    const cases = [
      {
        route: "/",
        include: [
          "where are you headed",
          "Create booking",
          "Upcoming bookings",
        ],
        exclude: ["建立預約", "即將到來的預約"],
      },
      {
        route: "/bookings/new",
        include: ["Create booking", "Policy preview", "Continue to review"],
        exclude: ["建立預約", "政策預覽"],
      },
      {
        route: "/bookings/review",
        include: ["This booking needs approval", "Submit booking"],
        exclude: ["這筆預約需要審批", "送出預約"],
      },
      {
        route: "/bookings/submitted",
        include: ["Accepted", "Submission summary"],
        exclude: ["已受理", "不要重複送出"],
      },
      {
        route: "/bookings/EB-7K2E1D",
        include: [
          "Progress rail",
          "Trip and authority",
          "Available actions",
          "Track trip",
        ],
        exclude: ["預約詳情", "可用操作", "追蹤行程"],
      },
      {
        route: "/receipts/EB-7K28Z2",
        include: ["Trip receipt", "Receipt summary", "Back to booking details"],
        exclude: ["行程收據", "收據摘要", "返回預約詳情"],
      },
      {
        route: "/help",
        include: ["Help and support", "FAQ", "Support contacts"],
        exclude: ["說明與支援", "支援聯絡"],
      },
      {
        route: "/auth-required",
        include: ["Sign-in required again", "Back to enterprise entry"],
        exclude: ["需要重新登入", "回到企業入口"],
      },
      {
        route: "/embed/unsupported-host",
        include: ["Can't open in this environment", "Go to enterprise web"],
        exclude: ["這個開啟來源不受支援", "前往企業網站版"],
      },
    ] as const;

    for (const item of cases) {
      await gotoEnterpriseAndSettle(page, item.route);
      await page.waitForTimeout(350);
      await expect(page.locator("html"), item.route).toHaveAttribute(
        "lang",
        "en",
      );
      for (const text of item.include) {
        await expect(page.locator("body"), item.route).toContainText(text);
      }
      for (const text of item.exclude) {
        await expect(page.locator("body"), item.route).not.toContainText(text);
      }
    }
  });

  test("language toggle switches the enterprise shell through the shared cookie", async ({
    page,
  }) => {
    await gotoEnterpriseAndSettle(page, "/auth-required");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await page.getByRole("button", { name: "切換語言" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Sign-in required again");
    await expect(page.locator("body")).toContainText("繁體中文");
  });

  test("short enterprise gate pages keep the footer anchored near the viewport bottom", async ({
    page,
  }) => {
    await gotoEnterpriseAndSettle(page, "/auth-required");
    const footerBox = await page.locator("footer").boundingBox();
    const viewport = page.viewportSize();
    expect(footerBox, "footer should be measurable").not.toBeNull();
    expect(viewport, "viewport should be configured").not.toBeNull();
    expect((footerBox?.y ?? 0) + (footerBox?.height ?? 0)).toBeGreaterThan(
      (viewport?.height ?? 0) - 80,
    );
  });
});

test.describe("partner booking localization smoke", () => {
  test.setTimeout(240_000);

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== PARTNER_BOOKING_PROJECT);
    await primeLocale(
      page,
      "zh",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
  });

  test("zh routes render in the canonical partner-booking app", async ({
    page,
  }) => {
    for (const route of PARTNER_BOOKING_ROUTES) {
      await gotoAndSettle(page, route);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      await expectShellControls(page);
    }
  });

  test("en locale reaches the canonical root shell", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Pick a tenant slug");
    await expect(page.locator("body")).toContainText("繁體中文");
    await expect(page.locator("body")).toContainText("Cathay United Bank");
    await expect(page.locator("body")).toContainText("Taishin Bank");
    await expect(page.locator("body")).toContainText("DBS Bank");
    await expect(page.locator("body")).toContainText("Grand Hotel");
    await expect(page.locator("body")).not.toContainText("中信銀行");
    await expect(page.locator("body")).not.toContainText("國泰世華銀行");
    await expect(page.locator("body")).not.toContainText("台新銀行");
    await expect(page.locator("body")).not.toContainText("星展銀行");
    await expect(page.locator("body")).not.toContainText("凱撒飯店");
    await expect(page.locator("body")).not.toContainText("信用卡機場接送");
  });

  test("en program site landing keeps card funnel localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/bank-demo-alpha-airport/program/site/landing");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Credit-card airport transfer",
    );
    await expect(page.locator("body")).toContainText("View eligibility");
    await expect(page.locator("body")).not.toContainText("信用卡機場接送");
    await expect(page.locator("body")).not.toContainText("查看資格確認");
  });

  test("en insurance blocked state keeps claim copy localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/fubon/program/site/insurance_policy");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Policy eligibility failed",
    );
    await expect(page.locator("body")).toContainText("Policy No.");
    await expect(page.locator("body")).toContainText("Contact Fubon Insurance");
    await expect(page.locator("body")).not.toContainText("保單資格不符");
    await expect(page.locator("body")).not.toContainText("聯絡富邦產險");
    await expect(page.locator("body")).not.toContainText("原因");
  });

  test("en travel review keeps group transfer copy localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(page, "/lion/program/site/review");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText(
      "Group transfer · segment 1",
    );
    await expect(page.locator("body")).toContainText(
      "Vehicle assignment and fees",
    );
    await expect(page.locator("body")).toContainText(
      "Roster and group seats are aligned",
    );
    await expect(page.locator("body")).not.toContainText("團體接送");
    await expect(page.locator("body")).not.toContainText("車輛配置與費用");
    await expect(page.locator("body")).not.toContainText("已含團費");
  });

  test("en embed unsupported token values stay localized", async ({
    page,
  }, testInfo) => {
    await primeLocale(
      page,
      "en",
      String(testInfo.project.use.baseURL ?? "http://127.0.0.1:3307"),
    );
    await gotoAndSettle(
      page,
      "/bank-demo-alpha-airport/program/embed/embed-unsupported",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("body")).toContainText("Unauthorized");
    await expect(page.locator("body")).toContainText("Missing");
    await expect(page.locator("body")).not.toContainText("未授權");
    await expect(page.locator("body")).not.toContainText("缺少");
  });
});
