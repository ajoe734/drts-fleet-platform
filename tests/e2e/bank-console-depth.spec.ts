import { expect, test, type Page } from "@playwright/test";

const protectedData = /CH••••98|BK-240611-018|BE••••42/;
const ctbcVisibleLeak = /CTBC|ctbc|中信/;

const managementRoutes = [
  "/",
  "/bookings",
  "/bookings/ord_ctbc_240611_01",
  "/contracts",
  "/contracts/ctr_ctbc_world_elite_2026",
  "/statements",
  "/statements/2026-06",
  "/programs",
  "/users",
  "/audit",
];

function withQuery(path: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return `${path}?${params.toString()}`;
}

async function expectRoute(
  page: Page,
  pathname: string,
  query: Record<string, string>,
) {
  await expect(page).toHaveURL((url) => {
    if (url.pathname !== pathname) {
      return false;
    }

    return Object.entries(query).every(
      ([key, value]) => url.searchParams.get(key) === value,
    );
  });
}

async function openDetails(page: Page, selector: string) {
  const details = page.locator(selector);
  const isOpen = await details.evaluate(
    (element) => (element as HTMLDetailsElement).open,
  );

  if (!isOpen) {
    await details.locator("summary").click();
  }
}

test.describe("bank console deep runtime coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("keeps all management pages scoped to the selected bank, locale, and role", async ({
    page,
  }) => {
    for (const route of managementRoutes) {
      const response = await page.goto(
        withQuery(route, {
          bank: "fubon",
          locale: "en",
          role: "bank_finance",
        }),
        { waitUntil: "domcontentloaded" },
      );

      expect(response?.status(), route).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("main"), route).toContainText(
        /Fubon|fubon|富邦|Finance/,
      );
      await expect(page.locator("main"), route).not.toContainText(
        ctbcVisibleLeak,
      );
      await expect(page.locator(".bank-account-menu summary")).toContainText(
        "Finance",
      );
    }
  });

  test("locks account-management actions for non-admin bank personas", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/users", {
        bank: "cathay",
        locale: "zh",
        role: "bank_ops_viewer",
      }),
    );

    await expect(page.locator("body")).toContainText("國泰世華銀行");
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "營運檢視",
    );
    await expect(page.locator("main")).not.toContainText(ctbcVisibleLeak);
    await expect(
      page.getByRole("button", { name: "限管理員" }).first(),
    ).toBeDisabled();

    await page.locator(".bank-account-menu summary").click();
    await expect(page.locator(".bank-account-popover")).toContainText(
      "ops-viewer@cathay.demo",
    );
  });

  test("keeps signed-out deep links behind the auth boundary", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/bookings", {
        bank: "fubon",
        locale: "zh",
        role: "bank_program_admin",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("main")).toContainText("富邦銀行");

    await page.locator(".bank-account-menu summary").click();
    await page.getByRole("link", { name: "登出" }).click();

    await expectRoute(page, "/login", {
      bank: "fubon",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).toContainText("你目前已登出");
    await expect(page.locator("main")).not.toContainText(protectedData);

    const signedOutCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "drts_bank_console_signed_out",
    );
    expect(signedOutCookie?.value).toBe("1");

    await page.goto(
      withQuery("/statements/2026-06", {
        bank: "fubon",
        locale: "zh",
        role: "bank_finance",
      }),
    );
    await expectRoute(page, "/login", {
      bank: "fubon",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).not.toContainText(/STM-FUBON|應付/);
  });

  test("keeps bank switch, locale switch, and signed-out account chrome scoped", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/users", {
        bank: "ctbc",
        locale: "zh",
        role: "bank_program_admin",
      }),
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await expect(page.locator(".bank-demo-menu summary")).toContainText("中信");
    await expect(page.locator(".bank-locale-switch")).toContainText("繁");
    await expect(page.locator(".bank-locale-switch")).toContainText("EN");
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "周敬文",
    );
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "方案管理員",
    );

    await openDetails(page, ".bank-account-menu");
    await expect(page.locator(".bank-account-popover")).toContainText(
      "program-admin@ctbcbank.com",
    );
    await expect(page.locator(".bank-account-popover")).toContainText(
      "帳號管理",
    );
    await expect(page.locator(".bank-account-popover")).toContainText("登出");

    await page
      .locator(".bank-locale-switch .bank-locale-link", { hasText: "EN" })
      .click();
    await expectRoute(page, "/users", {
      bank: "ctbc",
      locale: "en",
      role: "bank_program_admin",
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("main")).toContainText("People & roles");
    await expect(page.locator("main")).not.toContainText("使用者與角色");
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "Wen Chou",
    );
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "Program admin",
    );

    await openDetails(page, ".bank-demo-menu");
    await page
      .locator(".bank-demo-popover .bank-demo-option", {
        hasText: "Fubon Bank",
      })
      .click();
    await expectRoute(page, "/users", {
      bank: "fubon",
      locale: "en",
      role: "bank_program_admin",
    });
    await expect(page.locator(".bank-demo-menu summary")).toContainText(
      "Fubon",
    );
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "P. Chen",
    );
    await expect(page.locator("body")).toContainText("Fubon");
    await expect(page.locator("main")).not.toContainText("ctbcbank.com");

    await openDetails(page, ".bank-account-menu");
    await expect(page.locator(".bank-account-popover")).toContainText(
      "program-admin@fubon.demo",
    );
    await page.getByRole("link", { name: "Sign out" }).click();
    await expectRoute(page, "/login", {
      bank: "fubon",
      locale: "en",
      signedOut: "1",
    });

    await expect(page.locator("main")).toContainText("You are signed out");
    await expect(page.locator("main")).not.toContainText("People & roles");
    await expect(page.locator("main")).not.toContainText("program-admin");
    await expect(page.locator("main")).not.toContainText("fubon.demo");
    await expect(page.locator(".bank-account-menu")).toHaveCount(0);
    await expect(page.locator(".bank-demo-menu")).toHaveCount(0);
    await expect(page.locator("body")).toContainText("Bank console sign-in");
    await expect(page.locator("body")).toContainText("Sign in as demo user");
    await expect(page.locator("body")).not.toContainText(
      "program-admin@fubon.demo",
    );
    await expect(page.locator("body")).not.toContainText("Account management");
  });

  test("applies distinct issuer theme variables for each demo bank", async ({
    page,
  }) => {
    const expectedBanks = {
      ctbc: { primary: "#6E9DE0", label: "中信" },
      cathay: { primary: "#53A27D", label: "國泰" },
      taishin: { primary: "#D77499", label: "台新" },
      dbs: { primary: "#EF6F76", label: "星展" },
      fubon: { primary: "#4AB08B", label: "富邦" },
    } as const;

    for (const [bank, expected] of Object.entries(expectedBanks)) {
      await page.goto(
        withQuery("/programs", {
          bank,
          locale: "zh",
          role: "bank_program_admin",
        }),
        { waitUntil: "domcontentloaded" },
      );

      const shellVars = await page
        .locator(".bank-runtime-shell")
        .last()
        .evaluate((element) => {
          const styles = getComputedStyle(element);

          return {
            bankNavy: styles.getPropertyValue("--bank-navy").trim(),
            issuerPrimary: styles.getPropertyValue("--issuer-primary").trim(),
          };
        });

      expect(shellVars.bankNavy, bank).toBe(expected.primary);
      expect(shellVars.issuerPrimary, bank).toBe(expected.primary);
      await expect(page.locator(".bank-demo-menu summary"), bank).toContainText(
        expected.label,
      );
    }
  });
});
