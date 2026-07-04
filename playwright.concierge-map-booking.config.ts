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
  ...(shouldStartLocalConcierge
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/concierge-portal-web && pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3006",
          url: localConciergeBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 30_000,
});
