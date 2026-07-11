import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { buildMapGeofenceServiceAreaGeoJsonEnvelope } from "../../packages/shared-test-fixtures/src/map-geofence-fixtures";
import { installMockMapTileRoutes } from "./map-geofence-harness";

const baseUrl =
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  process.env.OPS_CONSOLE_BASE_URL ??
  "http://localhost:3003";

const CLOSEOUT_ORDER_ID = "ORD-SMOKE-001";
const CALL_ID = "CALL-SMOKE-001";
const RECORDING_ID = "REC-SMOKE-001";
const BROWSER_ARTIFACT_RELATIVE_PATH =
  "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.json";
const SCREENSHOT_RELATIVE_PATH =
  "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-browser-proof-20260708T050000Z.png";
const BLOCKED_SCREENSHOT_RELATIVE_PATH =
  "support/sidecars/MAP-REL-001/artifacts/fleets-closeout-009-callcenter-map-blocked.png";

async function assertShell(page: Page) {
  const shellAside = page
    .locator("aside")
    .filter({ hasText: /Dashboard|Dispatch|Registry|儀表板|派車調度/ })
    .first();
  await expect(shellAside).toBeVisible();
}

async function ensureCallcenterMapBookingForm(page: Page) {
  const mapPair = page.locator(
    '[data-address-map-pair-picker="callcenter-phone-booking-map"]',
  );

  await expect(page.locator("body")).not.toContainText(
    /Loading workspace|載入工作區/i,
    { timeout: 30_000 },
  );

  if ((await mapPair.count()) === 0) {
    await page
      .getByRole("button", {
        name: /Open call work session|開啟通話工作階段/i,
      })
      .first()
      .click();

    const openSessionButton = page
      .getByRole("button", { name: /^Open Session$|^開啟通話$/i })
      .first();
    const intakeForm = page.locator("form").filter({
      has: openSessionButton,
    });
    await intakeForm
      .locator('input[type="text"][required]')
      .first()
      .fill("0912-000-301");
    await openSessionButton.click();
  }

  await expect(mapPair).toBeVisible({ timeout: 45_000 });
  return mapPair;
}

