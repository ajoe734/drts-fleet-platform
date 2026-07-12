import { expect, test, type Page } from "@playwright/test";

import { installMockMapTileRoutes } from "./map-geofence-harness";

const baseUrl =
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  process.env.OPS_CONSOLE_BASE_URL ??
  "http://localhost:3003";

const sourceResolveAttempts = 8;
const sourceResolveBackoffMs = 10_000;
const retryableSourceFailurePattern =
  /429|Too Many Requests|fetch_failed|無法載入|暫不可用/i;

type RouteSpec = {
  key: string;
  path?: string;
  title: string | RegExp;
  markers: Array<string | RegExp>;
  screenshot: string;
  hrefFrom?: {
    sourcePath: string;
    selector: string;
    hrefPattern?: RegExp;
  };
  textFrom?: {
    sourcePath: string;
    pattern: RegExp;
    pathPrefix: string;
    retryableFallbackPath?: string;
  };
};

const routeSpecs: RouteSpec[] = [
  {
    key: "dashboard",
    path: "/dashboard",
    title: /儀表板|營運總覽|Operations Dashboard/,
    markers: [/今日待處理|健康訊號|dispatch/i],
    screenshot: "ops-dashboard.png",
  },
  {
    key: "dispatch-list",
    path: "/dispatch",
    title: /派車調度|Dispatch/i,
    markers: [/待派遣|已指派|外部鏡像|Forwarded/i],
    screenshot: "ops-dispatch-list.png",
  },
  {
    key: "dispatch-detail",
    path: "/dispatch/OPS-SMOKE-DISPATCH",
    title: /Activity|活動|Recent activity/i,
    markers: [/Delivery sequence|訂單狀態|Recent activity|候選/i],
    screenshot: "ops-dispatch-detail.png",
  },
  {
    key: "callcenter",
    path: "/callcenter",
    title: /客服中心|call center/i,
    markers: [/session|callback|queue|通話工作階段|回撥|佇列/i],
    screenshot: "ops-callcenter.png",
  },
  {
    key: "complaints-list",
    path: "/complaints",
    title: /客訴中心|Complaint/i,
    markers: [/SLA|建立客訴|Activity feed|客訴/i],
    screenshot: "ops-complaints-list.png",
  },
  {
    key: "complaints-detail",
    path: "/complaints/CMP-0908",
    title: /CMP-0908|Activity feed|活動紀錄/i,
    markers: [/Linked entities|Export view|升級事故|High-risk/i],
    screenshot: "ops-complaints-detail.png",
  },
  {
    key: "incidents-list",
    path: "/incidents",
    title: /事故中心|Incidents/i,
    markers: [/Governance guardrail|建立事故|事故/i],
    screenshot: "ops-incidents-list.png",
  },
  {
    key: "incidents-detail",
    path: "/incidents/OPS-SMOKE-INCIDENT",
    title: /Activity feed|活動紀錄|INC-|inc_/i,
    markers: [/Service recovery|Linked entities|通知警方|事故/i],
    screenshot: "ops-incidents-detail.png",
  },
  {
    key: "approval-requests",
    path: "/approval-requests",
    title: /審批|Approval/i,
    markers: [/approval|override|queue|審批|核准|覆寫|佇列/i],
    screenshot: "ops-approval-requests.png",
  },
  {
    key: "reports",
    path: "/reports",
    title: /報表|Reports/i,
    markers: [/report|filing|export|報表|申報|匯出/i],
    screenshot: "ops-reports.png",
  },
  {
    key: "revenue",
    path: "/revenue",
    title: /收益|Revenue/i,
    markers: [/revenue|mismatch|settlement|收益|差異|結算/i],
    screenshot: "ops-revenue.png",
  },
  {
    key: "attendance",
    path: "/attendance",
    title: /出勤|Attendance/i,
    markers: [/attendance|shift|出勤/i],
    screenshot: "ops-attendance.png",
  },
  {
    key: "maintenance",
    path: "/maintenance",
    title: /維修|Maintenance/i,
    markers: [/maintenance|保養|工單/i],
    screenshot: "ops-maintenance.png",
  },
  {
    key: "drivers-list",
    path: "/drivers",
    title: /司機|Drivers/i,
    markers: [/drivers|platform|registry|司機|平台|名冊|登錄/i],
    screenshot: "ops-drivers-list.png",
  },
  {
    key: "drivers-detail",
    title: /司機|Driver|DRV-|drv-/i,
    markers: [/Manual override|suppression|platform|司機/i],
    screenshot: "ops-drivers-detail.png",
    textFrom: {
      sourcePath: "/drivers",
      pattern: /\bdrv-[a-z0-9-]+\b/i,
      pathPrefix: "/drivers/",
      retryableFallbackPath: "/drivers/drv-demo-001",
    },
  },
  {
    key: "vehicles-list",
    path: "/vehicles",
    title: /車輛|Vehicles/i,
    markers: [/vehicle|registry|車輛/i],
    screenshot: "ops-vehicles-list.png",
  },
  {
    key: "vehicles-detail",
    title: /VEH-|veh-|Vehicle|車輛/i,
    markers: [/audit|contract|maintenance|車輛/i],
    screenshot: "ops-vehicles-detail.png",
    textFrom: {
      sourcePath: "/vehicles",
      pattern: /\b(?:VEH|veh)-[a-z0-9-]+\b/i,
      pathPrefix: "/vehicles/",
      retryableFallbackPath: "/vehicles/veh-demo-001",
    },
  },
  {
    key: "contracts-list",
    path: "/contracts",
    title: /合約|Contracts/i,
    markers: [/partner|contract|registry|合作|契約|名冊|登錄/i],
    screenshot: "ops-contracts-list.png",
  },
  {
    key: "contracts-detail",
    title: /CTR-|contract-|ops read-only|合約/i,
    markers: [/Operational terms|Version history|Platform Admin|合約/i],
    screenshot: "ops-contracts-detail.png",
    textFrom: {
      sourcePath: "/contracts",
      pattern: /\b(?:CTR|contract)-[a-z0-9-]+\b/i,
      pathPrefix: "/contracts/",
      retryableFallbackPath: "/contracts/contract-demo-001",
    },
  },
  {
    key: "feature-flags",
    path: "/feature-flags",
    title: /功能旗標|Feature Flags/i,
    markers: [/read only|Platform Admin|feature/i],
    screenshot: "ops-feature-flags.png",
  },
];

