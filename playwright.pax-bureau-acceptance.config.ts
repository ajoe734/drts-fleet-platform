import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-shared-order.config";

// OTP/consent-gate branches only exercise the Passenger entry against the
// original API; Ops, Platform Admin and Driver are not involved. Keep the
// resend case's real sixty-second cooldown inside the default test timeout;
// the real five-minute code-expiry case calls test.setTimeout() itself to
// extend past this default rather than stretching every other test's budget.
export default defineConfig({
  ...base,
  testMatch: /pax-bureau-acceptance\.spec\.ts/,
  timeout: 5 * 60_000,
  outputDir: ".artifacts/pax-bureau-acceptance/results",
  reporter: [
    ["list"],
    ["json", { outputFile: ".artifacts/pax-bureau-acceptance/report.json" }],
  ],
  webServer: Array.isArray(base.webServer)
    ? base.webServer.filter((_, index) => [0, 4].includes(index))
    : (base.webServer ?? []),
});
