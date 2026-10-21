import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3319";

/** Executed by the existing GitHub UI job; product servers are not run on the development VM. */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /pax-functional-demo\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  outputDir: ".artifacts/passenger-demo-e2e",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: ".artifacts/passenger-demo-report", open: "never" },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "passenger-functional-demo",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command:
      "pnpm --filter @drts/passenger-app-web exec next start --hostname 127.0.0.1 --port 3319",
    url: `${baseURL}/demo`,
    env: { NODE_ENV: "production" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
