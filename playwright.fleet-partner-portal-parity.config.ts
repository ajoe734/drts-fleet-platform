import { defineConfig } from "@playwright/test";

const fleetPartnerPortalBaseUrl =
  process.env.FLEET_PARTNER_PORTAL_BASE_URL ??
  process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL ??
  "https://drts-dev-fleet-partner-portal-web-waji3fer3a-uc.a.run.app";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /fleet-partner-portal-parity\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "fleet-partner-portal",
      use: {
        baseURL: fleetPartnerPortalBaseUrl,
        viewport: {
          width: 1440,
          height: 950,
        },
        trace: "retain-on-failure",
      },
    },
  ],
  timeout: 180_000,
});
