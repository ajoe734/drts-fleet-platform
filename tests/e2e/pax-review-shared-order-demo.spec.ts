import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { recordOrderEvidence } from "./pax-review-shared-order/evidence";
import { createJourneyProgress } from "./pax-review-shared-order/progress";
import { bookingResponseDiagnostic } from "./pax-review-shared-order/booking-diagnostic";
import { dispatchResponseDiagnostic } from "./pax-review-shared-order/dispatch-diagnostic";

type JourneyStep = ReturnType<typeof createJourneyProgress>["step"];

const sharedDev = process.env.PAX_REVIEW_SHARED_DEV_SMOKE === "true";
const PAX = process.env.PAX_REVIEW_PASSENGER_ORIGIN || "http://localhost:3319";
const OPS = process.env.PAX_REVIEW_OPS_ORIGIN || "http://127.0.0.1:3202";
const DRIVER = sharedDev ? `${PAX}/review-driver` : "http://127.0.0.1:3101";
const camel = (value: any): any =>
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

async function authority(page: Page, id: string) {
  const response = await page.request.get(
    `${PAX}/api/passenger-app/rides/${id}`,
  );
  expect(response.status()).toBe(200);
  return camel(await response.json()).data.ride;
}

async function registerDriver(
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

async function bind(page: Page, scenario: "success" | "retry_once") {
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

async function book(
  page: Page,
  paymentMethodId: string,
  unpaidRejection = false,
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

async function opsRead(ops: Page, orderId: string) {
  await ops.getByLabel("訂單 UUID", { exact: true }).fill(orderId);
  await ops.getByRole("button", { name: "讀回同單", exact: true }).click();
  await expect(ops.getByTestId("ops-review-order-id")).toHaveText(orderId);
}

async function createDispatch(ops: Page, orderId: string) {
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

async function assign(
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

async function readAssignedTripAndAccept(
  driver: Page,
  base: string,
  orderId: string,
  step: JourneyStep,
) {
  // These are ordinary UI operations, each with a finite wait. Keeping their
  // progress separate prevents an absent control or pending navigation from
  // consuming the entire three-order case without identifying the operation.
  await step("Driver navigate to assigned jobs", () =>
    driver.goto(`${base}/jobs`, { timeout: 30_000 }),
  );
  await step("Driver open current trip from jobs", () =>
    driver
      .getByText("開啟目前行程", { exact: true })
      .first()
      .click({ timeout: 30_000 }),
  );
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

async function finish(
  driver: Page,
  base: string,
  pax: Page,
  orderId: string,
  ops: Page,
  step: JourneyStep,
  stale = false,
) {
  await step("Driver read assigned trip and accept", async () => {
    await readAssignedTripAndAccept(driver, base, orderId, step);
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

async function download(pax: Page, orderId: string, info: TestInfo) {
  await pax.goto(`${PAX}/review/records/${orderId}`);
  const waiting = pax.waitForEvent("download");
  await pax.getByRole("button", { name: "下載演練紀錄 HTML" }).click();
  const downloaded = await waiting;
  const file = info.outputPath(`review-${orderId}.html`);
  await downloaded.saveAs(file);
  const html = await readFile(file, "utf8");
  expect(html).toContain(orderId);
  expect(html).toContain("非正式憑證");
  expect(html).toContain("新北");
  await info.attach(`same-order-${orderId}-document`, {
    path: file,
    contentType: "text/html",
  });
  await pax.goto(`${PAX}/rides/${orderId}`);
}

function assertCompletedFacts(rows: any[], orderId: string) {
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

test("three new PG orders travel through real Passenger, Ops and Driver UIs, including retry/case, cancellation and exception controls", async ({
  browser,
}, info) => {
  const progress = createJourneyProgress(info.outputPath("safe-progress.json"));
  const step = progress.step;
  const contexts: BrowserContext[] = [];
  const newRole = async (role: "pax" | "ops" | "driver") => {
    const outerToken =
      role === "ops"
        ? process.env.PAX_REVIEW_OPS_ID_TOKEN
        : process.env.PAX_REVIEW_PASSENGER_ID_TOKEN;
    if (sharedDev && !outerToken)
      throw new Error(
        `Missing existing private-service access credential for ${role}`,
      );
    const c = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Taipei",
      ...(outerToken
        ? {
            extraHTTPHeaders: {
              "X-Serverless-Authorization": `Bearer ${outerToken}`,
            },
          }
        : {}),
    });
    contexts.push(c);
    return c.newPage();
  };
  const pax = await step("Passenger browser context", () => newRole("pax")),
    ops = await step("Ops browser context", () => newRole("ops")),
    driver = await step("Driver browser context", () => newRole("driver"));
  let activeDriver = { page: driver, base: DRIVER };
  const requests: {
    role: string;
    method: string;
    path: string;
    status: number;
  }[] = [];
  const observe = (role: "pax" | "ops" | "driver", page: Page) =>
    page.on("response", (r) => {
      progress.response(role, r.request().method(), r.url(), r.status());
      const url = new URL(r.url());
      if (
        /\/(?:rides|orders|dispatch|driver\/tasks)(?:\/|$)/.test(
          url.pathname,
        ) &&
        !url.pathname.includes("auth")
      )
        requests.push({
          role,
          method: r.request().method(),
          path: url.pathname,
          status: r.status(),
        });
    });
  observe("pax", pax);
  observe("ops", ops);
  observe("driver", driver);
  try {
    await step("Ops prepare real persisted rehearsal supply", async () => {
      await ops.goto(`${OPS}/review`);
      await ops.getByRole("button", { name: "準備虛構演練車司" }).click();
      await expect(
        ops.getByText("已準備兩組合成車司；未建立訂單、派遣或付款。"),
      ).toBeVisible();
    });
    await registerDriver(ops, driver, DRIVER, step);
    await step("Passenger genuine OTP login and account", async () => {
      await pax.goto(`${PAX}/review`);
      await pax
        .getByLabel("演練手機", { exact: true })
        .fill(
          `09000000${String(Number(process.env.GITHUB_RUN_ID ?? 1) % 100).padStart(2, "0")}`,
        );
      await pax.getByRole("checkbox").check();
      const requestedOtp = pax.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            "/api/passenger-app/review-demo/otp" &&
          response.request().method() === "POST",
      );
      await pax.getByRole("button", { name: "取得模擬簡訊" }).click();
      const otpResponse = await requestedOtp;
      let failureCode = "unclassified";
      if (!otpResponse.ok()) {
        const body = await otpResponse.json().catch(() => null);
        // Report only this fixed known code; never print OTPs or raw bodies.
        if (body?.error === "CSRF_CHECK_FAILED")
          failureCode = "CSRF_CHECK_FAILED";
      }
      expect(
        otpResponse.ok(),
        `Review OTP status=${otpResponse.status()} code=${failureCode}`,
      ).toBe(true);
      await pax.getByRole("button", { name: "驗證並登入演練帳戶" }).click();
      await expect(pax.getByTestId("review-passenger-id")).toBeVisible();
      expect(
        await pax.evaluate(() =>
          localStorage.getItem("drts.passenger.functional-demo.v1"),
        ),
      ).toBeNull();
    });
    const firstMethod = await step("A bind successful simulated PSP", () =>
      bind(pax, "success"),
    );
    const normal = await step("A Passenger book", () => book(pax, firstMethod));
    await step("A Ops create dispatch", () => createDispatch(ops, normal));
    await step(
      "A Ops assign then reassign while Passenger offline",
      async () => {
        await assign(ops, "pax-review-driver-b");
        await expect
          .poll(
            async () =>
              (await authority(pax, normal)).assignment?.driver.driverId,
          )
          .toBe("pax-review-driver-b");
        await pax.context().setOffline(true);
        await assign(ops, "pax-review-driver-a", true);
        await pax.context().setOffline(false);
        await expect(
          pax.getByText("SIM-1001", { exact: false }).first(),
        ).toBeVisible();
      },
    );
    if (!sharedDev) {
      const cookie = (await pax.context().cookies()).find(
        (c) => c.name === "pax_session",
      );
      expect(cookie).toBeTruthy();
      const peer = await pax.request.get(
        `http://127.0.0.1:3002/api/passenger-app/rides/${normal}`,
        { headers: { Authorization: `Bearer ${cookie!.value}` } },
      );
      expect(peer.status()).toBe(200);
      expect(camel(await peer.json()).data.ride.order.orderId).toBe(normal);
    }
    await finish(driver, DRIVER, pax, normal, ops, step, true);
    await step(
      "A captured payment, high rating, document and relational facts",
      async () => {
        await expect
          .poll(async () => (await authority(pax, normal)).payment?.status)
          .toBe("captured");
        await pax.getByRole("button", { name: "5 星", exact: true }).click();
        await pax
          .getByRole("button", { name: "送出評價", exact: true })
          .click();
        await expect
          .poll(async () => (await authority(pax, normal)).rating?.score)
          .toBe(5);
        await download(pax, normal, info);
        const normalFacts = await recordOrderEvidence(
          normal,
          "A-completed-high-rating",
          { pax, ops, driver },
          info,
        );
        assertCompletedFacts(normalFacts, normal);
        expect(
          normalFacts.some(
            (r) =>
              r.payment_status === "captured" &&
              r.score === 5 &&
              r.order_id === normal,
          ),
        ).toBe(true);
      },
    );

    const retryMethod = await step("B bind retry-once simulated PSP", () =>
      bind(pax, "retry_once"),
    );
    const retry = await step("B Passenger book", () => book(pax, retryMethod));
    expect(retry).not.toBe(normal);
    await step("B Ops create dispatch and assign", async () => {
      await createDispatch(ops, retry);
      await assign(ops);
    });
    // Also exercise the production export mounted in the same private PAX
    // service, including its real driver BFF and SQLite/WASM headers.
    const mountedDriver = await newRole("driver");
    observe("driver", mountedDriver);
    activeDriver = { page: mountedDriver, base: `${PAX}/review-driver` };
    await registerDriver(ops, mountedDriver, `${PAX}/review-driver`, step);
    await finish(mountedDriver, `${PAX}/review-driver`, pax, retry, ops, step);
    await step(
      "B failed payment, same-payment retry, low-rating CRM and document",
      async () => {
        await expect
          .poll(async () => (await authority(pax, retry)).payment?.status)
          .toBe("failed");
        expect((await authority(pax, retry)).actions.canRate).toBe(false);
        const failedFacts = await recordOrderEvidence(
          retry,
          "B-first-capture-failed",
          { pax, ops, driver: mountedDriver },
          info,
        );
        expect(
          failedFacts.some(
            (r) => r.attempt_count === 1 && r.payment_status === "failed",
          ),
        ).toBe(true);
        // A fourth booking attempt is rejected by the real unpaid obligation
        // guard; only the three accepted journeys may create backend orders.
        expect(await book(pax, retryMethod, true)).toBe("");
        await pax.goto(`${PAX}/rides/${retry}`);
        await pax
          .getByRole("button", { name: "依既有政策重試演練付款" })
          .click();
        await expect
          .poll(async () => (await authority(pax, retry)).payment?.status, {
            timeout: 75_000,
            intervals: [2000],
          })
          .toBe("captured");
        await pax.getByRole("button", { name: "1 星", exact: true }).click();
        await pax
          .getByRole("checkbox", { name: "需要客服與您聯繫嗎？" })
          .check();
        await pax
          .getByRole("button", { name: "送出評價", exact: true })
          .click();
        await expect
          .poll(async () => (await authority(pax, retry)).rating?.score)
          .toBe(1);
        const retriedFacts = await recordOrderEvidence(
          retry,
          "B-captured-low-rating-case",
          { pax, ops, driver: mountedDriver },
          info,
        );
        assertCompletedFacts(retriedFacts, retry);
        const row = retriedFacts.find((r) => r.complaint_case_no);
        expect(row?.attempt_count).toBe(2);
        expect(row?.payment_id).toBe(
          failedFacts.find((r) => r.payment_id)?.payment_id,
        );
        expect(row?.contact_requested).toBe(true);
        await ops.goto(`${OPS}/complaints/${row!.complaint_case_no}`);
        await expect(
          ops.getByText(row!.complaint_case_no, { exact: false }).first(),
        ).toBeVisible();
        await ops.screenshot({
          path: info.outputPath("same-order-CRM-case.png"),
          fullPage: true,
        });
        await download(pax, retry, info);
      },
    );

    await ops.goto(`${OPS}/review`);
    const cancelled = await step("C Passenger book", () =>
      book(pax, firstMethod),
    );
    expect(new Set([normal, retry, cancelled]).size).toBe(3);
    await step(
      "C no supply, redispatch and cancellation across roles",
      async () => {
        await ops.getByRole("button", { name: "暫停演練供給" }).click();
        await createDispatch(ops, cancelled);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          /no_supply|dispatch_timeout|delayed_queue/,
        );
        await ops.getByRole("button", { name: "恢復演練供給" }).click();
        await ops.getByRole("button", { name: "依原流程重新派遣" }).click();
        const cancelledAssignment = await assign(ops);
        activeDriver = { page: driver, base: DRIVER };
        await driver.goto(`${DRIVER}/jobs`);
        await driver
          .getByRole("button")
          .filter({
            has: driver.getByText(cancelledAssignment.taskId, { exact: true }),
          })
          .click();
        const cancellationHeader = `${cancelledAssignment.taskId} · ${cancelled}`;
        await expect(
          driver.getByText(cancellationHeader, { exact: true }),
        ).toBeVisible();
        pax.on("dialog", (dialog) => void dialog.accept());
        await pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first()
          .click();
        await expect
          .poll(async () => (await authority(pax, cancelled)).order.status)
          .toBe("cancelled");
        await pax.reload();
        await expect(
          pax.getByText("此行程已取消", { exact: false }).first(),
        ).toBeVisible();
        await opsRead(ops, cancelled);
        await driver.reload();
        await expect(
          driver.getByText(cancellationHeader, { exact: true }),
        ).toBeVisible();
        await expect(driver.getByText(/已取消|平台取消/).first()).toBeVisible();
        for (const name of ["接受任務", "開始行程", "完成行程"]) {
          for (const button of await driver
            .getByRole("button", { name, exact: true })
            .all())
            await expect(button).toBeDisabled();
        }
        const cancelledFacts = await recordOrderEvidence(
          cancelled,
          "C-cancelled-history",
          { pax, ops, driver },
          info,
        );
        expect(cancelledFacts.length).toBeGreaterThan(0);
        expect(
          cancelledFacts.every(
            (r) => r.payment_status !== "captured" && r.rating_id == null,
          ),
        ).toBe(true);
      },
    );
    await step(
      "All three independent orders in refreshed Passenger history",
      async () => {
        const history = await pax.request.get(`${PAX}/api/passenger-app/rides`);
        expect(history.status()).toBe(200);
        const historyText = await history.text();
        for (const id of [normal, retry, cancelled])
          expect(historyText).toContain(id);
        await pax.goto(`${PAX}/rides`);
        await pax.reload();
        for (const id of [normal, retry, cancelled])
          await expect(pax.locator(`a[href="/rides/${id}"]`)).toBeVisible();
        await expect(
          pax
            .locator(`a[href="/rides/${cancelled}"]`)
            .getByText("乘客取消", { exact: true }),
        ).toBeVisible();
        await info.attach("history-after-refresh", {
          body: await pax.screenshot({ fullPage: true }),
          contentType: "image/png",
        });
        await info.attach("cross-role-safe-response-journal", {
          body: JSON.stringify(requests, null, 2),
          contentType: "application/json",
        });
      },
    );
  } catch (error) {
    // Only these post-registration Driver pages are safe to capture. Never
    // record onboarding, invitation fields, session storage or HTTP bodies.
    const { page: failedDriver, base: failedDriverBase } = activeDriver;
    const closed = failedDriver.isClosed();
    // A redirect outside jobs/trip used to leave no evidence at all. Project
    // only fixed route names, never the actual URL, query or page contents.
    const failedUrl = new URL(failedDriver.url());
    const driverBaseUrl = new URL(failedDriverBase);
    const route = ["jobs", "trip", "onboarding", ""].find(
      (name) =>
        failedUrl.origin === driverBaseUrl.origin &&
        failedUrl.pathname.replace(/\/$/, "") ===
          `${driverBaseUrl.pathname.replace(/\/$/, "")}/${name}`.replace(
            /\/$/,
            "",
          ),
    );
    const workspace = route === "jobs" || route === "trip";
    const queryPresent = Boolean(failedUrl.search || failedUrl.hash);
    const visible = async (label: string) =>
      workspace && !closed && !queryPresent
        ? failedDriver
            .getByText(label, { exact: true })
            .first()
            .isVisible()
            .catch(() => null)
        : null;
    const [loading, empty, openCurrentTrip] = await Promise.all([
      visible("載入任務中…"),
      visible("此篩選條件下沒有任務"),
      visible("開啟目前行程"),
    ]);
    await info
      .attach("driver-failure-state", {
        body: JSON.stringify({
          route: route === "" ? "index" : (route ?? "other"),
          closed,
          queryPresent,
          loading,
          empty,
          openCurrentTrip,
        }),
        contentType: "application/json",
      })
      .catch(() => undefined);
    if (workspace && !queryPresent && !closed) {
      const screenshot = await failedDriver
        .screenshot({ fullPage: true, timeout: 5000 })
        .catch(() => null);
      if (screenshot)
        await info
          .attach("driver-assigned-trip-failure", {
            body: screenshot,
            contentType: "image/png",
          })
          .catch(() => undefined);
    }
    await Promise.allSettled(contexts.map((c) => c.close()));
    throw error;
  }
  await Promise.all(contexts.map((c) => c.close()));
});
