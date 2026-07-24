import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3412";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /p5-records-operations\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/ui-web build && pnpm --filter @drts/platform-admin-web exec next dev --webpack --hostname 127.0.0.1 --port 3412",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  timeout: 45_000,
});
