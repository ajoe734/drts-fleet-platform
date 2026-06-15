import { defineConfig } from "@playwright/test";

const localEnterpriseDispatchBaseURL = "http://127.0.0.1:3010";
const enterpriseDispatchBaseURL =
  process.env.DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL ??
  process.env.ENTERPRISE_DISPATCH_BASE_URL ??
  localEnterpriseDispatchBaseURL;
const shouldStartLocalEnterpriseDispatch =
  enterpriseDispatchBaseURL === localEnterpriseDispatchBaseURL ||
  enterpriseDispatchBaseURL === "http://localhost:3010";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /enterprise-dispatch-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: enterpriseDispatchBaseURL,
    trace: "retain-on-failure",
  },
  // Only spin up a local dev server when targeting localhost; against a deployed
  // dev URL (DRTS_DEV_ENTERPRISE_DISPATCH_BASE_URL) the webServer is skipped so the
  // post-deploy smoke runs purely against the deployment.
  ...(shouldStartLocalEnterpriseDispatch
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && pnpm --filter @drts/ui-web build && pnpm --filter @drts/enterprise-dispatch-web dev",
          url: localEnterpriseDispatchBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 45_000,
});
