import { defineConfig } from "@playwright/test";

const localFleetPartnerPortalBaseURL = "http://127.0.0.1:3307";
const fleetPartnerPortalBaseURL =
  process.env.DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL ??
  process.env.FLEET_PARTNER_PORTAL_BASE_URL ??
  localFleetPartnerPortalBaseURL;
const shouldStartLocalFleetPartnerPortal =
  fleetPartnerPortalBaseURL === localFleetPartnerPortalBaseURL ||
  fleetPartnerPortalBaseURL === "http://localhost:3307";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /fleet-partner-portal-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "fleet-partner-portal",
      use: {
        baseURL: fleetPartnerPortalBaseURL,
      },
    },
  ],
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  ...(shouldStartLocalFleetPartnerPortal
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/ui-tokens build && cd apps/fleet-partner-portal-web && pnpm exec next dev --hostname 127.0.0.1 --port 3307",
          url: localFleetPartnerPortalBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 300_000,
        },
      }
    : {}),
  timeout: 180_000,
});
