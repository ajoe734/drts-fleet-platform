import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  authority,
  camel,
  PAX,
  sharedDev,
} from "../pax-review-shared-order/additional-journey";
import { verifyOriginalPassengerReceiptInBrowser } from "../pax-review-shared-order/passenger-ride-and-receipt";
import { acceptConsent } from "./otp-consent-journey";

const api = "/api/passenger-app";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function responseFor(page: Page, path: string, method: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === method,
  );
}

async function selectPlace(page: Page, picker: Locator, query: string) {
  await picker.getByPlaceholder("請輸入街道、地點或地標").fill(query);
  const search = responseFor(page, api + "/geo/search", "GET");
  await picker.getByRole("button", { name: "搜尋", exact: true }).click();
  const response = await search;
  expect(response.status()).toBe(200);
  const { candidates } = camel(await response.json()).data;
  expect(candidates.length).toBeGreaterThan(0);
  await picker.getByRole("option").first().getByRole("button").click();
  await expect(picker.getByRole("button", { name: "清除選點" })).toBeVisible();
  return candidates[0].location as { lat: number; lng: number };
}

// Read the actions sent by the open ride screen. The test never issues a driver command.
async function driverAction(
  page: Page,
  orderId: string,
  action: "assign" | "heartbeat" | "board",
  status: string,
) {
  const path = api + "/review-demo/rides/" + orderId + "/trial/" + action;
  const response = await page.waitForResponse(
    async (response) => {
      if (
        new URL(response.url()).pathname !== path ||
        response.request().method() !== "POST" ||
        !response.ok()
      )
        return false;
      return (await response.json()).data.status === status;
    },
    { timeout: 4 * 60_000 },
  );
  const data = camel(await response.json()).data;
  expect(data.orderId).toBe(orderId);
  expect(data.simulated).toBe(true);
  return data.status as string;
}

