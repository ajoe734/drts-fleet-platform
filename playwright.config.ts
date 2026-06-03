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
    {
      name: "platform-admin-assistant-on",
      use: {
        baseURL: "http://127.0.0.1:3102",
      },
    },
    {
      name: "platform-admin-assistant-off",
      use: {
        baseURL: "http://127.0.0.1:3103",
      },
    },
  ],
  webServer: [
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/ops-console-web && NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true pnpm exec next dev --hostname 127.0.0.1 --port 3202",
      url: "http://127.0.0.1:3202",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && NEXT_DIST_DIR=.next-assistant-on NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=true pnpm --filter @drts/platform-admin-web build && mkdir -p apps/platform-admin-web/.next-assistant-on/standalone/apps/platform-admin-web/.next-assistant-on && rm -rf apps/platform-admin-web/.next-assistant-on/standalone/apps/platform-admin-web/.next-assistant-on/static && cp -R apps/platform-admin-web/.next-assistant-on/static apps/platform-admin-web/.next-assistant-on/standalone/apps/platform-admin-web/.next-assistant-on/static && cd apps/platform-admin-web && HOSTNAME=127.0.0.1 PORT=3102 node .next-assistant-on/standalone/apps/platform-admin-web/server.js",
      url: "http://127.0.0.1:3102",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command:
        "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && NEXT_DIST_DIR=.next-assistant-off NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=false pnpm --filter @drts/platform-admin-web build && mkdir -p apps/platform-admin-web/.next-assistant-off/standalone/apps/platform-admin-web/.next-assistant-off && rm -rf apps/platform-admin-web/.next-assistant-off/standalone/apps/platform-admin-web/.next-assistant-off/static && cp -R apps/platform-admin-web/.next-assistant-off/static apps/platform-admin-web/.next-assistant-off/standalone/apps/platform-admin-web/.next-assistant-off/static && cd apps/platform-admin-web && HOSTNAME=127.0.0.1 PORT=3103 node .next-assistant-off/standalone/apps/platform-admin-web/server.js",
      url: "http://127.0.0.1:3103",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
