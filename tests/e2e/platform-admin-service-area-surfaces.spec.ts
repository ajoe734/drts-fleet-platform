import { expect, test } from "@playwright/test";

// Surface smoke for the Platform Admin /service-area-governance route
// (MAP-FE-ADM-002). The page renders its header + record-type switcher before
// data loads, so the smoke asserts those (locale-robust en|zh markers) without
// depending on seeded service-area data on the deployed env.
test.describe("platform admin service-area governance surface", () => {
  test("renders the governance route", async ({ page }) => {
    const response = await page.goto("/service-area-governance", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText(
      /Service-Area Governance|服務區治理/,
    );
    // record-type switcher (boundary / stop policy) is always present
    await expect(page.locator("body")).toContainText(
      /Service-area boundary|服務區界線/,
    );
    await expect(page.locator("body")).toContainText(/Stop polic|停靠政策/);
  });
});
