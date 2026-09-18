import { defineConfig } from "@playwright/test";

// This config deliberately does not start local applications.  The release
// gate is evidence about one deployed candidate, never an accidentally mixed
// set of local development servers.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /operational-browser-acceptance\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/operational-browser/report.json" }],
  ],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 960 },
  },
});
