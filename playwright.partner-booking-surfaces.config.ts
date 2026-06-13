import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /partner-booking-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PARTNER_BOOKING_BASE_URL ?? "http://localhost:3007",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @drts/partner-booking-web dev",
    url: "http://localhost:3007",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  timeout: 30_000,
});
