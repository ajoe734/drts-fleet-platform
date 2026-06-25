import { expect, test, type Page } from "@playwright/test";

// Surface smoke for the standalone Channel Partner Portal (referral channel
// partners' self-service: usage attribution + revenue share + statements).
// Locale-robust markers (en | zh) so the smoke does not depend on the deployed
// default locale. Routes are top-level (the app dropped the legacy /referral
// prefix when it was extracted out of fleet-partner-portal-web).
const routes = [
  { path: "/dashboard", marker: /Channel Dashboard|渠道總覽/ },
  { path: "/usage", marker: /Usage|用量明細/ },
  { path: "/statements", marker: /Referral Statements|分潤對帳單/ },
] as const;

const forbiddenBackOfficeMarkers =
  /Platform Admin|Fleet Partners|Tenant Console|Bank Console|Ops Console|Management|管理後台|平台管理|租戶後台|銀行後台|營運後台/;
const forbiddenPiiMarkers =
  /王小明|陳怡君|林宜君|Sato Kenji|09\d{2}[-\s]?\d{3}[-\s]?\d{3}/;

async function useEnglishLocale(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "drts-locale-v2",
      value: "en",
      url: baseURL ?? "http://localhost:3013",
      sameSite: "Lax",
    },
  ]);
  await page.addInitScript(() => {
    window.localStorage.setItem("drts-locale-v2", "en");
    document.cookie = "drts-locale-v2=en;path=/;max-age=31536000;SameSite=Lax";
  });
}

async function openFirstStatementDetail(page: Page) {
  const response = await page.goto("/statements", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.ok()).toBeTruthy();

  const detailLink = page.locator("a[href^='/statements/']").first();
  await expect(detailLink).toHaveAttribute("href", /\/statements\/\d{4}-\d{2}/);
  const href = await detailLink.getAttribute("href");
  expect(href).toBeTruthy();

  const detailResponse = await page.goto(href!, {
    waitUntil: "domcontentloaded",
  });
  expect(detailResponse?.ok()).toBeTruthy();

  return href!.split("/").pop()!;
}

test.describe("channel partner portal surfaces", () => {
  for (const { path, marker } of routes) {
    test(`renders ${path}`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.locator("body")).toContainText(marker);
      await expect(page.locator("body")).not.toContainText(
        forbiddenBackOfficeMarkers,
      );
    });
  }

  test("statement detail keeps referral revenue data partner-scoped and masked", async ({
    page,
  }) => {
    const period = await openFirstStatementDetail(page);

    const body = page.locator("body");
    await expect(body).toContainText(
      new RegExp(`referral-statement-.*${period}`),
    );
    await expect(body).toContainText(/Statement lines|對帳單行/);
    await expect(body).toContainText(/Period totals|期別總計/);
    await expect(body).toContainText(/Signed artifact|簽名 artifact/);
    await expect(body).toContainText(/SHA-256/);
    await expect(body).toContainText(/住戶 ••••[A-Z0-9]{3}/);
    await expect(body).toContainText(
      /DRTS (?:→ (?:Partner|御和物業|夥伴)|付給 ?夥伴)/,
    );
    await expect(body).not.toContainText(forbiddenBackOfficeMarkers);
    await expect(body).not.toContainText(forbiddenPiiMarkers);
  });

  test("missing statement route shows a scoped empty state without leaking admin data", async ({
    page,
  }) => {
    const response = await page.goto("/statements/2099-12", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();

    const body = page.locator("body");
    await expect(body).toContainText(/Statement not found|找不到對帳單/);
    await expect(body).not.toContainText(/referral-statement-.*2026-/);
    await expect(body).not.toContainText(forbiddenBackOfficeMarkers);
    await expect(body).not.toContainText(forbiddenPiiMarkers);
  });

  test("en locale localizes statement detail without zh-TW operational labels", async ({
    page,
  }) => {
    await useEnglishLocale(page, String(test.info().project.use.baseURL));

    await openFirstStatementDetail(page);

    const body = page.locator("body");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(body).toContainText("Statement lines");
    await expect(body).toContainText("Period totals");
    await expect(body).toContainText("Signed artifact");
    await expect(body).toContainText("Receivable share");
    await expect(body).not.toContainText("對帳單行");
    await expect(body).not.toContainText("期別總計");
    await expect(body).toContainText(/Resident ••••[A-Z0-9]{3}/);
    await expect(body).toContainText(/Community|Taipei|Songshan|Xinyi|Neihu/);
    await expect(body).not.toContainText("應收分潤");
    await expect(body).not.toContainText("住戶");
    await expect(body).not.toContainText(/社區|台北車站|松山機場|內湖科技園區/);
  });

  test("en locale localizes usage trip rows and keeps them de-identified", async ({
    page,
  }) => {
    await useEnglishLocale(page, String(test.info().project.use.baseURL));

    const response = await page.goto("/usage", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();

    const body = page.locator("body");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(body).toContainText("Trip-level detail (de-identified)");
    await expect(body).toContainText("De-identified");
    await expect(body).toContainText(/Resident ••••[A-Z0-9]{3}/);
    await expect(body).toContainText(/Community|Taipei|Songshan|Xinyi|Neihu/);
    await expect(body).not.toContainText("行程層級（去識別）");
    await expect(body).not.toContainText("住戶");
    await expect(body).not.toContainText(/社區|台北車站|松山機場|內湖科技園區/);
    await expect(body).not.toContainText(forbiddenBackOfficeMarkers);
    await expect(body).not.toContainText(forbiddenPiiMarkers);
  });

  test("en locale keeps missing statement deep links scoped and localized", async ({
    page,
  }) => {
    await useEnglishLocale(page, String(test.info().project.use.baseURL));

    const response = await page.goto("/statements/2099-12", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();

    const body = page.locator("body");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(body).toContainText("Statement not found");
    await expect(body).not.toContainText("找不到對帳單");
    await expect(body).not.toContainText(/referral-statement-.*2026-/);
    await expect(body).not.toContainText(forbiddenBackOfficeMarkers);
    await expect(body).not.toContainText(forbiddenPiiMarkers);
  });
});
