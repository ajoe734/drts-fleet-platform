import { defineConfig } from "@playwright/test";

const localPlatformAdminBaseURL = "http://127.0.0.1:3002";
const platformAdminBaseURL =
  process.env.DRTS_DEV_PLATFORM_ADMIN_BASE_URL ??
  process.env.PLATFORM_ADMIN_BASE_URL ??
  localPlatformAdminBaseURL;
const shouldStartLocalPlatformAdmin =
  platformAdminBaseURL === localPlatformAdminBaseURL ||
  platformAdminBaseURL === "http://localhost:3002";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /platform-admin-service-area-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: platformAdminBaseURL,
    trace: "retain-on-failure",
  },
  // Only spin up a local dev server when targeting localhost; against a deployed
  // dev URL (DRTS_DEV_PLATFORM_ADMIN_BASE_URL) the webServer is skipped so the
  // post-deploy smoke runs purely against the deployment.
  ...(shouldStartLocalPlatformAdmin
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/ui-web build && pnpm --filter @drts/platform-admin-web dev",
          url: localPlatformAdminBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 45_000,
});
