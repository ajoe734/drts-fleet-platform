import { defineConfig } from "@playwright/test";

// The existing Tenant UAT starts the actual API and this Next app.
// This config supplies no alternate/mock authority or product webServer.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "partner-program-business.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "test-results/c032-partner-program-business-report.json" },
    ],
  ],
  metadata: { candidate_sha: process.env.CANDIDATE_SHA },
  use: {
    baseURL: "http://127.0.0.1:3007",
    locale: "en-US",
    timezoneId: "Asia/Taipei",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  timeout: 30_000,
});