test("public self-serve passenger trial books a ride, follows the test driver and downloads its original E-04", async ({
  page,
}, info) => {
  test.setTimeout(9 * 60_000);
  const feeNotice = page.getByRole("button", {
    name: "我已閱讀並同意",
    exact: true,
  });
  const pickers = page.locator("[data-address-map-picker]");
  await test.step("Read the public trial terms and enter with a test account", async () => {
    const entry = await page.goto(PAX + "/trial");
    expect(entry?.status()).toBe(200);
    await page.getByRole("link", { name: "測試環境使用說明" }).click();
    await expect(page).toHaveURL(PAX + "/trial/terms");
    await expect(
      page.getByRole("heading", { name: "測試環境使用說明" }),
    ).toBeVisible();
    await expect(
      page.getByText(/不會派出真實車輛、不會實際扣款/),
    ).toBeVisible();
    await page.getByRole("link", { name: "回到試用" }).click();
    await page.getByRole("button", { name: "開始試用", exact: true }).click();

    const consent = page
      .getByRole("checkbox", { name: /我已閱讀並同意/ })
      .and(page.locator(":enabled"));
    // A returning trial account already has current consent. Its start takes it directly to booking.
    await expect(
      consent.or(feeNotice).or(pickers.first()).first(),
    ).toBeVisible();
    if (await consent.isVisible()) await acceptConsent(page);
    await expect(page).toHaveURL(PAX + "/");
    await expect(page.getByLabel("線上試用")).toBeVisible();
    await expect(feeNotice.or(pickers.first()).first()).toBeVisible();
    if (await feeNotice.isVisible()) await feeNotice.click();
    await expect(pickers).toHaveCount(2);
  });
  const orderId =
    await test.step("Search two addresses, confirm the quote and book with the owned test card", async () => {
      const origin = await selectPlace(page, pickers.first(), "板橋車站");
      const destination = await selectPlace(page, pickers.nth(1), "新北市政府");
      expect(origin).not.toEqual(destination);
      const methods = await page.request.get(PAX + api + "/payment-methods");
      expect(methods.status()).toBe(200);
      const cards: { paymentMethodId: string; isDefault: boolean }[] = camel(
        await methods.json(),
      ).data.methods;
      expect(cards.length).toBeGreaterThan(0);
      const cardId = (cards.find((card) => card.isDefault) ?? cards[0]!)
        .paymentMethodId;
      expect(cardId).toBeTruthy();

      // Leave a minute to confirm the quote after the deployment's own minimum.
      const pickupTime = page.getByLabel("預約時間", { exact: true });
      await expect(pickupTime).toHaveAttribute("min", /T\d{2}:\d{2}$/);
      const time = await pickupTime.evaluate((input: HTMLInputElement) => {
        const date = new Date(input.min);
        date.setMinutes(date.getMinutes() + 1);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
          .toISOString()
          .slice(0, 16);
      });
      await pickupTime.fill(time);
      const quote = responseFor(page, api + "/quotes", "POST");
      await page.getByRole("button", { name: "試算車資", exact: true }).click();
      const quoted = await quote;
      expect(quoted.status()).toBe(201);
      const { fareSnapshotId, serviceAreaResult } = camel(
        await quoted.json(),
      ).data;
      expect(serviceAreaResult).toBe("serviceable");
      expect(fareSnapshotId).toBeTruthy();
      const confirmFees = page.getByRole("checkbox", {
        name: "我已確認費用與優惠說明",
      });
      await expect(confirmFees).toBeVisible();
      const card = page.locator(`input[value="${cardId}"]`);
      if (!(await card.isVisible()))
        await page.getByRole("button", { name: /^變更支付方式：/ }).click();
      await card.check();
      await confirmFees.check();
      const created = responseFor(page, api + "/rides", "POST");
      await page.getByRole("button", { name: "確認叫車", exact: true }).click();
      const response = await created;
      expect(response.status()).toBe(201);
      const command = response.request().postDataJSON();
      expect(command.fareSnapshotId).toBe(fareSnapshotId);
      expect(command.paymentMethodId).toBe(cardId);
      expect(command.origin).toMatchObject(origin);
      expect(command.destination).toMatchObject(destination);
      const id: string = camel(await response.json()).data.ride.order.orderId;
      expect(id).toMatch(uuid);
      return id;
    });

  const stages =
    await test.step("Keep the ride open while the trial driver accepts, arrives, boards and finishes", async () => {
      const assigned = await driverAction(
        page,
        orderId,
        "assign",
        "enroute_pickup",
      );
      await expect(page).toHaveURL(PAX + "/rides/" + orderId);
      const arrived = await driverAction(
        page,
        orderId,
        "heartbeat",
        "arrived_pickup",
      );
      const boarded = await driverAction(page, orderId, "board", "on_trip");
      await expect(
        page.getByText("行程進行中", { exact: true }).first(),
      ).toBeVisible();
      const completed = await driverAction(
        page,
        orderId,
        "heartbeat",
        "completed",
      );
      await expect(
        page.getByRole("link", { name: "查看電子乘車證明", exact: true }),
      ).toBeVisible();
      return { assigned, arrived, boarded, completed };
    });
  await test.step("Match the completed driver task to the passenger's original downloadable PDF", async () => {
    await expect
      .poll(
        async () =>
          !!(await authority(page, orderId)).receipt?.record?.e04Snapshot,
      )
      .toBe(true);
    const ride = await authority(page, orderId);
    expect(ride.order.orderId).toBe(orderId);
    expect(ride.order.status).toBe("completed");
    const record = await page.request.get(
      PAX + api + "/review-demo/rides/" + orderId + "/record",
    );
    expect(record.status()).toBe(200);
    const { trip } = camel(await record.json()).data;
    expect(trip?.taskId).toMatch(uuid);
    expect(ride.receipt.orderId).toBe(orderId);
    expect(ride.receipt.record.tripId).toBe(trip.taskId);
    const downloads = await page.request.get(
      PAX + api + "/rides/" + orderId + "/receipt/downloads",
    );
    expect(downloads.status()).toBe(200);
    const metadata = camel(await downloads.json()).data;
    expect(metadata.orderId).toBe(orderId);
    expect(metadata.certificateId).toBe(ride.receipt.receiptId);
    expect(metadata.pdfUrl).toBe(
      api + "/rides/" + orderId + "/receipt/artifacts/pdf",
    );
    await verifyOriginalPassengerReceiptInBrowser(
      page,
      PAX,
      orderId,
      { ...ride.receipt, orderNo: ride.order.orderNo },
      metadata,
      info,
    );
    const pdf = info.attachments.find(
      (attachment) =>
        attachment.name === `same-order-${orderId}-original-e04-pdf`,
    );
    if (!pdf) throw new Error("Original E-04 PDF attachment is missing.");
    const bytes = pdf.body ?? (pdf.path ? await readFile(pdf.path) : undefined);
    expect(bytes?.includes(Buffer.from(`drts:tripId="${trip.taskId}"`))).toBe(
      true,
    );
    await info.attach("public-trial-journey", {
      contentType: "application/json",
      body: JSON.stringify({
        environment: sharedDev ? "shared-dev" : "isolated-hosted",
        entry: "/trial",
        orderId,
        tripId: trip.taskId,
        certificateId: metadata.certificateId,
        format: "pdf",
        stages,
        startedAt: trip.startedAt,
        completedAt: trip.completedAt,
        real: [
          "passenger UI",
          "BFF",
          "booking",
          "dispatch",
          "trip",
          "storage",
          "E-04 PDF",
        ],
        simulated: [
          "trial account and SMS",
          "payment card and PSP",
          "driver, vehicle and GPS",
        ],
        map: sharedDev
          ? "shared runtime provider"
          : "hosted external map fixture",
      }),
    });
  });
});
