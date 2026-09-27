import { expect, test, type Page, type Route } from "@playwright/test";

type JsonEnvelope<T> = {
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
};

const conciergeSessionState = {
  operatorName: "Map QA",
  operatorId: "ops-map-qa-001",
  mode: "concierge_operator",
  deskId: "acme-reception",
  activeCallId: null,
  recentCallIds: [],
  recentOrderIds: [],
  recentCallbackTaskIds: [],
  signedInAt: "2026-07-03T00:00:00.000Z",
};

function json<T>(data: T): JsonEnvelope<T> {
  return {
    data,
    meta: {
      requestId: "req-map-ui-001",
      timestamp: "2026-07-03T00:00:00.000Z",
    },
  };
}

async function fulfillJson(route: Route, status: number, data: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(json(data)),
  });
}

async function installConciergeApiMocks(
  page: Page,
  captured: { body: unknown[] },
) {
  await page.route("http://localhost:3001/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON();

    if (
      request.method() === "POST" &&
      url.pathname === "/api/callcenter/sessions"
    ) {
      await fulfillJson(route, 200, {
        callId: "call-map-001",
        status: "active",
        recordingState: "callback_required",
        callerPhone: "02-5550-0111",
        callType: "booking",
        agentId: "ops-map-qa-001",
        agentIdentityAnnounced: true,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        lastEtaQuotedMinutes: null,
      });
      return;
    }

    if (
      request.method() === "POST" &&
      url.pathname === "/api/call-center/orders"
    ) {
      captured.body.push(body);
      await fulfillJson(route, 200, {
        orderId: "ord-map-001",
        orderSource: "call_center",
        callId: "call-map-001",
        recordingId: null,
        status: "accepted",
      });
      return;
    }

    if (
      request.method() === "POST" &&
      url.pathname === "/api/callcenter/sessions/call-map-001/eta"
    ) {
      await fulfillJson(route, 200, {
        callId: "call-map-001",
        status: "active",
        recordingState: "callback_required",
        callerPhone: "02-5550-0111",
        callType: "booking",
        agentId: "ops-map-qa-001",
        agentIdentityAnnounced: true,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        lastEtaQuotedMinutes: 12,
      });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/api/orders/ord-map-001"
    ) {
      await fulfillJson(route, 200, {
        orderId: "ord-map-001",
        orderNo: "ORD-20260703-001",
        status: "accepted",
        callId: "call-map-001",
        etaSnapshot: { etaMinutes: 12, quotedAt: "2026-07-03T00:00:00.000Z" },
        complianceFlags: [],
      });
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/api/orders/ord-map-001/dispatch-trace"
    ) {
      await fulfillJson(route, 200, []);
      return;
    }

    if (
      request.method() === "GET" &&
      url.pathname === "/api/callcenter/sessions/call-map-001"
    ) {
      await fulfillJson(route, 200, {
        callId: "call-map-001",
        status: "active",
        recordingState: "callback_required",
        callerPhone: "02-5550-0111",
        callType: "booking",
        agentId: "ops-map-qa-001",
        agentIdentityAnnounced: true,
        createdAt: "2026-07-03T00:00:00.000Z",
        updatedAt: "2026-07-03T00:00:00.000Z",
        lastEtaQuotedMinutes: 12,
      });
      return;
    }

    await route.abort();
  });
}

async function selectConciergeMapCandidate(
  page: Page,
  index: number,
  query: string,
  candidateName: string,
) {
  const picker = page.locator("[data-address-map-picker]").nth(index);
  await picker.getByRole("textbox", { name: "搜尋地址" }).fill(query);
  await picker.getByRole("button", { name: "搜尋" }).click();
  await picker.getByRole("button", { name: new RegExp(candidateName) }).click();
}

