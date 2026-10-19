import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-shared-order.config";

// The original journeys keep their existing budget. This case waits for the
// backend's unchanged fifteen-minute expiry using real browser/server clocks.
export default defineConfig({
  ...base,
  testMatch: /pax-real-quote-expiry\.spec\.ts/,
  timeout: 22 * 60_000,
  outputDir: ".artifacts/pax-real-quote-expiry/results",
  reporter: [
    ["list"],
    ["json", { outputFile: ".artifacts/pax-real-quote-expiry/report.json" }],
  ],
  // This pre-dispatch booking case needs the original API, Ops and Passenger.
  webServer: Array.isArray(base.webServer)
    ? base.webServer.filter((_, index) => [0, 2, 4].includes(index))
    : (base.webServer ?? []),
});
