import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm exec next build && mkdir -p .next/standalone/apps/enterprise-dispatch-web/.next && rm -rf .next/standalone/apps/enterprise-dispatch-web/.next/static && cp -R .next/static .next/standalone/apps/enterprise-dispatch-web/.next/static && HOSTNAME=127.0.0.1 PORT=3010 node .next/standalone/apps/enterprise-dispatch-web/server.js",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [
    {
      name: "desktop-web",
      use: {
        viewport: {
          width: 1366,
          height: 900,
        },
      },
    },
    {
      name: "mobile-web",
      use: {
        viewport: {
          width: 390,
          height: 844,
        },
      },
    },
  ],
});
