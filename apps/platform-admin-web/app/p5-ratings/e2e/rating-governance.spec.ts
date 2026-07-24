import { expect, test, type Page, type Route } from "@playwright/test";
import { resolve } from "node:path";

const API_PREFIX = "/control-plane-proxy/platform-admin";
const EVIDENCE_DIR = resolve(import.meta.dirname, "../evidence");

type QueueMode = "success" | "empty" | "forbidden" | "error" | "stale";

function now(): string {
  return new Date().toISOString();
}

function envelope(data: unknown) {
  return {
    success: true,
    data,
    meta: {
      timestamp: now(),
      requestId: "req-p5-rate-ui-e2e",
    },
  };
}

function summary(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    driverId: "driver-001",
    displayState: "rated",
    averageRating: 4.25,
    ratingCount: 8,
    lastRatedAt: "2026-07-24T03:30:00.000Z",
    aggregateVersion: 4,
    calculatedAt: now(),
    ...overrides,
  };
}

function rating(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ratingId: "rating-001",
    orderId: "order-001",
    tripId: "trip-001",
    driverId: "driver-001",
    score: 2,
    tags: ["service", "route"],
    comment: "服務流程需要進一步審查。",
    status: "under_review",
    submittedAt: "2026-07-24T03:30:00.000Z",
    updatedAt: "2026-07-24T03:45:00.000Z",
    ...overrides,
  };
}

function queueData(mode: QueueMode) {
  const items =
    mode === "empty"
      ? []
      : [
          {
            ...rating(),
            driverDisplayName: "林怡君",
            commentExcerpt: "服務流程需要進一步審查。",
          },
          {
            ...rating({
              ratingId: "rating-002",
              orderId: "order-002",
              tripId: "trip-002",
              score: 5,
              status: "active",
              tags: ["clean"],
              comment: null,
            }),
            driverDisplayName: "陳志明",
            commentExcerpt: null,
          },
        ];
  return {
    items,
    pageInfo: {
      page: 1,
      pageSize: 20,
      totalItems: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    },
    refresh: {
      generatedAt: now(),
      staleAfterMs: 300_000,
      stale: mode === "stale",
    },
  };
}

async function fulfillFailure(route: Route, status: number) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({
      success: false,
      error: {
        code: status === 403 ? "FORBIDDEN" : "INTERNAL_ERROR",
        message: status === 403 ? "Forbidden" : "Unavailable",
        retryable: status >= 500,
        traceId: "trace-p5-rate-ui-e2e",
      },
    }),
  });
}

async function installApi(
  page: Page,
  getQueueMode: () => QueueMode,
  onInvalidate?: (request: {
    body: unknown;
    idempotencyHeader: string | null;
  }) => void,
) {
  await page.route("**/control-plane-proxy/health*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "healthy" }),
    });
  });

  await page.route(
    "**/control-plane-proxy/platform-admin/**",
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (
        request.method() === "POST" &&
        path === `${API_PREFIX}/multi-taxi-ratings/rating-001/invalidate`
      ) {
        onInvalidate?.({
          body: request.postDataJSON(),
          idempotencyHeader: request.headers()["idempotency-key"] ?? null,
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({
              rating: rating({
                status: "invalidated",
                updatedAt: now(),
              }),
              driverRatingSummary: summary({
                averageRating: 4.57,
                ratingCount: 7,
                aggregateVersion: 5,
              }),
              audit: {
                auditId: "audit-001",
                ratingId: "rating-001",
                action: "invalidate",
                reason: "重複評價，調查確認",
                actorId: "platform-admin-e2e",
                idempotencyKey:
                  request.headers()["idempotency-key"] ?? "missing",
                previousStatus: "under_review",
                resultingStatus: "invalidated",
                aggregateVersion: 5,
                requestId: "req-p5-rate-ui-e2e",
                createdAt: now(),
              },
              replayed: false,
            }),
          ),
        });
        return;
      }

      if (
        request.method() === "GET" &&
        path === `${API_PREFIX}/multi-taxi-ratings/rating-001`
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({
              rating: rating(),
              orderNo: "MTX-20260724-001",
              driverDisplayName: "林怡君",
              passengerSubjectMasked: "pas***001",
              driverRatingSummary: summary(),
              moderationHistory: [],
              availableActions: {
                invalidate: {
                  enabled: true,
                  disabledReason: null,
                },
              },
              refresh: {
                generatedAt: now(),
                staleAfterMs: 300_000,
                stale: false,
              },
            }),
          ),
        });
        return;
      }

      if (
        request.method() === "GET" &&
        path === `${API_PREFIX}/multi-taxi-rating-authorities/driver-001`
      ) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            envelope({
              summary: summary(),
              unavailableReason: null,
              refresh: {
                generatedAt: now(),
                staleAfterMs: 300_000,
                stale: false,
              },
            }),
          ),
        });
        return;
      }

      if (
        request.method() === "GET" &&
        path === `${API_PREFIX}/multi-taxi-ratings`
      ) {
        const mode = getQueueMode();
        if (mode === "empty") {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 200));
        }
        if (mode === "forbidden") {
          await fulfillFailure(route, 403);
          return;
        }
        if (mode === "error") {
          await fulfillFailure(route, 500);
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(envelope(queueData(mode))),
        });
        return;
      }

      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "NOT_FOUND",
            message: "Not found",
            retryable: false,
            traceId: "trace-p5-rate-ui-e2e",
          },
        }),
      });
    },
  );
}

