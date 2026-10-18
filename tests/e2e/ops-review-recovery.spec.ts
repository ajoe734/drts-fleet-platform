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

test("Ops recovers after a real declined assignment and keeps the original backend order", async ({
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
  const pax = await step("Recovery Passenger context", () => role("pax"));
  const ops = await step("Recovery Ops context", () => role("ops"));
  const driver = await step("Recovery Driver context", () => role("driver"));
  const driverBase = `${PAX}/review-driver`;
  const cleanup = new Set<string>();
  let supplyPaused = false;
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
    await step("Recovery Passenger actual OTP login", async () => {
      await pax.goto(`${PAX}/review`);
      const suffix = (Number(process.env.GITHUB_RUN_ID ?? 1) + 89) % 100;
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
    const orderId = await step(
      "L Passenger books one new real order",
      async () => {
        const id = await book(pax, method);
        cleanup.add(id);
        return id;
      },
    );
    const jobId = await step(
      "L Ops creates the original dispatch and reads actual candidates",
      async () => {
        await createDispatch(ops, orderId);
        await expect(
          ops.getByRole("button", {
            name: "指派 pax-review-driver-a",
            exact: true,
          }),
        ).toBeVisible();
        return (await ops
          .getByTestId("ops-review-job-id")
          .textContent())!.trim();
      },
    );
    const before = await authority(pax, orderId);
    expect(before.assignment).toBeNull();
    await step(
      "L Ops pauses the real synthetic supply after candidate rendering",
      async () => {
        await ops
          .getByRole("button", { name: "暫停演練供給", exact: true })
          .click();
        await expect(
          ops.getByText("演練供給已離線；新派遣走真正無車流程。", {
            exact: true,
          }),
        ).toBeVisible();
        supplyPaused = true;
      },
    );
    const declined = await step(
      "L the original stale candidate is refused by the real backend without creating a task",
      async () => {
        const [response] = await Promise.all([
          ops.waitForResponse(
            (r) =>
              r.request().method() === "POST" &&
              new URL(r.url()).pathname.endsWith("/dispatch/assign"),
          ),
          ops
            .getByRole("button", {
              name: "指派 pax-review-driver-a",
              exact: true,
            })
            .click(),
        ]);
        const reply = camel(await response.json());
        expect([
          { status: 409, code: "ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT" },
          { status: 400, code: "DRIVER_NOT_AVAILABLE" },
        ]).toContainEqual({
          status: response.status(),
          code: reply.error?.code,
        });
        expect(reply.error.retryable).toBe(false);
        expect(reply.error.traceId).toEqual(expect.any(String));
        await expect(
          ops.getByText(/API error (400|409):/).first(),
        ).toBeVisible();
        const current = await authority(pax, orderId);
        expect(current.order.orderId).toBe(orderId);
        expect(current.order.status).toBe(before.order.status);
        expect(current.assignment).toBeNull();
        const rows = await recordOrderEvidence(
          orderId,
          "L-real-declined-assignment",
          { pax, ops },
          info,
        );
        if (!sharedDev) {
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            order_id: orderId,
            status: before.order.status,
            dispatch_job_id: jobId,
            assignment_id: null,
            task_id: null,
          });
        }
        return {
          actualHTTPStatus: response.status(),
          actualPublicCode: reply.error.code as string,
        };
      },
    );
    await step(
      "L Ops restores supply through its original action after the acknowledged refusal",
      async () => {
        await ops
          .getByRole("button", { name: "恢復演練供給", exact: true })
          .click();
        await expect(
          ops.getByText("演練供給已恢復；請依原流程重新派遣。", {
            exact: true,
          }),
        ).toBeVisible();
        supplyPaused = false;
        await opsRead(ops, orderId);
        await expect(ops.getByTestId("ops-review-job-id")).toHaveText(jobId);
      },
    );
    const assigned = await step(
      "L Ops assigns the original dispatch after correcting supply",
      () => assign(ops),
    );
    await readAssignedTripAndAccept(
      driver,
      driverBase,
      orderId,
      step,
      assigned.taskId,
    );
    await step(
      "L Passenger cancels the recovered original order and all three roles read it",
      async () => {
        const dialog = pax.waitForEvent("dialog").then(async (d) => {
          expect(d.type()).toBe("confirm");
          await d.accept();
        });
        const [response] = await Promise.all([
          pax.waitForResponse(
            (r) =>
              r.request().method() === "POST" &&
              new URL(r.url()).pathname ===
                `/api/passenger-app/rides/${orderId}/cancel`,
          ),
          dialog,
          pax
            .getByRole("button", { name: "取消行程", exact: true })
            .first()
            .click(),
        ]);
        expect(response.status()).toBe(201);
        expect((await authority(pax, orderId)).order.status).toBe("cancelled");
        cleanup.delete(orderId);
        await opsRead(ops, orderId);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          "cancelled",
        );
        await driver
          .getByRole("button")
          .filter({ hasText: "重新整理" })
          .first()
          .click();
        await expect(
          driver.getByText(orderId, { exact: false }).first(),
        ).toBeVisible();
        await expect(driver.getByText(/已取消|平台取消/).first()).toBeVisible();
        const rows = await recordOrderEvidence(
          orderId,
          "L-refusal-corrected-then-cancelled",
          { pax, ops, driver },
          info,
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.order_id).toBe(orderId);
          expect(row.payment_id ?? null).toBeNull();
          expect(row.rating_id ?? null).toBeNull();
          if (!sharedDev)
            expect(row).toMatchObject({
              status: "cancelled",
              task_id: assigned.taskId,
              task_status: "cancelled",
              dispatch_job_id: jobId,
            });
        }
      },
    );
    await info.attach("L-real-declined-command-and-same-order-recovery-facts", {
      contentType: "application/json",
      body: JSON.stringify({
        candidateSha: process.env.OPS_REVIEW_RECOVERY_SOURCE_SHA,
        orderId,
        originalJobId: jobId,
        taskId: assigned.taskId,
        ...declined,
        actualBackendDeclinedBeforeAssignment: true,
        actualOriginalOpsSupplyRestoreActionUsed: true,
        actualSameDispatchReused: true,
        actualOriginalOrderCancelled: true,
        actualInternalNetworkMocks: false,
        actualClockAdvanced: false,
        externalSMSQualificationsGPSAndPSPSimulated: true,
        actualFormalPGJoinsChecked: !sharedDev,
      }),
    });
  } finally {
    for (const orderId of cleanup) {
      const response = await pax.request.post(
        `${PAX}/api/passenger-app/rides/${orderId}/cancel`,
        {
          headers: { Origin: new URL(PAX).origin },
          data: { reason: "ops_review_recovery_own_order_cleanup" },
          timeout: 15_000,
        },
      );
      await info.attach("L-own-created-order-cleanup", {
        contentType: "application/json",
        body: JSON.stringify({
          orderId,
          actualCancelHTTPStatus: response.status(),
        }),
      });
    }
    if (supplyPaused) {
      for (const suffix of ["a", "b"]) {
        const response = await ops.request.post(
          `${OPS}/control-plane-proxy/regulatory-registry/drivers/pax-review-driver-${suffix}/work-state`,
          { data: { workState: "available" }, timeout: 15_000 },
        );
        await info.attach("L-own-synthetic-supply-cleanup", {
          contentType: "application/json",
          body: JSON.stringify({
            driverId: `pax-review-driver-${suffix}`,
            actualHTTPStatus: response.status(),
          }),
        });
      }
    }
    await Promise.all(contexts.map((c) => c.close()));
  }
});
