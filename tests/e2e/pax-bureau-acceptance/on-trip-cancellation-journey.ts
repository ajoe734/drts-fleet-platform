import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  authority,
  bind,
  book,
  createDispatch,
  assign,
  registerDriver,
  readAssignedTripAndAccept,
  OPS,
  PAX,
  type JourneyStep,
} from "../pax-review-shared-order/additional-journey";

/**
 * UC05's post-arrival cancellation-rejection branch (review.md: "補同版原
 * UI/BFF 上車後/proof_pending取消拒絕與原單狀態/任務/付款不變"). The real
 * passenger ride page (passenger-ride-page.tsx) disables the 取消行程 button
 * once `actions.canCancel` is false, so once the order is on_trip there is no
 * real click path left that could even reach the server rejection — this
 * proves both halves instead of inventing a click that cannot happen: the
 * real UI genuinely disables the control, and the same authenticated
 * session's own direct request against the real cancel endpoint still gets a
 * real 409 ORDER_NOT_CANCELABLE from the locked durable row
 * (multi-taxi.service.ts/owned-mobility.service.ts isPassengerCancelable),
 * with the order status and payment left exactly as before.
 */
export async function onTripCancellationRejectionJourney(
  pax: Page,
  ops: Page,
  driver: Page,
  driverBase: string,
  step: JourneyStep,
  info: TestInfo,
) {
  await step("Ops prepare real persisted rehearsal supply", async () => {
    await ops.goto(`${OPS}/review`);
    const preparing = ops.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith("/ops/review-demo/prepare") &&
        r.request().method() === "POST",
    );
    await ops.getByRole("button", { name: "準備虛構演練車司" }).click();
    expect((await preparing).ok()).toBe(true);
  });
  await registerDriver(ops, driver, driverBase, step);

  const paymentMethodId = await step(
    "Passenger binds a real payment method",
    () => bind(pax, "success"),
  );
  const orderId = await step("Passenger books a real order", () =>
    book(pax, paymentMethodId),
  );
  await step("Ops dispatches and assigns the real driver", async () => {
    await createDispatch(ops, orderId);
    await assign(ops);
  });
  await step(
    "Driver accepts, departs and arrives at the real pickup",
    async () => {
      await readAssignedTripAndAccept(driver, driverBase, orderId, step);
      for (const [label, action] of [
        ["前往接送點", "depart"],
        ["抵達上車點", "arrived_pickup"],
      ] as const) {
        const response = driver.waitForResponse(
          (r) =>
            r.url().endsWith(`/${action}`) && r.request().method() === "POST",
        );
        await driver.getByRole("button", { name: label, exact: true }).click();
        expect((await response).status()).toBeLessThan(300);
      }
    },
  );
  await step(
    "Passenger can still cancel for free before the trip starts",
    async () => {
      const before = await authority(pax, orderId);
      expect(before.order.status).toBe("arrived_pickup");
      expect(before.actions.canCancel).toBe(true);
      await expect(
        pax.getByRole("button", { name: "取消行程", exact: true }).first(),
      ).toBeEnabled();
    },
  );
  await step("Driver starts the real trip", async () => {
    const scheduledAt = Date.parse(
      (await authority(pax, orderId)).order.requestedPickupAt,
    );
    await expect
      .poll(() => Date.now(), { timeout: 180_000, intervals: [1000] })
      .toBeGreaterThanOrEqual(scheduledAt);
    const response = driver.waitForResponse(
      (r) => r.url().endsWith("/start") && r.request().method() === "POST",
    );
    await driver.getByRole("button", { name: "開始行程", exact: true }).click();
    expect((await response).status()).toBeLessThan(300);
    await expect
      .poll(async () => (await authority(pax, orderId)).order.status)
      .toBe("on_trip");
  });
  await step(
    "The real UI disables cancellation once on_trip, and the same session's direct cancel request is really rejected without changing the order",
    async () => {
      await expect
        .poll(async () => (await authority(pax, orderId)).actions.canCancel)
        .toBe(false);
      await pax.reload();
      const cancelButton = pax
        .getByRole("button", { name: "取消行程", exact: true })
        .first();
      await expect(cancelButton).toBeVisible();
      await expect(cancelButton).toBeDisabled();
      const before = await authority(pax, orderId);
      // The Next.js BFF's checkCSRF (app/api/passenger-app/[...path]/route.ts)
      // requires a same-origin Origin header on every non-GET call, which a
      // real browser fetch() sends automatically but page.request does not;
      // set it explicitly rather than relying on an accidental pass.
      const rejected = await pax.request.post(
        `${PAX}/api/passenger-app/rides/${orderId}/cancel`,
        {
          data: { rideId: orderId },
          headers: { "Content-Type": "application/json", Origin: PAX },
        },
      );
      expect(rejected.status()).toBe(409);
      const body = await rejected.json();
      expect(body.error.code).toBe("ORDER_NOT_CANCELABLE");
      const after = await authority(pax, orderId);
      expect(after.order.status).toBe("on_trip");
      expect(after.order.status).toBe(before.order.status);
      expect(after.payment).toBeNull();
      await info.attach("UC05-on-trip-cancel-rejection-facts", {
        body: JSON.stringify({
          orderId,
          beforeStatus: before.order.status,
          afterStatus: after.order.status,
          cancelRejectedHttpStatus: rejected.status(),
          cancelRejectedErrorCode: body.error.code,
          cancelButtonRealUIDisabled: true,
          noOrderStatusOrPaymentChange: true,
          scope:
            "real browser session cookies via page.request against the real cancel endpoint; the UI's own button is disabled once on_trip so a genuine click could not reach the server at all",
        }),
        contentType: "application/json",
      });
    },
  );
  return orderId;
}
