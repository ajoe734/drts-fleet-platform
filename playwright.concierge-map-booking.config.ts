import { defineConfig } from "@playwright/test";

const localConciergeBaseURL = "http://localhost:3006";
const conciergeBaseURL =
  process.env.DRTS_DEV_CONCIERGE_BASE_URL ??
  process.env.CONCIERGE_BASE_URL ??
  localConciergeBaseURL;
const shouldStartLocalConcierge =
  conciergeBaseURL === localConciergeBaseURL ||
  conciergeBaseURL === "http://127.0.0.1:3006";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /concierge-map-booking-ui\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: conciergeBaseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "healthy",
      use: {
        baseURL: shouldStartLocalConcierge ? "http://127.0.0.1:3006" : conciergeBaseURL,
      },
    },
    {
      name: "outage",
      use: {
        baseURL: shouldStartLocalConcierge ? "http://127.0.0.1:3007" : (process.env.DRTS_DEV_CONCIERGE_OUTAGE_BASE_URL ?? conciergeBaseURL),
      },
    },
  ],
  ...(shouldStartLocalConcierge
    ? {
        webServer: [
          {
            command:
              "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && AUTH_MODE=test pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3006",
            url: "http://127.0.0.1:3006",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
          {
            command:
              "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && AUTH_MODE=test NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE=unavailable NEXT_PRIVATE_DIST_DIR=.next-outage pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3007",
            url: "http://127.0.0.1:3007",
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }
    : {}),
  timeout: 30_000,
});
