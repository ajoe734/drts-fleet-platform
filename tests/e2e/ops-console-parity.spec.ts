import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.OPS_CONSOLE_BASE_URL ?? "http://localhost:3003";

type RouteSpec = {
  key: string;
  path?: string;
  title: string | RegExp;
  markers: Array<string | RegExp>;
  screenshot: string;
  hrefFrom?: {
    sourcePath: string;
    selector: string;
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
    markers: [/session|callback|queue/i],
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
    markers: [/approval|override|queue/i],
    screenshot: "ops-approval-requests.png",
  },
  {
    key: "reports",
    path: "/reports",
    title: /報表|Reports/i,
    markers: [/report|filing|export/i],
    screenshot: "ops-reports.png",
  },
  {
    key: "revenue",
    path: "/revenue",
    title: /收益|Revenue/i,
    markers: [/revenue|mismatch|settlement/i],
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
    markers: [/drivers|platform|registry/i],
    screenshot: "ops-drivers-list.png",
  },
  {
    key: "drivers-detail",
    path: "/drivers/DRV-001",
    title: /司機|Driver|DRV-001/i,
    markers: [/Manual override|suppression|platform|司機/i],
    screenshot: "ops-drivers-detail.png",
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
    path: "/vehicles/VEH-001",
    title: /VEH-001|Vehicle|車輛/i,
    markers: [/audit|contract|maintenance|車輛/i],
    screenshot: "ops-vehicles-detail.png",
  },
  {
    key: "contracts-list",
    path: "/contracts",
    title: /合約|Contracts/i,
    markers: [/partner|contract|registry/i],
    screenshot: "ops-contracts-list.png",
  },
  {
    key: "contracts-detail",
    path: "/contracts/CTR-310",
    title: /CTR-310|ops read-only|合約/i,
    markers: [/Operational terms|Version history|Platform Admin|合約/i],
    screenshot: "ops-contracts-detail.png",
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
  if (!spec.hrefFrom) {
    throw new Error(`No path or href source configured for ${spec.key}`);
  }
  await page.goto(`${baseUrl}${spec.hrefFrom.sourcePath}`, {
    waitUntil: "domcontentloaded",
  });
  const href = await page
    .locator(spec.hrefFrom.selector)
    .first()
    .getAttribute("href");
  if (!href) {
    throw new Error(`Could not resolve href for ${spec.key}`);
  }
  return href;
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
});
