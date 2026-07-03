/**
 * MAP-FE-CON-001 — Concierge assisted-entry booking map alignment.
 *
 * Drives the real shared `AddressMapPicker` embedded in the concierge portal
 * booking form (`/bookings/new`) with the geo provider proxy (`/api/geo/*`) and
 * `/api/service-area/evaluate` stubbed, so the flow is deterministic without a
 * live geo backend:
 *   - search -> candidate selection pins both stops (dispatch-ready coordinates),
 *   - a serviceable evaluation enables submission,
 *   - a not_serviceable evaluation blocks submission (client half of the backend
 *     serviceability gate — the backend enforces it independently),
 *   - a provider outage yields a visible manual-review state, never a silent
 *     normal order, and never exposes raw latitude/longitude inputs.
 *
 * Run with `playwright.concierge-map-booking.config.ts`, which boots the
 * concierge portal dev server. A repo-local desk session is seeded into
 * localStorage so the `SessionGuard requireDesk` renders the booking form.
 */
import { expect, test, type Page } from "@playwright/test";

const SESSION_STORAGE_KEY = "drts.concierge.portal.session.v1";

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

function serviceabilityResult(decision: "serviceable" | "not_serviceable") {
  return {
    decision,
    serviceProductType: "taxi_realtime",
    evaluatedAt: "2026-07-01T00:00:00.000Z",
    stops: [],
    serviceAreaCodes: decision === "serviceable" ? ["core"] : [],
    geometryVersionRefs: ["v1"],
    reasonCodes: [`overall_${decision}`],
    reasonMessages: [
      decision === "serviceable"
        ? "Inside the published service area."
        : "Selected stop is outside the service area.",
    ],
  };
}

async function seedDeskSession(page: Page) {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(key, value);
    },
    [
      SESSION_STORAGE_KEY,
      JSON.stringify({
        operatorId: "concierge-e2e",
        mode: "concierge_operator",
        deskId: "acme-reception",
        activeCallId: null,
      }),
    ],
  );
}

async function stubHealthyGeo(
  page: Page,
  decision: "serviceable" | "not_serviceable",
) {
  await page.route("**/api/geo/health", (route) =>
    route.fulfill({
      json: { provider: "mock", mode: "mock", status: "healthy" },
    }),
  );
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
  await page.route("**/api/service-area/evaluate", (route) =>
    route.fulfill({ json: serviceabilityResult(decision) }),
  );
}

/**
 * Healthy geo provider (search + health both OK) but the serviceability
 * evaluation itself fails. This is a backend gate error, distinct from a
 * provider outage: the gate must block, not degrade to a manual-review submit.
 */
async function stubHealthyGeoWithFailingEvaluate(page: Page) {
  await page.route("**/api/geo/health", (route) =>
    route.fulfill({
      json: { provider: "mock", mode: "mock", status: "healthy" },
    }),
  );
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
  await page.route("**/api/service-area/evaluate", (route) =>
    route.fulfill({ status: 500, json: { message: "evaluation failed" } }),
  );
}

function pickerBox(page: Page, stop: "pickup" | "dropoff") {
  return page.locator(`[data-address-map-picker="concierge-${stop}-map"]`);
}

async function pinStop(page: Page, stop: "pickup" | "dropoff", query: string) {
  const box = pickerBox(page, stop);
  await box.getByLabel("Search address").fill(query);
  await box.getByRole("button", { name: "Search" }).click();
  await box.getByRole("option").first().click();
}

async function pinBothStops(page: Page) {
  await pinStop(page, "pickup", "Taipei 101");
  await pinStop(page, "dropoff", "Airport");
}

const gate = (page: Page) => page.locator("[data-concierge-map-booking-gate]");
const submit = (page: Page) =>
  page.getByRole("button", {
    name: /Submit assisted-entry booking|Submit for manual review/,
  });

test.describe("concierge assisted-entry booking map alignment", () => {
  test("serviceable stops become dispatch-ready and never expose coordinates", async ({
    page,
  }) => {
    await seedDeskSession(page);
    await stubHealthyGeo(page, "serviceable");
    await page.goto("/bookings/new");

    await pinBothStops(page);

    await expect(gate(page)).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "serviceable",
    );
    await expect(submit(page)).toBeEnabled();
    // No raw latitude/longitude entry fields are exposed.
    await expect(page.getByLabel("Latitude")).toHaveCount(0);
    await expect(page.getByLabel("Longitude")).toHaveCount(0);
  });

  test("a not_serviceable stop blocks dispatch", async ({ page }) => {
    await seedDeskSession(page);
    await stubHealthyGeo(page, "not_serviceable");
    await page.goto("/bookings/new");

    await pinBothStops(page);

    await expect(gate(page)).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "serviceability_blocked",
    );
    await expect(submit(page)).toBeDisabled();
  });

  test("a failed serviceability evaluation (healthy provider) blocks, never a silent submit", async ({
    page,
  }) => {
    await seedDeskSession(page);
    await stubHealthyGeoWithFailingEvaluate(page);
    await page.goto("/bookings/new");

    await pinBothStops(page);

    // Provider is healthy, so this is a backend gate error, not an outage:
    // the gate must render a blocked preview-unavailable state, not promote
    // the coordinate-carrying order to a manual-review submit.
    await expect(gate(page)).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "serviceability_preview_unavailable",
    );
    await expect(submit(page)).toBeDisabled();
  });

  test("a provider outage yields manual review, not a silent normal order", async ({
    page,
  }) => {
    await seedDeskSession(page);
    await page.route("**/api/geo/health", (route) =>
      route.fulfill({
        json: {
          provider: "mock",
          mode: "disabled",
          status: "unhealthy",
          failClosed: true,
          mockAllowed: true,
        },
      }),
    );
    await page.goto("/bookings/new");

    await expect(gate(page)).toHaveAttribute(
      "data-concierge-map-booking-gate",
      "provider_outage_manual_review",
    );
    // The outage path is submittable, but only as an explicit manual review.
    const manualReviewSubmit = page.getByRole("button", {
      name: "Submit for manual review",
    });
    await expect(manualReviewSubmit).toBeVisible();
    await expect(manualReviewSubmit).toBeEnabled();
    await expect(pickerBox(page, "pickup")).toHaveAttribute(
      "data-provider-status",
      /provider_disabled|provider_unhealthy|request_failed/,
    );
  });
});
