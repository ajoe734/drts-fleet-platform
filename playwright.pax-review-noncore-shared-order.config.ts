import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
import base from "./playwright.pax-review-shared-order.config";

// Only the existing isolated ui-shared-order-e2e job uses this extension.
// The shared-dev/deploy config and its other five consumers remain unchanged.
if (process.env.PAX_REVIEW_SHARED_DEV_SMOKE === "true")
  throw new Error(
    "Normal noncore acceptance requires the isolated hosted lane",
  );
const servers = Array.isArray(base.webServer)
  ? base.webServer
  : [base.webServer!];
export default defineConfig({
  ...base,
  // Run both original whole journeys, plus the independent normal travel case.
  testMatch: [
    /pax-review-shared-order-demo\.spec\.ts/,
    /pax-review-shared-order-travel\.spec\.ts/,
  ],
  webServer: [
    ...servers,
    {
      command:
        "pnpm --filter @drts/partner-booking-web exec next start --hostname 127.0.0.1 --port 3007",
      env: {
        ...process.env,
        DRTS_API_URL: "http://127.0.0.1:3001",
        DRTS_API_AUTH_AUDIENCE: process.env.WORKLOAD_IDENTITY_GOOGLE_AUDIENCE!,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${resolve(__dirname, "tests/e2e/helpers/noncore-partner-metadata-transport.cjs")}`,
      },
      url: "http://127.0.0.1:3007",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command:
        "pnpm --filter @drts/tenant-console-web exec next start --hostname localhost --port 3004",
      env: {
        ...process.env,
        DRTS_API_URL: "http://127.0.0.1:3001",
        NEXT_PUBLIC_API_URL: "/control-plane-proxy",
      },
      url: "http://localhost:3004/healthz",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
