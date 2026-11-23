import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// This suite belongs to the existing GitHub-hosted bureau job. It reads the
// normal completed trip left by that job's Passenger/Driver journey, through
// the original Agency BFF/API and the same disposable PostgreSQL database.
// Only Google authorization/code exchange and SMTP delivery are explicit SIM.
// Do not run the browser/runtime suite on the development VM (AGENTS.md).
const apiOrigin = "http://127.0.0.1:3141";
const passwordJourney =
  process.env.DRTS_FOUR_PORTAL_PASSWORD_JOURNEY === "true";
const tenantOrigin = "http://localhost:3213";
const enterpriseOrigin = "http://localhost:3214";
const fleetOrigin = "http://localhost:3215";
const diagnostics = resolve(
  process.env.RUNNER_TEMP || ".test-runtime",
  "four-portal-password",
);
const jwtSecret = "ci-e2e-secret";
const agencyOrigin = "http://localhost:3212";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: passwordJourney
    ? /four-portal-password-journey\.spec\.ts$/
    : /agency-portal-business\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  outputDir: passwordJourney
    ? resolve(diagnostics, "results")
    : ".artifacts/agency-portal-business/results",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: passwordJourney
          ? resolve(diagnostics, "report.json")
          : ".artifacts/agency-portal-business/report.json",
      },
    ],
  ],
  use: {
    browserName: "chromium",
    baseURL: agencyOrigin,
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Taipei",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: [
    {
      command: "pnpm --filter @drts/api start",
      url: `${apiOrigin}/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        API_PORT: "3141",
        API_HOST: "127.0.0.1",
        AUTH_MODE: "test",
        DRTS_ENV: "test",
        JWT_SECRET: jwtSecret,
        JWT_ISSUER: "drts-local",
        JWT_AUDIENCE: "drts-api",
        DRTS_DEV_MFA_WAIVED: "true",
        AUTH_ALLOWED_ORIGINS: passwordJourney
          ? [agencyOrigin, tenantOrigin, enterpriseOrigin, fleetOrigin].join(
              ",",
            )
          : agencyOrigin,
        OIDC_ENABLED: "true",
        OIDC_MOCK_MODE: "true",
        OIDC_ISSUER: "https://accounts.google.com",
        OIDC_CLIENT_ID: "agency-business-hosted-sim",
        OIDC_AUTHORIZATION_ENDPOINT:
          "https://accounts.google.com/o/oauth2/v2/auth",
        AGENCY_INVITATION_ACCEPT_URL_BASE: `${agencyOrigin}/invite`,
        ...(passwordJourney
          ? {
              DRTS_CANDIDATE_SHA:
                process.env.CANDIDATE_SHA ||
                process.env.DRTS_CANDIDATE_SHA ||
                process.env.GITHUB_SHA ||
                "local-worktree",
              TENANT_INVITATION_ACCEPT_URL_BASE: tenantOrigin + "/invite",
              FLEET_INVITATION_ACCEPT_URL_BASE: fleetOrigin + "/invite",
              PASSWORD_RESET_URL_BASE: tenantOrigin + "/reset-password",
              PASSWORD_PEPPER_SECRETS_JSON: JSON.stringify({
                v1: "ci-e2e-four-portal-password-pepper-secret-v1",
              }),
              PASSWORD_PEPPER_CURRENT_VERSION: "v1",
              TOTP_ENCRYPTION_KEYS_JSON: JSON.stringify({
                activeKeyId: "v1",
                keys: { v1: Buffer.alloc(32, 0x42).toString("base64") },
              }),
            }
          : {}),
        MAILPIT_SMTP_PORT: "2526",
        NOTIFICATION_OUTBOX_DIRECTORY: passwordJourney
          ? resolve(diagnostics, "mail-outbox")
          : resolve(__dirname, ".artifacts/agency-portal-business/mail-outbox"),
        MAP_PROVIDER_MODE: "mock",
        MAP_PROVIDER_BACKEND: "mock",
        MAP_PROVIDER_NAME: "mock",
        PSP_PROVIDER: "fake",
        CONTROLLED_DOWNLOAD_SIGNING_SECRET: "ci-e2e-controlled-download-secret",
        DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "memory",
        REPORTING_SNAPSHOT_SCHEDULER_ENABLED: "false",
      },
    },
    {
      command:
        "pnpm --filter @drts/agency-portal-web exec next dev --webpack --hostname 127.0.0.1 --port 3212",
      url: `${agencyOrigin}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...process.env,
        NODE_ENV: "development",
        DRTS_ENV: "test",
        DRTS_API_URL: apiOrigin,
        NEXT_PUBLIC_API_URL: "/api/agency",
        BFF_STATE_SECRET: "agency-business-hosted-sim-state-secret",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
    ...(passwordJourney
      ? [
          {
            name: "@drts/tenant-console-web",
            origin: tenantOrigin,
            env: {},
          },
          {
            name: "@drts/enterprise-dispatch-web",
            origin: enterpriseOrigin,
            env: {
              JWT_SECRET: jwtSecret,
              JWT_ISSUER: "drts-local",
              JWT_AUDIENCE: "drts-api",
            },
          },
          {
            name: "@drts/fleet-partner-portal-web",
            origin: fleetOrigin,
            env: {
              DRTS_FLEET_PARTNER_ID: "fleet-demo-001",
              DRTS_FLEET_PORTAL_AUTH_REQUIRED: "true",
            },
          },
        ].map(({ name, origin, env }) => ({
          command: `pnpm --filter ${name} exec next dev --webpack --hostname 127.0.0.1 --port ${new URL(origin).port}`,
          url: origin + "/login",
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            ...process.env,
            ...env,
            NODE_ENV: "development",
            DRTS_ENV: "test",
            DRTS_API_URL: apiOrigin,
            NEXT_PUBLIC_API_URL: "/control-plane-proxy",
            NEXT_TELEMETRY_DISABLED: "1",
          },
        }))
      : []),
  ],
});
