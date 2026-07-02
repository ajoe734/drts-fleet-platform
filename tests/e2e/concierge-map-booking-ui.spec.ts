import { expect, test, type Page } from "@playwright/test";

const sessionStorageKey = "drts.concierge.portal.session.v1";

async function clearConciergeState(page: Page) {
  await page.context().clearCookies();
  await page.addInitScript((key) => {
    window.localStorage.removeItem(key);
    window.localStorage.removeItem("drts-locale-v2");
  }, sessionStorageKey);
}

async function openSignedInConciergeBooking(page: Page, query = "") {
  await clearConciergeState(page);
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const operatorName = page.locator("#operator-name");
  const operatorId = page.locator("#operator-id");
  await expect(operatorName).toBeVisible();
  await expect(operatorName).not.toHaveValue("");
  await expect(operatorId).not.toHaveValue("");
  await Promise.all([
    page.waitForURL(/\/start$/),
    page
      .getByRole("button", {
        name: /繼續前往固定站點選擇|Continue to fixed site selector/,
      })
      .click(),
  ]);
  await page
    .getByRole("button", { name: /選擇|Select/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/bookings\/new$/);
  await page.waitForFunction((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return false;
    }
    try {
      return Boolean(JSON.parse(raw).deskId);
    } catch {
      return false;
    }
  }, sessionStorageKey);
  if (query) {
    await expect(
      page.locator("[data-concierge-map-booking-gate]"),
    ).toBeVisible();
    await page.evaluate((nextQuery) => {
      window.history.replaceState(null, "", `/bookings/new${nextQuery}`);
      window.dispatchEvent(new Event("drts:map-provider-state-change"));
    }, query);
    await expect(page).toHaveURL(new RegExp(`/bookings/new\\${query}$`));
  }
}

test.describe("concierge map booking gate", () => {
  test("E2E-MAP-004: concierge assisted entry requires pickup/dropoff coordinates", async ({
    page,
  }) => {
    await openSignedInConciergeBooking(page);

    const mapGate = page.locator("[data-concierge-map-booking-gate]");
    await expect(mapGate).toBeVisible();
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "pickup_coordinates_required",
    );
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-provider-state",
      "manual_fallback",
    );
    await expect(page.getByLabel(/Pickup latitude|上車緯度/i)).toHaveCount(0);
    await expect(page.getByLabel(/Pickup longitude|上車經度/i)).toHaveCount(0);
    await expect(page.getByLabel(/Drop-off latitude|下車緯度/i)).toHaveCount(0);
    await expect(page.getByLabel(/Drop-off longitude|下車經度/i)).toHaveCount(
      0,
    );
    await expect(
      page.locator("[data-concierge-map-coordinate-entry]"),
    ).toBeVisible();
    const submitButton = page.getByRole("button", {
      name: /Submit assisted-entry booking|提交 assisted-entry 訂單/i,
    });
    await expect(submitButton).toBeDisabled();

    await page.locator("[data-concierge-map-confirm-pickup]").click();
    await expect(
      page.locator("[data-concierge-map-coordinate-entry]"),
    ).toHaveAttribute("data-concierge-map-pickup-state", "confirmed");
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "dropoff_coordinates_required",
    );

    await page.locator("[data-concierge-map-confirm-dropoff]").click();
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "coordinates_ready",
    );
    await expect(
      page.locator("[data-concierge-map-coordinate-entry]"),
    ).toHaveAttribute("data-concierge-map-dropoff-state", "confirmed");
    await expect(submitButton).toBeEnabled();

    await page.locator("[data-concierge-map-clear-dropoff]").click();
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "dropoff_coordinates_required",
    );
    await expect(submitButton).toBeDisabled();
  });

  test("E2E-MAP-005: concierge provider outage blocks text-only assisted entry", async ({
    page,
  }) => {
    await openSignedInConciergeBooking(
      page,
      "?mapProviderState=provider_unavailable",
    );

    const mapGate = page.locator("[data-concierge-map-booking-gate]");
    await expect(mapGate).toBeVisible();
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-provider-state",
      "provider_unavailable",
    );
    await expect(
      page.locator("[data-concierge-map-provider-outage]"),
    ).toBeVisible();
    await expect(
      page.locator("[data-concierge-map-confirm-pickup]"),
    ).toBeDisabled();
    await expect(
      page.locator("[data-concierge-map-confirm-dropoff]"),
    ).toBeDisabled();

    const submitButton = page.getByRole("button", {
      name: /Submit assisted-entry booking|提交 assisted-entry 訂單/i,
    });
    await expect(mapGate).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "pickup_coordinates_required",
    );
    await expect(submitButton).toBeDisabled();
  });
});
