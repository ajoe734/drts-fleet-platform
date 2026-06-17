import { defineConfig } from "@playwright/test";

const localChannelPartnerPortalBaseURL = "http://127.0.0.1:3013";
const channelPartnerPortalBaseURL =
  process.env.DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL ??
  process.env.CHANNEL_PARTNER_PORTAL_BASE_URL ??
  localChannelPartnerPortalBaseURL;
const shouldStartLocalChannelPartnerPortal =
  channelPartnerPortalBaseURL === localChannelPartnerPortalBaseURL ||
  channelPartnerPortalBaseURL === "http://localhost:3013";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /channel-partner-portal-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: channelPartnerPortalBaseURL,
    trace: "retain-on-failure",
  },
  // Only spin up a local dev server when targeting localhost; against a deployed
  // dev URL (DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL) the webServer is skipped so
  // the post-deploy smoke runs purely against the deployment.
  ...(shouldStartLocalChannelPartnerPortal
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/ui-web build && pnpm --filter @drts/channel-partner-portal-web dev",
          url: localChannelPartnerPortalBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 45_000,
});
