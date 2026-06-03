import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "ops-assistant-on",
      use: {
        baseURL: "http://127.0.0.1:3202",
      },
    },
    {
      name: "ops-assistant-off",
      use: {
        baseURL: "http://127.0.0.1:3202",
      },
    },
  ],
  webServer: {
    command:
      "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/ops-console-web && NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true pnpm exec next dev --hostname 127.0.0.1 --port 3202",
    url: "http://127.0.0.1:3202",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
