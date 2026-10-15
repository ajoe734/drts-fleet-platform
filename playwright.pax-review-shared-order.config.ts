import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";

const simulation = JSON.parse(
  readFileSync(
    new URL(
      "./apps/api/src/modules/passenger-app/review-demo/simulation-profile.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  otp: Record<string, string>;
  payment: Record<
    string,
    string | { activeKeyId: string; keys: Record<string, string> }
  >;
};
const simulationPayment = Object.fromEntries(
  Object.entries(simulation.payment).map(([name, value]) => [
    name,
    typeof value === "string" ? value : JSON.stringify(value),
  ]),
);

// Runtime and browser services belong solely to the existing hosted lane.
if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error("Shared-order browser acceptance is GitHub-hosted only.");
const apiOrigin = "http://127.0.0.1:3001";
const sharedDev = process.env.PAX_REVIEW_SHARED_DEV_SMOKE === "true";
const apiEnvironment = {
  ...process.env,
  API_PORT: "3001",
  AUTH_MODE: "test",
  DRTS_ENV: "test",
  JWT_SECRET: "ci-e2e-secret",
  JWT_ISSUER: "drts-local",
  JWT_AUDIENCE: "drts-api",
  DRTS_DEV_MFA_WAIVED: "true",
  PAX_REVIEW_DEMO_ENABLED: "true",
  ...simulation.otp,
  ...simulationPayment,
  PSP_PROVIDER: "fake",
  PAX_PAYMENT_CAPTURE_ENABLED: "true",
  PAX_PAYMENT_CAPTURE_POLICY: JSON.stringify({
    retryDelaysMs: [60_000],
    retryDefinitiveDeclines: false,
    unknownReadbackDelaysMs: [1000, 3000],
  }),
  MULTI_TAXI_DEFAULT_AUTHORIZATION_ID: "bc39e4f3-72d8-4383-bdc1-2426c1330dfa",
  REQUIRE_SMS_VERIFICATION: "false",
  SCHEDULED_BOOKING_MIN_LEAD_TIME_MINUTES: "1",
  PAX_REVIEW_OPS_URL: "http://127.0.0.1:3202/review",
  MAP_PROVIDER_MODE: "mock",
  MAP_PROVIDER_BACKEND: "mock",
  MAP_PROVIDER_NAME: "mock",
  CONTROLLED_DOWNLOAD_SIGNING_SECRET: "ci-e2e-controlled-download-secret",
  DOCUMENT_ARTIFACT_STORAGE_PROVIDER: "memory",
  REPORTING_SNAPSHOT_SCHEDULER_ENABLED: "false",
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /pax-review-shared-order-demo\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 720_000,
  expect: { timeout: 30_000 },
  outputDir: ".artifacts/pax-review-shared-order/results",
  reporter: [
    ["list"],
    ["json", { outputFile: ".artifacts/pax-review-shared-order/report.json" }],
  ],
  // Screenshots and a whitelisted relational journal are the evidence. Generic
  // traces/videos would record live OTP/driver registration credentials.
  use: {
    browserName: "chromium",
    viewport: { width: 1440, height: 1000 },
    timezoneId: "Asia/Taipei",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  webServer: sharedDev
    ? []
    : [
        {
          command: "pnpm --filter @drts/api start",
          env: apiEnvironment,
          url: `${apiOrigin}/health`,
          reuseExistingServer: false,
          timeout: 180_000,
        },
        {
          command: "pnpm --filter @drts/api start",
          env: { ...apiEnvironment, API_PORT: "3002" },
          url: "http://127.0.0.1:3002/health",
          reuseExistingServer: false,
          timeout: 180_000,
        },
        {
          command:
            "pnpm --filter @drts/ops-console-web exec next dev --webpack --hostname 127.0.0.1 --port 3202",
          env: {
            ...apiEnvironment,
            DRTS_API_URL: apiOrigin,
            NEXT_PUBLIC_API_URL: "/control-plane-proxy",
          },
          url: "http://127.0.0.1:3202/review",
          reuseExistingServer: false,
          timeout: 180_000,
        },
        {
          command:
            "pnpm --filter @drts/passenger-app-web exec next start --hostname 127.0.0.1 --port 3319",
          env: {
            ...process.env,
            PAX_REVIEW_DEMO_ENABLED: "true",
            DRTS_API_URL: apiOrigin,
          },
          url: "http://127.0.0.1:3319/review",
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command:
            "node tests/e2e/system-remediation/sr-driver-web-001/driver-web-static-server.mjs",
          url: "http://127.0.0.1:3101/onboarding",
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ],
});
