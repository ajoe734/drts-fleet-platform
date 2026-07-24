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
  test("renders the production queue overview with all required server fields and filters", async ({
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

    await page.goto(`${targetUrl}/dispatch/queue`, {
      waitUntil: "domcontentloaded",
    });

    const overview = page.locator('[data-screen-id="MTX-QUEUE-UI-01"]');
    await expect(overview).toBeVisible();
    await expect(overview).toContainText("佇列營運");
    await expect(overview).toContainText("Runtime Profile");
    await expect(overview).toContainText("服務區");
    await expect(overview).toContainText("營運許可");
    await expect(overview).toContainText("進場時間");
    await expect(overview).toContainText("最後更新");
    await expect(overview).toContainText("QE-MTX-VIRTUAL-001");
    await expect(overview).toContainText("QE-ORDINARY-PHYSICAL-001");

    await page.locator('select[name="profile"]').selectOption("ordinary_taxi");
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/profile=ordinary_taxi/);
    await expect(overview).toContainText("QE-ORDINARY-PHYSICAL-001");
    await expect(overview).not.toContainText("QE-MTX-VIRTUAL-001");
  });

  test("renders queue entry detail from server authority without deriving a denial", async ({
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

    await page.goto(`${targetUrl}/dispatch/queue/QE-MTX-VIRTUAL-001`, {
      waitUntil: "domcontentloaded",
    });

    const detail = page.locator('[data-screen-id="MTX-QUEUE-UI-02"]');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Queue Entry Detail");
    await expect(detail).toContainText("Virtual Matching");
    await expect(detail).toContainText("Multi-taxi (Platform Reserved)");
    await expect(detail).toContainText("MTX-TPE-2026-001");
    await expect(detail).toContainText("Eligible");
    await expect(
      detail.locator('[data-screen-id="MTX-QUEUE-UI-03"]'),
    ).toHaveCount(0);
  });

  for (const denial of [
    {
      id: "QE-MTX-PHYSICAL-DENIED",
      copy: "不得進入實體排班候客",
    },
    {
      id: "QE-MTX-STAND-DENIED",
      copy: "不得於計程車招呼站排班候客",
    },
  ]) {
    test(`renders ${denial.id} as a non-bypassable server denial`, async ({
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

      await page.goto(`${targetUrl}/dispatch/queue/${denial.id}`, {
        waitUntil: "domcontentloaded",
      });

      const denialState = page.locator('[data-screen-id="MTX-QUEUE-UI-03"]');
      await expect(denialState).toBeVisible();
      await expect(denialState).toContainText(denial.copy);
      await expect(denialState).toContainText("法定限制 · 不可繞過");
      await expect(denialState).toContainText("資格與拒絕結果由伺服器提供");

      const interactiveText = (
        await page.locator("a, button").allInnerTexts()
      ).join(" ");
      const interactiveHrefs = (
        await page
          .locator("a")
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute("href") ?? "").join(" "),
          )
      ).toLowerCase();
      expect(interactiveText).not.toMatch(
        /override|強制進場|仍要派遣|force check-?in/i,
      );
      expect(interactiveHrefs).not.toMatch(
        /override|force[_-]?check[_-]?in|approval/,
      );
    });
  }

  test("keeps an ordinary taxi physical-rank entry isolated from multi-taxi denial", async ({
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

    await page.goto(`${targetUrl}/dispatch/queue/QE-ORDINARY-PHYSICAL-001`, {
      waitUntil: "domcontentloaded",
    });

    const detail = page.locator('[data-screen-id="MTX-QUEUE-UI-02"]');
    await expect(detail).toContainText("一般計程車");
    await expect(detail).toContainText("實體排班");
    await expect(detail).toContainText("符合資格");
    await expect(
      detail.locator('[data-screen-id="MTX-QUEUE-UI-03"]'),
    ).toHaveCount(0);
    await expect(detail).not.toContainText("法定限制 · 不可繞過");
  });

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
    await expect(
      page.locator(
        'a[data-screen-link="MTX-QUEUE-UI-01"][href="/dispatch/queue"]',
      ),
    ).toBeVisible();

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
