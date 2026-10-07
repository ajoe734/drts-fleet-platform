import { defineConfig } from "@playwright/test";
import { createOpsConsoleAuthentication } from "./tests/e2e/system-remediation/sr-live-map-001/browser-auth";

// Gate before Playwright can launch Chromium or contact any deployed target.
const { opsOrigin: baseURL } = createOpsConsoleAuthentication(process.env);

export default defineConfig({
  testDir: "./tests/live",
  testMatch: /google-map-provider\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 150_000,
  outputDir: ".local/live-map-browser-results",
  reporter: [["line"]],
  use: {
    baseURL,
    viewport: { width: 1440, height: 960 },
    // Traces capture Maps keys and API/session traffic. Upload only explicit
    // redacted evidence and screenshots of the map itself.
    trace: "off",
    screenshot: "off",
    video: "off",
    serviceWorkers: "block",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
