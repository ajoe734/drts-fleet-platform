import { expect, type Page, type TestInfo } from "@playwright/test";
import { recordOrderEvidence } from "./evidence";
import { authority, camel, opsRead, PAX } from "./additional-journey";

type Step = <T>(name: string, operation: () => Promise<T>) => Promise<T>;

/** Original UIs/BFF/API only. Chromium supplies explicit simulated device
 * coordinates and permission outcomes; there are no internal network routes,
 * fabricated orders or database writes in this journey.
 */
export async function standardAddressJourney(
  pax: Page,
  ops: Page,
  paymentMethodId: string,
  earlierOrders: string[],
  step: Step,
  info: TestInfo,
) {
  const position = { latitude: 25.0142, longitude: 121.4636, accuracy: 8 };
  let reverseCount = 0;
  const observe = (request: import("@playwright/test").Request) => {
    if (new URL(request.url()).pathname === "/api/passenger-app/geo/reverse")
      reverseCount++;
  };
  pax.on("request", observe);
  const cdp = await pax.context().newCDPSession(pax);
  let reverseProvider: string | undefined;
  let firstQuoteId: string | undefined;
  let bookedQuoteId: string | undefined;
  let destination: { lat: number; lng: number } | undefined;
  let orderId = "";
  const localTime = () =>
    pax.evaluate(() => {
      const date = new Date(
        Math.ceil((Date.now() + 120_000) / 60_000) * 60_000,
      );
      const pad = (value: number) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    });
  async function quote() {
    const requested = pax.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/passenger-app/quotes" &&
        response.request().method() === "POST",
    );
    await pax.getByLabel("預約時間", { exact: true }).fill(await localTime());
    await pax.getByRole("button", { name: "試算車資", exact: true }).click();
    const response = await requested;
    expect(response.status()).toBe(201);
    expect(response.request().postDataJSON()).toMatchObject({
      originLat: position.latitude,
      originLng: position.longitude,
      destinationLat: destination?.lat,
      destinationLng: destination?.lng,
    });
    const data = camel(await response.json()).data;
    expect(data.serviceAreaResult).toBe("serviceable");
    expect(data.fareSnapshotId).toBeTruthy();
    await expect(pax.getByLabel("我已確認費用與優惠說明")).toBeVisible();
    return data.fareSnapshotId as string;
  }
  try {
    await step(
      "F choose standard address mode and clear fixed points",
      async () => {
        await pax.goto(`${PAX}/`);
        await pax
          .getByLabel("示範上車地點", { exact: true })
          .selectOption("review-banqiao");
        await pax
          .getByLabel("示範下車地點", { exact: true })
          .selectOption("review-city-hall");
        await pax
          .getByLabel("演練選址方式", { exact: true })
          .selectOption("standard");
        await expect(
          pax.getByLabel("示範上車地點", { exact: true }),
        ).toHaveCount(0);
        await expect(
          pax.getByPlaceholder("請輸入街道、地點或地標"),
        ).toHaveCount(2);
        await expect(
          pax.getByRole("button", { name: "試算車資", exact: true }),
        ).toBeDisabled();
        expect(reverseCount).toBe(0);
      },
    );
    await step(
      "F browser denies geolocation without sending reverse",
      async () => {
        await cdp.send("Browser.setPermission", {
          permission: { name: "geolocation" },
          setting: "denied",
          origin: new URL(PAX).origin,
        });
        await pax
          .getByRole("button", { name: "使用目前位置", exact: true })
          .click();
        await expect(
          pax.getByRole("alert").filter({ hasText: "未允許使用目前位置" }),
        ).toBeVisible();
        expect(reverseCount).toBe(0);
      },
    );
    await step(
      "F browser grants simulated coordinates through real reverse",
      async () => {
        await pax
          .context()
          .grantPermissions(["geolocation"], { origin: new URL(PAX).origin });
        await pax.context().setGeolocation(position);
        const requested = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              "/api/passenger-app/geo/reverse" &&
            response.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "使用目前位置", exact: true })
          .click();
        const response = await requested;
        expect(response.status()).toBe(201);
        expect(response.request().postDataJSON()).toMatchObject({
          location: { lat: position.latitude, lng: position.longitude },
          surface: "passenger_entry",
        });
        const data = camel(await response.json()).data;
        reverseProvider = data.provider;
        expect(data.address.address).toBeTruthy();
        await expect(
          pax
            .locator("[data-address-map-picker]")
            .first()
            .getByRole("button", { name: "清除選點", exact: true }),
        ).toBeVisible();
      },
    );
    await step(
      "F ordinary destination search selects provider coordinates",
      async () => {
        const picker = pax.locator("[data-address-map-picker]").nth(1);
        await picker
          .getByPlaceholder("請輸入街道、地點或地標")
          .fill("台北車站");
        const searched = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              "/api/passenger-app/geo/search" &&
            response.request().method() === "GET",
        );
        await picker.getByRole("button", { name: "搜尋", exact: true }).click();
        const response = await searched;
        expect(response.status()).toBe(200);
        const data = camel(await response.json()).data;
        expect(data.candidates.length).toBeGreaterThan(0);
        destination = data.candidates[0].location;
        expect(destination).toEqual({
          lat: expect.any(Number),
          lng: expect.any(Number),
        });
        await picker.getByRole("option").first().getByRole("button").click();
        await expect(
          picker.getByRole("button", { name: "清除選點", exact: true }),
        ).toBeVisible();
      },
    );
    await step("F real quote and modify preserve standard mode", async () => {
      firstQuoteId = await quote();
      await pax.getByRole("button", { name: "返回修改", exact: true }).click();
      await expect(pax.getByLabel("演練選址方式", { exact: true })).toHaveValue(
        "standard",
      );
      await expect(
        pax.getByRole("button", { name: "使用目前位置", exact: true }),
      ).toBeVisible();
      await expect(
        pax
          .locator("[data-address-map-picker]")
          .getByRole("button", { name: "清除選點", exact: true }),
      ).toHaveCount(2);
    });
    await step(
      "F actual standard-address booking writes a new order",
      async () => {
        bookedQuoteId = await quote();
        await pax.locator(`input[value="${paymentMethodId}"]`).check();
        await pax.getByLabel("我已確認費用與優惠說明", { exact: true }).check();
        const created = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/passenger-app/rides" &&
            response.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "確認叫車", exact: true })
          .click();
        const response = await created;
        expect(response.status()).toBe(201);
        expect(response.request().postDataJSON()).toMatchObject({
          origin: { lat: position.latitude, lng: position.longitude },
          fareSnapshotId: bookedQuoteId,
          paymentMethodId,
        });
        orderId = camel(await response.json()).data.ride.order.orderId;
        expect(orderId).toMatch(/^[0-9a-f-]{36}$/);
        expect(earlierOrders).not.toContain(orderId);
        await expect(pax.getByTestId("review-order-id")).toHaveText(orderId);
        expect((await authority(pax, orderId)).order.pickup).toMatchObject({
          lat: position.latitude,
          lng: position.longitude,
        });
        expect((await authority(pax, orderId)).assignment).toBeNull();
      },
    );
    await step(
      "F cancel undispatched new order and read both roles",
      async () => {
        await opsRead(ops, orderId);
        const cancelled = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              `/api/passenger-app/rides/${orderId}/cancel` &&
            response.request().method() === "POST",
        );
        const confirmation = pax.waitForEvent("dialog");
        const clicked = pax
          .getByRole("button", { name: "取消行程", exact: true })
          .first()
          .click();
        const dialog = await confirmation;
        expect(dialog.type()).toBe("confirm");
        expect(dialog.message()).toBe("確定要取消這趟行程嗎？");
        await dialog.accept();
        await clicked;
        expect((await cancelled).status()).toBe(201);
        expect((await authority(pax, orderId)).order.status).toBe("cancelled");
        await opsRead(ops, orderId);
        await expect(ops.getByTestId("ops-review-order-status")).toHaveText(
          "cancelled",
        );
        const rows = await recordOrderEvidence(
          orderId,
          "F-standard-address-cancelled",
          { pax, ops },
          info,
        );
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
          expect(row.order_id).toBe(orderId);
          expect(row.payment_id ?? null).toBeNull();
          expect(row.rating_id ?? null).toBeNull();
        }
        await info.attach("F-standard-address-original-BFF-facts", {
          contentType: "application/json",
          body: JSON.stringify({
            orderId,
            browserLocationSimulated: true,
            location: position,
            reverseProvider,
            permissionDeniedSentReverseCount: 0,
            firstQuoteId,
            bookedQuoteId,
            destination,
            actualInternalNetworkMocks: false,
            actualPassengerAndOpsCancelledRead: true,
            scope:
              "ordinary address picker/current-location UI and original BFF/API create/cancel; no dispatch or Driver task is fabricated",
          }),
        });
      },
    );
  } finally {
    pax.off("request", observe);
    await cdp.detach();
  }
}
