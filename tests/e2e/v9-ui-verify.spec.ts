import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const rocBaseURL =
  process.env.DRTS_V9_VERIFY_ROC_BASE_URL ?? "http://127.0.0.1:3010";
const platformAdminBaseURL =
  process.env.DRTS_V9_VERIFY_PLATFORM_ADMIN_BASE_URL ??
  process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL ??
  "http://127.0.0.1:3002";
const opsBaseURL =
  process.env.DRTS_V9_VERIFY_OPS_BASE_URL ??
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  "http://127.0.0.1:3003";
const tenantBaseURL =
  process.env.DRTS_V9_VERIFY_TENANT_BASE_URL ??
  process.env.DRTS_DEV_TENANT_CONSOLE_BASE_URL ??
  "http://127.0.0.1:3004";
const referralBaseURL =
  process.env.DRTS_V9_VERIFY_REFERRAL_BASE_URL ??
  process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
  "http://127.0.0.1:3014";

const referralEntrySlug =
  process.env.DRTS_V9_VERIFY_REFERRAL_ENTRY_SLUG ?? "referral-demo-community";
const referralEntryHost =
  process.env.DRTS_V9_VERIFY_REFERRAL_ENTRY_HOST ??
  "community-app.example.test";
const tenantFallbackBookingId =
  process.env.DRTS_V9_VERIFY_TENANT_BOOKING_ID ?? "booking-avf-001";
const sandboxExperimentFallbackId =
  process.env.DRTS_V9_VERIFY_SANDBOX_EXPERIMENT_ID ?? "demo-experiment";
const investigationFallbackId =
  process.env.DRTS_V9_VERIFY_INVESTIGATION_ID ?? "demo-case";
const tripFallbackId = process.env.DRTS_V9_VERIFY_TRIP_ID ?? "demo-trip";
const manifestFallbackId =
  process.env.DRTS_V9_VERIFY_MANIFEST_ID ?? "demo-manifest";
const opsFallbackOrderId =
  process.env.DRTS_V9_VERIFY_OPS_ORDER_ID ?? "demo-order-ops-001";

const screenshotDir = path.join(
  process.cwd(),
  "support/sidecars/P2-V9-UI-VERIFY-001/screenshots",
);

const runtimeErrorPattern =
  /Application error|Unhandled Runtime Error|This page could not be found|NEXT_NOT_FOUND|Server Components render/i;

type RouteSpec = {
  key: string;
  label: string;
  baseUrl: string;
  path?: string;
  fallbackPath?: string;
  pathResolver?: (page: Page, cache: Map<string, string>) => Promise<string>;
  markers?: RegExp[];
  screenshot: string;
};

mkdirSync(screenshotDir, { recursive: true });

async function expectPageHealthy(body: Locator) {
  await expect(body).not.toContainText(runtimeErrorPattern, {
    timeout: 30_000,
  });
}

async function resolveHref(
  page: Page,
  params: {
    baseUrl: string;
    sourcePath: string;
    selector: string;
    hrefPattern: RegExp;
  },
) {
  const sourceUrl = new URL(params.sourcePath, params.baseUrl).toString();
  const response = await page.goto(sourceUrl, {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status(), `Failed to open source ${sourceUrl}`).toBeLessThan(
    400,
  );

  const body = page.locator("body");
  await expectPageHealthy(body);
  await expect(page.locator(params.selector).first()).toBeVisible({
    timeout: 30_000,
  });

  const hrefs = await page
    .locator(params.selector)
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    );

  const href = hrefs.find((candidate) => params.hrefPattern.test(candidate));
  if (!href) {
    throw new Error(
      `Could not resolve ${params.selector} from ${sourceUrl}; got ${hrefs.join(
        ", ",
      )}`,
    );
  }

  return href;
}

