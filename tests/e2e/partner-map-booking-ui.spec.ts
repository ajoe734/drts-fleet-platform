/**
 * MAP-FE-CON-001 — Partner assisted-entry booking map alignment.
 *
 * Drives the real shared `AddressMapPicker` embedded in the partner booking
 * funnel (`/[tenantSlug]/book`). The partner funnel is a self-contained
 * reference surface, so it uses the deterministic network-free mock geo
 * provider (no route stubs needed). This asserts that:
 *   - pickup/dropoff use the shared coordinate model (no raw lat/lng inputs),
 *   - search -> candidate selection pins both stops and reaches a dispatchable
 *     serviceability reason code consistent with the concierge surface,
 *   - the map provider status is surfaced for observability.
 *
 * The provider-outage / degraded manual-review path is covered deterministically
 * by the `partner-map-booking` unit suite (mock provider `unavailable` mode).
 *
 * Run with `playwright.partner-map-booking.config.ts`, which boots the partner
 * booking dev server (local shell fallback, no live authority backend).
 */
import { expect, test, type Page } from "@playwright/test";

function pickerBox(page: Page, stop: "pickup" | "dropoff") {
  return page.locator(`[data-address-map-picker="partner-${stop}-map"]`);
}

async function pinStop(page: Page, stop: "pickup" | "dropoff", query: string) {
  const box = pickerBox(page, stop);
  await box.getByLabel("Search address").fill(query);
  await box.getByRole("button", { name: "Search" }).click();
  await box.getByRole("option").first().click();
}

const gate = (page: Page) => page.locator("[data-partner-map-booking-gate]");

test.describe("partner assisted-entry booking map alignment", () => {
  test("pins both stops through the shared coordinate model without raw coordinates", async ({
    page,
  }) => {
    await page.goto("/ctbc/book");

    // The trip section uses the shared map picker, not raw coordinate inputs.
    await expect(pickerBox(page, "pickup")).toBeVisible();
    await expect(pickerBox(page, "dropoff")).toBeVisible();
    await expect(page.getByLabel("Latitude")).toHaveCount(0);
    await expect(page.getByLabel("Longitude")).toHaveCount(0);

    await pinStop(page, "pickup", "Taipei 101");
    await pinStop(page, "dropoff", "Banqiao");

    // Both stops resolved to a dispatchable serviceability reason code, using
    // the same vocabulary as the concierge surface.
    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      /serviceable|manual_review/,
    );
    await expect(pickerBox(page, "pickup")).toHaveAttribute(
      "data-provider-status",
      "available",
    );
  });
});
