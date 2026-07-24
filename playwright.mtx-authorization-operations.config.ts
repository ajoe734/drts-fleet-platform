import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /mtx-authorization-operations\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3203",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @drts/contracts build && CONTROLLED_DOWNLOAD_SIGNING_SECRET=local-e2e-controlled-download-secret pnpm --filter @drts/api dev",
      url: "http://127.0.0.1:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/ui-tokens build && cd apps/platform-admin-web && DRTS_API_URL=http://127.0.0.1:3001 pnpm exec next dev --hostname 127.0.0.1 --port 3203",
      url: "http://127.0.0.1:3203/multi-taxi-authorizations",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
