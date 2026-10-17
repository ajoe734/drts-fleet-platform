import { expect, type Page, type TestInfo } from "@playwright/test";
import { recordOrderEvidence } from "./evidence";
import {
  assign,
  authority,
  book,
  camel,
  createDispatch,
  opsRead,
  sharedDev,
} from "./additional-journey";

type Step = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

/** Use the original Driver dialog and existing rejection/redispatch commands.
 * Only the already-declared external rehearsal ports are simulated.
 */
export async function ownedRejectionJourney(
  pax: Page,
  ops: Page,
  driver: Page,
  driverBase: string,
  paymentMethodId: string,
  earlierOrders: string[],
  step: Step,
  info: TestInfo,
) {
  const orderId = await step("G Passenger books a new real order", () =>
    book(pax, paymentMethodId),
  );
  expect(earlierOrders).not.toContain(orderId);
  const first = await step(
    "G Ops dispatches the same order to Driver A",
    async () => {
      await createDispatch(ops, orderId);
      return assign(ops);
    },
  );
  let rejectRequests = 0;
  const observeReject = (request: import("@playwright/test").Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith(
        `/driver/tasks/${first.taskId}/reject`,
      )
    ) {
      rejectRequests++;
    }
  };
  driver.on("request", observeReject);
  await step("G Driver opens the assigned same-order task", async () => {
    await driver.goto(`${driverBase}/jobs`);
    await driver
      .getByRole("button")
      .filter({ has: driver.getByText(first.taskId, { exact: true }) })
      .click();
    await expect(driver).toHaveURL(/\/trip$/);
    await expect(
      driver.getByText(orderId, { exact: false }).first(),
    ).toBeVisible();
  });
  const rejectedTask = await step(
    "G Driver keeps then truly rejects through the original dialog",
    async () => {
      await driver
        .getByRole("button", { name: "婉拒任務", exact: true })
        .click();
      await driver
        .getByRole("button", { name: "保留任務", exact: true })
        .click();
      expect((await authority(pax, orderId)).order.status).toBe("assigned");
      expect(rejectRequests).toBe(0);
      await driver
        .getByRole("button", { name: "婉拒任務", exact: true })
        .click();
      await driver
        .getByPlaceholder("可補充婉拒原因")
        .fill("演練：目前無法承接此任務");
      const [response] = await Promise.all([
        driver.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname.endsWith(
              `/driver/tasks/${first.taskId}/reject`,
            ),
        ),
        driver.getByRole("button", { name: "確認婉拒", exact: true }).click(),
      ]);
      expect(response.status()).toBe(201);
      expect(rejectRequests).toBe(1);
      expect(response.request().postDataJSON()).toMatchObject({
        reasonCode: "driver_rejected",
        reasonNote: "演練：目前無法承接此任務",
      });
      const task = camel(await response.json()).data;
      expect(task).toMatchObject({
        taskId: first.taskId,
        orderId,
        status: "rejected",
      });
      return task;
    },
  );
  await step(
    "G Passenger Ops and Driver read the rejection on one order",
    async () => {
      await expect
        .poll(async () => (await authority(pax, orderId)).order.status)
        .toBe("redispatch_required");
      await opsRead(ops, orderId);
      await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
        "redispatch_required",
      );
      // The authority API can advance before the mounted Passenger SSE view.
      // Wait for the real screen as well, without reloading or mocking events.
      await expect(pax.getByText("正在為您改派", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(pax.getByText("已取消指派", { exact: true })).toBeVisible();
      await expect(
        pax.getByRole("button", { name: "聯絡司機", exact: true }),
      ).toHaveCount(0);
      await expect(
        driver.getByRole("button", { name: "婉拒任務", exact: true }),
      ).toHaveCount(0);
      await expect(driver.getByText(/已拒絕/).first()).toBeVisible();
      const rows = await recordOrderEvidence(
        orderId,
        "G-driver-rejected-same-order",
        { pax, ops, driver },
        info,
      );
      if (!sharedDev) {
        expect(
          rows.some(
            (row) =>
              row.task_id === first.taskId && row.task_status === "rejected",
          ),
        ).toBe(true);
      }
      await info.attach("G-owned-rejection-facts", {
        body: JSON.stringify({
          orderId,
          actualRejectedTask: rejectedTask,
          actualPOSTStatus: 201,
          actualPassengerAndOpsStatus: "redispatch_required",
          actualMountedPassengerRedispatchShown: true,
          actualMountedPassengerOldAssignmentMarkedUnassigned: true,
          originalDriverDialogUsed: true,
          keepTaskDidNotReject: true,
          actualInternalNetworkMocks: false,
        }),
        contentType: "application/json",
      });
    },
  );
  const second = await step(
    "G Ops redispatches the original order to Driver B",
    async () => {
      await opsRead(ops, orderId);
      // A rejected offer already has a dispatch job. The original Ops page
      // disables initial dispatch in that state and exposes redispatch instead.
      const [response] = await Promise.all([
        ops.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname.endsWith(`/orders/${orderId}/redispatch`),
          { timeout: 30_000 },
        ),
        ops
          .getByRole("button", { name: "依原流程重新派遣", exact: true })
          .click({ timeout: 30_000 }),
      ]);
      expect(response.status()).toBeLessThan(300);
      const result = await assign(ops, "pax-review-driver-b");
      expect(result.taskId).not.toBe(first.taskId);
      await expect
        .poll(
          async () =>
            (await authority(pax, orderId)).assignment?.driver.driverId,
        )
        .toBe("pax-review-driver-b");
      await expect(pax.getByText("SIM-1002", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await expect(pax.getByText("正在為您改派", { exact: true })).toHaveCount(
        0,
      );
      return result;
    },
  );
  await step(
    "G Passenger cancels the original order after real redispatch",
    async () => {
      pax.once("dialog", (dialog) => void dialog.accept());
      const [response] = await Promise.all([
        pax.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            new URL(r.url()).pathname.endsWith(`/rides/${orderId}/cancel`),
        ),
        pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first()
          .click(),
      ]);
      expect(response.status()).toBe(201);
      await expect(pax.getByText("行程已取消", { exact: true })).toBeVisible();
      await expect
        .poll(async () => (await authority(pax, orderId)).order.status)
        .toBe("cancelled");
      await opsRead(ops, orderId);
      await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
        "cancelled",
      );
      const ride = await authority(pax, orderId);
      expect(ride.payment).toBeNull();
      expect(ride.rating).toBeNull();
      const rows = await recordOrderEvidence(
        orderId,
        "G-rejected-redispatched-then-cancelled",
        { pax, ops },
        info,
      );
      for (const row of rows) {
        expect(row.order_id).toBe(orderId);
        expect(row.payment_id ?? null).toBeNull();
        expect(row.rating_id ?? null).toBeNull();
      }
      if (!sharedDev) {
        expect(
          rows.some(
            (row) =>
              row.task_id === first.taskId && row.task_status === "rejected",
          ),
        ).toBe(true);
        expect(
          rows.some(
            (row) =>
              row.task_id === second.taskId && row.task_status === "cancelled",
          ),
        ).toBe(true);
      }
      await info.attach("G-same-order-redispatch-and-cancel-facts", {
        body: JSON.stringify({
          orderId,
          rejectedTaskId: first.taskId,
          newDriverTaskId: second.taskId,
          actualNewDriver: "pax-review-driver-b",
          actualMountedPassengerNewPlateShownBeforeCancel: true,
          actualMountedPassengerCancellationShown: true,
          finalOrderStatus: ride.order.status,
          actualCancelPOSTStatus: 201,
          actualInternalNetworkMocks: false,
          noDriverBTripScreenClaimed: true,
        }),
        contentType: "application/json",
      });
    },
  );
  driver.off("request", observeReject);
}
