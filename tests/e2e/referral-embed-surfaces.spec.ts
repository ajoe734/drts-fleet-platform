import { expect, test } from "@playwright/test";

// Surface smoke for the standalone Referral Embed host (the third-party /
// community-app embedded ride-hailing webview, served at /embed/[entrySlug]).
// The deployed embed routes are gated by the entry-host allowlist middleware
// (REFERRAL_EMBED_ALLOWED_HOSTS) and depend on a partner handoff, so the smoke
// asserts the always-reachable service root renders. The embed-host security
// decision itself is covered by tests/unit/referral-embed-security.test.ts.
test.describe("referral embed surfaces", () => {
  test("renders the embed host root", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText(
      /Referral Embed|轉介嵌入前台/,
    );
  });
});
