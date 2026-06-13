import { expect, test, type Page } from "@playwright/test";

const baseUrl = process.env.PLATFORM_ADMIN_BASE_URL ?? "http://localhost:3002";

type RouteSpec = {
  key: string;
  path: string;
  title: string | RegExp;
  markers: Array<string | RegExp>;
  screenshot: string;
};

const routeSpecs: RouteSpec[] = [
  {
    key: "home",
    path: "/",
    title: /平台治理工作首頁|Platform governance/i,
    markers: [/DRTS 平台管理|平台控制平面|治理快照/i],
    screenshot: "platform-admin-home.png",
  },
  {
    key: "tenants",
    path: "/tenants",
    title: /租戶|Tenants/i,
    markers: [/生命週期|新增租戶|正式環境/i],
    screenshot: "platform-admin-tenants.png",
  },
  {
    key: "tenant-governance",
    path: "/tenant-governance",
    title: /跨租戶治理|Tenant governance/i,
    markers: [/配額|審批|成本中心|治理風險/i],
    screenshot: "platform-admin-tenant-governance.png",
  },
  {
    key: "partners",
    path: "/partners",
    title: /合作夥伴 entry|Partner entries|合作夥伴/i,
    markers: [/銀行|auth|eligibility|品牌/i],
    screenshot: "platform-admin-partners.png",
  },
  {
    key: "partner-detail-unavailable",
    path: "/partners/ctbc-elite",
    title: /Partner entry 目前不可用|Partner entry unavailable/i,
    markers: [/找不到指定的 partner entry|requested partner entry/i],
    screenshot: "platform-admin-partner-detail-unavailable.png",
  },
  {
    key: "fleet-partners",
    path: "/fleet-partners",
    title: /車隊夥伴|Fleet partners/i,
    markers: [/建立車隊夥伴|分潤|治理/i],
    screenshot: "platform-admin-fleet-partners.png",
  },
  {
    key: "fleet-partner-detail",
    path: "/fleet-partners/fleet-partner-demo-001",
    title: /車隊夥伴詳情|Fleet partner detail/i,
    markers: [/司機掛靠|分潤規則|結算單/i],
    screenshot: "platform-admin-fleet-partner-detail.png",
  },
  {
    key: "fleet",
    path: "/fleet",
    title: /車隊與合規治理|Fleet/i,
    markers: [/車輛|司機|合約|裝置綁定/i],
    screenshot: "platform-admin-fleet.png",
  },
  {
    key: "vehicle-eligibility",
    path: "/vehicle-eligibility",
    title: /車輛資格矩陣|Vehicle eligibility/i,
    markers: [/服務產品|座位|行李|派遣/i],
    screenshot: "platform-admin-vehicle-eligibility.png",
  },
  {
    key: "service-products",
    path: "/service-products",
    title: /服務產品|Service products/i,
    markers: [/計程車|機場接送|保險代步車|旅行社/i],
    screenshot: "platform-admin-service-products.png",
  },
  {
    key: "pricing",
    path: "/pricing",
    title: /費率治理|Pricing/i,
    markers: [/定價|費率|pricing/i],
    screenshot: "platform-admin-pricing.png",
  },
  {
    key: "payments",
    path: "/payments",
    title: /結算治理|結算與帳務|Payments/i,
    markers: [/發票|司機結算單|報銷|對帳/i],
    screenshot: "platform-admin-payments.png",
  },
  {
    key: "reimbursements",
    path: "/payments/reimbursements",
    title: /代墊批次|Reimbursement batches/i,
    markers: [/草稿|待核准|已付款|Q-ADM12/i],
    screenshot: "platform-admin-reimbursements.png",
  },
  {
    key: "reimbursement-detail",
    path: "/payments/reimbursements/rb_2026_05_001",
    title: /代墊批次|Reimbursement batch/i,
    markers: [/Q-ADM12|批次|line items|狀態機/i],
    screenshot: "platform-admin-reimbursement-detail.png",
  },
  {
    key: "adapter-registry",
    path: "/adapter-registry",
    title: /平台轉接器|Adapter/i,
    markers: [/憑證|Ops|註冊轉接器|BGMT/i],
    screenshot: "platform-admin-adapter-registry.png",
  },
  {
    key: "health",
    path: "/health",
    title: /健康與警示|平台健康|Health/i,
    markers: [/Webhook|派車|警示|轉發器/i],
    screenshot: "platform-admin-health.png",
  },
  {
    key: "notices",
    path: "/notices",
    title: /公告與維護|Notices/i,
    markers: [/重新整理|公告|維護/i],
    screenshot: "platform-admin-notices.png",
  },
  {
    key: "audit",
    path: "/audit",
    title: /稽核與證據|Audit/i,
    markers: [/Append-only|保留|刪除例外|CSV/i],
    screenshot: "platform-admin-audit.png",
  },
  {
    key: "feature-flags",
    path: "/feature-flags",
    title: /功能旗標|Feature Flags/i,
    markers: [/寫入權限|租戶覆寫|唯讀/i],
    screenshot: "platform-admin-feature-flags.png",
  },
  {
    key: "users",
    path: "/users",
    title: /平台人員|Users/i,
    markers: [/RBAC|角色|邀請/i],
    screenshot: "platform-admin-users.png",
  },
  {
    key: "switchboard",
    path: "/switchboard",
    title: /公開資訊與牌貼|Switchboard/i,
    markers: [/switchboard|牌貼|發佈版本/i],
    screenshot: "platform-admin-switchboard.png",
  },
];

async function assertShell(page: Page) {
  const shellAside = page
    .locator("aside")
    .filter({ hasText: /DRTS 平台管理|Platform Admin|租戶治理/ })
    .first();
  await expect(shellAside).toBeVisible();
  await expect(shellAside).toContainText(
    /DRTS 平台管理|Platform Admin|租戶治理/,
  );
}

test.describe("platform admin parity smoke", () => {
  test.use({ viewport: { width: 1440, height: 950 } });
  test.setTimeout(180_000);

  test("21 governance routes render inside one platform shell", async ({
    page,
  }) => {
    for (const spec of routeSpecs) {
      await page.goto(`${baseUrl}${spec.path}`, {
        waitUntil: "domcontentloaded",
      });

      await expect(page).not.toHaveURL(/404/);
      await expect(page.locator("body")).not.toContainText(
        /404|Application error|Internal Server Error/i,
      );
      await assertShell(page);

      await expect(page.locator("body")).toContainText(spec.title);

      for (const marker of spec.markers) {
        await expect(page.locator("body")).toContainText(marker);
      }

      await page.screenshot({
        path: `test-results/platform-admin-parity/${spec.screenshot}`,
        fullPage: true,
      });
    }
  });
});
