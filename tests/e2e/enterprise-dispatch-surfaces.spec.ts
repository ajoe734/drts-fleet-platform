import { expect, test } from "@playwright/test";

const websiteRoutes = [
  { path: "/", marker: /嗨，林宜君，|企業派車|成本中心/ },
  { path: "/bookings", marker: /我的預約|費用歸屬|成本中心/ },
  { path: "/bookings/new", marker: /建立預約|企業語意優先|政策預覽/ },
  {
    path: "/bookings/review",
    marker: /確認權責|需要審批|提交 booking command/,
  },
  { path: "/bookings/submitted", marker: /已受理|不要重複送出|送出摘要/ },
  { path: "/bookings/EB-7K2E1D", marker: /預約詳情|行程與權責|可用操作/ },
  { path: "/trip", marker: /目前行程|ETA|預約詳情/ },
  { path: "/receipts/EB-7K28Z2", marker: /行程收據|收據摘要|成本中心/ },
  { path: "/help", marker: /說明與支援|常見政策|企業用車/ },
] as const;

const gateRoutes = [
  { path: "/auth-required", marker: /需要重新登入|企業 SSO session/ },
  { path: "/suspended", marker: /目前沒有使用權限|租戶權限/ },
  {
    path: "/approval-pending",
    marker: /申請已送出，等待審批|accepted \+ pending/,
  },
  { path: "/approval-rejected", marker: /審批未通過|政策不允許/ },
  { path: "/quota-blocked", marker: /額度或政策限制|quota summary/ },
  { path: "/no-supply", marker: /目前無法派車|no fulfillment available/ },
  { path: "/degraded", marker: /服務暫時降級|避免重複送出/ },
] as const;

const embedRoutes = [
  {
    path: "/embed",
    marker: /已透過企業 App 登入|handoff_ok|tenant_signature/,
  },
  {
    path: "/embed/reauth-required",
    marker: /登入狀態已逾時|reauth_required|handoff_token/,
  },
  {
    path: "/embed/unsupported-host",
    marker: /無法在此環境開啟|unsupported_host|來源主機未授權/,
  },
  {
    path: "/embed/consent-required",
    marker: /授權使用企業派車|consent_required|identity.read/,
  },
  {
    path: "/embed/fallback-to-web",
    marker: /未偵測到企業登入|fallback_to_web|企業 SSO/,
  },
] as const;

test.describe("enterprise dispatch surfaces", () => {
  test("renders website booking routes inside the enterprise shell", async ({
    page,
  }) => {
    for (const route of websiteRoutes) {
      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status(), route.path).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
      await expect(page.locator("body"), route.path).toContainText(
        route.marker,
      );
      await expect(page.getByRole("banner"), route.path).toContainText(
        "鴻碩科技",
      );
      await expect(page.getByRole("banner"), route.path).toContainText(
        "我的預約",
      );
      await expect(page.locator("main"), route.path).not.toContainText(
        /Platform Admin|平台管理後台|營運控制台|Bank Console|卡友訂單/,
      );
    }
  });

  test("renders support-safe gate states without protected trip details", async ({
    page,
  }) => {
    for (const route of gateRoutes) {
      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status(), route.path).toBe(200);
      await expect(page.locator("body"), route.path).toContainText(
        route.marker,
      );
      await expect(page.locator("body"), route.path).toContainText("原因");
      await expect(page.locator("body"), route.path).toContainText("影響");
      await expect(page.locator("body"), route.path).toContainText("下一步");
      await expect(page.locator("main"), route.path).not.toContainText(
        /EB-7K2E1D|林宜君 · EB-|金額 NT\$/,
      );
    }
  });

  test("keeps embed identity states compact and separate from website chrome", async ({
    page,
  }) => {
    for (const route of embedRoutes) {
      const response = await page.goto(route.path, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.status(), route.path).toBe(200);
      await expect(page.locator("body"), route.path).toContainText(
        route.marker,
      );
      await expect(page.locator("body"), route.path).toContainText("webview");
      await expect(page.locator("body"), route.path).toContainText("內嵌於");
      await expect(page.getByRole("banner"), route.path).toHaveCount(0);
      await expect(page.locator("body"), route.path).not.toContainText(
        /我的預約\s+行程\s+說明|本月額度\s+NT\$ 31,000|後台治理模組/,
      );
    }
  });
});
