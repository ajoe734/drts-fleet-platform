import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Route } from "@playwright/test";

const ORDER_ID = "ZX-240720-0186";
const screenshotDir = fileURLToPath(
  new URL(
    "../../../../support/sidecars/P5-PAY-OPS-UI-001/screenshots/",
    import.meta.url,
  ),
);

mkdirSync(screenshotDir, { recursive: true });

const failedPayment = {
  paymentId: "payment-001",
  orderId: ORDER_ID,
  tripId: "trip-001",
  status: "failed",
  amount: { amountMinor: 35500, currency: "NTD" },
  safeProviderReference: "pay_...88f2",
  attemptCount: 3,
  updatedAt: "2026-07-20T07:12:00.000Z",
  availableActions: [
    {
      action: "retry_capture",
      enabled: false,
      disabledReasonCode: "payment_recovery_command_pending",
      riskLevel: "medium",
    },
  ],
  auditTimeline: [
    {
      auditId: "audit-payment-001",
      actorId: "payment-provider",
      actorType: "system",
      actionName: "payment_capture_failed",
      requestId: "provider-request-003",
      createdAt: "2026-07-20T07:12:00.000Z",
    },
  ],
};

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "playwright-payment-exception",
      timestamp: "2026-07-24T00:00:00.000Z",
    },
  };
}

async function mockControlPlane(
  page: Page,
  paymentHandler: (route: Route) => Promise<void>,
) {
  await page.route("**/control-plane-proxy/**", async (route) => {
    if (route.request().url().includes("/payment-exceptions/")) {
      await paymentHandler(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ status: "ok" })),
    });
  });
}

test("covers loading, audit timeline, safe reference, and failed state", async ({
  page,
}) => {
  let releaseResponse: (() => void) | undefined;
  await mockControlPlane(
    page,
    (route) =>
      new Promise<void>((resolveResponse) => {
        releaseResponse = () => {
          void route
            .fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(envelope(failedPayment)),
            })
            .then(resolveResponse);
        };
      }),
  );

  await page.goto(`/payments/${ORDER_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("payment-exception-loading")).toBeVisible();
  await expect.poll(() => Boolean(releaseResponse)).toBe(true);
  releaseResponse?.();

  await expect(page.getByTestId("payment-exception-detail")).toBeVisible();
  await expect(page.getByText("payment_capture_failed")).toBeVisible();
  await expect(page.getByText("pay_...88f2")).toBeVisible();
  await expect(page.getByText(/failed/).first()).toBeVisible();
  await expect(page.getByText(/retry_capture/)).toBeVisible();
  await expect(
    page.getByText(/payment_recovery_command_pending/),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("mark_paid");
  await expect(page.locator("body")).not.toContainText(
    "pay_provider_secret_88f2",
  );

  await page.screenshot({
    path: resolve(screenshotDir, "01-payment-failed-detail.png"),
    fullPage: true,
  });
});

test("renders a dedicated 403 state without payment data", async ({ page }) => {
  await mockControlPlane(page, async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "AUTH_SCOPE_DENIED",
          message: "billing:read is required",
          retryable: false,
          traceId: "trace-payment-403",
        },
      }),
    });
  });

  await page.goto(`/payments/${ORDER_ID}`);

  await expect(page.getByTestId("payment-exception-forbidden")).toBeVisible();
  await expect(page.getByText("pay_...88f2")).toHaveCount(0);
});

test("recovers from a server error only through an authoritative retry", async ({
  page,
}) => {
  let attempts = 0;
  await mockControlPlane(page, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "PAYMENT_READ_FAILED",
            message: "temporary failure",
            retryable: true,
            traceId: "trace-payment-500",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope(failedPayment)),
    });
  });

  await page.goto(`/payments/${ORDER_ID}`);
  await expect(page.getByTestId("payment-exception-error")).toBeVisible();
  await page.getByRole("button", { name: /authoritative read/i }).click();
  await expect(page.getByTestId("payment-exception-detail")).toBeVisible();
  expect(attempts).toBe(2);
});

test("keeps manual recovery visibly unpaid", async ({ page }) => {
  await mockControlPlane(page, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          ...failedPayment,
          status: "manual_recovery",
          availableActions: [],
        }),
      ),
    });
  });

  await page.goto(`/payments/${ORDER_ID}`);
  await expect(page.getByTestId("payment-exception-detail")).toBeVisible();
  await expect(page.getByText(/manual_recovery/).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("已付款");
  await expect(page.locator("body")).not.toContainText("Paid");

  await page.screenshot({
    path: resolve(screenshotDir, "02-payment-manual-recovery.png"),
    fullPage: true,
  });
});

test("executes only an enabled backend descriptor and refreshes authoritative state", async ({
  page,
}) => {
  const commandRequests: Array<{
    idempotencyKey: string | undefined;
    body: string | null;
  }> = [];
  await mockControlPlane(page, async (route) => {
    if (route.request().method() === "POST") {
      commandRequests.push({
        idempotencyKey: route.request().headers()["idempotency-key"],
        body: route.request().postData(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            actionId: "idem-payment-ui-001",
            auditId: "audit-payment-ui-001",
            resourceType: "multi_taxi_payment_exception",
            resourceId: "payment-001",
            status: "accepted",
            message: "Payment capture retry accepted.",
          }),
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        envelope({
          ...failedPayment,
          availableActions: [
            {
              action: "retry_capture",
              enabled: commandRequests.length === 0,
              ...(commandRequests.length > 0
                ? { disabledReasonCode: "payment_recovery_pending" }
                : {}),
              riskLevel: "medium",
            },
          ],
        }),
      ),
    });
  });
  page.on("dialog", (dialog) => void dialog.accept());

  await page.goto(`/payments/${ORDER_ID}`);
  await page.getByRole("button", { name: /retry_capture/ }).click();

  await expect(page.getByText(/audit-payment-ui-001/)).toBeVisible();
  await expect(page.getByText(/payment_recovery_pending/)).toBeVisible();
  expect(commandRequests[0]?.idempotencyKey).toBeTruthy();
  expect(commandRequests[0]?.body).toBeNull();
});
