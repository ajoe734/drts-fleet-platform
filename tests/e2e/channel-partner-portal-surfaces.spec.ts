import { expect, test } from "@playwright/test";

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

test.describe("channel partner portal surfaces", () => {
  for (const { path, marker } of routes) {
    test(`renders ${path}`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.ok()).toBeTruthy();
      await expect(page.locator("body")).toContainText(marker);
    });
  }
});
