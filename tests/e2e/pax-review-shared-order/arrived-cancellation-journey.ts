import { expect, type Page, type TestInfo } from "@playwright/test";
import { recordOrderEvidence } from "./evidence";
import {
  assign,
  authority,
  book,
  camel,
  createDispatch,
  OPS,
  opsRead,
  readAssignedTripAndAccept,
  sharedDev,
  type JourneyStep,
} from "./additional-journey";

/** Real arrival and Passenger cancellation, including the actual scheduled
 * instant. Only the existing external GPS producer is paused; no internal
 * requests, clocks, task records or availability are replaced.
 */
export async function arrivedCancellationJourney(
  pax: Page,
  ops: Page,
  driver: Page,
  driverBase: string,
  paymentMethodId: string,
  previouslyCancelledOrderId: string,
  step: JourneyStep,
  info: TestInfo,
) {
  const orderId = await step("H Passenger books a new real order", () =>
    book(pax, paymentMethodId),
  );
  expect(orderId).not.toBe(previouslyCancelledOrderId);
  const assigned = await step(
    "H Ops reuses the released D vehicle and driver for the same new order",
    async () => {
      await createDispatch(ops, orderId);
      const result = await assign(ops);
      const view = await authority(pax, orderId);
      const previous = await authority(pax, previouslyCancelledOrderId);
      expect(previous.order.status).toBe("cancelled");
      expect(view.order.orderId).toBe(orderId);
      expect(view.assignment.driver.driverId).toBe(
        previous.assignment.driver.driverId,
      );
      expect(view.assignment.vehicle.vehicleId).toBe(
        previous.assignment.vehicle.vehicleId,
      );
      expect(result.taskId).toMatch(/^[0-9a-f-]{36}$/);
      return {
        taskId: result.taskId as string,
        driverId: view.assignment.driver.driverId as string,
        vehicleId: view.assignment.vehicle.vehicleId as string,
      };
    },
  );
  await readAssignedTripAndAccept(
    driver,
    driverBase,
    orderId,
    step,
    assigned.taskId,
  );
  for (const [label, action] of [
    ["前往接送點", "depart"],
    ["抵達上車點", "arrived_pickup"],
  ] as const) {
    await step(`H Driver ${action} through the original task UI`, async () => {
      const [response] = await Promise.all([
        driver.waitForResponse(
          (r) =>
            r.url().endsWith(`/driver/tasks/${assigned.taskId}/${action}`) &&
            r.request().method() === "POST",
        ),
        driver.getByRole("button", { name: label, exact: true }).click(),
      ]);
      expect(response.status()).toBe(201);
    });
  }
  const arrived = await step(
    "H original three-role arrival waits for the real scheduled time before cancellation",
    async () => {
      await expect
        .poll(async () => (await authority(pax, orderId)).order.status)
        .toBe("arrived_pickup");
      await expect(pax.getByText("司機已抵達", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(pax.getByTestId("review-order-id")).toHaveText(orderId);
      await expect(pax.getByText(/^預計\s+\d+\s+分鐘抵達$/)).toHaveCount(0);
      await driver
        .getByRole("button", { name: "暫停模擬定位", exact: true })
        .click();
      await expect(
        driver.getByText(/已停止；等待真 freshness 過期/),
      ).toBeVisible();
      const scheduledAt = (await authority(pax, orderId)).order
        .requestedPickupAt as string;
      expect(Number.isFinite(Date.parse(scheduledAt))).toBe(true);
      await expect
        .poll(() => Date.now(), { timeout: 180_000, intervals: [1000] })
        .toBeGreaterThanOrEqual(Date.parse(scheduledAt));
      await driver
        .getByRole("button", { name: "恢復模擬定位", exact: true })
        .click();
      let trackingFreshness: string | undefined;
      await expect
        .poll(async () => {
          const response = await ops.request.get(
            `${OPS}/control-plane-proxy/driver/tracking-status?driverId=${encodeURIComponent(assigned.driverId)}`,
          );
          expect(response.status()).toBe(200);
          trackingFreshness = camel(await response.json()).data
            .locationFreshness;
          return trackingFreshness;
        })
        .toBe("fresh");
      const view = await authority(pax, orderId);
      expect(view.order.status).toBe("arrived_pickup");
      expect(view.actions.canCancel).toBe(true);
      await expect(pax.getByText("司機已抵達", { exact: true })).toBeVisible();
      await expect(pax.getByText(/^預計\s+\d+\s+分鐘抵達$/)).toHaveCount(0);
      await opsRead(ops, orderId);
      await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
        "arrived_pickup",
      );
      await expect(
        driver.getByText(orderId, { exact: false }).first(),
      ).toBeVisible();
      const rows = await recordOrderEvidence(
        orderId,
        "H-arrived-before-cancel",
        { pax, ops, driver },
        info,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.order_id).toBe(orderId);
        expect(row.started_at ?? null).toBeNull();
        expect(row.payment_id ?? null).toBeNull();
        expect(row.rating_id ?? null).toBeNull();
        if (!sharedDev) {
          expect(row.status).toBe("arrived_pickup");
          expect(row.task_id).toBe(assigned.taskId);
          expect(row.task_status).toBe("arrived_pickup");
        }
      }
      return { scheduledAt, view, trackingFreshness };
    },
  );
  await step(
    "H Passenger dismisses then confirms the original cancellation after arrival",
    async () => {
      let cancelRequests = 0;
      const observe = (request: import("@playwright/test").Request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname.endsWith(`/rides/${orderId}/cancel`)
        )
          cancelRequests++;
      };
      pax.on("request", observe);
      try {
        const button = pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first();
        pax.once("dialog", (dialog) => void dialog.dismiss());
        await button.click();
        expect(cancelRequests).toBe(0);
        expect((await authority(pax, orderId)).order.status).toBe(
          "arrived_pickup",
        );
        await expect(pax).toHaveURL(new RegExp(`/rides/${orderId}$`));
        pax.once("dialog", (dialog) => void dialog.accept());
        const [response] = await Promise.all([
          pax.waitForResponse(
            (r) =>
              new URL(r.url()).pathname.endsWith(`/rides/${orderId}/cancel`) &&
              r.request().method() === "POST",
          ),
          button.click(),
        ]);
        expect(response.status()).toBe(201);
        expect(cancelRequests).toBe(1);
        await expect
          .poll(async () => (await authority(pax, orderId)).order.status)
          .toBe("cancelled");
        await expect(
          pax.getByText("此行程已取消", { exact: false }).first(),
        ).toBeVisible({ timeout: 10_000 });
        await expect(pax.getByTestId("review-order-id")).toHaveText(orderId);
        const after = await authority(pax, orderId);
        expect(Date.parse(after.order.cancelledAt)).toBeGreaterThanOrEqual(
          Date.parse(arrived.scheduledAt),
        );
        expect(after.actions.canCancel).toBe(false);
        expect(after.actions.canRate).toBe(false);
        expect(after.payment).toBeNull();
        expect(after.rating).toBeNull();
        await opsRead(ops, orderId);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          "cancelled",
        );
        await driver.reload();
        await expect(
          driver.getByText(orderId, { exact: false }).first(),
        ).toBeVisible();
        await expect(driver.getByText(/已取消|平台取消/).first()).toBeVisible();
        await expect(
          driver.getByText("目前沒有可執行動作", { exact: true }).first(),
        ).toBeVisible();
        for (const name of [
          "接受任務",
          "前往接送點",
          "抵達上車點",
          "開始行程",
          "完成行程",
        ]) {
          for (const action of await driver
            .getByRole("button", { name, exact: true })
            .all())
            await expect(action).toBeDisabled();
        }
        const rows = await recordOrderEvidence(
          orderId,
          "H-arrived-then-cancelled",
          { pax, ops, driver },
          info,
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.order_id).toBe(orderId);
          expect(row.started_at ?? null).toBeNull();
          expect(row.completed_at ?? null).toBeNull();
          expect(row.payment_id ?? null).toBeNull();
          expect(row.rating_id ?? null).toBeNull();
          if (!sharedDev) {
            expect(row.status).toBe("cancelled");
            expect(row.task_id).toBe(assigned.taskId);
            expect(row.task_status).toBe("cancelled");
          }
        }
        await info.attach("H-arrived-cancellation-original-UI-facts", {
          body: JSON.stringify({
            orderId,
            ...assigned,
            requestedPickupAt: arrived.scheduledAt,
            beforeCancellation: arrived.view,
            actualCancelledAt: after.order.cancelledAt,
            actualPOSTStatus: response.status(),
            actualDismissedConfirmationPOSTCount: 0,
            actualConfirmedCancellationPOSTCount: cancelRequests,
            actualMountedPassengerArrivalAndCancellationShown: true,
            actualMountedPassengerArrivalHasNoPendingPickupETA: true,
            actualThreeRoleSameOrderReadback: true,
            actualInternalNetworkMocks: false,
            actualClockAdvanced: false,
            externalGPSExplicitlySimulatedAndPaused: true,
            actualTrackingFreshnessBeforeCancellation:
              arrived.trackingFreshness,
            actualPaymentOrRatingCreated: false,
            scope: sharedDev
              ? "own deployed APIs and original UI; formal task/order PG joins separately qualified by same-source CI"
              : "own original UI and actual formal PG order/task readbacks",
          }),
          contentType: "application/json",
        });
      } finally {
        pax.off("request", observe);
      }
    },
  );
  return { orderId, ...assigned };
}
