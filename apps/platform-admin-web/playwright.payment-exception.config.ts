import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3212";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /payment-exception\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "zh-TW",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @drts/contracts build && " +
      "pnpm --filter @drts/ui-tokens build && " +
      "pnpm --filter @drts/ui-web build && " +
      "pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3212",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
  timeout: 45_000,
});
