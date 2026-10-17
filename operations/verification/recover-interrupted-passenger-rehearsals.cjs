/* eslint-disable @typescript-eslint/no-require-imports -- This CommonJS executable runs directly in hosted Node jobs. */
const fs = require("node:fs");
const path = require("node:path");
class RecoveryOperationError extends Error {}

function camel(value) {
  if (Array.isArray(value)) return value.map(camel);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      camel(item),
    ]),
  );
}

function summarize(ride) {
  return {
    orderId: ride.order.orderId,
    status: ride.order.status,
    assignmentId: ride.assignment?.assignmentId ?? null,
    driverId: ride.assignment?.driver?.driverId ?? null,
    vehicleId: ride.assignment?.vehicle?.vehicleId ?? null,
  };
}

/** Normal owner reads/cancellation only. The explicit manifest is not a data purge. */
async function recoverOrders(orders, mode, ports, record) {
  if (!["inspect", "cancel"].includes(mode))
    throw new RecoveryOperationError("Unknown recovery mode");
  const results = [];
  for (const target of orders) {
    const result = {
      orderId: target.orderId,
      failedRunId: target.failedRunId,
      mode,
    };
    results.push(result);
    try {
      result.stage = "owner_login";
      await ports.login(target.phone);
      result.stage = "owner_read";
      const before = summarize(await ports.read(target.orderId));
      result.before = before;
      if (before.orderId !== target.orderId)
        throw new RecoveryOperationError("Order read mismatch");
      if (mode === "inspect") {
        result.outcome = "inspected";
      } else if (["cancelled", "completed"].includes(before.status)) {
        result.outcome = "already_terminal";
      } else {
        if (["on_trip", "proof_pending"].includes(before.status))
          throw new RecoveryOperationError(
            "Started trip requires its original completion flow",
          );
        if (
          before.driverId !== target.expectedDriverId ||
          before.vehicleId !== target.expectedVehicleId
        )
          throw new RecoveryOperationError(
            "Current assignment differs from the interrupted rehearsal",
          );
        result.stage = "original_cancellation";
        await ports.cancel(target.orderId);
        result.stage = "cancellation_readback";
        const after = summarize(await ports.read(target.orderId));
        result.after = after;
        if (after.orderId !== before.orderId || after.status !== "cancelled")
          throw new RecoveryOperationError(
            "Cancellation readback is not confirmed",
          );
        result.outcome = "cancelled_through_original_passenger_flow";
      }
    } catch (error) {
      // Port errors deliberately omit response bodies, sessions and OTP values.
      result.outcome = "unresolved";
      result.error =
        error instanceof RecoveryOperationError
          ? error.message
          : "Recovery operation did not complete";
    }
    await record(results);
  }
  return results;
}

/** Only IDs acknowledged by this failed journey's own create-ride requests. */
async function finalizeCreatedOrders(orderIds, ports) {
  const results = [];
  for (const orderId of new Set(orderIds)) {
    const result = { orderId };
    results.push(result);
    try {
      result.before = summarize(await ports.read(orderId));
      if (result.before.orderId !== orderId)
        throw new RecoveryOperationError("Order read mismatch");
      if (["completed", "cancelled"].includes(result.before.status)) {
        result.outcome = "already_terminal";
      } else if (["on_trip", "proof_pending"].includes(result.before.status)) {
        result.outcome = "original_completion_required";
      } else {
        await ports.cancel(orderId);
        result.after = summarize(await ports.read(orderId));
        if (
          result.after.orderId !== orderId ||
          result.after.status !== "cancelled"
        )
          throw new RecoveryOperationError(
            "Cancellation readback is not confirmed",
          );
        result.outcome = "cancelled_through_original_passenger_flow";
      }
    } catch (error) {
      result.outcome = "unresolved";
      result.error =
        error instanceof RecoveryOperationError
          ? error.message
          : "Recovery operation did not complete";
    }
  }
  return results;
}

