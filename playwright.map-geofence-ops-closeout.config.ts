import { defineConfig } from "@playwright/test";

const localOpsConsoleBaseURL = "http://127.0.0.1:3006";
const opsConsoleBaseURL =
  process.env.DRTS_DEV_OPS_CONSOLE_BASE_URL ??
  process.env.OPS_CONSOLE_BASE_URL ??
  localOpsConsoleBaseURL;
const shouldStartLocalOpsConsole =
  opsConsoleBaseURL === localOpsConsoleBaseURL ||
  opsConsoleBaseURL === "http://localhost:3006";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /map-geofence-ops-closeout\.spec\.ts/,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: opsConsoleBaseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 950 },
  },
  ...(shouldStartLocalOpsConsole
    ? {
        webServer: {
          command:
            "pnpm --filter @drts/contracts build && pnpm --filter @drts/ui-tokens build && MAP_GEOFENCE_OPS_UI_PORT=3006 MAP_GEOFENCE_OPS_MOCK_API_PORT=3106 node tools/ci/run-map-geofence-ops-ui-dev.mjs",
          url: localOpsConsoleBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }
    : {}),
  timeout: 180_000,
});
