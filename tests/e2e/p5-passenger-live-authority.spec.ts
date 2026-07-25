import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * P5-PAX-001 browser acceptance for the live passenger surface.
 *
 * Everything is served through the app's own `/control-plane-proxy` routes, so
 * the assertions exercise the real live adapter (fetch + EventSource + version
 * guard) rather than a fixture render.
 */

const TOKEN = "e2e0PassengerAccessToken0000000000000000000";

type OrderStatus =
  | "created"
  | "assigned"
  | "arrived_pickup"
  | "on_trip"
  | "completed";

function authorityView(status: OrderStatus, withAssignment: boolean) {
  return {
    order: {
      order_id: "order-e2e-pax-001",
      order_no: "MTX-E2E-0001",
      status,
      timing_mode: "on_demand",
      requested_pickup_at: "2026-07-24T01:00:00.000Z",
      pickup: { address: "臺北市信義區松仁路 100 號" },
      dropoff: { address: "臺北市中山區南京東路二段 100 號" },
      cancelable_until: "2026-07-24T01:10:00.000Z",
      cancelled_at: null,
      completed_at: null,
    },
    assignment: withAssignment
      ? {
          snapshot_id: "snap-e2e-001",
          runtime_profile_code: "multi_taxi_direct",
          order_id: "order-e2e-pax-001",
          booking_id: null,
          dispatch_job_id: "dj-e2e-001",
          assignment_id: "asg-e2e-001",
          assignment_version: 1,
          vehicle: {
            vehicle_id: "veh-e2e-001",
            make: "Nissan",
            model: "Sentra",
            plate_no: "EEE-9001",
            model_year: 2025,
            door_count: 4,
            color: "曜石黑",
            profile_version: 2,
          },
          driver: {
            driver_id: "drv-e2e-001",
            display_name: "林可安",
            registration_masked_display: "北市計字第98***21號",
            registration_status: "verified_active",
            registration_effective_until: "2028-01-31",
            credential_version: 3,
          },
          rating: {
            display_state: "rated",
            average_rating: 4.8,
            rating_count: 120,
            aggregate_version: 4,
          },
          eta: {
            minutes: 4,
            calculated_at: "2026-07-24T01:02:00.000Z",
            location_freshness: "fresh",
          },
          route_fare: {
            route_snapshot_id: "route-e2e-001",
            quote_snapshot_id: "quote-e2e-001",
            order_id: "order-e2e-pax-001",
            pickup: { address: "臺北市信義區松仁路 100 號" },
            dropoff: { address: "臺北市中山區南京東路二段 100 號" },
            estimated_distance_meters: 5400,
            estimated_duration_seconds: 900,
            encoded_polyline: null,
            charging_mode: "meter_estimate",
            estimated_fare_minor: 31000,
            payable_fare_minor: null,
            currency: "NTD",
            fare_policy_id: "fare-policy-e2e",
            fare_policy_version: "F-2026-07",
            fare_change_rule_id: "fare-rule-e2e",
            fare_change_rule_version: "FR-2026-07",
            fare_change_rule_display_text: "依實際里程與等待時間計費。",
            passenger_confirmed_at: null,
            generated_at: "2026-07-24T01:02:00.000Z",
          },
          created_at: "2026-07-24T01:02:00.000Z",
          superseded_at: null,
        }
      : null,
    rating: null,
    payment: null,
    receipt: null,
    actions: {
      can_cancel: status === "created" || status === "assigned",
      can_rate: status === "completed",
      can_contact: withAssignment && status !== "completed",
      can_read_receipt: false,
    },
  };
}

