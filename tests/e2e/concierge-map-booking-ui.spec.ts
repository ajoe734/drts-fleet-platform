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
  captured: { body: unknown[]; rejectFirstOrder?: boolean },
) {
  await page.route("**/api/**", async (route) => {
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
      
      if (captured.rejectFirstOrder) {
        captured.rejectFirstOrder = false;
        await fulfillJson(route, 400, {
          error: {
            code: "VALIDATION_FAILED",
            message: "Missing required compliance fields for special location",
          }
        });
        return;
      }

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
  await picker
    .getByRole("textbox", { name: /Search address|搜尋地址/i })
    .fill(query);
  await picker.getByRole("button", { name: /Search|搜尋/i }).click();
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
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
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
      page.getByRole("button", {
        name: /Create booking|For approval|Submitting|建立叫車|提交禮賓代訂/i,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", {
        name: /Create booking|For approval|Submitting|建立叫車|提交禮賓代訂/i,
      })
      .click();

    await expect(page.getByText(/Booking ID|Order ID|訂單 ID/i)).toBeVisible();
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

  test("blocks submission if addresses are empty", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
    await installConciergeApiMocks(page, { body: [] });
    await page.goto("/bookings/new");
    await expect(
      page.getByRole("button", {
        name: /Create booking|For approval|Submitting|建立叫車|提交禮賓代訂/i,
      }),
    ).toBeDisabled();
  });

  test("submits manual fallback review when provider is down", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "outage",
      "This test requires the outage provider mode",
    );
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    await page.goto("/bookings/new");

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill("25.04");
    await pickupPicker.getByLabel(/Longitude|經度/i).fill("121.51");
    await pickupPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Outage pickup");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill("25.047");
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill("121.517");
    await dropoffPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Outage dropoff");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const submit = page.getByRole("button", {
      name: /Submit for review|Manual review|送交人工複核/i,
    });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText(/Booking ID|Order ID|訂單 ID/i)).toBeVisible();
    expect(captured.body).toHaveLength(1);

    const command = captured.body[0] as any;
    expect(command.mapFallbackReview).toBeTruthy();
    expect(command.mapFallbackReview.reasonCode).toBe(
      "map_provider_unavailable",
    );
  });

  test("blocks submission when outside service area", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
    const captured = { body: [] as unknown[] };
    await installConciergeApiMocks(page, captured);

    await page.goto("/bookings/new");

    const pickupPicker = page.locator("[data-address-map-picker]").nth(0);
    await pickupPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill("24.9");
    await pickupPicker.getByLabel(/Longitude|經度/i).fill("121.4");
    await pickupPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Outside area");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const dropoffPicker = page.locator("[data-address-map-picker]").nth(1);
    await dropoffPicker
      .getByRole("button", {
        name: /Manual location|Enter coordinates manually|改用手動座標|手動輸入座標/i,
      })
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill("25.047");
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill("121.517");
    await dropoffPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("Inside area");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用此位置/i })
      .click();

    const submit = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車|提交禮賓代訂/i,
    });
    await expect(submit).toBeDisabled();
    await expect(
      page.getByText(/Outside the service area|不在服務範圍內/i).first(),
    ).toBeVisible();
  });

  test("handles backend refusal with visible error and allows retry", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "outage",
      "This test requires healthy provider",
    );
    const captured = { body: [] as unknown[], rejectFirstOrder: true };
    await installConciergeApiMocks(page, captured);

    await page.goto("/bookings/new");
    await selectConciergeMapCandidate(page, 0, "taipei 101", "Taipei 101");
    await selectConciergeMapCandidate(
      page,
      1,
      "taipei main",
      "Taipei Main Station",
    );

    const submitBtn = page.getByRole("button", {
      name: /Create booking|For approval|Submitting|建立叫車|提交禮賓代訂/i,
    });
    await expect(submitBtn).toBeEnabled();
    
    // First submit, should fail
    await submitBtn.click();
    
    // Check error message
    await expect(page.getByText(/Failed to create the concierge-assisted booking|建立禮賓代訂失敗/i)).toBeVisible();
    
    // Retry, should succeed
    await submitBtn.click();
    await expect(page.getByText(/Booking ID|Order ID|訂單 ID/i)).toBeVisible();
  });

});
