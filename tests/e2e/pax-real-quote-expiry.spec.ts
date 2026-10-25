import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  authority,
  bind,
  camel,
  OPS,
  opsRead,
  PAX,
  sharedDev,
} from "./pax-review-shared-order/additional-journey";
import { recordOrderEvidence } from "./pax-review-shared-order/evidence";
import { createJourneyProgress } from "./pax-review-shared-order/progress";
import {
  createPlaywrightRideListFetcher,
  readAuthoritativeLinkedOrders,
} from "./pax-real-quote-linked-orders";

const requireApi = createRequire(
  resolve(__dirname, "../../apps/api/package.json"),
);
const { Pool } = requireApi("pg") as typeof import("pg");
const TTL_MS = 15 * 60_000;

async function linkedOrders(pax: Page, snapshotId: string) {
  if (!sharedDev) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query(
        "SELECT order_id::text FROM passenger.booking_histories WHERE fare_snapshot_id=$1 ORDER BY order_id",
        [snapshotId],
      );
      return result.rows.map((row: { order_id: string }) => row.order_id);
    } finally {
      await pool.end();
    }
  }
  return readAuthoritativeLinkedOrders(
    createPlaywrightRideListFetcher(
      pax.request,
      `${PAX}/api/passenger-app/rides`,
      camel,
    ),
    snapshotId,
  );
}

