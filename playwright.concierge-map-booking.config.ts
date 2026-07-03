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
            "cd apps/concierge-portal-web && NODE_PATH=/home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/@playwright+test@1.59.1/node_modules:/home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/playwright@1.59.1/node_modules:/home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/typescript@5.9.3/node_modules node /home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/next@16.2.3_@playwright+test@1.59.1_babel-plugin-react-compiler@1.0.0_react-dom@19.2.5_react@19.2.5__react@19.2.5/node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3006",
          url: localConciergeBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 30_000,
});
