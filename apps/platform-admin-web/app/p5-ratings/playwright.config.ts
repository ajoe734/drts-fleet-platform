import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

export default defineConfig({
  testDir: resolve(import.meta.dirname, "e2e"),
  outputDir: resolve(import.meta.dirname, "evidence/test-artifacts"),
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3002",
    viewport: {
      width: 1440,
      height: 960,
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @drts/platform-admin-web dev",
    url: "http://127.0.0.1:3002",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
