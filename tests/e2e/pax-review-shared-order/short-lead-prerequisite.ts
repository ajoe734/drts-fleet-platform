import { expect, type Page, type TestInfo } from "@playwright/test";

/** A future minute below the real minimum, never a past-time substitute. */
export async function verifyFutureShortLeadRefusal(
  page: Page,
  info?: TestInfo,
) {
  const refusal = page.getByText("預約時間不符合最短前置時間規定", {
    exact: true,
  });
  const [settingsResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/passenger-app/settings" &&
        response.request().method() === "GET",
    ),
    page
      .getByRole("button", { name: "重新載入費用與設定", exact: true })
      .click(),
  ]);
  expect(settingsResponse.status()).toBe(200);
  const data = (await settingsResponse.json()).data;
  const minimum = data.min_lead_time_minutes ?? data.minLeadTimeMinutes;
  expect(typeof minimum).toBe("number");
  expect(Number.isFinite(minimum)).toBe(true);
  // This review uses an existing positive, whole-minute booking policy.
  // A zero minimum would have no future-but-too-short interval to demonstrate.
  expect(minimum).toBeGreaterThanOrEqual(1);
  await expect(refusal).toHaveCount(0);
  await expect(page.getByLabel("示範上車地點", { exact: true })).toHaveValue(
    "review-banqiao",
  );
  await expect(page.getByLabel("示範下車地點", { exact: true })).toHaveValue(
    "review-city-hall",
  );

  let candidate:
    | { localTime: string; scheduledAt: string; scheduledAtMs: number }
    | undefined;
  const waitStartedAt = Date.now();
  let realBoundaryWaitMs = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sample = await page.evaluate(() => {
      const now = Date.now();
      const target = Math.floor(now / 60_000) * 60_000 + 60_000;
      const date = new Date(target);
      const pad = (value: number) => String(value).padStart(2, "0");
      return {
        remainingMs: target - now,
        scheduledAtMs: target,
        scheduledAt: date.toISOString(),
        localTime: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
      };
    });
    if (sample.remainingMs <= 30_000) {
      // Real time only: keep enough of the next minute for the account read,
      // validation and screenshot. No clock, deadline or policy is changed.
      const waitingAt = Date.now();
      await page.waitForTimeout(sample.remainingMs + 250);
      realBoundaryWaitMs += Date.now() - waitingAt;
      continue;
    }
    if (sample.remainingMs >= minimum * 60_000) {
      const waitingAt = Date.now();
      await page.waitForTimeout(250);
      realBoundaryWaitMs += Date.now() - waitingAt;
      continue;
    }
    candidate = sample;
    break;
  }
  expect(
    candidate,
    "a representable future minute inside the actual lead",
  ).toBeDefined();
  if (!candidate) throw new Error("future_short_lead_window_not_observed");

  let quotePOSTs = 0;
  let ridePOSTs = 0;
  const observe = (request: import("@playwright/test").Request) => {
    if (request.method() !== "POST") return;
    const path = new URL(request.url()).pathname;
    if (path === "/api/passenger-app/quotes") quotePOSTs++;
    if (path === "/api/passenger-app/rides") ridePOSTs++;
  };
  page.on("request", observe);
  try {
    await page
      .getByLabel("預約時間", { exact: true })
      .fill(candidate.localTime);
    const beforeClickMs = await page.evaluate(() => Date.now());
    expect(candidate.scheduledAtMs).toBeGreaterThan(beforeClickMs);
    expect(candidate.scheduledAtMs - beforeClickMs).toBeLessThan(
      minimum * 60_000,
    );
    await page.getByRole("button", { name: "試算車資", exact: true }).click();
    await expect(refusal).toBeVisible();
    await expect(
      page.getByRole("button", { name: "試算車資", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("checkbox", { name: "我已確認費用與優惠說明" }),
    ).toHaveCount(0);
    expect(quotePOSTs).toBe(0);
    expect(ridePOSTs).toBe(0);
    const afterRefusalMs = await page.evaluate(() => Date.now());
    expect(candidate.scheduledAtMs).toBeGreaterThan(afterRefusalMs);
    await expect(page.getByLabel("預約時間", { exact: true })).toHaveValue(
      candidate.localTime,
    );
    if (info) {
      await info.attach("D-future-short-lead-refused-pax", {
        contentType: "image/png",
        body: await page.screenshot({ fullPage: true }),
      });
      const afterScreenshotMs = await page.evaluate(() => Date.now());
      expect(candidate.scheduledAtMs).toBeGreaterThan(afterScreenshotMs);
      await info.attach("D-future-short-lead-facts", {
        contentType: "application/json",
        body: JSON.stringify({
          orderId: null,
          stage: "before D booking creation",
          actualSettingsHTTPStatus: settingsResponse.status(),
          actualMinimumLeadTimeMinutes: minimum,
          actualLocalTime: candidate.localTime,
          actualScheduledAt: candidate.scheduledAt,
          actualBeforeClickMs: beforeClickMs,
          actualAfterRefusalMs: afterRefusalMs,
          actualAfterScreenshotMs: afterScreenshotMs,
          actualRealBoundaryWaitMs: realBoundaryWaitMs,
          actualElapsedSinceWindowSelectionMs: Date.now() - waitStartedAt,
          actualFutureAtClickRefusalAndScreenshot: true,
          actualBrowserQuotePOSTCount: quotePOSTs,
          actualBrowserRidePOSTCount: ridePOSTs,
          actualPriorPastTimeMessageClearedByOriginalSettingsRefresh: true,
          actualClockAdvanced: false,
          actualBookingPolicyChanged: false,
          actualInternalNetworkMocks: false,
          scope:
            "original booking form and actual current settings before any D order exists",
        }),
      });
    }
  } finally {
    page.off("request", observe);
  }
}
