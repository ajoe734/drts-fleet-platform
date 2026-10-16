import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-shared-order.config";

// A separate report preserves the original 48-stage journey and its budget.
export default defineConfig({
  ...base,
  testMatch: /pax-review-additional-branches\.spec\.ts/,
  outputDir: ".artifacts/pax-review-additional-branches/results",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: ".artifacts/pax-review-additional-branches/report.json" },
    ],
  ],
});