function sseFrame(
  eventType: string,
  eventVersion: number,
  status: OrderStatus,
  withAssignment = true,
) {
  const envelope = {
    event_id: `evt-${eventVersion}`,
    event_type: eventType,
    event_version: eventVersion,
    assignment_version: withAssignment ? 1 : null,
    order_id: "order-e2e-pax-001",
    occurred_at: "2026-07-24T01:03:00.000Z",
    data: authorityView(status, withAssignment),
  };
  return `event: ${eventType}\ndata: ${JSON.stringify(envelope)}\n\n`;
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function stubAuthority(
  page: Page,
  options: {
    initialStatus: OrderStatus;
    withAssignment?: boolean;
    sseBody?: string;
    contact?: Record<string, unknown>;
    authorityStatus?: number;
    authorityError?: Record<string, unknown>;
  },
) {
  const withAssignment = options.withAssignment ?? true;

  await page.route(
    `**/control-plane-proxy/passenger-rides/${TOKEN}/events`,
    async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-store",
        },
        body: options.sseBody ?? "",
      });
    },
  );

  await page.route(
    `**/control-plane-proxy/passenger-rides/${TOKEN}/contact`,
    async (route) =>
      fulfillJson(route, {
        data: options.contact ?? {
          mode: "unavailable",
          contact_uri: null,
          expires_at: null,
          unavailable_reason: "masked_call_provider_not_configured",
        },
      }),
  );

  await page.route(
    `**/control-plane-proxy/passenger-rides/${TOKEN}`,
    async (route) => {
      if (options.authorityError) {
        await fulfillJson(
          route,
          { error: options.authorityError },
          options.authorityStatus ?? 404,
        );
        return;
      }
      await fulfillJson(route, {
        data: authorityView(options.initialStatus, withAssignment),
      });
    },
  );
}

test.describe("P5-PAX-001 live passenger authority", () => {
  test("renders live authority data and reports the source as live", async ({
    page,
  }) => {
    await stubAuthority(page, { initialStatus: "assigned" });

    await page.goto(`/ride/${TOKEN}?mode=live`);

    await expect(page.getByText("Live SSE")).toBeVisible();
    await expect(page.getByText("車輛已指派")).toBeVisible();
    // Live disclosure fields, not the fixture driver/vehicle.
    await expect(page.getByText("EEE-9001")).toBeVisible();
    await expect(page.getByText("北市計字第98***21號")).toBeVisible();
    await expect(page.getByText("吳明翰")).toHaveCount(0);
    await expect(page.getByText("BKR-2208")).toHaveCount(0);
  });

  test("ignores a stale SSE event instead of rewinding the ride state", async ({
    page,
  }) => {
    await stubAuthority(page, {
      initialStatus: "assigned",
      // Newest event first, then two late-arriving earlier versions.
      sseBody: [
        sseFrame("trip_started", 3, "on_trip"),
        sseFrame("driver_arrived", 2, "arrived_pickup"),
        sseFrame("assignment_disclosure_ready", 1, "assigned"),
      ].join(""),
    });

    await page.goto(`/ride/${TOKEN}?mode=live`);

    await expect(page.getByText("行程進行中")).toBeVisible();
    await expect(page.getByText("司機已抵達")).toHaveCount(0);
    await expect(page.getByText("車輛已指派")).toHaveCount(0);
  });

  test("applies an SSE event that advances the version", async ({ page }) => {
    await stubAuthority(page, {
      initialStatus: "assigned",
      sseBody: sseFrame("driver_arrived", 1, "arrived_pickup"),
    });

    await page.goto(`/ride/${TOKEN}?mode=live`);

    await expect(page.getByText("司機已抵達")).toBeVisible();
  });

  test("shows an explicit error instead of falling back to fixture data", async ({
    page,
  }) => {
    await stubAuthority(page, {
      initialStatus: "assigned",
      authorityStatus: 404,
      authorityError: { code: "PASSENGER_RIDE_TOKEN_INVALID" },
    });

    await page.goto(`/ride/${TOKEN}?mode=live`);

    await expect(page.getByText("無法取得行程資料")).toBeVisible();
    await expect(page.getByText("PASSENGER_RIDE_TOKEN_INVALID")).toBeVisible();
    // No demo ride is substituted for the failed authority read.
    await expect(page.getByText("吳明翰")).toHaveCount(0);
    await expect(page.getByText("BKR-2208")).toHaveCount(0);
  });

  test("never exposes a raw driver phone and keeps provider absence explicit", async ({
    page,
  }) => {
    await stubAuthority(page, {
      initialStatus: "arrived_pickup",
      contact: {
        mode: "unavailable",
        contact_uri: null,
        expires_at: null,
        unavailable_reason: "masked_call_provider_not_configured",
      },
    });

    await page.goto(`/ride/${TOKEN}?mode=live`);
    await expect(page.getByText("司機已抵達")).toBeVisible();

    // The whole rendered document carries no dialable driver number.
    const body = (await page.locator("body").innerText()) ?? "";
    expect(body).not.toMatch(/09\d{2}-?\d{3}-?\d{3}/);
    expect(body).not.toMatch(/\+886\d{9}/);
    const telHrefs = await page
      .locator('a[href^="tel:"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")));
    expect(telHrefs).toEqual([]);
  });
});