async function installMockCallcenterMapRoutes(page: Page) {
  const now = "2026-07-08T05:00:00.000Z";
  await installMockMapTileRoutes(page);
  const activeSession = {
    callId: CALL_ID,
    callType: "booking",
    callerPhone: "0912-000-301",
    agentId: "AGENT-OPS-001",
    agentIdentityAnnounced: true,
    agentIdentityAnnouncedAt: now,
    status: "active",
    startedAt: now,
    endedAt: null,
    recordingId: RECORDING_ID,
    providerRecordingRef: "prov-rec-smoke-001",
    recordingUrl: null,
    linkedOrderId: null,
    linkedCaseNo: null,
    lastEtaQuotedMinutes: null,
    lastEtaQuotedAt: null,
    callbackTask: null,
    recordingState: "pending",
    flags: [],
  };
  const pickupCandidate = {
    candidateId: "mock-taipei-city-hall",
    provider: "mock-geo",
    providerCandidateId: "place-city-hall",
    placeId: "place-city-hall",
    displayName: "Taipei City Hall",
    address: "No. 1, City Hall Road, Xinyi District, Taipei",
    normalizedAddress: "No.1 City Hall Rd, Xinyi, Taipei",
    district: "Xinyi",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.037519, lng: 121.56368 },
    confidence: "exact",
    accuracyM: 8,
  };
  const dropoffCandidate = {
    candidateId: "mock-xinyi-office",
    provider: "mock-geo",
    providerCandidateId: "place-xinyi-office",
    placeId: "place-xinyi-office",
    displayName: "Xinyi Office",
    address: "No. 100, Songren Road, Xinyi District, Taipei",
    normalizedAddress: "No.100 Songren Rd, Xinyi, Taipei",
    district: "Xinyi",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.033879, lng: 121.568743 },
    confidence: "interpolated",
    accuracyM: 25,
  };
  const blockedPickupCandidate = {
    candidateId: "mock-taipei-station",
    provider: "mock-geo",
    providerCandidateId: "place-taipei-station",
    placeId: "place-taipei-station",
    displayName: "Taipei Main Station",
    address: "No. 3, Beiping West Road, Zhongzheng District, Taipei",
    normalizedAddress: "No.3 Beiping W. Rd, Zhongzheng, Taipei",
    district: "Zhongzheng",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.0478, lng: 121.517 },
    confidence: "exact",
    accuracyM: 8,
  };

  await page.route("**/control-plane-proxy/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          status: "healthy",
          degradedServices: [],
          lastCheckedAt: now,
        },
      }),
    });
  });

  await page.route(
    "**/control-plane-proxy/callcenter/sessions*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: [activeSession],
            refresh: {
              generatedAt: now,
              staleAfterMs: 30_000,
              dataFreshness: "fresh",
              source: "live",
            },
            health: {
              status: "healthy",
              degradedServices: [],
              lastCheckedAt: now,
            },
          },
        }),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/callcenter/callbacks*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            items: [],
            refresh: {
              generatedAt: now,
              staleAfterMs: 30_000,
              dataFreshness: "fresh",
              source: "live",
            },
            health: {
              status: "healthy",
              degradedServices: [],
              lastCheckedAt: now,
            },
          },
        }),
      });
    },
  );

  await page.route("**/control-plane-proxy/geo/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          provider: "mock-geo",
          mode: "mock",
          status: "healthy",
          failClosed: false,
          mockAllowed: true,
          checks: [],
        },
      }),
    });
  });

  await page.route("**/control-plane-proxy/geo/search*", async (route) => {
    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.toLowerCase() ?? "";
    const candidates = query.includes("station")
      ? [blockedPickupCandidate]
      : query.includes("city") || query.includes("hall")
        ? [pickupCandidate]
        : query.includes("office")
          ? [dropoffCandidate]
          : [];

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          candidates,
          provider: "mock-geo",
          generatedAt: now,
        },
      }),
    });
  });

  await page.route("**/control-plane-proxy/geo/reverse*", async (route) => {
    const command = route.request().postDataJSON() as {
      location: { lat: number; lng: number };
      surface: string;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          address: {
            address: `Map pin ${command.location.lat.toFixed(6)}, ${command.location.lng.toFixed(6)}`,
            lat: command.location.lat,
            lng: command.location.lng,
            coordinateSource: "reverse_geocode",
            geocodeProvider: "mock-geo",
            geocodeConfidence: "approximate",
            surface: command.surface,
          },
          provider: "mock-geo",
          resolvedAt: now,
        },
      }),
    });
  });

  await page.route(
    "**/control-plane-proxy/service-area/geojson*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildMapGeofenceServiceAreaGeoJsonEnvelope()),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/service-area/evaluate*",
    async (route) => {
      const command = route.request().postDataJSON() as {
        pickup: { lat: number; lng: number };
        dropoff: { lat: number; lng: number } | null;
      };
      const pickupBlocked =
        Math.abs(command.pickup.lat - blockedPickupCandidate.location.lat) <
          0.002 &&
        Math.abs(command.pickup.lng - blockedPickupCandidate.location.lng) <
          0.002;
      const decision = pickupBlocked ? "not_serviceable" : "serviceable";
      const policyCodes = pickupBlocked ? ["TPE_STATION_PICKUP_BLOCK"] : [];
      const reasonCodes = pickupBlocked ? ["PICKUP_NOT_ALLOWED"] : [];
      const reasonMessages = pickupBlocked
        ? ["Pickup is not allowed at this curb zone."]
        : [];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            decision,
            serviceProductType: "taxi_realtime",
            evaluatedAt: now,
            stops: [
              {
                kind: "pickup",
                location: command.pickup,
                serviceAreaCodes: ["TAIPEI_CORE"],
                policyCodes,
                geometryVersionRefs: [
                  "service_area:TAIPEI_CORE@1",
                  ...(pickupBlocked
                    ? ["stop_policy:TPE_STATION_PICKUP_BLOCK@1"]
                    : []),
                ],
                decision,
                reasonCodes,
                reasonMessages,
              },
              {
                kind: "dropoff",
                location: command.dropoff,
                serviceAreaCodes: ["TAIPEI_CORE"],
                policyCodes: [],
                geometryVersionRefs: ["service_area:TAIPEI_CORE@1"],
                decision: "serviceable",
                reasonCodes: [],
                reasonMessages: [],
              },
            ],
            serviceAreaCodes: ["TAIPEI_CORE"],
            geometryVersionRefs: [
              "service_area:TAIPEI_CORE@1",
              ...(pickupBlocked
                ? ["stop_policy:TPE_STATION_PICKUP_BLOCK@1"]
                : []),
            ],
            reasonCodes,
            reasonMessages,
          },
        }),
      });
    },
  );

  await page.route(
    "**/control-plane-proxy/call-center/orders*",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            orderId: CLOSEOUT_ORDER_ID,
            orderSource: "callcenter",
            callId: CALL_ID,
            recordingId: RECORDING_ID,
            status: "pending_dispatch",
          },
        }),
      });
    },
  );
}

