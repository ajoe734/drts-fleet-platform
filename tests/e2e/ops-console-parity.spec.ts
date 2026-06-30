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
