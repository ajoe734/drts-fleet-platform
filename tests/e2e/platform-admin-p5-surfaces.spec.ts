import { expect, test } from "@playwright/test";

const p5RouteSpecs = [
  {
    path: "/platform-admin/p5/disclosure",
    markers: [/RE\*\*\*01/, /BKR-2208/, /吳明翰/],
  },
  {
    path: "/platform-admin/p5/corrections",
    markers: [/BKR-2208/, /吳明翰/, /cq-001/i],
  },
  {
    path: "/platform-admin/p5/fares",
    markers: [/F-2026-03/, /F-2026-04/, /F-2025-11/],
  },
] as const;

test.describe("platform admin P5 surfaces", () => {
  for (const spec of p5RouteSpecs) {
    test(`renders ${spec.path} without rating aggregate editing`, async ({
      page,
    }) => {
      const response = await page.goto(spec.path, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok()).toBeTruthy();
      for (const marker of spec.markers) {
        await expect(page.locator("body")).toContainText(marker);
      }
      await expect(page.locator("body")).not.toContainText(/aggregateVersion/);
      await expect(page.locator("body")).not.toContainText(
        /edit aggregate|rating moderation/i,
      );
    });
  }
});
