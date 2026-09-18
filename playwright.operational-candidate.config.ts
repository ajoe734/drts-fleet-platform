import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /operational-candidate\.spec\.ts/,
  reporter: [["list"]],
  timeout: 60_000,
  use: { trace: "retain-on-failure" },
});
