import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-noncore-shared-order.config";

// Only the dedicated hosted airport job selects these two normal directions.
// Reuse the same API3001/PG, normal sessions and unmodified noncore servers.
export default defineConfig({
  ...base,
  testMatch: /pax-review-shared-order-airport\.spec\.ts/,
  outputDir: ".artifacts/pax-review-airport-shared-order/results",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: ".artifacts/pax-review-airport-shared-order/report.json" },
    ],
  ],
});
