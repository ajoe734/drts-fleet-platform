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
  projects: [
    {
      name: "healthy",
      use: {
        baseURL: conciergeBaseURL,
        trace: "retain-on-failure",
      },
    },
    {
      name: "outage",
      use: {
        baseURL: "http://127.0.0.1:3007",
        trace: "retain-on-failure",
      },
    },
  ],
  ...(shouldStartLocalConcierge
    ? {
        webServer: [
          process.env.START_OUTAGE_SERVER === "1"
            ? {
                command:
                  "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && NEXT_PUBLIC_ADDRESS_PICKER_PROVIDER_MODE=unavailable pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3007",
                url: "http://127.0.0.1:3007",
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
              }
            : {
                command:
                  "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3006",
                url: localConciergeBaseURL,
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
              },
        ],
      }
    : {}),
  timeout: 30_000,
});
