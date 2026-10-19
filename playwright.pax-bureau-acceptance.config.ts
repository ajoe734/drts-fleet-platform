import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-shared-order.config";

// OTP/consent-gate branches only exercise the Passenger entry against the
// original API; Ops and Driver are not involved there. The on_trip
// cancellation-rejection branch (UC05) added alongside them does need a real
// Ops dispatch/assignment and a real Driver trip through to on_trip, so this
// config also boots Ops (index 2) and the standalone Driver Web static
// server (index 5) from the same base array ui-shared-order-e2e already
// uses; Platform Admin (index 3) and the second API instance (index 1) are
// not needed by either branch. Keep the resend case's real sixty-second
// cooldown inside the default test timeout; the real five-minute code-expiry
// case calls test.setTimeout() itself to extend past this default rather
// than stretching every other test's budget.
export default defineConfig({
  ...base,
  testMatch: [
    /pax-bureau-acceptance\.spec\.ts$/,
    /pax-bureau-acceptance\/on-trip-cancellation\.spec\.ts$/,
  ],
  timeout: 5 * 60_000,
  outputDir: ".artifacts/pax-bureau-acceptance/results",
  reporter: [
    ["list"],
    ["json", { outputFile: ".artifacts/pax-bureau-acceptance/report.json" }],
  ],
  webServer: Array.isArray(base.webServer)
    ? base.webServer.filter((_, index) => [0, 2, 4, 5].includes(index))
    : (base.webServer ?? []),
});
