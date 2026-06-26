import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
} from "@playwright/test";

// Surface and middleware smoke for the standalone Referral Embed host (the
// third-party / community-app embedded ride-hailing webview, served at
// /embed/[entrySlug]). The positive embed page itself depends on partner
// handoff authority, but host allow/deny decisions happen entirely in
// middleware and are safe to verify end-to-end here.
async function resolveAllowedEntryHost(request: APIRequestContext) {
  const response = await request.get("/");
  expect(response.ok()).toBeTruthy();

  const allowedOrigins =
    response.headers()["x-drts-postmessage-allowed-origins"];
  expect(allowedOrigins).toBeTruthy();

  const [firstOrigin] = allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  expect(firstOrigin).toBeTruthy();

  return new URL(firstOrigin).host;
}

async function openAllowedEmbed(input: {
  browser: Browser;
  baseURL: string | undefined;
  request: APIRequestContext;
  path?: string;
}) {
  const allowedEntryHost = await resolveAllowedEntryHost(input.request);
  const context = await input.browser.newContext({
    baseURL: input.baseURL,
    extraHTTPHeaders: { Origin: `https://${allowedEntryHost}` },
  });
  const page = await context.newPage();
  const response = await page.goto(
    input.path ??
      `/embed/referral-demo-community?entryHost=${allowedEntryHost}`,
    { waitUntil: "domcontentloaded" },
  );

  return { allowedEntryHost, context, page, response };
}

test.describe("referral embed surfaces", () => {
  test("renders the embed host root with scoped frame ancestors", async ({
    page,
  }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText(
      /Referral Embed|轉介嵌入前台/,
    );

    const headers = response?.headers() ?? {};
    expect(headers["x-drts-embed-decision"]).toBe("allowed");
    expect(headers["x-drts-postmessage-allowed-origins"]).toBeTruthy();
    expect(headers["content-security-policy"]).toContain("frame-ancestors");
    expect(headers["content-security-policy"]).not.toContain(
      "frame-ancestors 'none'",
    );
  });

  test("blocks an embed opened for an unauthorized entry host", async ({
    page,
  }) => {
    const response = await page.goto(
      "/embed/referral-demo-community?entryHost=evil.example.test",
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status()).toBe(403);
    expect(await page.locator("body").innerText()).toContain(
      "Embedded access denied.",
    );
    expect(response?.headers()["x-drts-embed-decision"]).toBe("blocked");
    expect(response?.headers()["x-drts-embed-block-reason"]).toBe(
      "entry_host_not_authorized",
    );
    expect(response?.headers()["x-frame-options"]).toBe("DENY");
    expect(response?.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("blocks an allowed entry host when the source origin is wrong", async ({
    browser,
    baseURL,
    request,
  }) => {
    const allowedEntryHost = await resolveAllowedEntryHost(request);
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: {
        Origin: "https://evil.example.test",
      },
    });
    const page = await context.newPage();

    const response = await page.goto(
      `/embed/referral-demo-community?entryHost=${allowedEntryHost}`,
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status()).toBe(403);
    expect(await page.locator("body").innerText()).toContain(
      "Embedded access denied.",
    );
    expect(response?.headers()["x-drts-embed-decision"]).toBe("blocked");
    expect(response?.headers()["x-drts-embed-block-reason"]).toBe(
      "origin_not_authorized",
    );
    expect(response?.headers()["x-frame-options"]).toBe("DENY");

    await context.close();
  });

  test("opens the allowed embed and keeps next-step links on the authorized host", async ({
    browser,
    baseURL,
    request,
  }) => {
    const { allowedEntryHost, context, page, response } =
      await openAllowedEmbed({ browser, baseURL, request });

    expect(response?.ok()).toBeTruthy();
    const headers = response?.headers() ?? {};
    expect(headers["x-drts-embed-decision"]).toBe("allowed");
    expect(headers["x-frame-options"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain(
      `frame-ancestors https://${allowedEntryHost}`,
    );

    await expect(page.getByText(allowedEntryHost)).toBeVisible();
    await expect(page.getByText(/社區叫車|Community ride/i)).toBeVisible();
    await expect(
      page.getByText(/確認叫車|Confirm ride request/i),
    ).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /Platform Admin|Bank Console|Ops Console|管理後台/,
    );
    expect(body).not.toMatch(/\b09\d{2}-\d{3}-\d{3}\b/);

    await page
      .getByRole("link", { name: /確認叫車|Confirm ride request/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`entryHost=${allowedEntryHost}`));
    await expect(page.getByText(/前往上車|Heading to pickup/i)).toBeVisible();

    await context.close();
  });

  test("localizes the allowed embed without leaking zh row data in English", async ({
    browser,
    baseURL,
    request,
  }) => {
    const allowedEntryHost = await resolveAllowedEntryHost(request);
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: `https://${allowedEntryHost}` },
      locale: "en-US",
    });
    await context.addCookies([
      {
        name: "drts-locale-v2",
        value: "en",
        domain: new URL(baseURL ?? "http://localhost:3014").hostname,
        path: "/",
      },
    ]);
    const page = await context.newPage();
    const response = await page.goto(
      `/embed/referral-demo-community?entryHost=${allowedEntryHost}&screen=receipt`,
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("Community ride")).toBeVisible();
    await expect(page.getByText("Completed at")).toBeVisible();
    await expect(page.getByText("Taipei Main Station")).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/社區叫車|台北車站|御和雲峰|榮總醫院|收據/);
    expect(body).not.toMatch(/Platform Admin|Bank Console|Ops Console/);

    await context.close();
  });

  test("renders explicit identity states for reauth consent and fallback", async ({
    browser,
    baseURL,
    request,
  }) => {
    const allowedEntryHost = await resolveAllowedEntryHost(request);
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: `https://${allowedEntryHost}` },
    });
    const page = await context.newPage();

    for (const [state, expected] of [
      ["reauth", /登入狀態已逾時|Sign-in state expired/i],
      ["consent", /授權使用叫車服務|Authorize ride-booking access/i],
      [
        "fallback",
        /內嵌服務暫時無法使用|Embedded service is temporarily unavailable/i,
      ],
    ] as const) {
      const response = await page.goto(
        `/embed/referral-demo-community?entryHost=${allowedEntryHost}&state=${state}`,
        { waitUntil: "domcontentloaded" },
      );
      expect(response?.ok()).toBeTruthy();
      await expect(page.locator("body")).toContainText(expected);
      expect(await page.locator("body").innerText()).not.toMatch(
        /Platform Admin|Bank Console|Ops Console|管理後台/,
      );
    }

    await context.close();
  });

  test("returns not found for an unknown referral entry instead of exposing a shell", async ({
    page,
    request,
  }) => {
    const allowedEntryHost = await resolveAllowedEntryHost(request);
    const response = await page.goto(
      `/embed/not-a-real-referral-entry?entryHost=${allowedEntryHost}`,
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.status()).toBe(404);
    expect(await page.locator("body").innerText()).not.toMatch(
      /社區叫車|Community ride|確認叫車|Confirm ride request/,
    );
  });
});
