import { expect, type Page, type TestInfo } from "@playwright/test";
import { createJourneyProgress } from "./progress";
import { bookingResponseDiagnostic } from "./booking-diagnostic";
import { dispatchResponseDiagnostic } from "./dispatch-diagnostic";
import { verifyFutureShortLeadRefusal } from "./short-lead-prerequisite";

export type JourneyStep = ReturnType<typeof createJourneyProgress>["step"];
export const sharedDev = process.env.PAX_REVIEW_SHARED_DEV_SMOKE === "true";
export const PAX =
  process.env.PAX_REVIEW_PASSENGER_ORIGIN || "http://localhost:3319";
export const OPS = process.env.PAX_REVIEW_OPS_ORIGIN || "http://127.0.0.1:3202";
export const camel = (value: any): any =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            camel(entry),
          ]),
        )
      : value;

// Reuse the established actual UI sequence without importing or changing its
// 48-stage test registration. These helpers never replace internal APIs/orders.
export async function authority(page: Page, id: string) {
  const response = await page.request.get(
    `${PAX}/api/passenger-app/rides/${id}`,
  );
  expect(response.status()).toBe(200);
  return camel(await response.json()).data.ride;
}

export async function registerDriver(
  ops: Page,
  driver: Page,
  base: string,
  step: JourneyStep,
) {
  const code = await step("Ops invite driver device", async () => {
    await ops
      .getByLabel("演練司機", { exact: true })
      .selectOption("pax-review-driver-a");
    const invitation = ops.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/driver/device/invite") &&
        r.request().method() === "POST",
    );
    await ops.getByRole("button", { name: "發出既有司機裝置註冊碼" }).click();
    const response = await invitation;
    expect(response.status()).toBeLessThan(300);
    const code = camel(await response.json()).data.registrationCode;
    expect(typeof code).toBe("string");
    return code;
  });
  await step("Driver open onboarding", () => driver.goto(`${base}/onboarding`));
  await step("Driver submit registration code", async () => {
    await driver.getByLabel("裝置註冊碼", { exact: true }).fill(code);
    const registration = driver.waitForResponse(
      (r) =>
        r.url().endsWith("/auth/driver/device/register") &&
        r.request().method() === "POST",
    );
    await driver
      .getByRole("button", { name: "註冊此裝置", exact: true })
      .click();
    expect((await registration).status()).toBeLessThan(300);
    await expect(driver.getByLabel("裝置註冊碼", { exact: true })).toHaveCount(
      0,
    );
  });
  await step("Driver open jobs after registration", async () => {
    await driver.getByText("任務", { exact: true }).first().click();
    await expect(driver).toHaveURL(/\/jobs$/);
    await ops.getByRole("button", { name: "隱藏註冊碼" }).click();
  });
}

export async function bind(page: Page, scenario: "success" | "retry_once") {
  await page.goto(`${PAX}/account/payment-methods`);
  await page
    .getByLabel("模擬 PSP 結果", { exact: true })
    .selectOption(scenario);
  await page.getByRole("button", { name: "新增信用卡", exact: true }).click();
  const bound = page.waitForResponse(
    (r) =>
      r.url().endsWith("/payment-methods") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "綁定卡片", exact: true }).click();
  const result = camel(await (await bound).json()).data;
  expect(result.status).toBe("completed");
  return result.method.paymentMethodId as string;
}

