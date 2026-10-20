import { defineConfig } from "@playwright/test";

// Explicit shared-runtime opt-in; this config cannot start a local application.
export default defineConfig({
  testDir: "./tests/e2e/owned-referral-business-journey",
  testMatch: "owned-business.spec.ts",
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  // The JSON reporter captures worker stdout, including add-mask commands.
  // Keep credentials in the masked console; only explicit safe files upload.
  reporter: [["line"]],
  outputDir: ".artifacts/owned-referral-business-journey/test-output",
  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
});
