/**
 * MAP-FE-TEN-001 — Tenant console booking map alignment.
 *
 * Drives the real shared `AddressMapPairPicker` embedded in the tenant console
 * booking form (`/bookings/new`) with the geo provider proxy (`/api/geo/*`)
 * stubbed, so the flow is deterministic without a live geo backend:
 *   - search -> candidate selection pins both stops (dispatch-ready coordinates),
 *   - a serviceable evaluation shows the "inside the service area" state,
 *   - a not_serviceable evaluation blocks submission (client half of the
 *     backend serviceability gate — the backend enforces it independently).
 *
 * Run with `playwright.tenant-map-booking.config.ts`, which boots the tenant
 * console dev server. Requires the tenant console page shell to load its
 * directories from the configured backend.
 */
import { expect, test, type Page } from "@playwright/test";

const PICKUP_CANDIDATE = {
  candidateId: "cand-pickup-1",
  provider: "mock",
  providerCandidateId: "cand-pickup-1",
  placeId: "place-pickup-1",
  displayName: "Taipei 101",
  address: "台北市信義區信義路五段 7 號",
  normalizedAddress: "台北市信義區信義路五段 7 號",
  location: { lat: 25.0338, lng: 121.5645 },
  confidence: "exact",
  accuracyM: 5,
};

const DROPOFF_CANDIDATE = {
  candidateId: "cand-dropoff-1",
  provider: "mock",
  providerCandidateId: "cand-dropoff-1",
  placeId: "place-dropoff-1",
  displayName: "Taoyuan Airport T1",
  address: "桃園國際機場第一航廈",
  normalizedAddress: "桃園國際機場第一航廈",
  location: { lat: 25.0797, lng: 121.2342 },
  confidence: "exact",
  accuracyM: 5,
};

function serviceabilityResult(
  decision: "serviceable" | "not_serviceable",
  reason: string,
) {
  return {
    decision,
    serviceProductType: "enterprise_dispatch",
    evaluatedAt: "2026-07-01T00:00:00.000Z",
    stops: [],
    serviceAreaCodes: decision === "serviceable" ? ["core"] : [],
    geometryVersionRefs: ["v1"],
    reasonCodes: [`overall_${decision}`],
    reasonMessages: [reason],
  };
}

