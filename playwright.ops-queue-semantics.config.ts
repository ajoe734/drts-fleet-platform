import { defineConfig } from "@playwright/test";

const localOpsConsoleBaseURL = "http://127.0.0.1:3202";
const opsConsoleBaseURL =
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  process.env.OPS_CONSOLE_BASE_URL ??
  localOpsConsoleBaseURL;

const parsedUrl = new URL(opsConsoleBaseURL);
const targetPort = parsedUrl.port || "3202";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ops-queue-semantics\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: opsConsoleBaseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `MAP_GEOFENCE_OPS_UI_PORT=${targetPort} node scripts/run-map-geofence-ops-ui-dev.mjs`,
    url: opsConsoleBaseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  timeout: 180_000,
});