async function resolveRoutePath(page: Page, spec: RouteSpec) {
  if (spec.path) {
    return spec.path;
  }
  if (spec.hrefFrom) {
    await page.goto(`${baseUrl}${spec.hrefFrom.sourcePath}`, {
      waitUntil: "domcontentloaded",
    });
    const hrefs = await page
      .locator(spec.hrefFrom.selector)
      .evaluateAll((links) =>
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      );
    const href = hrefs.find(
      (candidate) =>
        !spec.hrefFrom?.hrefPattern ||
        spec.hrefFrom.hrefPattern.test(candidate),
    );
    if (!href) {
      throw new Error(`Could not resolve href for ${spec.key}`);
    }
    return href;
  }

  if (spec.textFrom) {
    let lastBodyText = "";
    for (let attempt = 1; attempt <= sourceResolveAttempts; attempt += 1) {
      await page.goto(`${baseUrl}${spec.textFrom.sourcePath}`, {
        waitUntil: "domcontentloaded",
      });
      const bodyText = await page.locator("body").innerText();
      const match = bodyText.match(spec.textFrom.pattern);
      if (match?.[0]) {
        return `${spec.textFrom.pathPrefix}${encodeURIComponent(match[0])}`;
      }

      lastBodyText = bodyText.replace(/\s+/g, " ").trim();
      const canRetry =
        retryableSourceFailurePattern.test(lastBodyText) &&
        attempt < sourceResolveAttempts;
      if (!canRetry) {
        break;
      }

      // The source page is a read-model seam; retry transient throttling first.
      // If the source remains throttled, fall back to stable demo seed IDs so
      // detail-page smoke still verifies the runtime route instead of failing
      // only because the list read model rate-limited this run.
      await page.waitForTimeout(sourceResolveBackoffMs);
    }
    if (
      spec.textFrom.retryableFallbackPath &&
      retryableSourceFailurePattern.test(lastBodyText)
    ) {
      return spec.textFrom.retryableFallbackPath;
    }
    throw new Error(
      `Could not resolve text id for ${spec.key}. Last source body: ${lastBodyText.slice(
        0,
        800,
      )}`,
    );
  }

  throw new Error(`No path or route source configured for ${spec.key}`);
}