async function stubGeoProvider(
  page: Page,
  decision: "serviceable" | "not_serviceable" | "outage",
) {
  if (decision === "outage") {
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: { provider: "mock", mode: "unavailable", status: "unhealthy" },
      }),
    );
  } else {
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: { provider: "mock", mode: "mock", status: "healthy" },
      }),
    );
  }
  await page.route("**/api/geo/search**", (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const candidate = q.includes("air") ? DROPOFF_CANDIDATE : PICKUP_CANDIDATE;
    route.fulfill({
      json: {
        candidates: [candidate],
        provider: "mock",
        generatedAt: "2026-07-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/geo/resolve", async (route) => {
    const body = route.request().postDataJSON() as { placeId?: string };
    const candidate =
      body?.placeId === DROPOFF_CANDIDATE.placeId
        ? DROPOFF_CANDIDATE
        : PICKUP_CANDIDATE;
    route.fulfill({
      json: {
        address: {
          address: candidate.address,
          lat: candidate.location.lat,
          lng: candidate.location.lng,
          coordinateSource: "provider_candidate",
          geocodeConfidence: candidate.confidence,
          geocodeProvider: "mock",
        },
        candidate,
        provider: "mock",
        resolvedAt: "2026-07-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/geo/evaluate-service-area", (route) => {
    if (decision === "outage") {
      return route.fulfill({ status: 503, json: { error: "provider outage" } });
    }
    return route.fulfill({
      json: serviceabilityResult(
        decision,
        decision === "serviceable"
          ? "Inside the published service area."
          : "Selected stop is outside the service area.",
      ),
    });
  });
}

async function pinBothStops(page: Page) {
  const searchInputs = page.getByLabel(/Search address|搜尋地址/);
  // Pickup is the first picker, drop-off the second (pair picker DOM order).
  await searchInputs.first().fill("Taipei 101");
  await page.getByRole("button", { name: "Search" }).first().click();
  await page
    .getByRole("button", {
      name: /Taipei 101 .*exact|Taipei 101 台北市信義區信義路五段 7 號 exact/i,
    })
    .first()
    .click();

  await searchInputs.last().fill("Airport");
  await page.getByRole("button", { name: "Search" }).last().click();
  await page
    .getByRole("button", {
      name: /Taoyuan Airport T1 .*exact|Taoyuan Airport T1 桃園國際機場第一航廈 exact/i,
    })
    .first()
    .click();
}

test.describe("tenant console booking map alignment", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: "drts_tenant_session",
        value: "mock-session-token",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
  });

  test("serviceable stops pin and clear the service-area state", async ({
    page,
  }) => {
    await stubGeoProvider(page, "serviceable");
    await page.goto("/bookings/new");

    await pinBothStops(page);

    await expect(
      page.getByText("Inside the service area", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Outside the service area", { exact: false }),
    ).toHaveCount(0);
  });

  test("not_serviceable stop blocks booking submission", async ({ page }) => {
    await stubGeoProvider(page, "not_serviceable");
    await page.goto("/bookings/new");

    await pinBothStops(page);

    await expect(
      page.getByText("Outside the service area", { exact: false }).first(),
    ).toBeVisible();

    const submit = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車/,
    });
    await expect(submit).toBeDisabled();
  });

  test("provider_outage disables search and blocks ordinary booking submission", async ({ page }) => {
    let bookingPostCalled = false;
    await page.route("**/api/bookings/create", (route) => {
      bookingPostCalled = true;
      return route.abort();
    });

    await stubGeoProvider(page, "outage");
    await page.goto("/bookings/new");

    // Fill required booking fields to simulate a valid form otherwise
    await page.getByLabel(/Service subtype|服務子類型/).selectOption({ index: 1 });
    await page.getByLabel(/Timing mode|時間模式/).selectOption({ index: 1 });
    await page.getByLabel(/Reservation start|預約開始/).fill("2026-10-01T12:00");
    await page.getByLabel(/Reservation end|預約結束/).fill("2026-10-01T13:00");
    await page.getByRole("combobox", { name: /Passenger|乘客/ }).selectOption({ index: 1 });
    await page.getByRole("combobox", { name: /Cost center|成本中心/ }).selectOption({ index: 1 });

    // The UI should show the outage banner
    await expect(page.getByText(/Address provider is down|地址服務中斷/i).first()).toBeVisible();

    // The search input and button should be disabled
    const searchInputs = page.getByLabel(/Search|搜尋/i);
    await expect(searchInputs.first()).toBeDisabled();
    await expect(page.getByRole("button", { name: /Search|搜尋/i }).first()).toBeDisabled();

    // The submit button should be disabled for normal flow
    const submit = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車|送出/,
    });
    await expect(submit).toBeDisabled();

    // Ensure no booking was posted
    expect(bookingPostCalled).toBe(false);
  });

  test("manual coordinate edits are allowed and submit with valid reason", async ({ page }) => {
    let postedData: any = null;
    await page.route("**/api/bookings/create", (route) => {
      if (route.request().method() === "POST") {
        postedData = route.request().postDataJSON();
      }
      return route.fulfill({ status: 201, json: { id: "BK-123" } });
    });

    await stubGeoProvider(page, "serviceable");
    await page.goto("/bookings/new");

    // Toggle manual for pickup
    await page.getByText(/Enter coordinates manually|改用手動座標/).first().click();
    await page.getByLabel(/Latitude|緯度/).first().fill("25.033");
    await page.getByLabel(/Longitude|經度/).first().fill("121.565");
    // Invalid reason (empty string) blocks apply if required, but tenant requires it
    await page.getByLabel(/Reason|原因/).first().fill("Testing manual pin");
    await page.getByRole("button", { name: /Use this location|確認使用此位置/ }).first().click();

    // Toggle manual for dropoff
    await page.getByText(/Enter coordinates manually|改用手動座標/).last().click();
    await page.getByLabel(/Latitude|緯度/).last().fill("25.044");
    await page.getByLabel(/Longitude|經度/).last().fill("121.575");
    await page.getByLabel(/Reason|原因/).last().fill("Testing manual pin dropoff");
    await page.getByRole("button", { name: /Use this location|確認使用此位置/ }).last().click();

    // Fill required booking fields to enable submit
    await page.getByLabel(/Service subtype|服務子類型/).selectOption({ index: 1 });
    await page.getByLabel(/Timing mode|時間模式/).selectOption({ index: 1 });

    await page.getByLabel(/Reservation start|預約開始/).fill("2026-10-01T12:00");
    await page.getByLabel(/Reservation end|預約結束/).fill("2026-10-01T13:00");

    await page.getByRole("combobox", { name: /Passenger|乘客/ }).selectOption({ index: 1 });
    await page.getByRole("combobox", { name: /Cost center|成本中心/ }).selectOption({ index: 1 });

    const submit = page.getByRole("button", { name: /Create booking|For approval|Submitting|建立叫車|送出/ });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect.poll(() => postedData).toBeTruthy();
    expect(postedData.pickup.lat).toBe(25.033);
    expect(postedData.dropoff.lat).toBe(25.044);
    expect(postedData.pickup.manualOverrideReason).toBe("Testing manual pin");
  });
});
