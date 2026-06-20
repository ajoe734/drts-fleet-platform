import { expect, test } from "@playwright/test";

const enterpriseTenantId =
  process.env.DRTS_ENTERPRISE_DISPATCH_TENANT_ID ??
  "10000000-0000-0000-0000-000000000201";
const enterpriseCostCenterCode = "CC-PRD-07";
const tenantConsoleBaseURL =
  process.env.DRTS_DEV_TENANT_CONSOLE_BASE_URL ??
  process.env.TENANT_CONSOLE_BASE_URL;

function tenantHeaders(requestId: string) {
  return {
    "Content-Type": "application/json",
    "x-actor-id": "enterprise-dispatch-e2e",
    "x-actor-type": "tenant_admin",
    "x-realm": "tenant",
    "x-request-id": requestId,
    "x-tenant-id": enterpriseTenantId,
    "X-DRTS-E2E-Actor": "enterprise-dispatch-e2e",
    "X-DRTS-E2E-Operation": "enterprise booking production chain",
    "X-DRTS-E2E-Surface": "enterprise-dispatch-web",
  };
}

function unwrapData(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: Record<string, unknown> }).data;
  }

  return body as Record<string, unknown>;
}

function field(data: Record<string, unknown>, camel: string, snake: string) {
  return data[camel] ?? data[snake];
}

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

  test("submits booking through the backend chain and proves read-back side effect", async ({
    page,
    request,
  }) => {
    const apiBaseURL = process.env.DRTS_DEV_API_BASE_URL;
    test.skip(
      !apiBaseURL ||
        !process.env.DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL ||
        !tenantConsoleBaseURL,
      "requires deployed enterprise web, tenant console, and API URLs",
    );

    const setupResponse = await request.post(
      `${apiBaseURL}/api/tenant/cost-centers`,
      {
        data: {
          code: enterpriseCostCenterCode,
          name: "Enterprise Dispatch E2E Guest Reception",
          description:
            "Ensures the UI booking submit chain has a real cost-center producer dependency.",
          ownerName: "Enterprise Dispatch E2E",
          activeFlag: true,
        },
        headers: tenantHeaders("enterprise-dispatch-e2e-cost-center"),
      },
    );
    const setupBody = await setupResponse.text();
    expect(
      setupResponse.ok(),
      `cost center setup should not be an unexplained empty dependency: ${setupResponse.status()} ${setupBody}`,
    ).toBeTruthy();
    const setupData = unwrapData(JSON.parse(setupBody) as unknown);
    expect(field(setupData, "code", "code")).toBe(enterpriseCostCenterCode);

    await page.goto("/bookings/review", { waitUntil: "domcontentloaded" });
    const submitButton = page.getByTestId("enterprise-booking-submit");
    await expect(submitButton).toHaveAttribute("data-ready", "true");
    await expect(submitButton).toBeEnabled();

    const bookingResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/control-plane-proxy/api/tenant/bookings") &&
        response.request().method() === "POST",
      { timeout: 30000 },
    );
    await submitButton.click();

    const bookingResponse = await bookingResponsePromise;
    const bookingResponseBody = await bookingResponse.text();
    expect(
      bookingResponse.ok(),
      "booking submit POST must hit the proxy and return proof: " +
        bookingResponse.status() +
        " " +
        bookingResponseBody,
    ).toBeTruthy();
    await expect(page).toHaveURL(
      /\/bookings\/submitted\?.*bookingId=booking-/,
      {
        timeout: 30000,
      },
    );

    const submittedUrl = new URL(page.url());
    const bookingId = submittedUrl.searchParams.get("bookingId");
    const orderId = submittedUrl.searchParams.get("orderId");
    expect(bookingId).toBeTruthy();
    expect(orderId).toBeTruthy();
    await expect(
      page.getByTestId("enterprise-booking-submission-proof"),
    ).toContainText(bookingId!);
    await expect(
      page.getByTestId("enterprise-booking-submission-proof"),
    ).toContainText(orderId!);
    await expect(
      page.getByTestId("enterprise-booking-submission-proof"),
    ).toContainText("enterprise-dispatch-web");

    const readBackResponse = await request.get(
      `${apiBaseURL}/api/tenant/bookings/${encodeURIComponent(bookingId!)}`,
      {
        headers: tenantHeaders("enterprise-dispatch-e2e-read-back"),
      },
    );
    const readBackBody = await readBackResponse.text();
    expect(
      readBackResponse.ok(),
      `booking read-back should prove the POST side effect: ${readBackResponse.status()} ${readBackBody}`,
    ).toBeTruthy();
    const readBackData = unwrapData(JSON.parse(readBackBody) as unknown);

    expect(field(readBackData, "bookingId", "booking_id")).toBe(bookingId);
    expect(field(readBackData, "orderId", "order_id")).toBe(orderId);
    expect(
      field(
        readBackData,
        "businessDispatchSubtype",
        "business_dispatch_subtype",
      ),
    ).toBe("enterprise_dispatch");
    expect(field(readBackData, "costCenter", "cost_center")).toBe(
      enterpriseCostCenterCode,
    );

    const tenantConsoleDetailUrl = new URL(
      "/bookings/" + encodeURIComponent(bookingId!),
      tenantConsoleBaseURL!,
    );
    const tenantConsoleResponse = await page.goto(
      tenantConsoleDetailUrl.toString(),
      { waitUntil: "domcontentloaded" },
    );
    expect(
      Boolean(tenantConsoleResponse?.ok()) ||
        tenantConsoleResponse?.status() === 304,
      "tenant-console detail should open the enterprise-produced booking",
    ).toBeTruthy();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await expect(page.locator("body")).toContainText(bookingId!);
    await expect(page.locator("body")).toContainText(orderId!);
    await expect(page.locator("body")).toContainText("enterprise_dispatch");
    await expect(page.locator("body")).toContainText(enterpriseCostCenterCode);
    await expect(page.locator("body")).toContainText(/行程摘要|Trip summary/);
    await expect(page.locator("body")).toContainText(
      /可編輯截止|Editable until/,
    );
    await expect(page.locator("body")).not.toContainText(
      /editableUntil|readOnlyReasonCode/,
    );
    await expect(page.locator("body")).not.toContainText(
      /No booking data exists yet|No booking data|fetch_failed|not_found/i,
    );
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