export async function book(
  page: Page,
  paymentMethodId: string,
  unpaidRejection = false,
  verifyPrerequisites = false,
  prerequisiteInfo?: TestInfo,
) {
  await page.goto(`${PAX}/`);
  const ack = page.getByRole("button", { name: "我已閱讀並同意", exact: true });
  await expect(page.getByText("建立乘車需求", { exact: true })).toBeVisible();
  // AuthScreen's P5Header renders the title as text. Settings load separately;
  // wait for the actual disclosure or form before deciding whether to agree.
  await expect(
    ack.or(page.getByLabel("示範上車地點", { exact: true })),
  ).toBeVisible();
  if (await ack.isVisible()) await ack.click();
  await page
    .getByLabel("示範上車地點", { exact: true })
    .selectOption("review-banqiao");
  await page
    .getByLabel("示範下車地點", { exact: true })
    .selectOption("review-city-hall");
  // The review runtime explicitly selects the existing one-minute lead
  // configuration. Keep enough real margin for quote/confirmation and wait
  // until that scheduled instant before the actual Driver UI starts the trip.
  if (verifyPrerequisites) {
    let quoteRequests = 0;
    const observe = (request: import("@playwright/test").Request) => {
      if (
        new URL(request.url()).pathname === "/api/passenger-app/quotes" &&
        request.method() === "POST"
      )
        quoteRequests++;
    };
    page.on("request", observe);
    try {
      await page
        .getByLabel("預約時間", { exact: true })
        .fill("2000-01-01T00:00");
      await page.getByRole("button", { name: "試算車資", exact: true }).click();
      await expect(
        page.getByText("預約時間不符合最短前置時間規定", { exact: true }),
      ).toBeVisible();
      expect(quoteRequests).toBe(0);
    } finally {
      page.off("request", observe);
    }
    await verifyFutureShortLeadRefusal(page, prerequisiteInfo);
  }
  const localTime = await page.evaluate(() => {
    const date = new Date(Math.ceil((Date.now() + 120_000) / 60_000) * 60_000);
    const pad = (v: number) => String(v).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await page.getByLabel("預約時間", { exact: true }).fill(localTime);
  await page.getByRole("button", { name: "試算車資", exact: true }).click();
  await expect(page.getByText(/NT\$ (85|105)/).first()).toBeVisible();
  // The existing confirmation sheet owns payment selection. Require the
  // newly bound method itself; selecting another card would change B's PSP case.
  const choice = page.locator(`input[value="${paymentMethodId}"]`);
  await expect(choice).toBeVisible();
  await choice.check();
  if (verifyPrerequisites) {
    await expect(
      page.getByRole("checkbox", { name: "我已確認費用與優惠說明" }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "確認叫車", exact: true }),
    ).toBeDisabled();
  }
  await page.getByRole("checkbox", { name: "我已確認費用與優惠說明" }).check();
  const created = page.waitForResponse(
    (r) =>
      r.url().endsWith("/passenger-app/rides") &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "確認叫車", exact: true }).click();
  const response = await created;
  if (unpaidRejection) {
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("pending_payment_block");
    await expect(
      page.getByText("您有一筆行程扣款失敗，請結清後再繼續叫車。").first(),
    ).toBeVisible();
    return "";
  }
  expect(
    response.status(),
    await bookingResponseDiagnostic(response),
  ).toBeLessThan(300);
  const id = camel(await response.json()).data.ride.order.orderId as string;
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(new RegExp(`/rides/${id}$`));
  await expect(page.getByTestId("review-order-id")).toHaveText(id);
  return id;
}

export async function opsRead(ops: Page, orderId: string) {
  await ops.getByLabel("訂單 UUID", { exact: true }).fill(orderId);
  await ops.getByRole("button", { name: "讀回同單", exact: true }).click();
  await expect(ops.getByTestId("ops-review-order-id")).toHaveText(orderId);
}

export async function readCompletedByOps(ops: Page, orderId: string) {
  await opsRead(ops, orderId);
  await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
    "completed",
  );
  const response = await ops.request.get(
    `${OPS}/control-plane-proxy/orders/${orderId}`,
  );
  expect(response.status()).toBe(200);
  expect(camel(await response.json()).data).toMatchObject({
    orderId,
    status: "completed",
  });
}

export async function createDispatch(ops: Page, orderId: string) {
  await opsRead(ops, orderId);
  const job = ops.waitForResponse(
    (r) =>
      r.url().endsWith(`/orders/${orderId}/dispatch`) &&
      r.request().method() === "POST",
  );
  await ops.getByRole("button", { name: "建立同單派遣", exact: true }).click();
  expect((await job).status()).toBeLessThan(300);
  await expect(ops.getByTestId("ops-review-job-id")).toBeVisible();
}