function passengerPageOperations(getPage, origin, outputDirectory) {
  return {
    async read(orderId) {
      const page = getPage();
      const response = await page.request.get(
        `${origin}/api/passenger-app/rides/${orderId}`,
      );
      if (!response.ok())
        throw new RecoveryOperationError(
          `Owner order read HTTP${response.status()}`,
        );
      return camel(await response.json()).data.ride;
    },
    async cancel(orderId) {
      const page = getPage();
      const { expect } = require("@playwright/test");
      await page.goto(`${origin}/rides/${orderId}`);
      await expect(page.getByTestId("review-order-id")).toHaveText(orderId);
      await page.screenshot({
        path: path.join(outputDirectory, `${orderId}-before-cancellation.png`),
        fullPage: true,
      });
      const pending = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname ===
            `/api/passenger-app/rides/${orderId}/cancel` &&
          r.request().method() === "POST",
      );
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "取消行程", exact: true }).click();
      const response = await pending;
      if (!response.ok())
        throw new RecoveryOperationError(
          `Original cancellation HTTP${response.status()}`,
        );
      await expect(
        page.getByText("此行程已取消", { exact: false }).first(),
      ).toBeVisible();
      await page.screenshot({
        path: path.join(outputDirectory, `${orderId}-after-cancellation.png`),
        fullPage: true,
      });
    },
  };
}

async function browserPorts(browser, origin, token, outputDirectory) {
  let context;
  let page;
  return {
    ...passengerPageOperations(() => page, origin, outputDirectory),
    async login(phone) {
      await context?.close();
      context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        timezoneId: "Asia/Taipei",
        extraHTTPHeaders: { "X-Serverless-Authorization": `Bearer ${token}` },
      });
      page = await context.newPage();
      const { expect } = require("@playwright/test");
      await page.goto(`${origin}/review`);
      await page.getByLabel("演練手機", { exact: true }).fill(phone);
      await page.getByRole("checkbox").check();
      const pending = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/passenger-app/review-demo/otp" &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "取得模擬簡訊" }).click();
      const response = await pending;
      if (!response.ok())
        throw new RecoveryOperationError(
          `Rehearsal OTP request HTTP${response.status()}`,
        );
      await page.getByRole("button", { name: "驗證並登入演練帳戶" }).click();
      await expect(page.getByTestId("review-passenger-id")).toBeVisible();
    },
    async close() {
      await context?.close();
    },
  };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== "true")
    throw new Error("Run the browser in the hosted workflow");
  const mode = process.argv[2] ?? "inspect";
  const manifest = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const directory = path.resolve(process.argv[4]);
  fs.mkdirSync(directory, { recursive: true });
  const origin = process.env.PAX_REVIEW_PASSENGER_ORIGIN;
  const token = process.env.PAX_REVIEW_PASSENGER_ID_TOKEN;
  if (!origin || !token)
    throw new Error("Existing private Passenger service access is required");
  const health = await fetch(`${process.env.DRTS_DEV_API_BASE_URL}/health`);
  if (
    !health.ok ||
    health.headers.get("x-drts-candidate-sha") !== manifest.runtimeSource
  )
    throw new Error(
      "Runtime source does not match the interrupted rehearsal recovery",
    );
  const { chromium } = require("@playwright/test");
  const browser = await chromium.launch();
  const ports = await browserPorts(browser, origin, token, directory);
  try {
    const results = await recoverOrders(
      manifest.orders,
      mode,
      ports,
      (rows) => {
        fs.writeFileSync(
          path.join(directory, "results.json"),
          JSON.stringify(
            {
              at: new Date().toISOString(),
              runtimeSource: manifest.runtimeSource,
              mode,
              results: rows,
              recordsDeleted: false,
              databaseOrPolicyChanges: false,
            },
            null,
            2,
          ) + "\n",
        );
      },
    );
    console.log(
      JSON.stringify({
        mode,
        outcomes: results.map(({ orderId, outcome }) => ({ orderId, outcome })),
      }),
    );
    if (results.some((r) => r.outcome === "unresolved")) process.exitCode = 1;
  } finally {
    await ports.close();
    await browser.close();
  }
}

module.exports = {
  recoverOrders,
  summarize,
  browserPorts,
  passengerPageOperations,
  finalizeCreatedOrders,
  RecoveryOperationError,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
