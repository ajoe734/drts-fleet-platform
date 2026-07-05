import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /platform-admin-assistant-overlay\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "platform-admin-assistant-on",
      use: {
        baseURL: "http://127.0.0.1:33102",
      },
    },
    {
      name: "platform-admin-assistant-off",
      use: {
        baseURL: "http://127.0.0.1:33103",
      },
    },
  ],
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/platform-admin-web && DRTS_API_URL=https://drts-dev-api-ne55h7sy3a-uc.a.run.app NEXT_DIST_DIR=.next-platform-admin-on NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=true pnpm exec next dev --webpack --hostname 127.0.0.1 --port 33102",
      url: "http://127.0.0.1:33102",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/platform-admin-web && DRTS_API_URL=https://drts-dev-api-ne55h7sy3a-uc.a.run.app NEXT_DIST_DIR=.next-platform-admin-off NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=false pnpm exec next dev --webpack --hostname 127.0.0.1 --port 33103",
      url: "http://127.0.0.1:33103",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
  timeout: 180_000,
});
