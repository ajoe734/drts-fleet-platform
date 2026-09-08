import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const baseURL = process.env.ENTERPRISE_FORM_TEST_URL;

// Opt in against an isolated local server; these checks never submit a booking.
describe.skipIf(!baseURL)("enterprise review browser regression", () => {
  let browser: Browser;
  let page: Page;
  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  });
  afterAll(async () => {
    await browser?.close();
  });

  function reviewURL(start: number, passengerMode = "other") {
    const local = new Date(start + 8 * 3600000).toISOString();
    const params = new URLSearchParams({
      passengerMode,
      passenger: "Renamed Visitor",
      bookedBy: "Booker Name",
      pickup: "Airport",
      dropoff: "Hotel",
      reservationDate: local.slice(0, 10),
      reservationTime: local.slice(11, 16),
      onsiteContactPhone: "0912000000",
      costCenterCode: "CC-PRD-07",
      costCenterLabel: "Product",
    });
    return `${baseURL}/bookings/review?${params}`;
  }

  it("removes submit at expiry and retains the renamed passenger and contact", async () => {
    const expiresAt = Math.floor(Date.now() / 60000) * 60000 + 180000;
    await page.clock.install({ time: new Date() });
    await page.goto(reviewURL(expiresAt));
    await page.getByTestId("enterprise-booking-submit").waitFor();
    expect(
      await page.getByText("Renamed Visitor", { exact: true }).count(),
    ).toBe(2);
    expect(await page.getByText("0912000000", { exact: true }).count()).toBe(1);
    await page.clock.fastForward(expiresAt - Date.now() + 1000);
    await page.getByTestId("enterprise-booking-expired").waitFor();
    expect(await page.getByTestId("enterprise-booking-submit").count()).toBe(0);
  }, 60000);

  it("blocks a past review and uses the booker for both self passenger and placard", async () => {
    await page.goto(reviewURL(Date.now() - 3600000, "self"));
    await page.getByTestId("enterprise-booking-blocked").waitFor();
    expect(await page.getByTestId("enterprise-booking-submit").count()).toBe(0);
    expect(await page.getByText("Booker Name", { exact: true }).count()).toBe(
      2,
    );
  }, 60000);

  it("fits the new and review documents within 390px", async () => {
    for (const url of [
      `${baseURL}/bookings/new`,
      reviewURL(Date.now() + 3600000),
    ]) {
      await page.goto(url);
      const widths = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(
        widths.document,
        `${url}: ${JSON.stringify(widths)}`,
      ).toBeLessThanOrEqual(widths.viewport);
    }
  }, 60000);
});
