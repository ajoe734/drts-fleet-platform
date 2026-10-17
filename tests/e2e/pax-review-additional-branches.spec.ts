import { expect, test, type BrowserContext } from "@playwright/test";
import { createJourneyProgress } from "./pax-review-shared-order/progress";
import { trackInterruptedRehearsal } from "./pax-review-shared-order/interrupted-rehearsal-finalizer";
import { recordOrderEvidence } from "./pax-review-shared-order/evidence";
import { standardAddressJourney } from "./pax-review-shared-order/standard-address-journey";
import { ownedRejectionJourney } from "./pax-review-shared-order/owned-rejection-journey";
import { arrivedCancellationJourney } from "./pax-review-shared-order/arrived-cancellation-journey";
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
  readCompletedByOps,
  createDispatch,
  assign,
  readAssignedTripAndAccept,
  finish,
  assertCompletedFacts,
} from "./pax-review-shared-order/additional-journey";

test("additional real orders cover booking prerequisites, contact fallback, accepted and arrived cancellation, rating, standard geolocation and owned Driver rejection", async ({
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
  const pax = await step("Additional Passenger context", () => role("pax"));
  const ops = await step("Additional Ops context", () => role("ops"));
  const driver = await step("Additional Driver context", () => role("driver"));
  const driverBase = `${PAX}/review-driver`;
  const finalizeInterruptedOrders = trackInterruptedRehearsal(pax, info, PAX);
  let interrupted = false;
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
    await step("Additional Passenger actual OTP login", async () => {
      await pax.goto(`${PAX}/review`);
      const suffix = (Number(process.env.GITHUB_RUN_ID ?? 1) + 50) % 100;
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
    const cancelled = await step(
      "D actual form rejects past time and unchecked fees, then books",
      () => book(pax, method, false, true),
    );
    await info.attach("D-prebooking-prerequisites-facts", {
      body: JSON.stringify({
        orderId: cancelled,
        actualPastTimeMessageObserved: true,
        quoteRequestCountWhilePast: 0,
        confirmationDisabledWhileFeesUnchecked: true,
        scope:
          "original form and native checkbox before a real successful booking",
      }),
      contentType: "application/json",
    });
    const cancelledAssignment = await step(
      "D real dispatch and assignment",
      async () => {
        await createDispatch(ops, cancelled);
        return assign(ops);
      },
    );
    await readAssignedTripAndAccept(
      driver,
      driverBase,
      cancelled,
      step,
      cancelledAssignment.taskId,
    );
    await step(
      "D real account contact reports absent external provider and offers support",
      async () => {
        await expect
          .poll(async () => (await authority(pax, cancelled)).order.status)
          .toBe("driver_accepted");
        await expect(
          pax.getByText("司機已接受行程", { exact: true }),
        ).toBeVisible({ timeout: 10_000 });
        const [response] = await Promise.all([
          pax.waitForResponse(
            (r) =>
              new URL(r.url()).pathname.endsWith(
                `/passenger-app/rides/${cancelled}/contact`,
              ) && r.request().method() === "POST",
          ),
          pax.getByRole("button", { name: "聯絡司機", exact: true }).click(),
        ]);
        expect(response.status()).toBe(201);
        const option = camel(await response.json()).data;
        expect(["unavailable", "support_fallback"]).toContain(option.mode);
        expect(option.unavailableReason).toBe(
          "masked_call_provider_not_configured",
        );
        await expect(
          pax.getByText("目前無法直接聯絡司機", { exact: true }),
        ).toBeVisible();
        await expect(
          pax.getByRole("link", { name: "聯絡客服", exact: true }),
        ).toHaveAttribute("href", option.contactUri || "tel:02-2944-0985");
        await expect(
          pax.getByRole("button", { name: "重試聯絡司機", exact: true }),
        ).toBeEnabled();
        await expect(pax).toHaveURL(new RegExp(`/rides/${cancelled}$`));
        await expect(pax.getByTestId("review-order-id")).toHaveText(cancelled);
        expect((await authority(pax, cancelled)).order.status).toBe(
          "driver_accepted",
        );
        await info.attach("D-account-contact-fallback-facts", {
          body: JSON.stringify({
            orderId: cancelled,
            actualContactPOSTStatus: response.status(),
            actualContactOption: option,
            actualSupportLinkShown: true,
            actualInternalNetworkMocks: false,
            externalPhoneDialled: false,
            sameOrderStatusAfterContact: "driver_accepted",
            actualMountedPassengerDriverAcceptanceShown: true,
          }),
          contentType: "application/json",
        });
        await info.attach("D-account-contact-fallback-pax", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
      },
    );
    await step(
      "D original Passenger cancellation after Driver acceptance",
      async () => {
        await expect
          .poll(async () => (await authority(pax, cancelled)).order.status)
          .toBe("driver_accepted");
        pax.once("dialog", (dialog) => void dialog.accept());
        const [response] = await Promise.all([
          pax.waitForResponse(
            (r) =>
              new URL(r.url()).pathname.endsWith(
                `/rides/${cancelled}/cancel`,
              ) && r.request().method() === "POST",
          ),
          pax
            .getByRole("button", { name: "取消行程", exact: true })
            .first()
            .click(),
        ]);
        expect(response.status()).toBeLessThan(300);
        await expect
          .poll(async () => (await authority(pax, cancelled)).order.status)
          .toBe("cancelled");
        await expect(
          pax.getByText("此行程已取消", { exact: false }).first(),
        ).toBeVisible();
        await opsRead(ops, cancelled);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          "cancelled",
        );
        await driver.reload();
        await expect(
          driver.getByText(cancelled, { exact: false }).first(),
        ).toBeVisible();
        await expect(driver.getByText(/已取消|平台取消/).first()).toBeVisible();
        for (const name of ["接受任務", "開始行程", "完成行程"]) {
          for (const button of await driver
            .getByRole("button", { name, exact: true })
            .all())
            await expect(button).toBeDisabled();
        }
        const rows = await recordOrderEvidence(
          cancelled,
          "D-accepted-then-cancelled",
          { pax, ops, driver },
          info,
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.order_id).toBe(cancelled);
          expect(row.payment_id ?? null).toBeNull();
          expect(row.rating_id ?? null).toBeNull();
          if (!sharedDev) {
            expect(row.status).toBe("cancelled");
            expect(row.task_status).toBe("cancelled");
          }
        }
      },
    );
    const arrivalCancelled = await arrivedCancellationJourney(
      pax,
      ops,
      driver,
      driverBase,
      method,
      cancelled,
      step,
      info,
    );
    const completed = await step(
      "E actual Passenger books a different order",
      () => book(pax, method),
    );
    expect(new Set([cancelled, arrivalCancelled.orderId, completed]).size).toBe(
      3,
    );
    const completedAssignment = await step(
      "E real dispatch and assignment",
      async () => {
        await createDispatch(ops, completed);
        const assignment = await assign(ops);
        const view = await authority(pax, completed);
        expect(view.assignment.driver.driverId).toBe(arrivalCancelled.driverId);
        expect(view.assignment.vehicle.vehicleId).toBe(
          arrivalCancelled.vehicleId,
        );
        expect(assignment.taskId).not.toBe(arrivalCancelled.taskId);
        expect(
          (await authority(pax, arrivalCancelled.orderId)).order.status,
        ).toBe("cancelled");
        await info.attach("H-cancelled-supply-reused-in-E-facts", {
          body: JSON.stringify({
            cancelledOrderId: arrivalCancelled.orderId,
            cancelledDriverTaskId: arrivalCancelled.taskId,
            nextOrderId: completed,
            newDriverTaskId: assignment.taskId,
            actualNextAssignment: view.assignment,
            actualSameDriverAndVehicleAssignedAfterArrivalCancellation: true,
            actualSupplyPreparedAgain: false,
            actualInternalNetworkMocks: false,
          }),
          contentType: "application/json",
        });
        return assignment;
      },
    );
    await finish(
      driver,
      driverBase,
      pax,
      completed,
      ops,
      step,
      false,
      completedAssignment.taskId,
    );
    await step(
      "E low rating with actual contact checkbox unchecked",
      async () => {
        await readCompletedByOps(ops, completed);
        await expect
          .poll(async () => (await authority(pax, completed)).payment?.status)
          .toBe("captured");
        await pax.getByRole("button", { name: "2 星", exact: true }).click();
        await pax
          .getByRole("checkbox", { name: "需要客服與您聯繫嗎？" })
          .uncheck();
        const [response] = await Promise.all([
          pax.waitForResponse(
            (r) =>
              new URL(r.url()).pathname.endsWith(
                `/rides/${completed}/ratings`,
              ) && r.request().method() === "POST",
          ),
          pax.getByRole("button", { name: "送出評價", exact: true }).click(),
        ]);
        expect(response.status()).toBeLessThan(300);
        await expect
          .poll(async () => (await authority(pax, completed)).rating?.score)
          .toBe(2);
        const rows = await recordOrderEvidence(
          completed,
          "E-low-rating-no-contact",
          { pax, ops, driver },
          info,
        );
        assertCompletedFacts(rows, completed);
        for (const row of rows) {
          expect(row.payment_status).toBe("captured");
          expect(row.rating_id).toBeTruthy();
          expect(row.score).toBe(2);
          expect(row.contact_requested).toBe(false);
          expect(row.complaint_case_no).toBeNull();
        }
        const read = await ops.request.get(
          `${OPS}/control-plane-proxy/complaints`,
        );
        expect(read.status()).toBe(200);
        const cases = camel(await read.json()).data.items.filter(
          (item: { relatedOrderId: string }) =>
            item.relatedOrderId === completed,
        );
        expect(cases).toHaveLength(0);
        await info.attach("E-no-contact-no-case-facts", {
          body: JSON.stringify({
            orderId: completed,
            contactRequested: false,
            actualRelatedCaseCount: cases.length,
            actualOpsAPIRead: true,
          }),
          contentType: "application/json",
        });
      },
    );
    await step(
      "E reload hides rating entry and real change request preserves the original rating",
      async () => {
        const before = (await authority(pax, completed)).rating;
        expect(before.score).toBe(2);
        await pax.reload();
        expect((await authority(pax, completed)).actions.canRate).toBe(false);
        await expect(
          pax.getByRole("button", { name: "送出評價", exact: true }),
        ).toHaveCount(0);
        const duplicate = await pax.request.post(
          `${PAX}/api/passenger-app/rides/${completed}/ratings`,
          {
            headers: { Origin: PAX },
            data: {
              rideId: completed,
              rating: 1,
              tags: [],
              comments: "演練：再次改分應保留原始評價",
              contactRequested: true,
            },
          },
        );
        expect(duplicate.status()).toBe(409);
        expect((await duplicate.json()).error.code).toBe(
          "PASSENGER_RATING_ALREADY_SUBMITTED",
        );
        const after = (await authority(pax, completed)).rating;
        expect(after).toEqual(before);
        const rows = await recordOrderEvidence(
          completed,
          "E-original-rating-after-change-refusal",
          { pax, ops, driver },
          info,
        );
        expect(new Set(rows.map((row) => row.rating_id)).size).toBe(1);
        for (const row of rows) {
          expect(row.score).toBe(2);
          expect(row.contact_requested).toBe(false);
          expect(row.complaint_case_no).toBeNull();
        }
      },
    );
    const standardCancelled = await standardAddressJourney(
      pax,
      ops,
      method,
      [cancelled, arrivalCancelled.orderId, completed],
      step,
      info,
    );
    await ownedRejectionJourney(
      pax,
      ops,
      driver,
      driverBase,
      method,
      [cancelled, arrivalCancelled.orderId, completed, standardCancelled],
      step,
      info,
    );
  } catch (error) {
    interrupted = true;
    throw error;
  } finally {
    if (interrupted)
      await finalizeInterruptedOrders().catch(() =>
        info
          .attach("interrupted-rehearsal-finalization-unavailable", {
            body: "Original journey remains failed; the original owner finalization could not finish.",
            contentType: "text/plain",
          })
          .catch(() => undefined),
      );
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
