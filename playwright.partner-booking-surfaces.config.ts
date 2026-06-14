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
  testMatch: /partner-booking-surfaces\.spec\.ts/,
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
        webServer: {
          command: "pnpm --filter @drts/partner-booking-web dev",
          url: localPartnerBookingBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 30_000,
});
