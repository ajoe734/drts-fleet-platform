import { defineConfig } from "@playwright/test";
import base from "./playwright.pax-review-shared-order.config";

// Original Ops UI commands and real backend rejection/recovery; no API result overrides.
export default defineConfig({
  ...base,
  testMatch: /ops-review-recovery\.spec\.ts/,
  timeout: 5 * 60_000,
  use: { ...base.use, actionTimeout: 30_000, navigationTimeout: 30_000 },
  outputDir: ".artifacts/ops-review-recovery/results",
  reporter: [
    ["list"],
    ["json", { outputFile: ".artifacts/ops-review-recovery/report.json" }],
  ],
  // Passenger serves the production Driver export; no Metro or extra API is needed.
  webServer: Array.isArray(base.webServer)
    ? base.webServer.filter((_, index) => [0, 2, 4].includes(index))
    : (base.webServer ?? []),
});