export async function assign(
  ops: Page,
  driverId = "pax-review-driver-a",
  reassign = false,
) {
  const response = ops.waitForResponse(
    (r) =>
      r.url().endsWith(reassign ? "/dispatch/reassign" : "/dispatch/assign") &&
      r.request().method() === "POST",
  );
  await ops
    .getByRole("button", {
      name: `${reassign ? "改派" : "指派"} ${driverId}`,
      exact: true,
    })
    .click();
  const result = await response;
  expect(
    result.status(),
    await dispatchResponseDiagnostic(result, reassign),
  ).toBeLessThan(300);
  return camel(await result.json()).data;
}

export async function readAssignedTripAndAccept(
  driver: Page,
  base: string,
  orderId: string,
  step: JourneyStep,
  taskId?: string,
) {
  // These are ordinary UI operations, each with a finite wait. Keeping their
  // progress separate prevents an absent control or pending navigation from
  // consuming the entire three-order case without identifying the operation.
  await step("Driver navigate to assigned jobs", () =>
    driver.goto(`${base}/jobs`, { timeout: 30_000 }),
  );
  await step("Driver open the assigned task from jobs", async () => {
    if (taskId) {
      await driver
        .getByRole("button")
        .filter({ has: driver.getByText(taskId, { exact: true }) })
        .click({ timeout: 30_000 });
    } else {
      await driver
        .getByText("開啟目前行程", { exact: true })
        .first()
        .click({ timeout: 30_000 });
    }
  });
  await step("Driver verify assigned trip UUID", async () => {
    await expect(driver).toHaveURL(/\/trip$/);
    await expect(
      driver.getByText(orderId, { exact: false }).first(),
    ).toBeVisible();
  });
  await step(
    "Driver submit acceptance and receive authority response",
    async () => {
      // Install the response listener before the click. Consume both promises
      // together so a failed click cannot leave a rejected listener unobserved.
      const [response] = await Promise.all([
        driver.waitForResponse(
          (r) =>
            /\/driver\/tasks\/[^/]+\/accept$/.test(r.url()) &&
            r.request().method() === "POST",
          { timeout: 30_000 },
        ),
        driver
          .getByRole("button", { name: "接受任務", exact: true })
          .first()
          .click({ timeout: 30_000 }),
      ]);
      expect(response.status()).toBeLessThan(300);
    },
  );
}

export async function finish(
  driver: Page,
  base: string,
  pax: Page,
  orderId: string,
  ops: Page,
  step: JourneyStep,
  stale = false,
  taskId?: string,
) {
  await step("Driver read assigned trip and accept", async () => {
    await readAssignedTripAndAccept(driver, base, orderId, step, taskId);
  });
  for (const [label, action] of [
    ["前往接送點", "depart"],
    ["抵達上車點", "arrived_pickup"],
    ["開始行程", "start"],
  ] as const) {
    await step(`Driver ${action}`, async () => {
      if (action === "start") {
        const scheduledAt = Date.parse(
          (await authority(pax, orderId)).order.requestedPickupAt,
        );
        await expect
          .poll(() => Date.now(), { timeout: 180_000, intervals: [1000] })
          .toBeGreaterThanOrEqual(scheduledAt);
      }
      const response = driver.waitForResponse(
        (r) =>
          r.url().endsWith(`/${action}`) && r.request().method() === "POST",
      );
      await driver.getByRole("button", { name: label, exact: true }).click();
      expect((await response).status()).toBeLessThan(300);
    });
  }
  await expect
    .poll(async () => (await authority(pax, orderId)).order.status)
    .toBe("on_trip");
  await completeStartedTrip(driver, pax, orderId, ops, step, stale);
}

