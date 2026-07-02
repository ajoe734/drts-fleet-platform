import { defineConfig } from "@playwright/test";

const localConciergePortalBaseURL = "http://localhost:3006";
const conciergePortalBaseURL =
  process.env.DRTS_DEV_CONCIERGE_PORTAL_BASE_URL ??
  process.env.CONCIERGE_PORTAL_BASE_URL ??
  localConciergePortalBaseURL;
const shouldStartLocalConciergePortal =
  conciergePortalBaseURL === localConciergePortalBaseURL ||
  conciergePortalBaseURL === "http://localhost:3006";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /concierge-(portal-auth-boundary|map-booking-ui)\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: conciergePortalBaseURL,
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalConciergePortal
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/concierge-portal-web dev",
          url: localConciergePortalBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 45_000,
});
