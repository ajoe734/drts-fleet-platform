import { defineConfig } from "@playwright/test";

const localPartnerBookingBaseURL = "http://localhost:3007";
const partnerBookingBaseURL =
  process.env.DRTS_DEV_PARTNER_BOOKING_BASE_URL ??
  process.env.PARTNER_BOOKING_BASE_URL ??
  localPartnerBookingBaseURL;
const shouldStartLocalPartnerBooking =
  partnerBookingBaseURL === localPartnerBookingBaseURL ||
  partnerBookingBaseURL === "http://127.0.0.1:3007";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /partner-(booking-surfaces|map-booking-ui)\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: partnerBookingBaseURL,
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalPartnerBooking
    ? {
        webServer: [
          {
            command:
              "node tests/e2e/mock-map-booking-authority-server.mjs",
            url: "http://127.0.0.1:3001/api/partner/entries/ctbc",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
          {
            command:
              "cd apps/partner-booking-web && NODE_PATH=/home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/@playwright+test@1.59.1/node_modules:/home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/playwright@1.59.1/node_modules:/home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/typescript@5.9.3/node_modules node /home/edna/workspace/drts-fleet-platform/node_modules/.pnpm/next@16.2.3_@playwright+test@1.59.1_babel-plugin-react-compiler@1.0.0_react-dom@19.2.5_react@19.2.5__react@19.2.5/node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3007",
            url: localPartnerBookingBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }
    : {}),
  timeout: 30_000,
});
