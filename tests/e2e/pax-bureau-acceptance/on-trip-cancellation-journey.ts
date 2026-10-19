import { expect, type Page, type TestInfo } from "@playwright/test";
import {
  authority,
  camel,
  bind,
  book,
  createDispatch,
  assign,
  registerDriver,
  readAssignedTripAndAccept,
  completeStartedTrip,
  OPS,
  opsRead,
  PAX,
  type JourneyStep,
} from "../pax-review-shared-order/additional-journey";
import { recordOrderEvidence } from "../pax-review-shared-order/evidence";
import { trackInterruptedRehearsal } from "../pax-review-shared-order/interrupted-rehearsal-finalizer";
import { loginPassenger } from "./otp-consent-journey";
import { bureauPhone } from "./review-runtime";
import {
  completedOrderAftercare,
  pendingReceiptJourney,
} from "./receipt-complaint-journey";
import { incompleteDisclosureJourney } from "./supply-disclosure-journey";

async function cancellationSnapshot(
  pax: Page,
  ops: Page,
  orderId: string,
  taskId: string,
) {
  const readOps = async (path: string) => {
    const response = await ops.request.get(
      `${OPS}/control-plane-proxy/${path}`,
    );
    expect(response.status()).toBe(200);
    return camel(await response.json()).data;
  };
  const [ride, order, task, recordResponse] = await Promise.all([
    authority(pax, orderId),
    readOps(`orders/${orderId}`),
    readOps(`driver/tasks/${taskId}`),
    pax.request.get(
      `${PAX}/api/passenger-app/review-demo/rides/${orderId}/record`,
    ),
  ]);
  expect(recordResponse.status()).toBe(200);
  const record = camel(await recordResponse.json()).data;
  expect(order.orderId).toBe(orderId);
  expect(task.orderId).toBe(orderId);
  expect(task.taskId).toBe(taskId);
  expect(task.assignmentId).toBe(ride.assignment.assignmentId);
  // Tracking telemetry may keep arriving. Compare durable business fields,
  // excluding live GPS/ETA, which cancellation must not freeze.
  return {
    order: {
      orderId: order.orderId,
      status: order.status,
      bookingId: order.bookingId,
      runtimeProfileCode: order.runtimeProfileCode,
      serviceProductCode: order.serviceProductCode,
      reservationWindowStart: order.reservationWindowStart,
      reservationWindowEnd: order.reservationWindowEnd,
      benefitReference: order.benefitReference,
    },
    task: {
      taskId: task.taskId,
      orderId: task.orderId,
      dispatchJobId: task.dispatchJobId,
      assignmentId: task.assignmentId,
      driverId: task.driverId,
      vehicleId: task.vehicleId,
      status: task.status,
      acceptedAt: task.acceptedAt,
      departedAt: task.departedAt,
      arrivedPickupAt: task.arrivedPickupAt,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      fare: task.fare,
    },
    assignment: {
      assignmentId: ride.assignment.assignmentId,
      driverId: ride.assignment.driver.driverId,
      vehicleId: ride.assignment.vehicle.vehicleId,
    },
    payment: ride.payment,
    charge: record.charge,
  };
}

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
  previousDriver: Page,
  driver: Page,
  driverBase: string,
  step: JourneyStep,
  info: TestInfo,
) {
  const finalizeInterrupted = trackInterruptedRehearsal(pax, info, PAX);
  let orderId: string | undefined;
  let handled = false;
  try {
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
    await registerDriver(ops, previousDriver, driverBase, step);
    await registerDriver(ops, driver, driverBase, step, "pax-review-driver-b");
    await step("Passenger ordinary OTP login and persisted first consent", () =>
      loginPassenger(pax, bureauPhone("trip")),
    );

    const paymentMethodId = await step(
      "Passenger binds a real payment method",
      () => bind(pax, "success"),
    );
    const bookedOrderId = await step("Passenger books a real order", () =>
      book(pax, paymentMethodId),
    );
    orderId = bookedOrderId;
    const firstAssigned = await step(
      "Ops dispatches and assigns the real driver",
      async () => {
        await createDispatch(ops, bookedOrderId);
        await incompleteDisclosureJourney(pax, ops, bookedOrderId, info);
        return assign(ops);
      },
    );
    await readAssignedTripAndAccept(
      previousDriver,
      driverBase,
      bookedOrderId,
      step,
      firstAssigned.taskId,
    );
    const assigned = await step(
      "UC07 actual reassignment shows Driver B's new task and closes Driver A's old task on the same order",
      async () => {
        const next = await assign(ops, "pax-review-driver-b", true);
        expect(next.taskId).not.toBe(firstAssigned.taskId);
        const oldTaskResponse = await ops.request.get(
          `${OPS}/control-plane-proxy/driver/tasks/${firstAssigned.taskId}`,
        );
        expect(oldTaskResponse.status()).toBe(200);
        expect(camel(await oldTaskResponse.json()).data).toMatchObject({
          taskId: firstAssigned.taskId,
          orderId: bookedOrderId,
          status: "cancelled",
        });
        // The real trip screen loads on mount/manual refresh. Use the same
        // normal refresh action as the original real acceptance-timeout case.
        await previousDriver
          .getByRole("button")
          .filter({ hasText: "重新整理" })
          .first()
          .click({ timeout: 15_000 });
        await expect(
          previousDriver.getByText(bookedOrderId, { exact: false }).first(),
        ).toBeVisible();
        await expect(
          previousDriver.getByText(/已取消|平台取消/).first(),
        ).toBeVisible();
        await expect(
          previousDriver.getByRole("button", {
            name: "接受任務",
            exact: true,
          }),
        ).toHaveCount(0, { timeout: 15_000 });
        for (const label of [
          "前往接送點",
          "抵達上車點",
          "開始行程",
          "完成行程",
        ]) {
          const control = previousDriver.getByRole("button", {
            name: label,
            exact: true,
          });
          if (await control.count()) await expect(control).toBeDisabled();
        }
        await readAssignedTripAndAccept(
          driver,
          driverBase,
          bookedOrderId,
          step,
          next.taskId,
        );
        const ride = await authority(pax, bookedOrderId);
        expect(ride.assignment.driver.driverId).toBe("pax-review-driver-b");
        expect(ride.assignment.vehicle.vehicleId).toBe("pax-review-vehicle-b");
        await expect(pax.getByText("SIM-2001", { exact: true })).toBeVisible();
        await recordOrderEvidence(
          bookedOrderId,
          "UC07-real-Driver-B-same-order",
          { pax, ops, driver, previousDriver },
          info,
        );
        return next;
      },
    );
    const taskId = assigned.taskId as string;
    expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
    await step(
      "Driver accepts, departs and arrives at the real pickup",
      async () => {
        for (const [label, action] of [
          ["前往接送點", "depart"],
          ["抵達上車點", "arrived_pickup"],
        ] as const) {
          const response = driver.waitForResponse(
            (r) =>
              r.url().endsWith(`/${action}`) && r.request().method() === "POST",
          );
          await driver
            .getByRole("button", { name: label, exact: true })
            .click();
          expect((await response).status()).toBeLessThan(300);
        }
      },
    );
    await step(
      "Passenger cancellation remains available before the trip starts",
      async () => {
        const before = await authority(pax, bookedOrderId);
        expect(before.order.status).toBe("arrived_pickup");
        expect(before.actions.canCancel).toBe(true);
        await expect(
          pax.getByRole("button", { name: "取消行程", exact: true }).first(),
        ).toBeEnabled();
      },
    );
    await step("Driver starts the real trip", async () => {
      const scheduledAt = Date.parse(
        (await authority(pax, bookedOrderId)).order.requestedPickupAt,
      );
      await expect
        .poll(() => Date.now(), { timeout: 180_000, intervals: [1000] })
        .toBeGreaterThanOrEqual(scheduledAt);
      const response = driver.waitForResponse(
        (r) => r.url().endsWith("/start") && r.request().method() === "POST",
      );
      await driver
        .getByRole("button", { name: "開始行程", exact: true })
        .click();
      expect((await response).status()).toBeLessThan(300);
      await expect
        .poll(async () => (await authority(pax, bookedOrderId)).order.status)
        .toBe("on_trip");
    });
    await step(
      "The real UI disables cancellation once on_trip, and the same session's direct cancel request is really rejected without changing the order",
      async () => {
        await expect
          .poll(
            async () => (await authority(pax, bookedOrderId)).actions.canCancel,
          )
          .toBe(false);
        await pax.reload();
        const cancelButton = pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first();
        await expect(cancelButton).toBeVisible();
        await expect(cancelButton).toBeDisabled();
        const before = await cancellationSnapshot(
          pax,
          ops,
          bookedOrderId,
          taskId,
        );
        expect(before.order.status).toBe("on_trip");
        expect(before.task.status).toBe("on_trip");
        const beforeRows = await recordOrderEvidence(
          bookedOrderId,
          "UC05-before-refusal",
          { pax, ops, driver },
          info,
        );
        // The Next.js BFF's checkCSRF (app/api/passenger-app/[...path]/route.ts)
        // requires a same-origin Origin header on every non-GET call, which a
        // real browser fetch() sends automatically but page.request does not;
        // set it explicitly rather than relying on an accidental pass.
        const rejected = await pax.request.post(
          `${PAX}/api/passenger-app/rides/${bookedOrderId}/cancel`,
          {
            data: { rideId: bookedOrderId },
            headers: {
              "Content-Type": "application/json",
              Origin: PAX,
              "x-request-id": crypto.randomUUID(),
            },
          },
        );
        expect(rejected.status()).toBe(409);
        const body = await rejected.json();
        expect(body.error.code).toBe("ORDER_NOT_CANCELABLE");
        const after = await cancellationSnapshot(
          pax,
          ops,
          bookedOrderId,
          taskId,
        );
        expect(after.order.status).toBe("on_trip");
        expect(after).toEqual(before);
        const afterRows = await recordOrderEvidence(
          bookedOrderId,
          "UC05-after-refusal",
          { pax, ops, driver },
          info,
        );
        expect(afterRows).toEqual(beforeRows);
        await info.attach("UC05-on-trip-cancel-rejection-facts", {
          body: JSON.stringify({
            orderId: bookedOrderId,
            taskId,
            beforeStatus: before.order.status,
            afterStatus: after.order.status,
            cancelRejectedHttpStatus: rejected.status(),
            cancelRejectedErrorCode: body.error.code,
            cancelButtonRealUIDisabled: true,
            before,
            after,
            noOrderTaskAssignmentOrPaymentChange: true,
            scope:
              "real browser session cookies via page.request against the real cancel endpoint; the UI's own button is disabled once on_trip so a genuine click could not reach the server at all",
          }),
          contentType: "application/json",
        });
      },
    );
    await pendingReceiptJourney(pax, bookedOrderId, step, info);
    await step(
      "UC10 all three roles lose real browser network access for sixty-five seconds, then recover the original active task without a replacement order",
      async () => {
        const before = await cancellationSnapshot(
          pax,
          ops,
          bookedOrderId,
          taskId,
        );
        const pages = [pax, ops, previousDriver, driver];
        const startedAt = Date.now();
        const failures: { role: string; networkRejected: boolean }[] = [];
        try {
          await Promise.all(
            pages.map((page) => page.context().setOffline(true)),
          );
          for (const [role, page, url] of [
            ["pax", pax, `${PAX}/api/passenger-app/rides/${bookedOrderId}`],
            ["ops", ops, `${OPS}/control-plane-proxy/orders/${bookedOrderId}`],
            ["driver", driver, driver.url()],
          ] as const) {
            const rejected = await page.evaluate(async (target) => {
              try {
                await fetch(target, { cache: "no-store" });
                return false;
              } catch (reason) {
                return reason instanceof TypeError;
              }
            }, url);
            expect(rejected).toBe(true);
            failures.push({ role, networkRejected: rejected });
          }
          // A genuine outage longer than the existing sixty-second offer window;
          // this task is already on_trip, so no offer deadline is modified.
          await pax.waitForTimeout(65_000);
          await info.attach("UC10-all-roles-offline-UI", {
            body: await pax.screenshot({ fullPage: true }),
            contentType: "image/png",
          });
        } finally {
          await Promise.all(
            pages.map((page) => page.context().setOffline(false)),
          );
        }
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(65_000);
        await pax.reload();
        await ops.reload();
        await opsRead(ops, bookedOrderId);
        await expect(
          pax.getByRole("button", { name: "取消行程", exact: true }).first(),
        ).toBeDisabled();
        await expect(
          driver.getByText(bookedOrderId, { exact: false }).first(),
        ).toBeVisible();
        await expect(
          driver.getByRole("button", { name: "完成行程", exact: true }),
        ).toBeVisible();
        const after = await cancellationSnapshot(
          pax,
          ops,
          bookedOrderId,
          taskId,
        );
        expect(after).toEqual(before);
        await recordOrderEvidence(
          bookedOrderId,
          "UC10-all-roles-recovered-original-task",
          { pax, ops, driver, previousDriver },
          info,
        );
        await info.attach("UC10-all-roles-offline-recovery-facts", {
          body: JSON.stringify({
            orderId: bookedOrderId,
            taskId,
            failures,
            elapsedMs: Date.now() - startedAt,
            sameOrderTaskAssignmentPaymentAndCharge: true,
            internalServicesMocked: false,
            limitation:
              "Real browser-context offline/reconnect; not a physical OS kill or an hours-long outage",
          }),
          contentType: "application/json",
        });
      },
    );
    await step("Driver completes this test's own started trip normally", () =>
      completeStartedTrip(driver, pax, bookedOrderId, ops, step),
    );
    const completed = await cancellationSnapshot(
      pax,
      ops,
      bookedOrderId,
      taskId,
    );
    expect(completed.order.status).toBe("completed");
    expect(completed.task.status).toBe("completed");
    handled = true;
    await recordOrderEvidence(
      bookedOrderId,
      "UC05-normal-completion",
      { pax, ops, driver },
      info,
    );
    await completedOrderAftercare(pax, ops, bookedOrderId, step, info);
    return bookedOrderId;
  } finally {
    if (!handled) await finalizeInterrupted();
    await info.attach("UC05-own-order-disposition", {
      body: JSON.stringify({
        orderId: orderId ?? null,
        completedNormally: handled,
        forcedCancellation: false,
        note: handled
          ? "Normal Driver completion after rejection evidence"
          : "Original recovery records only this test's orders; on_trip/proof_pending remain preserved for normal handling",
      }),
      contentType: "application/json",
    });
  }
}