test.describe("concierge map booking UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((state) => {
      window.localStorage.setItem(
        "drts.concierge.portal.session.v1",
        JSON.stringify(state),
      );
    }, conciergeSessionState);
  });

  test("submits dispatchable coordinates to the concierge booking seam", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    const response = await page.goto("/bookings/new");
    expect(response?.status()).toBe(200);

    await selectConciergeMapCandidate(page, 0, "taipei 101", "Taipei 101");
    await selectConciergeMapCandidate(
      page,
      1,
      "taipei main",
      "Taipei Main Station",
    );

    await expect(
      page.getByRole("button", { name: "提交禮賓代訂" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "提交禮賓代訂" }).click();

    await expect(page.getByText("訂單 ID")).toBeVisible();
    expect(captured.body).toHaveLength(1);

    const command = captured.body[0] as {
      pickup: { lat?: number; lng?: number; coordinateSource?: string };
      dropoff: { lat?: number; lng?: number; coordinateSource?: string };
      mapFallbackReview?: unknown;
    };

    expect(command.pickup).toMatchObject({
      lat: 25.033964,
      lng: 121.564468,
      coordinateSource: "provider_candidate",
    });
    expect(command.dropoff).toMatchObject({
      lat: 25.047762,
      lng: 121.517017,
      coordinateSource: "provider_candidate",
    });
    expect(command.mapFallbackReview ?? null).toBeNull();
  });

  test("submits manual review fallback when provider is down but coordinates exist", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "outage");
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    const response = await page.goto("/bookings/new");
    expect(response?.status()).toBe(200);

    // Provide manual coordinates and reason for pickup
    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker.getByText(/手動輸入座標/).click();
    await pickupPicker.getByLabel(/緯度/).fill("25.033");
    await pickupPicker.getByLabel(/經度/).fill("121.565");
    await pickupPicker.getByLabel(/原因/).fill("Concierge manual pickup");
    await pickupPicker.getByRole("button", { name: /使用此位置/ }).click();

    // Provide manual coordinates and reason for dropoff
    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker.getByText(/手動輸入座標/).click();
    await dropoffPicker.getByLabel(/緯度/).fill("25.044");
    await dropoffPicker.getByLabel(/經度/).fill("121.575");
    await dropoffPicker.getByLabel(/原因/).fill("Concierge manual dropoff");
    await dropoffPicker.getByRole("button", { name: /使用此位置/ }).click();

    // The submit button should be enabled as manual fallback
    const submitBtn = page.getByRole("button", {
      name: /提交禮賓代訂|送交人工複核/,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.getByText("訂單 ID")).toBeVisible();
    expect(captured.body).toHaveLength(1);

    const command = captured.body[0] as {
      pickup: { lat?: number; lng?: number; coordinateSource?: string };
      dropoff: { lat?: number; lng?: number; coordinateSource?: string };
      mapFallbackReview?: unknown;
    };

    expect(command.pickup).toMatchObject({
      lat: 25.033,
      lng: 121.565,
      coordinateSource: "manual_pin",
    });
    expect(command.mapFallbackReview).toMatchObject({
      providerDegraded: true,
      providerAvailable: false,
      reasonCode: "map_provider_unavailable",
    });
  });

  test("blocks submission when provider is down and no coordinates are provided", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "outage");
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    const response = await page.goto("/bookings/new");
    expect(response?.status()).toBe(200);

    // The submit button should be disabled because coordinates are missing
    const submitBtn = page.getByRole("button", {
      name: /提交禮賓代訂|送交人工複核/,
    });
    await expect(submitBtn).toBeDisabled();

    expect(captured.body).toHaveLength(0);
  });

  test("blocks outside service area", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    const response = await page.goto("/bookings/new");
    expect(response?.status()).toBe(200);

    await selectConciergeMapCandidate(page, 0, "taipei 101", "Taipei 101");

    // Manual coordinates outside service area
    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByText(/手動輸入座標|Enter coordinates manually/)
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/).fill("22.620");
    await dropoffPicker.getByLabel(/Longitude|經度/).fill("120.300");
    await dropoffPicker.getByLabel(/Reason|原因/).fill("Far away dropoff");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/ })
      .click();

    const submitBtn = page.getByRole("button", {
      name: /提交禮賓代訂|送交人工複核/,
    });
    await expect(submitBtn).toBeDisabled();
    expect(captured.body).toHaveLength(0);
  });

  test("handles backend refusal and recovers via manual pin", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const captured = { body: [] as unknown[] };
    let postCount = 0;

    await installConciergeApiMocks(page, captured);

    await page.route(
      "http://localhost:3001/api/call-center/orders",
      async (route) => {
        const request = route.request();
        if (request.method() === "POST") {
          captured.body.push(request.postDataJSON());
          postCount++;
          if (postCount === 1) {
            await route.fulfill({
              status: 400,
              contentType: "application/json",
              body: JSON.stringify({
                error: {
                  code: "SERVICE_AREA_NOT_SERVICEABLE",
                  message: "Backend rejected provider address",
                  details: { path: "pickup" },
                },
              }),
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                orderId: "ord-map-001",
                orderSource: "call_center",
                callId: "call-map-001",
                recordingId: null,
                status: "accepted",
              },
            }),
          });
          return;
        }
        await route.fallback();
      },
    );

    const response = await page.goto("/bookings/new");
    expect(response?.status()).toBe(200);

    // Initial search
    await selectConciergeMapCandidate(page, 0, "taipei 101", "Taipei 101");
    await selectConciergeMapCandidate(
      page,
      1,
      "banqiao",
      "Banqiao District Office",
    );

    const submitBtn = page.getByRole("button", { name: /提交禮賓代訂/ });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Expect the backend refusal message (actual localized message)
    await expect(
      page.getByText(
        /上車或下車地點不在支援的服務範圍內。請確認路線後再試一次。|Pickup or drop-off is outside the supported service area/,
      ),
    ).toBeVisible();

    // Recover by editing pickup to manual pin
    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByText(/手動輸入座標|Enter coordinates manually/)
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/).fill("25.033");
    await pickupPicker.getByLabel(/Longitude|經度/).fill("121.565");
    await pickupPicker
      .getByLabel(/Reason|原因/)
      .fill("Fixing rejected address");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/ })
      .click();

    // Re-submit
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Should pass the second time and show order ID
    await expect(page.getByText("訂單 ID")).toBeVisible();
    expect(postCount).toBe(2);
    const command = captured.body[1] as any;
    expect(command.pickup.coordinateSource).toBe("manual_pin");
  });
  test("pointer/keyboard persistence", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "outage");
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    const response = await page.goto("/bookings/new");
    expect(response?.status()).toBe(200);

    // Initial search
    await selectConciergeMapCandidate(page, 0, "taipei 101", "Taipei 101");
    await selectConciergeMapCandidate(
      page,
      1,
      "banqiao",
      "Banqiao District Office",
    );

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);

    // Click on the map to set a new location
    const pin = pickupPicker.locator("g[role='button']").first();
    await pin.focus();
    await page.keyboard.press("ArrowUp");

    // Verify it correctly changed the pin source
    const submitBtn = page.getByRole("button", { name: /提交禮賓代訂/ });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.getByText("訂單 ID")).toBeVisible();
    expect(captured.body).toHaveLength(1);

    const command = captured.body[0] as any;
    expect(command.pickup.coordinateSource).toBe("manual_pin");
    expect(command.pickup.manualOverrideReason).toBe("agent_map_click");
  });
});