test("a real fifteen-minute quote expires without booking, then requotes and cancels one real order", async ({
  browser,
}, info) => {
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const pages: Record<string, Page> = {};
  let orderId = "";
  let cancelled = false;
  let browserRidePOSTCount = 0;
  const publicPassenger = process.env.PAX_REVIEW_PUBLIC_PASSENGER === "true";
  const role = async (name: "pax" | "ops") => {
    const token =
      name === "pax" && publicPassenger
        ? undefined
        : process.env[
            name === "pax"
              ? "PAX_REVIEW_PASSENGER_ID_TOKEN"
              : "PAX_REVIEW_OPS_ID_TOKEN"
          ];
    if (sharedDev && !(name === "pax" && publicPassenger) && !token)
      throw new Error(`Missing existing credential for ${name}`);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Taipei",
      ...(token
        ? {
            extraHTTPHeaders: {
              "X-Serverless-Authorization": `Bearer ${token}`,
            },
          }
        : {}),
    });
    const page = await context.newPage();
    pages[name] = page;
    page.on("response", (response) =>
      progress.response(
        name,
        response.request().method(),
        response.url(),
        response.status(),
      ),
    );
    if (name === "pax")
      page.on("request", (request) => {
        if (
          new URL(request.url()).pathname === "/api/passenger-app/rides" &&
          request.method() === "POST"
        )
          browserRidePOSTCount++;
      });
    return page;
  };
  const pax = await step("Expiry Passenger context", () => role("pax"));
  const ops = await step("Expiry Ops context", () => role("ops"));
  try {
    await step(
      "Prepare existing synthetic external supply through the original Ops page",
      async () => {
        await ops.goto(`${OPS}/review`);
        const requested = ops.waitForResponse(
          (response) =>
            new URL(response.url()).pathname.endsWith(
              "/ops/review-demo/prepare",
            ) && response.request().method() === "POST",
        );
        await ops.getByRole("button", { name: "準備虛構演練車司" }).click();
        expect((await requested).ok()).toBe(true);
      },
    );
    await step(
      "Expiry Passenger logs in through actual OTP endpoints",
      async () => {
        await pax.goto(`${PAX}/review`);
        const suffix = (Number(process.env.GITHUB_RUN_ID ?? 1) + 77) % 100;
        await pax
          .getByLabel("演練手機", { exact: true })
          .fill(`09000000${String(suffix).padStart(2, "0")}`);
        await pax.getByRole("checkbox").check();
        const requested = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              "/api/passenger-app/review-demo/otp" &&
            response.request().method() === "POST",
        );
        await pax.getByRole("button", { name: "取得模擬簡訊" }).click();
        expect((await requested).ok()).toBe(true);
        await pax.getByRole("button", { name: "驗證並登入演練帳戶" }).click();
        await expect(pax.getByTestId("review-passenger-id")).toBeVisible();
      },
    );
    const paymentMethodId = await step(
      "Bind simulated external PSP through the original payment UI",
      () => bind(pax, "success"),
    );
    const scheduledAt = await step(
      "Original form selects two points and a time beyond the real expiry",
      async () => {
        await pax.goto(`${PAX}/`);
        const agree = pax.getByRole("button", {
          name: "我已閱讀並同意",
          exact: true,
        });
        await expect(
          agree.or(pax.getByLabel("示範上車地點", { exact: true })),
        ).toBeVisible();
        if (await agree.isVisible()) await agree.click();
        await pax
          .getByLabel("示範上車地點", { exact: true })
          .selectOption("review-banqiao");
        await pax
          .getByLabel("示範下車地點", { exact: true })
          .selectOption("review-city-hall");
        const value = await pax.evaluate(() => {
          const date = new Date(
            Math.ceil((Date.now() + 60 * 60_000) / 60_000) * 60_000,
          );
          const pad = (v: number) => String(v).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        });
        await pax.getByLabel("預約時間", { exact: true }).fill(value);
        return value;
      },
    );
    async function quote() {
      const sentAtMs = Date.now();
      const requested = pax.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/passenger-app/quotes" &&
          response.request().method() === "POST",
      );
      await pax.getByRole("button", { name: "試算車資", exact: true }).click();
      const response = await requested;
      expect(response.status()).toBe(201);
      const data = camel(await response.json()).data;
      expect(data.serviceAreaResult).toBe("serviceable");
      expect(data.fareSnapshotId).toMatch(/^[0-9a-f-]{36}$/);
      const expiresAtMs = Date.parse(data.expiresAt);
      expect(expiresAtMs - sentAtMs).toBeGreaterThan(TTL_MS - 15_000);
      expect(expiresAtMs - sentAtMs).toBeLessThan(TTL_MS + 15_000);
      await expect(
        pax.getByLabel("我已確認費用與優惠說明", { exact: true }),
      ).toBeVisible();
      return {
        snapshotId: data.fareSnapshotId as string,
        expiresAt: data.expiresAt as string,
        expiresAtMs,
        sentAtMs,
        command: response.request().postDataJSON(),
      };
    }
    const first = await step(
      "Original quote has the unchanged real fifteen-minute expiry",
      quote,
    );
    await step(
      "Original confirmation is prepared but never submitted",
      async () => {
        await pax.locator(`input[value="${paymentMethodId}"]`).check();
        await pax.getByLabel("我已確認費用與優惠說明", { exact: true }).check();
        await expect(
          pax.getByRole("button", { name: "確認叫車", exact: true }),
        ).toBeEnabled();
        expect(browserRidePOSTCount).toBe(0);
        expect(await linkedOrders(pax, first.snapshotId)).toEqual([]);
        await info.attach("quote-expiry-original-confirmation-pax", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      },
    );
    const expiredAtMs = await step(
      "Real clocks reach expiry and the original page invalidates the unsent quote",
      async () => {
        await expect
          .poll(() => Date.now(), {
            timeout: TTL_MS + 30_000,
            intervals: [1000],
          })
          .toBeGreaterThan(first.expiresAtMs + 1000);
        await expect(
          pax.getByText("費率試算已過期，請重新試算。", { exact: true }),
        ).toBeVisible();
        await expect(
          pax.getByRole("button", { name: "確認叫車", exact: true }),
        ).toHaveCount(0);
        await expect(
          pax.getByLabel("我已確認費用與優惠說明", { exact: true }),
        ).toHaveCount(0);
        await expect(pax.getByLabel("預約時間", { exact: true })).toHaveValue(
          scheduledAt,
        );
        await expect(
          pax.getByLabel("示範上車地點", { exact: true }),
        ).toHaveValue("review-banqiao");
        await expect(
          pax.getByLabel("示範下車地點", { exact: true }),
        ).toHaveValue("review-city-hall");
        expect(Date.now() - first.sentAtMs).toBeGreaterThanOrEqual(TTL_MS);
        expect(browserRidePOSTCount).toBe(0);
        expect(await linkedOrders(pax, first.snapshotId)).toEqual([]);
        await info.attach("quote-expiry-expired-original-form-pax", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        return Date.now();
      },
    );
    const refusal = await step(
      "Actual backend refuses an expired snapshot without committing an order",
      async () => {
        const response = await pax.request.post(
          `${PAX}/api/passenger-app/rides`,
          {
            headers: {
              Origin: new URL(PAX).origin,
              "x-request-id": randomUUID(),
            },
            data: {
              scheduledAt: first.command.scheduledAt,
              origin: {
                lat: first.command.originLat,
                lng: first.command.originLng,
              },
              destination: {
                lat: first.command.destinationLat,
                lng: first.command.destinationLng,
              },
              paymentMethodId,
              fareSnapshotId: first.snapshotId,
              passengerConfirmedAt: new Date().toISOString(),
            },
          },
        );
        expect(response.status()).toBe(400);
        const data = await response.json();
        expect(data.error.code).toBe("FARE_QUOTE_EXPIRED");
        expect(await linkedOrders(pax, first.snapshotId)).toEqual([]);
        return {
          actualHTTPStatus: response.status(),
          actualErrorCode: data.error.code as string,
          actualDirectExpiredCreatePOSTCount: 1,
        };
      },
    );
    const fresh = await step(
      "Original form requotes the retained route and clears the prior fee confirmation",
      async () => {
        const data = await quote();
        expect(data.snapshotId).not.toBe(first.snapshotId);
        expect(data.command).toEqual(first.command);
        await expect(
          pax.getByLabel("我已確認費用與優惠說明", { exact: true }),
        ).not.toBeChecked();
        await expect(
          pax.getByRole("button", { name: "確認叫車", exact: true }),
        ).toBeDisabled();
        await expect(
          pax.getByText("費率試算已過期，請重新試算。", { exact: true }),
        ).toHaveCount(0);
        await info.attach("quote-expiry-fresh-confirmation-pax", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        return data;
      },
    );
    await step(
      "Original confirmation books one real order using only the new snapshot",
      async () => {
        await pax.locator(`input[value="${paymentMethodId}"]`).check();
        await pax.getByLabel("我已確認費用與優惠說明", { exact: true }).check();
        const requested = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/passenger-app/rides" &&
            response.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "確認叫車", exact: true })
          .click();
        const response = await requested;
        expect(response.status()).toBe(201);
        expect(response.request().postDataJSON().fareSnapshotId).toBe(
          fresh.snapshotId,
        );
        orderId = camel(await response.json()).data.ride.order.orderId;
        expect(orderId).toMatch(/^[0-9a-f-]{36}$/);
        await expect(pax.getByTestId("review-order-id")).toHaveText(orderId);
        expect(browserRidePOSTCount).toBe(1);
        expect(await linkedOrders(pax, first.snapshotId)).toEqual([]);
        expect(await linkedOrders(pax, fresh.snapshotId)).toEqual([orderId]);
        await opsRead(ops, orderId);
      },
    );
    await step(
      "Passenger cancels the recovered order and Ops reads the same UUID",
      async () => {
        const dialog = pax.waitForEvent("dialog").then(async (value) => {
          expect(value.type()).toBe("confirm");
          expect(value.message()).toBe("確定要取消這趟行程嗎？");
          await value.accept();
        });
        const [response] = await Promise.all([
          pax.waitForResponse(
            (value) =>
              new URL(value.url()).pathname ===
                `/api/passenger-app/rides/${orderId}/cancel` &&
              value.request().method() === "POST",
          ),
          dialog,
          pax
            .getByRole("button", { name: "取消行程", exact: true })
            .first()
            .click(),
        ]);
        expect(response.status()).toBe(201);
        expect((await authority(pax, orderId)).order.status).toBe("cancelled");
        cancelled = true;
        await opsRead(ops, orderId);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          "cancelled",
        );
        const rows = await recordOrderEvidence(
          orderId,
          "quote-expiry-recovered-cancelled",
          { pax, ops },
          info,
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.order_id).toBe(orderId);
          expect(row.payment_id ?? null).toBeNull();
          expect(row.rating_id ?? null).toBeNull();
          if (!sharedDev) expect(row.fare_snapshot_id).toBe(fresh.snapshotId);
        }
        expect(await linkedOrders(pax, first.snapshotId)).toEqual([]);
        expect(await linkedOrders(pax, fresh.snapshotId)).toEqual([orderId]);
      },
    );
    await info.attach(
      "quote-expiry-real-time-refusal-requote-and-same-order-facts",
      {
        contentType: "application/json",
        body: JSON.stringify({
          candidateSha: process.env.PAX_QUOTE_EXPIRY_SOURCE_SHA,
          orderId,
          unchangedQuoteTTLms: TTL_MS,
          firstQuoteId: first.snapshotId,
          firstRequestedAtMs: first.sentAtMs,
          actualFirstExpiresAt: first.expiresAt,
          actualExpiryObservedAtMs: expiredAtMs,
          actualElapsedSinceFirstRequestMs: expiredAtMs - first.sentAtMs,
          freshQuoteId: fresh.snapshotId,
          actualFreshExpiresAt: fresh.expiresAt,
          actualOriginalDraftPreserved: true,
          actualPriorFeeConfirmationReset: true,
          actualBrowserRidePOSTCountDuringWait: 0,
          actualSuccessfulBrowserRidePOSTCount: browserRidePOSTCount,
          refusal,
          actualExpiredQuoteLinkedOrders: await linkedOrders(
            pax,
            first.snapshotId,
          ),
          actualFreshQuoteLinkedOrders: await linkedOrders(
            pax,
            fresh.snapshotId,
          ),
          actualRecoveredOrderCancelledReadByPassengerAndOps: cancelled,
          actualInternalNetworkMocks: false,
          actualClockAdvanced: false,
          actualBackendExpiryConfigurationChanged: false,
          externalSMSandPSPSimulated: true,
        }),
      },
    );
  } finally {
    if (orderId && !cancelled) {
      const response = await pax.request.post(
        `${PAX}/api/passenger-app/rides/${orderId}/cancel`,
        {
          headers: { Origin: new URL(PAX).origin },
          data: { reason: "quote_expiry_acceptance_own_order_cleanup" },
        },
      );
      await info.attach("quote-expiry-own-created-order-cleanup", {
        contentType: "application/json",
        body: JSON.stringify({
          orderId,
          actualCancelHTTPStatus: response.status(),
        }),
      });
    }
    await Promise.all(
      Object.values(pages).map((page) => page.context().close()),
    );
  }
});