test.describe("map fleets closeout proof", () => {
  test.use({ viewport: { width: 1440, height: 950 } });

  test("blocks a visible no-pickup fence, then submits the corrected map pin", async ({
    page,
  }, testInfo) => {
    await installMockCallcenterMapRoutes(page);
    await page.goto(`${baseUrl}/callcenter`, { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/404/);
    await expect(page.locator("body")).not.toContainText(
      /404|Application error/i,
    );
    await assertShell(page);

    const mapPair = await ensureCallcenterMapBookingForm(page);
    const bookingForm = mapPair.locator("xpath=ancestor::form[1]");
    const bookingGate = page.locator("[data-callcenter-map-booking-gate]");
    const submitButton = bookingForm
      .getByRole("button", {
        name: /Create phone booking|建立電話訂車/i,
      })
      .first();

    await bookingForm
      .locator('input[type="text"]')
      .first()
      .fill("Smoke Caller");

    const pickupPicker = page.locator(
      '[data-address-map-picker="callcenter-pickup-map"]',
    );
    await pickupPicker
      .locator('input[type="text"]')
      .first()
      .fill("Taipei Station");
    await pickupPicker.getByRole("button", { name: /Search|搜尋/i }).click();
    await pickupPicker
      .locator("button")
      .filter({ hasText: /Taipei Main Station/i })
      .first()
      .click();

    const dropoffPicker = page.locator(
      '[data-address-map-picker="callcenter-dropoff-map"]',
    );
    await dropoffPicker
      .locator('input[type="text"]')
      .first()
      .fill("Xinyi Office");
    await dropoffPicker.getByRole("button", { name: /Search|搜尋/i }).click();
    await dropoffPicker
      .locator("button")
      .filter({ hasText: /Xinyi Office/i })
      .first()
      .click();

    const pickupMap = page.locator(
      '[data-callcenter-interactive-map="callcenter-pickup-map-interactive-map"]',
    );
    await expect(pickupMap).toHaveAttribute("data-map-overlay-status", "ready");
    await expect(pickupMap).toHaveAttribute("data-map-render-mode", "tile");
    await expect(pickupMap).toHaveAttribute(
      "data-map-policy-codes",
      /TPE_STATION_PICKUP_BLOCK/,
    );
    await expect(
      pickupMap.locator('[data-map-feature-code="TPE_STATION_PICKUP_BLOCK"]'),
    ).toBeVisible();
    await expect(bookingGate).toHaveAttribute(
      "data-callcenter-map-booking-gate",
      "serviceability_blocked",
    );
    await expect(submitButton).toBeDisabled();
    const blockedGateBeforeCorrection = await bookingGate.getAttribute(
      "data-callcenter-map-booking-gate",
    );
    const blockedMapEvidence = {
      renderMode: await pickupMap.getAttribute("data-map-render-mode"),
      overlayStatus: await pickupMap.getAttribute("data-map-overlay-status"),
      policyCodes: await pickupMap.getAttribute("data-map-policy-codes"),
      selectedLat: await pickupMap.getAttribute("data-selected-lat"),
      selectedLng: await pickupMap.getAttribute("data-selected-lng"),
    };
    mkdirSync(
      resolve(process.cwd(), "support/sidecars/MAP-REL-001/artifacts"),
      { recursive: true },
    );
    await pickupMap.screenshot({
      path: resolve(process.cwd(), BLOCKED_SCREENSHOT_RELATIVE_PATH),
    });

    const mapCanvas = pickupMap.locator('[role="application"]');
    const mapBox = await mapCanvas.boundingBox();
    expect(mapBox).not.toBeNull();
    await mapCanvas.click({
      position: {
        x: mapBox!.width * 0.2,
        y: mapBox!.height * 0.5,
      },
    });

    await expect(bookingGate).toHaveAttribute(
      "data-callcenter-map-booking-gate",
      "serviceable",
    );
    await expect(submitButton).toBeEnabled();
    const gateBeforeSubmit = await bookingGate.getAttribute(
      "data-callcenter-map-booking-gate",
    );

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/call-center/orders"),
    );
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/call-center/orders"),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await submitButton.click();

    const request = await requestPromise;
    const response = await responsePromise;
    const payload = request.postDataJSON() as Record<string, unknown>;
    const responseBody = (await response.json()) as {
      data: {
        orderId: string;
        callId: string;
        recordingId: string;
        status: string;
      };
    };

    expect(responseBody.data.orderId).toBe(CLOSEOUT_ORDER_ID);
    expect(payload).toMatchObject({
      passenger: {
        name: "Smoke Caller",
      },
      pickup: {
        coordinateSource: "manual_pin",
        geocodeProvider: "mock-geo",
        providerCandidateId: "place-taipei-station",
        manualOverrideReason: "agent_map_click",
        surface: "callcenter",
      },
      dropoff: {
        address: "No. 100, Songren Road, Xinyi District, Taipei",
        lat: 25.033879,
        lng: 121.568743,
        coordinateSource: "provider_candidate",
        geocodeProvider: "mock-geo",
        providerCandidateId: "place-xinyi-office",
        surface: "callcenter",
      },
    });
    const pickup = payload.pickup as {
      lat: number;
      lng: number;
      address: string;
    };
    expect(pickup.address).toMatch(/^Map pin /);
    expect(Math.abs(pickup.lng - 121.517)).toBeGreaterThan(0.002);

    const artifactPath = resolve(process.cwd(), BROWSER_ARTIFACT_RELATIVE_PATH);
    const screenshotPath = resolve(process.cwd(), SCREENSHOT_RELATIVE_PATH);
    mkdirSync(
      resolve(process.cwd(), "support/sidecars/MAP-REL-001/artifacts"),
      {
        recursive: true,
      },
    );
    writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          orderId: responseBody.data.orderId,
          callId: responseBody.data.callId,
          recordingId: responseBody.data.recordingId,
          submitResult: responseBody.data.status,
          blockedGateBeforeCorrection,
          blockedMapEvidence,
          bookingGateBeforeSubmit: gateBeforeSubmit,
          bookingGateAfterSubmit: await bookingGate.getAttribute(
            "data-callcenter-map-booking-gate",
          ),
          requestBody: payload,
        },
        null,
        2,
      ),
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await testInfo.attach("map-fleets-closeout-browser-proof", {
      path: artifactPath,
      contentType: "application/json",
    });
    await testInfo.attach("map-fleets-closeout-browser-proof-screenshot", {
      path: screenshotPath,
      contentType: "image/png",
    });
    await testInfo.attach("callcenter-map-blocked-screenshot", {
      path: resolve(process.cwd(), BLOCKED_SCREENSHOT_RELATIVE_PATH),
      contentType: "image/png",
    });
  });
});
