/**
 * Hosted-only, real browser + full AppModule/PostgreSQL wiring acceptance.
 * Uses the product's explicitly configured development bootstrap for the
 * Driver/OPS browser surfaces; durable signed sessions are tested separately
 * by full-app.remote.test.ts. This is not physical-device provisioning proof.
 * No route interception, fabricated API response, or local server startup.
 */
import { test, expect, type Page, type Response } from "@playwright/test";
import {
  HOST_A_PARTNER_ID,
  HOST_B_PARTNER_ID,
} from "../sr-host-fe-001/host-acceptance-seed";

const driverUrl = process.env.WIRE_DRIVER_URL ?? "http://127.0.0.1:3011";
const hostUrl = process.env.WIRE_HOST_URL ?? "http://127.0.0.1:3007";
const opsUrl = process.env.WIRE_OPS_URL ?? "http://127.0.0.1:3004";
const driverId = "drv_wire_001";

test.use({ trace: "off", viewport: { width: 1440, height: 960 } });
test.beforeAll(() => {
  expect(
    process.env.GITHUB_ACTIONS,
    "Execute only on the authorized hosted acceptance runner",
  ).toBe("true");
  expect(process.env.CANDIDATE_SHA).toMatch(/^[a-f0-9]{40}$/);
  for (const value of [driverUrl, hostUrl, opsUrl]) {
    expect(["localhost", "127.0.0.1"]).toContain(new URL(value).hostname);
  }
});

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.name));
  return errors;
}
function waitForList(page: Page, suffix: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname.endsWith(suffix),
  );
}
async function listItems(
  response: Response,
): Promise<Array<Record<string, unknown>>> {
  expect(response.ok(), `Real API returned HTTP ${response.status()}`).toBe(
    true,
  );
  const envelope = await response.json();
  expect(Array.isArray(envelope?.data?.items)).toBe(true);
  // The actual HTTP interceptor emits snake_case; the product ApiClient
  // presents camelCase rows to the UI. Normalize only keys for comparison.
  return envelope.data.items.map((item: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(item).map(([key, value]) => [
        key.replace(/_([a-z])/g, (_match, character: string) =>
          character.toUpperCase(),
        ),
        value,
      ]),
    ),
  );
}

test("Driver settings reaches real leave records through its visible action", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto(`${driverUrl}/settings`);
  const action = page.getByTestId("driver-settings-leave");
  await expect(action).toBeVisible();
  const response = waitForList(page, "/driver-leave/requests");
  await action.click();
  await expect(page).toHaveURL(/\/leave(?:[?#]|$)/);
  const actualResponse = await response;
  expect(new URL(actualResponse.url()).searchParams.get("driverId")).toBe(
    driverId,
  );
  const items = await listItems(actualResponse);
  expect(items.every((item) => item.driverId === driverId)).toBe(true);
  await expect(page.getByText("我的請假", { exact: true })).toBeVisible();
  if (items.length === 0) {
    await expect(
      page.getByText("尚無任何請假紀錄", { exact: true }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText(String(items[0]!.leaveId), { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(String(items[0]!.reason), { exact: true }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("Driver settings reaches real academy courses and training records", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto(`${driverUrl}/settings`);
  const action = page.getByTestId("driver-settings-academy");
  await expect(action).toBeVisible();
  const coursesResponse = waitForList(page, "/driver-academy/courses");
  const recordsResponse = waitForList(page, "/driver-academy/records");
  await action.click();
  await expect(page).toHaveURL(/\/academy(?:[?#]|$)/);
  const courses = await listItems(await coursesResponse);
  const records = await listItems(await recordsResponse);
  await expect(page.getByTestId("academy-screen")).toBeVisible();
  await expect(
    page.getByText(`課程專區 (${courses.length})`, { exact: true }),
  ).toBeVisible();
  if (courses.length === 0) {
    await expect(
      page.getByText("目前尚無可用課程", { exact: true }),
    ).toBeVisible();
  } else {
    await expect(
      page.getByText(String(courses[0]!.title), { exact: true }),
    ).toBeVisible();
  }
  expect(records.every((record) => record.driverId === driverId)).toBe(true);
  expect(errors).toEqual([]);
});

for (const identity of [
  {
    label: "A",
    partnerId: HOST_A_PARTNER_ID,
    ownPlate: "UAT-A001",
    otherPlate: "UAT-B001",
  },
  {
    label: "B",
    partnerId: HOST_B_PARTNER_ID,
    ownPlate: "UAT-B001",
    otherPlate: "UAT-A001",
  },
]) {
  test(`Host ${identity.label} sees its real vehicles and the active restricted shell`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      extraHTTPHeaders: { "x-host-partner-id": identity.partnerId },
    });
    try {
      const page = await context.newPage();
      const errors = watchErrors(page);
      await page.goto(`${hostUrl}/host/vehicles`);
      const shell = page.getByTestId("fleet-portal-shell");
      await expect(shell).toHaveAttribute("data-portal-scope", "host");
      await expect(
        page.getByText(identity.ownPlate, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(identity.otherPlate, { exact: true }),
      ).toHaveCount(0);
      const navLink = page.locator('a[href="/host/vehicles"]').first();
      await expect(navLink).toBeVisible();
      await navLink.click();
      await expect(page).toHaveURL(/\/host\/vehicles$/);
      for (const path of [
        "/drivers",
        "/vehicles",
        "/supply",
        "/revenue",
        "/training",
      ]) {
        await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
      }
      await page.getByRole("link", { name: "詳情 →" }).first().click();
      await expect(page).toHaveURL(/\/host\/vehicles\/[^/?]+/);
      await expect(shell).toHaveAttribute("data-portal-scope", "host");
      await expect(
        page.getByText(identity.ownPlate, { exact: true }),
      ).toBeVisible();
      await expect(page.locator('a[href="/drivers"]')).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test("OPS navigation opens a real leave review queue including valid empty results", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto(`${opsUrl}/attendance`);
  const leaveLink = page.locator('a[href="/leave"]').first();
  await expect(leaveLink).toBeVisible();
  const response = waitForList(page, "/driver-leave/requests");
  await leaveLink.click();
  await expect(page).toHaveURL(/\/leave(?:[?#]|$)/);
  const items = await listItems(await response);
  await expect(
    page.getByText("請假審核 · Leave Requests", { exact: true }),
  ).toBeVisible();
  const pending = items.filter((item) => item.status === "pending");
  if (pending.length === 0) {
    await expect(page.getByText("查無請假申請", { exact: true })).toBeVisible();
  } else {
    await expect(
      page.getByText(String(pending[0]!.leaveId), { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});
