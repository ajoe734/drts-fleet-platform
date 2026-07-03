/**
 * MAP-FE-CON-001 — Partner assisted-entry booking map alignment.
 *
 * Drives the real shared `AddressMapPicker` embedded in the partner booking
 * funnel (`/[tenantSlug]/book`). The partner funnel is a self-contained
 * reference / validation surface: it uses the deterministic, network-free mock
 * geo provider (no route stubs needed) and validates the draft rather than
 * submitting a live order. The authority backend is intentionally absent — the
 * page degrades to the local reference shell so the picker still renders.
 *
 * UI-level automation of `partner-booking-form.tsx`:
 *   - healthy provider: search -> candidate selection pins both stops through
 *     the shared coordinate model (no raw lat/lng inputs) and reaches a
 *     dispatchable, serviceable gate,
 *   - healthy provider: a typed address with no pin stays BLOCKED
 *     (`pickup_coordinates_required`) — no silent normal order,
 *   - provider outage: the picker disables search, and a hand-typed street
 *     address (no coordinates) remains reachable as an explicit
 *     `provider_outage_manual_review` — the regression this task fixed.
 *
 * Run with `playwright.partner-map-booking.config.ts`, which boots the partner
 * booking dev server (local shell fallback, no live authority backend).
 */
import { expect, test, type Page } from "@playwright/test";

const LOCALE_COOKIE = "drts-locale-v2";

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
const submit = (page: Page) =>
  page.getByRole("button", { name: "Validate booking form" });

async function fillAirportProgramFields(page: Page) {
  await page.getByLabel("Passenger name").fill("Partner Rider");
  await page.getByLabel("Passenger phone").fill("0912000002");
  await page.getByLabel("Card tier").fill("World Elite");
  await page.getByLabel("Flight number").fill("CI-100");
  await page.getByLabel("Terminal").fill("T2");
  await page.getByLabel("Pickup / drop-off").selectOption("dropoff");
}

test.describe("partner assisted-entry booking map alignment", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    // Pin the funnel to English so the form field labels are stable selectors.
    await context.addCookies([
      {
        name: LOCALE_COOKIE,
        value: "en",
        url: baseURL ?? "http://127.0.0.1:3007",
      },
    ]);
  });

  test("pins both stops through the shared coordinate model and reaches a serviceable gate", async ({
    page,
  }) => {
    await page.goto("/ctbc/book");

    // The trip section uses the shared map picker, not raw coordinate inputs.
    await expect(pickerBox(page, "pickup")).toBeVisible();
    await expect(pickerBox(page, "dropoff")).toBeVisible();
    await expect(page.getByLabel("Latitude")).toHaveCount(0);
    await expect(page.getByLabel("Longitude")).toHaveCount(0);

    // A text address alone is not enough — the healthy funnel demands real
    // coordinates and must never silently accept typed text.
    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      "pickup_coordinates_required",
    );
    await expect(submit(page)).toBeDisabled();

    await pinStop(page, "pickup", "101");
    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      "dropoff_coordinates_required",
    );

    await pinStop(page, "dropoff", "Main");
    // Both stops resolved to a dispatchable serviceability reason code, using
    // the same vocabulary as the concierge surface.
    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      "serviceable",
    );
    await expect(pickerBox(page, "pickup")).toHaveAttribute(
      "data-provider-status",
      "available",
    );

    await fillAirportProgramFields(page);
    await expect(submit(page)).toBeEnabled();

    await submit(page).click();
    await expect(page.getByText("Form validation passed")).toBeVisible();
  });

  test("a healthy provider blocks a text-only booking (no silent normal order)", async ({
    page,
  }) => {
    await page.goto("/ctbc/book");

    // Type addresses but never pin coordinates.
    await page.getByLabel("Pickup address").fill("台北市信義區市府路 1 號");
    await page.getByLabel("Drop-off address").fill("桃園機場 第二航廈");
    await fillAirportProgramFields(page);

    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      "pickup_coordinates_required",
    );
    await expect(submit(page)).toBeDisabled();
  });

  test("a provider outage keeps the typed-address manual-review path reachable", async ({
    page,
  }) => {
    await page.goto("/ctbc/book?mapProviderState=unavailable");

    // The picker probes the (unavailable) provider health on mount and disables
    // search: the operator can only reach dispatch through a typed address.
    await expect(pickerBox(page, "pickup")).toHaveAttribute(
      "data-provider-status",
      /provider_disabled|provider_unhealthy|request_failed/,
    );
    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      "provider_outage_manual_review",
    );

    // A hand-typed street address (no coordinates) must remain submittable as an
    // explicit manual review — never a dead end, never a silent normal order.
    await page.getByLabel("Pickup address").fill("台北市信義區市府路 1 號");
    await page.getByLabel("Drop-off address").fill("桃園機場 第二航廈");
    await fillAirportProgramFields(page);

    await expect(gate(page)).toHaveAttribute(
      "data-partner-map-booking-gate",
      "provider_outage_manual_review",
    );
    await expect(submit(page)).toBeEnabled();

    await submit(page).click();
    await expect(page.getByText("Form validation passed")).toBeVisible();
  });
});
