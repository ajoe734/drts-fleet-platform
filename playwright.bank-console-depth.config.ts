import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /bank-console-depth\.spec\.ts/,
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3008",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/bank-console-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3008",
    url: "http://127.0.0.1:3008/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
