import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-shared-order.config";

// Original90second matching and60second acceptance timers run in the actual API.
export default defineConfig({
  ...base,
  testMatch: /pax-real-dispatch-timeout\.spec\.ts/,
  timeout: 10 * 60_000,
  outputDir: ".artifacts/pax-real-dispatch-timeout/results",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: ".artifacts/pax-real-dispatch-timeout/report.json" },
    ],
  ],
  // Passenger serves the production Driver export; no Metro or extra API is needed.
  webServer: Array.isArray(base.webServer)
    ? base.webServer.filter((_, index) => [0, 2, 4].includes(index))
    : (base.webServer ?? []),
});
