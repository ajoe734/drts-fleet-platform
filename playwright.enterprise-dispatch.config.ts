import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /enterprise-dispatch-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL:
      process.env.ENTERPRISE_DISPATCH_BASE_URL ?? "http://127.0.0.1:3010",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/ui-web build && pnpm --filter @drts/enterprise-dispatch-web dev",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  timeout: 45_000,
});
