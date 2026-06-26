import { defineConfig } from "@playwright/test";

const localReferralEmbedBaseURL = "http://localhost:3014";
const referralEmbedBaseURL =
  process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
  process.env.REFERRAL_EMBED_BASE_URL ??
  localReferralEmbedBaseURL;
const shouldStartLocalReferralEmbed =
  referralEmbedBaseURL === localReferralEmbedBaseURL ||
  referralEmbedBaseURL === "http://127.0.0.1:3014";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /referral-embed-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: referralEmbedBaseURL,
    trace: "retain-on-failure",
  },
  // Only spin up a local dev server when targeting localhost; against a deployed
  // dev URL (DRTS_DEV_REFERRAL_EMBED_BASE_URL) the webServer is skipped so the
  // post-deploy smoke runs purely against the deployment.
  ...(shouldStartLocalReferralEmbed
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && REFERRAL_EMBED_ALLOWED_HOSTS=community.example.test REFERRAL_EMBED_DEMO=true pnpm --filter @drts/referral-embed-web dev",
          url: localReferralEmbedBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 45_000,
});
