import { defineConfig } from "@playwright/test";

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.GLOBAL_UX_HOSTED !== "authorized-shared-dev"
) {
  throw new Error(
    "Live global UX browser execution is restricted to the authorized GitHub hosted workflow",
  );
}
export default defineConfig({
  testDir: "./tests/e2e/system-remediation/sr-live-global-ux-20261007",
  testMatch: "**/*.spec.ts",
  outputDir: ".artifacts/live-global-ux/playwright",
  workers: 2,
  fullyParallel: true,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["dot"]],
  use: {
    browserName: "chromium",
    trace: "off",
    video: "off",
    screenshot: "off",
    serviceWorkers: "block",
    acceptDownloads: false,
  },
  // Intentionally no webServer. This config never starts a product or preview.
});
