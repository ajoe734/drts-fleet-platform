import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ops-console-parity\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    viewport: {
      width: 1440,
      height: 950,
    },
    trace: "retain-on-failure",
  },
  timeout: 180_000,
});