async function captureEvidence(page: Page, fileName: string) {
  await page
    .locator("nextjs-portal")
    .evaluateAll((portals) => portals.forEach((portal) => portal.remove()));
  await page.screenshot({
    path: resolve(EVIDENCE_DIR, fileName),
    fullPage: true,
  });
}

test("P5-RATE-UI-01..03 render production routes and invalidation semantics", async ({
  page,
}) => {
  let invalidateRequest:
    | {
        body: unknown;
        idempotencyHeader: string | null;
      }
    | undefined;
  await installApi(
    page,
    () => "success",
    (request) => {
      invalidateRequest = request;
    },
  );

  await page.goto("/p5-ratings");
  await expect(
    page.locator('main[data-screen-id="P5-RATE-UI-01"]'),
  ).toBeVisible();
  await expect(page.getByText("林怡君")).toBeVisible();
  await captureEvidence(page, "P5-RATE-UI-01-review-queue.png");

  await page.goto("/p5-ratings/rating-001");
  await expect(
    page.locator('main[data-screen-id="P5-RATE-UI-02"]'),
  ).toBeVisible();
  await expect(page.getByText("server-owned")).toBeVisible();
  await expect(page.getByTitle("command-pending")).toBeDisabled();
  await captureEvidence(page, "P5-RATE-UI-02-review-detail.png");

  await page.getByRole("button", { name: "作廢此評價" }).click();
  await page.getByLabel("作廢理由").fill("重複評價，調查確認");
  await page.getByRole("button", { name: "確認作廢並重建彙總" }).click();
  await expect(page.getByText("評價已作廢")).toBeVisible();
  expect(invalidateRequest?.idempotencyHeader).toBeTruthy();
  expect(invalidateRequest?.body).toEqual({
    reason: "重複評價，調查確認",
    idempotencyKey: invalidateRequest?.idempotencyHeader,
    confirmation: {
      action: "invalidate_rating",
      ratingId: "rating-001",
    },
  });

  await page.goto("/p5-ratings/drivers/driver-001");
  await expect(
    page.locator('main[data-screen-id="P5-RATE-UI-03"]'),
  ).toBeVisible();
  await expect(page.getByText("4.25 ★")).toBeVisible();
  await expect(page.getByText("評價次數: 8")).toBeVisible();
  await captureEvidence(page, "P5-RATE-UI-03-driver-authority.png");
});

test("queue exposes loading, empty, 403, error, and stale states", async ({
  page,
}) => {
  let mode: QueueMode = "empty";
  await installApi(page, () => mode);

  await page.goto("/p5-ratings");
  await expect(page.getByText("正在讀取正式評價資料")).toBeVisible();
  await expect(page.getByText("目前沒有符合條件的評價")).toBeVisible();

  mode = "forbidden";
  await page.reload();
  await expect(page.getByText("沒有評價治理讀取權限")).toBeVisible();

  mode = "error";
  await page.reload();
  await expect(page.getByText("無法讀取評價治理資料")).toBeVisible();

  mode = "stale";
  await page.reload();
  await expect(page.getByText("資料可能已過期")).toBeVisible();
});
