import { defineConfig } from "@playwright/test";

const localReferralEmbedBaseURL = "http://127.0.0.1:3114";
const localReferralAuthorityBaseURL = "http://127.0.0.1:3199";
const referralEmbedBaseURL =
  process.env.DRTS_DEV_REFERRAL_EMBED_BASE_URL ??
  process.env.REFERRAL_EMBED_BASE_URL ??
  localReferralEmbedBaseURL;
const shouldStartLocalReferralEmbed =
  referralEmbedBaseURL === localReferralEmbedBaseURL ||
  referralEmbedBaseURL === "http://localhost:3114";

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
        webServer: [
          {
            command: "node tests/e2e/fixtures/referral-embed-authority.mjs",
            url: `${localReferralAuthorityBaseURL}/health`,
            env: { REFERRAL_EMBED_FIXTURE_PORT: "3199" },
            reuseExistingServer: false,
            timeout: 30_000,
          },
          {
            command:
              "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/referral-embed-web exec next build --webpack && pnpm --filter @drts/referral-embed-web exec next start --hostname 0.0.0.0 --port 3114",
            url: localReferralEmbedBaseURL,
            env: {
              DRTS_API_URL: localReferralAuthorityBaseURL,
              REFERRAL_EMBED_ALLOWED_HOSTS:
                "127.0.0.1:3199 app.yuhe-living.com.tw app-stg.yuhe-living.com.tw",
              REFERRAL_EMBED_DEMO: "true",
              REFERRAL_EMBED_DEFAULT_ENTRY_SLUG: "yuhe-residence",
            },
            reuseExistingServer: false,
            timeout: 120_000,
          },
        ],
      }
    : {}),
  timeout: 45_000,
});
