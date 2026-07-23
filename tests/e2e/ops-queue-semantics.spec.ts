import { expect, test } from "@playwright/test";

function getTargetBaseUrl(baseURL?: string): string {
  return (
    baseURL ??
    process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
    process.env.OPS_CONSOLE_BASE_URL ??
    "http://127.0.0.1:3003"
  );
}

test.describe("MTX-QUEUE-003 Ops Console Queue Semantics UI", () => {
  test("renders queue mode as explicit text and handles site blank without masquerading in zh", async ({
    page,
    context,
    baseURL,
  }) => {
    const targetUrl = getTargetBaseUrl(baseURL);
    await context.addCookies([
      {
        name: "drts-locale-v2",
        value: "zh",
        url: targetUrl,
      },
    ]);

    await page.goto(`${targetUrl}/dispatch/ORD-MTX-REFUSAL-02`, {
      waitUntil: "domcontentloaded",
    });

    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible();

    const pageText = await mainContent.innerText();
    expect(pageText).toMatch(
      /虛擬媒合|實體排班|招呼站候客|平台媒合|未指定站點/,
    );
  });

  test("renders queue mode text and handles site blank in en locale", async ({
    page,
    context,
    baseURL,
  }) => {
    const targetUrl = getTargetBaseUrl(baseURL);
    await context.addCookies([
      {
        name: "drts-locale-v2",
        value: "en",
        url: targetUrl,
      },
    ]);

    await page.goto(`${targetUrl}/dispatch/ORD-MTX-REFUSAL-02`, {
      waitUntil: "domcontentloaded",
    });

    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible();

    const pageText = await mainContent.innerText();
    expect(pageText).toMatch(
      /Virtual Matching|Physical Rank|Taxi Stand|Platform Reserved|Unassigned Site/i,
    );
  });

  test("renders detail page queue semantics and statutory refusal state controls correctly in zh and en", async ({
    page,
    context,
    baseURL,
  }) => {
    const targetUrl = getTargetBaseUrl(baseURL);
    // 1. Check Chinese detail page
    await context.addCookies([
      {
        name: "drts-locale-v2",
        value: "zh",
        url: targetUrl,
      },
    ]);

    await page.goto(`${targetUrl}/dispatch/ORD-MTX-REFUSAL-02`, {
      waitUntil: "domcontentloaded",
    });

    const mainContentZh = page.locator("main");
    await expect(mainContentZh).toBeVisible();

    const textZh = await mainContentZh.innerText();
    // Verify Chinese statutory refusal copy and state indicators are present
    expect(textZh).toContain(
      "此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。",
    );
    expect(textZh).toMatch(
      /多元化計程車法定拒絕態|依法禁止人工 Override 或強行排班|法定拒絕態/,
    );

    // 2. Check English detail page
    await context.addCookies([
      {
        name: "drts-locale-v2",
        value: "en",
        url: targetUrl,
      },
    ]);

    await page.goto(`${targetUrl}/dispatch/ORD-MTX-REFUSAL-02`, {
      waitUntil: "domcontentloaded",
    });

    const mainContentEn = page.locator("main");
    await expect(mainContentEn).toBeVisible();

    const textEn = await mainContentEn.innerText();
    // Verify English refusal copy and state indicators are present without raw Chinese copy
    expect(textEn).not.toContain("此訂單為多元化計程車平台預約");
    expect(textEn).toContain(
      "This order is a multi-taxi platform reservation and cannot enter physical ranks or taxi stands.",
    );
    expect(textEn).toMatch(
      /Statutory Refusal State \(Multi-Taxi\)|No override or force check-in allowed|Statutory Refusal/,
    );
  });

  test("prevents override/approval links for statutory refusal orders on governance board", async ({
    page,
    context,
    baseURL,
  }) => {
    const targetUrl = getTargetBaseUrl(baseURL);
    await context.addCookies([
      {
        name: "drts-locale-v2",
        value: "zh",
        url: targetUrl,
      },
    ]);

    await page.goto(`${targetUrl}/dispatch?board=governance`, {
      waitUntil: "domcontentloaded",
    });

    const mainContent = page.locator("main");
    await expect(mainContent).toBeVisible();

    const refusalRow = page.locator("tr", {
      hasText: "ORD-MTX-REFUSAL-02",
    });
    if ((await refusalRow.count()) > 0) {
      const approvalLink = refusalRow.locator("a[href*='approval-requests']");
      await expect(approvalLink).toHaveCount(0);
      await expect(refusalRow).toContainText(
        "依法禁止人工 Override 或強行排班",
      );
    }
  });
});
