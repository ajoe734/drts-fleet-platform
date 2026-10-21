import { expect, type Page, type TestInfo } from "@playwright/test";
import { camel, type JourneyStep } from "./additional-journey";

type Point = { lat: number; lng: number };

/** Original picker/BFF/provider and service-area evaluation only. This runs
 * before F is booked; no order is fabricated for the refused destination.
 */
export async function outOfAreaRecoveryJourney(
  pax: Page,
  origin: { latitude: number; longitude: number },
  step: JourneyStep,
  info: TestInfo,
) {
  let ridePOSTCount = 0;
  const observe = (request: import("@playwright/test").Request) => {
    if (
      new URL(request.url()).pathname === "/api/passenger-app/rides" &&
      request.method() === "POST"
    )
      ridePOSTCount++;
  };
  pax.on("request", observe);
  const picker = pax.locator("[data-address-map-picker]").nth(1);
  async function selectDestination(query: string) {
    await picker.getByRole("button", { name: "清除選點", exact: true }).click();
    await expect(
      picker.getByRole("button", { name: "清除選點", exact: true }),
    ).toHaveCount(0);
    await picker.getByPlaceholder("請輸入街道、地點或地標").fill(query);
    const searched = pax.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/passenger-app/geo/search" &&
        response.request().method() === "GET",
    );
    await picker.getByRole("button", { name: "搜尋", exact: true }).click();
    const response = await searched;
    expect(response.status()).toBe(200);
    const data = camel(await response.json()).data;
    expect(data.candidates.length).toBeGreaterThan(0);
    expect(data.provider).toBeTruthy();
    const point = data.candidates[0].location as Point;
    expect(point).toEqual({ lat: expect.any(Number), lng: expect.any(Number) });
    expect(Number.isFinite(point.lat) && Number.isFinite(point.lng)).toBe(true);
    const candidate = picker.getByRole("option").first();
    await expect(candidate).toContainText(data.candidates[0].displayName);
    await candidate.getByRole("button").click();
    await expect(
      picker.getByRole("button", { name: "清除選點", exact: true }),
    ).toBeVisible();
    return { point, provider: data.provider as string };
  }
  try {
    const outside = await step(
      "F original picker selects a real outside-area destination",
      async () => {
        const selected = await selectDestination("臺中市");
        expect(selected.point.lat).toBeLessThan(25);
        expect(selected.point.lat).toBeGreaterThan(23);
        expect(ridePOSTCount).toBe(0);
        return selected;
      },
    );
    const refusal = await step(
      "F actual service-area quote refuses without creating an order",
      async () => {
        const scheduledAt = await pax.evaluate(() => {
          const date = new Date(
            Math.ceil((Date.now() + 120_000) / 60_000) * 60_000,
          );
          const pad = (value: number) => String(value).padStart(2, "0");
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        });
        await pax.getByLabel("預約時間", { exact: true }).fill(scheduledAt);
        const requested = pax.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/passenger-app/quotes" &&
            response.request().method() === "POST",
        );
        await pax
          .getByRole("button", { name: "試算車資", exact: true })
          .click();
        const response = await requested;
        expect(response.status()).toBe(201);
        expect(response.request().postDataJSON()).toMatchObject({
          originLat: origin.latitude,
          originLng: origin.longitude,
          destinationLat: outside.point.lat,
          destinationLng: outside.point.lng,
        });
        const data = camel(await response.json()).data;
        expect(data.serviceAreaResult).toBe("not_serviceable");
        expect(data.serviceAreaEvaluation).toMatchObject({
          decision: "not_serviceable",
          reasonCodes: expect.arrayContaining([
            "SERVICE_AREA_COVERAGE_REQUIRED",
          ]),
          stops: expect.arrayContaining([
            expect.objectContaining({
              kind: "dropoff",
              location: outside.point,
              serviceAreaCodes: [],
            }),
          ]),
        });
        expect(data.fareSnapshotId ?? null).toBeNull();
        await expect(
          pax
            .getByRole("alert")
            .filter({ hasText: "您選擇的地點超出目前服務範圍" }),
        ).toBeVisible();
        await expect(pax.getByLabel("我已確認費用與優惠說明")).toHaveCount(0);
        await expect(
          pax.getByRole("button", { name: "確認叫車", exact: true }),
        ).toHaveCount(0);
        expect(ridePOSTCount).toBe(0);
        await info.attach("F-out-of-area-refused-pax", {
          contentType: "image/png",
          body: await pax.screenshot({ fullPage: true }),
        });
        return {
          actualQuoteHTTPStatus: response.status(),
          serviceAreaResult: data.serviceAreaResult as string,
          serviceAreaEvaluation: data.serviceAreaEvaluation,
          fareSnapshotId: null,
          actualRefusalShown: true,
          actualConfirmationAbsent: true,
          actualRidePOSTCountDuringRefusal: ridePOSTCount,
        };
      },
    );
    const restored = await step(
      "F original picker restores the serviceable destination",
      async () => {
        const selected = await selectDestination("台北車站");
        expect(selected.point.lat).toBeGreaterThan(25);
        expect(selected.point.lat).toBeLessThan(25.2);
        await expect(
          pax.getByLabel("演練選址方式", { exact: true }),
        ).toHaveValue("standard");
        await expect(
          pax.getByRole("button", { name: "試算車資", exact: true }),
        ).toBeEnabled();
        expect(ridePOSTCount).toBe(0);
        return selected;
      },
    );
    return {
      outsideDestination: outside.point,
      outsideSearchProvider: outside.provider,
      restoredDestination: restored.point,
      restoredSearchProvider: restored.provider,
      refusal,
      actualInternalNetworkMocks: false,
      actualClockAdvanced: false,
    };
  } finally {
    pax.off("request", observe);
  }
}
