import { expect, test } from "@playwright/test";

// Surface smoke for the standalone Referral Embed host (the third-party /
// community-app embedded ride-hailing webview, served at /embed/[entrySlug]).
// Deployed acceptance must exercise a real partner-scoped route. A root-only
// check can stay green while every usable /embed/[entrySlug] URL returns 404.
// Local runs use a deterministic authority fixture so headers, iframe loading,
// genuine not-found responses, and upstream failures remain controllable.
const externalBaseURL =
  process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
  process.env.REFERRAL_EMBED_BASE_URL;
const usesLocalFixture = !externalBaseURL;
const deployedEntrySlug =
  process.env.DRTS_REFERRAL_EMBED_ENTRY_SLUG?.trim() ??
  (usesLocalFixture ? "yuhe-residence" : undefined);
const allowedEmbedHost = usesLocalFixture
  ? "127.0.0.1:3199"
  : "app.yuhe-living.com.tw";
const allowedEmbedOrigin = usesLocalFixture
  ? `http://${allowedEmbedHost}`
  : `https://${allowedEmbedHost}`;

function configuredEmbedPath(entrySlug: string) {
  return `/embed/${encodeURIComponent(entrySlug)}?entryHost=${encodeURIComponent(allowedEmbedHost)}`;
}

test.describe("referral embed surfaces", () => {
  test("root opens the configured canonical referral entry", async ({
    page,
  }) => {
    test.skip(!deployedEntrySlug, "No deployed canonical entry is configured.");

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(
      new RegExp(`/embed/${encodeURIComponent(deployedEntrySlug!)}(?:\\?|$)`),
    );
    await expect(page.locator("body")).toContainText(
      `/embed/${deployedEntrySlug}`,
    );
  });

  test("renders the canonical referral entry", async ({ page }) => {
    const path = deployedEntrySlug
      ? `/embed/${encodeURIComponent(deployedEntrySlug)}`
      : "/";
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();

    if (deployedEntrySlug) {
      await expect(page).toHaveURL(
        new RegExp(`/embed/${encodeURIComponent(deployedEntrySlug)}(?:\\?|$)`),
      );
      await expect(page.locator("body")).toContainText(
        `/embed/${deployedEntrySlug}`,
      );
      await expect(page.locator("body")).toContainText("御和物業");
      await expect(page.locator("body")).toContainText("社區叫車");
    } else {
      await expect(page.locator("body")).toContainText(
        /Referral Embed|轉介嵌入前台/,
      );
    }
  });

  test("authorized partner host receives frameable headers", async ({
    request,
  }) => {
    test.skip(!deployedEntrySlug, "No deployed canonical entry is configured.");

    const response = await request.get(
      configuredEmbedPath(deployedEntrySlug!),
      { headers: { referer: `${allowedEmbedOrigin}/mobile` } },
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()["x-frame-options"]).toBeUndefined();
    expect(response.headers()["content-security-policy"]).toContain(
      `frame-ancestors ${allowedEmbedOrigin}`,
    );
    expect(response.headers()["x-drts-embed-decision"]).toBe("allowed");
  });

  test("unauthorized partner host remains fail-closed", async ({ request }) => {
    const response = await request.get(
      `/embed/${encodeURIComponent(deployedEntrySlug ?? "yuhe-residence")}?entryHost=evil.example`,
      { headers: { referer: "https://evil.example/mobile" } },
    );

    expect(response.status()).toBe(403);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers()["x-drts-embed-decision"]).toBe("blocked");
  });

  test("authorized partner host can load the referral entry in a real iframe", async ({
    page,
    baseURL,
  }) => {
    test.skip(!deployedEntrySlug, "No deployed canonical entry is configured.");

    const iframeUrl = new URL(
      configuredEmbedPath(deployedEntrySlug!),
      baseURL,
    ).toString();
    if (usesLocalFixture) {
      await page.goto(
        `${allowedEmbedOrigin}/embed-host?target=${encodeURIComponent(iframeUrl)}`,
      );
    } else {
      await page.route(`${allowedEmbedOrigin}/**`, async (route) => {
        await route.fulfill({
          contentType: "text/html",
          body: `<iframe title="Referral Embed" src="${iframeUrl}"></iframe>`,
        });
      });
      await page.goto(`${allowedEmbedOrigin}/mobile`);
    }
    await expect(
      page.frameLocator('iframe[title="Referral Embed"]').locator("body"),
    ).toContainText("社區叫車");
  });

  test("legacy browser credential query parameters are ignored", async ({
    page,
  }) => {
    test.skip(!usesLocalFixture, "Requires the local controllable authority.");

    const response = await page.goto(
      `${configuredEmbedPath("yuhe-residence")}&apiKey=spoofed-browser-key&partnerUserRef=spoofed-user`,
      {
        waitUntil: "domcontentloaded",
        referer: `${allowedEmbedOrigin}/mobile`,
      },
    );

    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText("社區叫車");
    await expect(page.locator("body")).not.toContainText("fallback_to_web");
    await expect(page.locator("body")).not.toContainText(
      "spoofed-browser-key",
    );
    await expect(page.locator("body")).not.toContainText("spoofed-user");
  });

  test("returns 404 only for an authority-confirmed missing entry", async ({
    request,
  }) => {
    test.skip(!usesLocalFixture, "Requires the local controllable authority.");

    const response = await request.get(configuredEmbedPath("missing-entry"), {
      headers: { referer: `${allowedEmbedOrigin}/mobile` },
    });

    expect(response.status()).toBe(404);
  });

  test("renders the degraded error boundary for an authority failure", async ({
    page,
  }) => {
    test.skip(!usesLocalFixture, "Requires the local controllable authority.");

    const response = await page.goto(configuredEmbedPath("authority-down"), {
      waitUntil: "domcontentloaded",
      referer: `${allowedEmbedOrigin}/mobile`,
    });

    expect(response?.status()).toBe(500);
    await expect(page.locator('main[role="alert"]')).toContainText(
      "目前無法載入此轉介入口。",
    );
    await expect(page.getByRole("button", { name: "再試一次" })).toBeVisible();
  });

  test("submits the browser-entered referral booking and reload reads back the same trip", async ({
    page,
  }) => {
    test.skip(!usesLocalFixture, "Requires the local controllable authority.");

    const pickupAddress = "御和雲峰 A 棟 1F 迎賓車道";
    const dropoffAddress = "台北榮民總醫院 第二門診大樓";

    await page.goto(
      `${configuredEmbedPath("yuhe-residence")}&screen=book&state=handoff`,
      {
        waitUntil: "domcontentloaded",
        referer: `${allowedEmbedOrigin}/mobile`,
      },
    );
    await page.getByLabel("上車地點").fill(pickupAddress);
    await page.getByLabel("下車地點").fill(dropoffAddress);
    await page.getByLabel("標準車").check();
    await page.getByRole("button", { name: "確認叫車" }).click();

    await expect(page).toHaveURL(/screen=trip/);
    await expect(page.locator("body")).toContainText("RF-0001");
    await expect(page.locator("body")).toContainText("ord_ref_0001");
    await expect(page.locator("body")).toContainText(pickupAddress);
    await expect(page.locator("body")).toContainText(dropoffAddress);
    await expect(page.locator("body")).toContainText("standard");

    await page.reload({ waitUntil: "domcontentloaded" });

    await expect(page.locator("body")).toContainText("RF-0001");
    await expect(page.locator("body")).toContainText("ord_ref_0001");
    await expect(page.locator("body")).toContainText(pickupAddress);
    await expect(page.locator("body")).toContainText(dropoffAddress);
  });
});
