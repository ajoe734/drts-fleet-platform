import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /dev-runtime-matrix\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: process.env.CI ? 4 : 8,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
  timeout: 30_000,
});
