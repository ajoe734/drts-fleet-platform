import { expect, test } from "@playwright/test";

// Surface smoke for the standalone Referral Embed host (the third-party /
// community-app embedded ride-hailing webview, served at /embed/[entrySlug]).
// Deployed acceptance must exercise a real partner-scoped route. A root-only
// check can stay green while every usable /embed/[entrySlug] URL returns 404.
// Local runs without an API continue to exercise the fallback root.
const deployedEntrySlug = process.env.DRTS_REFERRAL_EMBED_ENTRY_SLUG?.trim();

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
      await expect(page.locator("body")).toContainText("社區叫車");
    } else {
      await expect(page.locator("body")).toContainText(
        /Referral Embed|轉介嵌入前台/,
      );
    }
  });
});
