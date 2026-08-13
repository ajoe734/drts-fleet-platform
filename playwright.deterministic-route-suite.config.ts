import { defineConfig } from "@playwright/test";

const apiPort = process.env.ROUTE_SUITE_API_PORT ?? "3001";
if (!/^\d+$/.test(apiPort)) {
  throw new Error(`ROUTE_SUITE_API_PORT must be numeric; received ${apiPort}`);
}
const apiOrigin = `http://127.0.0.1:${apiPort}`;
// The config starts this API process itself, so its test-only auth contract
// belongs here rather than in a particular CI job's inherited environment.
const apiTestEnvironment = [
  `API_PORT=${apiPort}`,
  "AUTH_MODE=test",
  "JWT_SECRET=ci-e2e-secret",
  "JWT_ISSUER=drts-local",
  "JWT_AUDIENCE=drts-api",
  "CONTROLLED_DOWNLOAD_SIGNING_SECRET=ci-e2e-controlled-download-secret",
  "PARTNER_INGRESS_KEY_BANK_DEMO_ALPHA_AIRPORT=ci-e2e-alpha-ingress-key",
  "PARTNER_INGRESS_KEY_BANK_DEMO_BETA_AIRPORT=ci-e2e-beta-ingress-key",
  "REPORTING_SNAPSHOT_SCHEDULER_ENABLED=false",
].join(" ");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /deterministic-route-suite\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "ops-console-routes",
      grep: /ops console/,
      use: {
        baseURL: "http://127.0.0.1:3202",
      },
    },
    {
      name: "platform-admin-routes",
      grep: /platform admin/,
      use: {
        baseURL: "http://127.0.0.1:3103",
      },
    },
  ],
  webServer: [
    {
      command: `${apiTestEnvironment} pnpm --filter @drts/api start`,
      url: `${apiOrigin}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `cd apps/ops-console-web && DRTS_API_URL=${apiOrigin} NEXT_PUBLIC_API_URL=/control-plane-proxy NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3202`,
      url: "http://127.0.0.1:3202",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
    {
      command: `cd apps/platform-admin-web && DRTS_API_URL=${apiOrigin} NEXT_PUBLIC_API_URL=/control-plane-proxy NEXT_PUBLIC_PLATFORM_ADMIN_ASSISTANT_ENABLED=false pnpm exec next dev --webpack --hostname 127.0.0.1 --port 3103`,
      url: "http://127.0.0.1:3103",
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
