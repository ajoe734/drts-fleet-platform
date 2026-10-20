import { expect, test, type BrowserContext } from "@playwright/test";
import { createJourneyProgress } from "../pax-review-shared-order/progress";
import { createDispatchInOrdinaryWorkspace } from "../pax-review-shared-order/ordinary-ops-dispatch";
import {
  assign,
  camel,
  OPS,
  opsRead,
  readAssignedTripAndAccept,
  registerDriver,
  sharedDev,
} from "../pax-review-shared-order/additional-journey";
import { roleBrowser } from "./role-browser";
import { bureauPhone, driverOrigin } from "./review-runtime";
import { loginPassenger } from "./otp-consent-journey";

test("the existing ordinary realtime API and Ops workspace observe the unchanged real ninety-second matching deadline and recover the original order", async ({
  browser,
}, info) => {
  test.skip(
    sharedDev && process.env.PAX_BUREAU_MATCHING_TIMEOUT_MS !== "90000",
    "The live shared matching deadline was not verified as 90000ms. Passenger scheduled60 is not a substitute; no runtime deadline is changed.",
  );
  expect(
    sharedDev
      ? process.env.PAX_BUREAU_MATCHING_TIMEOUT_MS
      : (process.env.DISPATCH_MATCHING_TIMEOUT_MS ?? "90000"),
  ).toBe("90000");
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const contexts: BrowserContext[] = [];
  const pax = await roleBrowser(browser, "pax", contexts, progress);
  const ops = await roleBrowser(browser, "ops", contexts, progress);
  const driver = await roleBrowser(browser, "driver", contexts, progress);
  let orderId: string | undefined;
  let manualTimeoutCalls = 0;
  for (const page of [pax, ops, driver])
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/dispatch-timeout")
      )
        manualTimeoutCalls++;
    });
  const read = async (path: string) => {
    const response = await ops.request.get(
      `${OPS}/control-plane-proxy/${path}`,
    );
    expect(response.status()).toBe(200);
    return camel(await response.json()).data;
  };
  try {
    await ops.goto(`${OPS}/review`);
    const prepared = ops.waitForResponse(
      (r) =>
        r.url().endsWith("/ops/review-demo/prepare") &&
        r.request().method() === "POST",
    );
    await ops
      .getByRole("button", { name: "準備虛構演練車司", exact: true })
      .click();
    expect((await prepared).status()).toBe(201);
    await registerDriver(ops, driver, driverOrigin(), step);
    const phone = bureauPhone("matching");
    const passengerId = await loginPassenger(pax, phone);
    const id = await step(
      "UC06 use the existing ordinary realtime API, without adding an instant Passenger product",
      async () => {
        const response = await ops.request.post(
          `${OPS}/control-plane-proxy/orders`,
          {
            headers: { Origin: OPS, "idempotency-key": crypto.randomUUID() },
            data: {
              pickup: { address: "合成板橋車站", lat: 25.0142, lng: 121.4636 },
              dropoff: {
                address: "合成新北市政府",
                lat: 25.012,
                lng: 121.4654,
              },
              passenger: { passengerId, name: "合成媒合旅程乘客", phone },
            },
          },
        );
        expect(response.status()).toBe(201);
        const order = camel(await response.json()).data;
        expect(order.dispatchSemantics).toBe("realtime");
        expect(order.serviceBucket).toBe("standard_taxi");
        return order.orderId as string;
      },
    );
    orderId = id;
    await createDispatchInOrdinaryWorkspace(ops, OPS, id, info);
    const original = (await read("dispatch/tasks")).items.filter(
      (job: { orderId: string }) => job.orderId === id,
    );
    expect(original).toHaveLength(1);
    expect(original[0].status).toBe("matching");
    const createdAt = Date.parse(original[0].createdAt);
    expect(Number.isFinite(createdAt)).toBe(true);
    await step(
      "UC06 no assignment is made; the real background sweep alone observes ninety seconds",
      async () => {
        await expect
          .poll(async () => (await read(`orders/${id}`)).status, {
            timeout: 120_000,
            intervals: [1000],
          })
          .toBe("dispatch_timeout");
        const elapsedMs = Date.now() - createdAt;
        expect(elapsedMs).toBeGreaterThanOrEqual(90_000);
        const timedOut = await read(`orders/${id}`);
        expect(timedOut.dispatchTimeout.timeoutReasonCode).toBe(
          "matching_timeout",
        );
        expect(manualTimeoutCalls).toBe(0);
        await ops.reload();
        await info.attach("UC06-real90-matching-facts", {
          body: JSON.stringify({
            orderId: id,
            dispatchJobId: original[0].dispatchJobId,
            createdAt: original[0].createdAt,
            observedAt: new Date().toISOString(),
            elapsedMs,
            timeoutReason: timedOut.dispatchTimeout.timeoutReasonCode,
            manualTimeoutCalls,
            scope:
              "Existing ordinary realtime API intake, original Ops UI dispatch, production background sweep; not an instant option in scheduled Passenger UI",
          }),
          contentType: "application/json",
        });
        await info.attach("UC06-real90-Ops", {
          body: await ops.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      },
    );
    await step(
      "UC06 original Ops redispatch and Driver acceptance recover that same UUID",
      async () => {
        await ops.goto(`${OPS}/review`);
        await opsRead(ops, id);
        const retry = ops.waitForResponse(
          (r) =>
            r.url().endsWith(`/orders/${id}/redispatch`) &&
            r.request().method() === "POST",
        );
        await ops
          .getByRole("button", { name: "依原流程重新派遣", exact: true })
          .click();
        expect((await retry).ok()).toBe(true);
        const assigned = await assign(ops);
        await readAssignedTripAndAccept(
          driver,
          driverOrigin(),
          id,
          step,
          assigned.taskId,
        );
        expect(await read(`orders/${id}`)).toMatchObject({
          orderId: id,
          status: "driver_accepted",
        });
        const task = await read(`driver/tasks/${assigned.taskId}`);
        expect(task).toMatchObject({ orderId: id, status: "accepted" });
        await info.attach("UC06-same-ordinary-order-recovered", {
          body: JSON.stringify({
            orderId: id,
            oldDispatchJobId: original[0].dispatchJobId,
            newDispatchJobId: task.dispatchJobId,
            newTaskId: task.taskId,
            internalNetworkMocks: false,
          }),
          contentType: "application/json",
        });
      },
    );
  } finally {
    try {
      if (orderId) {
        const before = await read(`orders/${orderId}`);
        const response = await ops.request.post(
          `${OPS}/control-plane-proxy/passenger/orders/${orderId}/cancel`,
          {
            headers: { Origin: OPS },
            data: { reason: "bureau_ordinary_matching_own_order_cleanup" },
          },
        );
        expect(response.status()).toBe(201);
        expect((await read(`orders/${orderId}`)).status).toBe("cancelled");
        await info.attach("UC06-own-ordinary-order-disposition", {
          body: JSON.stringify({
            orderId,
            beforeStatus: before.status,
            afterStatus: "cancelled",
            normalPreTripPolicy: true,
            forcedCancellation: false,
          }),
          contentType: "application/json",
        });
      }
    } finally {
      for (const context of contexts) await context.close();
    }
  }
});
