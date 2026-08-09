import { expect, test, type Page } from "@playwright/test";
import jwt from "jsonwebtoken";

const protectedBookingData = /CH••••98|BK-240611-018|BE••••42/;

async function expectRoute(
  page: Page,
  pathname: string,
  query: Record<string, string>,
) {
  const params = new URLSearchParams(query).toString();
  await expect(page).toHaveURL(
    new RegExp(`${pathname.replace("/", "\\/")}\\?.*${params.replace(/&/g, ".*")}`),
    { timeout: 30000 },
  );
}

test.describe("bank console auth boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().clearCookies();
  });

  test("sign-out blocks direct management deep links until a demo persona signs in", async ({
    page,
  }) => {
    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });

    await expect(page.getByRole("heading", { name: /卡友訂單/ })).toBeVisible();
    await expect(page.locator("main")).toContainText("CH••••98");

    await page.locator(".bank-account-menu summary").click();
    await page.getByRole("link", { name: "登出" }).click();

    await expectRoute(page, "/login", {
      bank: "ctbc",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).toContainText(/你目前已登出/);
    await expect(page.locator("main")).not.toContainText(protectedBookingData);

    const signedOutCookie = (await page.context().cookies()).find(
      (cookie) => cookie.name === "drts_bank_console_signed_out",
    );
    expect(signedOutCookie?.value).toBe("1");

    const prefetchResponse = await page.request.get(
      "/login?bank=fubon&locale=zh&_rsc=auth-boundary",
      {
        headers: {
          "next-router-prefetch": "1",
          rsc: "1",
          "sec-fetch-dest": "empty",
        },
        maxRedirects: 0,
      },
    );
    expect(prefetchResponse.status()).toBe(307);
    expect(prefetchResponse.headers()["set-cookie"]).toBeUndefined();

    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });

    await expectRoute(page, "/login", {
      bank: "ctbc",
      locale: "zh",
      signedOut: "1",
    });
    await expect(page.locator("main")).toContainText(/你目前已登出/);
    await expect(page.locator("main")).not.toContainText(protectedBookingData);

    await Promise.all([
      page.waitForURL(
        (rawUrl) => {
          const url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;
          return (
            url.pathname === "/" &&
            url.searchParams.get("bank") === "ctbc" &&
            url.searchParams.get("role") === "bank_program_admin"
          );
        },
        { timeout: 15000 },
      ),
      page
        .locator(".login-account-card", { hasText: "方案管理員" })
        .click(),
    ]);

    await page.goto("/bookings?bank=ctbc&locale=zh", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("main")).toContainText("CH••••98");
  });

  test("fails closed when IAP JWT assertion or header contains an unknown role claim (e.g. role=auditor)", async ({
    request,
  }) => {
    const iapSecret = "drts_bank_test_iap_jwt_secret_key_2026";
    const iapToken = jwt.sign(
      {
        sub: "auditor@ctbcbank.com",
        tenant: "ctbc",
        role: "auditor",
        iss: "https://cloud.google.com/iap",
      },
      iapSecret,
    );

    const loginResponse = await request.post("/api/auth/login", {
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      data: {
        bank: "ctbc",
        locale: "zh",
      },
    });

    expect(loginResponse.status()).toBe(403);
    const loginResponseBody = await loginResponse.json();
    expect(loginResponseBody.ok).toBe(false);
    expect(loginResponseBody.error.code).toBe("FORBIDDEN");

    const exportResponse = await request.get("/api/statements/export?bank=ctbc", {
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
    });
    expect(exportResponse.status()).toBe(403);

    const exportQueryResponse = await request.get(
      "/api/statements/export?bank=ctbc&role=auditor",
    );
    expect(exportQueryResponse.status()).toBe(403);
  });
});
