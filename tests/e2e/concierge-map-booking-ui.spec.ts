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
  }) => {
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
    await page
      .getByRole("button", { name: "提交禮賓代訂" })
      .click();

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
});