/** Continue an already started trip through the same original Driver UI. */
export async function completeStartedTrip(
  driver: Page,
  pax: Page,
  orderId: string,
  ops: Page,
  step: JourneyStep,
  stale = false,
) {
  // The producer takes 8 real-time steps; no direct completion facts or fake
  // tracking authority are injected into either page or API.
  await step("Driver receives live tracked distance", () =>
    expect(driver.getByText(/0\.[2-9]\d km/).first()).toBeVisible({
      timeout: 40_000,
    }),
  );
  if (stale) {
    await step(
      "Driver pause until real GPS freshness expires and resume",
      async () => {
        await driver
          .getByRole("button", { name: "暫停模擬定位", exact: true })
          .click();
        await expect(
          driver.getByText(/已停止；等待真 freshness 過期/),
        ).toBeVisible();
        await expect
          .poll(
            async () => {
              const response = await ops.request.get(
                `${OPS}/control-plane-proxy/driver/tracking-status?driverId=pax-review-driver-a`,
              );
              expect(response.status()).toBe(200);
              return camel(await response.json()).data.locationFreshness;
            },
            { timeout: 105_000, intervals: [5000] },
          )
          .toBe("stale");
        await driver
          .getByRole("button", { name: "恢復模擬定位", exact: true })
          .click();
      },
    );
  }
  // Distance can reach this short route's threshold before twenty seconds.
  // Wait for the same live UI clock used by completion instead of submitting
  // facts that would fail the unchanged persisted-duration assertion below.
  await step(
    "Driver waits for live trip duration above twenty seconds",
    async () => {
      const duration = driver
        .getByText("時長", { exact: true })
        .locator("..")
        .getByText(/^\d{2}:\d{2}:\d{2}$/);
      await expect
        .poll(
          async () => {
            const [hours, minutes, seconds] = (
              await duration.innerText()
            ).split(":");
            return (
              Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
            );
          },
          { timeout: 30_000, intervals: [1000] },
        )
        .toBeGreaterThan(20);
    },
  );
  // Explicit simulated meter facts, consistent with this sub-1.25km route
  // and the approved engine's minimum, not the old local demo tariff.
  await step(
    "Driver meter input and complete with actual tracked facts",
    async () => {
      const bookedQuote = (await authority(pax, orderId)).bookingQuote;
      const minimum = bookedQuote.estimatedMin as number;
      const baseFare = bookedQuote.tariffSnapshot.baseFare as number;
      for (const [label, value] of [
        ["實際起步費", String(baseFare)],
        ["實際里程費", "0"],
        ["實際延滯費", "0"],
        ["實際夜間加成", String(minimum - baseFare)],
        ["實際車資總額", String(minimum)],
      ] as const) {
        const field = driver
          .getByText(label, { exact: true })
          .locator("../..")
          .getByRole("textbox");
        await field.fill(value);
      }
      const complete = driver.waitForResponse(
        (r) =>
          /\/driver\/tasks\/[^/]+\/complete$/.test(r.url()) &&
          r.request().method() === "POST",
      );
      await driver
        .getByRole("button", { name: "完成行程", exact: true })
        .click();
      const completed = await complete;
      expect(completed.status()).toBeLessThan(300);
      await expect
        .poll(async () => (await authority(pax, orderId)).order.status)
        .toBe("completed");
    },
  );
}

export function assertCompletedFacts(rows: any[], orderId: string) {
  const completed = rows.filter((row) => row.started_at && row.completed_at);
  expect(completed.length).toBeGreaterThan(0);
  for (const row of completed) {
    expect(row.order_id).toBe(orderId);
    expect(Date.parse(row.started_at)).toBeGreaterThanOrEqual(
      Date.parse(row.requested_pickup_at),
    );
    expect(Date.parse(row.completed_at)).toBeGreaterThanOrEqual(
      Date.parse(row.started_at),
    );
    expect(Number(row.actual_distance_km)).toBeGreaterThan(0.2);
    expect(Number(row.actual_distance_km)).toBeLessThan(0.5);
    expect(Number(row.actual_duration_sec)).toBeGreaterThan(20);
    expect(Number(row.amount_minor)).toBeGreaterThanOrEqual(8500);
  }
}
