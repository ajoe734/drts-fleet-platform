import { expect, test, type Page } from "@playwright/test";

const protectedData = /CH••••98|BK-240611-018|BE••••42/;
const demoBrandVisibleLeak = /ACME|acme|艾克米/;

const managementRoutes = [
  "/",
  "/bookings",
  "/bookings/ord_acme_240611_01",
  "/contracts",
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
          bank: "tailspin",
          locale: "en",
          role: "bank_finance",
        }),
        { waitUntil: "domcontentloaded" },
      );

      expect(response?.status(), route).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("main"), route).toContainText(
        /Tailspin|tailspin|泰思賓|Finance/,
      );
      await expect(page.locator("main"), route).not.toContainText(
        demoBrandVisibleLeak,
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
        bank: "contoso",
        locale: "zh",
        role: "bank_ops_viewer",
      }),
    );

    await expect(page.locator("body")).toContainText("康拓索銀行銀行");
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "營運檢視",
    );
    await expect(page.locator("main")).not.toContainText(demoBrandVisibleLeak);
    await expect(
      page.getByRole("button", { name: "限管理員" }).first(),
    ).toBeDisabled();

    await page.locator(".bank-account-menu summary").click();
    await expect(page.locator(".bank-account-popover")).toContainText(
      "ops-viewer@contoso.demo",
    );
  });

  test("keeps signed-out deep links behind the auth boundary", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/bookings", {
        bank: "tailspin",
        locale: "zh",
        role: "bank_program_admin",
      }),
      { waitUntil: "domcontentloaded" },
    );
    await expect(page.locator("main")).toContainText("泰思賓銀行");

    await page.locator(".bank-account-menu summary").click();
    await page.getByRole("link", { name: "登出" }).click();

    await expectRoute(page, "/login", {
      bank: "tailspin",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).toContainText("你目前已登出");
    await expect(page.locator("main")).not.toContainText(protectedData);

    await page.goto(
      withQuery("/statements/2026-06", {
        bank: "tailspin",
        locale: "zh",
        role: "bank_finance",
      }),
    );
    await expectRoute(page, "/login", {
      bank: "tailspin",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).not.toContainText(/STM-TAILSPIN|應付/);
  });

  test("keeps bank switch, locale switch, and signed-out account chrome scoped", async ({
    page,
  }) => {
    await page.goto(
      withQuery("/users", {
        bank: "acme",
        locale: "zh",
        role: "bank_program_admin",
      }),
      { waitUntil: "domcontentloaded" },
    );

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await expect(page.locator(".bank-demo-menu summary")).toContainText("艾克米");
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
      "program-admin@acme.example",
    );
    await expect(page.locator(".bank-account-popover")).toContainText(
      "帳號管理",
    );
    await expect(page.locator(".bank-account-popover")).toContainText("登出");

    await page
      .locator(".bank-locale-switch .bank-locale-link", { hasText: "EN" })
      .click();
    await expectRoute(page, "/users", {
      bank: "acme",
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
        hasText: "Tailspin Insurance",
      })
      .click();
    await expectRoute(page, "/users", {
      bank: "tailspin",
      locale: "en",
      role: "bank_program_admin",
    });
    await expect(page.locator(".bank-demo-menu summary")).toContainText(
      "Tailspin",
    );
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "P. Chen",
    );
    await expect(page.locator("body")).toContainText("Tailspin");
    await expect(page.locator("main")).not.toContainText("acme.example");

    await openDetails(page, ".bank-account-menu");
    await expect(page.locator(".bank-account-popover")).toContainText(
      "program-admin@tailspin.demo",
    );
    await page.getByRole("link", { name: "Sign out" }).click();
    await expectRoute(page, "/login", {
      bank: "tailspin",
      locale: "en",
      signedOut: "1",
    });

    await expect(page.locator("main")).toContainText("You are signed out");
    await expect(page.locator("main")).not.toContainText("People & roles");
    await expect(page.locator("main")).not.toContainText("program-admin");
    await expect(page.locator("main")).not.toContainText("tailspin.demo");
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "Signed out",
    );
    await expect(page.locator(".bank-account-menu summary")).toContainText(
      "Login required",
    );

    await openDetails(page, ".bank-account-menu");
    await expect(page.locator(".bank-account-popover")).toContainText(
      "Sign in",
    );
    await expect(page.locator(".bank-account-popover")).not.toContainText(
      "program-admin@tailspin.demo",
    );
    await expect(page.locator(".bank-account-popover")).not.toContainText(
      "Account management",
    );
  });
});