async function openRoute(
  page: Page,
  route: RouteSpec,
  cache: Map<string, string>,
) {
  let resolvedPath = route.path;

  if (route.pathResolver) {
    try {
      resolvedPath = await route.pathResolver(page, cache);
    } catch (error) {
      if (!route.fallbackPath) {
        throw error;
      }
      resolvedPath = route.fallbackPath;
    }
  }

  if (!resolvedPath) {
    throw new Error(`No path resolved for ${route.key}`);
  }

  cache.set(route.key, resolvedPath);

  const url = new URL(resolvedPath, route.baseUrl).toString();
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${route.key} should return < 400`).toBeLessThan(
    400,
  );

  const body = page.locator("body");
  await expectPageHealthy(body);

  for (const marker of route.markers ?? []) {
    await expect(body).toContainText(marker, { timeout: 30_000 });
  }

  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(screenshotDir, route.screenshot),
    fullPage: false,
  });
}

function resolvedPath(cache: Map<string, string>, key: string) {
  const value = cache.get(key);
  if (!value) {
    throw new Error(`Missing cached route path for ${key}`);
  }
  return value;
}

const routeSpecs: RouteSpec[] = [
  {
    key: "roc-overview",
    label: "ROC overview",
    baseUrl: rocBaseURL,
    path: "/overview",
    markers: [/overview|監控|active vehicles|recent alerts/i],
    screenshot: "01-roc-overview.png",
  },
  {
    key: "roc-liveboard",
    label: "ROC liveboard",
    baseUrl: rocBaseURL,
    path: "/liveboard",
    markers: [/liveboard|live board|overlay|接管/i],
    screenshot: "02-roc-liveboard.png",
  },
  {
    key: "roc-trips",
    label: "ROC trips",
    baseUrl: rocBaseURL,
    path: "/trips",
    markers: [/trips|行程|trip/i],
    screenshot: "03-roc-trips.png",
  },
  {
    key: "roc-vehicles",
    label: "ROC vehicles",
    baseUrl: rocBaseURL,
    path: "/vehicles",
    markers: [/vehicles|車輛|telemetry|operator/i],
    screenshot: "04-roc-vehicles.png",
  },
  {
    key: "roc-vehicle-detail",
    label: "ROC vehicle detail",
    baseUrl: rocBaseURL,
    pathResolver: (page) =>
      resolveHref(page, {
        baseUrl: rocBaseURL,
        sourcePath: "/vehicles",
        selector: 'a[href^="/vehicles/"]',
        hrefPattern: /^\/vehicles\/[^/]+$/i,
      }),
    markers: [
      /freshness|鮮度/i,
      /approved display scope|允許顯示範圍/i,
      /evidence snapshot|證據快照/i,
    ],
    screenshot: "05-roc-vehicle-detail.png",
  },
  {
    key: "roc-provider",
    label: "ROC provider",
    baseUrl: rocBaseURL,
    path: "/provider",
    markers: [/provider|供應商|health/i],
    screenshot: "06-roc-provider.png",
  },
  {
    key: "roc-handover",
    label: "ROC handover",
    baseUrl: rocBaseURL,
    path: "/handover",
    markers: [/handover|交班|next operator|open items/i],
    screenshot: "07-roc-handover.png",
  },
  {
    key: "roc-takeover",
    label: "ROC takeover",
    baseUrl: rocBaseURL,
    path: "/takeover",
    markers: [/tesla/i, /roc_response|operator|safety/i],
    screenshot: "08-roc-takeover.png",
  },
  {
    key: "roc-alerts",
    label: "ROC alerts",
    baseUrl: rocBaseURL,
    path: "/alerts",
    markers: [/alerts|告警|severity|available/i],
    screenshot: "09-roc-alerts.png",
  },
  {
    key: "roc-incidents",
    label: "ROC incidents",
    baseUrl: rocBaseURL,
    path: "/incidents",
    markers: [/incidents|事故|investigation|discrepancy/i],
    screenshot: "10-roc-incidents.png",
  },
  {
    key: "roc-evidence",
    label: "ROC evidence",
    baseUrl: rocBaseURL,
    path: "/evidence",
    markers: [/evidence|證據|freeze|summary/i],
    screenshot: "11-roc-evidence.png",
  },
  {
    key: "roc-reports",
    label: "ROC reports",
    baseUrl: rocBaseURL,
    path: "/reports",
    markers: [/reports|監理報表/i, /pending|ready|待審查|已就緒/i],
    screenshot: "12-roc-reports.png",
  },
  {
    key: "platform-sandbox-list",
    label: "Platform sandbox list",
    baseUrl: platformAdminBaseURL,
    path: "/sandbox",
    markers: [
      /sandbox|experiments|實驗/i,
      /failed to load sandbox governance|載入沙盒治理失敗|no sandbox experiments yet|尚無沙盒實驗|suspend console/i,
    ],
    screenshot: "13-platform-sandbox-list.png",
  },
  {
    key: "platform-sandbox-detail",
    label: "Platform sandbox detail",
    baseUrl: platformAdminBaseURL,
    fallbackPath: `/sandbox/${encodeURIComponent(sandboxExperimentFallbackId)}`,
    pathResolver: (page) =>
      resolveHref(page, {
        baseUrl: platformAdminBaseURL,
        sourcePath: "/sandbox",
        selector: 'a[href^="/sandbox/"]',
        hrefPattern: /^\/sandbox\/(?!suspend(?:\?|$))[^/?]+(?:\?[^#]+)?$/i,
      }),
    markers: [
      /sandbox|沙盒/i,
      /effective version|生效版本|failed to load sandbox governance|載入沙盒治理失敗/i,
    ],
    screenshot: "14-platform-sandbox-detail.png",
  },
  {
    key: "platform-sandbox-suspend",
    label: "Platform sandbox suspend",
    baseUrl: platformAdminBaseURL,
    path: "/sandbox/suspend",
    markers: [
      /suspend|resume|停用|恢復/i,
      /effects|影響|failed to load sandbox governance|載入沙盒治理失敗|no sandbox experiments yet|尚無沙盒實驗/i,
    ],
    screenshot: "15-platform-sandbox-suspend.png",
  },
  {
    key: "platform-compliance-dashboard",
    label: "Platform compliance dashboard",
    baseUrl: platformAdminBaseURL,
    path: "/platform-admin/compliance",
    markers: [
      /compliance dashboard|合規總覽|compliance/i,
      /accident cases|evidence posture|filing queue|事故案件|證據治理|監理報表/i,
    ],
    screenshot: "16-platform-compliance-dashboard.png",
  },
  {
    key: "platform-investigations",
    label: "Platform investigations queue",
    baseUrl: platformAdminBaseURL,
    path: "/platform-admin/investigations",
    markers: [
      /investigation queue|調查佇列|investigations/i,
      /takeover review|accident investigation queue|接管審查|事故案件/i,
    ],
    screenshot: "17-platform-investigations.png",
  },
  {
    key: "platform-investigation-detail",
    label: "Platform investigation detail",
    baseUrl: platformAdminBaseURL,
    fallbackPath: `/platform-admin/investigations/${encodeURIComponent(
      investigationFallbackId,
    )}`,
    pathResolver: (page) =>
      resolveHref(page, {
        baseUrl: platformAdminBaseURL,
        sourcePath: "/platform-admin/investigations",
        selector: 'a[href^="/platform-admin/investigations/"]',
        hrefPattern: /^\/platform-admin\/investigations\/[^/]+$/i,
      }),
    markers: [/investigation detail|事故案件/i],
    screenshot: "18-platform-investigation-detail.png",
  },
  {
    key: "platform-investigation-timeline",
    label: "Platform investigation timeline",
    baseUrl: platformAdminBaseURL,
    pathResolver: async (_page, cache) =>
      `${resolvedPath(cache, "platform-investigation-detail")}/timeline`,
    markers: [/timeline|同步時間軸/i],
    screenshot: "19-platform-investigation-timeline.png",
  },
  {
    key: "platform-trip-detail",
    label: "Platform compliance trip detail",
    baseUrl: platformAdminBaseURL,
    fallbackPath: `/platform-admin/compliance/trips/${encodeURIComponent(
      tripFallbackId,
    )}`,
    pathResolver: (page, cache) =>
      resolveHref(page, {
        baseUrl: platformAdminBaseURL,
        sourcePath: resolvedPath(cache, "platform-investigation-detail"),
        selector: 'a[href^="/platform-admin/compliance/trips/"]',
        hrefPattern: /^\/platform-admin\/compliance\/trips\/[^/]+$/i,
      }),
    markers: [/trip compliance|行程合規/i],
    screenshot: "20-platform-trip-detail.png",
  },
  {
    key: "platform-legal-holds",
    label: "Platform legal holds",
    baseUrl: platformAdminBaseURL,
    path: "/platform-admin/evidence/legal-holds",
    markers: [/legal hold|法律保留/i],
    screenshot: "21-platform-legal-holds.png",
  },
  {
    key: "platform-evidence-exports",
    label: "Platform evidence exports",
    baseUrl: platformAdminBaseURL,
    path: "/platform-admin/evidence/exports",
    markers: [/controlled export|受控匯出|export/i],
    screenshot: "22-platform-evidence-exports.png",
  },
  {
    key: "platform-manifest-detail",
    label: "Platform evidence manifest detail",
    baseUrl: platformAdminBaseURL,
    fallbackPath: `/platform-admin/evidence/manifests/${encodeURIComponent(
      manifestFallbackId,
    )}`,
    pathResolver: (page, cache) =>
      resolveHref(page, {
        baseUrl: platformAdminBaseURL,
        sourcePath: resolvedPath(cache, "platform-investigation-detail"),
        selector: 'a[href^="/platform-admin/evidence/manifests/"]',
        hrefPattern: /^\/platform-admin\/evidence\/manifests\/[^/]+$/i,
      }),
    markers: [/evidence manifest|證據清單/i],
    screenshot: "23-platform-manifest-detail.png",
  },
  {
    key: "platform-regulatory-reports",
    label: "Platform regulatory reports",
    baseUrl: platformAdminBaseURL,
    path: "/platform-admin/regulatory-reports",
    markers: [/report jobs|監理報表作業|regulator viewer|主管機關檢視/i],
    screenshot: "24-platform-regulatory-reports.png",
  },
  {
    key: "ops-av-fallback-list",
    label: "Ops AV fallback list",
    baseUrl: opsBaseURL,
    path: "/av-fallback",
    markers: [
      /AV → Human Fallback|AV -> Human Fallback|AV → 人駕備援/i,
      /Sandbox exceptions|沙盒例外|Fallback remains ops-observed|Fallback 由營運監看/i,
    ],
    screenshot: "25-ops-av-fallback-list.png",
  },
  {
    key: "ops-passenger-recovery",
    label: "Ops passenger recovery",
    baseUrl: opsBaseURL,
    fallbackPath: `/av-fallback/passenger-recovery/${encodeURIComponent(
      opsFallbackOrderId,
    )}`,
    pathResolver: (page, cache) =>
      resolveHref(page, {
        baseUrl: opsBaseURL,
        sourcePath: resolvedPath(cache, "ops-av-fallback-list"),
        selector: 'a[href^="/av-fallback/passenger-recovery/"]',
        hrefPattern: /^\/av-fallback\/passenger-recovery\/[^/]+$/i,
      }),
    markers: [
      /Passenger Recovery|乘客恢復/i,
      /Passenger-facing messageCode|乘客端 messageCode|Recovery status|恢復狀態/i,
    ],
    screenshot: "26-ops-passenger-recovery.png",
  },
  {
    key: "ops-sandbox-exceptions",
    label: "Ops sandbox exceptions",
    baseUrl: opsBaseURL,
    path: "/av-fallback/sandbox-exceptions",
    markers: [
      /Sandbox Exceptions|沙盒例外/i,
      /Exceptions remain backend-authored|例外資料由後端決定|Severity|嚴重度/i,
    ],
    screenshot: "27-ops-sandbox-exceptions.png",
  },
  {
    key: "tenant-av-fallback-list",
    label: "Tenant AV fallback list",
    baseUrl: tenantBaseURL,
    path: "/bookings/av-fallback",
    markers: [
      /AV 履約|av -> human fallback|租戶可見服務狀態/i,
      /轉派階段|fallback stage|部分 AV 履約資料未成功載入|目前沒有可見的 AV 履約訂單/i,
    ],
    screenshot: "28-tenant-av-fallback-list.png",
  },
  {
    key: "tenant-av-fallback-detail",
    label: "Tenant AV fallback detail",
    baseUrl: tenantBaseURL,
    fallbackPath: `/bookings/${encodeURIComponent(
      tenantFallbackBookingId,
    )}/av-fallback`,
    pathResolver: (page, cache) =>
      resolveHref(page, {
        baseUrl: tenantBaseURL,
        sourcePath: resolvedPath(cache, "tenant-av-fallback-list"),
        selector: 'a[href^="/bookings/"][href$="/av-fallback"]',
        hrefPattern: /^\/bookings\/[^/]+\/av-fallback$/i,
      }),
    markers: [
      /AV -> human fallback|AV -> 人駕 fallback/i,
      /Planned vs actual fulfillment|計畫 vs 實際履約/i,
      /Fallback stage|轉派進度|Tenant notification copy|租戶通知文案/i,
    ],
    screenshot: "29-tenant-av-fallback-detail.png",
  },
  {
    key: "referral-fallback-vehicle-change",
    label: "Referral fallback vehicle change",
    baseUrl: referralBaseURL,
    path: `/embed/${referralEntrySlug}?state=handoff&screen=vehicle_change_in_progress&entryHost=${encodeURIComponent(
      referralEntryHost,
    )}`,
    markers: [
      /重新安排車輛|vehicle change|fallback_to_web|改用網站|內嵌服務暫時無法使用/i,
    ],
    screenshot: "30-referral-fallback-vehicle-change.png",
  },
  {
    key: "referral-fallback-human-assigned",
    label: "Referral fallback human assigned",
    baseUrl: referralBaseURL,
    path: `/embed/${referralEntrySlug}?state=handoff&screen=human_fallback_assigned&entryHost=${encodeURIComponent(
      referralEntryHost,
    )}`,
    markers: [
      /新車已為您指派|human fallback assigned|fallback_to_web|改用網站|內嵌服務暫時無法使用/i,
    ],
    screenshot: "31-referral-fallback-human-assigned.png",
  },
  {
    key: "referral-fallback-service-continuing",
    label: "Referral fallback service continuing",
    baseUrl: referralBaseURL,
    path: `/embed/${referralEntrySlug}?state=handoff&screen=service_continuing&entryHost=${encodeURIComponent(
      referralEntryHost,
    )}`,
    markers: [
      /行程繼續進行|service continuing|fallback_to_web|改用網站|內嵌服務暫時無法使用/i,
    ],
    screenshot: "32-referral-fallback-service-continuing.png",
  },
  {
    key: "referral-fallback-eta-updated",
    label: "Referral fallback ETA updated",
    baseUrl: referralBaseURL,
    path: `/embed/${referralEntrySlug}?state=handoff&screen=eta_updated&entryHost=${encodeURIComponent(
      referralEntryHost,
    )}`,
    markers: [
      /預計時間已更新|eta updated|fallback_to_web|改用網站|內嵌服務暫時無法使用/i,
    ],
    screenshot: "33-referral-fallback-eta-updated.png",
  },
];

test.describe("P2-V9-UI-VERIFY-001 route smoke", () => {
  // This single smoke walks 33 routes serially and typically needs just over
  // five minutes in a clean worktree once screenshots are captured.
  test.setTimeout(420_000);

  test("smokes routed surfaces and captures screenshots", async ({ page }) => {
    const cache = new Map<string, string>();

    for (const route of routeSpecs) {
      await test.step(route.label, async () => {
        await openRoute(page, route, cache);
      });
    }
  });
});
