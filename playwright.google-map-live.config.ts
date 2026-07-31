import { defineConfig } from "@playwright/test";

const baseURL = process.env.LIVE_GOOGLE_MAP_BASE_URL?.trim();
if (!baseURL) {
  throw new Error("LIVE_GOOGLE_MAP_BASE_URL is required for live map E2E.");
}

export default defineConfig({
  testDir: "./tests/live",
  testMatch: /google-map-provider\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
