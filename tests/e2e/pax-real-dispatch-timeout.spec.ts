import { expect, test, type BrowserContext } from "@playwright/test";
import { createJourneyProgress } from "./pax-review-shared-order/progress";
import { recordOrderEvidence } from "./pax-review-shared-order/evidence";
import {
  OPS,
  PAX,
  sharedDev,
  camel,
  authority,
  registerDriver,
  bind,
  book,
  opsRead,
  createDispatch,
  assign,
  readAssignedTripAndAccept,
} from "./pax-review-shared-order/additional-journey";

test("the real reservation acceptance deadline expires automatically, then recovers the original order", async ({
  browser,
}, info) => {
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const contexts: BrowserContext[] = [];
  const role = async (name: "pax" | "ops" | "driver") => {
    const token =
      name === "ops"
        ? process.env.PAX_REVIEW_OPS_ID_TOKEN
        : process.env.PAX_REVIEW_PASSENGER_ID_TOKEN;
    if (sharedDev && !token)
      throw new Error(
        `Missing existing private-service credential for ${name}`,
      );
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
    contexts.push(context);
    const page = await context.newPage();
    page.on("response", (response) =>
      progress.response(
        name,
        response.request().method(),
        response.url(),
        response.status(),
      ),
    );
    return page;
  };
  const pax = await step("Timeout Passenger context", () => role("pax"));
  const ops = await step("Timeout Ops context", () => role("ops"));
  const driver = await step("Timeout Driver context", () => role("driver"));
  const driverBase = `${PAX}/review-driver`;
  const cleanup = new Set<string>();
  let manualTimeoutPOSTs = 0;
  for (const page of [pax, ops, driver])
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname.endsWith("/dispatch-timeout")
      )
        manualTimeoutPOSTs++;
    });
  try {
    await step("Prepare existing real synthetic supply", async () => {
      await ops.goto(`${OPS}/review`);
      const requested = ops.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith("/ops/review-demo/prepare") &&
          r.request().method() === "POST",
      );
      await ops.getByRole("button", { name: "準備虛構演練車司" }).click();
      expect((await requested).ok()).toBe(true);
      await expect(
        ops.getByText("已準備兩組合成車司；未建立訂單、派遣或付款。"),
      ).toBeVisible();
    });
    await registerDriver(ops, driver, driverBase, step);
    await step("Timeout Passenger actual OTP login", async () => {
      await pax.goto(`${PAX}/review`);
      const suffix = (Number(process.env.GITHUB_RUN_ID ?? 1) + 88) % 100;
      await pax
        .getByLabel("演練手機", { exact: true })
        .fill(`09000000${String(suffix).padStart(2, "0")}`);
      await pax.getByRole("checkbox").check();
      const requested = pax.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/passenger-app/review-demo/otp" &&
          r.request().method() === "POST",
      );
      await pax.getByRole("button", { name: "取得模擬簡訊" }).click();
      expect((await requested).ok()).toBe(true);
      await pax.getByRole("button", { name: "驗證並登入演練帳戶" }).click();
      await expect(pax.getByTestId("review-passenger-id")).toBeVisible();
      expect(
        await pax.evaluate(() =>
          localStorage.getItem("drts.passenger.functional-demo.v1"),
        ),
      ).toBeNull();
    });
    const method = await step(
      "Bind external simulated PSP through actual API",
      () => bind(pax, "success"),
    );
    const actualOrders: string[] = [];
    for (const reason of ["acceptance_timeout"] as const) {
      const label = "K";
      const orderId = await step(
        `${label} Passenger books one new real order`,
        async () => {
          const id = await book(pax, method);
          expect(actualOrders).not.toContain(id);
          cleanup.add(id);
          actualOrders.push(id);
          return id;
        },
      );
      const job = await step(
        `${label} Ops creates a real reservation dispatch`,
        async () => {
          await createDispatch(ops, orderId);
          const response = await ops.request.get(
            `${OPS}/control-plane-proxy/dispatch/tasks`,
          );
          expect(response.status()).toBe(200);
          const jobs = camel(await response.json()).data.items.filter(
            (item: { orderId: string }) => item.orderId === orderId,
          );
          expect(jobs).toHaveLength(1);
          expect(jobs[0].status).toBe("reserved");
          return jobs[0];
        },
      );
      let originalTaskId: string | null = null;
      let originalDeadline: string | null = null;
      const armedAt = Date.now();
      if (reason === "acceptance_timeout") {
        const assigned = await step(
          `${label} Driver opens an offer without accepting or rejecting`,
          async () => {
            const assigned = await assign(ops);
            await driver.goto(`${driverBase}/jobs`);
            await driver
              .getByRole("button")
              .filter({
                has: driver.getByText(assigned.taskId, { exact: true }),
              })
              .click();
            await expect(driver).toHaveURL(/\/trip$/);
            await expect(
              driver.getByText(orderId, { exact: false }).first(),
            ).toBeVisible();
            await expect(
              driver
                .getByRole("button", { name: "接受任務", exact: true })
                .first(),
            ).toBeVisible();
            return assigned;
          },
        );
        originalTaskId = assigned.taskId;
        const response = await ops.request.get(
          `${OPS}/control-plane-proxy/driver/tasks/${originalTaskId}`,
        );
        expect(response.status()).toBe(200);
        const task = camel(await response.json()).data;
        expect(task).toMatchObject({
          taskId: originalTaskId,
          orderId,
          status: "pending_acceptance",
        });
        // The order's actual assignment carries the original acceptance deadline.
        const ride = await authority(pax, orderId);
        originalDeadline = ride.assignment?.acceptanceDeadline ?? null;
      }
      const timedOut = await step(
        `${label} Original background scheduler reaches its real deadline`,
        async () => {
          await expect
            .poll(async () => (await authority(pax, orderId)).order.status, {
              timeout: 180_000,
              intervals: [3000],
            })
            .toBe("dispatch_timeout");
          const observedAt = Date.now();
          const elapsedSinceJobMs = observedAt - Date.parse(job.createdAt);
          expect(elapsedSinceJobMs).toBeGreaterThanOrEqual(60_000);
          expect(manualTimeoutPOSTs).toBe(0);
          await expect(
            pax.getByText("派車逾時", { exact: true }).first(),
          ).toBeVisible({ timeout: 15_000 });
          await expect(
            pax
              .getByText(
                "尚未有司機完成接單，請等待調度重新安排車輛，或取消行程。",
                { exact: true },
              )
              .first(),
          ).toBeVisible();
          await expect(pax.getByTestId("review-order-id")).toHaveText(orderId);
          await opsRead(ops, orderId);
          await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
            "dispatch_timeout",
          );
          const response = await ops.request.get(
            `${OPS}/control-plane-proxy/orders/${orderId}`,
          );
          expect(response.status()).toBe(200);
          const order = camel(await response.json()).data;
          expect(order.orderId).toBe(orderId);
          expect(order.dispatchTimeout.timeoutReasonCode).toBe(reason);
          expect(order.dispatchTimeout.dispatchJobId).toBe(job.dispatchJobId);
          if (originalTaskId) {
            const response = await ops.request.get(
              `${OPS}/control-plane-proxy/driver/tasks/${originalTaskId}`,
            );
            expect(response.status()).toBe(200);
            expect(camel(await response.json()).data).toMatchObject({
              taskId: originalTaskId,
              orderId,
              status: "cancelled",
            });
            // Driver uses its existing refresh action to read the expired offer.
            await driver
              .getByRole("button", { name: "重新整理", exact: true })
              .click();
            await expect(
              driver.getByText(orderId, { exact: false }).first(),
            ).toBeVisible();
            await expect(
              driver.getByText(/已取消|平台取消/).first(),
            ).toBeVisible();
            await expect(
              driver.getByRole("button", { name: "接受任務", exact: true }),
            ).toHaveCount(0, { timeout: 15_000 });
          }
          const rows = await recordOrderEvidence(
            orderId,
            `${label}-real-background-timeout`,
            originalTaskId ? { pax, ops, driver } : { pax, ops },
            info,
          );
          if (!sharedDev) {
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
              expect(row.order_id).toBe(orderId);
              expect(row.status).toBe("dispatch_timeout");
              expect(row.dispatch_job_id).toBe(job.dispatchJobId);
              expect(row.task_id).toBe(originalTaskId);
              if (originalTaskId) expect(row.task_status).toBe("cancelled");
            }
          }
          return {
            order,
            observedAt,
            elapsedSinceJobMs,
            elapsedSinceArmedMs: observedAt - armedAt,
          };
        },
      );
      const recovered = await step(
        `${label} Ops redispatches the original UUID and Driver accepts its new task`,
        async () => {
          const [response] = await Promise.all([
            ops.waitForResponse(
              (response) =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname.endsWith(
                  `/orders/${orderId}/redispatch`,
                ),
            ),
            ops
              .getByRole("button", { name: "依原流程重新派遣", exact: true })
              .click(),
          ]);
          expect(response.status()).toBeLessThan(300);
          const recovered = await assign(ops);
          if (originalTaskId) expect(recovered.taskId).not.toBe(originalTaskId);
          await readAssignedTripAndAccept(
            driver,
            driverBase,
            orderId,
            step,
            recovered.taskId,
          );
          expect((await authority(pax, orderId)).order.orderId).toBe(orderId);
          return recovered;
        },
      );
      await step(
        `${label} Passenger cancels the recovered original order and all three roles read it`,
        async () => {
          const dialog = pax.waitForEvent("dialog").then(async (dialog) => {
            expect(dialog.type()).toBe("confirm");
            expect(dialog.message()).toBe("確定要取消這趟行程嗎？");
            await dialog.accept();
          });
          const [response] = await Promise.all([
            pax.waitForResponse(
              (response) =>
                response.request().method() === "POST" &&
                new URL(response.url()).pathname ===
                  `/api/passenger-app/rides/${orderId}/cancel`,
            ),
            dialog,
            pax
              .getByRole("button", { name: "取消行程", exact: true })
              .first()
              .click(),
          ]);
          expect(response.status()).toBe(201);
          expect((await authority(pax, orderId)).order.status).toBe(
            "cancelled",
          );
          cleanup.delete(orderId);
          await opsRead(ops, orderId);
          await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
            "cancelled",
          );
          await driver
            .getByRole("button", { name: "重新整理", exact: true })
            .click();
          await expect(
            driver.getByText(orderId, { exact: false }).first(),
          ).toBeVisible();
          await expect(
            driver.getByText(/已取消|平台取消/).first(),
          ).toBeVisible();
          await expect(
            driver.getByRole("button", { name: "前往接送點", exact: true }),
          ).toHaveCount(0, { timeout: 15_000 });
          const rows = await recordOrderEvidence(
            orderId,
            `${label}-timeout-recovered-cancelled`,
            { pax, ops, driver },
            info,
          );
          expect(rows.length).toBeGreaterThan(0);
          for (const row of rows) {
            expect(row.order_id).toBe(orderId);
            expect(row.payment_id ?? null).toBeNull();
            expect(row.rating_id ?? null).toBeNull();
            if (!sharedDev) {
              expect(row.status).toBe("cancelled");
              if (row.task_id) expect(row.task_status).toBe("cancelled");
            }
          }
          if (!sharedDev) {
            const tasks = rows.map((row) => row.task_id).filter(Boolean);
            expect(new Set(tasks)).toEqual(
              new Set([
                recovered.taskId,
                ...(originalTaskId ? [originalTaskId] : []),
              ]),
            );
            expect(new Set(rows.map((row) => row.dispatch_job_id)).size).toBe(
              2,
            );
          }
        },
      );
      await info.attach(
        `${label}-real-background-timeout-and-same-order-recovery-facts`,
        {
          contentType: "application/json",
          body: JSON.stringify({
            candidateSha: process.env.PAX_DISPATCH_TIMEOUT_SOURCE_SHA,
            orderId,
            reason,
            originalJobId: job.dispatchJobId,
            originalJobCreatedAt: job.createdAt,
            originalTaskId,
            originalDeadline,
            actualTimeoutObservedAtMs: timedOut.observedAt,
            actualElapsedSinceJobMs: timedOut.elapsedSinceJobMs,
            actualElapsedSinceArmedMs: timedOut.elapsedSinceArmedMs,
            actualTimeout: timedOut.order.dispatchTimeout,
            recoveredTaskId: recovered.taskId,
            actualRecoveredOrderCancelled: true,
            actualManualTimeoutPOSTCount: manualTimeoutPOSTs,
            actualOriginalDriverRefreshActionUsed: true,
            matching90secondScenarioClaimed: false,
            actualInternalNetworkMocks: false,
            actualClockAdvanced: false,
            actualBackendTimeoutConfigurationChanged: false,
            externalSMSsupplyQualificationsAndPSPSimulated: true,
          }),
        },
      );
    }
    expect(actualOrders).toHaveLength(1);
    expect(new Set(actualOrders).size).toBe(1);
  } finally {
    for (const orderId of cleanup) {
      const response = await pax.request.post(
        `${PAX}/api/passenger-app/rides/${orderId}/cancel`,
        {
          headers: { Origin: new URL(PAX).origin },
          data: { reason: "dispatch_timeout_acceptance_own_order_cleanup" },
        },
      );
      await info.attach("timeout-own-created-order-cleanup", {
        contentType: "application/json",
        body: JSON.stringify({
          orderId,
          actualCancelHTTPStatus: response.status(),
        }),
      });
    }
    await Promise.all(contexts.map((context) => context.close()));
  }
});
