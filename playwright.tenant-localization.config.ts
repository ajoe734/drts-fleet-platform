import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/tenant-localization",
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
      name: "tenant-console-localization",
      use: {
        baseURL: "http://127.0.0.1:3304",
      },
    },
    {
      name: "tenant-portal-localization",
      use: {
        baseURL: "http://127.0.0.1:3300",
      },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/tenant-console-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3304",
      url: "http://127.0.0.1:3304",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/tenant-portal-web && pnpm exec next dev --hostname 127.0.0.1 --port 3300",
      url: "http://127.0.0.1:3300",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
