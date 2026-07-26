import { defineConfig } from "@playwright/test";

const localPartnerBookingBaseURL = "http://localhost:3007";
const partnerBookingBaseURL =
  process.env.DRTS_DEV_PARTNER_BOOKING_BASE_URL ??
  process.env.PARTNER_BOOKING_BASE_URL ??
  localPartnerBookingBaseURL;
const shouldStartLocalPartnerBooking =
  partnerBookingBaseURL === localPartnerBookingBaseURL ||
  partnerBookingBaseURL === "http://127.0.0.1:3007";
const skipLocalPartnerBookingWebServer =
  process.env.PARTNER_BOOKING_SKIP_WEBSERVER === "1";

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
  ...(shouldStartLocalPartnerBooking && !skipLocalPartnerBookingWebServer
    ? {
        webServer: [
          {
            command: "node tests/e2e/mock-map-booking-authority-server.mjs",
            url: "http://127.0.0.1:3001/api/partner/entries/ctbc",
            reuseExistingServer: !process.env.CI,
            timeout: 30_000,
          },
          {
            command:
              "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && cd apps/partner-booking-web && DRTS_API_URL=http://127.0.0.1:3001 pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3007",
            url: localPartnerBookingBaseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
          },
        ],
      }
    : {}),
  timeout: 30_000,
});