async function assertShell(page: Page) {
  const shellAside = page
    .locator("aside")
    .filter({ hasText: /Dashboard|Dispatch|Registry|儀表板|派車調度/ })
    .first();
  await expect(shellAside).toBeVisible();
  await expect(shellAside).toContainText(
    /Dashboard|Dispatch|Registry|儀表板|派車調度/,
  );
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

async function installMockCallcenterMapRoutes(
  page: Page,
  options: {
    geoUnavailable?: boolean;
    previewUnavailable?: boolean;
  } = {},
) {
  const now = "2026-07-03T14:00:00.000Z";
  const geoUnavailable = options.geoUnavailable ?? false;
  const previewUnavailable = options.previewUnavailable ?? false;
  const activeSession = {
    callId: "CALL-SMOKE-001",
    callType: "booking",
    callerPhone: "0912-000-301",
    agentId: "AGENT-OPS-001",
    agentIdentityAnnounced: true,
    agentIdentityAnnouncedAt: now,
    status: "active",
    startedAt: now,
    endedAt: null,
    recordingId: "REC-SMOKE-001",
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
  const serviceablePickupCandidate = {
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
  const blockedPickupCandidate = {
    candidateId: "mock-taipei-station",
    provider: "mock-geo",
    providerCandidateId: "place-station",
    placeId: "place-station",
    displayName: "Taipei Main Station",
    address: "No. 3, Beiping West Road, Zhongzheng District, Taipei",
    normalizedAddress: "No.3 Beiping W. Rd, Zhongzheng, Taipei",
    district: "Zhongzheng",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.047762, lng: 121.517017 },
    confidence: "exact",
    accuracyM: 10,
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
  const manualReviewCandidate = {
    candidateId: "mock-taipei-101",
    provider: "mock-geo",
    providerCandidateId: "place-101",
    placeId: "place-101",
    displayName: "Taipei 101",
    address: "No. 7, Section 5, Xinyi Road, Xinyi District, Taipei",
    normalizedAddress: "No.7 Sec.5 Xinyi Rd, Xinyi, Taipei",
    district: "Xinyi",
    locality: "Taipei",
    countryCode: "TW",
    location: { lat: 25.033964, lng: 121.564468 },
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
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

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
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }

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
          mode: geoUnavailable ? "disabled" : "mock",
          status: geoUnavailable ? "unhealthy" : "healthy",
          failClosed: geoUnavailable,
          mockAllowed: true,
          checks: [],
        },
      }),
    });
  });

  await page.route("**/control-plane-proxy/geo/search*", async (route) => {
    if (geoUnavailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "GEO_PROVIDER_UNAVAILABLE",
            message: "Geo provider is unavailable.",
            retryable: true,
          },
        }),
      });
      return;
    }

    const requestUrl = new URL(route.request().url());
    const query = requestUrl.searchParams.get("q")?.toLowerCase() ?? "";
    const candidates =
      query.includes("city") ||
      query.includes("hall") ||
      query.includes("pickup")
        ? [serviceablePickupCandidate]
        : query.includes("station")
          ? [blockedPickupCandidate]
          : query.includes("101")
            ? [manualReviewCandidate]
            : query.includes("office") || query.includes("drop")
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

  await page.route(
    "**/control-plane-proxy/service-area/evaluate*",
    async (route) => {
      if (previewUnavailable) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: {
              code: "SERVICE_AREA_PREVIEW_UNAVAILABLE",
              message: "Service-area preview is unavailable.",
              retryable: true,
            },
          }),
        });
        return;
      }

      const command = route.request().postDataJSON() as {
        pickup: { lat: number; lng: number };
        dropoff?: { lat: number; lng: number } | null;
      };

      if (isNearPoint(command.pickup, blockedPickupCandidate.location)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              decision: "not_serviceable",
              serviceProductType: "taxi_realtime",
              evaluatedAt: now,
              stops: [
                {
                  kind: "pickup",
                  location: blockedPickupCandidate.location,
                  serviceAreaCodes: ["TAIPEI_CORE"],
                  policyCodes: ["TPE_STATION_PICKUP_BLOCK"],
                  geometryVersionRefs: [
                    "service_area:TAIPEI_CORE@1",
                    "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
                  ],
                  decision: "not_serviceable",
                  reasonCodes: ["PICKUP_NOT_ALLOWED"],
                  reasonMessages: ["Pickup is not allowed at this curb zone."],
                },
              ],
              serviceAreaCodes: ["TAIPEI_CORE"],
              geometryVersionRefs: [
                "service_area:TAIPEI_CORE@1",
                "stop_policy:TPE_STATION_PICKUP_BLOCK@1",
              ],
              reasonCodes: ["PICKUP_NOT_ALLOWED"],
              reasonMessages: ["Pickup is not allowed at this curb zone."],
            },
          }),
        });
        return;
      }

      if (isNearPoint(command.pickup, manualReviewCandidate.location)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              decision: "manual_review",
              serviceProductType: "taxi_realtime",
              evaluatedAt: now,
              stops: [
                {
                  kind: "pickup",
                  location: manualReviewCandidate.location,
                  serviceAreaCodes: ["TAIPEI_CORE"],
                  policyCodes: ["XINYI_HOSPITAL_MANUAL_REVIEW"],
                  geometryVersionRefs: [
                    "service_area:TAIPEI_CORE@1",
                    "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
                  ],
                  decision: "manual_review",
                  reasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
                  reasonMessages: [
                    "This stop requires ops review before dispatch.",
                  ],
                },
              ],
              serviceAreaCodes: ["TAIPEI_CORE"],
              geometryVersionRefs: [
                "service_area:TAIPEI_CORE@1",
                "stop_policy:XINYI_HOSPITAL_MANUAL_REVIEW@1",
              ],
              reasonCodes: ["STOP_REQUIRES_MANUAL_REVIEW"],
              reasonMessages: [
                "This stop requires ops review before dispatch.",
              ],
            },
          }),
        });
        return;
      }

      const stops = [
        {
          kind: "pickup",
          location: command.pickup,
          serviceAreaCodes: ["mock-core"],
          policyCodes: [],
          geometryVersionRefs: ["mock-v1"],
          decision: "serviceable",
          reasonCodes: [],
          reasonMessages: [],
        },
      ];
      if (command.dropoff) {
        stops.push({
          kind: "dropoff",
          location: command.dropoff,
          serviceAreaCodes: ["mock-core"],
          policyCodes: [],
          geometryVersionRefs: ["mock-v1"],
          decision: "serviceable",
          reasonCodes: [],
          reasonMessages: [],
        });
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            decision: "serviceable",
            serviceProductType: "taxi_realtime",
            evaluatedAt: now,
            stops,
            serviceAreaCodes: ["mock-core"],
            geometryVersionRefs: ["mock-v1"],
            reasonCodes: [],
            reasonMessages: [],
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
            orderId: "ORD-SMOKE-001",
            orderSource: "callcenter",
            callId: activeSession.callId,
            recordingId: activeSession.recordingId,
            status: "pending_dispatch",
          },
        }),
      });
    },
  );
}

function isNearPoint(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number },
) {
  return (
    Math.abs(left.lat - right.lat) < 0.0005 &&
    Math.abs(left.lng - right.lng) < 0.0005
  );
}

test.describe("ops console parity smoke", () => {
  test.use({ viewport: { width: 1440, height: 950 } });
  test.setTimeout(180_000);

  test("20 routes render inside one ops shell", async ({ page }) => {
    for (const spec of routeSpecs) {
      const path = await resolveRoutePath(page, spec);
      await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });

      await expect(page).not.toHaveURL(/404/);
      await expect(page.locator("body")).not.toContainText(
        /404|Application error/i,
      );
      await assertShell(page);

      await expect(page.locator("body")).toContainText(spec.title);

      for (const marker of spec.markers) {
        await expect(page.locator("body")).toContainText(marker);
      }

      await page.screenshot({
        path: `test-results/ops-console-parity/${spec.screenshot}`,
        fullPage: true,
      });
    }
  });

  test("callcenter phone booking captures coordinate provenance in request body", async ({
    page,
  }) => {
    await installMockCallcenterMapRoutes(page);
    await page.goto(`${baseUrl}/callcenter`, { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/404/);
    await expect(page.locator("body")).not.toContainText(
      /404|Application error/i,
    );
    await assertShell(page);

    const mapPair = await ensureCallcenterMapBookingForm(page);
    await expect(mapPair).toHaveAttribute(
      "data-service-product-type",
      "taxi_realtime",
    );
    await expect(mapPair).toHaveAttribute(
      "data-can-evaluate-service-area",
      "true",
    );
    const bookingForm = mapPair.locator("xpath=ancestor::form[1]");

    const bookingGate = page.locator("[data-callcenter-map-booking-gate]");
    await expect(bookingGate).toHaveAttribute(
      "data-callcenter-map-booking-gate",
      "pickup_coordinates_required",
    );

    const submitButton = bookingForm
      .getByRole("button", {
        name: /Create phone booking|建立電話訂車/i,
      })
      .first();
    await expect(submitButton).toBeDisabled();

    const passengerNameInput = bookingForm
      .locator('input[type="text"]')
      .first();
    await passengerNameInput.fill("Smoke Caller");
    await expect(passengerNameInput).toHaveValue("Smoke Caller");

    const pickupPicker = page.locator(
      '[data-address-map-picker="callcenter-pickup-map"]',
    );
    const pickupSearchInput = pickupPicker
      .locator('input[type="text"]')
      .first();
    await pickupSearchInput.fill("Taipei City Hall");
    await expect(pickupSearchInput).toHaveValue("Taipei City Hall");
    await pickupPicker.getByRole("button", { name: /Search|搜尋/i }).click();
    const pickupCandidateButton = pickupPicker
      .locator("button")
      .filter({ hasText: /Taipei City Hall/i })
      .first();
    await expect(pickupCandidateButton).toBeVisible();
    await pickupCandidateButton.click();

    const dropoffPicker = page.locator(
      '[data-address-map-picker="callcenter-dropoff-map"]',
    );
    const dropoffSearchInput = dropoffPicker
      .locator('input[type="text"]')
      .first();
    await dropoffSearchInput.fill("Xinyi Office");
    await expect(dropoffSearchInput).toHaveValue("Xinyi Office");
    await dropoffPicker.getByRole("button", { name: /Search|搜尋/i }).click();
    const dropoffCandidateButton = dropoffPicker
      .locator("button")
      .filter({ hasText: /Xinyi Office/i })
      .first();
    await expect(dropoffCandidateButton).toBeVisible();
    await dropoffCandidateButton.click();

    await expect(bookingGate).toHaveAttribute(
      "data-callcenter-map-booking-gate",
      "serviceable",
    );
    await expect(submitButton).toBeEnabled();

    const requestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        request.url().includes("/call-center/orders"),
    );
    page.once("dialog", (dialog) => dialog.accept());
    await submitButton.click();

    const request = await requestPromise;
    const payload = request.postDataJSON() as {
      passenger: { name: string; phone: string };
      pickup: Record<string, unknown>;
      dropoff: Record<string, unknown>;
    };

    expect(payload.passenger.name).toBe("Smoke Caller");
    expect(payload.pickup).toMatchObject({
      address: "No. 1, City Hall Road, Xinyi District, Taipei",
      lat: 25.037519,
      lng: 121.56368,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      providerCandidateId: "place-city-hall",
      surface: "callcenter",
    });
    expect(payload.dropoff).toMatchObject({
      address: "No. 100, Songren Road, Xinyi District, Taipei",
      lat: 25.033879,
      lng: 121.568743,
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      providerCandidateId: "place-xinyi-office",
      surface: "callcenter",
    });
    expect(payload.pickup.coordinateProvenance).toMatchObject({
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      providerCandidateId: "place-city-hall",
      surface: "callcenter",
    });
    expect(payload.dropoff.coordinateProvenance).toMatchObject({
      coordinateSource: "provider_candidate",
      geocodeProvider: "mock-geo",
      providerCandidateId: "place-xinyi-office",
      surface: "callcenter",
    });
  });

  test("callcenter blocks no-pickup curb selections and shows the policy reason", async ({
    page,
  }) => {
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

    const pickupPicker = page.locator(
      '[data-address-map-picker="callcenter-pickup-map"]',
    );
    await pickupPicker.locator('input[type="text"]').first().fill("Station");
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

    await expect(bookingGate).toHaveAttribute(
      "data-callcenter-map-booking-gate",
      "serviceability_blocked",
    );
    await expect(bookingGate).toContainText(
      /Pickup is not allowed at this curb zone\./,
    );
    await expect(submitButton).toBeDisabled();
  });

  test("callcenter geo outage degrades the picker and keeps manual coordinates blocked", async ({
    page,
  }) => {
    await installMockCallcenterMapRoutes(page, {
      geoUnavailable: true,
      previewUnavailable: true,
    });
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

    const pickupPicker = page.locator(
      '[data-address-map-picker="callcenter-pickup-map"]',
    );
    await expect(pickupPicker).toContainText(
      /Address lookup is unavailable|地址查詢目前不可用/i,
    );
    await pickupPicker
      .getByRole("button", { name: /Enter coordinates manually|手動輸入座標/i })
      .click();
    await pickupPicker.getByLabel(/Latitude|緯度/i).fill(String(25.037519));
    await pickupPicker.getByLabel(/Longitude|經度/i).fill(String(121.56368));
    await pickupPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("caller confirmed city hall curb");
    await pickupPicker
      .getByRole("button", { name: /Use this location|使用這個位置/i })
      .click();

    const dropoffPicker = page.locator(
      '[data-address-map-picker="callcenter-dropoff-map"]',
    );
    await expect(dropoffPicker).toContainText(
      /Address lookup is unavailable|地址查詢目前不可用/i,
    );
    await dropoffPicker
      .getByRole("button", { name: /Enter coordinates manually|手動輸入座標/i })
      .click();
    await dropoffPicker.getByLabel(/Latitude|緯度/i).fill(String(25.033879));
    await dropoffPicker.getByLabel(/Longitude|經度/i).fill(String(121.568743));
    await dropoffPicker
      .getByLabel(/Reason for manual location|手動定位原因/i)
      .fill("caller confirmed office entrance");
    await dropoffPicker
      .getByRole("button", { name: /Use this location|使用這個位置/i })
      .click();

    await expect(bookingGate).toHaveAttribute(
      "data-callcenter-map-booking-gate",
      "serviceability_preview_unavailable",
    );
    await expect(submitButton).toBeDisabled();
  });

  test("dispatch map board exposes governed spatial readiness hooks", async ({
    page,
  }) => {
    await installMockMapTileRoutes(page);
    await page.goto(`${baseUrl}/dispatch`, { waitUntil: "domcontentloaded" });

    await expect(page).not.toHaveURL(/404/);
    await expect(page.locator("body")).not.toContainText(
      /404|Application error/i,
    );
    await assertShell(page);

    const board = page.locator(".spatial-board").first();
    await expect(board).toBeVisible({ timeout: 45_000 });
    await expect(board).toHaveAttribute(
      "data-ops-map-provider-status",
      /^(ready|degraded_projection|no_spatial_data)$/,
    );
    await expect(board).toHaveAttribute(
      "data-ops-map-fallback-reason",
      /^(none|missing_coordinates|no_visible_points)$/,
    );
    await expect(board).toHaveAttribute("data-ops-map-service-areas", /.*/);
    await expect(board).toHaveAttribute("data-ops-map-policy-codes", /.*/);
    await expect(board.locator(".spatial-map-status")).toBeVisible();
    await expect(
      board.locator("[data-ops-map-service-area-filter]"),
    ).toHaveAttribute("data-ops-map-service-area-filter", /.*/);

    const providerStatus = await board.getAttribute(
      "data-ops-map-provider-status",
    );
    const mapPointCount = await board
      .locator("[data-ops-map-point-kind]")
      .count();
    if (providerStatus !== "no_spatial_data") {
      expect(mapPointCount).toBeGreaterThan(0);
      const routeCount = Number(
        await board.getAttribute("data-ops-map-route-count"),
      );
      expect(routeCount).toBeGreaterThan(0);
      await expect(board.locator("[data-ops-map-render-mode]")).toHaveAttribute(
        "data-ops-map-render-mode",
        "tile",
      );
      await expect(
        board.locator("[data-ops-map-tile-template]"),
      ).toHaveAttribute("data-ops-map-tile-template", "configured");
      await expect(board.locator("[data-ops-map-zoom]")).toHaveAttribute(
        "data-ops-map-zoom",
        /^\d+$/,
      );
      await expect(
        board.locator('img[src*="/mock-map-tiles/"]').first(),
      ).toBeVisible();
      await expect(
        board.locator("[data-ops-map-route-line]").first(),
      ).toBeVisible();
      await expect(board.getByText(/Zoom in|放大/).first()).toBeVisible();
    }
    if (mapPointCount > 0) {
      const firstPoint = board.locator("[data-ops-map-point-kind]").first();
      await expect(firstPoint).toHaveAttribute(
        "data-ops-map-point-kind",
        /^(pickup|dropoff|candidate)$/,
      );
      await expect(firstPoint).toHaveAttribute("data-ops-map-order-id", /.*/);
    }
  });
});
